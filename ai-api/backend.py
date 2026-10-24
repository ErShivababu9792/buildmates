"""
BuildMates server features that need trusted access (Phase 11).

Uses the Firebase Admin SDK (service account), so it can do things the app itself is not allowed to:
  POST /parent/send      → email the parent of an under-18 user a link to approve the account
  GET  /parent/review    → page the parent opens from the email (shows Approve / Decline)
  POST /parent/decision  → records the parent's choice in users/{uid}
  POST /id/upload        → student uploads a college ID photo (stored privately on Cloudinary)
  POST /id/view          → admin sees the ID photo (sent as data, never as a public link)
  POST /id/decide        → admin approves (Verified badge) or rejects; the photo is deleted either way
  POST /push/notify      → sends a phone notification to the other person (after checking it is genuine)

Everything is optional: if a setting is missing, that feature says "not set up" and the rest keeps working.
"""
import base64
import hashlib
import hmac
import html
import json
import os
import smtplib
import ssl
import time
from collections import defaultdict
from email.message import EmailMessage

import requests as http
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

HERE = os.path.dirname(os.path.abspath(__file__))
APP_NAME = "BuildMates"
APP_URL = os.getenv("APP_URL", "http://localhost:5173").rstrip("/")

# ---------------------------------------------------------------- Firebase Admin
_admin = {"app": None, "error": ""}


def admin_app():
    """Starts the Admin SDK once from FIREBASE_SERVICE_ACCOUNT (path to the JSON key file, or the JSON itself)."""
    if _admin["app"] is not None:
        return _admin["app"]
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not raw:
        _admin["error"] = "FIREBASE_SERVICE_ACCOUNT is not set"
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials
        if raw.startswith("{"):
            info = json.loads(raw)
        else:
            path = raw if os.path.isabs(raw) else os.path.join(HERE, raw)
            with open(path, encoding="utf-8") as f:
                info = json.load(f)
        _admin["info"] = info
        _admin["app"] = firebase_admin.initialize_app(credentials.Certificate(info), name="buildmates")
        _admin["error"] = ""
    except Exception as e:  # wrong path, broken JSON …
        _admin["error"] = f"Service account could not be loaded: {type(e).__name__}"
        return None
    return _admin["app"]


def fs():
    app = admin_app()
    if app is None:
        raise HTTPException(status_code=503, detail="Server is not connected to Firebase yet (service account missing).")
    from firebase_admin import firestore
    return firestore.client(app)


def server_time():
    from firebase_admin import firestore
    return firestore.SERVER_TIMESTAMP


def doc_data(ref) -> dict | None:
    snap = ref.get()
    return snap.to_dict() if snap.exists else None


def require_admin(db, uid: str):
    if not db.collection("admins").document(uid).get().exists:
        raise HTTPException(status_code=403, detail="Admins only")


def audit(db, uid: str, action: str):
    me = doc_data(db.collection("profiles").document(uid)) or {}
    db.collection("adminLog").add({"by": uid, "byName": me.get("name", "Admin"), "action": action, "at": server_time()})


def secret() -> bytes:
    """Key for signing parent links. APP_SECRET if set, otherwise derived from the service account's private key."""
    s = os.getenv("APP_SECRET", "")
    if not s:
        admin_app()
        s = (_admin.get("info") or {}).get("private_key", "")
    if not s:
        raise HTTPException(status_code=503, detail="Server secret missing")
    return hashlib.sha256(("bm-parent-v1" + s).encode()).digest()


# ---------------------------------------------------------------- signed parent links
def make_token(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(hmac.new(secret(), body.encode(), hashlib.sha256).digest()[:24]).decode().rstrip("=")
    return f"{body}.{sig}"


def read_token(token: str) -> dict | None:
    try:
        body, sig = token.split(".", 1)
        good = base64.urlsafe_b64encode(hmac.new(secret(), body.encode(), hashlib.sha256).digest()[:24]).decode().rstrip("=")
        if not hmac.compare_digest(good, sig):
            return None
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        return data if data.get("exp", 0) > time.time() else None
    except Exception:
        return None


def email_hash(e: str) -> str:
    return hashlib.sha256(e.strip().lower().encode()).hexdigest()[:16]


def mask(e: str) -> str:
    name, _, dom = e.partition("@")
    return (name[:2] + "•" * max(1, len(name) - 2)) + "@" + dom


# ---------------------------------------------------------------- email
def mail_ready() -> bool:
    return bool(os.getenv("BREVO_API_KEY") and os.getenv("MAIL_FROM")) or bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASS"))


def send_email(to: str, subject: str, html_body: str, text_body: str):
    """Brevo HTTP API if BREVO_API_KEY is set (works on hosted servers), otherwise SMTP, e.g. Gmail with an App Password."""
    sender = os.getenv("MAIL_FROM") or os.getenv("SMTP_USER", "")
    sender_name = os.getenv("MAIL_FROM_NAME", APP_NAME)
    if os.getenv("BREVO_API_KEY"):
        r = http.post("https://api.brevo.com/v3/smtp/email", timeout=12, headers={
            "api-key": os.getenv("BREVO_API_KEY"), "accept": "application/json", "content-type": "application/json",
        }, json={"sender": {"email": sender, "name": sender_name}, "to": [{"email": to}],
                 "subject": subject, "htmlContent": html_body, "textContent": text_body})
        if r.status_code >= 300:
            raise HTTPException(status_code=502, detail="Email service refused the message. Check BREVO_API_KEY and MAIL_FROM.")
        return
    user, pw = os.getenv("SMTP_USER", ""), os.getenv("SMTP_PASS", "").replace(" ", "")
    if not (user and pw):
        raise HTTPException(status_code=503, detail="Email is not set up on the server yet.")
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, f"{sender_name} <{sender}>", to
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    host, port = os.getenv("SMTP_HOST", "smtp.gmail.com"), int(os.getenv("SMTP_PORT", "465"))
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=15) as s:
                s.login(user, pw)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(user, pw)
                s.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=502, detail="Email login failed. Use a Gmail App Password, not your normal password.")
    except (smtplib.SMTPException, OSError):
        raise HTTPException(status_code=502, detail="Could not send the email right now. Try again in a minute.")


SAFE_MODE_POINTS = [
    "Matches only with other students under 18. Adults can never see the profile.",
    "No in-person meetings can be planned in the app.",
    "No profile photo, initials only.",
    "Chats are checked by an AI safety guard. Phone numbers and social media IDs are blocked in the first 7 days.",
    "Anyone can be reported or blocked in one tap. Reports are reviewed by the college project team.",
]


def page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{html.escape(title)} · {APP_NAME}</title>
<style>
:root{{--p:#0E6B57;--ink:#14211D;--muted:#55625E;--line:#DCE3E0;--bg:#F5F7F6}}
*{{box-sizing:border-box}}body{{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}}
main{{max-width:520px;margin:0 auto;padding:28px 16px 48px}}.card{{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px}}
h1{{font-size:22px;margin:0 0 6px}}.brand{{font-weight:800;color:var(--p);margin-bottom:18px}}.muted{{color:var(--muted)}}ul{{padding-left:20px}}li{{margin:4px 0}}
.btn{{display:block;width:100%;min-height:48px;border-radius:12px;border:0;font:600 16px system-ui;cursor:pointer;margin-top:10px}}
.ok{{background:var(--p);color:#fff}}.no{{background:#fff;color:#A3321F;border:1px solid #E7C3BB}}label{{display:flex;gap:10px;align-items:flex-start;margin:16px 0 4px}}
input[type=checkbox]{{width:20px;height:20px;margin-top:2px;flex:none}}
</style></head><body><main><div class="brand">{APP_NAME}</div><div class="card">{body}</div></main></body></html>""")


# ---------------------------------------------------------------- Cloudinary (private ID photos)
def cloud():
    url = os.getenv("CLOUDINARY_URL", "")
    if not url.startswith("cloudinary://"):
        raise HTTPException(status_code=503, detail="ID upload is not set up on the server yet (CLOUDINARY_URL).")
    import cloudinary
    cloudinary.config(cloudinary_url=url, secure=True)
    return cloudinary


def id_ready() -> bool:
    return os.getenv("CLOUDINARY_URL", "").startswith("cloudinary://")


def looks_like_image(b: bytes) -> str | None:
    if b[:3] == b"\xff\xd8\xff":
        return "jpg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "webp"
    return None


# ---------------------------------------------------------------- schemas
class UidIn(BaseModel):
    uid: str = Field(..., min_length=10, max_length=128)


class DecideIn(UidIn):
    approve: bool
    reason: str = Field("", max_length=200)


class PushIn(BaseModel):
    kind: str = Field(..., pattern="^(message|request|invite|meet)$")
    target: str = Field(..., min_length=10, max_length=128)
    ref: str = Field("", max_length=200)


# ---------------------------------------------------------------- routes
def make_router(signed_in) -> APIRouter:
    """signed_in = the dependency from main.py that verifies the Firebase login and rate-limits."""
    r = APIRouter()

    # ---------- parent approval ----------
    @r.post("/parent/send")
    def parent_send(request: Request, uid: str = Depends(signed_in)):
        db = fs()
        ref = db.collection("users").document(uid)
        acc = doc_data(ref)
        if not acc or not acc.get("minor"):
            raise HTTPException(status_code=400, detail="Only under-18 accounts need a parent's approval.")
        if acc.get("parentConsent"):
            return {"sent": False, "already": True}
        to = (acc.get("parentEmail") or "").strip().lower()
        if "@" not in to:
            raise HTTPException(status_code=400, detail="No parent email on this account.")
        now = time.time()
        last = acc.get("parentMailAt")
        last_s = last.timestamp() if hasattr(last, "timestamp") else 0
        day = time.strftime("%Y-%m-%d")
        count = acc.get("parentMailCount", 0) if acc.get("parentMailDay") == day else 0
        if now - last_s < 120:
            raise HTTPException(status_code=429, detail="Email already sent. Please wait 2 minutes before sending again.")
        if count >= 5:
            raise HTTPException(status_code=429, detail="Too many emails today. Please try again tomorrow.")

        prof = doc_data(db.collection("profiles").document(uid)) or {}
        child = prof.get("name") or "Your child"
        college = prof.get("college") or ""
        token = make_token({"u": uid, "e": email_hash(to), "exp": int(now + 7 * 86400)})
        base = os.getenv("PUBLIC_SERVER_URL", "").rstrip("/") or str(request.base_url).rstrip("/")
        link = f"{base}/parent/review?t={token}"
        points = "".join(f"<li>{html.escape(p)}</li>" for p in SAFE_MODE_POINTS)
        html_body = f"""<div style="font:15px/1.6 Arial,sans-serif;color:#14211D;max-width:520px">
<p style="font-weight:800;color:#0E6B57;font-size:18px">{APP_NAME}</p>
<p>Hello,</p>
<p><b>{html.escape(child)}</b>{(' from ' + html.escape(college)) if college else ''} has signed up on {APP_NAME}, a platform where students find teammates for projects and start-up ideas. Because they are under 18, the account stays locked until a parent or guardian approves it.</p>
<p><b>Safe Mode for under-18 accounts:</b></p><ul>{points}</ul>
<p><a href="{link}" style="display:inline-block;background:#0E6B57;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Review and decide</a></p>
<p style="color:#55625E;font-size:13px">This link works for 7 days. If you don't know about this sign-up, ignore this email and the account stays locked.</p></div>"""
        text_body = (f"{child} has signed up on {APP_NAME}. They are under 18, so the account stays locked until a parent approves it.\n\n"
                     + "\n".join("- " + p for p in SAFE_MODE_POINTS) + f"\n\nReview and decide: {link}\n\nThe link works for 7 days. If you don't know about this, ignore this email.")
        send_email(to, f"Please approve {child}'s {APP_NAME} account", html_body, text_body)
        ref.update({"parentMailAt": server_time(), "parentMailDay": day, "parentMailCount": count + 1})
        return {"sent": True, "to": mask(to)}

    def check_parent_token(t: str):
        data = read_token(t or "")
        if not data:
            return None, None, "This link has expired or is not valid. Ask your child to send a new email from the app."
        db = fs()
        acc = doc_data(db.collection("users").document(data["u"]))
        if not acc or email_hash(acc.get("parentEmail", "")) != data.get("e"):
            return None, None, "This account no longer exists or the parent email was changed."
        return db, data["u"], acc

    @r.get("/parent/review", response_class=HTMLResponse)
    def parent_review(t: str = ""):
        db, uid, acc = check_parent_token(t)
        if db is None:
            return page("Link not valid", f"<h1>Link not valid</h1><p class='muted'>{html.escape(acc)}</p>")
        prof = doc_data(db.collection("profiles").document(uid)) or {}
        child = html.escape(prof.get("name") or "Your child")
        if acc.get("parentConsent"):
            return page("Already approved", f"<h1>Already approved</h1><p class='muted'>{child}'s account is active. Thank you!</p>")
        points = "".join(f"<li>{html.escape(p)}</li>" for p in SAFE_MODE_POINTS)
        # A button (POST), not a plain link, so email scanners that open links can't approve by accident
        return page("Approve account", f"""<h1>Approve {child}'s account?</h1>
<p class="muted">{child}{(' · ' + html.escape(prof.get('college', ''))) if prof.get('college') else ''}</p>
<p><b>What Safe Mode means:</b></p><ul>{points}</ul>
<form method="post" action="/parent/decision"><input type="hidden" name="t" value="{html.escape(t)}">
<label><input type="checkbox" name="confirm" value="yes" required> I am this student's parent or guardian.</label>
<button class="btn ok" name="action" value="approve">Approve account</button>
<button class="btn no" name="action" value="decline" formnovalidate>Don't approve</button></form>
<p class="muted" style="font-size:13px;margin-top:16px">You can ask for the account to be deleted at any time by replying to the email.</p>""")

    @r.post("/parent/decision", response_class=HTMLResponse)
    def parent_decision(t: str = Form(""), action: str = Form(""), confirm: str = Form("")):
        db, uid, acc = check_parent_token(t)
        if db is None:
            return page("Link not valid", f"<h1>Link not valid</h1><p class='muted'>{html.escape(acc)}</p>")
        ref = db.collection("users").document(uid)
        if action == "approve":
            if confirm != "yes":
                return page("Please confirm", "<h1>Please confirm</h1><p class='muted'>Go back and tick “I am this student's parent or guardian”.</p>")
            ref.update({"parentConsent": True, "parentConsentAt": server_time(), "parentConsentBy": "parent-email", "parentDeclined": False})
            return page("Approved", f"<h1>Thank you!</h1><p>The account is now active in Safe Mode. Your child can open {APP_NAME} and continue.</p>")
        if action == "decline":
            ref.update({"parentDeclined": True, "parentDeclinedAt": server_time()})
            return page("Not approved", "<h1>Account stays locked</h1><p class='muted'>Nobody can see your child's profile. Thank you for letting us know.</p>")
        return page("Choose an option", "<h1>Choose an option</h1><p class='muted'>Go back and press Approve or Don't approve.</p>")

    # ---------- college ID verification ----------
    @r.post("/id/upload")
    async def id_upload(file: UploadFile = File(...), uid: str = Depends(signed_in)):
        cloud()
        db = fs()
        prof = doc_data(db.collection("profiles").document(uid))
        if not prof:
            raise HTTPException(status_code=400, detail="Create your profile first.")
        if prof.get("verified"):
            return {"status": "approved"}
        data = await file.read(6 * 1024 * 1024 + 1)
        if len(data) > 6 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image is too large. Please use one under 6 MB.")
        fmt = looks_like_image(data)
        if not fmt:
            raise HTTPException(status_code=400, detail="Please upload a JPG, PNG or WebP photo of your ID card.")
        ref = db.collection("idRequests").document(uid)
        old = doc_data(ref)
        import cloudinary.uploader
        res = cloudinary.uploader.upload(data, type="authenticated", resource_type="image", folder="buildmates/ids",
                                         public_id=f"{uid}_{int(time.time())}", overwrite=True)
        if old and old.get("publicId"):
            try:
                cloudinary.uploader.destroy(old["publicId"], type="authenticated", invalidate=True)
            except Exception:
                pass
        ref.set({"uid": uid, "name": prof.get("name", ""), "college": prof.get("college", ""), "minor": bool(prof.get("minor")),
                 "status": "pending", "publicId": res["public_id"], "format": res.get("format", fmt), "reason": "", "at": server_time()})
        return {"status": "pending"}

    @r.post("/id/view")
    def id_view(body: UidIn, uid: str = Depends(signed_in)):
        db = fs()
        require_admin(db, uid)
        req = doc_data(db.collection("idRequests").document(body.uid))
        if not req or not req.get("publicId"):
            raise HTTPException(status_code=404, detail="No ID photo for this student.")
        cloud()
        import cloudinary.utils
        url = cloudinary.utils.private_download_url(req["publicId"], req.get("format", "jpg"), type="authenticated",
                                            resource_type="image", expires_at=int(time.time()) + 120)
        img = http.get(url, timeout=15)
        if img.status_code != 200:
            raise HTTPException(status_code=502, detail="Could not load the ID photo.")
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(req.get("format", "jpg"), "image/jpeg")
        return {"dataUrl": f"data:{mime};base64,{base64.b64encode(img.content).decode()}"}

    @r.post("/id/decide")
    def id_decide(body: DecideIn, uid: str = Depends(signed_in)):
        db = fs()
        require_admin(db, uid)
        ref = db.collection("idRequests").document(body.uid)
        req = doc_data(ref)
        if not req:
            raise HTTPException(status_code=404, detail="Request not found.")
        if body.approve:
            db.collection("profiles").document(body.uid).update({"verified": True})
        if req.get("publicId"):  # the photo is never kept after the decision
            cloud()
            import cloudinary.uploader
            try:
                cloudinary.uploader.destroy(req["publicId"], type="authenticated", invalidate=True)
            except Exception:
                pass
        ref.update({"status": "approved" if body.approve else "rejected", "reason": body.reason.strip()[:200],
                    "publicId": "", "decidedAt": server_time(), "decidedBy": uid})
        audit(db, uid, f"{'Verified' if body.approve else 'Rejected ID of'} {req.get('name', 'a student')}" + ("" if body.approve else f" ({body.reason.strip()[:80] or 'no reason'})"))
        return {"ok": True}

    # ---------- push notifications ----------
    last_push: dict[str, float] = defaultdict(float)

    @r.post("/push/notify")
    def push_notify(body: PushIn, uid: str = Depends(signed_in)):
        if body.target == uid:
            return {"sent": 0}
        db = fs()
        target = body.target
        if db.collection("blocks").document(f"{target}_{uid}").get().exists or db.collection("blocks").document(f"{uid}_{target}").get().exists:
            return {"sent": 0}
        me = doc_data(db.collection("profiles").document(uid)) or {}
        name = (me.get("name") or "Someone").split(" ")[0]

        # Only send if the action really happened (nobody can use this to spam strangers)
        if body.kind == "message":
            chat = doc_data(db.collection("chats").document(body.ref)) or {}
            ok = uid in chat.get("members", []) and target in chat.get("members", []) and chat.get("lastFrom") == uid
            title, text, url = f"New message from {name}", "Open BuildMates to read it.", f"/chats/{body.ref}"
        elif body.kind == "request":
            req = doc_data(db.collection("requests").document(f"{uid}_{target}")) or {}
            ok = req.get("from") == uid and req.get("status") == "pending"
            title, text, url = f"{name} wants to connect", "See their profile and accept if it fits.", "/chats"
        elif body.kind == "invite":
            inv = doc_data(db.collection("teamInvites").document(f"{body.ref}_{target}")) or {}
            ok = inv.get("from") == uid
            title, text, url = f"{name} invited you to a team", inv.get("teamName", "Open BuildMates to answer."), "/teams"
        else:
            meet = doc_data(db.collection("meets").document(body.ref)) or {}
            ok = meet.get("proposer") == uid and target in meet.get("members", [])
            title, text, url = f"{name} proposed a Safe Meet", meet.get("place", "Open BuildMates to answer."), f"/chats/{meet.get('chatId', '')}"
        if not ok:
            raise HTTPException(status_code=403, detail="Nothing to notify.")

        key = f"{uid}>{target}>{body.kind}"
        if time.time() - last_push[key] < (30 if body.kind == "message" else 5):
            return {"sent": 0, "throttled": True}
        last_push[key] = time.time()

        tok_ref = db.collection("pushTokens").document(target)
        tokens = (doc_data(tok_ref) or {}).get("tokens", [])
        if not tokens:
            return {"sent": 0}
        from firebase_admin import messaging
        msg = messaging.MulticastMessage(
            tokens=tokens[:10],
            data={"title": title[:80], "body": text[:120], "url": url, "tag": f"{body.kind}-{body.ref or uid}"},
            webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": "86400"}),
        )
        res = messaging.send_each_for_multicast(msg, app=admin_app())
        dead = [tokens[i] for i, rr in enumerate(res.responses)
                if not rr.success and type(rr.exception).__name__ in ("UnregisteredError", "SenderIdMismatchError", "InvalidArgumentError")]
        if dead:
            from firebase_admin import firestore
            tok_ref.update({"tokens": firestore.ArrayRemove(dead)})
        return {"sent": res.success_count}

    return r


def status() -> dict:
    """For /health and the admin page."""
    ready = admin_app() is not None
    return {
        "admin_ready": ready,
        "admin_error": "" if ready else _admin["error"],
        "mail_ready": mail_ready(),
        "id_ready": id_ready(),
        "push_ready": ready,
    }

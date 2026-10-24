"""
Phase 13 server features (use the Firebase Admin SDK from backend.py).

  POST /admin/stats        → admin only. Counts and a funnel for the report. Only numbers, never chats or messages.
  POST /digest/preview     → the weekly email the signed-in user would get (HTML), without sending it
  POST /digest/send        → admin only. Sends the weekly digest to everyone who turned it on
  GET  /digest/cron?key=…  → same as send, for a free scheduler (e.g. cron-job.org). Needs DIGEST_CRON_KEY
  GET  /digest/unsubscribe → one-click unsubscribe link from the email
"""
import html
import hmac
import os
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

import backend
from backend import APP_NAME, APP_URL, doc_data, fs, make_token, page, read_token, require_admin, send_email, server_time

DAY = 86400


def _ts(v) -> float:
    return v.timestamp() if hasattr(v, "timestamp") else 0.0


def _week(ts: float) -> str:
    d = datetime.fromtimestamp(ts, tz=timezone.utc)
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


# ---------------------------------------------------------------- stats
def build_stats(db) -> dict:
    now = time.time()
    profiles = [d.to_dict() | {"id": d.id} for d in db.collection("profiles").stream()]
    ids = {p["id"] for p in profiles}

    # Who is connected (in at least one 1:1 chat) – only the member ids are read, never messages
    in_chat = set()
    for c in db.collection("chats").select(["members"]).stream():
        in_chat.update(c.to_dict().get("members", []))
    requests = [r.to_dict() for r in db.collection("requests").select(["status", "createdAt"]).stream()]

    teams = [t.to_dict() for t in db.collection("teams").select(["members", "status", "createdAt"]).stream()]
    in_team, in_official = set(), set()
    for t in teams:
        in_team.update(t.get("members", []))
        if t.get("status") == "active":
            in_official.update(t.get("members", []))
    shows = [s.to_dict() for s in db.collection("showcase").select(["memberIds", "status"]).stream()]
    in_show = {m for s in shows if s.get("status") == "live" for m in s.get("memberIds", [])}

    def count(col):
        try:
            return db.collection(col).count().get()[0][0].value
        except Exception:
            return sum(1 for _ in db.collection(col).select([]).stream())

    has_vision = {p["id"] for p in profiles if (p.get("vision") or "").strip()}
    quiz = {p["id"] for p in profiles if isinstance(p.get("b5"), list)}
    funnel = [
        ["Signed up", len(ids)],
        ["Wrote a vision", len(has_vision)],
        ["Finished the quiz", len(quiz)],
        ["Connected with someone", len(in_chat & ids)],
        ["Joined a team", len(in_team & ids)],
        ["In an official team", len(in_official & ids)],
        ["Published a project", len(in_show & ids)],
    ]

    weeks = [_week(now - i * 7 * DAY) for i in range(11, -1, -1)]
    signups = Counter(_week(_ts(p.get("createdAt"))) for p in profiles if p.get("createdAt"))
    team_weeks = Counter(_week(_ts(t.get("createdAt"))) for t in teams if t.get("createdAt"))
    req_weeks = Counter(_week(_ts(r.get("createdAt"))) for r in requests if r.get("createdAt"))

    accepted = sum(1 for r in requests if r.get("status") == "accepted")
    active7 = sum(1 for p in profiles if _ts(p.get("updatedAt") or p.get("createdAt")) > now - 7 * DAY)
    return {
        "generatedAt": int(now),
        "totals": {
            "students": len(ids), "under18": sum(1 for p in profiles if p.get("minor")), "verified": sum(1 for p in profiles if p.get("verified")),
            "requests": len(requests), "acceptRate": round(100 * accepted / len(requests)) if requests else 0,
            "teams": len(teams), "officialTeams": sum(1 for t in teams if t.get("status") == "active"),
            "avgTeamSize": round(sum(len(t.get("members", [])) for t in teams) / len(teams), 1) if teams else 0,
            "ideas": count("ideas"), "products": count("products"), "showcases": sum(1 for s in shows if s.get("status") == "live"),
            "circles": count("circles"), "events": count("events"), "roles": count("roles"), "officeHours": count("officeHours"),
            "reports": count("reports"), "guardBlocks": count("guardEvents"), "updatedLast7Days": active7,
        },
        "funnel": funnel,
        "weekly": [{"week": w, "signups": signups.get(w, 0), "requests": req_weeks.get(w, 0), "teams": team_weeks.get(w, 0)} for w in weeks],
        "colleges": Counter(p.get("college") or "Unknown" for p in profiles).most_common(8),
    }


# ---------------------------------------------------------------- digest
def _esc(s) -> str:
    return html.escape(str(s or ""))


def digest_for(db, uid: str, cache: dict) -> dict | None:
    """What one person would see this week. None if there's nothing worth an email."""
    prof = doc_data(db.collection("profiles").document(uid))
    if not prof or (prof.get("status") or "active") != "active":
        return None
    minor = bool(prof.get("minor"))
    skills = set(prof.get("skills") or [])
    now = time.time()
    week_ago = now - 7 * DAY

    if "roles" not in cache:
        cache["roles"] = [r.to_dict() | {"id": r.id} for r in db.collection("roles").where("status", "==", "open").stream()]
        cache["events"] = [e.to_dict() | {"id": e.id} for e in db.collection("events").where("status", "==", "live").stream()]
        cache["circles"] = [c.to_dict() | {"id": c.id} for c in db.collection("circles").where("status", "==", "open").stream()]
        cache["hours"] = [h.to_dict() | {"id": h.id} for h in db.collection("officeHours").stream()]

    my_teams = [t.to_dict() | {"id": t.id} for t in db.collection("teams").where("members", "array_contains", uid).stream()]
    team_ids = {t["id"] for t in my_teams}
    roles = [r for r in cache["roles"] if r.get("minor") == minor and r.get("team") not in team_ids
             and r.get("skill") in skills and _ts(r.get("createdAt")) > week_ago][:5]
    events = [e for e in cache["events"] if (e.get("audience") == "all" or not minor)
              and now < _ts(e.get("startAt")) < now + 14 * DAY]
    events.sort(key=lambda e: _ts(e.get("startAt")))
    circles = [c for c in cache["circles"] if c.get("minor") == minor and uid not in c.get("members", [])
               and len(c.get("members", [])) < c.get("maxSize", 0)
               and (c.get("topic") in skills or c.get("college") == prof.get("college"))][:3]
    hours = [] if minor else [h for h in cache["hours"] if now < _ts(h.get("startAt")) < now + 14 * DAY
                              and len(h.get("attendees", [])) < h.get("capacity", 0)][:3]

    pending_apps = 0
    for t in my_teams:
        pending_apps += sum(1 for _ in db.collection("teams").document(t["id"]).collection("applications").where("status", "==", "pending").stream())

    if not (roles or events or circles or hours or pending_apps or my_teams):
        return None
    return {"name": (prof.get("name") or "there").split(" ")[0], "roles": roles, "events": events[:4], "circles": circles,
            "hours": hours, "teams": my_teams, "pendingApps": pending_apps}


def render_digest(d: dict, unsubscribe: str) -> tuple[str, str, str]:
    def section(title, rows):
        if not rows:
            return ""
        items = "".join(f'<li style="margin:6px 0">{r}</li>' for r in rows)
        return f'<h3 style="font-size:16px;margin:22px 0 6px">{title}</h3><ul style="padding-left:18px;margin:0">{items}</ul>'

    def link(path, text):
        return f'<a href="{APP_URL}{path}" style="color:#0E6B57;font-weight:700">{_esc(text)}</a>'

    def day(ts):
        return datetime.fromtimestamp(_ts(ts), tz=timezone(timedelta(hours=5, minutes=30))).strftime("%a %d %b, %I:%M %p")

    body = "".join([
        section("Your teams", [f"{link('/teams/' + t['id'], t.get('name'))} · {len(t.get('members', []))} people · don’t forget this week’s check-in" for t in d["teams"]]
                + ([f"<b>{d['pendingApps']}</b> new application(s) to your open roles" ] if d["pendingApps"] else [])),
        section("Teams looking for your skills", [f"{link('/roles', r.get('title'))} in team {_esc(r.get('teamName'))} · {_esc(r.get('hours'))}" for r in d["roles"]]),
        section("Coming up", [f"{link('/events/' + e['id'], e.get('title'))} · {day(e.get('startAt'))} · {_esc(e.get('kind'))}" for e in d["events"]]),
        section("Learning circles you can join", [f"{link('/circles/' + c['id'], c.get('title'))} · {_esc(c.get('schedule'))}" for c in d["circles"]]),
        section("Mentor office hours", [f"{link('/mentors/' + h['id'], h.get('topic'))} with {_esc(h.get('hostName'))} · {day(h.get('startAt'))}" for h in d["hours"]]),
    ])
    html_body = f"""<div style="font:15px/1.6 Arial,sans-serif;color:#14211D;max-width:560px">
<p style="font-weight:800;color:#0E6B57;font-size:18px;margin:0 0 12px">{APP_NAME} · your week</p>
<p>Hi {_esc(d['name'])}, here’s what’s new for you this week.</p>{body}
<p style="margin-top:24px"><a href="{APP_URL}/matches" style="display:inline-block;background:#0E6B57;color:#fff;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:700">Open {APP_NAME}</a></p>
<p style="color:#55625E;font-size:12px;margin-top:24px">You get this because you turned on the weekly email in your profile. <a href="{unsubscribe}" style="color:#55625E">Unsubscribe in one click</a>.</p></div>"""
    text = (f"Hi {d['name']}, here's your {APP_NAME} week.\n"
            + "".join(f"\n- Role: {r.get('title')} in {r.get('teamName')}" for r in d["roles"])
            + "".join(f"\n- Event: {e.get('title')}" for e in d["events"])
            + "".join(f"\n- Circle: {c.get('title')}" for c in d["circles"])
            + f"\n\nOpen {APP_NAME}: {APP_URL}/matches\nUnsubscribe: {unsubscribe}")
    subject = f"Your {APP_NAME} week: " + (f"{len(d['roles'])} role(s) for your skills" if d["roles"] else f"{len(d['events'])} event(s) coming up" if d["events"] else "team update")
    return subject, html_body, text


def unsubscribe_link(request: Request, uid: str) -> str:
    base = os.getenv("PUBLIC_SERVER_URL", "").rstrip("/") or str(request.base_url).rstrip("/")
    return f"{base}/digest/unsubscribe?t={make_token({'u': uid, 'k': 'digest', 'exp': int(time.time() + 365 * DAY)})}"


def run_digest(db, request: Request) -> dict:
    """Send to everyone with settings/{uid}.digest == true, at most once every 6 days each."""
    sent = skipped = failed = 0
    cache: dict = {}
    now = time.time()
    for s in db.collection("settings").where("digest", "==", True).stream():
        uid, st = s.id, s.to_dict()
        if now - _ts(st.get("lastDigestAt")) < 6 * DAY:
            skipped += 1
            continue
        acc = doc_data(db.collection("users").document(uid)) or {}
        to = (acc.get("email") or "").strip()
        d = digest_for(db, uid, cache) if to else None
        if not d:
            skipped += 1
            continue
        try:
            subject, h, t = render_digest(d, unsubscribe_link(request, uid))
            send_email(to, subject, h, t)
            s.reference.update({"lastDigestAt": server_time()})
            sent += 1
        except Exception:
            failed += 1
        if sent >= int(os.getenv("DIGEST_MAX_PER_RUN", "400")):  # Gmail allows ~500 emails a day
            break
    return {"sent": sent, "skipped": skipped, "failed": failed}


def make_router(signed_in) -> APIRouter:
    r = APIRouter()

    @r.post("/admin/stats")
    def admin_stats(uid: str = Depends(signed_in)):
        db = fs()
        require_admin(db, uid)
        return build_stats(db)

    @r.post("/digest/preview")
    def digest_preview(request: Request, uid: str = Depends(signed_in)):
        db = fs()
        d = digest_for(db, uid, {})
        if not d:
            return {"empty": True, "html": "<p style='font:15px Arial'>Nothing new for you this week, so no email would be sent.</p>"}
        subject, h, _ = render_digest(d, unsubscribe_link(request, uid))
        return {"empty": False, "subject": subject, "html": h}

    @r.post("/digest/send")
    def digest_send(request: Request, uid: str = Depends(signed_in)):
        db = fs()
        require_admin(db, uid)
        if not backend.mail_ready():
            raise HTTPException(status_code=503, detail="Email is not set up on the server (SMTP_USER / SMTP_PASS).")
        res = run_digest(db, request)
        backend.audit(db, uid, f"Sent weekly digest: {res['sent']} sent, {res['skipped']} skipped, {res['failed']} failed")
        return res

    @r.get("/digest/cron")
    def digest_cron(request: Request, key: str = ""):
        want = os.getenv("DIGEST_CRON_KEY", "")
        if len(want) < 16 or not hmac.compare_digest(key.encode(), want.encode()):   # long key, constant-time check
            raise HTTPException(status_code=403, detail="Wrong key")
        return run_digest(fs(), request)

    @r.get("/digest/unsubscribe", response_class=HTMLResponse)
    def digest_unsubscribe(t: str = ""):
        data = read_token(t)
        if not data or data.get("k") != "digest":
            return page("Link not valid", "<h1>Link not valid</h1><p class='muted'>Turn the weekly email off from your BuildMates profile instead.</p>")
        fs().collection("settings").document(data["u"]).set({"digest": False, "updatedAt": server_time()}, merge=True)
        return page("Unsubscribed", f"<h1>You’re unsubscribed</h1><p class='muted'>No more weekly emails. You can turn them on again in your {APP_NAME} profile.</p>")

    return r

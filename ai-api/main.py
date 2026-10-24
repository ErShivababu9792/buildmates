"""
BuildMates AI API (FastAPI)

Endpoints
  GET  /health        → is the API up, which models are loaded
  POST /embed         → {text} → 384-number vector of the MEANING of the text (for matching)
  POST /guard         → {text} → {level: ok|warn|block, kind, confidence}
  POST /idea-check    → {title, pitch, detail} → warnings before an idea is posted
  POST /check-link    → {url} → does a Launchpad product link really open
  + parent email approval, college ID verification and push notifications (see backend.py)

Every POST needs the user's Firebase login token:  Authorization: Bearer <idToken>
Run locally:  uvicorn main:app --reload --port 8000
"""
import os
import time
from collections import defaultdict, deque
from functools import lru_cache

import joblib
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rules import check_rules, idea_rules

try:  # load ai-api/.env, then the web app's .env (for VITE_FIREBASE_PROJECT_ID) when running locally
    from dotenv import load_dotenv
    _here = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_here, ".env"))
    load_dotenv(os.path.join(_here, "..", ".env"))
except ImportError:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("VITE_FIREBASE_PROJECT_ID", "")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() != "false"
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"            # true only on your own laptop
ALLOW_LOCALHOST = os.getenv("ALLOW_LOCALHOST", "true").lower() != "false"   # set false on the live server

app = FastAPI(title="BuildMates AI API", version="1.0.0")


@app.middleware("http")
async def catch_errors(request: Request, call_next):
    """Turns any crash into a readable JSON error. Added BEFORE CORS so the browser still gets CORS headers
    (otherwise a crash looks like "server not reachable" in the app). The full error is printed in this terminal."""
    try:
        response = await call_next(request)
    except Exception as e:  # noqa: BLE001
        import traceback
        import uuid
        from fastapi.responses import JSONResponse
        ref = uuid.uuid4().hex[:8]
        print(f"[error {ref}] {request.method} {request.url.path}")
        traceback.print_exc()
        # The error text can contain internal details, so the app only sees it when DEBUG=true
        detail = f"Server error ({type(e).__name__}: {str(e)[:160]})." if DEBUG else "Something went wrong on the server."
        response = JSONResponse(status_code=500, content={"detail": f"{detail} Reference {ref}, full details are in the server terminal."})
    # Security headers on every answer (the parent approval and unsubscribe pages are HTML)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")   # the links carry a token; never leak it
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("Content-Security-Policy",
                                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?" if ALLOW_LOCALHOST else None,  # any local dev port
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------------------------------------------------------------- models
@lru_cache(maxsize=1)
def embedder():
    """Multilingual sentence model: understands English, Hindi and Hinglish meaning. Loaded once."""
    if EMBED_MODEL == "hash":  # tiny stand-in used only for automated tests
        return None
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(EMBED_MODEL, device="cpu")


@lru_cache(maxsize=1)
def guard_model():
    path = os.path.join(HERE, "models", "guard.joblib")
    return joblib.load(path) if os.path.exists(path) else None


def embed(text: str) -> list[float]:
    model = embedder()
    if model is None:  # deterministic test vector
        rng = np.random.default_rng(abs(hash(text)) % (2 ** 32))
        v = rng.normal(size=384)
    else:
        v = model.encode([text], normalize_embeddings=True)[0]
    v = np.asarray(v, dtype=np.float32)
    v = v / (np.linalg.norm(v) or 1.0)
    return [round(float(x), 5) for x in v]


# ---------------------------------------------------------------- auth + limits
_firebase_request = None


if not REQUIRE_AUTH:
    print("WARNING: REQUIRE_AUTH=false. Anyone can use this server. Never run it like this on the internet.")


def verify_user(authorization: str = Header(default="")) -> str:
    """Checks the Firebase ID token and returns the user's uid."""
    if not REQUIRE_AUTH:
        return "dev-user"
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in required")
    if not FIREBASE_PROJECT_ID:
        raise HTTPException(status_code=500, detail="Server is missing FIREBASE_PROJECT_ID")
    global _firebase_request
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token
    if _firebase_request is None:
        _firebase_request = g_requests.Request()
    try:
        claims = id_token.verify_firebase_token(authorization[7:], _firebase_request, audience=FIREBASE_PROJECT_ID)
    except Exception:
        raise HTTPException(status_code=401, detail="Your session expired. Please sign in again.")
    if not claims or "user_id" not in claims:
        raise HTTPException(status_code=401, detail="Invalid sign-in")
    return claims["user_id"]


_hits: dict[str, deque] = defaultdict(deque)


def rate_limited(uid: str = Depends(verify_user)) -> str:
    now = time.time()
    q = _hits[uid]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_MIN:
        raise HTTPException(status_code=429, detail="Too many requests. Wait a minute and try again.")
    q.append(now)
    return uid


# ---------------------------------------------------------------- schemas
class TextIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class IdeaIn(BaseModel):
    title: str = Field("", max_length=120)
    pitch: str = Field("", max_length=300)
    detail: str = Field("", max_length=3000)


GUARD_COPY = {
    "contact": ("block", "Contact sharing", "Phone numbers and social IDs can’t be shared in the first 7 days. Keep talking here, it keeps you both safe."),
    "money": ("block", "Money request", "Asking for money isn’t allowed on BuildMates. If someone asks you to pay to join a project, report them."),
    "abuse": ("block", "Abusive language", "Abusive words aren’t allowed. Please keep it respectful."),
    "flirt": ("warn", "Personal, not about the project", "This sounds personal rather than about the project. BuildMates is for building together."),
}
BLOCK_THRESHOLD = float(os.getenv("GUARD_BLOCK_THRESHOLD", "0.6"))


# ---------------------------------------------------------------- routes
@app.get("/health")
def health():
    import backend
    return {
        "ok": True,
        "guard_model": guard_model() is not None,
        "embed_model": EMBED_MODEL,
        "auth": REQUIRE_AUTH,
        "auth_ready": (not REQUIRE_AUTH) or bool(FIREBASE_PROJECT_ID),
        # public page: only yes/no for each feature, never error text or paths
        **{k: v for k, v in backend.status().items() if k != "admin_error"},
        "admin_error": "" if backend.status().get("admin_ready") else "Check the server terminal and ai-api/.env.",
    }


@app.post("/embed")
def embed_route(body: TextIn, uid: str = Depends(rate_limited)):
    # Small free servers (512 MB, e.g. Render) run without the AI model: EMBED_MODEL=off.
    # The app then matches by keywords, everything else keeps working.
    if EMBED_MODEL == "off":
        raise HTTPException(status_code=503, detail="AI matching is off on this server. Keyword matching is used.")
    return {"vector": embed(body.text.strip()), "dims": 384}


@app.post("/guard")
def guard_route(body: TextIn, uid: str = Depends(rate_limited)):
    text = body.text.strip()
    # 1) Hard rules first: exact, explainable, never miss a phone number
    rule = check_rules(text)
    if rule:
        return {**rule, "source": "rules", "confidence": 1.0}
    # 2) Trained Hinglish model for everything the rules don't catch
    model = guard_model()
    if model is None:
        return {"level": "ok", "source": "none", "confidence": 0.0}
    probs = model.predict_proba([text.lower()])[0]
    best = int(np.argmax(probs))
    label, conf = model.classes_[best], float(probs[best])
    if label == "safe" or conf < BLOCK_THRESHOLD:
        return {"level": "ok", "source": "model", "label": label, "confidence": round(conf, 3)}
    level, kind, msg = GUARD_COPY[label]
    return {"level": level, "kind": kind, "msg": msg, "source": "model", "label": label, "confidence": round(conf, 3)}


@app.post("/idea-check")
def idea_check(body: IdeaIn, uid: str = Depends(rate_limited)):
    return {"warnings": idea_rules(body.title, body.pitch, body.detail)}



# ---------------------------------------------------------------- link check (Launchpad)
import ipaddress
import socket
from urllib.parse import urljoin, urlparse


class LinkIn(BaseModel):
    url: str = Field(..., min_length=8, max_length=300)


def _public_https(url: str) -> bool:
    """Only https links to public internet addresses (blocks requests to private networks / this server)."""
    u = urlparse(url)
    if u.scheme != "https" or not u.hostname:
        return False
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


@app.post("/check-link")
def check_link(body: LinkIn, uid: str = Depends(rate_limited)):
    import requests as http
    url = body.url.strip()
    for _ in range(4):  # follow at most 3 redirects, checking every hop
        if not _public_https(url):
            return {"ok": False, "reason": "Use a public https:// link"}
        try:
            r = http.get(url, timeout=6, allow_redirects=False, stream=True, headers={"User-Agent": "BuildMates link check"})
            r.close()
        except http.RequestException:
            return {"ok": False, "reason": "The site did not respond"}
        if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
            url = urljoin(url, r.headers["location"])
            continue
        return {"ok": r.status_code < 400, "status": r.status_code}
    return {"ok": False, "reason": "Too many redirects"}

# ---------------------------------------------------------------- Phase 11: parent email, ID check, push
import backend  # noqa: E402

app.include_router(backend.make_router(rate_limited))

# Phase 13: growth stats for admins + weekly email digest
import growth  # noqa: E402

app.include_router(growth.make_router(rate_limited))

# Location from real APIs (India Post + OpenStreetMap) and many-language UI translation
import geo  # noqa: E402
app.include_router(geo.make_router())
# The old on-server translation (i18n_api.py) is switched off: all 7 languages ship inside the app now.
# It also let anyone start heavy translation jobs without signing in.


@app.exception_handler(Exception)
async def unexpected(request: Request, exc: Exception):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on the AI server."})

"""
App text in many languages, made by a real translation model (not hand-written per language).

  GET  /i18n/languages          → languages this server can translate into
  POST /i18n/translate {lang}   → start translating the app's English text into `lang` (each language once; limited per IP)
  POST /i18n/redo {lang}        → admins: translate again (e.g. after changing the engine)
  GET  /i18n/status?lang=xx     → {status: ready|queued|working|error, progress}

Engine (TRANSLATE_PROVIDER in .env):
  nllb   (default, free) Meta's NLLB-200 model running on this server (~2.5 GB download the first time).
  google  Google Cloud Translation API, needs GOOGLE_TRANSLATE_KEY.

Each language is translated ONCE and saved in Firestore translations/{lang}; every user then loads it instantly.
The English source is ai-api/i18n_en.json, exported from the web app (npm run i18n:export), so nobody can inject text.
Placeholders like {name} and brand names are never sent to the model, so they always survive translation.
"""
import hashlib
import json
import os
import re
import threading
import time

import requests as http
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend import admin_app, doc_data, fs, server_time
from geo import _limit

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "i18n_en.json")
PROVIDER = os.getenv("TRANSLATE_PROVIDER", "nllb").lower()
NLLB_MODEL = os.getenv("NLLB_MODEL", "facebook/nllb-200-distilled-600M")

# App language code (BCP-47, what the browser uses) → NLLB / FLORES-200 code.
# This is the list of languages the model supports that we offer; their display names come from the browser (Intl.DisplayNames).
NLLB = {
    # India
    "hi": "hin_Deva", "bn": "ben_Beng", "te": "tel_Telu", "mr": "mar_Deva", "ta": "tam_Taml", "ur": "urd_Arab",
    "gu": "guj_Gujr", "kn": "kan_Knda", "ml": "mal_Mlym", "or": "ory_Orya", "pa": "pan_Guru", "as": "asm_Beng",
    "mai": "mai_Deva", "sa": "san_Deva", "ne": "npi_Deva", "sd": "snd_Arab", "ks": "kas_Arab", "mni": "mni_Beng",
    "bho": "bho_Deva", "mag": "mag_Deva", "hne": "hne_Deva", "awa": "awa_Deva",
    # World
    "ar": "arb_Arab", "zh-CN": "zho_Hans", "zh-TW": "zho_Hant", "ja": "jpn_Jpan", "ko": "kor_Hang", "fr": "fra_Latn",
    "de": "deu_Latn", "es": "spa_Latn", "pt": "por_Latn", "it": "ita_Latn", "ru": "rus_Cyrl", "tr": "tur_Latn",
    "id": "ind_Latn", "ms": "zsm_Latn", "th": "tha_Thai", "vi": "vie_Latn", "fa": "pes_Arab", "pl": "pol_Latn",
    "nl": "nld_Latn", "uk": "ukr_Cyrl", "sw": "swh_Latn", "tl": "tgl_Latn", "he": "heb_Hebr", "el": "ell_Grek",
    "ro": "ron_Latn", "hu": "hun_Latn", "cs": "ces_Latn", "sv": "swe_Latn", "da": "dan_Latn", "fi": "fin_Latn",
    "nb": "nob_Latn", "bg": "bul_Cyrl", "sr": "srp_Cyrl", "hr": "hrv_Latn", "my": "mya_Mymr", "km": "khm_Khmr",
    "si": "sin_Sinh", "am": "amh_Ethi", "ha": "hau_Latn", "yo": "yor_Latn", "zu": "zul_Latn", "ps": "pbt_Arab",
    "az": "azj_Latn", "kk": "kaz_Cyrl", "uz": "uzn_Latn",
}
RTL = {"ar", "ur", "fa", "he", "sd", "ks", "ps"}

# Never translated: placeholders and names
PROTECT = re.compile(r"(\{\w+\}|BuildMates|AI Guard|DPDP Act 2023|TIPI|Ten-Item Personality Inventory|Google|Hinglish|https?://\S+)")


def load_source() -> tuple[dict, str]:
    if not os.path.exists(SOURCE):
        raise HTTPException(status_code=503, detail="i18n_en.json is missing on the server. Run: npm run i18n:export")
    with open(SOURCE, encoding="utf-8") as f:
        src = json.load(f)
    version = hashlib.sha1(json.dumps(src, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]
    return src, version


def split_protected(text: str) -> list[tuple[str, bool]]:
    """'Hi {name}, welcome' → [('Hi ', True), ('{name}', False), (', welcome', True)]  (True = translate)."""
    out, last = [], 0
    for m in PROTECT.finditer(text):
        if m.start() > last:
            out.append((text[last:m.start()], True))
        out.append((m.group(0), False))
        last = m.end()
    if last < len(text):
        out.append((text[last:], True))
    return out


def worth_translating(s: str) -> bool:
    return bool(re.search(r"[A-Za-z]{2,}", s))


# ---------------------------------------------------------------- engines
_model = {"tok": None, "model": None}
_model_lock = threading.Lock()


def _nllb(texts: list[str], target: str, progress, stage=lambda s: None) -> list[str]:
    with _model_lock:
        if _model["model"] is None:
            stage("loading")  # first time: downloads ~2.5 GB, then loads into memory
            import torch
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            torch.set_num_threads(max(1, (os.cpu_count() or 2)))
            _model["tok"] = AutoTokenizer.from_pretrained(NLLB_MODEL, src_lang="eng_Latn")
            _model["model"] = AutoModelForSeq2SeqLM.from_pretrained(NLLB_MODEL)
            _model["model"].eval()
    stage("translating")
    import torch
    tok, model = _model["tok"], _model["model"]
    bos = tok.convert_tokens_to_ids(NLLB[target])
    out: list[str] = []
    batch = int(os.getenv("TRANSLATE_BATCH", "12"))
    for i in range(0, len(texts), batch):
        chunk = texts[i:i + batch]
        inputs = tok(chunk, return_tensors="pt", padding=True, truncation=True, max_length=256)
        with torch.inference_mode():
            gen = model.generate(**inputs, forced_bos_token_id=bos, max_new_tokens=256, num_beams=2)
        out.extend(tok.batch_decode(gen, skip_special_tokens=True))
        progress(len(out) / len(texts))
    return out


def _google(texts: list[str], target: str, progress, stage=lambda s: None) -> list[str]:
    key = os.getenv("GOOGLE_TRANSLATE_KEY", "")
    if not key:
        raise RuntimeError("GOOGLE_TRANSLATE_KEY is not set")
    out: list[str] = []
    for i in range(0, len(texts), 100):
        r = http.post("https://translation.googleapis.com/language/translate/v2", params={"key": key}, timeout=30,
                      json={"q": texts[i:i + 100], "source": "en", "target": target, "format": "text"})
        r.raise_for_status()
        out.extend(t["translatedText"] for t in r.json()["data"]["translations"])
        progress(len(out) / len(texts))
    return out


def translate_table(src: dict, target: str, progress, stage=lambda s: None) -> dict:
    """Translate every string, keeping placeholders/brand names and the leading/trailing spaces of each piece."""
    pieces = {k: split_protected(v) for k, v in src.items()}
    unique = sorted({p.strip() for parts in pieces.values() for p, ok in parts if ok and worth_translating(p)})
    engine = _google if PROVIDER == "google" else _nllb
    done = dict(zip(unique, engine(unique, target, progress, stage))) if unique else {}
    result = {}
    for k, parts in pieces.items():
        s = ""
        for p, ok in parts:
            core = p.strip()
            if ok and core in done:
                lead, trail = p[:len(p) - len(p.lstrip())], p[len(p.rstrip()):]
                s += lead + done[core] + trail
            else:
                s += p
        result[k] = s
    return result


# ---------------------------------------------------------------- saving
STATIC_DIR = os.getenv("I18N_STATIC_DIR", os.path.join(HERE, "..", "public", "i18n"))


def save_translation(lang: str, strings: dict, version: str, to_firestore: bool = True):
    """Write public/i18n/<lang>.json (ships with the website → instant) and Firestore translations/<lang> (live sites)."""
    payload = {"lang": lang, "version": version, "rtl": lang in RTL, "engine": PROVIDER if PROVIDER == "google" else NLLB_MODEL, "strings": strings}
    if os.path.isdir(os.path.dirname(STATIC_DIR)):
        os.makedirs(STATIC_DIR, exist_ok=True)
        with open(os.path.join(STATIC_DIR, f"{lang}.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    if to_firestore and admin_app() is not None:
        fs().collection("translations").document(lang).set({**payload, "count": len(strings), "at": server_time()})


def static_version(lang: str) -> str | None:
    try:
        with open(os.path.join(STATIC_DIR, f"{lang}.json"), encoding="utf-8") as f:
            return json.load(f).get("version")
    except (OSError, ValueError):
        return None


# ---------------------------------------------------------------- jobs
_jobs: dict[str, dict] = {}
_queue: list[str] = []
_cv = threading.Condition()


def _worker():
    while True:
        with _cv:
            while not _queue:
                _cv.wait()
            lang = _queue.pop(0)
        job = _jobs[lang]
        job.update(status="working", stage="starting", progress=0.0, started=time.time())
        try:
            src, version = load_source()
            strings = translate_table(src, lang, lambda p: job.update(progress=round(p, 3)), lambda st: job.update(stage=st))
            save_translation(lang, strings, version)
            job.update(status="ready", stage="done", progress=1.0)
        except Exception as e:  # noqa: BLE001
            job.update(status="error", error=f"{type(e).__name__}: {str(e)[:200]}")


_thread = threading.Thread(target=_worker, daemon=True)
_thread.start()


class LangIn(BaseModel):
    lang: str = Field(..., min_length=2, max_length=8)
    force: bool = False


def make_router(signed_in) -> APIRouter:
    r = APIRouter(prefix="/i18n")

    @r.get("/languages")
    def languages():
        return {"languages": [{"code": c, "rtl": c in RTL} for c in NLLB], "engine": PROVIDER, "ready": admin_app() is not None}

    def queue(lang: str, force: bool = False):
        if lang not in NLLB:
            raise HTTPException(status_code=400, detail="This language isn't available yet.")
        db = fs()
        _, version = load_source()
        current = doc_data(db.collection("translations").document(lang))
        if current and current.get("version") == version and not force:
            return {"status": "ready", "progress": 1.0}
        with _cv:
            job = _jobs.get(lang)
            if job and job["status"] in ("queued", "working"):
                return {"status": job["status"], "progress": job.get("progress", 0), "position": _queue.index(lang) + 1 if lang in _queue else 0}
            _jobs[lang] = {"status": "queued", "progress": 0.0}
            _queue.append(lang)
            _cv.notify()
        return {"status": "queued", "progress": 0.0, "position": len(_queue)}

    # Anyone (even before signing in, on the first page) can ask for a supported language.
    # Safe: only our own English file is translated, each language once, limited per IP.
    @r.post("/translate")
    def translate(body: LangIn, request: Request):
        _limit(request)
        return queue(body.lang)

    @r.post("/redo")
    def redo(body: LangIn, uid: str = Depends(signed_in)):
        if not fs().collection("admins").document(uid).get().exists:
            raise HTTPException(status_code=403, detail="Only admins can redo a translation.")
        return queue(body.lang, force=True)

    @r.get("/status")
    def status(lang: str):
        job = _jobs.get(lang)
        if not job:
            return {"status": "idle"}
        return {k: v for k, v in job.items() if k in ("status", "stage", "progress", "error")}

    return r

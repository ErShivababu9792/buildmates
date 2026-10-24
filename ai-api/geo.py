"""
Location from real, free APIs (no hard-coded lists of places):

  GET /geo/pincode/{pin}         India Post (api.postalpincode.in) → state, district, the areas (post offices) under that pincode,
                                 plus an approximate centre from OpenStreetMap
  GET /geo/search?q=&lat=&lon=   OpenStreetMap place search (Photon by komoot) → areas, towns, cities
  GET /geo/colleges?q=&lat=&lon= OpenStreetMap search for colleges / universities / schools near the student
  GET /geo/reverse?lat=&lon=     "Use my location" → the area name (we only keep an area-level centre, never the exact spot)

The app calls these through the server (caching, one polite User-Agent, works even if a browser blocks the APIs)
and falls back to calling the APIs directly when the server is off.
No sign-in needed (used during onboarding); limited per IP address.
"""
import re
import time
from collections import defaultdict, deque
from functools import lru_cache

import requests as http
from fastapi import APIRouter, HTTPException, Query, Request

PHOTON = "https://photon.komoot.io"
POSTAL = "https://api.postalpincode.in"
HEADERS = {"User-Agent": "BuildMates student project (contact via app admin)", "Accept": "application/json"}
LIMIT_PER_MIN = 40

_hits: dict[str, deque] = defaultdict(deque)


def _limit(request: Request):
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    q, now = _hits[ip], time.time()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= LIMIT_PER_MIN:
        raise HTTPException(status_code=429, detail="Too many location searches. Wait a minute.")
    q.append(now)


def round_geo(lat, lon):
    """~1 km precision: enough for 'how far', never a person's exact location."""
    return {"lat": round(float(lat), 2), "lng": round(float(lon), 2)}


def _place(f: dict) -> dict:
    p = f.get("properties", {})
    lon, lat = (f.get("geometry", {}).get("coordinates") or [None, None])[:2]
    area = p.get("name") or p.get("district") or p.get("locality") or p.get("city") or ""
    city = p.get("city") or p.get("county") or p.get("district") or ""
    return {
        "name": area,
        "area": p.get("district") if p.get("osm_value") in ("college", "university", "school") and p.get("district") else area,
        "city": city if city != area else (p.get("county") or p.get("state") or ""),
        "state": p.get("state") or "",
        "country": p.get("country") or "",
        "pincode": p.get("postcode") or "",
        "kind": p.get("osm_value") or p.get("type") or "",
        "geo": round_geo(lat, lon) if lat is not None else None,
    }


@lru_cache(maxsize=2048)
def _photon(path: str, params: tuple) -> list:
    try:
        r = http.get(f"{PHOTON}{path}", params=list(params), headers=HEADERS, timeout=8)
        r.raise_for_status()
        return r.json().get("features", [])
    except (http.RequestException, ValueError):
        raise HTTPException(status_code=502, detail="Map search is not answering right now. Try again.")


def _bias(lat, lon):
    return (("lat", f"{lat:.3f}"), ("lon", f"{lon:.3f}")) if lat is not None and lon is not None else ()


@lru_cache(maxsize=1024)
def _pincode(pin: str) -> dict:
    try:
        r = http.get(f"{POSTAL}/pincode/{pin}", headers=HEADERS, timeout=8)
        r.raise_for_status()
        data = r.json()
    except (http.RequestException, ValueError):
        raise HTTPException(status_code=502, detail="India Post pincode service is not answering. Try again or search your area.")
    block = data[0] if isinstance(data, list) and data else {}
    offices = block.get("PostOffice") or []
    if block.get("Status") != "Success" or not offices:
        raise HTTPException(status_code=404, detail="We couldn't find that pincode. Check the 6 digits.")
    first = offices[0]
    areas = sorted({o.get("Name", "").strip() for o in offices if o.get("Name")})
    district, state = first.get("District", ""), first.get("State", "")
    # approximate centre of the pincode from OpenStreetMap (postcode search, then district)
    geo = None
    for q in (f"{pin} {district}", f"{district} {state}"):
        try:
            feats = _photon("/api", (("q", q), ("limit", "1"), ("lang", "en")))
        except HTTPException:
            feats = []
        if feats:
            geo = _place(feats[0])["geo"]
            break
    return {"pincode": pin, "state": state, "district": district, "city": first.get("Block") if first.get("Block") not in (None, "NA") else district,
            "areas": areas, "geo": geo, "source": "India Post"}


def make_router() -> APIRouter:
    r = APIRouter(prefix="/geo")

    @r.get("/pincode/{pin}")
    def pincode(pin: str, request: Request):
        _limit(request)
        if not re.fullmatch(r"[1-9][0-9]{5}", pin):
            raise HTTPException(status_code=400, detail="An Indian pincode has 6 digits.")
        return _pincode(pin)

    @r.get("/search")
    def search(request: Request, q: str = Query(..., min_length=2, max_length=80), lat: float | None = None, lon: float | None = None):
        _limit(request)
        base = (("q", q.strip()), ("limit", "8"), ("lang", "en")) + _bias(lat, lon)
        layers = (("layer", "city"), ("layer", "district"), ("layer", "locality"), ("layer", "county"), ("layer", "state"))
        try:
            feats = _photon("/api", base + layers)  # only places, not shops or streets
        except HTTPException:
            feats = _photon("/api", base)          # older Photon servers don't know "layer"
        return {"results": [_place(f) for f in feats], "source": "OpenStreetMap"}

    @r.get("/colleges")
    def colleges(request: Request, q: str = Query(..., min_length=2, max_length=80), lat: float | None = None, lon: float | None = None):
        _limit(request)
        params = (("q", q.strip()), ("limit", "10"), ("lang", "en"),
                  ("osm_tag", "amenity:college"), ("osm_tag", "amenity:university"), ("osm_tag", "amenity:school")) + _bias(lat, lon)
        seen, out = set(), []
        for f in _photon("/api", params):
            p = _place(f)
            key = (p["name"].lower(), p["city"].lower())
            if p["name"] and key not in seen:
                seen.add(key)
                out.append(p)
        return {"results": out, "source": "OpenStreetMap"}

    @r.get("/reverse")
    def reverse(request: Request, lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
        _limit(request)
        g = round_geo(lat, lon)  # round BEFORE asking anyone, so the exact spot never leaves the browser/server
        feats = _photon("/reverse", (("lat", str(g["lat"])), ("lon", str(g["lng"])), ("limit", "1"), ("lang", "en")))
        if not feats:
            raise HTTPException(status_code=404, detail="Couldn't name this place. Search your area instead.")
        props = feats[0].get("properties", {})
        p = _place(feats[0])
        # name the AREA (neighbourhood / district), not the nearest shop or building
        p["area"] = p["name"] = props.get("district") or props.get("locality") or props.get("city") or p["name"]
        p["geo"] = g
        return p

    return r

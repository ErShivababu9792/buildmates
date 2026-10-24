import { AI_URL } from './ai';

/**
 * Location from real APIs, no lists of places in the code:
 *  - India Post pincode API (api.postalpincode.in): pincode → state, district, areas
 *  - OpenStreetMap search (Photon by komoot): areas, cities, colleges, and "use my location"
 * We go through the BuildMates server first (caching, polite use of the free APIs) and call the APIs
 * directly if the server is off. The profile (what other students see) only ever holds an area-level point (~1 km).
 * The exact GPS point is saved separately in locations/{uid}, which only the student and admins can read (safety).
 */
const PHOTON = 'https://photon.komoot.io';
const POSTAL = 'https://api.postalpincode.in';

export const roundGeo = (lat, lng) => ({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 });
const validGeo = (g) => g && Number.isFinite(g.lat) && Number.isFinite(g.lng);

/** Kilometres between two {lat,lng} points (haversine). */
export function km(a, b) {
  if (!validGeo(a) || !validGeo(b)) return null;
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const NEAR_KM = 5; // "my area" = within 5 km of my area's centre

/** "Within 5 km": uses distance when both have a point, otherwise the same area name. */
export function sameArea(a, b) {
  const d = km(a.geo, b.geo);
  if (d !== null) return d <= NEAR_KM;
  return Boolean(a.area) && a.area === b.area;
}

async function getJson(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.detail || `Error ${res.status}`); e.status = res.status; throw e; }
    return data;
  } finally { clearTimeout(timer); }
}

/** Try the BuildMates server, then the public API directly. 4xx answers (e.g. wrong pincode) are not retried. */
async function viaServer(path, direct) {
  if (AI_URL) {
    try { return await getJson(`${AI_URL}${path}`); } catch (e) { if (e.status && e.status < 500 && e.status !== 429) throw e; }
  }
  return direct();
}

function fromPhoton(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry?.coordinates || [];
  const name = p.name || p.district || p.locality || p.city || '';
  const city = p.city || p.county || p.district || '';
  const isSchool = ['college', 'university', 'school'].includes(p.osm_value);
  return {
    name,
    area: isSchool && p.district ? p.district : name,
    city: city !== name ? city : (p.county || p.state || ''),
    state: p.state || '', country: p.country || '', pincode: p.postcode || '', kind: p.osm_value || p.type || '',
    geo: Number.isFinite(lat) ? roundGeo(lat, lng) : null,
  };
}

const bias = (near) => (validGeo(near) ? `&lat=${near.lat}&lon=${near.lng}` : '');

/** Pincode → { state, district, city, areas: [names], geo } */
export function lookupPincode(pin) {
  return viaServer(`/geo/pincode/${pin}`, async () => {
    const data = await getJson(`${POSTAL}/pincode/${pin}`);
    const block = Array.isArray(data) ? data[0] : null;
    const offices = block?.PostOffice || [];
    if (block?.Status !== 'Success' || !offices.length) { const e = new Error('We couldn’t find that pincode. Check the 6 digits.'); e.status = 404; throw e; }
    const first = offices[0];
    let geo = null;
    try {
      const f = (await getJson(`${PHOTON}/api/?q=${encodeURIComponent(`${pin} ${first.District}`)}&limit=1&lang=en`)).features?.[0];
      if (f) geo = fromPhoton(f).geo;
    } catch { /* centre is optional */ }
    return {
      pincode: pin, state: first.State, district: first.District,
      city: first.Block && first.Block !== 'NA' ? first.Block : first.District,
      areas: [...new Set(offices.map((o) => o.Name).filter(Boolean))].sort(), geo, source: 'India Post',
    };
  });
}

/** Search areas / towns / cities by name. */
export function searchPlaces(q, near) {
  const qs = `q=${encodeURIComponent(q)}${bias(near)}`;
  return viaServer(`/geo/search?${qs}`, async () => {
    const data = await getJson(`${PHOTON}/api/?${qs}&limit=8&lang=en`);
    return { results: (data.features || []).map(fromPhoton), source: 'OpenStreetMap' };
  }).then((r) => r.results || []);
}

/** Search colleges / universities / schools, closest to `near` first. */
export function searchColleges(q, near) {
  const qs = `q=${encodeURIComponent(q)}${bias(near)}`;
  return viaServer(`/geo/colleges?${qs}`, async () => {
    const tags = '&osm_tag=amenity:college&osm_tag=amenity:university&osm_tag=amenity:school';
    const data = await getJson(`${PHOTON}/api/?${qs}&limit=10&lang=en${tags}`);
    return { results: (data.features || []).map(fromPhoton).filter((p) => p.name), source: 'OpenStreetMap' };
  }).then((r) => r.results || []);
}

/**
 * Browser location (the normal "Allow location" pop-up) → the area's name for the profile,
 * plus the exact point, which only goes to locations/{uid} for admins (see lib/safetyLocation.js).
 * The profile only ever gets the point rounded to ~1 km.
 */
export function areaFromDevice() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This browser can’t share location. Use your pincode instead.')); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const exact = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0) };
      const g = roundGeo(exact.lat, exact.lng);
      try {
        const p = await viaServer(`/geo/reverse?lat=${g.lat}&lon=${g.lng}`, async () => {
          const f = (await getJson(`${PHOTON}/reverse?lat=${g.lat}&lon=${g.lng}&limit=1&lang=en`)).features?.[0];
          if (!f) throw new Error('Couldn’t name this place. Search your area instead.');
          const props = f.properties || {};
          const out = fromPhoton(f);
          out.area = out.name = props.district || props.locality || props.city || out.name;
          return out;
        });
        resolve({ ...p, geo: g, exact });
      } catch (e) { e.exact = exact; reject(e); }
    }, (err) => reject(Object.assign(new Error(err.code === 1 ? 'Location permission was denied. Use your pincode instead.' : 'Couldn’t get your location. Use your pincode instead.'), { denied: err.code === 1 })),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

/** Exact GPS point only (no area lookup). Used to refresh the safety location quietly. */
export function exactPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0) }),
      reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 300000 },
    );
  });
}

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Map of students around you: one circle per area (size = number of students, popup = top interests).
 * Positions are each area's centre from India Post / OpenStreetMap (rounded to ~1 km). Nobody's exact location is shown.
 */
export default function AreaMap({ people, me }) {
  const box = useRef(null);
  const map = useRef(null);

  const areas = useMemo(() => {
    const by = {};
    people.forEach((p) => {
      if (!p.geo || !Number.isFinite(p.geo.lat)) return;
      const key = `${(p.area || '').toLowerCase()}|${p.geo.lat.toFixed(2)}|${p.geo.lng.toFixed(2)}`;
      const a = (by[key] ||= { area: p.area || 'Area', geo: p.geo, n: 0, interests: {} });
      a.n += 1;
      (p.interests || []).forEach((i) => { a.interests[i] = (a.interests[i] || 0) + 1; });
    });
    return Object.values(by).map((a) => ({ ...a, top: Object.entries(a.interests).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k) }));
  }, [people]);

  const centre = me?.geo && Number.isFinite(me.geo.lat) ? [me.geo.lat, me.geo.lng] : areas[0] ? [areas[0].geo.lat, areas[0].geo.lng] : [20.59, 78.96];
  const zoom = me?.geo || areas.length ? 11 : 4;

  useEffect(() => {
    if (!box.current || map.current) return undefined;
    map.current = L.map(box.current, { scrollWheelZoom: false, attributionControl: true }).setView(centre, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 15, attribution: '© OpenStreetMap contributors',
    }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return undefined;
    const layer = L.layerGroup().addTo(m);
    const max = Math.max(1, ...areas.map((a) => a.n));
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    areas.forEach((a) => {
      const mine = me?.area && a.area === me.area;
      L.circleMarker([a.geo.lat, a.geo.lng], {
        radius: 10 + 22 * (a.n / max),
        color: mine ? '#E3A21A' : '#0E6B57', weight: 2, fillColor: mine ? '#E3A21A' : '#0E6B57', fillOpacity: 0.35,
      })
        .bindPopup(`<b>${esc(a.area)}</b><br/>${a.n} student${a.n > 1 ? 's' : ''}<br/>${a.top.length ? `Into: ${esc(a.top.join(', '))}` : ''}`)
        .addTo(layer);
    });
    return () => { layer.remove(); };
  }, [areas, me]);

  const missing = people.filter((p) => !p.geo).length;
  return (
    <div className="stack gap-8">
      <div ref={box} className="map" role="img" aria-label="Map showing how many students are in each area near you" />
      <p className="tiny muted">Circles show how many students are in each area (bigger = more). Your area is in gold. Nobody’s exact location is shown.{missing ? ` ${missing} student${missing > 1 ? 's have' : ' has'} not added a map location yet.` : ''}</p>
    </div>
  );
}

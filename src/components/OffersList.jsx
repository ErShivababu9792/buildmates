import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocial } from '../context/SocialContext';
import { useToast } from './Toast';
import Icon from './Icon';
import { COOLING_OFF_DAYS, formatINR, OFFER_KINDS } from '../lib/launchpad';

const kindLabel = (id) => OFFER_KINDS.find((k) => k.id === id)?.label || id;

/** What the owner sees: offers from professionals, with a cooling-off reminder and an optional value guide. */
export default function OffersList({ offers, guide }) {
  const { relation, sendRequest, chatWith } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');

  async function talk(o) {
    const r = relation(o.id);
    if (r === 'connected') { navigate(`/chats/${chatWith[o.id].id}`); return; }
    setBusy(o.id);
    try { const id = await sendRequest(o.id); if (id) navigate(`/chats/${id}`); else toast('Request sent. You can chat once they accept.'); } catch { toast('Could not send the request.'); }
    setBusy('');
  }

  return (
    <section className="card stack">
      <div className="row between"><h3>Offers from professionals</h3><span className="mono">{offers.length}</span></div>
      {offers.length > 0 && (
        <div className="notice warn"><Icon name="clock" size={18} />
          <div><b>Take at least {COOLING_OFF_DAYS} days before saying yes.</b> Talk to a mentor or faculty first. Never share passwords, and sign nothing until you understand it.</div></div>
      )}
      {guide && <p className="small muted">Rough starting range for a conversation: <b>{formatINR(guide[0])} – {formatINR(guide[1])}</b>. This is a guide to avoid very low offers, not a valuation.</p>}
      {offers.length ? offers.map((o) => {
        const days = o.at?.toDate ? Math.floor((Date.now() - o.at.toDate().getTime()) / 864e5) : 0;
        const low = guide && o.kind === 'buy' && o.amountMax < guide[0];
        return (
          <div className="offer" key={o.id}>
            <div className="row between"><b className="small">{o.name}{o.company ? ` · ${o.company}` : ''}</b><span className="tag brand">{kindLabel(o.kind)}</span></div>
            {o.kind === 'buy' && <p className="small"><b>{formatINR(o.amountMin)} – {formatINR(o.amountMax)}</b>{low && <span className="tag warn"> Below the guide range</span>}</p>}
            <p className="small prewrap">{o.note}</p>
            <div className="row between"><span className="tiny muted">{days === 0 ? 'Today' : `${days} day${days > 1 ? 's' : ''} ago`}{days < COOLING_OFF_DAYS ? ' · still in cooling-off time' : ''}</span>
              <button className="btn btn-secondary btn-sm" disabled={busy === o.id} onClick={() => talk(o)}><Icon name="chat" size={16} />Talk to them</button></div>
          </div>
        );
      }) : <p className="muted small">No offers yet. Verified professionals can offer to mentor, partner or buy.</p>}
    </section>
  );
}

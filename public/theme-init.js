// Apply the saved light/dark choice before the page paints (avoids a white flash).
// A separate file (not inline) so the Content-Security-Policy can block all inline scripts.
try { var t = localStorage.getItem('bm_theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* storage blocked */ }

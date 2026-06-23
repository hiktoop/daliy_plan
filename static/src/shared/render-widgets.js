/* ═══════════════════════════════════════════════════════════
   render-widgets.js — Shared DOM widget helpers
   All pages use W.* to create consistent, styled elements.
   ═══════════════════════════════════════════════════════════ */

var W = (function() {

  /* ─── Page Title ─── */
  function pageTitle(icon, text) {
    var el = document.createElement('div');
    el.className = 'page-title';
    if (icon) { var i = document.createElement('span'); i.textContent = icon; el.appendChild(i); }
    if (text) el.appendChild(document.createTextNode(text));
    return el;
  }

  /* ─── Section Header ─── */
  function sectionHeader(icon, text) {
    var el = document.createElement('div');
    el.className = 'section-header';
    if (icon) { var i = document.createElement('span'); i.className = 'section-header-icon'; i.textContent = icon; el.appendChild(i); }
    if (text) { var s = document.createElement('span'); s.className = 'section-header-label'; s.textContent = text; el.appendChild(s); }
    return el;
  }

  /* ─── Empty State ─── */
  function emptyState(icon, text) {
    var el = document.createElement('div');
    el.className = 'empty-state';
    if (icon) { var i = document.createElement('div'); i.className = 'empty-icon'; i.textContent = icon; el.appendChild(i); }
    if (text) {
      // Support multiline text via <br>
      if (text.indexOf('\n') > -1) {
        var parts = text.split('\n');
        el.appendChild(document.createTextNode(parts[0]));
        for (var p = 1; p < parts.length; p++) {
          el.appendChild(document.createElement('br'));
          el.appendChild(document.createTextNode(parts[p]));
        }
      } else {
        el.appendChild(document.createTextNode(text));
      }
    }
    return el;
  }

  /* ─── Metric Card (stats display) ─── */
  function metricCard(label, value, colorClass) {
    var el = document.createElement('div');
    el.className = 'metric-card';
    var l = document.createElement('div'); l.className = 'metric-label'; l.textContent = label; el.appendChild(l);
    var v = document.createElement('div'); v.className = 'metric-value'; if (colorClass) v.classList.add(colorClass); v.textContent = value; el.appendChild(v);
    return el;
  }

  return {
    pageTitle: pageTitle,
    sectionHeader: sectionHeader,
    emptyState: emptyState,
    metricCard: metricCard
  };

})();

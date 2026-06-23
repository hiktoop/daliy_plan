/* ── Daily Quote: fetch + parse + display ── */

const QUOTES_RAW_URL = 'https://raw.githubusercontent.com/hiktoop/quotes/main/quotes.md';
const QUOTE_CACHE_KEY = 'daily_quote_cache';
const QUOTE_DATE_KEY  = 'daily_quote_date';   // YYYY-MM-DD

/* ---------- public entry ---------- */
function loadDailyQuote() {
  const el = document.getElementById('daily-quote');
  if (!el) return;

  const today = todayStr();

  // 1. session-valid cache: same day → reuse directly
  const cachedJson = sessionStorage.getItem(QUOTE_CACHE_KEY);
  const cachedDate = sessionStorage.getItem(QUOTE_DATE_KEY);
  if (cachedJson && cachedDate === today) {
    try {
      const item = JSON.parse(cachedJson);
      showQuote(el, item);
      return;
    } catch (_) { /* fall through */ }
  }

  // 2. fetch remote
  fetch(QUOTES_RAW_URL + '?_t=' + Date.now())
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(md => {
      const all = parseQuotesMD(md);
      if (all.length === 0) { el.textContent = ''; return; }
      // seed = simple hash of today's date → stable pick for the whole day
      const idx = dateHash(today) % all.length;
      const pick = all[idx];
      sessionStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(pick));
      sessionStorage.setItem(QUOTE_DATE_KEY, today);
      showQuote(el, pick);
    })
    .catch(() => {
      // 3. fetch failed: try cached value from ANY recent day (best-effort)
      if (cachedJson) {
        try { showQuote(el, JSON.parse(cachedJson)); return; } catch (_) {}
      }
      el.textContent = '';
    });
}

/* ---------- parse markdown ---------- */
function parseQuotesMD(md) {
  const lines = md.split('\n');
  const items = [];
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // section heading: ## 句子 / ## 方法论
    if (/^##\s+.+/.test(trimmed)) {
      currentSection = trimmed.replace(/^##\s+/, '').trim();
      continue;
    }

    // numbered list: "1. xxxx" or "1. xxxx —— author"
    const m = trimmed.match(/^(\d+)[\.、]\s*(.+)$/);
    if (m) {
      const text = m[2].trim();
    // try to split author / source: "text。—— Author《Source》"
      let author = '';
      let source = '';
      let body = text;
      // match: text。—— Author  or  text。——《Source》
      const dashMatch = text.match(/^(.+?)\s*[。———]+\s*(.+)$/);
      if (dashMatch) {
        body = dashMatch[1].trim();
        const rest = dashMatch[2].trim();
        // rest may be "Author《Source》" or just "Author"
        const bookMatch = rest.match(/^(.+?)《(.+?)》?$/);
        if (bookMatch) {
          author = bookMatch[1].trim();
          source = bookMatch[2].trim();
        } else {
          author = rest;
        }
      }
      items.push({
        id: currentSection + '_' + m[1],
        type: currentSection === '句子' ? 'quote' : 'methodology',
        text: body,
        author: author,
        source: source
      });
    }
  }
  return items;
}

/* ---------- display ---------- */
function showQuote(el, item) {
  const prefix = item.type === 'methodology' ? '🛠 方法论：' : '💡 ';
  const suffix = item.author ? '　—— ' + item.author : '';
  el.textContent = prefix + item.text + suffix;
  el.title = item.source ? '出处：' + item.source : '';
}

/* ---------- date-seeded stable pick ---------- */
function dateHash(dateStr) {
  // simple djb2-like hash: reproducible for the same date string
  let h = 5381;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 33 + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/* ---------- auto-init when DOM ready ---------- */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadDailyQuote);
} else {
  loadDailyQuote();
}

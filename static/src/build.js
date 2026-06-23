// build.js — Concatenate page source files into the build output
// Usage: node build.js
// Reads static/src/ → writes static/

const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DST = path.join(SRC, '..', 'build');

// Ensure build directory exists
if (!fs.existsSync(DST)) fs.mkdirSync(DST, { recursive: true });

// Page order matters — must match nav-tab order in index.html
const PAGES = ['today', 'history', 'charts', 'pomodoro', 'habits', 'knowledge'];

// Utility: read a file, return trimmed string (empty if not found)
function read(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch(e) { console.warn('Missing:', p); return ''; }
}

// Utility: write a file if content differs (skip unchanged)
function writeIfChanged(filepath, content) {
  let old = '';
  try { old = fs.readFileSync(filepath, 'utf8'); } catch(e) {}
  if (old === content) {
    console.log('  (unchanged) ' + path.basename(filepath));
    return;
  }
  fs.writeFileSync(filepath, content);
  console.log('  written     ' + path.basename(filepath));
}

// ============================================================
// 1. Build index.html
// ============================================================
console.log('Building index.html...');
let html = read(path.join(SRC, 'index.html'));
for (const page of PAGES) {
  const template = read(path.join(SRC, 'pages', page, 'template.html'));
  const marker = '<!-- INSERT:' + page + ' -->';
  const pageDiv = '<div class="page' + (page === 'today' ? ' active' : '') + '" id="page-' + page + '">\n' + template + '\n</div>';
  html = html.replace(marker, pageDiv);
}
writeIfChanged(path.join(DST, 'index.html'), html);

// ============================================================
// 2. Build render.js
// ============================================================
console.log('Building render.js...');
let renderJS = '/* ═══════════════════════════════════════════════════════\n';
renderJS += '   render.js — Auto-built from static/src/\n';
renderJS += '   DO NOT EDIT — edit pages/{page}/render.js instead\n';
renderJS += '═══════════════════════════════════════════════════════ */\n\n';
renderJS += '/* ─── Shared Utils ─── */\n\n';
renderJS += read(path.join(SRC, 'shared', 'utils.js')) + '\n';
renderJS += '/* ─── Public API ─── */\n\n';
renderJS += read(path.join(SRC, 'shared', 'render-api.js')) + '\n';

for (const page of PAGES) {
  const f = path.join(SRC, 'pages', page, 'render.js');
  if (fs.existsSync(f)) {
    renderJS += '\n/* ─── ' + page + ' Page ─── */\n\n';
    renderJS += read(f) + '\n';
  }
}
writeIfChanged(path.join(DST, 'render.js'), renderJS);

// ============================================================
// 3. Build actions.js
// ============================================================
console.log('Building actions.js...');
let actionsJS = '/* ═══════════════════════════════════════════════════════\n';
actionsJS += '   actions.js — Auto-built from static/src/\n';
actionsJS += '   DO NOT EDIT — edit pages/{page}/actions.js instead\n';
actionsJS += '═══════════════════════════════════════════════════════ */\n\n';

for (const page of PAGES) {
  const f = path.join(SRC, 'pages', page, 'actions.js');
  if (fs.existsSync(f)) {
    actionsJS += '\n/* ─── ' + page + ' Page ─── */\n\n';
    actionsJS += read(f) + '\n';
  }
}
writeIfChanged(path.join(DST, 'actions.js'), actionsJS);

// ============================================================
// 4. Copy shared files (app.js, api.js)
// ============================================================
console.log('Copying shared files...');
writeIfChanged(path.join(DST, 'app.js'), read(path.join(SRC, 'shared', 'app.js')));
writeIfChanged(path.join(DST, 'api.js'), read(path.join(SRC, 'shared', 'api.js')));

// ============================================================
// 5. Copy static assets (style.css from src, quotes.js from parent)
// ============================================================
console.log('Copying static assets...');
// style.css lives alongside the source
const styleSrc = path.join(SRC, 'style.css');
if (fs.existsSync(styleSrc)) {
  writeIfChanged(path.join(DST, 'style.css'), read(styleSrc));
} else {
  console.warn('  MISSING ' + styleSrc);
}

// quotes.js and other legacy assets from static/
const staticRoot = path.join(SRC, '..');
const assets = ['quotes.js', 'test-beep.html'];
for (const a of assets) {
  const src = path.join(staticRoot, a);
  if (fs.existsSync(src)) {
    writeIfChanged(path.join(DST, a), read(src));
  }
}

console.log('\nBuild complete!');

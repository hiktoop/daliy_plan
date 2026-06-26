/* ═══════════════════════════════════════════════════════
   app.js — Global state, constants, navigation, toast, init
   Loaded FIRST (before api/render/actions).
═══════════════════════════════════════════════════════ */

const WEEKDAYS = ['日','一','二','三','四','五','六'];
const PLAN_META = {
  long:  { label: '长期', days: null, icon: '∞' },
  week:  { label: '一周', days: 7,    icon: '⑦' },
  month: { label: '一月', days: 30,   icon: '㉚' }
};

let currentDate = null;
let charts = {};

/* ═══════ Pomodoro State ═══════ */
let pomoState = {
  running: false,
  paused: false,
  sessionId: null,
  elapsed: 0,         // seconds
  startTs: null,
  timerInterval: null,
  taskId: null,
  taskText: '',
  mode: 'stopwatch',  // 'stopwatch' | 'countdown'
  targetSec: 1500,    // countdown target (default 25 min)
  audioCtx: null,     // AudioContext 预创建，避免自动播放策略拦截
  finished: false,     // 倒计时结束，等待用户手动完成
  beepInterval: null   // 循环提示音定时器
};

function dateFromHash() {
  const h = location.hash.replace(/^#/, '');
  return /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : null;
}

/* ═══════ Date Helpers ═══════ */
function goToday() {
  currentDate = todayStr();
  history.replaceState(null, '', '#' + currentDate);
  renderToday();
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function dateLabel(str) {
  const [y,m,d] = str.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

function weekdayLabel(str) {
  const d = new Date(str + 'T00:00:00');
  const w = WEEKDAYS[d.getDay()];
  const today = todayStr();
  if (str === today) return `周${w}（今天）`;
  const yest = offsetDate(today, -1);
  if (str === yest) return `周${w}（昨天）`;
  return `周${w}`;
}

function offsetDate(str, delta) {
  const d = new Date(str + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function uid() { return Math.random().toString(36).slice(2,9); }

/* ═══════ Navigation ═══════ */

async function switchPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const tabs = document.querySelectorAll('.nav-tab');
  const map = { today: 0, stats: 1, focus: 2 };
  if (map[name] !== undefined) tabs[map[name]].classList.add('active');
  if (name === 'stats') await renderStats();
  if (name === 'today') {
    history.pushState(null, '', '#' + currentDate);
    await renderToday();
  }
  if (name === 'focus') await renderFocus();
}

/* ═══════ Toast ═══════ */

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ═══════ Init ═══════ */

// Always default to today on page load; hash is only used for browser back/forward
currentDate = todayStr();
history.replaceState(null, '', '#' + currentDate);

window.addEventListener('popstate', () => {
  const d = dateFromHash();
  if (d && d !== currentDate) {
    currentDate = d;
    renderToday();
  }
});

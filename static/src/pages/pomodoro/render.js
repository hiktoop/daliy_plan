/* render.js — Pomodoro page rendering */

async function renderPomodoro() {
  // Load task list for selector
  let tasks = [];
  try {
    const d = await API.getDay(todayStr());
    tasks = (d.morningTasks||[]).filter(t => (t.text||'').trim());
  } catch(e) {}

  const sel = document.getElementById('pomo-task-select');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- 不关联任务 --</option>';
  tasks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.text;
    if (t.id === currentVal) opt.selected = true;
    sel.appendChild(opt);
  });

  // Update task display
  if (pomoState.taskId) {
    const t = tasks.find(x => x.id === pomoState.taskId);
    if (t) {
      document.getElementById('pomo-active-task').style.display = '';
      document.getElementById('pomo-task-name').textContent = t.text;
    } else {
      document.getElementById('pomo-active-task').style.display = 'none';
    }
  } else {
    document.getElementById('pomo-active-task').style.display = 'none';
  }

  // Show/hide presets based on mode
  document.getElementById('pomo-presets').style.display =
    pomoState.mode === 'countdown' ? '' : 'none';

  // Refresh daily stats and history
  await pomoRefreshStats();
  pomoUpdateDisplay();
}

async function pomoRefreshStats() {
  const today = todayStr();
  let sessions = [], totalSec = 0;
  try {
    const res = await fetch('/api/focus/' + today).then(r => r.json());
    sessions = res.sessions || [];
    totalSec = res.total_seconds || 0;
  } catch(e) {}

  const totalMin = Math.floor(totalSec / 60);
  document.getElementById('pomo-total-time').textContent =
    totalMin >= 60 ? Math.floor(totalMin/60) + 'h ' + (totalMin%60) + 'm' : totalMin + ' 分钟';
  document.getElementById('pomo-session-count').textContent = sessions.length;

  // Average duration
  if (sessions.length > 0) {
    const avgMin = Math.floor(totalSec / sessions.length / 60);
    document.getElementById('pomo-avg-time').textContent = avgMin + ' 分钟';
  } else {
    document.getElementById('pomo-avg-time').textContent = '—';
  }

  // History table
  const tbody = document.getElementById('pomo-history-tbody');
  const table = document.getElementById('pomo-history-table');
  const empty = document.getElementById('pomo-history-empty');

  if (sessions.length === 0) {
    table.style.display = 'none';
    empty.style.display = '';
  } else {
    table.style.display = '';
    empty.style.display = 'none';
    tbody.innerHTML = sessions.map(s => {
      const d = Math.floor(s.duration / 60);
      const sec = s.duration % 60;
      const timeStr = d + '分' + (sec > 0 ? sec + '秒' : '');
      const startTime = new Date(s.start_ts * 1000).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
      const taskLabel = s.task_text ? s.task_text : '<span style="color:var(--text-3);">—</span>';
      return `<tr>
        <td style="white-space:nowrap;">${startTime}</td>
        <td style="font-weight:500;color:var(--accent-text);white-space:nowrap;">${timeStr}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${taskLabel}</td>
      </tr>`;
    }).join('');
  }
}

function pomoSelectTask() {
  const sel = document.getElementById('pomo-task-select');
  pomoState.taskId = sel.value || null;
  pomoState.taskText = sel.selectedOptions[0]?.textContent || '';
  if (pomoState.taskId) {
    document.getElementById('pomo-active-task').style.display = '';
    document.getElementById('pomo-task-name').textContent = pomoState.taskText;
  } else {
    document.getElementById('pomo-active-task').style.display = 'none';
  }
}

/* Timer display helpers */
function pomoUpdateDisplay() {
  const isCountdown = pomoState.mode === 'countdown';
  let displaySec, fraction;

  if (isCountdown) {
    if (pomoState.running) {
      displaySec = Math.max(0, pomoState.targetSec - pomoState.elapsed);
      fraction = pomoState.elapsed / pomoState.targetSec;
    } else {
      displaySec = pomoState.targetSec;
      fraction = 0;
    }
    // Countdown: ring empties (dashoffset increases)
    const circumference = 565.5;
    document.getElementById('pomo-progress').style.strokeDashoffset =
      circumference * fraction;
  } else {
    displaySec = pomoState.elapsed;
    // Stopwatch: ring fills (dashoffset decreases)
    const maxSec = 3600;
    fraction = Math.min(displaySec / maxSec, 1);
    const circumference = 565.5;
    document.getElementById('pomo-progress').style.strokeDashoffset =
      circumference * (1 - fraction);
  }

  const m = Math.floor(displaySec / 60);
  const s = displaySec % 60;
  document.getElementById('pomo-time').textContent =
    String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function pomoSetButtons(running, paused) {
  document.getElementById('pomo-btn-start').style.display = (!running && !paused) ? '' : 'none';
  document.getElementById('pomo-btn-pause').style.display = (running && !paused) ? '' : 'none';
  document.getElementById('pomo-btn-stop').style.display = (running || paused) ? '' : 'none';
  document.getElementById('pomo-btn-reset').style.display = paused ? '' : 'none';

  const isCountdown = pomoState.mode === 'countdown';
  if (isCountdown && !running && !paused) {
    document.getElementById('pomo-label').textContent =
      '倒计时 ' + pomoState.targetSec/60 + ' 分钟';
  } else {
    document.getElementById('pomo-label').textContent =
      running ? (paused ? '已暂停' : (isCountdown ? '倒计时中...' : '专注中...')) : '准备开始';
  }
}

/* Mode switching */
function pomoSetMode(mode) {
  if (pomoState.running || pomoState.paused) return; // can't switch while running
  pomoState.mode = mode;

  document.getElementById('pomo-mode-stopwatch').classList.toggle('active', mode === 'stopwatch');
  document.getElementById('pomo-mode-countdown').classList.toggle('active', mode === 'countdown');
  document.getElementById('pomo-presets').style.display =
    mode === 'countdown' ? '' : 'none';

  // Reset display
  pomoState.elapsed = 0;
  pomoUpdateDisplay();
  pomoSetButtons(false, false);
}

/* Countdown presets */
function pomoSetPreset(min) {
  pomoState.targetSec = min * 60;
  pomoState.elapsed = 0;
  document.getElementById('pomo-custom-min').value = min;

  document.querySelectorAll('.pomo-preset-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.pomo-preset-btn[data-min="${min}"]`);
  if (btn) btn.classList.add('active');

  pomoUpdateDisplay();
  pomoSetButtons(false, false);
}

function pomoSetCustom() {
  const val = parseInt(document.getElementById('pomo-custom-min').value);
  if (val > 0) {
    pomoState.targetSec = val * 60;
    pomoState.elapsed = 0;
    document.querySelectorAll('.pomo-preset-btn').forEach(b => b.classList.remove('active'));
    pomoUpdateDisplay();
    pomoSetButtons(false, false);
  }
}

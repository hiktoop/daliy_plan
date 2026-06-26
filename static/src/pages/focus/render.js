/* render.js — Focus page (Pomodoro + Habits merged) */

async function renderFocus() {
  await renderPomodoro();
  await renderHabits();
}

/* ═══════ Pomodoro ═══════ */

async function renderPomodoro() {
  let tasks = [];
  try {
    const d = await API.getDay(todayStr());
    tasks = (d.morningTasks||[]).filter(function(t) { return (t.text||'').trim(); });
  } catch(e) {}

  const sel = document.getElementById('pomo-task-select');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- 不关联任务 --</option>';
  tasks.forEach(function(t) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.text;
    if (t.id === currentVal) opt.selected = true;
    sel.appendChild(opt);
  });

  if (pomoState.taskId) {
    const t = tasks.find(function(x) { return x.id === pomoState.taskId; });
    if (t) {
      document.getElementById('pomo-active-task').style.display = '';
      document.getElementById('pomo-task-name').textContent = t.text;
    } else {
      document.getElementById('pomo-active-task').style.display = 'none';
    }
  } else {
    document.getElementById('pomo-active-task').style.display = 'none';
  }

  document.getElementById('pomo-presets').style.display =
    pomoState.mode === 'countdown' ? '' : 'none';

  await pomoRefreshStats();
  pomoUpdateDisplay();
}

async function pomoRefreshStats() {
  const today = todayStr();
  let sessions = [], totalSec = 0;
  try {
    const res = await fetch('/api/focus/' + today).then(function(r) { return r.json(); });
    sessions = res.sessions || [];
    totalSec = res.total_seconds || 0;
  } catch(e) {}

  const totalMin = Math.floor(totalSec / 60);
  document.getElementById('pomo-total-time').textContent =
    totalMin >= 60 ? Math.floor(totalMin/60) + 'h ' + (totalMin%60) + 'm' : totalMin + ' 分钟';
  document.getElementById('pomo-session-count').textContent = sessions.length;

  if (sessions.length > 0) {
    const avgMin = Math.floor(totalSec / sessions.length / 60);
    document.getElementById('pomo-avg-time').textContent = avgMin + ' 分钟';
  } else {
    document.getElementById('pomo-avg-time').textContent = '—';
  }

  const tbody = document.getElementById('pomo-history-tbody');
  const table = document.getElementById('pomo-history-table');
  const empty = document.getElementById('pomo-history-empty');

  if (sessions.length === 0) {
    table.style.display = 'none';
    empty.style.display = '';
  } else {
    table.style.display = '';
    empty.style.display = 'none';
    tbody.innerHTML = sessions.map(function(s) {
      const d = Math.floor(s.duration / 60);
      const sec = s.duration % 60;
      const timeStr = d + '分' + (sec > 0 ? sec + '秒' : '');
      const startTime = new Date(s.start_ts * 1000).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
      const taskLabel = s.task_text ? escapeHTML(s.task_text) : '<span style="color:var(--text-3);">—</span>';
      return '<tr>' +
        '<td style="white-space:nowrap;">' + startTime + '</td>' +
        '<td style="font-weight:500;color:var(--accent-text);white-space:nowrap;">' + timeStr + '</td>' +
        '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + taskLabel + '</td>' +
        '</tr>';
    }).join('');
  }
}

function pomoSelectTask() {
  const sel = document.getElementById('pomo-task-select');
  pomoState.taskId = sel.value || null;
  pomoState.taskText = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
  if (pomoState.taskId) {
    document.getElementById('pomo-active-task').style.display = '';
    document.getElementById('pomo-task-name').textContent = pomoState.taskText;
  } else {
    document.getElementById('pomo-active-task').style.display = 'none';
  }
}

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
    const circumference = 565.5;
    document.getElementById('pomo-progress').style.strokeDashoffset = circumference * fraction;
  } else {
    displaySec = pomoState.elapsed;
    const maxSec = 3600;
    fraction = Math.min(displaySec / maxSec, 1);
    const circumference = 565.5;
    document.getElementById('pomo-progress').style.strokeDashoffset = circumference * (1 - fraction);
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
    document.getElementById('pomo-label').textContent = '倒计时 ' + pomoState.targetSec/60 + ' 分钟';
  } else {
    document.getElementById('pomo-label').textContent =
      running ? (paused ? '已暂停' : (isCountdown ? '倒计时中...' : '专注中...')) : '准备开始';
  }
}

function pomoSetMode(mode) {
  if (pomoState.running || pomoState.paused) return;
  pomoState.mode = mode;

  document.getElementById('pomo-mode-stopwatch').classList.toggle('active', mode === 'stopwatch');
  document.getElementById('pomo-mode-countdown').classList.toggle('active', mode === 'countdown');
  document.getElementById('pomo-presets').style.display = mode === 'countdown' ? '' : 'none';

  pomoState.elapsed = 0;
  pomoUpdateDisplay();
  pomoSetButtons(false, false);
}

function pomoSetPreset(min) {
  pomoState.targetSec = min * 60;
  pomoState.elapsed = 0;
  document.getElementById('pomo-custom-min').value = min;

  document.querySelectorAll('.pomo-preset-btn').forEach(function(b) { b.classList.remove('active'); });
  const btn = document.querySelector('.pomo-preset-btn[data-min="' + min + '"]');
  if (btn) btn.classList.add('active');

  pomoUpdateDisplay();
  pomoSetButtons(false, false);
}

function pomoSetCustom() {
  const val = parseInt(document.getElementById('pomo-custom-min').value);
  if (val > 0) {
    pomoState.targetSec = val * 60;
    pomoState.elapsed = 0;
    document.querySelectorAll('.pomo-preset-btn').forEach(function(b) { b.classList.remove('active'); });
    pomoUpdateDisplay();
    pomoSetButtons(false, false);
  }
}

/* ═══════ Habits ═══════ */

async function renderHabits() {
  document.getElementById('habits-today-label').textContent =
    todayStr() + ' 周' + WEEKDAYS[new Date().getDay()];

  let habits = [];
  try {
    const res = await API.getHabits();
    habits = res.habits || [];
  } catch(e) {}

  const grid = document.getElementById('habits-grid');
  const empty = document.getElementById('habits-empty');
  const statsPanel = document.getElementById('habits-stats');

  if (habits.length > 0) {
    var checkedCount = habits.filter(function(h) { return h.checked_today; }).length;
    var rate = Math.round(checkedCount / habits.length * 100);
    var totalStreak = habits.reduce(function(s, h) { return s + h.streak; }, 0);
    statsPanel.style.display = '';
    statsPanel.innerHTML =
      '<div class="stats-grid">' +
        '<div class="stat-item">' +
          '<div class="stat-value" style="color:' + (rate === 100 ? 'var(--accent-text)' : rate >= 50 ? 'var(--warn)' : 'var(--text)') + ';">' + rate + '%</div>' +
          '<div class="stat-label">今日完成率</div>' +
        '</div>' +
        '<div class="stat-item">' +
          '<div class="stat-value">' + checkedCount + '/' + habits.length + '</div>' +
          '<div class="stat-label">已打卡</div>' +
        '</div>' +
        '<div class="stat-item">' +
          '<div class="stat-value">' + totalStreak + '</div>' +
          '<div class="stat-label">总连续天数</div>' +
        '</div>' +
        '<div class="stat-item">' +
          '<div class="stat-value">' + habits.length + '</div>' +
          '<div class="stat-label">总习惯数</div>' +
        '</div>' +
      '</div>';
  } else {
    statsPanel.style.display = 'none';
  }

  if (habits.length === 0) {
    grid.innerHTML = '';
    empty.style.display = '';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = habits.map(function(h) {
      const checked = h.checked_today;
      var noteHtml = '';
      if (checked && h.note_today && h.note_today.trim()) {
        noteHtml = '<div class="habit-note">💬 ' + escapeHTML(h.note_today) + '</div>';
      }
      return '<div class="habit-card" style="border-left: 3px solid ' + h.color + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
        '<span style="font-size:24px;">' + escapeHTML(h.icon) + '</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:500;font-size:14px;">' + escapeHTML(h.name) + '</div>' +
        '<div style="font-size:11px;color:var(--text-3);">' + (h.frequency === 'daily' ? '每天' : '每周') + ' · 连续 ' + h.streak + ' 天 · 最佳 ' + h.best + ' 天</div>' +
        noteHtml +
        '</div></div>' +
        '<button class="habit-check-btn' + (checked ? ' checked' : '') + '" ' +
        'style="background:' + (checked ? h.color : 'var(--surface2)') + ';color:' + (checked ? '#fff' : 'var(--text-2)') + ';flex-shrink:0;" ' +
        'onclick="toggleCheckIn(\'' + h.id + '\', ' + checked + ')">' +
        (checked ? '✓ 已打卡' : '打卡') + '</button>' +
        '</div>' +
        '<button class="habit-del-btn" onclick="archiveHabit(\'' + h.id + '\')" title="归档">&times;</button>' +
        '</div>';
    }).join('');
  }

  await renderHeatmap();
}

async function renderHeatmap() {
  const wrap = document.getElementById('habits-heatmap');
  try {
    const res = await API.getHeatmap(84);
    const data = res.heatmap || [];

    if (data.length === 0) {
      wrap.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-icon">📅</div>还没有打卡记录</div>';
      return;
    }

    const dateMap = {};
    data.forEach(function(d) {
      if (!dateMap[d.date]) dateMap[d.date] = [];
      dateMap[d.date].push(d);
    });

    const today = new Date(todayStr() + 'T00:00:00');
    const dayOfWeek = today.getDay();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));

    const weeks = [];
    for (var w = 0; w < 12; w++) {
      var week = [];
      var sunday = new Date(lastSunday);
      sunday.setDate(lastSunday.getDate() - w * 7);
      for (var d = 6; d >= 0; d--) {
        var day = new Date(sunday);
        day.setDate(sunday.getDate() - d);
        var dateStr = day.toISOString().slice(0, 10);
        var logs = dateMap[dateStr] || [];
        week.push({ date: dateStr, logs: logs, isToday: dateStr === todayStr(), isFuture: dateStr > todayStr() });
      }
      weeks.push(week);
    }
    weeks.reverse();

    var dayLabels = ['一','二','三','四','五','六','日'];
    var html = '<div style="overflow-x:auto;padding:4px 0;">';
    html += '<div style="display:flex;gap:4px;margin-bottom:4px;font-size:11px;color:var(--text-3);">';
    for (var wi = 0; wi < 12; wi++) {
      var mon = weeks[wi] ? weeks[wi][0].date.slice(5) : '';
      html += '<span style="width:20px;text-align:center;white-space:nowrap;">' + (wi % 4 === 0 ? mon : '') + '</span>';
    }
    html += '</div>';

    for (var row = 0; row < 7; row++) {
      html += '<div style="display:flex;gap:4px;margin-bottom:3px;align-items:center;">';
      html += '<span style="width:16px;font-size:10px;color:var(--text-3);text-align:right;margin-right:2px;">' + dayLabels[row] + '</span>';
      for (var wi2 = 0; wi2 < 12; wi2++) {
        var cell = weeks[wi2] ? weeks[wi2][row] : null;
        var isFuture = cell ? cell.isFuture : false;
        var isToday = cell ? cell.isToday : false;
        var count = cell ? cell.logs.length : 0;

        var bgColor = 'var(--surface2)';
        if (isFuture) {
          bgColor = 'transparent';
        } else if (count >= 4) {
          bgColor = '#639922';
        } else if (count === 3) {
          bgColor = '#97C459';
        } else if (count === 2) {
          bgColor = '#C0DD97';
        } else if (count === 1) {
          bgColor = '#EAF3DE';
        }

        var border = isToday ? 'border:1px solid var(--accent);' : '';
        var title = cell ? cell.date + ' · ' + (count > 0 ? count + ' 项打卡' : '无打卡') : '';
        html += '<div style="width:20px;height:20px;border-radius:3px;background:' + bgColor + ';' + border + 'cursor:default;flex-shrink:0;" title="' + title + '"></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    wrap.innerHTML = html;
  } catch(e) {
    wrap.innerHTML = '<div class="empty-state" style="padding:20px;color:var(--danger);">加载热力图失败</div>';
  }
}

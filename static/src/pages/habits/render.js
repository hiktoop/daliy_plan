/* render.js — Habits page rendering */

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

  // ── Overview stats ──
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

  // ── Habit cards ──
  if (habits.length === 0) {
    grid.innerHTML = '';
    empty.style.display = '';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = habits.map(h => {
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

/* ─── Review Section (in Today page) ─── */

/* render.js — History page rendering */

// View state
let historyView = localStorage.getItem('historyView') || 'table';
// Calendar navigation state
let calYear, calMonth;
async function renderHistory() {
  const days = await API.listDays();
  document.getElementById('history-count').textContent = `共 ${days.length} 条记录`;

  // Update toggle buttons
  document.querySelectorAll('#history-view-toggle .view-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === historyView);
  });

  if (historyView === 'calendar') {
    document.getElementById('history-table-card').style.display = 'none';
    document.getElementById('history-calendar-card').style.display = '';
    renderHistoryCalendar(days);
  } else {
    document.getElementById('history-calendar-card').style.display = 'none';
    document.getElementById('history-table-card').style.display = '';
    renderHistoryTable(days);
  }
}

function switchHistoryView(view) {
  historyView = view;
  localStorage.setItem('historyView', view);
  renderHistory();
}
function renderHistoryTable(days) {
  const tbody = document.getElementById('history-tbody');
  const empty = document.getElementById('history-empty');

  if (days.length === 0) {
    tbody.innerHTML = ''; empty.style.display = '';
    document.querySelector('#history-table thead').style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  document.querySelector('#history-table thead').style.display = '';

  tbody.innerHTML = '';
  days.forEach(day => {
    const tasks = (day.morningTasks||[]).filter(t => (t.text||'').trim());
    const done = tasks.filter(t => t.status === 'done').length;
    const total = tasks.length;
    const rate = total > 0 && day.savedEvening ? Math.round(done/total*100) : null;

    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.innerHTML = `<div style="font-weight:500;">${day.date.slice(5)}</div><div style="font-size:11px;color:var(--text-3);">${weekdayLabel(day.date).replace('（今天）','').replace('（昨天）','')}</div>`;

    const tdTasks = document.createElement('td');
    const preview = tasks.slice(0, 3).map(t => {
      const cls = t.status === 'done' ? 'task-cell-done' : t.status === 'partial' ? 'task-cell-partial' : t.status === 'miss' ? 'task-cell-miss' : '';
      const icon = t.status === 'done' ? '✓ ' : t.status === 'partial' ? '◑ ' : t.status === 'miss' ? '✗ ' : '· ';
      const planTag = t.plan ? ` <span style="font-size:10px;opacity:0.7;">${PLAN_META[t.plan].icon}</span>` : '';
      return `<div class="${cls}" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;">${icon}${escapeHTML(t.text)}${planTag}</div>`;
    }).join('');
    const more = tasks.length > 3 ? `<div style="font-size:11px;color:var(--text-3);">+${tasks.length-3} 项</div>` : '';
    tdTasks.innerHTML = preview + more;

    const tdRate = document.createElement('td');
    tdRate.style.textAlign = 'center';
    if (rate !== null) {
      const color = rate >= 80 ? 'var(--accent-text)' : rate >= 50 ? 'var(--warn)' : 'var(--danger)';
      tdRate.innerHTML = `<span style="font-size:15px;font-weight:500;color:${color}">${rate}%</span>`;
    } else {
      tdRate.innerHTML = `<span style="font-size:11px;color:var(--text-3)">待复盘</span>`;
    }

    const tdAct = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'expand-btn'; editBtn.textContent = '查看';
    editBtn.onclick = () => { currentDate = day.date; switchPage('today'); };
    tdAct.appendChild(editBtn);

    tr.appendChild(tdDate); tr.appendChild(tdTasks); tr.appendChild(tdRate); tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
}

/* ── Calendar View ── */

function initCalNav() {
  const today = new Date(todayStr() + 'T00:00:00');
  calYear = today.getFullYear();
  calMonth = today.getMonth() + 1; // 1-based
}

function calNavMonth(delta) {
  calMonth += delta;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  if (calMonth < 1) { calMonth = 12; calYear--; }
  renderHistory();
}

function getCalCompletionClass(dayData) {
  if (!dayData) return 'cal-empty';
  const tasks = (dayData.morningTasks||[]).filter(t => (t.text||'').trim());
  if (tasks.length === 0) return 'cal-empty';
  if (!dayData.savedEvening) return 'cal-pending';
  const done = tasks.filter(t => t.status === 'done').length;
  const rate = Math.round(done / tasks.length * 100);
  if (rate === 100) return 'cal-full';
  if (rate >= 67) return 'cal-high';
  if (rate >= 34) return 'cal-mid';
  return 'cal-low';
}

function renderHistoryCalendar(days) {
  if (!calYear || !calMonth) initCalNav();

  // Build date map for quick lookup
  const dateMap = {};
  days.forEach(d => { dateMap[d.date] = d; });

  const today = todayStr();
  document.getElementById('cal-month-label').textContent = calYear + '年' + calMonth + '月';

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // First day of month and last day
  const firstDay = new Date(calYear, calMonth - 1, 1);
  const lastDay = new Date(calYear, calMonth, 0);

  // Day of week: 0=Sun, convert to 1=Mon...7=Sun
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 7 : startDow; // Sun → 7

  // Previous month padding
  for (let i = 1; i < startDow; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell cal-other';
    cell.textContent = '';
    grid.appendChild(cell);
  }

  // Days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = calYear + '-' + String(calMonth).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const dayData = dateMap[dateStr];
    const isToday = dateStr === today;

    const cell = document.createElement('div');
    cell.className = 'cal-cell ' + getCalCompletionClass(dayData);
    if (isToday) cell.classList.add('cal-today');
    cell.textContent = d;
    cell.dataset.date = dateStr;

    // Hover tooltip
    cell.addEventListener('mouseenter', function(e) {
      showCalTooltip(dateStr, dayData, e);
    });
    cell.addEventListener('mouseleave', hideCalTooltip);

    // Click: for touch devices and navigation
    cell.addEventListener('click', function(e) {
      if (dayData) {
        // Toggle tooltip on click for touch
        const tooltip = document.getElementById('cal-tooltip');
        if (tooltip.style.display === '' && tooltip.dataset.activeDate === dateStr) {
          hideCalTooltip();
        } else {
          showCalTooltip(dateStr, dayData, e, true);
        }
      }
    });

    grid.appendChild(cell);
  }

  // Hide tooltip on scroll
  window.removeEventListener('scroll', hideCalTooltip);
  window.addEventListener('scroll', hideCalTooltip, { once: true });
}

// Track the current document click handler for cleanup
let _calCloseHandler = null;

function showCalTooltip(dateStr, dayData, event, sticky) {
  const tooltip = document.getElementById('cal-tooltip');
  if (!dayData) return;

  const tasks = (dayData.morningTasks||[]).filter(t => (t.text||'').trim());
  const dateLabel = dateStr + ' ' + weekdayLabel(dateStr).replace('（今天）','').replace('（昨天）','');

  let html = '';
  if (tasks.length === 0) {
    html = '<div class="cal-tooltip-summary">当天无任务记录</div>';
  } else {
    tasks.forEach(t => {
      let icon, iconCls, textCls;
      if (t.status === 'done') {
        icon = '✓'; iconCls = 'done'; textCls = 'cal-done-text';
      } else if (t.status === 'partial') {
        icon = '◑'; iconCls = 'partial'; textCls = 'cal-partial-text';
      } else if (t.status === 'miss') {
        icon = '✗'; iconCls = 'miss'; textCls = 'cal-miss-text';
      } else {
        icon = '·'; iconCls = 'none'; textCls = 'cal-no-text';
      }
      html += '<div class="cal-tooltip-task">' +
        '<span class="cal-task-icon ' + iconCls + '">' + icon + '</span>' +
        '<span class="cal-task-text ' + textCls + '">' + escapeHTML(t.text) + '</span>' +
        '</div>';
    });

    if (dayData.savedEvening) {
      const done = tasks.filter(t => t.status === 'done').length;
      const rate = Math.round(done / tasks.length * 100);
      const color = rate >= 80 ? 'var(--accent-text)' : rate >= 50 ? 'var(--warn)' : 'var(--danger)';
      html += '<div class="cal-tooltip-summary">完成率：<b style="color:' + color + '">' + rate + '%</b>（' + done + '/' + tasks.length + '）</div>';
    } else {
      html += '<div class="cal-tooltip-summary">尚未复盘</div>';
    }
  }

  // Click to view that day
  html += '<div style="text-align:center;margin-top:6px;font-size:11px;color:var(--blue);cursor:pointer;" onclick="currentDate=\'' + dateStr + '\';switchPage(\'today\');hideCalTooltip();">点击查看详情 →</div>';

  document.getElementById('cal-tooltip-date').textContent = dateLabel;
  document.getElementById('cal-tooltip-list').innerHTML = html;
  tooltip.dataset.activeDate = dateStr;

  // Position near the cell
  positionTooltip(event);

  tooltip.style.display = '';

  if (sticky) {
    // Clean up previous handler
    if (_calCloseHandler) {
      document.removeEventListener('click', _calCloseHandler);
      _calCloseHandler = null;
    }
    _calCloseHandler = function closeTooltip(e) {
      if (!tooltip.contains(e.target) && !e.target.closest('.cal-cell')) {
        hideCalTooltip();
        document.removeEventListener('click', _calCloseHandler);
        _calCloseHandler = null;
      }
    };
    // Delay to avoid the current click event triggering it immediately
    setTimeout(() => {
      document.addEventListener('click', _calCloseHandler);
    }, 0);
  }
}

function positionTooltip(event) {
  const tooltip = document.getElementById('cal-tooltip');
  const rect = event.target.getBoundingClientRect ? event.target.getBoundingClientRect() : null;
  if (!rect) return;

  let left = rect.left + rect.width / 2;
  let top = rect.bottom + 8;

  // Keep within viewport
  const tw = tooltip.offsetWidth || 280;
  const th = tooltip.offsetHeight || 200;

  if (left + tw / 2 > window.innerWidth - 10) left = window.innerWidth - tw / 2 - 10;
  if (left - tw / 2 < 10) left = tw / 2 + 10;
  if (top + th > window.innerHeight - 10) top = rect.top - th - 8;

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  tooltip.style.transform = 'translateX(-50%)';
}

function hideCalTooltip() {
  const tooltip = document.getElementById('cal-tooltip');
  tooltip.style.display = 'none';
  tooltip.dataset.activeDate = '';
  if (_calCloseHandler) {
    document.removeEventListener('click', _calCloseHandler);
    _calCloseHandler = null;
  }
}

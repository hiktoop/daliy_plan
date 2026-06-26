/* render.js — Stats page (History + Charts merged) */

// History view state
let historyView = localStorage.getItem('historyView') || 'table';
let calYear, calMonth;

async function renderStats() {
  await renderHistory();
  await renderCharts();
}

/* ═══════ History ═══════ */

async function renderHistory() {
  const days = await API.listDays();
  document.getElementById('history-count').textContent = '共 ' + days.length + ' 条记录';

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
    tdDate.innerHTML = '<div style="font-weight:500;">' + day.date.slice(5) + '</div><div style="font-size:11px;color:var(--text-3);">' + weekdayLabel(day.date).replace('（今天）','').replace('（昨天）','') + '</div>';

    const tdTasks = document.createElement('td');
    const preview = tasks.slice(0, 3).map(t => {
      const cls = t.status === 'done' ? 'task-cell-done' : t.status === 'partial' ? 'task-cell-partial' : t.status === 'miss' ? 'task-cell-miss' : '';
      const icon = t.status === 'done' ? '✓ ' : t.status === 'partial' ? '◑ ' : t.status === 'miss' ? '✗ ' : '· ';
      const planTag = t.plan ? ' <span style="font-size:10px;opacity:0.7;">' + PLAN_META[t.plan].icon + '</span>' : '';
      return '<div class="' + cls + '" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;">' + icon + escapeHTML(t.text) + planTag + '</div>';
    }).join('');
    const more = tasks.length > 3 ? '<div style="font-size:11px;color:var(--text-3);">+' + (tasks.length-3) + ' 项</div>' : '';
    tdTasks.innerHTML = preview + more;

    const tdRate = document.createElement('td');
    tdRate.style.textAlign = 'center';
    if (rate !== null) {
      const color = rate >= 80 ? 'var(--accent-text)' : rate >= 50 ? 'var(--warn)' : 'var(--danger)';
      tdRate.innerHTML = '<span style="font-size:15px;font-weight:500;color:' + color + '">' + rate + '%</span>';
    } else {
      tdRate.innerHTML = '<span style="font-size:11px;color:var(--text-3)">待复盘</span>';
    }

    const tdAct = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'expand-btn'; editBtn.textContent = '查看';
    editBtn.onclick = function() { currentDate = day.date; switchPage('today'); };
    tdAct.appendChild(editBtn);

    tr.appendChild(tdDate); tr.appendChild(tdTasks); tr.appendChild(tdRate); tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
}

/* ── Calendar View ── */

function initCalNav() {
  const today = new Date(todayStr() + 'T00:00:00');
  calYear = today.getFullYear();
  calMonth = today.getMonth() + 1;
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

  const dateMap = {};
  days.forEach(d => { dateMap[d.date] = d; });

  const today = todayStr();
  document.getElementById('cal-month-label').textContent = calYear + '年' + calMonth + '月';

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDay = new Date(calYear, calMonth - 1, 1);
  const lastDay = new Date(calYear, calMonth, 0);

  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 7 : startDow;

  for (let i = 1; i < startDow; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell cal-other';
    cell.textContent = '';
    grid.appendChild(cell);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = calYear + '-' + String(calMonth).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const dayData = dateMap[dateStr];
    const isToday = dateStr === today;

    const cell = document.createElement('div');
    cell.className = 'cal-cell ' + getCalCompletionClass(dayData);
    if (isToday) cell.classList.add('cal-today');
    cell.textContent = d;
    cell.dataset.date = dateStr;

    cell.addEventListener('mouseenter', function(e) {
      showCalTooltip(dateStr, dayData, e);
    });
    cell.addEventListener('mouseleave', hideCalTooltip);

    cell.addEventListener('click', function(e) {
      if (dayData) {
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

  window.removeEventListener('scroll', hideCalTooltip);
  window.addEventListener('scroll', hideCalTooltip, { once: true });
}

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

  html += '<div style="text-align:center;margin-top:6px;font-size:11px;color:var(--blue);cursor:pointer;" onclick="currentDate=\'' + dateStr + '\';switchPage(\'today\');hideCalTooltip();">点击查看详情 →</div>';

  document.getElementById('cal-tooltip-date').textContent = dateLabel;
  document.getElementById('cal-tooltip-list').innerHTML = html;
  tooltip.dataset.activeDate = dateStr;

  positionTooltip(event);
  tooltip.style.display = '';

  if (sticky) {
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
    setTimeout(function() {
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

/* ═══════ Charts ═══════ */

async function renderCharts() {
  const days = await API.listDays();
  const stats = window.DailyTasksAPI.computeStats(days);
  const totalDays = days.length;
  const reviewDays = days.filter(function(d) { return d.savedEvening; }).length;

  document.getElementById('global-metrics').innerHTML =
    '<div class="metric-card"><div class="metric-label">记录天数</div><div class="metric-value">' + totalDays + '</div></div>' +
    '<div class="metric-card"><div class="metric-label">已复盘</div><div class="metric-value">' + reviewDays + '</div></div>' +
    '<div class="metric-card"><div class="metric-label">总任务数</div><div class="metric-value">' + stats.total + '</div></div>' +
    '<div class="metric-card"><div class="metric-label">整体完成率</div><div class="metric-value ' + (stats.rate>=80?'green':stats.rate>=50?'warn':'red') + '">' + (stats.rate !== null ? stats.rate+'%' : '—') + '</div></div>';

  const reviewed = days.filter(function(d) { return d.savedEvening; }).slice(0, 30).reverse();

  // Trend chart
  destroyChart('chart-trend');
  if (reviewed.length === 0) {
    document.getElementById('chart-trend').parentElement.innerHTML = '<div class="empty-state" style="padding:50px 20px;"><div class="empty-icon">&#128202;</div>完成复盘后这里将显示趋势图</div>';
  } else {
    const labels = reviewed.map(function(d) { return d.date.slice(5); });
    const rates = reviewed.map(function(d) {
      const ts = (d.morningTasks||[]).filter(function(t) { return (t.text||'').trim(); });
      const dn = ts.filter(function(t) { return t.status === 'done'; }).length;
      return ts.length > 0 ? Math.round(dn/ts.length*100) : 0;
    });
    const pointRadius = reviewed.length <= 2 ? 8 : (reviewed.length <= 7 ? 6 : 4);
    charts['chart-trend'] = new Chart(document.getElementById('chart-trend'), {
      type: 'line',
      data: { labels: labels, datasets: [{ label: '完成率', data: rates, borderColor: '#3b6d11', backgroundColor: 'rgba(59,109,17,0.08)', fill: true, tension: 0.35, pointRadius: pointRadius, pointBackgroundColor: '#3b6d11', pointBorderColor: '#fff', pointBorderWidth: 2, pointHoverRadius: pointRadius + 2, borderWidth: 2.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return '完成率: ' + ctx.parsed.y + '%'; } } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: function(v) { return v+'%'; }, color: '#9a9a94', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { color: '#9a9a94', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } }
      }
    });
  }

  // Status pie
  destroyChart('chart-status');
  if (stats.total > 0) {
    charts['chart-status'] = new Chart(document.getElementById('chart-status'), {
      type: 'doughnut',
      data: { labels: ['完成','部分完成','未完成'], datasets: [{ data: [stats.done,stats.partial,stats.miss], backgroundColor: ['#639922','#ba7517','#a32d2d'], borderWidth: 0, hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false } } }
    });
    const parent = document.getElementById('chart-status').closest('.card');
    let legend = parent.querySelector('.custom-legend');
    if (!legend) {
      legend = document.createElement('div');
      legend.className = 'custom-legend';
      legend.style.cssText = 'display:flex;gap:10px;margin-top:10px;font-size:11px;color:var(--text-2);flex-wrap:wrap;justify-content:center;';
      legend.innerHTML =
        '<span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#639922;display:inline-block;"></span>完成 ' + stats.done + '</span>' +
        '<span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#ba7517;display:inline-block;"></span>部分 ' + stats.partial + '</span>' +
        '<span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#a32d2d;display:inline-block;"></span>未完成 ' + stats.miss + '</span>';
      parent.appendChild(legend);
    }
  }

  // Daily count bar
  destroyChart('chart-count');
  if (reviewed.length > 0) {
    const countLabels = reviewed.map(function(d) { return d.date.slice(5); });
    const countData = reviewed.map(function(d) { return (d.morningTasks||[]).filter(function(t) { return (t.text||'').trim(); }).length; });
    charts['chart-count'] = new Chart(document.getElementById('chart-count'), {
      type: 'bar',
      data: { labels: countLabels, datasets: [{ label: '任务数', data: countData, backgroundColor: '#b5d4f4', borderColor: '#185fa5', borderWidth: 1, borderRadius: 3, maxBarThickness: 32, barPercentage: 0.7 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return '任务数: ' + ctx.parsed.y; } } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#9a9a94', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { color: '#9a9a94', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } } }
    });
  }

  renderEbbinghausCurve();
}

/* ─── Ebbinghaus Curve ─── */

function renderEbbinghausCurve() {
  destroyChart('chart-ebbinghaus');

  var maxDay = 62;
  var labels = [];
  var rawData = [];
  var withReviewData = [];
  var reviewMarkers = [];
  var reviewVlines = [];

  var intervals = [1, 2, 4, 7, 15, 30];
  var reviewDays = [0];
  var cumDay = 0;
  for (var i = 0; i < intervals.length; i++) {
    cumDay += intervals[i];
    reviewDays.push(cumDay);
  }

  var stabilities = [1.2, 2.5, 6, 14, 40, 100, 250];
  var currentStability = stabilities[0];
  var segmentStart = 0;
  var ri = 0;

  for (var d = 0; d <= maxDay; d++) {
    labels.push(String(d));
    rawData.push(Math.max(0, Math.round(100 * Math.exp(-d / 2.2))));

    var daysSinceLastReview = d - segmentStart;
    var retention = Math.round(100 * Math.exp(-daysSinceLastReview / currentStability));

    if (ri < reviewDays.length && d === reviewDays[ri]) {
      withReviewData.push(100);
      reviewMarkers.push({ x: d, y: 100 });
      reviewVlines.push({ x: d });
      segmentStart = d;
      currentStability = stabilities[Math.min(ri, stabilities.length - 1)];
      ri++;
    } else {
      withReviewData.push(retention);
    }
  }

  var datasets = [
    {
      label: '不复习',
      data: rawData,
      borderColor: '#a32d2d',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [5, 3],
      pointRadius: 0,
      tension: 0.4
    },
    {
      label: '按时复习（艾宾浩斯）',
      data: withReviewData,
      borderColor: '#3b6d11',
      backgroundColor: 'rgba(59,109,17,0.06)',
      fill: true,
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.35
    },
    {
      label: '复习节点',
      data: reviewMarkers,
      type: 'scatter',
      backgroundColor: '#f0a030',
      borderColor: '#fff',
      borderWidth: 1.5,
      pointRadius: 6,
      pointStyle: 'rectRounded',
      showLine: false,
      order: 1
    }
  ];

  charts['chart-ebbinghaus'] = new Chart(document.getElementById('chart-ebbinghaus'), {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            padding: 16,
            font: { size: 11 },
            color: '#5a5a56'
          }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              if (ctx.dataset.label === '复习节点') {
                return '复习节点：第' + ctx.parsed.x + '天';
              }
              return ctx.dataset.label + '：' + ctx.parsed.y + '%';
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '天数', color: '#9a9a94', font: { size: 11 } },
          ticks: { color: '#9a9a94', font: { size: 10 }, maxTicksLimit: 15 },
          grid: { display: false },
          min: 0,
          max: maxDay
        },
        y: {
          title: { display: true, text: '记忆保持率', color: '#9a9a94', font: { size: 11 } },
          min: 0, max: 105,
          ticks: { callback: function(v) { return v + '%'; }, color: '#9a9a94', font: { size: 11 }, stepSize: 20 },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    },
    plugins: [{
      id: 'reviewVertLines',
      afterDraw: function(chart) {
        var ctx = chart.ctx;
        var xAxis = chart.scales.x;
        var yAxis = chart.scales.y;
        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(240,160,48,0.35)';
        ctx.lineWidth = 1;
        reviewVlines.forEach(function(vl) {
          var x = xAxis.getPixelForValue(vl.x);
          ctx.beginPath();
          ctx.moveTo(x, yAxis.top);
          ctx.lineTo(x, yAxis.bottom);
          ctx.stroke();
        });
        ctx.restore();
      }
    }]
  });
}

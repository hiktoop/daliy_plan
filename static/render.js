/* ═══════════════════════════════════════════════════════
   render.js — All rendering functions
   Depends on: app.js, api.js
═══════════════════════════════════════════════════════ */

/* ─── Public API (for future extensions) ─── */

window.DailyTasksAPI = {
  async getAllData() { return API.listDays(); },
  async getWeekData(isoWeekStr) {
    const all = await API.listDays();
    if (!isoWeekStr) {
      const today = new Date(todayStr() + 'T00:00:00');
      const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const mon = new Date(today); mon.setDate(today.getDate() - dow);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return all.filter(d => d.date >= _fmt(mon) && d.date <= _fmt(sun));
    }
    const [y, w] = isoWeekStr.split('-W').map(Number);
    const jan4 = new Date(y, 0, 4);
    const mon = new Date(jan4); mon.setDate(jan4.getDate() - ((jan4.getDay()||7)-1) + (w-1)*7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return all.filter(d => d.date >= _fmt(mon) && d.date <= _fmt(sun));
  },
  async getMonthData(yearMonth) {
    const prefix = yearMonth || todayStr().slice(0,7);
    return (await API.listDays()).filter(d => d.date.startsWith(prefix));
  },
  computeStats(days) {
    let total = 0, done = 0, partial = 0, miss = 0;
    days.forEach(day => {
      (day.morningTasks||[]).forEach(t => {
        if (!(t.text||'').trim()) return;
        total++;
        if (t.status === 'done') done++;
        else if (t.status === 'partial') partial++;
        else if (t.status === 'miss') miss++;
      });
    });
    return { total, done, partial, miss, rate: total > 0 ? Math.round(done/total*100) : null };
  },
  async getRecurringTasks() { return (await API.getPlans()).plans; }
};
function _fmt(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

/* ─── Today Page ─── */

async function renderToday() {
  document.getElementById('today-date-label').textContent = dateLabel(currentDate);
  document.getElementById('today-weekday').textContent = weekdayLabel(currentDate);

  const isToday = currentDate === todayStr();

  // Nav button state
  let hasPrev = false, hasNext = false;
  try {
    const daysList = await API.listDays();
    const savedDates = daysList.map(d => d.date);
    hasPrev = savedDates.some(d => d < currentDate);
    hasNext = savedDates.some(d => d > currentDate);
  } catch(e) {}
  document.getElementById('btn-prev-day').disabled = !hasPrev;
  // Next is enabled if not today (allows navigating back to today)
  // or if there are saved dates ahead
  document.getElementById('btn-next-day').disabled = isToday;
  document.getElementById('btn-today').disabled = isToday;

  let data = await API.getDay(currentDate);
  const isNew = data._new;
  delete data._new;

  // Past date with no saved data → empty state
  if (!isToday && isNew) {
    document.getElementById('morning-empty-msg').style.display = '';
    document.getElementById('morning-task-list').style.display = 'none';
    document.getElementById('add-task-btn').style.display = 'none';
    document.getElementById('morning-note-wrap').style.display = 'none';
    document.getElementById('btn-save-morning').style.display = 'none';
    document.getElementById('morning-hint').textContent = '';
    document.getElementById('card-evening').style.display = 'none';
    return;
  }
  document.getElementById('morning-empty-msg').style.display = 'none';
  document.getElementById('morning-task-list').style.display = '';
  document.getElementById('morning-note-wrap').style.display = '';
  document.getElementById('card-evening').style.display = '';

  // Auto-save for new today
  if (isNew && isToday) await API.saveDay(currentDate, data);

  // Sort: habits first, then tasks (mutate in place so DOM sync works)
  (data.morningTasks||[]).sort((a, b) => {
    const aH = (a.kind||'task') === 'habit' ? 0 : 1;
    const bH = (b.kind||'task') === 'habit' ? 0 : 1;
    return aH - bH;
  });

  // Morning
  const savedMorning = !!data.savedMorning;
  const ul = document.getElementById('morning-task-list');
  ul.innerHTML = '';
  await renderMorningTasks(ul, data, savedMorning);
  document.getElementById('btn-save-morning').style.display = savedMorning ? 'none' : '';
  document.getElementById('add-task-area').style.display = savedMorning ? 'none' : ((data.morningTasks||[]).length >= 10 ? 'none' : '');
  document.getElementById('morning-note').readOnly = savedMorning;
  document.getElementById('morning-note').value = data.morningNote || '';
  document.getElementById('morning-hint').textContent = savedMorning ? '已保存 ✓' : `${(data.morningTasks||[]).length}/10 项`;

  // Evening
  if (!data.savedMorning) {
    document.getElementById('evening-no-plan').style.display = '';
    document.getElementById('evening-form').style.display = 'none';
    document.getElementById('evening-summary').style.display = 'none';
  } else {
    document.getElementById('evening-no-plan').style.display = 'none';
    if (data.savedEvening) {
      document.getElementById('evening-form').style.display = 'none';
      document.getElementById('evening-summary').style.display = '';
      renderEveningSummary(data);
    } else {
      document.getElementById('evening-form').style.display = '';
      document.getElementById('evening-summary').style.display = 'none';
      renderEveningForm(data);
    }
  }
}

async function renderMorningTasks(ul, data, savedMorning) {
  let streaks = {};
  try {
    const plansRes = await API.getPlans();
    plansRes.plans.forEach(p => { streaks[p.id] = p.streak || {}; });
  } catch(e) {}
  (data.morningTasks||[]).forEach((task, i) => renderMorningItem(ul, task, i, data, streaks, savedMorning));
}

function renderMorningItem(ul, task, index, data, streaks, savedMorning) {
  const li = document.createElement('li');
  li.className = 'task-item' + ((task.kind||'task') === 'habit' ? ' task-habit' : '');
  li.dataset.id = task.id;

  const isToday = currentDate === todayStr();
  const readOnly = !isToday || savedMorning;

  const num = document.createElement('div');
  num.className = 'task-num';
  if (task.plan) {
    const colors = {
      long:  'background:#d4e6fa;color:#0d4f8a;border:0.5px solid #8bb8e0;',
      week:  'background:#fce4d6;color:#a64e0a;border:0.5px solid #f0b080;',
      month: 'background:#e0d4f5;color:#5c2d91;border:0.5px solid #b595d8;'
    };
    num.style.cssText = `min-width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:500;flex-shrink:0;margin-top:2px;${colors[task.plan]||colors.long}`;
    num.textContent = PLAN_META[task.plan].icon;
    num.title = PLAN_META[task.plan].label;
  } else {
    num.textContent = index + 1;
  }

  const content = document.createElement('div');
  content.className = 'task-content';

  const inputRow = document.createElement('div');
  inputRow.style.cssText = 'display:flex;align-items:flex-start;gap:6px;';
  const input = document.createElement('textarea');
  input.className = 'task-input';
  input.value = task.text || '';
  input.placeholder = `事项 ${index+1}`;
  input.rows = 1;
  if (readOnly) {
    input.readOnly = true;
    input.style.color = 'var(--text-2)';
    input.style.cursor = 'default';
    input.title = savedMorning ? '早间计划已保存，不可修改' : '历史记录不可修改';
  }
  input.addEventListener('input', function() {
    this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';
  });
  if (!readOnly) {
    input.addEventListener('keydown', async function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const d = await API.getDay(currentDate);
        if ((d.morningTasks||[]).length < 10) addTask();
      }
    });
  }
  inputRow.appendChild(input);
  content.appendChild(inputRow);

  // Plan buttons
  const planRow = document.createElement('div');
  planRow.className = 'plan-group';
  if (readOnly) {
    const tag = document.createElement('span');
    tag.className = 'plan-tag ' + (task.plan || '');
    tag.textContent = task.plan ? (PLAN_META[task.plan].icon + ' ' + PLAN_META[task.plan].label) : '';
    planRow.appendChild(tag);
  } else {
    ['long','week','month'].forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'plan-btn';
      if (task.plan === type) btn.classList.add('active-' + type);
      btn.textContent = PLAN_META[type].label;
      btn.title = PLAN_META[type].days ? `在接下来的 ${PLAN_META[type].days} 天内每天出现` : '每天都出现';
      btn.onclick = () => setPlan(task.id, type);
      planRow.appendChild(btn);
    });
  }

  const streakSpan = document.createElement('span');
  streakSpan.className = 'plan-streak';
  if (task.plan && task.planId) {
    const st = streaks[task.planId] || { current: 0, best: 0 };
    if (st.current > 0) {
      streakSpan.textContent = `连续 ${st.current} 天`;
      streakSpan.classList.add('has-streak');
      streakSpan.title = `最长连续 ${st.best} 天`;
    } else if (st.best > 0) {
      streakSpan.textContent = `连续 0 天`;
      streakSpan.classList.add('is-zero');
      streakSpan.title = `最长连续 ${st.best} 天`;
    } else {
      streakSpan.textContent = '连续 0 天';
    }
  }
  planRow.appendChild(streakSpan);
  content.appendChild(planRow);

  const del = document.createElement('button');
  del.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-3);font-size:13px;padding:0 4px;margin-top:3px;flex-shrink:0;';
  del.innerHTML = '&#215;'; del.title = '删除';
  del.onclick = () => deleteTask(task.id);
  if (readOnly) del.style.visibility = 'hidden';

  li.appendChild(num); li.appendChild(content); li.appendChild(del);
  ul.appendChild(li);
  setTimeout(() => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; }, 0);
}

function renderEveningForm(data) {
  const ul = document.getElementById('evening-task-list');
  ul.innerHTML = '';
  const realTasks = (data.morningTasks||[]).filter(t => (t.text||'').trim());
  const habits = realTasks.filter(t => (t.kind||'task') === 'habit');
  const tasks = realTasks.filter(t => (t.kind||'task') !== 'habit');

  function renderOne(task) {
    const li = document.createElement('li');
    li.className = 'task-item' + ((task.kind||'task') === 'habit' ? ' task-habit' : '');
    li.dataset.id = task.id;
    const num = document.createElement('div');
    num.className = 'task-num';
    if ((task.kind||'task') === 'habit') {
      num.textContent = '🌀';
      num.title = '习惯';
      num.style.cssText = 'min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;margin-top:2px;';
    } else {
      num.textContent = tasks.indexOf(task) + 1;
    }
    const content = document.createElement('div');
    content.className = 'task-content';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:14px;color:var(--text);margin-bottom:4px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
    label.textContent = task.text;
    if (task.plan) {
      const tag = document.createElement('span');
      tag.className = 'plan-tag ' + task.plan;
      tag.textContent = PLAN_META[task.plan].icon + ' ' + PLAN_META[task.plan].label;
      label.appendChild(tag);
    }
    content.appendChild(label);
    const statusGroup = document.createElement('div');
    statusGroup.className = 'status-group';
    [
      { value: 'done',    label: '✓ 完成' },
      { value: 'partial', label: '◑ 部分完成' },
      { value: 'miss',    label: '✗ 未完成' }
    ].forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'status-btn';
      if (task.status === opt.value) btn.classList.add('selected-' + opt.value);
      btn.textContent = opt.label;
      btn.onclick = async () => {
        statusGroup.querySelectorAll('.status-btn').forEach(b => b.className = 'status-btn');
        btn.classList.add('selected-' + opt.value);
        const d = await API.getDay(currentDate);
        const t = (d.morningTasks||[]).find(x => x.id === task.id);
        if (t) { t.status = opt.value; await API.saveDay(currentDate, d); }
      };
      statusGroup.appendChild(btn);
    });
    content.appendChild(statusGroup);
    li.appendChild(num); li.appendChild(content);
    ul.appendChild(li);
  }

  if (habits.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'section-label';
    sep.textContent = '🌀 习惯';
    ul.appendChild(sep);
    habits.forEach(t => renderOne(t));
  }
  if (tasks.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'section-label';
    sep.textContent = '📋 事项';
    ul.appendChild(sep);
    tasks.forEach(t => renderOne(t));
  }
  document.getElementById('evening-note').value = data.eveningNote || '';
}

function renderEveningSummary(data) {
  const tasks = (data.morningTasks||[]).filter(t => (t.text||'').trim());
  const habits = tasks.filter(t => (t.kind||'task') === 'habit');
  const plainTasks = tasks.filter(t => (t.kind||'task') !== 'habit');

  const done = tasks.filter(t => t.status === 'done').length;
  const partial = tasks.filter(t => t.status === 'partial').length;
  const miss = tasks.filter(t => t.status === 'miss').length;
  const total = tasks.length;
  const rate = total > 0 ? Math.round(done/total*100) : 0;

  let habitMetric = '';
  if (habits.length > 0) {
    const hDone = habits.filter(t => t.status === 'done').length;
    const hRate = Math.round(hDone/habits.length*100);
    habitMetric = `<div class="metric-card"><div class="metric-label">习惯完成率</div><div class="metric-value ${hRate>=80?'green':hRate>=50?'warn':'red'}">${hRate}%</div></div>`;
  }

  document.getElementById('summary-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">完成率</div><div class="metric-value ${rate>=80?'green':rate>=50?'warn':'red'}">${rate}%</div></div>
    <div class="metric-card"><div class="metric-label">已完成</div><div class="metric-value green">${done}</div></div>
    <div class="metric-card"><div class="metric-label">部分完成</div><div class="metric-value warn">${partial}</div></div>
    <div class="metric-card"><div class="metric-label">未完成</div><div class="metric-value red">${miss}</div></div>
    ${habitMetric}
  `;

  const chipsEl = document.getElementById('summary-task-chips');
  chipsEl.innerHTML = '';

  if (habits.length > 0) {
    const hLabel = document.createElement('div');
    hLabel.style.cssText = 'font-size:11px;color:var(--text-3);margin:8px 0 4px;';
    hLabel.textContent = '🌀 习惯';
    chipsEl.appendChild(hLabel);
    const hRow = document.createElement('div');
    hRow.className = 'chip-row';
    habits.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'chip chip-' + (t.status || 'none');
      chip.textContent = (t.text||'').length > 16 ? t.text.slice(0,15)+'…' : t.text;
      chip.title = t.text; hRow.appendChild(chip);
    });
    chipsEl.appendChild(hRow);
  }

  if (plainTasks.length > 0) {
    const tLabel = document.createElement('div');
    tLabel.style.cssText = 'font-size:11px;color:var(--text-3);margin:8px 0 4px;';
    tLabel.textContent = '📋 事项';
    chipsEl.appendChild(tLabel);
    const tRow = document.createElement('div');
    tRow.className = 'chip-row';
    plainTasks.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'chip chip-' + (t.status || 'none');
      chip.textContent = (t.text||'').length > 16 ? t.text.slice(0,15)+'…' : t.text;
      chip.title = t.text; tRow.appendChild(chip);
    });
    chipsEl.appendChild(tRow);
  }

  if (data.eveningNote) {
    const note = document.createElement('div');
    note.style.cssText = 'margin-top:10px;font-size:13px;color:var(--text-2);border-left:2px solid var(--border-md);padding-left:10px;';
    note.textContent = data.eveningNote; chipsEl.appendChild(note);
  }
}

function updateAddBtn(count) {
  const area = document.getElementById('add-task-area');
  if (area) area.style.display = count >= 10 ? 'none' : '';
  const hint = document.getElementById('morning-hint');
  if (hint) hint.textContent = count >= 10 ? '最多 10 项' : `${count}/10 项`;
}

/* ─── History Page ─── */

async function renderHistory() {
  const days = await API.listDays();
  const tbody = document.getElementById('history-tbody');
  const empty = document.getElementById('history-empty');
  document.getElementById('history-count').textContent = `共 ${days.length} 条记录`;

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
      return `<div class="${cls}" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;">${icon}${t.text}${planTag}</div>`;
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

/* ─── Charts Page ─── */

async function renderCharts() {
  const days = await API.listDays();
  const stats = window.DailyTasksAPI.computeStats(days);
  const totalDays = days.length;
  const reviewDays = days.filter(d => d.savedEvening).length;

  document.getElementById('global-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">记录天数</div><div class="metric-value">${totalDays}</div></div>
    <div class="metric-card"><div class="metric-label">已复盘</div><div class="metric-value">${reviewDays}</div></div>
    <div class="metric-card"><div class="metric-label">总任务数</div><div class="metric-value">${stats.total}</div></div>
    <div class="metric-card"><div class="metric-label">整体完成率</div><div class="metric-value ${stats.rate>=80?'green':stats.rate>=50?'warn':'red'}">${stats.rate !== null ? stats.rate+'%' : '—'}</div></div>
  `;

  const reviewed = days.filter(d => d.savedEvening).slice(0, 30).reverse();

  // Trend chart
  destroyChart('chart-trend');
  if (reviewed.length === 0) {
    document.getElementById('chart-trend').parentElement.innerHTML = '<div class="empty-state" style="padding:50px 20px;"><div class="empty-icon">&#128202;</div>完成复盘后这里将显示趋势图</div>';
  } else {
    const labels = reviewed.map(d => d.date.slice(5));
    const rates = reviewed.map(d => {
      const ts = (d.morningTasks||[]).filter(t => (t.text||'').trim());
      const dn = ts.filter(t => t.status === 'done').length;
      return ts.length > 0 ? Math.round(dn/ts.length*100) : 0;
    });
    charts['chart-trend'] = new Chart(document.getElementById('chart-trend'), {
      type: 'line',
      data: { labels, datasets: [{ label: '完成率', data: rates, borderColor: '#3b6d11', backgroundColor: 'rgba(59,109,17,0.08)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#3b6d11', borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { min: 0, max: 100, ticks: { callback: v => v+'%', color: '#9a9a94', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { color: '#9a9a94', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 15 }, grid: { display: false } } }
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
      legend.innerHTML = `
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#639922;display:inline-block;"></span>完成 ${stats.done}</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#ba7517;display:inline-block;"></span>部分 ${stats.partial}</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#a32d2d;display:inline-block;"></span>未完成 ${stats.miss}</span>`;
      parent.appendChild(legend);
    }
  }

  // Daily count bar
  destroyChart('chart-count');
  if (reviewed.length > 0) {
    const countLabels = reviewed.map(d => d.date.slice(5));
    const countData = reviewed.map(d => (d.morningTasks||[]).filter(t => (t.text||'').trim()).length);
    charts['chart-count'] = new Chart(document.getElementById('chart-count'), {
      type: 'bar',
      data: { labels: countLabels, datasets: [{ label: '任务数', data: countData, backgroundColor: '#b5d4f4', borderColor: '#185fa5', borderWidth: 1, borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#9a9a94', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { color: '#9a9a94', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } } }
    });
  }
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

/* ─── Pomodoro Page ─── */

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

  // Refresh daily stats and history
  await pomoRefreshStats();
}

async function pomoRefreshStats() {
  const today = todayStr();
  let sessions = [], totalSec = 0;
  try {
    const res = await fetch('/api/focus/' + today).then(r => r.json());
    sessions = res.sessions || [];
    totalSec = res.total_seconds || 0;
  } catch(e) {}

  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  document.getElementById('pomo-total-time').textContent = min + ' 分' + (sec > 0 ? ' ' + sec + '秒' : '');
  document.getElementById('pomo-session-count').textContent = sessions.length;

  // History list
  const list = document.getElementById('pomo-history-list');
  if (sessions.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⏱</div>还没有专注记录，开始你的第一次计时吧</div>';
  } else {
    list.innerHTML = sessions.map(s => {
      const d = Math.floor(s.duration / 60);
      const sec = s.duration % 60;
      const timeStr = d + '分' + sec + '秒';
      const startTime = new Date(s.start_ts * 1000).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
      const taskLabel = s.task_text ? ' — ' + s.task_text : '';
      const noteStr = s.note ? '<div style="font-size:11px;color:var(--text-3);margin-top:2px;">' + s.note + '</div>' : '';
      return `<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid var(--border);">
        <div>
          <div style="font-size:13px;color:var(--text);">${startTime}${taskLabel}</div>
          ${noteStr}
        </div>
        <div style="font-size:14px;font-weight:500;color:var(--accent-text);white-space:nowrap;">${timeStr}</div>
      </div>`;
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
  const sec = pomoState.elapsed;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  document.getElementById('pomo-time').textContent =
    String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');

  // SVG ring progress — full circle is 60 min = 3600 sec
  const maxSec = 3600;
  const fraction = Math.min(sec / maxSec, 1);
  const circumference = 565.5; // 2*PI*90
  document.getElementById('pomo-progress').style.strokeDashoffset =
    circumference * (1 - fraction);
}

function pomoSetButtons(running, paused) {
  document.getElementById('pomo-btn-start').style.display = (!running && !paused) ? '' : 'none';
  document.getElementById('pomo-btn-pause').style.display = (running && !paused) ? '' : 'none';
  document.getElementById('pomo-btn-stop').style.display = (running || paused) ? '' : 'none';
  document.getElementById('pomo-btn-reset').style.display = paused ? '' : 'none';
  document.getElementById('pomo-label').textContent =
    running ? (paused ? '已暂停' : '专注中...') : '准备开始';
}

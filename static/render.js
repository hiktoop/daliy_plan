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

  // Sort: reviews first, then habits, then tasks
  const allTasks = data.morningTasks || [];

  // Separate review tasks and regular tasks
  const reviewTasks = allTasks.filter(t => t.itemType === 'review');
  const regularTasks = allTasks.filter(t => t.itemType !== 'review');

  // Show due reviews in the review section
  renderReviewSection(reviewTasks);

  // Update counters etc with regular tasks only
  regularTasks.sort((a, b) => {
    const aH = (a.kind||'task') === 'habit' ? 0 : 1;
    const bH = (b.kind||'task') === 'habit' ? 0 : 1;
    return aH - bH;
  });
  // Replace morningTasks with regular tasks only (reviews handled separately)
  data.morningTasks = regularTasks;

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
  // Split into knowledge / regular for grouped display
  var all = data.morningTasks || [];
  var knowledgeTasks = all.filter(function(t) { return t.itemType === 'knowledge'; });
  var regularTasks = all.filter(function(t) { return t.itemType !== 'knowledge'; });

  function addSection(label, tasks) {
    if (tasks.length === 0) return;
    var sep = document.createElement('div');
    sep.className = 'section-label';
    sep.textContent = label;
    ul.appendChild(sep);
    tasks.forEach(function(task, i) { renderMorningItem(ul, task, i, data, streaks, savedMorning); });
  }

  addSection('📚 知识', knowledgeTasks);
  // Divider between 知识 and 事项
  if (knowledgeTasks.length > 0 && regularTasks.length > 0) {
    var divider = document.createElement('div');
    divider.className = 'section-divider';
    ul.appendChild(divider);
  }
  addSection('📋 事项', regularTasks);
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

  // Knowledge task: source URL link/button (inline with textarea)
  if (task.itemType === 'knowledge') {
    const linkWrap = document.createElement('span');
    linkWrap.style.cssText = 'flex-shrink:0;margin-top:4px;';
    const hasUrl = task.sourceUrl && task.sourceUrl.trim();
    if (hasUrl) {
      const linkBtn = document.createElement('a');
      linkBtn.href = task.sourceUrl;
      linkBtn.target = '_blank';
      linkBtn.rel = 'noopener';
      linkBtn.className = 'task-url-btn has-url';
      linkBtn.title = '打开学习资料：' + task.sourceUrl;
      linkBtn.innerHTML = '🔗';
      linkBtn.onclick = function(e) { e.stopPropagation(); };
      linkWrap.appendChild(linkBtn);
    } else if (!readOnly) {
      const addUrlBtn = document.createElement('button');
      addUrlBtn.className = 'task-url-btn';
      addUrlBtn.title = '贴上学习资料链接，复习时一键打开';
      addUrlBtn.innerHTML = '🔗';
      addUrlBtn.onclick = function(e) {
        e.stopPropagation();
        showUrlInput(linkWrap, task.id);
      };
      linkWrap.appendChild(addUrlBtn);
    }
    inputRow.appendChild(linkWrap);
  }

  content.appendChild(inputRow);

  // Type toggle (知识/事项) — replaces old plan buttons
  const typeRow = document.createElement('div');
  typeRow.className = 'type-group';
  if (readOnly) {
    // Read-only: show type tag + compact schedule
    if (task.itemType === 'knowledge') {
      var kTag = document.createElement('span');
      kTag.className = 'type-tag knowledge-tag';
      kTag.textContent = '📚 知识';
      typeRow.appendChild(kTag);
      // Compact Ebbinghaus schedule inline
      var sched = document.createElement('span');
      sched.className = 'eb-compact';
      sched.textContent = '（SM-2 动态复习）';
      sched.title = '艾宾浩斯复习时间表：间隔根据记忆效果动态调整';
      typeRow.appendChild(sched);
    } else {
      var tTag = document.createElement('span');
      tTag.className = 'type-tag task-tag';
      tTag.textContent = '事项';
      typeRow.appendChild(tTag);
    }
  } else {
    // Edit mode: toggle buttons
    var isKnowledge = task.itemType === 'knowledge';
    var taskBtn = document.createElement('button');
    taskBtn.className = 'type-btn' + (!isKnowledge ? ' active-task' : '');
    taskBtn.textContent = '事项';
    taskBtn.onclick = function() { toggleTaskType(task.id, 'task'); };
    typeRow.appendChild(taskBtn);

    var kBtn = document.createElement('button');
    kBtn.className = 'type-btn' + (isKnowledge ? ' active-knowledge' : '');
    kBtn.textContent = '📚 知识';
    kBtn.onclick = function() { toggleTaskType(task.id, 'knowledge'); };
    typeRow.appendChild(kBtn);
    if (isKnowledge) {
      var sched = document.createElement('span');
      sched.className = 'eb-compact';
      sched.textContent = '（1/2/4/7/15/30天）';
      sched.title = '艾宾浩斯复习时间表';
      typeRow.appendChild(sched);
    }
  }
  content.appendChild(typeRow);

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
  const knowledgeTasks = tasks.filter(t => t.itemType === 'knowledge');
  const plainTasks = tasks.filter(t => t.itemType !== 'knowledge');

  function renderOne(task, idx) {
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
      num.textContent = idx + 1;
    }
    const content = document.createElement('div');
    content.className = 'task-content';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:14px;color:var(--text);margin-bottom:4px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
    label.textContent = task.text;
    if (task.itemType === 'knowledge') {
      const kbTag = document.createElement('span');
      kbTag.className = 'type-tag knowledge-tag';
      kbTag.textContent = '📚 知识';
      label.appendChild(kbTag);
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

    // Per-task evening note
    const noteWrap = document.createElement('div');
    noteWrap.style.cssText = 'margin-top:8px;';
    const noteInput = document.createElement('textarea');
    noteInput.className = 'evening-task-note';
    noteInput.placeholder = '备注（可选）…';
    noteInput.rows = 1;
    noteInput.value = task.eveningNote || '';
    noteInput.addEventListener('input', function() {
      this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';
    });
    noteWrap.appendChild(noteInput);
    content.appendChild(noteWrap);

    li.appendChild(num); li.appendChild(content);
    ul.appendChild(li);
  }

  if (habits.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'section-label';
    sep.textContent = '🌀 习惯';
    ul.appendChild(sep);
    habits.forEach(t => renderOne(t, habits.indexOf(t)));
  }
  if (knowledgeTasks.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'section-label';
    sep.textContent = '📚 知识';
    ul.appendChild(sep);
    knowledgeTasks.forEach(function(t, i) { renderOne(t, i); });
  }
  if (knowledgeTasks.length > 0 && plainTasks.length > 0) {
    var divider = document.createElement('div');
    divider.className = 'section-divider';
    ul.appendChild(divider);
  }
  if (plainTasks.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'section-label';
    sep.textContent = '📋 事项';
    ul.appendChild(sep);
    plainTasks.forEach(function(t, i) { renderOne(t, i); });
  }
  document.getElementById('evening-note').value = data.eveningNote || '';
}

function renderEveningSummary(data) {
  const tasks = (data.morningTasks||[]).filter(t => (t.text||'').trim());
  const habits = tasks.filter(t => (t.kind||'task') === 'habit');
  const plainTasks = tasks.filter(t => (t.kind||'task') !== 'habit');
  const knowledgeTasks = plainTasks.filter(t => t.itemType === 'knowledge');
  const regularTasks = plainTasks.filter(t => t.itemType !== 'knowledge');

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

  function renderChipSection(label, taskList) {
    if (taskList.length === 0) return;
    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:11px;color:var(--text-3);margin:8px 0 4px;';
    lbl.textContent = label;
    chipsEl.appendChild(lbl);
    var row = document.createElement('div');
    row.className = 'chip-row';
    taskList.forEach(function(t) {
      var chip = document.createElement('span');
      chip.className = 'chip chip-' + (t.status || 'none');
      chip.textContent = (t.text||'').length > 16 ? t.text.slice(0,15)+'…' : t.text;
      chip.title = t.text; row.appendChild(chip);
      if (t.eveningNote && t.eveningNote.trim()) {
        var ns = document.createElement('span');
        ns.style.cssText = 'font-size:10px;color:var(--text-3);margin-left:2px;';
        ns.textContent = '💬';
        ns.title = t.eveningNote;
        row.appendChild(ns);
      }
    });
    chipsEl.appendChild(row);
  }

  renderChipSection('🌀 习惯', habits);
  renderChipSection('📚 知识', knowledgeTasks);
  // Divider between 知识 and 事项 in summary
  if (knowledgeTasks.length > 0 && regularTasks.length > 0) {
    var sumDivider = document.createElement('div');
    sumDivider.className = 'section-divider';
    chipsEl.appendChild(sumDivider);
  }
  renderChipSection('📋 事项', regularTasks);

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

/* ── Table View ── */

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
    const pointRadius = reviewed.length <= 2 ? 8 : (reviewed.length <= 7 ? 6 : 4);
    charts['chart-trend'] = new Chart(document.getElementById('chart-trend'), {
      type: 'line',
      data: { labels, datasets: [{ label: '完成率', data: rates, borderColor: '#3b6d11', backgroundColor: 'rgba(59,109,17,0.08)', fill: true, tension: 0.35, pointRadius: pointRadius, pointBackgroundColor: '#3b6d11', pointBorderColor: '#fff', pointBorderWidth: 2, pointHoverRadius: pointRadius + 2, borderWidth: 2.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '完成率: ' + ctx.parsed.y + '%' } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: v => v+'%', color: '#9a9a94', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { color: '#9a9a94', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } }
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
      data: { labels: countLabels, datasets: [{ label: '任务数', data: countData, backgroundColor: '#b5d4f4', borderColor: '#185fa5', borderWidth: 1, borderRadius: 3, maxBarThickness: 32, barPercentage: 0.7 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '任务数: ' + ctx.parsed.y } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#9a9a94', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { color: '#9a9a94', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } } }
    });
  }

  // Ebbinghaus forgetting curve
  renderEbbinghausCurve();
}

/* ─── Ebbinghaus Curve ─── */

function renderEbbinghausCurve() {
  destroyChart('chart-ebbinghaus');

  // Generate data points: day 0–60 (review 6 is at day 29+30=59)
  var maxDay = 62;
  var labels = [];
  var rawData = [];      // without review
  var withReviewData = []; // with spaced reviews
  var reviewMarkers = []; // scatter points at review moments
  var reviewVlines = [];  // vertical lines at review days

  // Review schedule: cumulative days
  var intervals = [1, 2, 4, 7, 15, 30];
  var reviewDays = [0]; // day 0 = learning
  var cumDay = 0;
  for (var i = 0; i < intervals.length; i++) {
    cumDay += intervals[i];
    reviewDays.push(cumDay);
  }

  // Stability values increase with each review
  var stabilities = [1.2, 2.5, 6, 14, 40, 100, 250];

  // Generate day-by-day data
  var currentStability = stabilities[0];
  var segmentStart = 0;
  var ri = 0; // review index (0 = initial learning)

  for (var d = 0; d <= maxDay; d++) {
    labels.push(String(d));

    // Raw forgetting (no review): fast decay
    rawData.push(Math.max(0, Math.round(100 * Math.exp(-d / 2.2))));

    // With review: sawtooth pattern
    var daysSinceLastReview = d - segmentStart;
    var retention = Math.round(100 * Math.exp(-daysSinceLastReview / currentStability));

    // Check if this is a review day (boost to 100%)
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

  // Create Chart.js datasets
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

  // Add vertical lines at review days using dashed line segments
  // Chart.js doesn't support vertical lines natively, so add via plugin
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

/* ─── Habits Page ─── */

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
        '<span style="font-size:24px;">' + h.icon + '</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:500;font-size:14px;">' + h.name + '</div>' +
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

function renderReviewSection(reviewTasks) {
  const section = document.getElementById('review-section');
  const list = document.getElementById('review-list');
  if (!reviewTasks || reviewTasks.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  list.innerHTML = reviewTasks.map(function(r) {
    var round = (r._reviewRound || 0) + 1;
    var roundLabel = '第' + round + '次复习';
    var urlLink = '';
    if (r.sourceUrl && r.sourceUrl.trim()) {
      urlLink = '<a href="' + escapeHTML(r.sourceUrl) + '" target="_blank" rel="noopener" ' +
        'class="review-url-link" onclick="event.stopPropagation()" ' +
        'title="打开学习资料">🔗 原文</a>';
    }
    // Show evening note if exists
    var noteHtml = '';
    if (r.eveningNote && r.eveningNote.trim()) {
      noteHtml = '<div class="review-note">💬 ' + escapeHTML(r.eveningNote) + '</div>';
    }
    return '<div class="review-item">' +
      '<span class="review-tag">复习</span>' +
      '<span class="review-text">' + escapeHTML(r.text.replace('复习：', '')) + '</span>' +
      urlLink +
      '<span class="review-round">' + roundLabel + '</span>' +
      noteHtml +
      '<div class="review-feedback">' +
        '<button class="review-btn review-remember" onclick="event.stopPropagation();reviewRemember(\'' + r.reviewId + '\')" title="记得">✅ 记得</button>' +
        '<button class="review-btn review-forgot" onclick="event.stopPropagation();reviewForgot(\'' + r.reviewId + '\')" title="忘了">❌ 忘了</button>' +
      '</div>' +
      '</div>';
  }).join('');
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── Knowledge Page ─── */

async function renderKnowledge() {
  document.getElementById('knowledge-today-label').textContent =
    todayStr() + ' 周' + WEEKDAYS[new Date().getDay()];

  // Fetch active + graduated reviews
  var dueData = { reviews: [] };
  try { dueData = await API.getDueReviews('2099-12-31'); } catch(e) {}
  var allReviews = dueData.reviews || [];

  var active = allReviews.filter(function(r) { return r.status === 'active'; });
  var graduated = allReviews.filter(function(r) { return r.status === 'graduated'; });

  document.getElementById('knowledge-active-count').textContent = active.length;

  // Active list
  var activeList = document.getElementById('knowledge-active-list');
  if (active.length === 0) {
    activeList.innerHTML = '<div class="empty-icon">📚</div>还没有需要复习的知识';
  } else {
    activeList.innerHTML = active.map(function(r) {
      var round = r.reviewRound + 1;
      var nextIvl = r.interval || 1;
      var nextLabel = round < 6 ? (nextIvl + '天后') : '—';
      return '<div class="knowledge-item">' +
        '<div class="knowledge-item-row">' +
        '<span class="knowledge-text">' + escapeHTML(r.taskText) + '</span>' +
        '<div class="knowledge-item-actions">' +
        '<span class="knowledge-round">第' + round + '轮 · ' + nextLabel + ' · ' + r.nextReview + '</span>' +
        '<button class="review-btn-mini review-remember" onclick="reviewRemember(\'' + r.id + '\')" title="记得" style="font-size:11px;">✅</button>' +
        '<button class="review-btn-mini review-forgot" onclick="reviewForgot(\'' + r.id + '\')" title="忘了" style="font-size:11px;">❌</button>' +
        '<button class="pomo-btn pomo-reset" onclick="deleteReview(\'' + r.id + '\')" style="font-size:11px;padding:4px 10px;margin-left:2px;">删除</button>' +
        '</div></div></div>';
    }).join('');
  }

  // Graduated list
  var graduatedList = document.getElementById('knowledge-graduated-list');
  if (graduated.length === 0) {
    graduatedList.innerHTML = '<div class="empty-icon">🎓</div>还没有掌握的知识';
  } else {
    graduatedList.innerHTML = graduated.map(function(r) {
      return '<div class="knowledge-item graduated">' +
        '<div class="knowledge-item-row">' +
        '<span class="knowledge-text">🎓 ' + escapeHTML(r.taskText) + '</span>' +
        '<span class="knowledge-round" style="color:var(--green);">已掌握</span>' +
        '</div></div>';
    }).join('');
  }
}

/* ─── Knowledge Overview Page ─── */

async function renderKnowledgeOverview() {
  var data = { learning: [], reviewing: [], graduated: [], stats: { total: 0, learning: 0, reviewing: 0, graduated: 0, dueToday: 0 } };
  try { data = await API.getReviewsOverview(); } catch(e) {}

  // Stats
  var s = data.stats;
  document.getElementById('knowledge-overview-stats').textContent =
    '共 ' + s.total + ' 项 · ' + s.dueToday + ' 项今日待复习';

  // Stats row cards
  var statsRow = document.getElementById('knowledge-stats-row');
  statsRow.innerHTML =
    '<div class="metric-card"><div class="metric-label">初学</div><div class="metric-value green" style="font-size:18px;">' + s.learning + '</div></div>' +
    '<div class="metric-card"><div class="metric-label">巩固</div><div class="metric-value" style="font-size:18px;">' + s.reviewing + '</div></div>' +
    '<div class="metric-card"><div class="metric-label">已毕业</div><div class="metric-value" style="font-size:18px;color:var(--warn);">' + s.graduated + '</div></div>' +
    '<div class="metric-card"><div class="metric-label">今日待复习</div><div class="metric-value" style="font-size:18px;color:' + (s.dueToday > 0 ? 'var(--accent-text)' : 'var(--text-3)') + ';">' + s.dueToday + '</div></div>';

  // Empty state
  var empty = document.getElementById('knowledge-empty');
  var cols = document.getElementById('knowledge-cols');
  if (s.total === 0) {
    empty.style.display = '';
    cols.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  cols.style.display = '';

  // Counts
  document.getElementById('k-learning-count').textContent = '(' + s.learning + ')';
  document.getElementById('k-reviewing-count').textContent = '(' + s.reviewing + ')';
  document.getElementById('k-graduated-count').textContent = '(' + s.graduated + ')';

  // Helper: render a list of review items
  function renderReviewList(items, stage) {
    if (!items || items.length === 0) {
      return '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:12px;">暂无</div>';
    }
    return items.map(function(r) {
      var round = r.reviewRound + 1;
      var nextIvl = r.interval || 1;
      var nextLabel = round < 6 ? (nextIvl + '天后') : '';
      var urlLink = '';
      if (r.sourceUrl && r.sourceUrl.trim()) {
        urlLink = ' <a href="' + escapeHTML(r.sourceUrl) + '" target="_blank" rel="noopener" class="review-url-link" title="学习资料">🔗</a>';
      }
      var noteHtml = '';
      if (r.eveningNote && r.eveningNote.trim()) {
        noteHtml = '<div style="font-size:10px;color:var(--text-3);margin-top:2px;font-style:italic;">💬 ' + escapeHTML(r.eveningNote) + '</div>';
      }
      var actionHtml = '';
      if (stage !== 'graduated') {
        actionHtml =
          '<div style="margin-top:4px;display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:10px;color:var(--text-3);">第' + round + '轮 · ' + nextLabel + ' · ' + r.nextReview + '</span>' +
            '<button class="review-btn-mini review-remember" onclick="reviewRemember(\'' + r.id + '\')" title="记得">✅</button>' +
            '<button class="review-btn-mini review-forgot" onclick="reviewForgot(\'' + r.id + '\')" title="忘了">❌</button>' +
          '</div>';
      } else {
        actionHtml =
          '<div style="margin-top:4px;font-size:10px;color:var(--accent-text);">🎓 已掌握</div>';
      }
      return '<div style="padding:8px 0;border-bottom:0.5px solid var(--border);font-size:13px;">' +
        '<span>' + escapeHTML(r.taskText) + '</span>' + urlLink +
        noteHtml +
        actionHtml +
        '</div>';
    }).join('');
  }

  // Render three columns
  document.getElementById('k-learning-list').innerHTML = renderReviewList(data.learning, 'learning');
  document.getElementById('k-reviewing-list').innerHTML = renderReviewList(data.reviewing, 'reviewing');
  // Graduated: collapsed by default
  var graduatedList = document.getElementById('k-graduated-list');
  graduatedList.innerHTML = renderReviewList(data.graduated, 'graduated');
  graduatedList.style.display = 'none';
}

/* ── Knowledge Task URL ── */

var _activeUrlInput = null;

function showUrlInput(linkWrap, taskId) {
  // Remove any existing url input
  if (_activeUrlInput) _activeUrlInput.remove();

  var wrap = document.createElement('span');
  wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
  var inp = document.createElement('input');
  inp.type = 'url';
  inp.className = 'url-input-inline';
  inp.placeholder = '粘贴学习网页地址...';
  inp.style.cssText = 'width:180px;font-size:11px;padding:3px 6px;border:0.5px solid var(--border-md);border-radius:4px;background:var(--surface);color:var(--text);';

  var confirmBtn = document.createElement('button');
  confirmBtn.innerHTML = '✓';
  confirmBtn.className = 'url-confirm-btn';
  confirmBtn.onclick = function(e) { e.stopPropagation(); setTaskSourceUrl(taskId, inp.value); };

  var cancelBtn = document.createElement('button');
  cancelBtn.innerHTML = '✕';
  cancelBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-3);font-size:12px;';
  cancelBtn.onclick = function(e) { e.stopPropagation(); wrap.remove(); _activeUrlInput = null; };

  // Enter key to confirm
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); setTaskSourceUrl(taskId, inp.value); }
  });

  wrap.appendChild(inp);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(cancelBtn);

  linkWrap.innerHTML = '';
  linkWrap.appendChild(wrap);
  _activeUrlInput = wrap;

  setTimeout(function() { inp.focus(); }, 50);
}

async function setTaskSourceUrl(taskId, url) {
  url = (url || '').trim();
  if (_activeUrlInput) { _activeUrlInput.remove(); _activeUrlInput = null; }
  try {
    var d = await API.getDay(currentDate);
    var tasks = d.morningTasks || [];
    var task = tasks.find(function(t) { return t.id === taskId; });
    if (task) {
      task.sourceUrl = url || null;
      await API.saveDay(currentDate, d);
      showToast(url ? '链接已保存 ✓' : '链接已清除');
      await renderToday();
    }
  } catch(e) {
    showToast('保存失败');
  }
}

/* ─── Notebook System (Vditor + Folder Tree) ─── */

// State
var nbState = {
  mode: 'notes',        // 'notes' | 'diary'
  selectedFolderId: null,
  editingNoteId: null,
  vd: null,             // Vditor instance
  treeData: { tree: [], orphanNotes: [] },
  currentNoteTitle: '',
  currentNoteTags: '',
  diaryDate: todayStr(),
  expandedFolders: {},  // id -> bool
  dirty: false,         // unsaved changes
  lastSavedMd: '',
  autoSaveTimer: null,
};

async function renderNotebook() {
  // Load tree
  await nbLoadTree();
  // If no note selected, show empty state
  if (!nbState.editingNoteId && nbState.mode === 'notes') {
    nbShowEmpty();
  }
}

/* ─── Tree ─── */

async function nbLoadTree() {
  try {
    var data = await API.getFolderTree();
    nbState.treeData = data;
  } catch(e) {
    nbState.treeData = { tree: [], orphanNotes: [] };
  }
  nbRenderTree();
}

function nbRenderTree() {
  var container = document.getElementById('nb-tree');
  var tree = nbState.treeData.tree;
  var orphans = nbState.treeData.orphanNotes;

  var html = '';

  // Diary quick entry
  html += '<div class="nb-tree-item nb-tree-diary' + (nbState.mode === 'diary' ? ' active' : '') + '" onclick="nbShowDiary()">';
  html += '<span class="nb-tree-icon">📅</span> 日记';
  html += '</div>';

  // Root "所有笔记" virtual folder
  html += '<div class="nb-tree-item nb-tree-all' + (nbState.mode === 'notes' && !nbState.selectedFolderId && !nbState.editingNoteId ? ' active' : '') + '" onclick="nbSelectFolder(null)">';
  html += '<span class="nb-tree-icon">📓</span> 所有笔记';
  html += '</div>';

  // Render folder tree
  for (var i = 0; i < tree.length; i++) {
    html += nbRenderFolderNode(tree[i], 0);
  }

  // Orphan notes (no folder)
  if (orphans && orphans.length > 0) {
    html += '<div class="nb-tree-section">未归类笔记</div>';
    for (var j = 0; j < orphans.length; j++) {
      html += nbRenderNoteItem(orphans[j]);
    }
  }

  container.innerHTML = html;
}

function nbRenderFolderNode(node, depth) {
  var expanded = nbState.expandedFolders[node.id] !== false; // default open
  var isSelected = nbState.selectedFolderId === node.id;
  var hasChildren = node.children && node.children.length > 0;
  var hasNotes = node.notes && node.notes.length > 0;

  var margin = depth * 16;
  var html = '';

  // Folder row
  html += '<div class="nb-tree-item nb-tree-folder' + (isSelected ? ' active' : '') + '" style="padding-left:' + (12 + margin) + 'px;" onclick="nbSelectFolder(\'' + escapeAttr(node.id) + '\')">';
  html += '<span class="nb-tree-toggle" onclick="nbToggleFolder(event, \'' + escapeAttr(node.id) + '\')">' + (expanded ? '▼' : '▶') + '</span>';
  html += '<span class="nb-tree-icon">' + (expanded ? '📂' : '📁') + '</span> ';
  html += '<span class="nb-tree-name">' + escapeHTML(node.name || '未命名文件夹') + '</span>';
  html += '<span class="nb-tree-count">' + ((node.notes ? node.notes.length : 0) + (node.children ? node.children.length : 0)) + '</span>';
  // Context menu button
  html += '<span class="nb-tree-menu-btn" onclick="nbFolderMenu(event, \'' + escapeAttr(node.id) + '\')" title="更多">⋯</span>';
  html += '</div>';

  // Children
  if (expanded && (hasChildren || hasNotes)) {
    html += '<div class="nb-tree-children">';
    // Child folders
    if (hasChildren) {
      for (var i = 0; i < node.children.length; i++) {
        html += nbRenderFolderNode(node.children[i], depth + 1);
      }
    }
    // Notes in this folder
    if (hasNotes) {
      for (var j = 0; j < node.notes.length; j++) {
        html += '<div class="nb-tree-item nb-tree-note' + (nbState.editingNoteId === node.notes[j].id ? ' active' : '') + '" style="padding-left:' + (28 + margin) + 'px;" onclick="nbOpenNote(\'' + escapeAttr(node.notes[j].id) + '\')">';
        html += '<span class="nb-tree-icon">📄</span> ';
        html += '<span class="nb-tree-name">' + escapeHTML(node.notes[j].title) + '</span>';
        html += '</div>';
      }
    }
    html += '</div>';
  }

  return html;
}

function nbRenderNoteItem(note) {
  return '<div class="nb-tree-item nb-tree-note' + (nbState.editingNoteId === note.id ? ' active' : '') + '" style="padding-left:28px;" onclick="nbOpenNote(\'' + escapeAttr(note.id) + '\')">' +
    '<span class="nb-tree-icon">📄</span> ' +
    '<span class="nb-tree-name">' + escapeHTML(note.title) + '</span>' +
    '</div>';
}

function nbSelectFolder(folderId) {
  nbState.selectedFolderId = folderId;
  nbState.mode = 'notes';
  // Don't auto-select a note, stay in folder view
  document.getElementById('nb-editor-header').style.display = 'none';
  document.getElementById('nb-diary-header').style.display = 'none';
  nbShowEmpty();
  nbRenderTree();
}

async function nbOpenNote(noteId) {
  nbState.mode = 'notes';
  nbState.editingNoteId = noteId;
  nbState.selectedFolderId = null;
  nbState.dirty = false;

  document.getElementById('nb-editor-header').style.display = 'flex';
  document.getElementById('nb-diary-header').style.display = 'none';
  document.getElementById('nb-empty').style.display = 'none';
  document.getElementById('nb-vditor').style.display = '';

  // Show loading state
  document.getElementById('nb-title-input').value = '加载中…';

  try {
    var note = await API.getNote(noteId);
    nbState.currentNoteTitle = note.title || '';
    nbState.currentNoteTags = (note.tags || []).join(', ');
    nbState.selectedFolderId = note.folderId;
    nbState.lastSavedMd = note.content || '';

    document.getElementById('nb-title-input').value = nbState.currentNoteTitle;
    document.getElementById('nb-tags-input').value = nbState.currentNoteTags;

    // Init Vditor with content
    nbInitVditor(note.content || '');
  } catch(e) {
    showToast('加载笔记失败');
    nbShowEmpty();
  }

  nbRenderTree();
}

function nbNewNote() {
  nbState.mode = 'notes';
  nbState.editingNoteId = null;
  nbState.currentNoteTitle = '';
  nbState.currentNoteTags = '';
  nbState.dirty = false;
  nbState.lastSavedMd = '';

  document.getElementById('nb-editor-header').style.display = 'flex';
  document.getElementById('nb-diary-header').style.display = 'none';
  document.getElementById('nb-empty').style.display = 'none';
  document.getElementById('nb-vditor').style.display = '';

  document.getElementById('nb-title-input').value = '';
  document.getElementById('nb-tags-input').value = '';
  document.getElementById('nb-editor-status').textContent = '新笔记';

  nbInitVditor('');
  nbRenderTree();
}

function nbShowEmpty() {
  nbState.editingNoteId = null;
  document.getElementById('nb-editor-header').style.display = 'none';
  document.getElementById('nb-diary-header').style.display = 'none';
  document.getElementById('nb-empty').style.display = '';
  document.getElementById('nb-vditor').style.display = 'none';

  // Destroy Vditor instance if exists
  if (nbState.vd) {
    try { nbState.vd.destroy(); } catch(e) {}
    nbState.vd = null;
  }
}

/* ─── Vditor ─── */

function nbInitVditor(markdown) {
  var container = document.getElementById('nb-vditor');
  container.innerHTML = '';
  container.style.display = '';

  // Destroy existing instance
  if (nbState.vd) {
    try { nbState.vd.destroy(); } catch(e) {}
    nbState.vd = null;
  }

  var vditor = new Vditor('nb-vditor', {
    height: window.innerHeight - 150,
    mode: 'ir',  // instant rendering (实时渲染)
    placeholder: '开始写作…',
    value: markdown || '',
    cache: { enable: false },
    toolbar: [
      'headings', 'bold', 'italic', 'strike', 'line', 'quote',
      'list', 'ordered-list', 'check', 'code', 'inline-code',
      'link', 'table', '|',
      'undo', 'redo', '|',
      'fullscreen', 'outline'
    ],
    after: function() {
      // Listen for content changes
      nbState.vd = vditor;
      vditor.vditor.element.addEventListener('input', function() {
        nbState.dirty = true;
        nbAutoSave();
      });
    },
    blur: function(md) {
      if (md !== nbState.lastSavedMd) {
        nbState.dirty = true;
      }
    },
    upload: {
      accept: 'image/*',
      handler: function(files) {
        // For now, no image upload — just display base64
        return null;
      }
    },
  });

  nbState.vd = vditor;
}

function nbAutoSave() {
  clearTimeout(nbState.autoSaveTimer);
  nbState.autoSaveTimer = setTimeout(function() {
    if (nbState.mode === 'notes' && nbState.editingNoteId) {
      nbSaveNote(true);
    }
  }, 5000);
}

/* ─── Save / Delete Note ─── */

async function nbSaveNote(silent) {
  var title = document.getElementById('nb-title-input').value.trim();
  var tagsStr = document.getElementById('nb-tags-input').value.trim();
  var tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];

  // Get content from Vditor
  var content = '';
  if (nbState.vd) {
    content = nbState.vd.getValue();
  }

  try {
    if (nbState.editingNoteId) {
      await API.updateNote(nbState.editingNoteId, {
        title: title,
        content: content,
        tags: tags,
        folderId: nbState.selectedFolderId
      });
      if (!silent) showToast('笔记已保存 ✓');
    } else {
      var data = {
        title: title,
        content: content,
        tags: tags,
        folderId: nbState.selectedFolderId
      };
      var res = await API.createNote(data);
      nbState.editingNoteId = res.id;
      if (!silent) showToast('笔记已创建 ✓');
    }

    nbState.lastSavedMd = content;
    nbState.dirty = false;
    nbState.currentNoteTitle = title;
    nbState.currentNoteTags = tagsStr;
    document.getElementById('nb-editor-status').textContent = '已保存 ' + new Date().toLocaleTimeString();

    // Refresh tree to show new note
    nbLoadTree();
  } catch(e) {
    if (!silent) showToast('保存失败');
  }
}

async function nbDeleteNote() {
  if (!nbState.editingNoteId) return;
  if (!confirm('确定删除这篇笔记？')) return;

  try {
    await API.deleteNote(nbState.editingNoteId);
    showToast('笔记已删除');
    nbState.editingNoteId = null;
    nbShowEmpty();
    nbLoadTree();
  } catch(e) {
    showToast('删除失败');
  }
}

/* ─── Folder CRUD ─── */

async function nbNewFolder() {
  var name = prompt('文件夹名称：');
  if (!name || !name.trim()) return;
  try {
    var parentId = nbState.selectedFolderId || null;
    await API.createFolder({ name: name.trim(), parentId: parentId });
    showToast('文件夹已创建 ✓');
    nbLoadTree();
  } catch(e) {
    showToast('创建失败');
  }
}

function nbFolderMenu(e, folderId) {
  e.stopPropagation();
  var action = prompt('操作：rename=重命名, delete=删除', 'rename');
  if (!action) return;

  if (action === 'rename' || action === '重命名') {
    nbRenameFolder(folderId);
  } else if (action === 'delete' || action === '删除') {
    nbDeleteFolder(folderId);
  }
}

async function nbRenameFolder(folderId) {
  var name = prompt('新名称：');
  if (!name || !name.trim()) return;
  try {
    await API.updateFolder(folderId, { name: name.trim() });
    showToast('已重命名 ✓');
    nbLoadTree();
  } catch(e) {
    showToast('重命名失败');
  }
}

async function nbDeleteFolder(folderId) {
  if (!confirm('确定删除整个文件夹？文件夹内的笔记不会被删除，只会移出文件夹。')) return;
  try {
    await API.deleteFolder(folderId);
    showToast('文件夹已删除 ✓');
    if (nbState.selectedFolderId === folderId) {
      nbState.selectedFolderId = null;
    }
    nbLoadTree();
  } catch(e) {
    showToast('删除失败');
  }
}

function nbToggleFolder(e, folderId) {
  e.stopPropagation();
  if (nbState.expandedFolders[folderId] === false) {
    nbState.expandedFolders[folderId] = true;
  } else {
    nbState.expandedFolders[folderId] = false;
  }
  nbRenderTree();
}

/* ─── Diary ─── */

async function nbShowDiary() {
  nbState.mode = 'diary';
  nbState.editingNoteId = null;
  nbState.dirty = false;
  nbState.diaryDate = todayStr();

  document.getElementById('nb-editor-header').style.display = 'none';
  document.getElementById('nb-diary-header').style.display = 'flex';
  document.getElementById('nb-empty').style.display = 'none';
  document.getElementById('nb-vditor').style.display = '';

  await nbLoadDiaryContent();
  nbRenderTree();
}

async function nbLoadDiaryContent() {
  var label = document.getElementById('nb-diary-date-label');
  var d = new Date(nbState.diaryDate + 'T00:00:00');
  var weekdays = ['日','一','二','三','四','五','六'];
  label.textContent = nbState.diaryDate + ' 周' + weekdays[d.getDay()];

  try {
    var data = await API.getDiary(nbState.diaryDate);
    nbInitVditor(data.content || '');
    nbState.lastSavedMd = data.content || '';
    document.getElementById('nb-diary-status').textContent = data.exists ? '已加载' : '新日记';
  } catch(e) {
    nbInitVditor('');
    nbState.lastSavedMd = '';
  }
}

function nbDiaryNav(delta) {
  var d = new Date(nbState.diaryDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  nbState.diaryDate = d.toISOString().slice(0, 10);
  nbLoadDiaryContent();
}

function nbDiaryGoToday() {
  nbState.diaryDate = todayStr();
  nbLoadDiaryContent();
}

async function nbSaveDiary() {
  var content = '';
  if (nbState.vd) {
    content = nbState.vd.getValue();
  }
  try {
    await API.saveDiary(nbState.diaryDate, content);
    nbState.lastSavedMd = content;
    nbState.dirty = false;
    document.getElementById('nb-diary-status').textContent = '已保存 ' + new Date().toLocaleTimeString();
    showToast('日记已保存 ✓');
  } catch(e) {
    showToast('保存失败');
  }
}

/* ─── Search ─── */

var nbSearchTimer;
function nbSearch() {
  clearTimeout(nbSearchTimer);
  nbSearchTimer = setTimeout(async function() {
    var q = document.getElementById('nb-search-input').value.trim();
    if (!q) {
      nbLoadTree();
      return;
    }
    try {
      var data = await API.listNotes(q);
      nbState.treeData = { tree: [], orphanNotes: [] };
      // Display search results as flat list
      var container = document.getElementById('nb-tree');
      if (!data.notes || data.notes.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-3);">无匹配结果</div>';
        return;
      }
      var html = '<div class="nb-tree-section">搜索结果 (' + data.notes.length + ')</div>';
      for (var i = 0; i < data.notes.length; i++) {
        var n = data.notes[i];
        html += '<div class="nb-tree-item nb-tree-note" style="padding-left:12px;" onclick="nbOpenNote(\'' + escapeAttr(n.id) + '\')">';
        html += '<span class="nb-tree-icon">📄</span> ';
        html += '<span class="nb-tree-name">' + escapeHTML(n.title || '无标题') + '</span>';
        html += '<span class="nb-tree-count" style="font-size:10px;">' + (n.content || '').replace(/[#*_~`>\[\]\n]/g, '').slice(0, 40) + '</span>';
        html += '</div>';
      }
      container.innerHTML = html;
    } catch(e) {
      // ignore
    }
  }, 300);
}

/* ─── Helpers ─── */

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/* render.js — Today page rendering */

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

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
  let hasPrev = false;
  try {
    const daysList = await API.listDays();
    const savedDates = daysList.map(d => d.date);
    hasPrev = savedDates.some(d => d < currentDate);
  } catch(e) {}
  document.getElementById('btn-prev-day').disabled = !hasPrev;
  document.getElementById('btn-next-day').disabled = isToday;
  document.getElementById('btn-today').disabled = isToday;

  let data = await API.getDay(currentDate);
  const isNew = data._new;
  delete data._new;

  // Past date with no saved data → empty state
  if (!isToday && isNew) {
    document.getElementById('morning-empty-msg').style.display = '';
    document.getElementById('morning-task-cards').style.display = 'none';
    document.getElementById('add-task-area').style.display = 'none';
    document.getElementById('morning-note-wrap').style.display = 'none';
    document.getElementById('btn-save-morning').style.display = 'none';
    document.getElementById('morning-hint').textContent = '';
    document.getElementById('card-evening').style.display = 'none';
    return;
  }
  document.getElementById('morning-empty-msg').style.display = 'none';
  document.getElementById('morning-task-cards').style.display = '';
  document.getElementById('morning-note-wrap').style.display = '';
  document.getElementById('card-evening').style.display = '';

  // Auto-save for new today
  if (isNew && isToday) await API.saveDay(currentDate, data);

  // Split tasks
  const allTasks = data.morningTasks || [];
  const reviewTasks = allTasks.filter(t => t.itemType === 'review');
  const regularTasks = allTasks.filter(t => t.itemType !== 'review');

  // Show due reviews
  renderReviewSection(reviewTasks);

  // Regular tasks sorted: habits first, then knowledge, then plain
  regularTasks.sort((a, b) => {
    const aH = (a.kind||'task') === 'habit' ? 0 : 1;
    const bH = (b.kind||'task') === 'habit' ? 0 : 1;
    return aH - bH;
  });
  data.morningTasks = regularTasks;

  // Layout: knowledge section + divider + plain section
  const knowledgeTasks = regularTasks.filter(t => t.itemType === 'knowledge');
  const plainTasks = regularTasks.filter(t => t.itemType !== 'knowledge');

  // Morning
  const savedMorning = !!data.savedMorning;
  const container = document.getElementById('morning-task-cards');
  container.innerHTML = '';

  // Knowledge section header
  if (knowledgeTasks.length > 0) {
    const kh = document.createElement('div');
    kh.className = 'section-header';
    kh.innerHTML = '<span class="section-header-icon">📚</span><span class="section-header-label">知识</span>';
    container.appendChild(kh);
    knowledgeTasks.forEach((task, i) => renderMorningCard(container, task, i, data, savedMorning));
  }

  // Divider
  if (knowledgeTasks.length > 0 && plainTasks.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'section-divider';
    container.appendChild(divider);
  }

  // Plain tasks section header
  if (plainTasks.length > 0) {
    const ph = document.createElement('div');
    ph.className = 'section-header';
    ph.innerHTML = '<span class="section-header-icon">📋</span><span class="section-header-label">事项</span>';
    container.appendChild(ph);
    const kCount = knowledgeTasks.length;
    plainTasks.forEach((task, i) => renderMorningCard(container, task, kCount + i, data, savedMorning));
  }

  document.getElementById('btn-save-morning').style.display = savedMorning ? 'none' : '';
  document.getElementById('add-task-area').style.display = savedMorning ? 'none' : ((regularTasks.length >= 10) ? 'none' : '');
  document.getElementById('morning-note').readOnly = savedMorning;
  document.getElementById('morning-note').value = data.morningNote || '';
  document.getElementById('morning-hint').textContent = savedMorning ? '已保存 ✓' : `${regularTasks.length}/10`;

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

/* ─── Morning Task Card ─── */
function renderMorningCard(container, task, index, data, savedMorning) {
  const isToday = currentDate === todayStr();
  const readOnly = !isToday || savedMorning;
  const isKnowledge = task.itemType === 'knowledge';
  const isHabit = (task.kind||'task') === 'habit';

  const card = document.createElement('div');
  card.className = 'task-card';
  if (isHabit) card.classList.add('task-habit-card');
  if (isKnowledge) card.classList.add('task-knowledge');
  card.dataset.id = task.id;

  // Index badge
  const idx = document.createElement('div');
  idx.className = 'task-card-index';
  if (isKnowledge) idx.classList.add('knowledge-idx');
  if (task.plan) {
    const colors = {
      long:  'background:#d4e6fa;color:#0d4f8a;border:0.5px solid #8bb8e0;',
      week:  'background:#fce4d6;color:#a64e0a;border:0.5px solid #f0b080;',
      month: 'background:#e0d4f5;color:#5c2d91;border:0.5px solid #b595d8;'
    };
    idx.style.cssText = `min-width:28px;height:28px;${colors[task.plan]||colors.long}`;
    idx.textContent = PLAN_META[task.plan].icon;
    idx.title = PLAN_META[task.plan].label;
  } else if (isHabit) {
    idx.textContent = '🌀';
    idx.title = '习惯';
    idx.style.cssText = 'min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;';
  } else {
    idx.textContent = index + 1;
  }

  // Body
  const body = document.createElement('div');
  body.className = 'task-card-body';

  // Text input
  const textarea = document.createElement('textarea');
  textarea.className = 'task-card-input';
  textarea.value = task.text || '';
  textarea.placeholder = isKnowledge ? '输入知识内容…' : `事项 ${index + 1}`;
  textarea.rows = 1;
  if (readOnly) {
    textarea.readOnly = true;
    textarea.style.color = 'var(--text-2)';
    textarea.style.cursor = 'default';
    textarea.title = savedMorning ? '早间计划已保存，不可修改' : '历史记录不可修改';
  }
  textarea.addEventListener('input', function() {
    this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';
  });
  if (!readOnly) {
    textarea.addEventListener('keydown', async function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const d = await API.getDay(currentDate);
        if ((d.morningTasks||[]).length < 10) addTask();
      }
    });
  }
  body.appendChild(textarea);

  // Source URL for knowledge tasks
  if (isKnowledge) {
    const urlRow = document.createElement('div');
    urlRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';
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
      urlRow.appendChild(linkBtn);
      const urlText = document.createElement('span');
      urlText.style.cssText = 'font-size:11px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;';
      urlText.textContent = task.sourceUrl;
      urlRow.appendChild(urlText);
    } else if (!readOnly) {
      const addUrlBtn = document.createElement('button');
      addUrlBtn.className = 'task-url-btn';
      addUrlBtn.title = '贴上学习资料链接，复习时一键打开';
      addUrlBtn.innerHTML = '🔗';
      addUrlBtn.onclick = function(e) {
        e.stopPropagation();
        showUrlInput(urlRow, task.id);
      };
      urlRow.appendChild(addUrlBtn);
    }
    body.appendChild(urlRow);
  }

  // Meta row: type tag + priority star + toggle buttons
  const meta = document.createElement('div');
  meta.className = 'task-meta';

  if (readOnly) {
    // Read-only: show type tags
    if (isKnowledge) {
      const kTag = document.createElement('span');
      kTag.className = 'type-tag knowledge-tag';
      kTag.innerHTML = '📚 知识';
      meta.appendChild(kTag);
      const sched = document.createElement('span');
      sched.className = 'eb-compact';
      sched.textContent = 'SM-2 动态复习';
      sched.title = '艾宾浩斯复习时间表：间隔根据记忆效果动态调整';
      meta.appendChild(sched);
    } else {
      const tTag = document.createElement('span');
      tTag.className = 'type-tag task-tag';
      tTag.innerHTML = '📄 事项';
      meta.appendChild(tTag);
    }
  } else {
    // Edit mode: toggle buttons
    const taskBtn = document.createElement('button');
    taskBtn.className = 'type-btn' + (!isKnowledge ? ' active-task' : '');
    taskBtn.textContent = '📄 事项';
    taskBtn.onclick = function() { toggleTaskType(task.id, 'task'); };
    meta.appendChild(taskBtn);

    const kBtn = document.createElement('button');
    kBtn.className = 'type-btn' + (isKnowledge ? ' active-knowledge' : '');
    kBtn.textContent = '📚 知识';
    kBtn.onclick = function() { toggleTaskType(task.id, 'knowledge'); };
    meta.appendChild(kBtn);

    if (isKnowledge) {
      const sched = document.createElement('span');
      sched.className = 'eb-compact';
      sched.textContent = '（1/2/4/7/15/30天）';
      sched.title = '艾宾浩斯复习时间表';
      meta.appendChild(sched);
    }
  }

  // Priority star
  const star = document.createElement('button');
  star.className = 'priority-star' + (task.starred ? ' active' : '');
  star.innerHTML = task.starred ? '⭐' : '☆';
  star.title = task.starred ? '已标记为重要' : '标记为重要';
  if (readOnly) star.classList.add('readonly');
  star.onclick = async function(e) {
    e.stopPropagation();
    if (readOnly) return;
    const d = await API.getDay(currentDate);
    const t = (d.morningTasks||[]).find(x => x.id === task.id);
    if (!t) return;
    t.starred = !t.starred;
    await API.saveDay(currentDate, d);
    await renderToday();
  };
  meta.appendChild(star);

  body.appendChild(meta);
  card.appendChild(idx);
  card.appendChild(body);

  // Delete button
  if (!readOnly) {
    const del = document.createElement('button');
    del.className = 'task-delete-btn';
    del.innerHTML = '×';
    del.title = '删除';
    del.onclick = function() { deleteTask(task.id); };
    card.appendChild(del);
  }

  container.appendChild(card);

  // Auto-resize textarea
  setTimeout(() => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }, 0);
}

/* ─── Evening Form ─── */
function renderEveningForm(data) {
  const container = document.getElementById('evening-task-cards');
  container.innerHTML = '';
  const realTasks = (data.morningTasks||[]).filter(t => (t.text||'').trim());
  const habits = realTasks.filter(t => (t.kind||'task') === 'habit');
  const tasks = realTasks.filter(t => (t.kind||'task') !== 'habit');
  const knowledgeTasks = tasks.filter(t => t.itemType === 'knowledge');
  const plainTasks = tasks.filter(t => t.itemType !== 'knowledge');

  function renderOne(task, idx) {
    const isKnowledge = task.itemType === 'knowledge';
    const isHabit = (task.kind||'task') === 'habit';

    const card = document.createElement('div');
    card.className = 'evening-task-card';
    if (isHabit) card.classList.add('task-habit-card');
    if (isKnowledge) card.classList.add('task-knowledge');
    card.dataset.id = task.id;

    // Text + labels
    const textEl = document.createElement('div');
    textEl.className = 'evening-task-text';
    textEl.textContent = task.text;

    if (isHabit) {
      const hTag = document.createElement('span');
      hTag.className = 'type-tag';
      hTag.style.cssText = 'background:#f3e8ff;color:#7c3aed;border-color:#c4b5fd;';
      hTag.textContent = '🌀 习惯';
      textEl.appendChild(hTag);
    } else if (isKnowledge) {
      const kTag = document.createElement('span');
      kTag.className = 'type-tag knowledge-tag';
      kTag.innerHTML = '📚 知识';
      textEl.appendChild(kTag);
    }

    if (task.starred) {
      const starEl = document.createElement('span');
      starEl.style.cssText = 'font-size:13px;';
      starEl.textContent = '⭐';
      starEl.title = '重要任务';
      textEl.appendChild(starEl);
    }

    card.appendChild(textEl);

    // Status buttons
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
    card.appendChild(statusGroup);

    // Per-task evening note
    const noteInput = document.createElement('textarea');
    noteInput.className = 'evening-task-note';
    noteInput.placeholder = '备注（可选）…';
    noteInput.rows = 1;
    noteInput.value = task.eveningNote || '';
    noteInput.addEventListener('input', function() {
      this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';
    });
    card.appendChild(noteInput);

    container.appendChild(card);
  }

  let idx = 0;
  if (habits.length > 0) {
    const hh = document.createElement('div');
    hh.className = 'section-header';
    hh.innerHTML = '<span class="section-header-icon">🌀</span><span class="section-header-label">习惯</span>';
    container.appendChild(hh);
    habits.forEach(t => renderOne(t, idx++));
  }
  if (knowledgeTasks.length > 0) {
    const kh = document.createElement('div');
    kh.className = 'section-header';
    kh.innerHTML = '<span class="section-header-icon">📚</span><span class="section-header-label">知识</span>';
    container.appendChild(kh);
    knowledgeTasks.forEach(t => renderOne(t, idx++));
  }
  if (knowledgeTasks.length > 0 && plainTasks.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'section-divider';
    container.appendChild(divider);
  }
  if (plainTasks.length > 0) {
    const ph = document.createElement('div');
    ph.className = 'section-header';
    ph.innerHTML = '<span class="section-header-icon">📋</span><span class="section-header-label">事项</span>';
    container.appendChild(ph);
    plainTasks.forEach(t => renderOne(t, idx++));
  }

  document.getElementById('evening-note').value = data.eveningNote || '';
}

/* ─── Evening Summary ─── */
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
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:12px;font-weight:500;color:var(--text-2);margin:12px 0 6px;';
    lbl.textContent = label;
    chipsEl.appendChild(lbl);
    const row = document.createElement('div');
    row.className = 'chip-row';
    taskList.forEach(function(t) {
      const chip = document.createElement('span');
      chip.className = 'chip chip-' + (t.status || 'none');
      const text = (t.text||'').length > 20 ? t.text.slice(0,19)+'…' : t.text;
      chip.textContent = text;
      chip.title = t.text;
      if (t.starred) chip.textContent = '⭐ ' + chip.textContent;
      row.appendChild(chip);
      if (t.eveningNote && t.eveningNote.trim()) {
        const ns = document.createElement('span');
        ns.style.cssText = 'font-size:11px;color:var(--text-3);margin-left:2px;';
        ns.textContent = '💬';
        ns.title = t.eveningNote;
        row.appendChild(ns);
      }
    });
    chipsEl.appendChild(row);
  }

  renderChipSection('🌀 习惯', habits);
  renderChipSection('📚 知识', knowledgeTasks);
  if (knowledgeTasks.length > 0 && regularTasks.length > 0) {
    const sumDivider = document.createElement('div');
    sumDivider.className = 'section-divider';
    chipsEl.appendChild(sumDivider);
  }
  renderChipSection('📋 事项', regularTasks);

  if (data.eveningNote) {
    const note = document.createElement('div');
    note.style.cssText = 'margin-top:12px;font-size:13px;color:var(--text-2);border-left:3px solid var(--warning);padding:8px 12px;background:rgba(245,158,11,0.04);border-radius:0 8px 8px 0;';
    note.textContent = data.eveningNote;
    chipsEl.appendChild(note);
  }
}

/* ─── Review Section ─── */
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
    const round = (r._reviewRound || 0) + 1;
    const roundLabel = '第' + round + '次复习';
    let urlLink = '';
    if (r.sourceUrl && r.sourceUrl.trim()) {
      urlLink = '<a href="' + escapeHTML(r.sourceUrl) + '" target="_blank" rel="noopener" ' +
        'class="review-url-link" onclick="event.stopPropagation()" ' +
        'title="打开学习资料">🔗 原文</a>';
    }
    let noteHtml = '';
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

/* ═══════════════════════════════════════════════════════
   render.js — Auto-built from static/src/
   DO NOT EDIT — edit pages/{page}/render.js instead
═══════════════════════════════════════════════════════ */

/* ─── Shared Utils ─── */

/* ═══════════════════════════════════════════════════════
   shared/utils.js — Utility functions used across all pages
═══════════════════════════════════════════════════════ */

function _fmt(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

/* ─── Shared Widgets (W.*) ─── */

/* ═══════════════════════════════════════════════════════════
   render-widgets.js — Shared DOM widget helpers
   All pages use W.* to create consistent, styled elements.
   ═══════════════════════════════════════════════════════════ */

var W = (function() {

  /* ─── Page Title ─── */
  function pageTitle(icon, text) {
    var el = document.createElement('div');
    el.className = 'page-title';
    if (icon) { var i = document.createElement('span'); i.textContent = icon; el.appendChild(i); }
    if (text) el.appendChild(document.createTextNode(text));
    return el;
  }

  /* ─── Section Header ─── */
  function sectionHeader(icon, text) {
    var el = document.createElement('div');
    el.className = 'section-header';
    if (icon) { var i = document.createElement('span'); i.className = 'section-header-icon'; i.textContent = icon; el.appendChild(i); }
    if (text) { var s = document.createElement('span'); s.className = 'section-header-label'; s.textContent = text; el.appendChild(s); }
    return el;
  }

  /* ─── Empty State ─── */
  function emptyState(icon, text) {
    var el = document.createElement('div');
    el.className = 'empty-state';
    if (icon) { var i = document.createElement('div'); i.className = 'empty-icon'; i.textContent = icon; el.appendChild(i); }
    if (text) {
      // Support multiline text via <br>
      if (text.indexOf('\n') > -1) {
        var parts = text.split('\n');
        el.appendChild(document.createTextNode(parts[0]));
        for (var p = 1; p < parts.length; p++) {
          el.appendChild(document.createElement('br'));
          el.appendChild(document.createTextNode(parts[p]));
        }
      } else {
        el.appendChild(document.createTextNode(text));
      }
    }
    return el;
  }

  /* ─── Metric Card (stats display) ─── */
  function metricCard(label, value, colorClass) {
    var el = document.createElement('div');
    el.className = 'metric-card';
    var l = document.createElement('div'); l.className = 'metric-label'; l.textContent = label; el.appendChild(l);
    var v = document.createElement('div'); v.className = 'metric-value'; if (colorClass) v.classList.add(colorClass); v.textContent = value; el.appendChild(v);
    return el;
  }

  return {
    pageTitle: pageTitle,
    sectionHeader: sectionHeader,
    emptyState: emptyState,
    metricCard: metricCard
  };

})();

/* ─── Public API ─── */

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


/* ─── today Page ─── */

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

  // Morning — render all tasks flat (type tag on card itself distinguishes 知识/事项)
  const savedMorning = !!data.savedMorning;
  const container = document.getElementById('morning-task-cards');
  container.innerHTML = '';

  regularTasks.forEach((task, i) => renderMorningCard(container, task, i, data, savedMorning));

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

  // ═══ Top row: index + body + controls ═══
  const topRow = document.createElement('div');
  topRow.className = 'task-card-top';

  // Index badge
  const idx = document.createElement('div');
  idx.className = 'task-card-index';
  if (isKnowledge) idx.classList.add('knowledge-idx');
  if (isHabit) {
    idx.textContent = '🌀';
    idx.title = '习惯';
    idx.style.cssText = 'min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;';
  } else {
    idx.textContent = index + 1;
  }
  topRow.appendChild(idx);

  // Body — just the textarea (flex:1)
  const body = document.createElement('div');
  body.className = 'task-card-body';

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
  topRow.appendChild(body);

  // Controls (right side): type pills + delete (on the same line as input)
  const controls = document.createElement('div');
  controls.className = 'task-card-controls';

  if (readOnly) {
    // Read-only: just show a compact type tag
    const tag = document.createElement('span');
    tag.className = 'type-btn';
    tag.style.cursor = 'default';
    if (isKnowledge) {
      tag.textContent = '📚 知识';
      tag.classList.add('active-knowledge');
    } else {
      tag.textContent = '📄 事项';
      tag.classList.add('active-task');
    }
    controls.appendChild(tag);
  } else {
    // Edit mode: compact type toggle pills
    const taskBtn = document.createElement('button');
    taskBtn.className = 'type-btn' + (!isKnowledge ? ' active-task' : '');
    taskBtn.textContent = '📄 事项';
    taskBtn.onclick = function() { toggleTaskType(task.id, 'task'); };
    controls.appendChild(taskBtn);

    const kBtn = document.createElement('button');
    kBtn.className = 'type-btn' + (isKnowledge ? ' active-knowledge' : '');
    kBtn.textContent = '📚 知识';
    kBtn.onclick = function() { toggleTaskType(task.id, 'knowledge'); };
    controls.appendChild(kBtn);
  }

  // ═══ Star + URL (both 事项 and 知识) ═══
  const star = document.createElement('button');
  star.className = 'priority-star' + (task.starred ? ' active' : '');
  star.innerHTML = task.starred ? '⭐' : '☆';
  star.title = task.starred ? '已标记为重要' : '标记为重要';
  star.style.cssText = 'min-width:22px;min-height:22px;width:22px;height:22px;font-size:12px;flex-shrink:0;';
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
  controls.appendChild(star);

  // URL link button (both task types)
  const hasUrl = task.sourceUrl && task.sourceUrl.trim();
  if (hasUrl) {
    const linkBtn = document.createElement('a');
    linkBtn.href = task.sourceUrl;
    linkBtn.target = '_blank';
    linkBtn.rel = 'noopener';
    linkBtn.style.cssText = 'min-width:22px;min-height:22px;width:22px;height:22px;border-radius:5px;border:0.5px solid #6ee7b7;background:#ecfdf5;text-decoration:none;font-size:12px;display:flex;align-items:center;justify-content:center;opacity:0.9;flex-shrink:0;';
    linkBtn.title = '打开链接';
    linkBtn.innerHTML = '🔗';
    linkBtn.onclick = function(e) { e.stopPropagation(); };
    controls.appendChild(linkBtn);
  } else if (!readOnly) {
    const addUrlBtn = document.createElement('button');
    addUrlBtn.style.cssText = 'min-width:22px;min-height:22px;width:22px;height:22px;border-radius:5px;border:0.5px solid var(--border);background:transparent;cursor:pointer;font-size:12px;opacity:0.4;padding:0;flex-shrink:0;display:flex;align-items:center;justify-content:center;';
    addUrlBtn.title = '贴上链接';
    addUrlBtn.innerHTML = '🔗';
    addUrlBtn.onclick = function(e) {
      e.stopPropagation();
      showUrlInline(controls, task.id);
    };
    controls.appendChild(addUrlBtn);
  }

  // Delete button (always last)
  if (!readOnly) {
    const del = document.createElement('button');
    del.className = 'task-delete-btn';
    del.innerHTML = '×';
    del.title = '删除';
    del.style.cssText = 'min-width:28px;min-height:28px;width:28px;height:28px;font-size:16px;';
    del.onclick = function() { deleteTask(task.id); };
    controls.appendChild(del);
  }

  topRow.appendChild(controls);
  card.appendChild(topRow);

  container.appendChild(card);

  // Auto-resize textarea
  setTimeout(() => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }, 0);
}

/* ─── URL Input (inline in bottom row) ─── */
function showUrlInline(container, taskId) {
  // Remove existing URL input if any
  const existing = container.querySelector('.url-input-wrap');
  if (existing) { existing.remove(); return; }

  const wrap = document.createElement('span');
  wrap.className = 'url-input-wrap';
  wrap.style.cssText = 'display:inline-flex;align-items:center;gap:3px;';

  const input = document.createElement('input');
  input.className = 'url-input-inline';
  input.placeholder = '粘贴链接…';
  input.style.cssText = 'font-family:inherit;font-size:10px;border:0.5px solid var(--border);border-radius:4px;padding:2px 6px;outline:none;width:140px;height:22px;';
  input.onkeydown = function(e) {
    if (e.key === 'Enter') confirmUrl();
    if (e.key === 'Escape') { wrap.remove(); }
  };
  wrap.appendChild(input);

  const confirmBtn = document.createElement('button');
  confirmBtn.style.cssText = 'background:var(--primary);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:10px;padding:2px 8px;height:22px;';
  confirmBtn.textContent = '确定';
  confirmBtn.onclick = confirmUrl;
  wrap.appendChild(confirmBtn);

  async function confirmUrl() {
    const url = input.value.trim();
    if (!url) { wrap.remove(); return; }
    const d = await API.getDay(currentDate);
    const t = (d.morningTasks||[]).find(x => x.id === taskId);
    if (t) { t.sourceUrl = url; await API.saveDay(currentDate, d); }
    await renderToday();
  }

  container.appendChild(wrap);
  input.focus();
}
function renderEveningForm(data) {
  const container = document.getElementById('evening-task-cards');
  container.innerHTML = '';
  const realTasks = (data.morningTasks||[]).filter(t => (t.text||'').trim());
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
  realTasks.forEach(t => renderOne(t, idx++));

  document.getElementById('evening-note').value = data.eveningNote || '';
}

/* ─── Evening Summary ─── */
function renderEveningSummary(data) {
  const tasks = (data.morningTasks||[]).filter(t => (t.text||'').trim());

  const done = tasks.filter(t => t.status === 'done').length;
  const partial = tasks.filter(t => t.status === 'partial').length;
  const miss = tasks.filter(t => t.status === 'miss').length;
  const total = tasks.length;
  const rate = total > 0 ? Math.round(done/total*100) : 0;

  document.getElementById('summary-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">完成率</div><div class="metric-value ${rate>=80?'green':rate>=50?'warn':'red'}">${rate}%</div></div>
    <div class="metric-card"><div class="metric-label">已完成</div><div class="metric-value green">${done}</div></div>
    <div class="metric-card"><div class="metric-label">部分完成</div><div class="metric-value warn">${partial}</div></div>
    <div class="metric-card"><div class="metric-label">未完成</div><div class="metric-value red">${miss}</div></div>
  `;

  const chipsEl = document.getElementById('summary-task-chips');
  chipsEl.innerHTML = '';

  // Render all task chips flat (no grouping headers)
  const row = document.createElement('div');
  row.className = 'chip-row';
  tasks.forEach(function(t) {
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


/* ─── stats Page ─── */

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


/* ─── focus Page ─── */

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


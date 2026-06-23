/* render.js — Knowledge page rendering */

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

  // Save original 🔗 button before replacing content
  var originalBtn = linkWrap.querySelector('.task-url-btn');

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
  cancelBtn.onclick = function(e) {
    e.stopPropagation();
    wrap.remove();
    _activeUrlInput = null;
    // Restore original 🔗 button so it can be clicked again
    if (originalBtn) linkWrap.appendChild(originalBtn);
  };

  // Enter key to confirm
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); setTaskSourceUrl(taskId, inp.value); }
  });

  wrap.appendChild(inp);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(cancelBtn);

  // Replace content: keep originalBtn reference alive (already saved above)
  while (linkWrap.firstChild) linkWrap.removeChild(linkWrap.firstChild);
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

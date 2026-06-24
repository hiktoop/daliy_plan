/* ═══════════════════════════════════════════════════════
   actions.js — Auto-built from static/src/
   DO NOT EDIT — edit pages/{page}/actions.js instead
═══════════════════════════════════════════════════════ */


/* ─── today Page ─── */

/* actions.js — Today page interactions */

function syncInputsToDay(d) {
  const inputs = document.querySelectorAll('#morning-task-cards .task-card-input');
  inputs.forEach((input, i) => { if (d.morningTasks && d.morningTasks[i]) d.morningTasks[i].text = input.value; });
}

/* ─── Plan assignment (keep for backward compat) ─── */

async function setPlan(taskId, planType) {
  let d = await API.getDay(currentDate);
  if (d.savedMorning) { showToast('早间计划已保存，不可修改计划'); return; }
  syncInputsToDay(d);
  const t = (d.morningTasks||[]).find(x => x.id === taskId);
  if (!t) return;

  if (t.plan === planType) {
    if (t.planId) await API.deletePlan(t.planId);
    t.plan = null; delete t.planId; delete t.planStart;
    showToast('已取消计划');
  } else {
    if (!t.text) { showToast('请先填写事项内容'); return; }
    if (t.planId) await API.deletePlan(t.planId);
    const planStart = currentDate;
    const pId = uid();
    await API.createPlan({ id: pId, text: t.text, plan: planType, planStart: planStart, planEnd: null });
    t.plan = planType; t.planId = pId; t.planStart = planStart;
    showToast(PLAN_META[planType].days ? `已设为${PLAN_META[planType].label}计划，连续 ${PLAN_META[planType].days} 天` : '已设为长期计划，每天自动出现');
  }
  await API.saveDay(currentDate, d);
  await renderToday();
}

/* ─── Type toggle (知识/事项) ─── */

async function toggleTaskType(taskId, newType) {
  var d = await API.getDay(currentDate);
  if (d.savedMorning) { showToast('早间计划已保存，不可修改'); return; }
  syncInputsToDay(d);
  var t = (d.morningTasks||[]).find(function(x) { return x.id === taskId; });
  if (!t) return;
  if (newType === 'knowledge') {
    t.itemType = 'knowledge';
    showToast('已设为知识事项，完成后将按艾宾浩斯曲线复习');
  } else {
    delete t.itemType;
    showToast('已设为普通事项');
  }
  await API.saveDay(currentDate, d);
  await renderToday();
}

/* ─── Add / Delete tasks ─── */

async function addTask(kind) {
  // kind: 'task' only (legacy param kept for backward compat)
  kind = kind || 'task';
  let d = await API.getDay(currentDate);
  if (d.savedMorning) { showToast('早间计划已保存，不可添加事项'); return; }
  if ((d.morningTasks||[]).length >= 10) return;
  syncInputsToDay(d);
  var newTask = { id: uid(), text: '', kind: 'task', status: null, eveningNote: '', plan: null };
  d.morningTasks.push(newTask);
  await API.saveDay(currentDate, d);
  await renderToday();
}

async function deleteTask(id) {
  let d = await API.getDay(currentDate);
  if (d.savedMorning) { showToast('早间计划已保存，不可删除事项'); return; }
  if ((d.morningTasks||[]).length <= 1) return;
  syncInputsToDay(d);
  const t = (d.morningTasks||[]).find(x => x.id === id);
  if (t && t.planId) {
    await API.deletePlan(t.planId);
    showToast('已删除，并从计划中移除');
  }
  d.morningTasks = d.morningTasks.filter(t => t.id !== id);
  await API.saveDay(currentDate, d);
  await renderToday();
}

/* ─── Save ─── */

async function saveMorning() {
  let d = await API.getDay(currentDate);
  if (d.savedMorning) { showToast('早间计划已保存，不可重复保存'); return; }
  const inputs = document.querySelectorAll('#morning-task-cards .task-card-input');
  inputs.forEach((input, i) => { if (d.morningTasks[i]) d.morningTasks[i].text = input.value.trim(); });
  const filled = (d.morningTasks||[]).filter(t => t.text || t.plan);
  if (filled.filter(t => t.text).length === 0) { showToast('请至少填写一项任务'); return; }
  d.morningTasks = filled;
  d.morningNote = document.getElementById('morning-note').value;
  d.savedMorning = true;

  // Sync plan text changes: archive old + create new (snapshot architecture)
  const plansRes = await API.getPlans();
  let planIdsChanged = false;
  for (const t of d.morningTasks) {
    if (t.plan && t.planId && t.text) {
      const p = plansRes.plans.find(x => x.id === t.planId);
      if (p && p.text !== t.text) {
        // Text changed → archive old plan, create new one
        await API.deletePlan(t.planId);  // archives old
        const newId = uid();
        await API.createPlan({ id: newId, text: t.text, plan: t.plan, planStart: currentDate, planEnd: null });
        t.planId = newId;
        t.planStart = currentDate;
        planIdsChanged = true;
      }
    }
  }
  // Save day data (with updated planIds if text changed)
  await API.saveDay(currentDate, d);
  showToast('早间计划已保存 ✓');
  await renderToday();
}

async function saveEvening() {
  let d = await API.getDay(currentDate);
  if (d.savedEvening) { showToast('复盘已保存，不可重复保存'); return; }
  if (!d || !d.savedMorning) { showToast('请先保存早间计划'); return; }

  const cards = document.querySelectorAll('#evening-task-cards .evening-task-card');
  cards.forEach(card => {
    const id = card.dataset.id;
    const t = (d.morningTasks||[]).find(x => x.id === id);
    if (!t) return;
    const sel = card.querySelector('.status-btn.selected-done, .status-btn.selected-partial, .status-btn.selected-miss');
    if (sel) {
      if (sel.classList.contains('selected-done')) t.status = 'done';
      else if (sel.classList.contains('selected-partial')) t.status = 'partial';
      else if (sel.classList.contains('selected-miss')) t.status = 'miss';
    }
    // Collect per-task evening note
    const noteInput = card.querySelector('.evening-task-note');
    if (noteInput) {
      t.eveningNote = noteInput.value;
    }
  });
  d.eveningNote = document.getElementById('evening-note').value;
  d.savedEvening = true;
  await API.saveDay(currentDate, d);

  // Update streaks
  for (const t of d.morningTasks) {
    if (t.planId) {
      await API.updateStreak(t.planId, currentDate, t.status === 'done' ? 'done' : '');
    }
  }
  showToast('复盘已保存 ✓');
  await renderToday();
}

/* ─── Day navigation ─── */

async function navDay(delta) {
  currentDate = offsetDate(currentDate, delta);
  history.pushState(null, '', '#' + currentDate);
  await renderToday();
}

async function goToday() {
  currentDate = todayStr();
  history.pushState(null, '', '#' + currentDate);
  await renderToday();
}

/* ─── Pomodoro Actions ─── */

/* ─── Review Actions ─── */

var _reviewingSet = {};

async function completeReview(reviewId, quality) {
  // 防重复点击：同一 reviewId 正在处理中
  if (_reviewingSet[reviewId]) return;
  _reviewingSet[reviewId] = true;
  try {
    var q = quality || 5;
    var res = await API.markReviewDone(reviewId, q);
    if (res.status === 'graduated') {
      showToast('🎓 已掌握！6轮复习完成');
    } else {
      var label = quality === 1 ? '已标记为忘了' : (quality === 3 ? '勉强记得' : '复习完成 ✓');
      showToast(label + ' · 下次：' + res.nextReview + '（' + res.interval + '天后）');
    }
    _reviewingSet[reviewId] = false;
    await renderToday();
  } catch(e) {
    _reviewingSet[reviewId] = false;
    showToast('操作失败');
  }
}

function reviewRemember(reviewId) {
  completeReview(reviewId, 5);
}

function reviewForgot(reviewId) {
  completeReview(reviewId, 1);
}

async function deleteReview(reviewId) {
  if (!confirm('确定删除这个复习计划？')) return;
  try {
    await API.deleteReview(reviewId);
    showToast('已删除');
    await renderKnowledgeOverview();
  } catch(e) {
    showToast('删除失败');
  }
}

/* ─── Knowledge Page ─── */


/* ─── pomodoro Page ─── */

/* actions.js — Pomodoro page interactions */

async function pomoStart() {
  pomoState.taskId = document.getElementById('pomo-task-select').value || null;
  pomoState.taskText = document.getElementById('pomo-task-select').selectedOptions[0]?.textContent || '';

  // 请求通知权限（倒计时模式，用户主动点击时触发）
  if (pomoState.mode === 'countdown' && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // 预创建 AudioContext（用户点击上下文，不会被浏览器暂停）
  if (!pomoState.audioCtx) {
    pomoState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (pomoState.audioCtx.state === 'suspended') {
    pomoState.audioCtx.resume();
  }

  // Create session on backend
  const res = await fetch('/api/focus/start', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({task_id: pomoState.taskId, task_text: pomoState.taskText})
  }).then(r => r.json());

  pomoState.sessionId = res.id;
  // 用浏览器本地时间作为计时基准，避免服务器与客户端时钟不同步导致负数
  pomoState.startTs = Date.now() / 1000;
  pomoState.elapsed = 0;
  pomoState.running = true;
  pomoState.paused = false;

  pomoSetButtons(true, false);
  pomoUpdateDisplay();

  const isCountdown = pomoState.mode === 'countdown';
  const targetMs = isCountdown ? pomoState.targetSec * 1000 : null;

  pomoState.timerInterval = setInterval(async () => {
    if (!pomoState.paused) {
      pomoState.elapsed = Math.floor((Date.now()/1000) - pomoState.startTs);

      // Countdown: freeze when target reached, wait for manual completion
      if (isCountdown && pomoState.elapsed >= pomoState.targetSec) {
        pomoState.elapsed = pomoState.targetSec;
        pomoUpdateDisplay();
        clearInterval(pomoState.timerInterval);
        pomoState.finished = true;

        // 保持按钮不变（暂停 + 完成），等待用户手动完成
        pomoSetButtons(true, false);
        showToast('⏱ 倒计时结束！请点击完成按钮 ✓');

        // 开始循环播放提示音，直到用户点击"完成"
        pomoStartBeep();
        return;
      }

      pomoUpdateDisplay();
    }
  }, 250);

  // Show active task
  if (pomoState.taskId) {
    document.getElementById('pomo-active-task').style.display = '';
    document.getElementById('pomo-task-name').textContent = pomoState.taskText;
  }
}

async function pomoPause() {
  if (!pomoState.running || pomoState.finished) return;
  pomoState.paused = !pomoState.paused;
  pomoSetButtons(true, pomoState.paused);
}

async function pomoStop() {
  if (!pomoState.sessionId) return;

  // 停止循环提示音
  pomoStopBeep();

  // Stop timer
  clearInterval(pomoState.timerInterval);

  // 倒计时结束后：已用时间冻结为目标时间，传 targetSec 而非实际流逝时间
  var duration;
  if (pomoState.finished) {
    pomoState.elapsed = pomoState.targetSec;
    duration = pomoState.targetSec;
  } else {
    pomoState.elapsed = Math.floor((Date.now()/1000) - pomoState.startTs);
    duration = pomoState.elapsed;
  }
  pomoUpdateDisplay();

  // Save to backend
  await fetch('/api/focus/' + pomoState.sessionId + '/stop', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({note: '', duration: duration})
  });

  // Reset state
  pomoState.running = false;
  pomoState.paused = false;
  pomoState.finished = false;
  pomoState.sessionId = null;
  pomoState.startTs = null;
  pomoState.elapsed = 0;

  pomoSetButtons(false, false);
  pomoUpdateDisplay();

  showToast('专注记录已保存 ✓');
  await pomoRefreshStats();
}

async function pomoReset() {
  // 停止提示音（倒计时结束后可能还在响）
  pomoStopBeep();

  clearInterval(pomoState.timerInterval);

  // Delete session if created
  if (pomoState.sessionId) {
    await fetch('/api/focus/' + pomoState.sessionId, {method: 'DELETE'});
  }

  pomoState.running = false;
  pomoState.paused = false;
  pomoState.finished = false;
  pomoState.sessionId = null;
  pomoState.startTs = null;
  pomoState.elapsed = 0;

  pomoSetButtons(false, false);
  pomoUpdateDisplay();
  document.getElementById('pomo-active-task').style.display = 'none';
}

/* ─── 倒计时结束循环提示音 ─── */

/** 开始循环播放提示音（每 2 秒一次），直到用户点击"完成" */
function pomoStartBeep() {
  pomoStopBeep();
  pomoBeepOnce();  // 立刻响一声
  pomoState.beepInterval = setInterval(pomoBeepOnce, 2000);

  // 桌面通知（仅在倒计时首次结束时发一次）
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('⏱ 专注完成', {
      body: '倒计时结束，你已专注 ' + (pomoState.targetSec / 60) + ' 分钟！请点击完成按钮',
      icon: '/static/favicon.ico'
    });
  }

  // 手机振动（短-长-短 模式）
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 200]);
  }
}

/** 停止循环提示音 */
function pomoStopBeep() {
  if (pomoState.beepInterval) {
    clearInterval(pomoState.beepInterval);
    pomoState.beepInterval = null;
  }
}

/** 播放一次提示音（三连音 C5→E5→G5） */
function pomoBeepOnce() {
  try {
    var ctx = pomoState.audioCtx;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      pomoState.audioCtx = ctx;
    }
    if (ctx.state === 'suspended') ctx.resume();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    gain.gain.value = 0.3;
    // 三连音：C5 E5 G5
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {}
}

/* ─── Habits Actions ─── */


/* ─── habits Page ─── */

/* actions.js — Habits page interactions */

function showAddHabit() {
  document.getElementById('habit-add-card').style.display = '';
  document.getElementById('habit-add-name').focus();
}

function cancelAddHabit() {
  document.getElementById('habit-add-card').style.display = 'none';
  document.getElementById('habit-add-name').value = '';
}

async function createHabit() {
  var name = document.getElementById('habit-add-name').value.trim();
  if (!name) { showToast('请输入习惯名称'); return; }
  var freq = document.getElementById('habit-add-freq').value;
  var icon = document.getElementById('habit-add-icon').value;

  var colors = ['#BA7517','#378ADD','#639922','#D4537E','#534AB7','#1D9E75','#D85A30','#993556'];
  var color = colors[Math.floor(Math.random() * colors.length)];

  try {
    await API.createHabit({ name: name, frequency: freq, icon: icon, color: color });
    showToast('习惯已创建 ✓');
    document.getElementById('habit-add-name').value = '';
    document.getElementById('habit-add-card').style.display = 'none';
    await renderHabits();
  } catch(e) {
    showToast('创建失败，请重试');
  }
}

async function toggleCheckIn(habitId, currentlyChecked) {
  if (currentlyChecked) {
    // Uncheck: no note needed
    await API.uncheck(habitId);
    showToast('已取消打卡');
    await renderHabits();
  } else {
    // Check in: show note dialog
    showCheckInDialog(habitId);
  }
}

function showCheckInDialog(habitId) {
  // Remove any existing dialog
  var existing = document.getElementById('checkin-dialog-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'checkin-dialog-overlay';
  overlay.className = 'checkin-overlay';
  overlay.onclick = function(e) {
    if (e.target === overlay) closeCheckInDialog();
  };

  var dialog = document.createElement('div');
  dialog.className = 'checkin-dialog card';
  dialog.onclick = function(e) { e.stopPropagation(); };

  dialog.innerHTML =
    '<div class="checkin-dialog-title">📝 打卡备注</div>' +
    '<textarea class="checkin-dialog-note" id="checkin-note" placeholder="今天有什么想记录的？（可选）" rows="3"></textarea>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button class="pomo-btn pomo-reset" onclick="closeCheckInDialog()" style="font-size:12px;">跳过</button>' +
      '<button class="pomo-btn pomo-start" onclick="confirmCheckIn(\'' + habitId + '\')" style="font-size:12px;">打卡 ✓</button>' +
    '</div>';

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Focus the textarea
  setTimeout(function() {
    var ta = document.getElementById('checkin-note');
    if (ta) ta.focus();
  }, 100);
}

function closeCheckInDialog() {
  var overlay = document.getElementById('checkin-dialog-overlay');
  if (overlay) overlay.remove();
}

async function confirmCheckIn(habitId) {
  var note = document.getElementById('checkin-note').value.trim();
  closeCheckInDialog();
  await API.checkIn(habitId, note);
  showToast(note ? '打卡成功 ✓（已保存备注）' : '打卡成功 ✓');
  await renderHabits();
}

async function archiveHabit(habitId) {
  if (!confirm('确定归档这个习惯吗？归档后不再显示在主列表。')) return;
  await API.deleteHabit(habitId);
  showToast('习惯已归档');
  await renderHabits();
}

/* ─── Review Actions ─── */


/* ─── knowledge Page ─── */

/* actions.js — Knowledge page interactions */

function showAddKnowledge() {
  document.getElementById('knowledge-add-card').style.display = '';
  document.getElementById('knowledge-add-text').focus();
}

function cancelAddKnowledge() {
  document.getElementById('knowledge-add-card').style.display = 'none';
  document.getElementById('knowledge-add-text').value = '';
}

async function createKnowledge() {
  var text = document.getElementById('knowledge-add-text').value.trim();
  if (!text) { showToast('请输入知识点'); return; }
  try {
    var res = await API.createReview(text);
    document.getElementById('knowledge-add-text').value = '';
    document.getElementById('knowledge-add-card').style.display = 'none';
    showToast('知识已创建 ✓ · 明天开始复习');
    await renderKnowledgeOverview();
  } catch(e) {
    showToast('创建失败');
  }
}


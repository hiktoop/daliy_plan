/* actions.js — Today page interactions */

function syncInputsToDay(d) {
  const inputs = document.querySelectorAll('#morning-task-list .task-input');
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
  const inputs = document.querySelectorAll('#morning-task-list .task-input');
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

  const lis = document.querySelectorAll('#evening-task-list .task-item');
  lis.forEach(li => {
    const id = li.dataset.id;
    const t = (d.morningTasks||[]).find(x => x.id === id);
    if (!t) return;
    const sel = li.querySelector('.status-btn.selected-done, .status-btn.selected-partial, .status-btn.selected-miss');
    if (sel) {
      if (sel.classList.contains('selected-done')) t.status = 'done';
      else if (sel.classList.contains('selected-partial')) t.status = 'partial';
      else if (sel.classList.contains('selected-miss')) t.status = 'miss';
    }
    // Collect per-task evening note
    const noteInput = li.querySelector('.evening-task-note');
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

async function completeReview(reviewId, quality) {
  try {
    var q = quality || 5;
    var res = await API.markReviewDone(reviewId, q);
    if (res.status === 'graduated') {
      showToast('🎓 已掌握！6轮复习完成');
    } else {
      var label = quality === 1 ? '已标记为忘了' : (quality === 3 ? '勉强记得' : '复习完成 ✓');
      showToast(label + ' · 下次：' + res.nextReview + '（' + res.interval + '天后）');
    }
    await renderToday();
  } catch(e) {
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

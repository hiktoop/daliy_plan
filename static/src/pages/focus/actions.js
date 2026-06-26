/* actions.js — Focus page (Pomodoro + Habits) */

/* ═══════ Pomodoro Actions ═══════ */

async function pomoStart() {
  pomoState.taskId = document.getElementById('pomo-task-select').value || null;
  pomoState.taskText = document.getElementById('pomo-task-select').selectedOptions[0] ? document.getElementById('pomo-task-select').selectedOptions[0].textContent : '';

  if (pomoState.mode === 'countdown' && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  if (!pomoState.audioCtx) {
    pomoState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (pomoState.audioCtx.state === 'suspended') {
    pomoState.audioCtx.resume();
  }

  const res = await fetch('/api/focus/start', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({task_id: pomoState.taskId, task_text: pomoState.taskText})
  }).then(function(r) { return r.json(); });

  pomoState.sessionId = res.id;
  pomoState.startTs = Date.now() / 1000;
  pomoState.elapsed = 0;
  pomoState.running = true;
  pomoState.paused = false;

  pomoSetButtons(true, false);
  pomoUpdateDisplay();

  const isCountdown = pomoState.mode === 'countdown';

  pomoState.timerInterval = setInterval(async function() {
    if (!pomoState.paused) {
      pomoState.elapsed = Math.floor((Date.now()/1000) - pomoState.startTs);

      if (isCountdown && pomoState.elapsed >= pomoState.targetSec) {
        pomoState.elapsed = pomoState.targetSec;
        pomoUpdateDisplay();
        clearInterval(pomoState.timerInterval);
        pomoState.finished = true;
        pomoSetButtons(true, false);
        showToast('⏱ 倒计时结束！请点击完成按钮 ✓');
        pomoStartBeep();
        return;
      }

      pomoUpdateDisplay();
    }
  }, 250);

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

  pomoStopBeep();
  clearInterval(pomoState.timerInterval);

  var duration;
  if (pomoState.finished) {
    pomoState.elapsed = pomoState.targetSec;
    duration = pomoState.targetSec;
  } else {
    pomoState.elapsed = Math.floor((Date.now()/1000) - pomoState.startTs);
    duration = pomoState.elapsed;
  }
  pomoUpdateDisplay();

  await fetch('/api/focus/' + pomoState.sessionId + '/stop', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({note: '', duration: duration})
  });

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
  pomoStopBeep();
  clearInterval(pomoState.timerInterval);

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

function pomoStartBeep() {
  pomoStopBeep();
  pomoBeepOnce();
  pomoState.beepInterval = setInterval(pomoBeepOnce, 2000);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('⏱ 专注完成', {
      body: '倒计时结束，你已专注 ' + (pomoState.targetSec / 60) + ' 分钟！请点击完成按钮',
      icon: '/static/favicon.ico'
    });
  }

  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 200]);
  }
}

function pomoStopBeep() {
  if (pomoState.beepInterval) {
    clearInterval(pomoState.beepInterval);
    pomoState.beepInterval = null;
  }
}

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
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {}
}

/* ═══════ Habits Actions ═══════ */

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
    await API.uncheck(habitId);
    showToast('已取消打卡');
    await renderHabits();
  } else {
    showCheckInDialog(habitId);
  }
}

function showCheckInDialog(habitId) {
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

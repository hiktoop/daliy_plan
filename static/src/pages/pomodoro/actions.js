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

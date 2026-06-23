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

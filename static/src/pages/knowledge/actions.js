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

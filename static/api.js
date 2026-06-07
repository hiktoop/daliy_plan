/* ═══════════════════════════════════════════════════════
   api.js — API layer + in-memory cache
   Depends on: app.js (showToast, currentDate, todayStr)
═══════════════════════════════════════════════════════ */

let _dayCache = {};
let _plansCache = null;
let _daysListCache = null;

const API = {
  async _fetch(url, opts) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch(e) {
      showToast('⚠️ 无法连接服务器，请确认后端已启动（双击 start.bat）');
      throw e;
    }
    if (!res.ok) {
      showToast(`⚠️ 服务器错误 (${res.status})，请检查后端日志`);
      throw new Error(`API ${res.status}: ${url}`);
    }
    return res.json();
  },

  // ── Days ──
  async getDay(dateStr) {
    if (_dayCache[dateStr]) return _dayCache[dateStr];
    const data = await this._fetch('/api/tasks/' + dateStr);
    if (!data._new) _dayCache[dateStr] = data;
    return data;
  },
  async saveDay(dateStr, payload) {
    const data = await this._fetch('/api/tasks/' + dateStr, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    delete _dayCache[dateStr];
    _daysListCache = null;
    return data;
  },
  async listDays() {
    if (_daysListCache) return _daysListCache;
    const res = await this._fetch('/api/tasks');
    _daysListCache = res.days;
    return res.days;
  },

  // ── Plans ──
  async getPlans() {
    if (_plansCache) return _plansCache;
    const res = await this._fetch('/api/plans');
    _plansCache = res;
    return res;
  },
  async createPlan(planData) {
    const res = await this._fetch('/api/plans', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(planData)
    });
    _plansCache = null;
    delete _dayCache[currentDate];
    return res;
  },
  async deletePlan(planId) {
    const res = await this._fetch('/api/plans/' + planId, { method: 'DELETE' });
    _plansCache = null;
    delete _dayCache[currentDate];
    return res;
  },

  // ── Streaks ──
  async updateStreak(planId, dateStr, status) {
    await this._fetch('/api/streaks/' + planId + '?date_str=' + encodeURIComponent(dateStr) + '&status=' + encodeURIComponent(status), { method: 'POST' });
    _plansCache = null;
  },

  // ── Habits ──
  async getHabits() {
    return this._fetch('/api/habits');
  },
  async createHabit(data) {
    const res = await this._fetch('/api/habits', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    return res;
  },
  async deleteHabit(id) {
    const res = await this._fetch('/api/habits/' + id, { method: 'DELETE' });
    return res;
  },
  async checkIn(habitId, note) {
    return this._fetch('/api/habits/' + habitId + '/check', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ note: note || '' })
    });
  },
  async uncheck(habitId) {
    return this._fetch('/api/habits/' + habitId + '/check', { method: 'DELETE' });
  },
  async getHeatmap(days) {
    return this._fetch('/api/habits/heatmap?days=' + (days||84));
  },

  // ── Reviews (Ebbinghaus + SM-2) ──
  async createReview(taskText) {
    return this._fetch('/api/tasks/review', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ task_text: taskText })
    });
  },
  async getDueReviews(dateStr) {
    return this._fetch('/api/tasks/reviews/due?date_str=' + encodeURIComponent(dateStr || todayStr()));
  },
  async markReviewDone(reviewId, quality) {
    var q = (quality !== undefined) ? quality : 5;
    return this._fetch('/api/tasks/review/' + reviewId + '/done?quality=' + q, { method: 'POST' });
  },
  async deleteReview(reviewId) {
    return this._fetch('/api/tasks/review/' + reviewId, { method: 'DELETE' });
  },
  async getReviewsOverview() {
    return this._fetch('/api/tasks/reviews/overview');
  },

  // ── Diary ──
  async getDiary(dateStr) {
    return this._fetch('/api/diary/' + encodeURIComponent(dateStr));
  },
  async saveDiary(dateStr, content) {
    return this._fetch('/api/diary/' + encodeURIComponent(dateStr), {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ content: content })
    });
  },
  async deleteDiary(dateStr) {
    return this._fetch('/api/diary/' + encodeURIComponent(dateStr), { method: 'DELETE' });
  },

  // ── Folders ──
  async getFolderTree() {
    return this._fetch('/api/folders/tree');
  },
  async createFolder(data) {
    return this._fetch('/api/folders', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
  },
  async updateFolder(id, data) {
    return this._fetch('/api/folders/' + encodeURIComponent(id), {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
  },
  async deleteFolder(id) {
    return this._fetch('/api/folders/' + encodeURIComponent(id), { method: 'DELETE' });
  },

  // ── Notes ──
  async listNotes(q, folderId) {
    var parts = [];
    if (q) parts.push('q=' + encodeURIComponent(q));
    if (folderId) parts.push('folderId=' + encodeURIComponent(folderId));
    var url = '/api/notes' + (parts.length ? '?' + parts.join('&') : '');
    return this._fetch(url);
  },
  async createNote(data) {
    return this._fetch('/api/notes', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
  },
  async getNote(id) {
    return this._fetch('/api/notes/' + encodeURIComponent(id));
  },
  async updateNote(id, data) {
    return this._fetch('/api/notes/' + encodeURIComponent(id), {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
  },
  async deleteNote(id) {
    return this._fetch('/api/notes/' + encodeURIComponent(id), { method: 'DELETE' });
  },
};

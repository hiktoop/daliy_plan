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
  }
};

/* render.js — Charts page rendering */

async function renderCharts() {
  const days = await API.listDays();
  const stats = window.DailyTasksAPI.computeStats(days);
  const totalDays = days.length;
  const reviewDays = days.filter(d => d.savedEvening).length;

  document.getElementById('global-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">记录天数</div><div class="metric-value">${totalDays}</div></div>
    <div class="metric-card"><div class="metric-label">已复盘</div><div class="metric-value">${reviewDays}</div></div>
    <div class="metric-card"><div class="metric-label">总任务数</div><div class="metric-value">${stats.total}</div></div>
    <div class="metric-card"><div class="metric-label">整体完成率</div><div class="metric-value ${stats.rate>=80?'green':stats.rate>=50?'warn':'red'}">${stats.rate !== null ? stats.rate+'%' : '—'}</div></div>
  `;

  const reviewed = days.filter(d => d.savedEvening).slice(0, 30).reverse();

  // Trend chart
  destroyChart('chart-trend');
  if (reviewed.length === 0) {
    document.getElementById('chart-trend').parentElement.innerHTML = '<div class="empty-state" style="padding:50px 20px;"><div class="empty-icon">&#128202;</div>完成复盘后这里将显示趋势图</div>';
  } else {
    const labels = reviewed.map(d => d.date.slice(5));
    const rates = reviewed.map(d => {
      const ts = (d.morningTasks||[]).filter(t => (t.text||'').trim());
      const dn = ts.filter(t => t.status === 'done').length;
      return ts.length > 0 ? Math.round(dn/ts.length*100) : 0;
    });
    const pointRadius = reviewed.length <= 2 ? 8 : (reviewed.length <= 7 ? 6 : 4);
    charts['chart-trend'] = new Chart(document.getElementById('chart-trend'), {
      type: 'line',
      data: { labels, datasets: [{ label: '完成率', data: rates, borderColor: '#3b6d11', backgroundColor: 'rgba(59,109,17,0.08)', fill: true, tension: 0.35, pointRadius: pointRadius, pointBackgroundColor: '#3b6d11', pointBorderColor: '#fff', pointBorderWidth: 2, pointHoverRadius: pointRadius + 2, borderWidth: 2.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '完成率: ' + ctx.parsed.y + '%' } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: v => v+'%', color: '#9a9a94', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { color: '#9a9a94', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } }
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
      legend.innerHTML = `
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#639922;display:inline-block;"></span>完成 ${stats.done}</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#ba7517;display:inline-block;"></span>部分 ${stats.partial}</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#a32d2d;display:inline-block;"></span>未完成 ${stats.miss}</span>`;
      parent.appendChild(legend);
    }
  }

  // Daily count bar
  destroyChart('chart-count');
  if (reviewed.length > 0) {
    const countLabels = reviewed.map(d => d.date.slice(5));
    const countData = reviewed.map(d => (d.morningTasks||[]).filter(t => (t.text||'').trim()).length);
    charts['chart-count'] = new Chart(document.getElementById('chart-count'), {
      type: 'bar',
      data: { labels: countLabels, datasets: [{ label: '任务数', data: countData, backgroundColor: '#b5d4f4', borderColor: '#185fa5', borderWidth: 1, borderRadius: 3, maxBarThickness: 32, barPercentage: 0.7 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '任务数: ' + ctx.parsed.y } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#9a9a94', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { ticks: { color: '#9a9a94', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } } }
    });
  }

  // Ebbinghaus forgetting curve
  renderEbbinghausCurve();
}

/* ─── Ebbinghaus Curve ─── */

function renderEbbinghausCurve() {
  destroyChart('chart-ebbinghaus');

  // Generate data points: day 0–60 (review 6 is at day 29+30=59)
  var maxDay = 62;
  var labels = [];
  var rawData = [];      // without review
  var withReviewData = []; // with spaced reviews
  var reviewMarkers = []; // scatter points at review moments
  var reviewVlines = [];  // vertical lines at review days

  // Review schedule: cumulative days
  var intervals = [1, 2, 4, 7, 15, 30];
  var reviewDays = [0]; // day 0 = learning
  var cumDay = 0;
  for (var i = 0; i < intervals.length; i++) {
    cumDay += intervals[i];
    reviewDays.push(cumDay);
  }

  // Stability values increase with each review
  var stabilities = [1.2, 2.5, 6, 14, 40, 100, 250];

  // Generate day-by-day data
  var currentStability = stabilities[0];
  var segmentStart = 0;
  var ri = 0; // review index (0 = initial learning)

  for (var d = 0; d <= maxDay; d++) {
    labels.push(String(d));

    // Raw forgetting (no review): fast decay
    rawData.push(Math.max(0, Math.round(100 * Math.exp(-d / 2.2))));

    // With review: sawtooth pattern
    var daysSinceLastReview = d - segmentStart;
    var retention = Math.round(100 * Math.exp(-daysSinceLastReview / currentStability));

    // Check if this is a review day (boost to 100%)
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

  // Create Chart.js datasets
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

  // Add vertical lines at review days using dashed line segments
  // Chart.js doesn't support vertical lines natively, so add via plugin
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

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));

export function dayStats(day) {
  const items = day?.occurrences || [];
  const completed = items.filter((item) => day?.completions?.[item.id]).length;
  const possible = items.length;
  return { completed, possible, percent: possible ? Math.round(completed / possible * 100) : 0 };
}

export function analyticsForDays(days = [], throughDate = null) {
  const relevant = days.filter((day) => !throughDate || day.date <= throughDate);
  const daily = relevant.map((day) => ({ date: day.date, weekday: day.weekday, ...dayStats(day) }));
  const completed = daily.reduce((sum, day) => sum + day.completed, 0);
  const possible = daily.reduce((sum, day) => sum + day.possible, 0);
  const perfectDays = daily.filter((day) => day.possible > 0 && day.completed === day.possible).length;

  let currentStreak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].possible > 0 && daily[i].completed > 0) currentStreak++;
    else if (daily[i].possible > 0) break;
  }
  let bestStreak = 0, run = 0;
  for (const day of daily) {
    if (day.possible > 0 && day.completed > 0) { run++; bestStreak = Math.max(bestStreak, run); }
    else if (day.possible > 0) run = 0;
  }

  const activityMap = new Map();
  for (const day of relevant) {
    for (const occurrence of day.occurrences || []) {
      const key = occurrence.activityId;
      const row = activityMap.get(key) || { id: key, name: occurrence.activityName || key, completed: 0, possible: 0 };
      row.possible++;
      if (day.completions?.[occurrence.id]) row.completed++;
      activityMap.set(key, row);
    }
  }
  const activities = [...activityMap.values()].map((row) => ({ ...row, percent: row.possible ? Math.round(row.completed / row.possible * 100) : 0 })).sort((a, b) => b.percent - a.percent || b.possible - a.possible);
  return { completed, possible, rate: possible ? Math.round(completed / possible * 100) : 0, perfectDays, currentStreak, bestStreak, daily, activities };
}

function svgWrap(content, height = 220) {
  return `<svg class="chart-svg" viewBox="0 0 720 ${height}" role="img" aria-label="Habit progress chart" preserveAspectRatio="none">${content}</svg>`;
}

export function lineChart(points = []) {
  const width = 720, height = 220, left = 34, right = 16, top = 18, bottom = 34;
  const innerW = width - left - right, innerH = height - top - bottom;
  if (!points.length) return '<div class="chart-empty">No progress data yet.</div>';
  const coords = points.map((p, i) => ({ x: left + (points.length === 1 ? innerW / 2 : i * innerW / (points.length - 1)), y: top + innerH * (1 - clamp(p.percent) / 100), ...p }));
  const grid = [0,25,50,75,100].map((v) => { const y = top + innerH * (1-v/100); return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="chart-grid"/><text x="4" y="${y+4}" class="chart-label">${v}%</text>`; }).join('');
  const poly = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const dots = coords.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="5" class="chart-dot"><title>${p.date}: ${p.percent}%</title></circle>${(i === 0 || i === coords.length-1 || i % Math.max(1, Math.ceil(coords.length/6)) === 0) ? `<text x="${p.x}" y="${height-8}" text-anchor="middle" class="chart-label">${p.date.slice(5)}</text>` : ''}`).join('');
  return svgWrap(`${grid}<polyline points="${poly}" class="chart-line"/>${dots}`, height);
}

export function barChart(items = [], limit = 8) {
  const rows = items.slice(0, limit);
  if (!rows.length) return '<div class="chart-empty">Complete a habit to see rankings.</div>';
  return `<div class="rank-chart">${rows.map((item, i) => `<div class="rank-row"><div class="rank-meta"><span>${i+1}. ${escapeMini(item.name)}</span><strong>${item.percent}%</strong></div><div class="bar-track"><span style="width:${clamp(item.percent)}%"></span></div><small>${item.completed}/${item.possible} completions</small></div>`).join('')}</div>`;
}

export function heatmap(days = []) {
  if (!days.length) return '<div class="chart-empty">No calendar data yet.</div>';
  return `<div class="heatmap" aria-label="Monthly consistency heatmap">${days.map((day) => `<div class="heat-cell heat-${heatBand(day.percent)}" title="${day.date}: ${day.percent}%"><span>${Number(day.date.slice(-2))}</span></div>`).join('')}</div>`;
}
function heatBand(percent) { if (percent >= 100) return 4; if (percent >= 75) return 3; if (percent >= 50) return 2; if (percent > 0) return 1; return 0; }
function escapeMini(value) { return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

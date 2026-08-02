import './styles.css';
import { ACTIVITIES, ALL_ALARM_IDS, FASTING_RANGES, isFastingDay, routineService } from './mock-service.js';
import { addDays, APP_TIME_ZONE, isInRanges, isOnOrBefore, monthKey, todayIso } from './date-utils.js';

const state = { day: null, monthDays: [], activityDays: [], progressToToday: true, activeView: 'home-view' };
const $ = (id) => document.getElementById(id);
const alarmActivity = (value) => value === 'fast' ? ['FAST_START', 'FAST_END'] : [ACTIVITIES.find(({ id }) => id === value)?.alarmId].filter(Boolean);

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function subtractMinutes(time, minutes) {
  const match = time?.match(/(\d+):(\d+)\s*(AM|PM)/i); if (!match) return null;
  let hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  const date = new Date(2000, 0, 1, hour, Number(match[2]) - minutes);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function timeMinutes(time) {
  if (!time) return 9998; const upper = time.toUpperCase();
  if (upper.includes('PRE-JUMMAH')) return 690; if (upper.includes('POST-GYM')) return 600; if (upper.includes('EVENING')) return 1200;
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)?/i); if (!match) return 9998;
  let hour = Number(match[1]); if (match[3]?.toUpperCase() === 'PM' && hour < 12) hour += 12; if (match[3]?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return hour * 60 + Number(match[2]);
}
function setRing(ringId, textId, percent) {
  const color = percent >= 100 ? '#3b82f6' : percent >= 80 ? '#22c55e' : percent >= 50 ? '#eab308' : '#ef4444';
  $(ringId).style.background = `conic-gradient(${color} ${percent}%, #e2e8f0 0%)`; $(textId).textContent = `${percent}%`; $(textId).style.color = color;
}
function alarmEnabled(day, id) { return day.alarmsEnabled && !day.disabledAlarmIds.includes(id); }
function isRamadan(date) { return isInRanges(date, FASTING_RANGES); }

function activityTime(activity, day) {
  if (activity.id === 'wake-up' && isFastingDay(day)) return subtractMinutes(day.prayerTimes.fastStart, 40);
  if (activity.id === 'tahajjud' && isFastingDay(day)) return subtractMinutes(day.prayerTimes.fastStart, 15);
  if (activity.id === 'sehri') return isFastingDay(day) ? `${subtractMinutes(day.prayerTimes.fastStart, 30)} - ${day.prayerTimes.fastStart}` : null;
  if (activity.id === 'gym' && isRamadan(day.date)) return 'Evening';
  if (activity.id === 'bath') return day.weekday === 'Friday' ? 'Pre-Jummah' : isRamadan(day.date) ? 'Evening' : 'Post-Gym';
  return day.prayerTimes[activity.prayerKey] || activity.defaultTime;
}

function renderDay() {
  const day = state.day; $('dayOfWeek').textContent = day.weekday;
  $('dailyAlarmText').style.color = day.alarmsEnabled ? '#166534' : '#ef4444'; $('dailyAlarmIcon').textContent = day.alarmsEnabled ? '🔔' : '🔕';
  const rows = ACTIVITIES.map((activity) => ({ activity, time: activityTime(activity, day) })).filter(({ time }) => time).sort((a, b) => {
    if (a.activity.id === 'wake-up') return -1; if (b.activity.id === 'wake-up') return 1; if (a.activity.id === 'sleep') return 1; if (b.activity.id === 'sleep') return -1; return timeMinutes(a.time) - timeMinutes(b.time);
  });
  $('routine-list').innerHTML = rows.map(({ activity, time }) => {
    const timing = activity.alarmId ? `<button class="${alarmEnabled(day, activity.alarmId) ? 'timing-alarm-on' : 'timing-alarm-off'}" data-alarm="${activity.alarmId}">${escapeHtml(time)}</button>` : `<span class="timing-no-alarm">${escapeHtml(time)}</span>`;
    return `<div class="routine-item"><div>${timing}</div><div class="activity-name">${escapeHtml(activity.name)}</div><div class="status"><input type="checkbox" data-completion="${activity.id}" aria-label="Complete ${escapeHtml(activity.name)}" ${day.completions[activity.id] ? 'checked' : ''}></div></div>`;
  }).join('');
  const enabledFast = (id) => alarmEnabled(day, id) ? 'timing-alarm-on' : 'timing-alarm-off';
  const fastActive = isFastingDay(day);
  $('fajr-display').innerHTML = `Fajr Time: <span class="timing-no-alarm">${day.prayerTimes.fastStart}</span> - <span class="timing-no-alarm">${day.prayerTimes.fajrEnd}</span>`;
  $('fast-display').innerHTML = fastActive ? `Fast Time: <button class="${enabledFast('FAST_START')}" data-alarm="FAST_START">${day.prayerTimes.fastStart}</button> - <button class="${enabledFast('FAST_END')}" data-alarm="FAST_END">${day.prayerTimes.fastEnd}</button>` : `Fast Time: <span class="timing-no-alarm">${day.prayerTimes.fastStart}</span> - <span class="timing-no-alarm">${day.prayerTimes.fastEnd}</span>`;
  $('bottom-timings').hidden = false; calculateDailyProgress();
}
function calculateDailyProgress() { const boxes = [...document.querySelectorAll('[data-completion]')]; setRing('dailyProgressRing', 'dailyProgressText', boxes.length ? Math.round(boxes.filter((box) => box.checked).length / boxes.length * 100) : 0); }
async function fetchRoutine() { $('routine-list').innerHTML = '<i>Loading data...</i>'; state.day = await routineService.getDay($('datePicker').value); renderDay(); }

function activityCell(day, activity) { const value = day.completions[activity.id]; return `<input type="checkbox" class="grid-checkbox" ${value ? 'checked' : ''} disabled>`; }
function relevantForProgress(day) { return !state.progressToToday || isOnOrBefore(day.date, todayIso()); }
function renderMonthly() {
  const considered = state.monthDays.filter(relevantForProgress); const possible = considered.length * ACTIVITIES.length; const completed = considered.reduce((sum, day) => sum + ACTIVITIES.filter((activity) => day.completions[activity.id]).length, 0);
  $('monthly-table').innerHTML = `<thead><tr><th>Date</th><th>Day</th>${ACTIVITIES.map(({ name }) => `<th>${escapeHtml(name)}</th>`).join('')}</tr></thead><tbody>${state.monthDays.map((day) => `<tr><td class="${day.alarmsEnabled ? 'date-alarm-on' : 'date-alarm-off'}" data-month-date="${day.date}">${day.date}</td><td>${day.weekday}</td>${ACTIVITIES.map((activity) => `<td>${activityCell(day, activity)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  const allOff = state.monthDays.every((day) => !day.alarmsEnabled); $('monthlyAlarmTitle').textContent = `Monthly Progress ${allOff ? '🔕' : '🔔'}`; $('monthlyAlarmTitle').style.color = allOff ? '#ef4444' : '#166534';
  setRing('monthlyProgressRing', 'monthlyProgressText', possible ? Math.round(completed / possible * 100) : 0); $('monthly-status').textContent = `Completed ${completed} out of ${possible} activities ${state.progressToToday ? '(Up to Today)' : '(Total for Month)'}.`;
}
async function fetchMonthly() { $('monthly-status').textContent = 'Loading monthly data...'; state.monthDays = await routineService.getMonth($('monthPicker').value); renderMonthly(); }

function visibleActivityDays() {
  const type = $('activityViewType').value; if (type !== 'weekly') return state.activityDays;
  const week = Number($('actWeekPicker').value); return state.activityDays.filter((day) => { const number = Number(day.date.slice(-2)); return week < 5 ? number >= (week - 1) * 7 + 1 && number <= week * 7 : number >= 29; });
}
function renderActivity() {
  const id = $('activitySelector').value; const activity = ACTIVITIES.find((item) => item.id === id); const isFast = id === 'fast'; const days = visibleActivityDays(); const alarmIds = alarmActivity(id);
  let possible = 0, completed = 0;
  const body = days.map((day) => {
    let value;
    if (isFast) { value = `${day.prayerTimes.fastStart} - ${day.prayerTimes.fastEnd}`; }
    else { value = activityCell(day, activity); if (relevantForProgress(day)) { possible++; if (day.completions[id]) completed++; } }
    const supported = alarmIds.length && (!isFast || isFastingDay(day)); const off = supported && alarmIds.every((alarmId) => !alarmEnabled(day, alarmId));
    return `<tr><td class="${supported ? (off ? 'date-alarm-off' : 'date-alarm-on') : 'date-no-alarm'}" ${supported ? `data-activity-date="${day.date}"` : ''}>${day.date}</td><td>${day.weekday}</td><td><span class="${isFast ? 'timing-no-alarm' : ''}">${value}</span></td></tr>`;
  }).join('');
  $('activity-table').innerHTML = `<thead><tr><th>Date</th><th>Day</th><th>${escapeHtml(isFast ? 'Fast (Start & End)' : activity.name)}</th></tr></thead><tbody>${body}</tbody>`;
  const canAlarm = alarmIds.length > 0; const allOff = canAlarm && days.filter((day) => !isFast || isFastingDay(day)).every((day) => alarmIds.every((alarmId) => !alarmEnabled(day, alarmId)));
  $('activityAlarmTitle').className = `clickable-title${canAlarm ? ' active' : ''}`; $('activityAlarmTitle').textContent = `Activity Progress${canAlarm ? ` ${allOff ? '🔕' : '🔔'}` : ''}`; $('activityAlarmTitle').style.color = allOff ? '#ef4444' : '#166534';
  setRing('activityProgressRing', 'activityProgressText', isFast ? 100 : possible ? Math.round(completed / possible * 100) : 0); $('activity-status').textContent = isFast ? 'Displaying Fast times for selected period.' : `Completed ${completed} times out of ${possible} applicable days ${state.progressToToday ? '(Up to Today)' : '(Total for Period)'}.`;
}
async function fetchActivity() { $('activity-status').textContent = 'Loading activity data...'; state.activityDays = $('activityViewType').value === 'yearly' ? await routineService.getYear($('actYearPicker').value) : await routineService.getMonth($('actMonthPicker').value); renderActivity(); }
function updateActivityControls() { const type = $('activityViewType').value; $('actMonthPicker').hidden = type === 'yearly'; $('actWeekPicker').hidden = type !== 'weekly'; $('actYearPicker').hidden = type !== 'yearly'; fetchActivity(); }
function showView(viewId) { state.activeView = viewId; document.querySelectorAll('.view-section').forEach((section) => section.classList.toggle('active', section.id === viewId)); $('home-controls').hidden = viewId !== 'home-view'; $('dropdownMenu').classList.remove('show'); if (viewId === 'monthly-view') { $('monthPicker').value = monthKey($('datePicker').value); fetchMonthly(); } if (viewId === 'activity-view') { $('actMonthPicker').value = monthKey($('datePicker').value); $('actYearPicker').value = $('datePicker').value.slice(0, 4); updateActivityControls(); } }

function bindEvents() {
  $('menuButton').addEventListener('click', (event) => { event.stopPropagation(); const open = $('dropdownMenu').classList.toggle('show'); $('menuButton').setAttribute('aria-expanded', String(open)); }); document.addEventListener('click', () => $('dropdownMenu').classList.remove('show'));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $('datePicker').addEventListener('change', fetchRoutine); $('previousDate').addEventListener('click', () => { $('datePicker').value = addDays($('datePicker').value, -1); fetchRoutine(); }); $('nextDate').addEventListener('click', () => { $('datePicker').value = addDays($('datePicker').value, 1); fetchRoutine(); });
  $('dailyAlarmToggle').addEventListener('click', async () => { await routineService.setDayAlarms(state.day.date, !state.day.alarmsEnabled); await fetchRoutine(); });
  $('routine-list').addEventListener('change', async ({ target }) => { if (!target.dataset.completion) return; await routineService.setCompletion(state.day.date, target.dataset.completion, target.checked); state.day.completions[target.dataset.completion] = target.checked; calculateDailyProgress(); });
  $('home-view').addEventListener('click', async ({ target }) => { const alarmId = target.dataset.alarm; if (!alarmId) return; await routineService.setAlarm(state.day.date, alarmId, !alarmEnabled(state.day, alarmId)); await fetchRoutine(); });
  $('monthPicker').addEventListener('change', fetchMonthly); $('monthlyProgressRing').addEventListener('click', () => { state.progressToToday = !state.progressToToday; renderMonthly(); });
  $('monthlyAlarmTitle').addEventListener('click', async () => { const enable = state.monthDays.every((day) => !day.alarmsEnabled); await routineService.setManyAlarms(state.monthDays, ALL_ALARM_IDS, enable); await fetchMonthly(); });
  $('monthly-table').addEventListener('click', async ({ target }) => { if (!target.dataset.monthDate) return; const day = state.monthDays.find(({ date }) => date === target.dataset.monthDate); await routineService.setDayAlarms(day.date, !day.alarmsEnabled); await fetchMonthly(); });
  $('activitySelector').addEventListener('change', renderActivity); $('activityViewType').addEventListener('change', updateActivityControls); $('actMonthPicker').addEventListener('change', fetchActivity); $('actWeekPicker').addEventListener('change', renderActivity); $('actYearPicker').addEventListener('change', fetchActivity); $('activityProgressRing').addEventListener('click', () => { state.progressToToday = !state.progressToToday; renderActivity(); });
  $('activityAlarmTitle').addEventListener('click', async () => { const ids = alarmActivity($('activitySelector').value); if (!ids.length) return; const days = visibleActivityDays().filter((day) => $('activitySelector').value !== 'fast' || isFastingDay(day)); const enable = days.every((day) => ids.every((id) => !alarmEnabled(day, id))); await routineService.setManyAlarms(days, ids, enable); await fetchActivity(); });
  $('activity-table').addEventListener('click', async ({ target }) => { if (!target.dataset.activityDate) return; const day = state.activityDays.find(({ date }) => date === target.dataset.activityDate); const ids = alarmActivity($('activitySelector').value); const enable = ids.every((id) => !alarmEnabled(day, id)); await routineService.setManyAlarms([day], ids, enable); await fetchActivity(); });
}

function initialiseControls() {
  $('activitySelector').innerHTML = `${ACTIVITIES.slice(0, 3).map(({ id, name }) => `<option value="${id}">${name}</option>`).join('')}<option value="fast">Fast (Start & End)</option>${ACTIVITIES.slice(3).map(({ id, name }) => `<option value="${id}">${name}</option>`).join('')}`;
  const currentYear = Number(todayIso().slice(0, 4)); $('actYearPicker').innerHTML = Array.from({ length: 9 }, (_, index) => currentYear - 4 + index).map((year) => `<option value="${year}">${year}</option>`).join('');
  $('datePicker').value = todayIso(); $('monthPicker').value = monthKey(todayIso()); $('actMonthPicker').value = monthKey(todayIso()); $('actYearPicker').value = String(currentYear);
  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('en-US', { timeZone: APP_TIME_ZONE, hour12: true }); }, 1000);
}

initialiseControls(); bindEvents(); fetchRoutine();

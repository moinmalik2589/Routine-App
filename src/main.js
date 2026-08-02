import './styles.css';
import { routineService } from './data/index.js';
import { calculateActivityProgress, calculateMonthlyProgress } from './data/progress.js';
import { addDays, APP_TIME_ZONE, isInRanges, isOnOrBefore, monthKey, todayIso } from './date-utils.js';
import { BrowserGeolocationProvider, DevelopmentLocationProvider, createLocationSearchProvider, resolveTimezone } from './location/providers.js';
import { DEFAULT_LOCATION_SUGGESTION } from './location/location-model.js';
import { CALCULATION_METHODS, MADHABS } from './prayer/prayer-calculator.js';
import { WEEKDAY_KEYS, createSchedule, createTimeSlot } from './scheduling/schedule.js';

const state = { day: null, activities: [], fastingRanges: [], monthDays: [], activityDays: [], profile: null, editingSlots: [], progressToToday: true, activeView: 'home-view' };
const $ = (id) => document.getElementById(id);
const searchProvider = createLocationSearchProvider(); const fallbackLocationProvider = new DevelopmentLocationProvider(); const geolocationProvider = new BrowserGeolocationProvider();
const alarmActivity = (value) => value === 'fast' ? ['FAST_START', 'FAST_END'] : (state.activities.find(({ id }) => id === value)?.timeSlots || []).filter(({ enabled, notificationEnabled }) => enabled && notificationEnabled).map((slot) => `${state.activities.find(({ id }) => id === value).alarmId || `ACTIVITY:${value}`}:${slot.id}`);

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
function alarmEnabled(day, id) { const base = id.split(':')[0]; return day.alarmsEnabled && !day.disabledAlarmIds.includes(id) && !day.disabledAlarmIds.includes(base); }
function isRamadan(date) { return isInRanges(date, state.fastingRanges); }
function isFastingDay(day) { return day.weekday === 'Friday' || isRamadan(day.date); }

function renderDay() {
  const day = state.day; $('dayOfWeek').textContent = day.weekday;
  $('dailyAlarmText').style.color = day.alarmsEnabled ? '#166534' : '#ef4444'; $('dailyAlarmIcon').textContent = day.alarmsEnabled ? '🔔' : '🔕';
  const rows = [...day.occurrences].sort((a, b) => {
    if (a.activityId === 'wake-up') return -1; if (b.activityId === 'wake-up') return 1; if (a.activityId === 'sleep') return 1; if (b.activityId === 'sleep') return -1; return timeMinutes(a.time) - timeMinutes(b.time);
  });
  $('routine-list').innerHTML = rows.map((occurrence) => {
    const timing = occurrence.notificationEnabled ? `<button class="${alarmEnabled(day, occurrence.notificationId) ? 'timing-alarm-on' : 'timing-alarm-off'}" data-alarm="${occurrence.notificationId}">${escapeHtml(occurrence.time)}</button>` : `<span class="timing-no-alarm">${escapeHtml(occurrence.time)}</span>`;
    const name = occurrence.label ? `${occurrence.activityName} · ${occurrence.label}` : occurrence.activityName;
    return `<div class="routine-item"><div>${timing}</div><div class="activity-name">${escapeHtml(name)}</div><div class="status"><input type="checkbox" data-completion="${occurrence.id}" aria-label="Complete ${escapeHtml(name)}" ${day.completions[occurrence.id] ? 'checked' : ''}></div></div>`;
  }).join('');
  const enabledFast = (id) => alarmEnabled(day, id) ? 'timing-alarm-on' : 'timing-alarm-off';
  const fastActive = isFastingDay(day);
  const prayers = day.prayerTimes || {}; const fajr = prayers.fajrStart || prayers.fastStart || 'N/A', sunrise = prayers.fajrEnd || prayers.sunrise || 'N/A', maghrib = prayers.fastEnd || prayers.maghrib || 'N/A';
  $('fajr-display').innerHTML = `Fajr Time: <span class="timing-no-alarm">${fajr}</span> - <span class="timing-no-alarm">${sunrise}</span>`;
  $('fast-display').innerHTML = fastActive ? `Fast Time: <button class="${enabledFast('FAST_START')}" data-alarm="FAST_START">${fajr}</button> - <button class="${enabledFast('FAST_END')}" data-alarm="FAST_END">${maghrib}</button>` : `Fast Time: <span class="timing-no-alarm">${fajr}</span> - <span class="timing-no-alarm">${maghrib}</span>`;
  $('bottom-timings').hidden = false; calculateDailyProgress();
}
function calculateDailyProgress() { const boxes = [...document.querySelectorAll('[data-completion]')]; setRing('dailyProgressRing', 'dailyProgressText', boxes.length ? Math.round(boxes.filter((box) => box.checked).length / boxes.length * 100) : 0); }
async function fetchRoutine() { $('routine-list').innerHTML = '<i>Loading data...</i>'; state.day = await routineService.getDay($('datePicker').value); renderDay(); }

function activityCell(day, activity) { const occurrences = day.occurrences.filter(({ activityId }) => activityId === activity.id); return occurrences.length ? occurrences.map((item) => `<input type="checkbox" class="grid-checkbox" title="${escapeHtml(item.time)}" ${day.completions[item.id] ? 'checked' : ''} disabled>`).join(' ') : '-'; }
function relevantForProgress(day) { return !state.progressToToday || isOnOrBefore(day.date, todayIso()); }
function renderMonthly() {
  const columns = [...new Map(state.monthDays.flatMap(({ activities }) => activities).map((activity) => [activity.id, activity])).values()].sort((a, b) => a.order - b.order);
  const progress = calculateMonthlyProgress(state.monthDays, state.progressToToday ? todayIso() : null);
  $('monthly-table').innerHTML = `<thead><tr><th>Date</th><th>Day</th>${columns.map(({ name }) => `<th>${escapeHtml(name)}</th>`).join('')}</tr></thead><tbody>${state.monthDays.map((day) => `<tr><td class="${day.alarmsEnabled ? 'date-alarm-on' : 'date-alarm-off'}" data-month-date="${day.date}">${day.date}</td><td>${day.weekday}</td>${columns.map((activity) => `<td>${day.activities.some(({ id }) => id === activity.id) ? activityCell(day, activity) : '-'}</td>`).join('')}</tr>`).join('')}</tbody>`;
  const allOff = state.monthDays.every((day) => !day.alarmsEnabled); $('monthlyAlarmTitle').textContent = `Monthly Progress ${allOff ? '🔕' : '🔔'}`; $('monthlyAlarmTitle').style.color = allOff ? '#ef4444' : '#166534';
  setRing('monthlyProgressRing', 'monthlyProgressText', progress.percent); $('monthly-status').textContent = `Completed ${progress.completed} out of ${progress.possible} activities ${state.progressToToday ? '(Up to Today)' : '(Total for Month)'}.`;
}
async function fetchMonthly() { $('monthly-status').textContent = 'Loading monthly data...'; state.monthDays = await routineService.ensureMonth($('monthPicker').value); renderMonthly(); }

function visibleActivityDays() {
  const type = $('activityViewType').value; if (type !== 'weekly') return state.activityDays;
  const week = Number($('actWeekPicker').value); return state.activityDays.filter((day) => { const number = Number(day.date.slice(-2)); return week < 5 ? number >= (week - 1) * 7 + 1 && number <= week * 7 : number >= 29; });
}
function renderActivity() {
  const id = $('activitySelector').value; const activity = state.activities.find((item) => item.id === id); const isFast = id === 'fast'; const days = visibleActivityDays(); const alarmIds = alarmActivity(id);
  const body = days.map((day) => {
    let value;
    if (isFast) { value = `${day.prayerTimes.fastStart} - ${day.prayerTimes.fastEnd}`; }
    else { value = day.occurrences.some((item) => item.activityId === id) ? activityCell(day, activity) : '-'; }
    const supported = alarmIds.length && (!isFast || isFastingDay(day)); const off = supported && alarmIds.every((alarmId) => !alarmEnabled(day, alarmId));
    return `<tr><td class="${supported ? (off ? 'date-alarm-off' : 'date-alarm-on') : 'date-no-alarm'}" ${supported ? `data-activity-date="${day.date}"` : ''}>${day.date}</td><td>${day.weekday}</td><td><span class="${isFast ? 'timing-no-alarm' : ''}">${value}</span></td></tr>`;
  }).join('');
  const progress = isFast ? { completed: 1, possible: 1, percent: 100 } : calculateActivityProgress(days, id, state.progressToToday ? todayIso() : null);
  $('activity-table').innerHTML = `<thead><tr><th>Date</th><th>Day</th><th>${escapeHtml(isFast ? 'Fast (Start & End)' : activity.name)}</th></tr></thead><tbody>${body}</tbody>`;
  const canAlarm = alarmIds.length > 0; const allOff = canAlarm && days.filter((day) => !isFast || isFastingDay(day)).every((day) => alarmIds.every((alarmId) => !alarmEnabled(day, alarmId)));
  $('activityAlarmTitle').className = `clickable-title${canAlarm ? ' active' : ''}`; $('activityAlarmTitle').textContent = `Activity Progress${canAlarm ? ` ${allOff ? '🔕' : '🔔'}` : ''}`; $('activityAlarmTitle').style.color = allOff ? '#ef4444' : '#166534';
  setRing('activityProgressRing', 'activityProgressText', progress.percent); $('activity-status').textContent = isFast ? 'Displaying Fast times for selected period.' : `Completed ${progress.completed} times out of ${progress.possible} applicable days ${state.progressToToday ? '(Up to Today)' : '(Total for Period)'}.`;
}
async function fetchActivity() { $('activity-status').textContent = 'Loading activity data...'; state.activityDays = $('activityViewType').value === 'yearly' ? await routineService.getYear($('actYearPicker').value) : await routineService.ensureMonth($('actMonthPicker').value); renderActivity(); }
function updateActivityControls() { const type = $('activityViewType').value; $('actMonthPicker').hidden = type === 'yearly'; $('actWeekPicker').hidden = type !== 'weekly'; $('actYearPicker').hidden = type !== 'yearly'; fetchActivity(); }
function showView(viewId) { state.activeView = viewId; document.querySelectorAll('.view-section').forEach((section) => section.classList.toggle('active', section.id === viewId)); $('home-controls').hidden = viewId !== 'home-view'; $('dropdownMenu').classList.remove('show'); if (viewId === 'monthly-view') { $('monthPicker').value = monthKey($('datePicker').value); fetchMonthly(); } if (viewId === 'activity-view') { $('actMonthPicker').value = monthKey($('datePicker').value); $('actYearPicker').value = $('datePicker').value.slice(0, 4); updateActivityControls(); } if (viewId === 'manage-view') renderManagement(); if (viewId === 'settings-view') renderSettings(); }

function activityOptions(selected = $('activitySelector').value) {
  const options = state.activities.map(({ id, name }, index) => `${index === 3 ? '<option value="fast">Fast (Start & End)</option>' : ''}<option value="${id}">${escapeHtml(name)}</option>`).join('');
  $('activitySelector').innerHTML = options; if ([...$('activitySelector').options].some(({ value }) => value === selected)) $('activitySelector').value = selected;
}
async function refreshDefinitions() { state.activities = await routineService.getActivities({ includeDisabled: false }); state.fastingRanges = await routineService.getFastingRanges(); activityOptions(); }
function displayTimeForInput(time) { const match = time?.match(/(\d+):(\d+)\s*(AM|PM)/i); if (!match) return time || ''; let hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0); return `${String(hour).padStart(2, '0')}:${match[2]}`; }
function displayTimeForRoutine(time) { if (!time) return ''; const [hourValue, minutes] = time.split(':').map(Number); const suffix = hourValue >= 12 ? 'PM' : 'AM'; return `${hourValue % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`; }
function renderScheduleFields() { const type = $('scheduleType').value; $('weekdayFields').hidden = !['selected-weekdays', 'weekly'].includes(type); $('weeklyFields').hidden = type !== 'weekly'; $('monthlyFields').hidden = type !== 'monthly'; $('yearlyFields').hidden = type !== 'yearly'; $('specificDateFields').hidden = type !== 'specific-date'; $('specificDatesFields').hidden = type !== 'specific-dates'; $('rangeFields').hidden = type !== 'date-range'; }
function renderTimeSlots() { $('timeSlotEditor').innerHTML = state.editingSlots.map((slot, index) => `<div class="time-slot-row" data-slot-index="${index}"><input type="time" data-slot-field="time" value="${displayTimeForInput(slot.time)}" aria-label="Time"><input type="text" data-slot-field="label" value="${escapeHtml(slot.label)}" placeholder="Label (optional)"><button class="nav-action danger" type="button" data-slot-action="remove">Remove</button><div class="slot-options"><label><input type="checkbox" data-slot-field="enabled" ${slot.enabled ? 'checked' : ''}> Enabled</label><label><input type="checkbox" data-slot-field="notificationEnabled" ${slot.notificationEnabled ? 'checked' : ''}> Notification</label><label>Offset <input type="number" data-slot-field="notificationOffsetMinutes" value="${slot.notificationOffsetMinutes}" step="1"> min</label><button type="button" class="nav-action" data-slot-action="up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="nav-action" data-slot-action="down" ${index === state.editingSlots.length - 1 ? 'disabled' : ''}>↓</button></div></div>`).join(''); }
function readSchedule() { const type = $('scheduleType').value; return createSchedule({ type, weekdays: [...document.querySelectorAll('[name="scheduleWeekday"]:checked')].map(({ value }) => value), intervalWeeks: $('intervalWeeks').value, anchorDate: $('scheduleAnchor').value || null, dayOfMonth: $('monthlyDay').value, month: $('yearlyMonth').value, day: $('yearlyDay').value, date: $('specificDate').value || null, dates: $('specificDates').value.split(',').map((item) => item.trim()).filter(Boolean), startDate: $('rangeStart').value || null, endDate: $('rangeEnd').value || null }); }
function writeSchedule(schedule) { $('scheduleType').value = schedule.type; document.querySelectorAll('[name="scheduleWeekday"]').forEach((box) => { box.checked = schedule.weekdays.includes(box.value); }); $('intervalWeeks').value = schedule.intervalWeeks; $('scheduleAnchor').value = schedule.anchorDate || ''; $('monthlyDay').value = schedule.dayOfMonth || 1; $('yearlyMonth').value = schedule.month || 1; $('yearlyDay').value = schedule.day || 1; $('specificDate').value = schedule.date || ''; $('specificDates').value = schedule.dates.join(', '); $('rangeStart').value = schedule.startDate || ''; $('rangeEnd').value = schedule.endDate || ''; renderScheduleFields(); }
function resetActivityForm() { $('activityForm').reset(); $('editActivityId').value = ''; $('activityEnabled').checked = true; state.editingSlots = [createTimeSlot({ id: `slot-${Date.now()}`, enabled: true })]; writeSchedule(createSchedule()); renderTimeSlots(); $('saveActivity').textContent = 'Add Activity'; $('cancelActivityEdit').hidden = true; }
function scheduleSummary(schedule) { return ({ daily: 'Every day', 'selected-weekdays': schedule.weekdays.join(', '), weekly: `Every ${schedule.intervalWeeks} week(s): ${schedule.weekdays.join(', ')}`, monthly: `Monthly on day ${schedule.dayOfMonth}`, yearly: `Yearly on ${schedule.month}/${schedule.day}`, 'specific-date': schedule.date, 'specific-dates': `${schedule.dates.length} specific dates`, 'date-range': `${schedule.startDate} to ${schedule.endDate}`, none: 'No recurring schedule' })[schedule.type]; }
async function renderManagement(message = '') {
  const activities = await routineService.getActivities(); state.activities = activities.filter(({ enabled }) => enabled); activityOptions();
  $('management-status').textContent = message;
  $('activity-management-list').innerHTML = activities.map((activity, index) => `<div class="management-item${activity.enabled ? '' : ' disabled'}"><div><div class="management-name">${escapeHtml(activity.name)}${activity.protected ? ' 🔒' : ''}</div><div class="management-meta">${escapeHtml(scheduleSummary(activity.schedule))} · ${activity.timeSlots.length} time slot(s)</div></div><div>${activity.enabled ? 'Enabled' : 'Disabled'}</div><div class="management-actions"><button data-manage="up" data-id="${activity.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button data-manage="down" data-id="${activity.id}" ${index === activities.length - 1 ? 'disabled' : ''}>↓</button><button data-manage="edit" data-id="${activity.id}">Edit</button><button data-manage="toggle" data-id="${activity.id}">${activity.enabled ? 'Disable' : 'Enable'}</button>${activity.protected ? '' : `<button class="danger" data-manage="remove" data-id="${activity.id}">Remove</button>`}</div></div>`).join('');
}
function fillLocationForm(profile) { $('profileCity').value = profile.city; $('profileState').value = profile.state; $('profileCountry').value = profile.country; $('profileLatitude').value = profile.latitude; $('profileLongitude').value = profile.longitude; $('profileTimezone').value = profile.timeZone; $('profileMethod').value = profile.calculationMethod; $('profileMadhab').value = profile.madhab; document.querySelectorAll('[data-adjustment]').forEach((input) => { input.value = profile.adjustments?.[input.dataset.adjustment] || 0; }); }
function renderSettings() { const profile = state.profile || DEFAULT_LOCATION_SUGGESTION; $('location-summary').innerHTML = `<p>${escapeHtml(profile.city)}, ${escapeHtml(profile.state)}, ${escapeHtml(profile.country)}</p><p>${profile.latitude}, ${profile.longitude} · ${escapeHtml(profile.timeZone)}</p><p>${escapeHtml(profile.calculationMethod)} · ${escapeHtml(profile.madhab)}</p>`; }
function openLocationSetup(editing = false) { fillLocationForm(state.profile || DEFAULT_LOCATION_SUGGESTION); $('cancelLocation').hidden = !editing; $('menuButton').hidden = !editing; showView('location-view'); }
function readLocationForm() { return { city: $('profileCity').value, state: $('profileState').value, country: $('profileCountry').value, latitude: $('profileLatitude').value, longitude: $('profileLongitude').value, timeZone: $('profileTimezone').value, calculationMethod: $('profileMethod').value, madhab: $('profileMadhab').value, adjustments: Object.fromEntries([...document.querySelectorAll('[data-adjustment]')].map((input) => [input.dataset.adjustment, Number(input.value) || 0])), locationSource: $('profileCity').dataset.source || 'manual' }; }

function bindEvents() {
  $('menuButton').addEventListener('click', (event) => { event.stopPropagation(); const open = $('dropdownMenu').classList.toggle('show'); $('menuButton').setAttribute('aria-expanded', String(open)); }); document.addEventListener('click', () => $('dropdownMenu').classList.remove('show'));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $('datePicker').addEventListener('change', fetchRoutine); $('previousDate').addEventListener('click', () => { $('datePicker').value = addDays($('datePicker').value, -1); fetchRoutine(); }); $('nextDate').addEventListener('click', () => { $('datePicker').value = addDays($('datePicker').value, 1); fetchRoutine(); });
  $('dailyAlarmToggle').addEventListener('click', async () => { await routineService.setDayAlarms(state.day.date, !state.day.alarmsEnabled); await fetchRoutine(); });
  $('routine-list').addEventListener('change', async ({ target }) => { if (!target.dataset.completion) return; await routineService.setCompletion(state.day.date, target.dataset.completion, target.checked); state.day.completions[target.dataset.completion] = target.checked; calculateDailyProgress(); });
  $('home-view').addEventListener('click', async ({ target }) => { const alarmId = target.dataset.alarm; if (!alarmId) return; await routineService.setAlarm(state.day.date, alarmId, !alarmEnabled(state.day, alarmId)); await fetchRoutine(); });
  $('monthPicker').addEventListener('change', fetchMonthly); $('monthlyProgressRing').addEventListener('click', () => { state.progressToToday = !state.progressToToday; renderMonthly(); });
  $('monthlyAlarmTitle').addEventListener('click', async () => { const enable = state.monthDays.every((day) => !day.alarmsEnabled); const ids = [...new Set(state.monthDays.flatMap(({ occurrences }) => occurrences.filter(({ notificationEnabled }) => notificationEnabled).map(({ notificationId }) => notificationId)).concat(['FAST_START', 'FAST_END']))]; await routineService.setManyAlarms(state.monthDays, ids, enable); await fetchMonthly(); });
  $('monthly-table').addEventListener('click', async ({ target }) => { if (!target.dataset.monthDate) return; const day = state.monthDays.find(({ date }) => date === target.dataset.monthDate); await routineService.setDayAlarms(day.date, !day.alarmsEnabled); await fetchMonthly(); });
  $('activitySelector').addEventListener('change', renderActivity); $('activityViewType').addEventListener('change', updateActivityControls); $('actMonthPicker').addEventListener('change', fetchActivity); $('actWeekPicker').addEventListener('change', renderActivity); $('actYearPicker').addEventListener('change', fetchActivity); $('activityProgressRing').addEventListener('click', () => { state.progressToToday = !state.progressToToday; renderActivity(); });
  $('activityAlarmTitle').addEventListener('click', async () => { const ids = alarmActivity($('activitySelector').value); if (!ids.length) return; const days = visibleActivityDays().filter((day) => $('activitySelector').value !== 'fast' || isFastingDay(day)); const enable = days.every((day) => ids.every((id) => !alarmEnabled(day, id))); await routineService.setManyAlarms(days, ids, enable); await fetchActivity(); });
  $('activity-table').addEventListener('click', async ({ target }) => { if (!target.dataset.activityDate) return; const day = state.activityDays.find(({ date }) => date === target.dataset.activityDate); const ids = alarmActivity($('activitySelector').value); const enable = ids.every((id) => !alarmEnabled(day, id)); await routineService.setManyAlarms([day], ids, enable); await fetchActivity(); });
  $('scheduleType').addEventListener('change', renderScheduleFields);
  $('addTimeSlot').addEventListener('click', () => { state.editingSlots.push(createTimeSlot({ id: `slot-${Date.now()}-${state.editingSlots.length}`, enabled: true })); renderTimeSlots(); });
  $('timeSlotEditor').addEventListener('change', ({ target }) => { const row = target.closest('[data-slot-index]'); if (!row || !target.dataset.slotField) return; const slot = state.editingSlots[Number(row.dataset.slotIndex)], field = target.dataset.slotField; slot[field] = target.type === 'checkbox' ? target.checked : field === 'time' ? displayTimeForRoutine(target.value) : field === 'notificationOffsetMinutes' ? Number(target.value) : target.value; });
  $('timeSlotEditor').addEventListener('click', ({ target }) => { const row = target.closest('[data-slot-index]'), action = target.dataset.slotAction; if (!row || !action) return; const index = Number(row.dataset.slotIndex); if (action === 'remove') state.editingSlots.splice(index, 1); if (action === 'up') [state.editingSlots[index - 1], state.editingSlots[index]] = [state.editingSlots[index], state.editingSlots[index - 1]]; if (action === 'down') [state.editingSlots[index + 1], state.editingSlots[index]] = [state.editingSlots[index], state.editingSlots[index + 1]]; renderTimeSlots(); });
  $('activityForm').addEventListener('submit', async (event) => { event.preventDefault(); if (!state.editingSlots.length) throw new Error('Add at least one time slot.'); const values = { name: $('activityName').value, enabled: $('activityEnabled').checked, schedule: readSchedule(), timeSlots: state.editingSlots }; const id = $('editActivityId').value; if (id) await routineService.editActivity(id, values); else await routineService.addActivity(values); resetActivityForm(); await renderManagement(id ? 'Activity updated.' : 'Activity added.'); });
  $('cancelActivityEdit').addEventListener('click', resetActivityForm);
  $('activity-management-list').addEventListener('click', async ({ target }) => { const action = target.dataset.manage, id = target.dataset.id; if (!action || !id) return; const activities = await routineService.getActivities(); const activity = activities.find((item) => item.id === id); if (action === 'edit') { $('editActivityId').value = id; $('activityName').value = activity.name; $('activityEnabled').checked = activity.enabled; state.editingSlots = cloneSlots(activity.timeSlots); writeSchedule(activity.schedule); renderTimeSlots(); $('saveActivity').textContent = 'Save Changes'; $('cancelActivityEdit').hidden = false; return; } if (action === 'toggle') await routineService.editActivity(id, { enabled: !activity.enabled }); if (action === 'remove') await routineService.softDeleteActivity(id); if (action === 'up' || action === 'down') { const swap = activities.findIndex((item) => item.id === id) + (action === 'up' ? -1 : 1); const ids = activities.map((item) => item.id); [ids[ids.indexOf(id)], ids[swap]] = [ids[swap], id]; await routineService.reorderActivities(ids); } await renderManagement('Activity list updated.'); });
  $('changeLocation').addEventListener('click', () => openLocationSetup(true)); $('cancelLocation').addEventListener('click', () => showView('settings-view'));
  $('detectLocation').addEventListener('click', async () => { $('location-status').textContent = 'Detecting location…'; try { const coordinates = await geolocationProvider.detect(); const named = await (searchProvider.reverseGeocode ? searchProvider.reverseGeocode(coordinates) : fallbackLocationProvider.reverseGeocode(coordinates)); fillLocationForm({ ...named, ...coordinates, timeZone: resolveTimezone(coordinates.latitude, coordinates.longitude) }); $('profileCity').dataset.source = 'device-foreground'; $('location-status').textContent = 'Location detected. Review and confirm.'; } catch (error) { $('location-status').textContent = `${error.message} Use manual city search below.`; } });
  $('searchLocation').addEventListener('click', async () => { const results = await searchProvider.search($('locationSearch').value); $('locationResults').innerHTML = results.map((item, index) => `<button class="location-result" type="button" data-location-index="${index}">${escapeHtml(item.label || `${item.city}, ${item.state}, ${item.country}`)}</button>`).join('') || '<p class="summary">No matching city found.</p>'; $('locationResults').dataset.results = JSON.stringify(results); });
  $('locationResults').addEventListener('click', async ({ target }) => { if (!target.dataset.locationIndex) return; const item = JSON.parse($('locationResults').dataset.results)[Number(target.dataset.locationIndex)]; const location = item.placeId ? await searchProvider.details(item.placeId) : item; fillLocationForm({ ...DEFAULT_LOCATION_SUGGESTION, ...location }); $('profileCity').dataset.source = location.locationSource || 'manual-search'; });
  $('locationForm').addEventListener('submit', async (event) => { event.preventDefault(); $('location-status').textContent = 'Saving and preparing offline prayer times…'; state.profile = await routineService.saveLocationProfile(readLocationForm()); $('menuButton').hidden = false; $('location-status').textContent = ''; await refreshDefinitions(); showView('home-view'); await fetchRoutine(); });
}

function initialiseControls() {
  $('weekdayChoices').innerHTML = WEEKDAY_KEYS.map((day) => `<label><input type="checkbox" name="scheduleWeekday" value="${day}">${day.slice(0, 3)}</label>`).join('');
  $('profileMethod').innerHTML = CALCULATION_METHODS.map((method) => `<option value="${method}">${method}</option>`).join(''); $('profileMadhab').innerHTML = MADHABS.map((madhab) => `<option value="${madhab}">${madhab}</option>`).join('');
  $('prayerAdjustments').innerHTML = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((prayer) => `<label>${prayer[0].toUpperCase() + prayer.slice(1)}<input type="number" data-adjustment="${prayer}" value="0" step="1"></label>`).join(''); resetActivityForm();
  const currentYear = Number(todayIso().slice(0, 4)); $('actYearPicker').innerHTML = Array.from({ length: 9 }, (_, index) => currentYear - 4 + index).map((year) => `<option value="${year}">${year}</option>`).join('');
  $('datePicker').value = todayIso(); $('monthPicker').value = monthKey(todayIso()); $('actMonthPicker').value = monthKey(todayIso()); $('actYearPicker').value = String(currentYear);
  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('en-US', { timeZone: APP_TIME_ZONE, hour12: true }); }, 1000);
}

function cloneSlots(slots) { return structuredClone(slots); }
await routineService.initialize(); await refreshDefinitions(); initialiseControls(); bindEvents(); state.profile = await routineService.getLocationProfile(); if (state.profile) { await routineService.warmPrayerCache(); await fetchRoutine(); } else openLocationSetup(false);

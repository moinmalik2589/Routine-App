import { initFirebaseAnalytics, trackEvent } from './firebase.js';
import './styles.css';
import { routineService, backupService, deleteAllLocalData } from './data/index.js';
import { saveBackupFile, pickBackupFile } from './data/backup-files.js';
import { calculateActivityProgress, calculateMonthlyProgress } from './data/progress.js';
import { addDays, APP_TIME_ZONE, isInRanges, isOnOrBefore, monthKey, todayIso } from './date-utils.js';
import { BrowserGeolocationProvider, createLocationProvider, resolveTimezone } from './location/providers.js';
import { DEFAULT_LOCATION_SUGGESTION, canActivateLocationDraft, createLocationProfile, validateDisplayName } from './location/location-model.js';
import { inspectPrayerCalculation, prayerSettingsFingerprint } from './prayer/prayer-calculator.js';
import { automaticPrayerSettings, resetPrayerAdjustments } from './prayer/automatic-settings.js';
import { createMapProvider } from './location/map-provider.js';
import { LocationAutocompleteController } from './location/autocomplete-controller.js';
import { LocationAutocompleteDomBinding } from './location/autocomplete-dom-binding.js';
import { saveLocationAndRefresh } from './location/location-save-flow.js';
import { WEEKDAY_KEYS, createSchedule, createTimeSlot } from './scheduling/schedule.js';
import { DailyLoadController } from './ui/daily-load-controller.js';
import { activityManagementControls } from './ui/activity-management-controls.js';
import { analyticsForDays, barChart, heatmap, lineChart } from './ui/analytics.js';
import { homePrayerDisplayValues } from './ui/prayer-display.js';
import { profileHeading, profileLocationLabel } from './ui/profile-presentation.js';
import { firebaseConfigured, firebaseServices } from './auth/firebase-client.js'; import { AuthService } from './auth/auth-service.js';
import { AdminService } from './admin/admin-service.js';
import { NativeAlarmService } from './alarms/native-alarm-service.js'; import { AlarmCoordinator } from './alarms/alarm-coordinator.js';

const state = { day: null, activities: [], fastingRanges: [], monthDays: [], activityDays: [], analyticsDays: [], profile: null, settings: null, account: null, editingSlots: [], progressToToday: true, activeView: 'home-view', locationDraft: { selected: null, coordinatesChanged: false }, locationResults: [], mapDraft: null, enablingPrayer: false, streaks: new Map(), streakRunToken: 0 };
const $ = (id) => document.getElementById(id);
const searchProvider = createLocationProvider(); const geolocationProvider = new BrowserGeolocationProvider(); const mapProvider = createMapProvider({ reverseGeocoder: searchProvider });
const firebaseRuntime = firebaseConfigured ? firebaseServices() : null; const authService = firebaseRuntime ? new AuthService(firebaseRuntime) : null; const adminService = firebaseRuntime ? new AdminService(firebaseRuntime) : null;
const nativeAlarmService = new NativeAlarmService(); const alarmCoordinator = new AlarmCoordinator(nativeAlarmService);
let dailyLoader; let autocompleteController; let autocompleteBinding; let mountedMap;
const alarmActivity = (value) => value === 'fast' ? ['FAST_START', 'FAST_END'] : (state.activities.find(({ id }) => id === value)?.timeSlots || []).filter(({ enabled, notificationEnabled }) => enabled && notificationEnabled).map((slot) => `${state.activities.find(({ id }) => id === value).alarmId || `ACTIVITY:${value}`}:${slot.id}`);

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function timeMinutes(time) {
  if (!time) return 9998; const upper = time.toUpperCase();
  if (upper.includes('PRE-JUMMAH')) return 690; if (upper.includes('POST-GYM')) return 600; if (upper.includes('EVENING')) return 1200;
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)?/i); if (!match) return 9998;
  let hour = Number(match[1]); if (match[3]?.toUpperCase() === 'PM' && hour < 12) hour += 12; if (match[3]?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return hour * 60 + Number(match[2]);
}
function setRing(ringId, textId, percent) {
  const ring = $(ringId), text = $(textId);
  if (!ring || !text) return;
  ring.style.background = `conic-gradient(var(--accent) ${percent}%, var(--ring-track) 0%)`;
  text.textContent = `${percent}%`;
  text.style.color = 'var(--accent-deep)';
  ring.style.setProperty('--progress-angle', `${percent * 3.6}deg`);
}
function alarmEnabled(day, id) { const base = id.split(':')[0]; return day.alarmsEnabled && !day.disabledAlarmIds.includes(id) && !day.disabledAlarmIds.includes(base); }
function isRamadan(date) { return isInRanges(date, state.fastingRanges); }
function isFastingDay(day) { return day.weekday === 'Friday' || isRamadan(day.date); }

const ACCENTS = ['emerald', 'violet', 'ocean', 'sunset', 'rose'];
let deferredInstallPrompt = null;
const THEME_MODES = ['light', 'dark', 'aurora', 'multicolor'];
const STREAK_START_KEY = 'moinRoutineStreakStartDate';

function streakStartDate() {
  let startDate = localStorage.getItem(STREAK_START_KEY);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '')) {
    startDate = todayIso();
    localStorage.setItem(STREAK_START_KEY, startDate);
  }

  return startDate;
}

function preferredTheme() {
  const saved = localStorage.getItem('moinRoutineTheme');
  return THEME_MODES.includes(saved) ? saved : 'light';
}
function preferredAccent() { return localStorage.getItem('moinRoutineAccent') || 'emerald'; }
function applyAppearance(theme = preferredTheme(), accent = preferredAccent()) {
  if (!THEME_MODES.includes(theme)) theme = 'light';
  if (!ACCENTS.includes(accent)) accent = 'emerald';
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  const isDarkLike = theme !== 'light';
  if ($('themeToggle')) {
    $('themeToggle').classList.toggle('is-dark', isDarkLike);
    $('themeToggle').setAttribute('aria-label', isDarkLike ? 'Switch to light mode' : 'Switch to dark mode');
  }
  if ($('themeToggleIcon')) $('themeToggleIcon').textContent = '';
  if ($('profileThemeToggle')) $('profileThemeToggle').textContent = isDarkLike ? '☀️ Switch to Light' : '🌙 Switch to Dark';
  document.querySelectorAll('[data-accent]').forEach((button) => button.classList.toggle('selected', button.dataset.accent === accent));
  document.querySelectorAll('[data-theme-mode]').forEach((button) => button.classList.toggle('selected', button.dataset.themeMode === theme));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#000000' : theme === 'aurora' ? '#07150f' : theme === 'multicolor' ? '#0d2818' : '#f5fff8';
}
function toggleTheme() {
  const current = preferredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('moinRoutineTheme', next);
  applyAppearance(next, preferredAccent());
  document.body.classList.remove('theme-flash');
  void document.body.offsetWidth;
  document.body.classList.add('theme-flash');
}
function setAccent(accent) { if (!ACCENTS.includes(accent)) return; localStorage.setItem('moinRoutineAccent', accent); applyAppearance(preferredTheme(), accent); }
function cycleAccent() {
  const current = preferredTheme();
  const next = THEME_MODES[(THEME_MODES.indexOf(current) + 1) % THEME_MODES.length];
  localStorage.setItem('moinRoutineTheme', next);
  applyAppearance(next, preferredAccent());
  showAppToast(`${next === 'dark' ? 'Black' : next[0].toUpperCase() + next.slice(1)} theme`, next === 'light' ? '☀️' : next === 'dark' ? '🌑' : next === 'aurora' ? '🌌' : '🌈');
}

function streakMarkup(value) {
  if (value > 0) return `<span class="streak-badge streak-positive" title="${value} completed scheduled day${value === 1 ? '' : 's'} in a row">🔥 ${value}</span>`;
  if (value <= -2) return `<span class="streak-badge streak-negative" title="${Math.abs(value)} consecutive missed scheduled days">${Math.abs(value)} <span class="inverted-fire" aria-hidden="true">🔥</span></span>`;
  return '<span class="streak-badge streak-zero" title="No active streak">🔥 0</span>';
}

function feedbackPulse(completed = false) {
  const soundEnabled = localStorage.getItem('moinRoutineSound') !== 'off';
  const vibrationEnabled = localStorage.getItem('moinRoutineVibration') !== 'off';
  try {
    if (!soundEnabled) throw new Error('sound-disabled');
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(completed ? 720 : 470, ctx.currentTime);
      if (completed) oscillator.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + .09);
      gain.gain.setValueAtTime(.055, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .11);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .115);
      oscillator.addEventListener('ended', () => ctx.close().catch(() => {}), { once: true });
    }
  } catch (error) { if (error?.message !== 'sound-disabled') console.debug('Sound feedback unavailable', error); }
  if (vibrationEnabled && navigator.vibrate) navigator.vibrate(completed ? [28, 22, 45] : 24);
}

function showAppToast(message, icon = '✨') {
  const toast = $('appToast'); if (!toast) return; toast.innerHTML = `<span>${icon}</span><strong>${escapeHtml(message)}</strong>`; toast.hidden = false; toast.classList.remove('toast-pop'); void toast.offsetWidth; toast.classList.add('toast-pop'); clearTimeout(showAppToast.timer); showAppToast.timer = setTimeout(() => { toast.hidden = true; }, 2300);
}

function historicalStreakFromDays(targetDate, occurrence, storedDays) {
  const startDate = streakStartDate();

  if (targetDate < startDate) return 0;

  let runType = null;
  let run = 0;

  const past = storedDays
    .filter((day) => day?.date >= startDate && day.date < targetDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const day of past) {
    const match = day?.occurrences?.find((item) => item.id === occurrence.id);
    if (!match) continue; // SKIP / N/A / blank: does not break the run.
    const checked = Boolean(day.completions?.[match.id]);
    const type = checked ? 'TRUE' : 'FALSE';
    if (runType === null) { runType = type; run = 1; continue; }
    if (runType === type) { run += 1; continue; }
    break;
  }
  if (runType === 'TRUE') return run;
  if (runType === 'FALSE') return -run;
  return 0;
}

function evaluateTargetStreak(history, checked, targetDate = state.day?.date) {
  if (targetDate && targetDate < streakStartDate()) return 0;
  if (checked) return history > 0 ? history + 1 : 1;
  if (history > 0) return history;
  if (history === -1) return 0;
  if (history <= -2) return history;
  return 0;
}

async function refreshVisibleStreaks() {
  const day = state.day; if (!day?.date) return;
  const token = ++state.streakRunToken;
  const rows = [...day.occurrences];
  const storedDays = await routineService.getStoredDays();
  if (token !== state.streakRunToken || state.day?.date !== day.date) return;
  rows.forEach((occurrence) => {
    const history = historicalStreakFromDays(day.date, occurrence, storedDays);
    const value = evaluateTargetStreak(history, Boolean(state.day.completions[occurrence.id]));
    state.streaks.set(`${day.date}:${occurrence.id}`, { history, value });
    const target = document.querySelector(`[data-streak-for="${CSS.escape(occurrence.id)}"]`);
    if (target) target.innerHTML = streakMarkup(value);
  });
  if (token === state.streakRunToken) renderLoveFeatures();
}

function renderLoveFeatures() {
  if (!state.day) return;
  const values = state.day.occurrences.map((item) => state.streaks.get(`${state.day.date}:${item.id}`)?.value).filter((value) => Number.isFinite(value));
  const best = values.filter((value) => value > 0).reduce((max, value) => Math.max(max, value), 0);
  const completed = state.day.occurrences.filter((item) => state.day.completions[item.id]).length;
  const possible = state.day.occurrences.length;
  const rate = possible ? Math.round(completed / possible * 100) : 0;
  if ($('bestActiveStreak')) $('bestActiveStreak').textContent = String(best);
  if ($('momentumLabel')) $('momentumLabel').textContent = rate >= 100 ? 'Unstoppable' : rate >= 75 ? 'On fire' : rate >= 40 ? 'Building' : completed ? 'Started' : 'Ready';
  if ($('todayWinLabel')) $('todayWinLabel').textContent = String(completed);
}

function renderDay() {
  const day = state.day; if (!day?.date || !Array.isArray(day.occurrences)) throw new Error('Cannot render an invalid daily routine record.'); $('dayOfWeek').textContent = day.weekday; renderProfileIdentity();
  $('dailyAlarmText').style.color = day.alarmsEnabled ? '#166534' : '#ef4444'; $('dailyAlarmIcon').textContent = day.alarmsEnabled ? '🔔' : '🔕';
  const rows = [...day.occurrences].sort((a, b) => {
    if (a.activityId === 'wake-up') return -1; if (b.activityId === 'wake-up') return 1; if (a.activityId === 'sleep') return 1; if (b.activityId === 'sleep') return -1; return timeMinutes(a.time) - timeMinutes(b.time);
  });
  $('routine-list').innerHTML = rows.length ? rows.map((occurrence) => {
    const timing = occurrence.notificationEnabled ? `<button class="${alarmEnabled(day, occurrence.notificationId) ? 'timing-alarm-on' : 'timing-alarm-off'}" data-alarm="${occurrence.notificationId}">${escapeHtml(occurrence.time)}</button>` : `<span class="timing-no-alarm">${escapeHtml(occurrence.time)}</span>`;
    const name = occurrence.label ? `${occurrence.activityName} · ${occurrence.label}` : occurrence.activityName;
    return `<div class="routine-item"><div>${timing}</div><div class="activity-name"><span>${escapeHtml(name)}</span></div><div class="status"><small class="habit-streak" data-streak-for="${escapeHtml(occurrence.id)}">${streakMarkup(state.streaks.get(`${day.date}:${occurrence.id}`)?.value ?? 0)}</small><label class="check-shell"><input type="checkbox" data-completion="${occurrence.id}" aria-label="Complete ${escapeHtml(name)}" ${day.completions[occurrence.id] ? 'checked' : ''}><span></span></label></div></div>`;
  }).join('') : '<div class="routine-error"><strong>Your routine is empty.</strong><p>Open Activity Management to add your first activity.</p><button class="home-btn" type="button" data-view="manage-view">Add First Activity</button></div>';
  const enabledFast = (id) => alarmEnabled(day, id) ? 'timing-alarm-on' : 'timing-alarm-off';
  const fastActive = isFastingDay(day);
  const { fajr, sunrise, maghrib } = homePrayerDisplayValues(day);
  $('fajr-display').innerHTML = `Fajr Time: <span class="timing-no-alarm">${fajr}</span> - <span class="timing-no-alarm">${sunrise}</span>`;
  $('fast-display').innerHTML = fastActive ? `Fast Time: <button class="${enabledFast('FAST_START')}" data-alarm="FAST_START">${fajr}</button> - <button class="${enabledFast('FAST_END')}" data-alarm="FAST_END">${maghrib}</button>` : `Fast Time: <span class="timing-no-alarm">${fajr}</span> - <span class="timing-no-alarm">${maghrib}</span>`;
  $('bottom-timings').hidden = false; calculateDailyProgress(); renderHomeSnapshot(); renderLoveFeatures(); refreshVisibleStreaks();
}
function calculateDailyProgress() { const boxes = [...document.querySelectorAll('[data-completion]')]; setRing('dailyProgressRing', 'dailyProgressText', boxes.length ? Math.round(boxes.filter((box) => box.checked).length / boxes.length * 100) : 0); }
function validIsoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00+05:30`).getTime()); }
function setDailyLoading(loading) { $('previousDate').disabled = loading; $('nextDate').disabled = loading; $('datePicker').disabled = loading; $('dailyAlarmToggle').disabled = loading; }
function showDailyError(error, date) { state.day = null; $('dayOfWeek').textContent = ''; $('bottom-timings').hidden = true; setRing('dailyProgressRing', 'dailyProgressText', 0); $('routine-list').innerHTML = `<div class="routine-error"><strong>Unable to load routine for ${escapeHtml(date)}.</strong><p>${escapeHtml(error?.message || 'Unexpected database error.')}</p><button class="home-btn" type="button" data-retry-routine>Retry</button></div>`; }
async function fetchRoutine() { const date = $('datePicker').value; if (!validIsoDate(date)) { showDailyError(new Error('Select a valid date.'), date || 'the selected date'); return null; } return dailyLoader.load(date); }
function requireCurrentDay(action) { const ready = dailyLoader?.getReadyDay(); if (!ready?.date || state.day?.date !== ready.date) { console.warn(`Ignored ${action}: daily routine is not ready.`); return null; } return ready; }

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


function maybeShowAllDoneCelebration() {
  const day = state.day;
  if (!day || day.date !== todayIso() || !day.occurrences?.length) return;
  const complete = day.occurrences.every(item => Boolean(day.completions?.[item.id]));
  if (!complete) return;
  const modal = $('allDoneModal');
  if (!modal || modal.dataset.shownFor === day.date) return;
  modal.dataset.shownFor = day.date;
  const values = currentStreakValues().map(item => item.value).filter(value => value > 0);
  if ($('allDoneWins')) $('allDoneWins').textContent = String(day.occurrences.length);
  if ($('allDoneStreak')) $('allDoneStreak').textContent = String(values.length ? Math.max(...values) : 0);
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('show'));
  feedbackPulse(true);
}
function closeAllDoneCelebration() {
  const modal = $('allDoneModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => { modal.hidden = true; }, 260);
}
function renderHomeSnapshot() {
  const day = state.day; if (!day) return;
  const stats = analyticsForDays([day]);
  const remaining = Math.max(0, stats.possible - stats.completed);
  $('todayDone').textContent = `${stats.completed}/${stats.possible}`;
  $('todayRate').textContent = `${stats.rate}%`;
  $('todayLeft').textContent = String(remaining);
  if ($('habitCompletionBadge')) $('habitCompletionBadge').textContent = `${stats.completed}/${stats.possible} Completed`;
  if ($('dateNavLabel')) { const selected = day.date; $('dateNavLabel').textContent = selected === todayIso() ? 'Today' : new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short' }); }
  const pending = [...day.occurrences].sort((a,b) => timeMinutes(a.time) - timeMinutes(b.time)).find((item) => !day.completions[item.id]);
  if ($('focusHabit')) $('focusHabit').textContent = pending ? (pending.label ? `${pending.activityName} · ${pending.label}` : pending.activityName) : (stats.possible ? 'Everything is done 🎉' : 'No habits scheduled');
  if ($('focusMeta')) $('focusMeta').textContent = pending ? `${pending.time || 'Any time'} · ${remaining} remaining today` : (stats.possible ? 'You completed your full routine for this day.' : 'Add a habit to start building your routine.');
  if ($('completionCelebration')) $('completionCelebration').hidden = !(stats.possible > 0 && stats.completed === stats.possible);
  renderLoveFeatures();
}

async function fetchAnalytics() {
  const month = $('analyticsMonthPicker').value || monthKey($('datePicker').value);
  $('analyticsStatus').textContent = 'Building your insights…';
  state.analyticsDays = await routineService.ensureMonth(month);
  const through = month === monthKey(todayIso()) ? todayIso() : null;
  const stats = analyticsForDays(state.analyticsDays, through);
  $('analyticsRate').textContent = `${stats.rate}%`;
  $('analyticsDone').textContent = String(stats.completed);
  $('analyticsStreak').textContent = `${stats.currentStreak}d`;
  $('analyticsPerfect').textContent = String(stats.perfectDays);
  $('consistencyChart').innerHTML = lineChart(stats.daily);
  $('habitRankChart').innerHTML = barChart(stats.activities);
  $('monthHeatmap').innerHTML = heatmap(stats.daily);
  $('analyticsStatus').textContent = stats.possible ? `${stats.completed} of ${stats.possible} scheduled habit checks completed.` : 'No scheduled habits in this period yet.';
}

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

function currentStreakValues() {
  if (!state.day?.occurrences) return [];
  return state.day.occurrences.map((item) => ({
    id: item.id,
    name: item.label ? `${item.activityName} · ${item.label}` : item.activityName,
    value: state.streaks.get(`${state.day.date}:${item.id}`)?.value ?? 0,
    checked: Boolean(state.day.completions?.[item.id])
  }));
}

function renderStreaksFeature() {
  const values = currentStreakValues();
  const positives = values.map(x => x.value).filter(v => v > 0);
  const best = positives.length ? Math.max(...positives) : 0;
  const wins = values.filter(x => x.checked).length;
  const milestones = [3,7,14,30,50,100];
  const next = milestones.find(m => m > best) || 100;
  const previous = [...milestones].reverse().find(m => m <= best) || 0;
  const denom = Math.max(1, next - previous);
  const pct = best >= 100 ? 100 : Math.max(0, Math.min(100, Math.round((best - previous) / denom * 100)));
  if ($('streakCurrentHero')) $('streakCurrentHero').textContent = best;
  if ($('streakBestActive')) $('streakBestActive').textContent = best;
  if ($('streakLongest')) $('streakLongest').textContent = best;
  if ($('streakTodayWins')) $('streakTodayWins').textContent = wins;
  if ($('nextMilestoneCopy')) $('nextMilestoneCopy').textContent = best >= 100 ? '100-day mastery achieved.' : `${Math.max(0,next-best)} more day${next-best===1?'':'s'} to the ${next}-day milestone.`;
  if ($('nextMilestoneBar')) $('nextMilestoneBar').style.width = `${pct}%`;
  if ($('habitStreakList')) $('habitStreakList').innerHTML = values.length ? values.sort((a,b)=>b.value-a.value).map(item => `<div class="habit-streak-row"><div><strong>${escapeHtml(item.name)}</strong><small>${item.checked ? 'Completed today' : 'Pending today'}</small></div><span>${streakMarkup(item.value)}</span></div>`).join('') : '<p class="summary">No habits scheduled for this day.</p>';
}

function renderAchievementsFeature() {
  const values = currentStreakValues();
  const best = values.map(x=>x.value).filter(v=>v>0).reduce((m,v)=>Math.max(m,v),0);
  const achievements = [
    [3,'🌱','3 Day Streak','Great start!'], [7,'🌟','7 Day Streak','One full week!'], [14,'💪','14 Day Streak','Momentum builder'],
    [30,'👑','30 Day Streak','A serious habit'], [50,'🏅','50 Day Streak','Legendary consistency'], [100,'💎','100 Day Streak','Master consistency']
  ];
  const unlocked = achievements.filter(([days])=>best>=days).length;
  if ($('achievementUnlockedCount')) $('achievementUnlockedCount').textContent = `${unlocked} of ${achievements.length} unlocked`;
  if ($('achievementList')) $('achievementList').innerHTML = achievements.map(([days,icon,title,copy]) => {
    const done = best >= days; const progress = Math.min(100, Math.round(best/days*100));
    return `<article class="achievement-item ${done?'unlocked':''}"><div class="achievement-icon">${icon}</div><div class="achievement-copy"><strong>${title}</strong><small>${copy}</small><div class="achievement-bar"><i style="width:${progress}%"></i></div></div><div class="achievement-state">${done?'✓':`${best}/${days}`}</div></article>`;
  }).join('');
}

function openSettingsFeature(action) {
  showView('settings-view');
  requestAnimationFrame(() => {
    const target = action === 'backup' ? $('backupRestoreDetails') : action === 'reminders' ? $('reminderStatusDetails') : action === 'privacy' ? $('privacyAccountDetails') : action === 'prayer' ? $('prayerProfileSettings') : null;
    if (target?.tagName === 'DETAILS') target.open = true;
    target?.scrollIntoView({behavior:'smooth', block:'center'});
    target?.classList.add('feature-focus'); setTimeout(()=>target?.classList.remove('feature-focus'),900);
  });
}

function showView(viewId) { if (state.activeView === 'location-view' && viewId !== 'location-view') { autocompleteController?.escape(); mountedMap?.destroy(); mountedMap = null; } state.activeView = viewId; document.querySelectorAll('.view-section').forEach((section) => section.classList.toggle('active', section.id === viewId)); $('home-controls').hidden = viewId !== 'home-view'; $('dropdownMenu').classList.remove('show'); document.querySelectorAll('[data-nav-view]').forEach((button) => button.classList.toggle('active', button.dataset.navView === viewId)); const chromeHidden = ['auth-view','location-view','routine-choice-view'].includes(viewId); if ($('bottomNav')) $('bottomNav').hidden = chromeHidden; if ($('quickAddHabit')) $('quickAddHabit').hidden = chromeHidden || viewId === 'manage-view'; if (viewId === 'analytics-view') { $('analyticsMonthPicker').value = monthKey($('datePicker').value); fetchAnalytics(); } if (viewId === 'streaks-view') renderStreaksFeature(); if (viewId === 'achievements-view') renderAchievementsFeature(); if (viewId === 'monthly-view') { $('monthPicker').value = monthKey($('datePicker').value); fetchMonthly(); } if (viewId === 'activity-view') { $('actMonthPicker').value = monthKey($('datePicker').value); $('actYearPicker').value = $('datePicker').value.slice(0, 4); updateActivityControls(); } if (viewId === 'manage-view') renderManagement(); if (viewId === 'settings-view') renderSimpleSettings(); if (viewId === 'admin-view') renderAdminUsers(); }
async function renderAdminUsers() { if (!adminService) return; try { const users = await adminService.listUsers(), term = $('adminSearch').value.toLowerCase(); $('adminUsers').innerHTML = users.filter((user) => `${user.displayName} ${user.email}`.toLowerCase().includes(term)).map((user) => `<div class="management-item"><div><strong>${escapeHtml(user.displayName || '')}</strong><div>${escapeHtml(user.email || '')}</div><small>${escapeHtml(user.accountStatus)} · ${escapeHtml(user.subscriptionStatus)}</small></div><div class="management-actions">${['activate','suspend','deactivate','startTrial','extend','expire','cancel','restore'].map((action) => `<button data-admin-action="${action}" data-uid="${user.uid}">${action}</button>`).join('')}</div></div>`).join(''); $('adminStatus').textContent = `${users.length} users loaded.`; } catch (error) { $('adminStatus').textContent = error.message; } }

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
function resetActivityForm() { $('activityForm').reset(); $('activityForm').hidden = false; $('editActivityId').value = ''; $('activityEnabled').checked = true; state.editingSlots = [createTimeSlot({ id: `slot-${Date.now()}`, enabled: true })]; writeSchedule(createSchedule()); renderTimeSlots(); $('saveActivity').textContent = 'Add Activity'; $('cancelActivityEdit').hidden = true; }
function scheduleSummary(schedule) { return ({ daily: 'Every day', 'selected-weekdays': schedule.weekdays.join(', '), weekly: `Every ${schedule.intervalWeeks} week(s): ${schedule.weekdays.join(', ')}`, monthly: `Monthly on day ${schedule.dayOfMonth}`, yearly: `Yearly on ${schedule.month}/${schedule.day}`, 'specific-date': schedule.date, 'specific-dates': `${schedule.dates.length} specific dates`, 'date-range': `${schedule.startDate} to ${schedule.endDate}`, none: 'No recurring schedule' })[schedule.type]; }
async function renderManagement(message = '') {
  const activities = await routineService.getActivities(); state.activities = activities.filter(({ enabled }) => enabled); activityOptions();
  state.settings = await routineService.getSettings(); $('prayerRoutineToggle').checked = state.settings.prayerRoutineEnabled !== false;
  $('management-status').textContent = message;
  const current = state.day || await routineService.getDay($('datePicker').value);
  $('activity-management-list').innerHTML = activities.map((activity, index) => {
    const occurrence = current?.occurrences?.find(({ activityId }) => activityId === activity.id); const actions = activityManagementControls(activity, index, activities.length);
    return `<div class="management-item${activity.enabled ? '' : ' disabled'}${activity.protected ? ' protected-activity' : ''}"><div><div class="management-name">${activity.protected ? '<span aria-label="Locked">🔒</span> ' : ''}${escapeHtml(activity.name)}</div><div class="management-meta">${activity.protected ? `Prayer-controlled timing${occurrence?.time ? ` · ${escapeHtml(occurrence.time)}` : ''}` : `${escapeHtml(scheduleSummary(activity.schedule))} · ${activity.timeSlots.length} time slot(s)`}</div></div><div>${activity.enabled ? 'Enabled' : 'Disabled'}</div><div class="management-actions">${actions}</div></div>`;
  }).join('');
}
function fillLocationForm(profile, { selected = true } = {}) { $('profilePlaceId').value = profile.placeId || ''; $('profileFormattedAddress').value = profile.formattedAddress || ''; $('profileCity').value = profile.city || ''; $('profileState').value = profile.state || ''; $('profileCountry').value = profile.country || ''; $('profileLatitude').value = profile.latitude ?? ''; $('profileLongitude').value = profile.longitude ?? ''; $('profileTimezone').value = profile.timeZone || resolveTimezone(profile.latitude, profile.longitude); $('profileMethod').value = profile.calculationMethod || 'Karachi'; $('profileMadhab').value = profile.madhab || 'Hanafi'; $('profileHighLatitudeRule').value = profile.highLatitudeRule || 'recommended'; $('profilePolarCircle').value = profile.polarCircleResolution || 'Unresolved'; $('profileShafaq').value = profile.shafaq || 'general'; $('profileFajrAngle').value = profile.fajrAngleOverride ?? ''; $('profileIshaAngle').value = profile.ishaAngleOverride ?? ''; $('profileIshaInterval').value = profile.ishaIntervalOverride ?? ''; $('profileSehriOffset').value = profile.sehriOffsetMinutes ?? 30; document.querySelectorAll('[data-adjustment]').forEach((input) => { input.value = profile.adjustments?.[input.dataset.adjustment] || 0; }); state.locationDraft = { selected: selected ? structuredClone(profile) : null, coordinatesChanged: false }; }
function renderSettings() { const profile = state.profile || DEFAULT_LOCATION_SUGGESTION; $('location-summary').innerHTML = `<p>${escapeHtml(profile.city)}, ${escapeHtml(profile.state)}, ${escapeHtml(profile.country)}</p><p>${profile.latitude}, ${profile.longitude} · ${escapeHtml(profile.timeZone)}</p><p>${escapeHtml(profile.calculationMethod)} · ${escapeHtml(profile.madhab)} · ${escapeHtml(profile.highLatitudeRule || 'recommended')}</p>`; }
function openLocationSetup(editing = false) { const profile = state.profile || DEFAULT_LOCATION_SUGGESTION; fillLocationForm(profile); $('locationSearch').value = profile.city; $('locationProviderLabel').textContent = searchProvider.label; $('locationProviderMessage').textContent = searchProvider.mode === 'mock' ? searchProvider.developmentMessage : ''; $('cancelLocation').hidden = !editing; $('menuButton').hidden = !editing; showView('location-view'); }
function readPrayerFormUnchecked() { return { placeId: $('profilePlaceId').value || null, formattedAddress: $('profileFormattedAddress').value, displayName: $('profileCity').value, city: $('profileCity').value, state: $('profileState').value, country: $('profileCountry').value, latitude: $('profileLatitude').value, longitude: $('profileLongitude').value, timeZone: $('profileTimezone').value, calculationMethod: $('profileMethod').value, madhab: $('profileMadhab').value, highLatitudeRule: $('profileHighLatitudeRule').value, polarCircleResolution: $('profilePolarCircle').value, shafaq: $('profileShafaq').value, fajrAngleOverride: $('profileFajrAngle').value, ishaAngleOverride: $('profileIshaAngle').value, ishaIntervalOverride: $('profileIshaInterval').value, sehriOffsetMinutes: $('profileSehriOffset').value, adjustments: Object.fromEntries([...document.querySelectorAll('[data-adjustment]')].map((input) => [input.dataset.adjustment, Number(input.value) || 0])), locationSource: state.locationDraft.selected?.locationSource || 'manual-coordinates', locationVersion: state.profile?.locationVersion || 'inspection' }; }
function readLocationForm() { if (!canActivateLocationDraft({ selectedPlace: state.locationDraft.selected, coordinatesChanged: state.locationDraft.coordinatesChanged })) throw new Error('Select a city suggestion or confirm validated manual coordinates.'); return readPrayerFormUnchecked(); }

function renderProfileIdentity() {
  const firebaseName = state.account?.displayName?.trim();
  $('userDisplayName').textContent = firebaseName || profileHeading(state.profile);

  const location = profileLocationLabel(state.profile);
  $('homeLocation').textContent = location;
  $('homeLocation').hidden = !location;
}
function fillSimpleLocationForm(profile, { selected = true } = {}) { const automatic = automaticPrayerSettings(profile); $('profileDisplayName').value = state.profile?.displayName || profile.displayName || ''; $('profilePlaceId').value = profile.placeId || ''; $('profileFormattedAddress').value = profile.formattedAddress || ''; $('profileCity').value = profile.city || ''; $('profileState').value = profile.state || ''; $('profileCountry').value = profile.country || ''; $('profileLatitude').value = profile.latitude ?? ''; $('profileLongitude').value = profile.longitude ?? ''; $('profileTimezone').value = profile.timeZone || resolveTimezone(profile.latitude, profile.longitude); $('profileMethod').value = automatic.calculationMethod; $('profileMadhab').value = automatic.madhab; $('profileHighLatitudeRule').value = automatic.highLatitudeRule; $('profilePolarCircle').value = automatic.polarCircleResolution; $('profileShafaq').value = automatic.shafaq; $('profileFajrAngle').value = ''; $('profileIshaAngle').value = ''; $('profileIshaInterval').value = ''; $('profileSehriOffset').value = profile.sehriOffsetMinutes ?? state.profile?.sehriOffsetMinutes ?? 30; state.locationDraft = { selected: selected ? structuredClone(profile) : null, coordinatesChanged: false }; }
function renderSimpleSettings() {
  const profile = state.profile || DEFAULT_LOCATION_SUGGESTION;
  $('settingsDisplayName').value =
    state.account?.displayName || profile.displayName || ''; $('prayerProfileSettings').hidden = state.settings?.prayerRoutineEnabled === false; $('location-summary').innerHTML = `<p>${escapeHtml(profile.city)}, ${escapeHtml(profile.state || profile.country)}</p><p>${escapeHtml(profile.timeZone)}</p>`; $('automaticPrayerSummary').textContent = `${profile.calculationMethod} · Hanafi · automatic high-latitude handling`; $('settingsSehriOffset').value = profile.sehriOffsetMinutes ?? 30; $('accountSummary').innerHTML = state.account ? `<p>Account: ${escapeHtml(state.account.accountStatus)}</p><p>Subscription: ${escapeHtml(state.account.subscriptionStatus)}${state.account.subscriptionEnd?.toDate ? ` · until ${state.account.subscriptionEnd.toDate().toLocaleDateString()}` : ''}</p>` : '<p>Development/local account</p>'; document.querySelectorAll('[data-settings-adjustment]').forEach((input) => { input.value = profile.adjustments?.[input.dataset.settingsAdjustment] || 0; }); }
function openSimpleLocationSetup(editing = false) { const profile = state.profile || DEFAULT_LOCATION_SUGGESTION; fillSimpleLocationForm(profile); if (!state.profile) $('profileDisplayName').value = ''; $('locationSearch').value = profile.city; $('locationProviderLabel').textContent = searchProvider.label; $('locationProviderMessage').textContent = import.meta.env.DEV && searchProvider.mode === 'mock' ? searchProvider.developmentMessage : ''; $('cancelLocation').hidden = !editing; $('menuButton').hidden = !editing; showView('location-view'); }
function readSimplePrayerForm() { const location = { placeId: $('profilePlaceId').value || null, formattedAddress: $('profileFormattedAddress').value, displayName: validateDisplayName($('profileDisplayName').value), city: $('profileCity').value, state: $('profileState').value, country: $('profileCountry').value, latitude: $('profileLatitude').value, longitude: $('profileLongitude').value, timeZone: $('profileTimezone').value, sehriOffsetMinutes: state.profile?.sehriOffsetMinutes ?? 30, adjustments: state.profile?.adjustments || resetPrayerAdjustments(), locationSource: state.locationDraft.selected?.locationSource || 'manual-coordinates', locationVersion: state.profile?.locationVersion || 'inspection' }; return { ...location, ...automaticPrayerSettings(location) }; }
function readSimpleLocationForm() { if (!canActivateLocationDraft({ selectedPlace: state.locationDraft.selected, coordinatesChanged: state.locationDraft.coordinatesChanged })) throw new Error('Select, detect, or confirm a location first.'); return readSimplePrayerForm(); }

function renderLocationResults(searchState) { state.locationResults = searchState.results; $('locationSearch').setAttribute('aria-expanded', String(['results', 'fallback', 'loading', 'empty', 'error'].includes(searchState.status))); const buttons = () => searchState.results.map((item, index) => `<button class="location-result${index === searchState.activeIndex ? ' active' : ''}" role="option" aria-selected="${index === searchState.activeIndex}" type="button" data-location-index="${index}"><strong>${escapeHtml(item.displayName || item.city || item.label)}</strong><span>${escapeHtml(item.secondaryText || [item.state, item.country].filter(Boolean).join(', '))}</span></button>`).join(''); if (searchState.status === 'loading') $('locationResults').innerHTML = '<p class="summary">Searching cities…</p>'; else if (searchState.status === 'empty') $('locationResults').innerHTML = `<p class="summary">${searchProvider.mode === 'mock' ? 'No matching development locations' : 'No matching cities found.'}</p>`; else if (searchState.status === 'error') $('locationResults').innerHTML = `<p class="summary location-error">${escapeHtml(searchState.error?.message || 'City search failed. Please retry.')}</p>`; else if (searchState.status === 'fallback') $('locationResults').innerHTML = `<p class="summary location-error">${escapeHtml(searchState.error.message)} Showing ${escapeHtml(searchState.fallbackLabel)}.</p>${buttons()}`; else $('locationResults').innerHTML = buttons(); }
async function selectLocationResult(item) { $('location-status').textContent = 'Resolving selected city…'; try { const location = item.latitude != null ? item : await searchProvider.details(item.placeId); fillSimpleLocationForm({ ...DEFAULT_LOCATION_SUGGESTION, ...location, displayName: $('profileDisplayName').value }); $('locationSearch').value = location.city || location.displayName; autocompleteController.escape(); $('location-status').textContent = 'City selected. Review the details and confirm.'; } catch (error) { console.error('Place resolution failed.', error); $('location-status').textContent = `Unable to resolve this city: ${error.message}`; } }
function updatePrayerDiagnostics() { if (!import.meta.env.DEV || !state.profile) return; const cache = routineService.prayerCache.lastResult; $('prayerDiagnostics').hidden = false; $('prayerDiagnostics').textContent = `Development diagnostics — coordinates: ${state.profile.latitude}, ${state.profile.longitude}; timezone: ${state.profile.timeZone}; method: ${state.profile.calculationMethod}; madhab: ${state.profile.madhab}; high latitude: ${state.profile.highLatitudeRule || 'recommended'}; fingerprint: ${prayerSettingsFingerprint(state.profile)}; timing source: ${cache?.source || 'not loaded'}.`; }

function bindEvents() {
  $('themeToggle')?.addEventListener('click', toggleTheme); $('profileThemeToggle')?.addEventListener('click', toggleTheme); document.getElementById('accentCycle')?.addEventListener('click', cycleAccent); document.querySelectorAll('[data-accent]').forEach((button) => button.addEventListener('click', () => setAccent(button.dataset.accent))); document.querySelectorAll('[data-feature-view]').forEach((button)=>button.addEventListener('click',()=>showView(button.dataset.featureView))); document.querySelectorAll('[data-feature-action]').forEach((button)=>button.addEventListener('click',()=>openSettingsFeature(button.dataset.featureAction)));  document.querySelectorAll('[data-theme-mode]').forEach((button) => button.addEventListener('click', () => { const mode = button.dataset.themeMode; if (!THEME_MODES.includes(mode)) return; localStorage.setItem('moinRoutineTheme', mode); applyAppearance(mode, preferredAccent()); }));
  if ($('soundFeedbackToggle')) { $('soundFeedbackToggle').checked = localStorage.getItem('moinRoutineSound') !== 'off'; $('soundFeedbackToggle').addEventListener('change', ({ target }) => { localStorage.setItem('moinRoutineSound', target.checked ? 'on' : 'off'); if (target.checked) feedbackPulse(false); }); }
  if ($('vibrationFeedbackToggle')) { $('vibrationFeedbackToggle').checked = localStorage.getItem('moinRoutineVibration') !== 'off'; $('vibrationFeedbackToggle').addEventListener('change', ({ target }) => { localStorage.setItem('moinRoutineVibration', target.checked ? 'on' : 'off'); if (target.checked && navigator.vibrate) navigator.vibrate(30); }); }
  $('installApp').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('installApp').hidden = true; });
  $('menuButton').addEventListener('click', (event) => { event.stopPropagation(); const open = $('dropdownMenu').classList.toggle('show'); $('menuButton').setAttribute('aria-expanded', String(open)); }); document.addEventListener('click', () => $('dropdownMenu').classList.remove('show'));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('authStatus').textContent = 'Signing in…';

    try {
      await authService.login(
        $('loginEmail').value,
        $('loginPassword').value,
      );
      trackEvent('login_success');
      location.reload();
    } catch (error) {
      $('authStatus').textContent =
        error.code === 'auth/invalid-credential'
          ? 'Email or password is incorrect.'
          : error.message;
    }
  });
  $('signupForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await authService.signup({ displayName: $('signupName').value, email: $('signupEmail').value, password: $('signupPassword').value, confirmPassword: $('signupConfirm').value }); $('authStatus').textContent = 'Verification email sent. Verify your email, then ask the owner to activate your account.'; } catch (error) { $('authStatus').textContent = error.message; } });
  $('forgotPassword').addEventListener('click', async () => { const email = $('loginEmail').value; if (!email) { $('authStatus').textContent = 'Enter your email first.'; return; } try { await authService.resetPassword(email); $('authStatus').textContent = 'Password reset email sent.'; } catch (error) { $('authStatus').textContent = error.message; } });
  $('logoutButton').addEventListener('click', async () => { if (authService) await authService.logout(); location.reload(); });
  $('requestAlarmPermissions').addEventListener('click', async () => { try { const result=await nativeAlarmService.requestPermissions(); $('alarmPermissionStatus').textContent=`Notifications: ${result.notifications}; exact alarms: ${result.exact?'allowed':'inexact fallback active'}.`; } catch(error){ $('alarmPermissionStatus').textContent=error.message; } });
  $('deleteLocalData').addEventListener('click', async () => { if (!confirm('Delete all routine history and settings stored on this device? This cannot be undone unless you have a backup.')) return; await deleteAllLocalData(); location.reload(); });
  $('requestAccountDeletion').addEventListener('click', async () => { if (!authService) { $('profile-status').textContent='No online account is configured.'; return; } try { await authService.requestAccountDeletion(); $('profile-status').textContent='Account deletion request submitted.'; } catch(error){ $('profile-status').textContent=error.message; } });
  $('adminRefresh').addEventListener('click', renderAdminUsers); $('adminSearch').addEventListener('input', renderAdminUsers); $('adminUsers').addEventListener('click', async ({ target }) => { if (!target.dataset.adminAction) return; try { await adminService.updateUser({ targetUid: target.dataset.uid, action: target.dataset.adminAction, subscriptionStart: $('adminStart').value || undefined, subscriptionEnd: $('adminEnd').value || undefined }); await renderAdminUsers(); } catch (error) { $('adminStatus').textContent = error.message; } });
  $('datePicker').addEventListener('change', fetchRoutine); $('previousDate').addEventListener('click', () => { if (!validIsoDate($('datePicker').value)) return; $('datePicker').value = addDays($('datePicker').value, -1); fetchRoutine(); }); $('nextDate').addEventListener('click', () => { if (!validIsoDate($('datePicker').value)) return; $('datePicker').value = addDays($('datePicker').value, 1); fetchRoutine(); });
  $('dailyAlarmToggle').addEventListener('click', async () => { const day = requireCurrentDay('daily alarm toggle'); if (!day) return; await routineService.setDayAlarms(day.date, !day.alarmsEnabled); await fetchRoutine(); });
  $('closeAllDone')?.addEventListener('click', closeAllDoneCelebration); $('allDoneModal')?.addEventListener('click', (event) => { if (event.target === $('allDoneModal')) closeAllDoneCelebration(); }); document.querySelectorAll('[data-setting-action]').forEach((button) => button.addEventListener('click', () => openSettingsFeature(button.dataset.settingAction)));
  $('routine-list').addEventListener('change', async ({ target }) => { if (!target.dataset.completion) return; const day = requireCurrentDay('completion update'); if (!day) return; const id = target.dataset.completion, checked = target.checked, previous = Boolean(state.day.completions[id]); state.day.completions[id] = checked; const streakRecord = state.streaks.get(`${day.date}:${id}`); if (streakRecord) { streakRecord.value = evaluateTargetStreak(streakRecord.history, checked); const badge = document.querySelector(`[data-streak-for="${CSS.escape(id)}"]`); if (badge) badge.innerHTML = streakMarkup(streakRecord.value); } calculateDailyProgress(); renderHomeSnapshot(); if (checked) maybeShowAllDoneCelebration(); feedbackPulse(checked); if (checked) { const currentStreak = streakRecord?.value || 1; if ([3,7,14,30,50,100].includes(currentStreak)) showAppToast(`${currentStreak}-day streak!`, '🔥'); } target.closest('.routine-item')?.classList.add('completion-pop'); setTimeout(() => target.closest('.routine-item')?.classList.remove('completion-pop'), 260); try { await routineService.setCompletion(day.date, id, checked); state.monthDays = []; state.activityDays = []; state.analyticsDays = []; if (!streakRecord) refreshVisibleStreaks(); } catch (error) { if (state.day?.date === day.date) { state.day.completions[id] = previous; target.checked = previous; if (streakRecord) { streakRecord.value = evaluateTargetStreak(streakRecord.history, previous); const badge = document.querySelector(`[data-streak-for="${CSS.escape(id)}"]`); if (badge) badge.innerHTML = streakMarkup(streakRecord.value); } calculateDailyProgress(); renderHomeSnapshot(); } console.error('Unable to save completion', error); } });
  $('home-view').addEventListener('click', async ({ target }) => { if (target.dataset.view) { showView(target.dataset.view); return; } if (target.hasAttribute('data-retry-routine')) { await fetchRoutine(); return; } const alarmId = target.dataset.alarm; if (!alarmId) return; const day = requireCurrentDay('individual alarm toggle'); if (!day) return; await routineService.setAlarm(day.date, alarmId, !alarmEnabled(day, alarmId)); if (state.day?.date === day.date) await fetchRoutine(); });
  $('analyticsMonthPicker').addEventListener('change', fetchAnalytics); $('monthPicker').addEventListener('change', fetchMonthly); $('monthlyProgressRing').addEventListener('click', () => { state.progressToToday = !state.progressToToday; renderMonthly(); });
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
  $('activity-management-list').addEventListener('click', async ({ target }) => { const action = target.dataset.manage, id = target.dataset.id; if (!action || !id) return; const activities = await routineService.getActivities(); const activity = activities.find((item) => item.id === id); if (action === 'edit') { if (activity.protected) return; $('editActivityId').value = id; $('activityName').value = activity.name; $('activityEnabled').checked = activity.enabled; state.editingSlots = cloneSlots(activity.timeSlots); writeSchedule(activity.schedule); renderTimeSlots(); $('saveActivity').textContent = 'Save Changes'; $('cancelActivityEdit').hidden = false; return; } if (action === 'toggle') await routineService.editActivity(id, { enabled: !activity.enabled }); if (action === 'notification') await routineService.editActivity(id, { timeSlots: activity.timeSlots.map((slot) => ({ ...slot, notificationEnabled: !activity.timeSlots.some((item) => item.notificationEnabled) })) }); if (action === 'remove') await routineService.softDeleteActivity(id); if (action === 'up' || action === 'down') { const swap = activities.findIndex((item) => item.id === id) + (action === 'up' ? -1 : 1); const ids = activities.map((item) => item.id); [ids[ids.indexOf(id)], ids[swap]] = [ids[swap], id]; await routineService.reorderActivities(ids); } await renderManagement('Activity list updated.'); });
  $('prayerRoutineToggle').addEventListener('change', async ({ target }) => { if (!target.checked) { await routineService.setPrayerRoutineEnabled(false); state.settings = await routineService.getSettings(); state.activities = []; await refreshDefinitions(); await renderManagement('Namaz and Sehri removed from future routines. History is preserved.'); return; } target.checked = false; state.enablingPrayer = true; openSimpleLocationSetup(true); $('location-status').textContent = 'Confirm your location to include Namaz and Sehri.'; });
  $('choosePredefined').addEventListener('click', async () => { $('routine-choice-status').textContent = 'Preparing your routine…'; state.settings = await routineService.setOnboardingChoice('predefined'); await refreshDefinitions(); showView('home-view'); await fetchRoutine(); });
  $('chooseCustom').addEventListener('click', async () => { $('routine-choice-status').textContent = 'Preparing Activity Management…'; state.settings = await routineService.setOnboardingChoice('custom'); await refreshDefinitions(); showView('manage-view'); await renderManagement('Add your first activity below.'); });
  $('homeLocation').addEventListener('click', () => showView('settings-view')); $('changeLocation').addEventListener('click', () => openSimpleLocationSetup(true)); $('cancelLocation').addEventListener('click', async () => { if (state.enablingPrayer) { state.enablingPrayer = false; await routineService.setPrayerRoutineEnabled(false); } showView('settings-view'); });
  $('nameForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const name = $('settingsDisplayName').value.trim();

      if (authService) {
        state.account = await authService.updateDisplayName(name);
      }

      state.profile = await routineService.saveDisplayName(name);
      renderProfileIdentity();
      renderSimpleSettings();

      $('profile-status').textContent =
        'Name updated on this device and Firebase.';
    } catch (error) {
      $('profile-status').textContent = error.message;
    }
  });
  $('detectLocation').addEventListener('click', async () => { $('location-status').textContent = 'Detecting location…'; try { const coordinates = await geolocationProvider.detect(); const named = await searchProvider.reverseGeocode(coordinates); fillSimpleLocationForm({ ...DEFAULT_LOCATION_SUGGESTION, ...named, ...coordinates, displayName: $('profileDisplayName').value, timeZone: resolveTimezone(coordinates.latitude, coordinates.longitude), placeId: named.placeId || null, locationSource: 'device-foreground' }); $('location-status').textContent = 'Location detected. Review and confirm.'; } catch (error) { $('location-status').textContent = `${error.message} Use city search or select a point on the map.`; } });
  $('searchCityChoice').addEventListener('click', () => $('locationSearch').focus());
  $('selectMapChoice').addEventListener('click', async () => { $('mapPanel').hidden = false; $('mapProviderLabel').textContent = import.meta.env.DEV ? mapProvider.label : ''; mountedMap?.destroy(); try { mountedMap = await mapProvider.mount({ container: $('locationMap'), initial: state.locationDraft.selected || state.profile || DEFAULT_LOCATION_SUGGESTION, onChange: (location) => { state.mapDraft = location; $('location-status').textContent = 'Marker selected. Confirm it to review the location.'; }, onError: (error) => { $('location-status').textContent = `Unable to resolve the map location: ${error.message}`; } }); } catch (error) { $('location-status').textContent = `Unable to open map selection: ${error.message}`; } });
  $('confirmMapLocation').addEventListener('click', () => { if (!state.mapDraft) return; fillSimpleLocationForm({ ...DEFAULT_LOCATION_SUGGESTION, ...state.mapDraft, displayName: $('profileDisplayName').value }); $('locationSearch').value = state.mapDraft.city; $('mapPanel').hidden = true; $('location-status').textContent = 'Map location selected. Review and confirm.'; });
  if (!autocompleteBinding) autocompleteBinding = new LocationAutocompleteDomBinding({ input: $('locationSearch'), results: $('locationResults'), controller: autocompleteController, onQueryChanged: () => { state.locationDraft.selected = null; $('profilePlaceId').value = ''; }, onSelect: selectLocationResult });
  window.addEventListener('beforeunload', () => autocompleteBinding?.destroy(), { once: true });
  ['profileCity', 'profileState', 'profileCountry'].forEach((id) => $(id).addEventListener('input', () => { state.locationDraft.selected = null; $('profilePlaceId').value = ''; }));
  ['profileLatitude', 'profileLongitude'].forEach((id) => $(id).addEventListener('input', () => { try { const latitude = Number($('profileLatitude').value), longitude = Number($('profileLongitude').value); if (latitude < -90 || latitude > 90) throw new Error('Latitude must be between -90 and 90.'); if (longitude < -180 || longitude > 180) throw new Error('Longitude must be between -180 and 180.'); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return; $('profileTimezone').value = resolveTimezone(latitude, longitude); $('profilePlaceId').value = ''; state.locationDraft = { selected: null, coordinatesChanged: true }; $('location-status').textContent = 'Manual coordinates validated. Review and confirm.'; } catch (error) { state.locationDraft.coordinatesChanged = false; $('location-status').textContent = error.message; } }));
  $('locationForm').addEventListener('submit', async (event) => { event.preventDefault(); const submit = event.submitter || $('locationForm').querySelector('[type="submit"]'); submit.disabled = true; $('location-status').textContent = 'Updating location and prayer times…'; const enablingPrayer = state.enablingPrayer; try { const draft = readSimpleLocationForm(); if (enablingPrayer) await routineService.setPrayerRoutineEnabled(true); const result = await saveLocationAndRefresh({ repository: routineService, draft, currentDate: todayIso(), refreshHome: async () => { state.monthDays = []; state.activityDays = []; $('menuButton').hidden = false; await refreshDefinitions(); } }); state.profile = result.profile; state.settings = await routineService.getSettings(); state.enablingPrayer = false; renderProfileIdentity(); updatePrayerDiagnostics(); if (!state.settings.onboardingChoice) showView('routine-choice-view'); else { showView('home-view'); await fetchRoutine(); } $('location-status').textContent = 'Location and prayer times updated.'; } catch (error) { if (enablingPrayer) { await routineService.setPrayerRoutineEnabled(false); state.enablingPrayer = false; } console.error('Location profile save failed.', error); $('location-status').textContent = `Unable to save location: ${error.message}. Your previous location remains active.`; } finally { submit.disabled = false; } });
  $('adjustmentForm').addEventListener('submit', async (event) => { event.preventDefault(); $('profile-status').textContent = 'Updating prayer times…'; try { state.profile = await routineService.savePrayerAdjustments({ adjustments: Object.fromEntries([...document.querySelectorAll('[data-settings-adjustment]')].map((input) => [input.dataset.settingsAdjustment, Number(input.value) || 0])), sehriOffsetMinutes: Number($('settingsSehriOffset').value) }, { currentDate: todayIso(), warmCache: true }); state.monthDays = []; state.activityDays = []; await fetchRoutine(); renderSimpleSettings(); $('profile-status').textContent = 'Prayer time adjustments updated.'; } catch (error) { $('profile-status').textContent = error.message; } });
  $('resetAdjustments').addEventListener('click', async () => { document.querySelectorAll('[data-settings-adjustment]').forEach((input) => { input.value = 0; }); $('settingsSehriOffset').value = 30; $('adjustmentForm').requestSubmit(); });
  $('exportBackup').addEventListener('click', async () => { try { await saveBackupFile(await backupService.exportJson()); $('backupStatus').textContent = 'Backup exported.'; } catch (error) { $('backupStatus').textContent = `Backup failed: ${error.message}`; } });
  $('importBackup').addEventListener('click', async () => { try { const json = await pickBackupFile(); const preview = backupService.preview(JSON.parse(json)); if (!confirm(`Restore ${preview.activities} activities and ${preview.routineDays} routine days? A safety backup will be kept for this session.`)) return; await backupService.importJson(json); location.reload(); } catch (error) { $('backupStatus').textContent = `Restore failed: ${error.message}`; } });
  $('runPrayerInspector').addEventListener('click', () => { try { const profile = createLocationProfile(readSimplePrayerForm()); $('prayerInspectorOutput').textContent = JSON.stringify({ ...inspectPrayerCalculation($('inspectorDate').value, profile), cacheState: routineService.prayerCache.lastResult || { source: 'not loaded' }, homeFajr: state.day?.prayerTimes?.fajrStart || null }, null, 2); } catch (error) { $('prayerInspectorOutput').textContent = `Unable to inspect calculation: ${error.message}`; } });
}

function initialiseControls() {
  streakStartDate();
  applyAppearance();
  autocompleteController = new LocationAutocompleteController({ provider: searchProvider, onState: renderLocationResults });
  $('weekdayChoices').innerHTML = WEEKDAY_KEYS.map((day) => `<label><input type="checkbox" name="scheduleWeekday" value="${day}">${day.slice(0, 3)}</label>`).join('');
  $('settingsPrayerAdjustments').innerHTML = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((prayer) => `<label>${prayer[0].toUpperCase() + prayer.slice(1)}<input type="number" data-settings-adjustment="${prayer}" value="0" step="1"></label>`).join(''); resetActivityForm();
  const currentYear = Number(todayIso().slice(0, 4)); $('actYearPicker').innerHTML = Array.from({ length: 9 }, (_, index) => currentYear - 4 + index).map((year) => `<option value="${year}">${year}</option>`).join('');
  $('datePicker').value = todayIso(); $('monthPicker').value = monthKey(todayIso()); $('actMonthPicker').value = monthKey(todayIso()); $('actYearPicker').value = String(currentYear);
  $('inspectorDate').value = todayIso(); if (import.meta.env.DEV) $('prayerInspector').hidden = false;
  $('appVersion').textContent = import.meta.env.VITE_APP_VERSION || '0.1.0';
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => console.warn('Service worker registration failed', error));
  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('en-US', { timeZone: APP_TIME_ZONE, hour12: true }); }, 1000);
}

function cloneSlots(slots) { return structuredClone(slots); }
async function bootstrap() {
  initialiseControls();
  dailyLoader = new DailyLoadController({ repository: routineService, onLoading: (loading) => { setDailyLoading(loading); if (loading) { state.day = null; $('routine-list').innerHTML = '<i>Loading data...</i>'; $('bottom-timings').hidden = true; } }, onSuccess: (day) => { state.day = day; renderDay(); updatePrayerDiagnostics(); }, onError: showDailyError });
  bindEvents(); setDailyLoading(true);
  try {
    if (!authService) {
      setDailyLoading(false);
      $('menuButton').hidden = true;
      showView('auth-view');
      $('authStatus').textContent =
        'Firebase account setup is incomplete. Add your Firebase config in src/firebase.js.';
      return;
    }

    const user = await authService.waitForUser();

    if (!user) {
      setDailyLoading(false);
      $('menuButton').hidden = true;
      showView('auth-view');
      return;
    }

    let access;

    try {
      access = navigator.onLine
        ? await authService.access(user)
        : authService.cachedAccess(user);
    } catch (error) {
      console.warn('Online account check failed.', error);
      access = authService.cachedAccess(user);
    }

    if (!access.allowed) {
      setDailyLoading(false);
      $('menuButton').hidden = true;
      showView('auth-view');

      $('authStatus').textContent = {
        suspended: 'This account has been suspended.',
        deactivated: 'This account has been deactivated.',
        'reconnect-required':
          'Connect to the internet once so your account can be verified.',
        'account-missing':
          'Your account profile could not be loaded.',
      }[access.reason] || 'Account access is unavailable.';

      return;
    }

    state.account = access.record;
    $('menuButton').hidden = false;

    const token = await user.getIdTokenResult();
    $('adminMenuButton').hidden = token.claims.admin !== true;
    const initialization = await routineService.initialize(); if (import.meta.env.DEV) console.info('[development] IndexedDB diagnostics', initialization.diagnostics);
    state.settings = await routineService.getSettings();
    await refreshDefinitions();
    state.profile = await routineService.getLocationProfile();

    if (
      state.profile &&
      state.account?.displayName &&
      state.profile.displayName !== state.account.displayName
    ) {
      state.profile = await routineService.saveDisplayName(
        state.account.displayName,
      );
    }

    await routineService.ensurePrayerCalculatorCurrent();
    renderProfileIdentity(); if (state.profile && state.settings.onboardingChoice) { await fetchRoutine(); if (state.settings.prayerRoutineEnabled !== false) void routineService.warmPrayerCache(); void routineService.getStoredDays().then((days)=>alarmCoordinator.reschedule(days,state.profile,state.settings)); } else if (state.profile) { setDailyLoading(false); showView('routine-choice-view'); } else { setDailyLoading(false); openSimpleLocationSetup(false); }
  } catch (error) { console.error('Application database initialization failed.', error); setDailyLoading(false); showView('home-view'); showDailyError(error, $('datePicker').value || 'the selected date'); }
}
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; if ($('installApp')) $('installApp').hidden = false; });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; if ($('installApp')) $('installApp').hidden = true; });
await bootstrap();

window.addEventListener('DOMContentLoaded', () => initFirebaseAnalytics());

document.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[type="checkbox"][data-completion]');
  if (!checkbox) return;

  trackEvent(checkbox.checked ? 'habit_completed' : 'habit_unchecked', {
    habit_id: checkbox.dataset.completion || 'unknown',
  });
});

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a, [role="button"]');
  if (!target) return;

  const id = target.id || '';
  const label = (target.textContent || '').trim().toLowerCase();

  if (id === 'themeToggle') trackEvent('theme_toggle_clicked');
  if (label.includes('analytics')) trackEvent('analytics_opened');
  if (label.includes('achievement')) trackEvent('achievements_opened');
  if (label.includes('profile')) trackEvent('profile_opened');
  if (label.includes('backup')) trackEvent('backup_opened');
  if (label.includes('reminder')) trackEvent('reminders_opened');
});

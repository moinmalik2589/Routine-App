export function calculateMonthlyProgress(days, throughDate = null) {
  const relevant = throughDate ? days.filter(({ date }) => date <= throughDate) : days;
  let completed = 0, possible = 0;
  for (const day of relevant) for (const activity of day.activities) { possible++; if (day.completions[activity.id]) completed++; }
  return { completed, possible, percent: possible ? Math.round(completed / possible * 100) : 0 };
}

export function calculateActivityProgress(days, activityId, throughDate = null) {
  const relevant = throughDate ? days.filter(({ date }) => date <= throughDate) : days;
  const applicable = relevant.filter(({ activities }) => activities.some(({ id }) => id === activityId));
  const completed = applicable.filter(({ completions }) => completions[activityId]).length;
  return { completed, possible: applicable.length, percent: applicable.length ? Math.round(completed / applicable.length * 100) : 0 };
}

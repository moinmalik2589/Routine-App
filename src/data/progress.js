export function calculateMonthlyProgress(days, throughDate = null) {
  const relevant = throughDate ? days.filter(({ date }) => date <= throughDate) : days;
  let completed = 0, possible = 0;
  for (const day of relevant) for (const occurrence of day.occurrences || []) { possible++; if (day.completions[occurrence.id]) completed++; }
  return { completed, possible, percent: possible ? Math.round(completed / possible * 100) : 0 };
}

export function calculateActivityProgress(days, activityId, throughDate = null) {
  const relevant = throughDate ? days.filter(({ date }) => date <= throughDate) : days;
  const occurrences = relevant.flatMap((day) => (day.occurrences || []).filter((item) => item.activityId === activityId).map((item) => ({ ...item, completed: day.completions[item.id] })));
  const completed = occurrences.filter((item) => item.completed).length;
  return { completed, possible: occurrences.length, percent: occurrences.length ? Math.round(completed / occurrences.length * 100) : 0 };
}

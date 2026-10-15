// Testhulpjes. 2026-10-12 is een maandag, 2026-10-15 een donderdag, 2026-10-18 een zondag.

export const weekdaysSchedule = (weekdays) => ({ type: 'weekdays', weekdays });
export const perWeek = (count) => ({ type: 'times_per_period', period: 'week', count });
export const perMonth = (count) => ({ type: 'times_per_period', period: 'month', count });
export const onDay = (day) => ({ type: 'day_of_month', day });

export function habit(schedule, startDate, extra = {}) {
  return {
    id: extra.id ?? 'h1',
    status: 'active',
    startDate,
    schedules: [{ effectiveFrom: startDate, schedule }],
    ...extra,
  };
}

export const checks = (...pairs) =>
  pairs.map(([date, status = 'done']) => ({ date, status }));

export const statuses = (units) => units.map((u) => u.status);

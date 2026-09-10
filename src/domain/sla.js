/** HFN holidays are supplied as ISO local-date strings by configuration/data. */
export const defaultCalendar = Object.freeze({ timeZone: 'America/Los_Angeles', businessStart: { hour: 8, minute: 30 }, businessEnd: { hour: 17, minute: 0 }, workdays: [1, 2, 3, 4, 5], holidays: [] });
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const minutes = value => value.hour * 60 + value.minute;
const setBusinessTime = (date, value) => date.setHours(value.hour, value.minute, 0, 0);
const isWorkday = (date, calendar) => calendar.workdays.includes(date.getDay()) && !calendar.holidays.includes(dayKey(date));
/** Adds working time using the HFN Pacific business calendar. The hosting process must run in the configured time zone. */
export function addBusinessHours(start, hours, calendar = defaultCalendar) {
  let cursor = new Date(start); let remainingMinutes = Math.round(hours * 60);
  const opening = minutes(calendar.businessStart), closing = minutes(calendar.businessEnd);
  while (remainingMinutes > 0) {
    if (!isWorkday(cursor, calendar)) { cursor.setDate(cursor.getDate() + 1); setBusinessTime(cursor, calendar.businessStart); continue; }
    const current = cursor.getHours() * 60 + cursor.getMinutes();
    if (current < opening) { setBusinessTime(cursor, calendar.businessStart); continue; }
    if (current >= closing) { cursor.setDate(cursor.getDate() + 1); setBusinessTime(cursor, calendar.businessStart); continue; }
    const used = Math.min(remainingMinutes, closing - current);
    cursor = new Date(cursor.getTime() + used * 60000); remainingMinutes -= used;
  }
  return cursor;
}
export function dueAt(start, rule, calendar = defaultCalendar) {
  return rule.kind === 'calendarDays' ? new Date(new Date(start).getTime() + rule.value * 86400000) : addBusinessHours(start, rule.value, calendar);
}
export const laterOf = (...timestamps) => new Date(Math.max(...timestamps.filter(Boolean).map(value => new Date(value).getTime())));
export function slaState(start, completedAt, rule, now = new Date(), calendar = defaultCalendar) {
  if (!start) return { state: 'not-started', completed: false, breached: false, dueAt: null, progress: 0 };
  const due = dueAt(start, rule, calendar); const end = completedAt ? new Date(completedAt) : now;
  const breached = end > due;
  const elapsed = end - new Date(start), total = due - new Date(start);
  return { dueAt: due.toISOString(), breached, completed: Boolean(completedAt), progress: Math.max(0, elapsed / total), state: completedAt ? (breached ? 'breached' : 'completed') : breached ? 'breached' : elapsed / total >= .8 ? 'at-risk' : 'on-track' };
}

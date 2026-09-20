/** HFN holidays are supplied as ISO Pacific local-date strings by configuration/data. */
export const defaultCalendar = Object.freeze({ timeZone: 'America/Los_Angeles', businessStart: { hour: 8, minute: 30 }, businessEnd: { hour: 17, minute: 0 }, workdays: [1, 2, 3, 4, 5], holidays: [] });
let activeCalendar = defaultCalendar;
export const setHfnBusinessCalendar = calendar => { activeCalendar = { ...defaultCalendar, ...calendar, holidays:[...(calendar?.holidays ?? defaultCalendar.holidays)] }; };

const formatterCache = new Map();
const formatterFor = timeZone => {
  if (!formatterCache.has(timeZone)) formatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }));
  return formatterCache.get(timeZone);
};
const localParts = (instant, timeZone) => Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(instant)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
const localMillis = parts => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
const dateKey = parts => `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
const minutes = value => value.hour * 60 + value.minute;
const nextDate = parts => { const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1)); return { ...parts, year:date.getUTCFullYear(), month:date.getUTCMonth() + 1, day:date.getUTCDate() }; };
const atBusinessTime = (parts, value) => ({ ...parts, hour:value.hour, minute:value.minute, second:0 });
const weekday = parts => new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
const isWorkday = (parts, calendar) => calendar.workdays.includes(weekday(parts)) && !calendar.holidays.includes(dateKey(parts));

/** Builds an instant from a Pacific wall-clock value without relying on host TZ. */
const zonedInstant = (parts, timeZone) => {
  const target = localMillis(parts);
  let epoch = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const adjustment = target - localMillis(localParts(new Date(epoch), timeZone));
    if (!adjustment) break;
    epoch += adjustment;
  }
  return new Date(epoch);
};

/** Adds working time in HFN Pacific business hours, independent of the host TZ. */
export function addBusinessHours(start, hours, calendar = defaultCalendar) {
  const effective = { ...defaultCalendar, ...calendar, businessStart:{ ...defaultCalendar.businessStart, ...calendar.businessStart }, businessEnd:{ ...defaultCalendar.businessEnd, ...calendar.businessEnd } };
  const timeZone = effective.timeZone;
  let cursor = localParts(new Date(start), timeZone);
  let remainingMinutes = Math.round(hours * 60);
  const opening = minutes(effective.businessStart), closing = minutes(effective.businessEnd);
  while (remainingMinutes > 0) {
    if (!isWorkday(cursor, effective)) { cursor = atBusinessTime(nextDate(cursor), effective.businessStart); continue; }
    const current = cursor.hour * 60 + cursor.minute;
    if (current < opening) { cursor = atBusinessTime(cursor, effective.businessStart); continue; }
    if (current >= closing) { cursor = atBusinessTime(nextDate(cursor), effective.businessStart); continue; }
    const used = Math.min(remainingMinutes, closing - current);
    cursor = localParts(new Date(zonedInstant(cursor, timeZone).getTime() + used * 60000), timeZone);
    remainingMinutes -= used;
  }
  return zonedInstant(cursor, timeZone);
}

export function dueAt(start, rule, calendar = activeCalendar) {
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

import roadmap from './roadmap.json';

export type Task = { id: string; text: string; done: boolean };
export type Checkpoint = {
  id: string; phase: string; type: string; title: string; start: string; end: string;
  url: string; tasks: Task[]; description: string; notes: string; createdAt: string;
};
export type RoadmapState = { items: Checkpoint[]; settings: { reminders: boolean } };
export const phases = roadmap.phases;
export const starter = roadmap.starter as Checkpoint[];
export const freshState = (): RoadmapState => ({ items: JSON.parse(JSON.stringify(starter)), settings: { reminders: false } });
export const todayISO = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
export const dateFromISO = (s: string) => new Date(`${s}T12:00:00`);
export const formatDate = (s: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  s ? dateFromISO(s).toLocaleDateString('en-US', options) : 'No date';
export const completed = (x: Checkpoint) => x.tasks.length > 0 && x.tasks.every(t => t.done);
export const progress = (x: Checkpoint) => x.tasks.length ? x.tasks.filter(t => t.done).length / x.tasks.length : 0;
export const status = (x: Checkpoint) => completed(x) ? 'done' : x.end && x.end < todayISO() ? 'overdue' : x.start && x.start <= todayISO() ? 'in-progress' : 'upcoming';
export const stats = (items: Checkpoint[]) => {
  const done = items.filter(completed).length;
  return {
    done, total: items.length, percent: items.length ? Math.round(done / items.length * 100) : 0,
    active: items.filter(x => status(x) === 'in-progress').length,
    overdue: items.filter(x => status(x) === 'overdue').length,
    projects: items.filter(x => x.type === 'project').length,
    tasksDone: items.reduce((n, x) => n + x.tasks.filter(t => t.done).length, 0),
  };
};
export const safeUrl = (s: string) => /^https?:\/\/[^\s]+$/i.test(s.trim()) ? s.trim() : '';
export function validBackup(value: unknown): value is RoadmapState {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.items) && data.items.every((x: unknown) => {
    if (!x || typeof x !== 'object') return false;
    const item = x as Record<string, unknown>;
    return typeof item.id === 'string' && typeof item.title === 'string' &&
      typeof item.phase === 'string' && typeof item.type === 'string' &&
      Array.isArray(item.tasks) && item.tasks.every((t: unknown) => !!t && typeof t === 'object' &&
        typeof (t as Task).id === 'string' && typeof (t as Task).text === 'string' && typeof (t as Task).done === 'boolean');
  });
}
const icsEscape = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
export function calendarICS(items: Checkpoint[]) {
  const events = items.filter(x => x.end).flatMap(x => {
    const next = dateFromISO(x.end); next.setDate(next.getDate() + 1);
    const end = [next.getFullYear(), String(next.getMonth() + 1).padStart(2, '0'), String(next.getDate()).padStart(2, '0')].join('');
    return ['BEGIN:VEVENT', `UID:${icsEscape(x.id)}@altitude-roadmap`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART;VALUE=DATE:${x.end.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape('Deadline: ' + x.title)}`,
      `DESCRIPTION:${icsEscape(x.tasks.map(t => (t.done ? '✓ ' : '○ ') + t.text).join('\n') + (x.notes ? '\nNotes: ' + x.notes : ''))}`,
      ...(safeUrl(x.url) ? [`URL:${safeUrl(x.url)}`] : []), 'END:VEVENT'];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Altitude//Roadmap//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
}

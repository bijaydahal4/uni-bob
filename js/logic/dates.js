// Date helpers: friendly formatting, programme status and "You are here" on the timeline.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD" as a local date (no time-zone surprises). */
export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function todayISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

export function formatDate(s, { short = false, year = true } = {}) {
  const d = typeof s === 'string' ? parseISO(s) : s;
  if (!d) return '';
  const month = short ? MONTHS[d.getMonth()].slice(0, 3) : MONTHS[d.getMonth()];
  return `${d.getDate()} ${month}${year ? ` ${d.getFullYear()}` : ''}`;
}

export function formatMonth(s) {
  const d = typeof s === 'string' ? parseISO(s) : s;
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

export function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 31;
}

export const STATUS_LABELS = {
  notYet: 'Not open yet', open: 'Open', closingSoon: 'Closing soon', closed: 'Closed', unknown: 'Dates not announced',
};

/**
 * Status of a summer school or programme from today's date.
 * cycleYear = the summer she can attend (2027 while she's in Year 12).
 */
export function programmeStatus(p, today = new Date(), cycleYear = 2027) {
  const t = startOfDay(today);
  const opens = parseISO(p?.opens?.date);
  const deadline = parseISO(p?.deadline?.date);
  const expected = [p?.opens?.status, p?.deadline?.status].includes('Expected');
  const old = typeof p?.infoYear === 'number' && p.infoYear < cycleYear;
  if (old) {
    // Only last year's details: this year's round hasn't been announced.
    return { key: 'notYet', label: STATUS_LABELS.notYet, expected: true, old: true, daysLeft: null };
  }
  if (deadline && t > deadline) return { key: 'closed', label: STATUS_LABELS.closed, expected, daysLeft: null };
  if (opens && t < opens) return { key: 'notYet', label: STATUS_LABELS.notYet, expected, daysLeft: null, opensIn: daysBetween(t, opens) };
  if (deadline) {
    const left = daysBetween(t, deadline);
    if (opens || p?.opens?.isOpen) {
      if (left <= 14) return { key: 'closingSoon', label: STATUS_LABELS.closingSoon, expected, daysLeft: left };
      return { key: 'open', label: STATUS_LABELS.open, expected, daysLeft: left };
    }
    return { key: 'unknown', label: 'Check opening date', expected, daysLeft: left };
  }
  if (opens) return { key: 'open', label: STATUS_LABELS.open, expected, daysLeft: null };
  return { key: 'unknown', label: STATUS_LABELS.unknown, expected, daysLeft: null };
}

/** Sort key for "by deadline": soonest upcoming first, closed and undated last. */
export function deadlineSortKey(p, today = new Date()) {
  const st = programmeStatus(p, today);
  const d = parseISO(p?.deadline?.date);
  const rank = { closingSoon: 0, open: 1, notYet: 2, unknown: 3, closed: 4 }[st.key];
  return [rank, d ? d.getTime() : Number.MAX_SAFE_INTEGER];
}

/** Index of the first timeline step that hasn't started yet (where "You are here" goes before). */
export function youAreHereIndex(steps, today = new Date()) {
  const t = startOfDay(today);
  for (let i = 0; i < steps.length; i++) {
    const d = parseISO(steps[i].date) || parseISO(steps[i].sortDate);
    if (d && d > t) return i;
  }
  return steps.length;
}

/** Is the data older than `months` months? */
export function isStale(checkedISO, today = new Date(), months = 4) {
  const d = parseISO(checkedISO);
  if (!d) return false;
  return monthsBetween(d, startOfDay(today)) > months;
}

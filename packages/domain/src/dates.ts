// Date and time-reference rules. Workshop timezone configurable, storage UTC.
// Oracle fixes from evidence/INITIAL_MODEL_SMOKE_TEST_RESULTS.md (FAILs preserved there).

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export type WeekdayResult = { ok: true; date: string } | { ok: false; reason: string };

export function dateInTz(instantIso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instantIso));
  return parts; // YYYY-MM-DD
}

function weekdayInTz(dateStr: string, tz: string): number {
  // Noon UTC avoids edge shifts for all real timezones.
  const d = new Date(`${dateStr}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d);
  return DAYS.indexOf(name.toLowerCase());
}

export function resolveWeekday(text: string, refInstantIso: string, tz: string): WeekdayResult {
  const t = text.trim().toLowerCase();
  if (/^next\s+/.test(t)) return { ok: false, reason: 'ambiguous: next-weekday needs an explicit date' };
  const idx = DAYS.indexOf(t);
  if (idx === -1) return { ok: false, reason: `unknown weekday: ${text}` };
  let date = dateInTz(refInstantIso, tz);
  for (let i = 0; i < 8; i++) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);
    if (weekdayInTz(date, tz) === idx) return { ok: true, date };
  }
  return { ok: false, reason: 'no matching weekday found' };
}

// Workshop policy: morning is 00:00-11:59. 11 AM is morning, never a conflict with "morning".
export function isMorning(hhmm: string): boolean {
  const h = Number(hhmm.split(':')[0]);
  return h < 12;
}

export interface TimeReference {
  event: 'pickup' | 'service-start' | 'unknown';
  time?: string;
  candidates?: string[];
}

const AMBIGUOUS_EVENTS = ['pickup-arrival', 'service-start', 'service-completion'];

export function splitTimeReference(text: string): TimeReference {
  const t = text.toLowerCase();
  const m = t.match(/(\d{1,2}):(\d{2})/);
  const hhmm = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
  if (t.includes('pickup')) return { event: 'pickup', time: hhmm };
  if (t.includes('service')) return { event: 'service-start', time: hhmm };
  return { event: 'unknown', candidates: AMBIGUOUS_EVENTS };
}

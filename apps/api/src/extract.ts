// Rule-based extractor v1. Deterministic; Meta model wiring lands in M2.
// Output is a proposed patch, never a booking decision.
import { dateInTz, resolveWeekday } from '../../../packages/domain/src/dates.js';

const OUT_OF_DOMAIN = /\b(taxi|airport|flight|rideshare|ride-share|passenger|luggage)\b/;
const CAR_SERVICE = /\b(service|repair|maintenance|servicing|workshop|brake|oil|tyre|tire|warranty|pickup|booking|slot)\b/;

export interface ExtractedPatch {
  additions: { field: string; value: unknown; scope: 'booking' | 'session' | 'contact' }[];
  supersessions: string[];
  revocations: string[];
  unresolvedFields: string[];
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function extractTurn(text: string, nowIso: string, tz: string): ExtractedPatch {
  const t = text.toLowerCase().trim();
  const patch: ExtractedPatch = { additions: [], supersessions: [], revocations: [], unresolvedFields: [] };
  if (/^(yes|yeah|yep|ok|confirm)\.?$/.test(t)) return patch;

  // Transport/travel requests are out of domain even when they name a day.
  if (OUT_OF_DOMAIN.test(t) && !CAR_SERVICE.test(t)) {
    patch.unresolvedFields.push('domain');
    return patch;
  }

  // Price/cost questions mention topics without requesting them.
  const pricingQuestion = /\b(how much|how many|what.*cost|cost of|price of|charge|fee)\b/.test(t)
    && !/\b(book|need|want|schedule|at \d)/.test(t);

  if (/\btoday\b/.test(t)) {
    patch.additions.push({ field: 'serviceDate', value: dateInTz(nowIso, tz), scope: 'booking' });
    patch.supersessions.push('serviceDate');
  } else if (/\btomorrow\b/.test(t)) {
    const d = new Date(`${dateInTz(nowIso, tz)}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    patch.additions.push({ field: 'serviceDate', value: d.toISOString().slice(0, 10), scope: 'booking' });
    patch.supersessions.push('serviceDate');
  } else {
    for (const day of WEEKDAYS) {
      if (t.includes(day)) {
        if (new RegExp(`next\\s+${day}`).test(t)) {
          patch.unresolvedFields.push('serviceDate');
        } else {
          const r = resolveWeekday(day, nowIso, tz);
          if (r.ok) {
            patch.additions.push({ field: 'serviceDate', value: r.date, scope: 'booking' });
            patch.supersessions.push('serviceDate');
          } else {
            patch.unresolvedFields.push('serviceDate');
          }
        }
        break;
      }
    }
  }

  const window = t.match(/\b(morning|afternoon|evening)\b/);
  if (window) {
    patch.additions.push({ field: 'serviceWindow', value: window[1], scope: 'booking' });
    patch.supersessions.push('serviceWindow');
  }
  const before = t.match(/before\s+(\d{1,2})(?::(\d{2}))?/);
  if (before) {
    // Only an explicit service-start event grounds the cutoff. A bare
    // "before ten" (even with pickup mentioned) stays ambiguous per oracle.
    if (/service\s+(starts|start|begin|begins)/.test(t)) {
      patch.additions.push({ field: 'serviceStartBefore', value: before[1].padStart(2, '0'), scope: 'booking' });
      patch.supersessions.push('serviceStartBefore');
    } else {
      patch.unresolvedFields.push('timeReference');
    }
  }

  const droppingPickup = /\bno pickup\b/.test(t) || /\bcancel\b.*\bpickup\b/.test(t);
  if (t.includes('pickup') && !droppingPickup && !pricingQuestion) {
    patch.additions.push({ field: 'pickupRequired', value: true, scope: 'booking' });
    const direct = t.match(/pickup\s+(?:at\s+|to\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    let marked: RegExpMatchArray | null = null;
    if (!direct && /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/.test(t) && !/before\s+\d/.test(t)) {
      marked = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    }
    const at = direct ?? marked;
    if (at) {
      const rawHh = Number(at[1]);
      const rawMm = Number(at[2] ?? 0);
      // Out-of-range times (2:60pm, 29pm) are not stored; the server will
      // ask for a real pickup time instead of normalizing them into one.
      const valid = rawMm <= 59 && (at[3] ? rawHh >= 1 && rawHh <= 12 : rawHh <= 23);
      if (valid) {
        let hh = rawHh;
        if (at[3] === 'pm' && hh < 12) hh += 12;
        if (at[3] === 'am' && hh === 12) hh = 0;
        patch.additions.push({
          field: 'pickupTime',
          value: `${String(hh).padStart(2, '0')}:${at[2] ?? '00'}`,
          scope: 'booking',
        });
        patch.supersessions.push('pickupTime');
      }
    }
  }
  if (droppingPickup) {
    patch.revocations.push('pickupRequired', 'pickupTime');
  }
  return patch;
}

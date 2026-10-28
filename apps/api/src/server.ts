import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import Database from 'better-sqlite3';
import { applyPatch, type ConstraintState } from '../../../packages/domain/src/ledger.js';
import { dateInTz } from '../../../packages/domain/src/dates.js';
import { findSlots, type Candidate, type SlotRequest, type WorkshopConfig } from '../../../packages/domain/src/solver.js';
import { cancelBooking, confirmBooking, holdSlot, openStore } from '../../../packages/domain/src/store.js';
import { extractTurn, type ExtractedPatch } from './extract.js';
import { OFF_TOPIC_REPLY, hasBookingSignal, socialIntent, socialReply } from './converse.js';
import { liveInterpret } from './modelInterpret.js';
import { DIRECT_BASETEN_LABEL, FALLBACK_LABEL, MODAL_FALLBACK_LABEL } from './modelFallback.js';
import { evaluateOffer, seedOffers, SERVICE_PRICES } from './offers.js';
import { tick } from '../../worker/src/worker.js';

export interface ServerOptions {
  dbPath: string;
  workshopDate: string;
  workshopDates?: string[];
  workshopClosedNote?: string;
  timezone: string;
  interpretMode?: 'rules-demo' | 'live' | 'live-baseten';
  testMode?: boolean;
}

export interface ManagedServer {
  listen(port: number): Promise<number>;
  close(): void;
}

function seededWorkshop(date: string, timezone: string): WorkshopConfig {
  return {
    timezone,
    date,
    openMin: 9 * 60,
    closeMin: 17 * 60,
    serviceMins: 60,
    travelMins: 30,
    bays: [{ id: 'bay-1', freeFromMin: 9 * 60, freeToMin: 17 * 60 }],
    drivers: [{ id: 'driver-1', freeFromMin: 10 * 60, freeToMin: 17 * 60 }],
  };
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function send(res: Parameters<Parameters<Server['on']>[1]>[1], code: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(text);
}

function activeValue(state: ConstraintState, field: string): unknown {
  const recs = state.records.filter(
    (r) => r.field === field && (r.status === 'proposed' || r.status === 'confirmed'),
  );
  return recs.length ? recs[recs.length - 1].value : undefined;
}

// A date reference in the current message. Month names need a trailing word
// boundary so "may" inside "maybe" is not a date mention.
export function hasDateReference(text: string): boolean {
  return /\b(?:next|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?\b|feb(?:ruary)?\b|mar(?:ch)?\b|apr(?:il)?\b|may\b|jun(?:e)?\b|jul(?:y)?\b|aug(?:ust)?\b|sep(?:t(?:ember)?)?\b|oct(?:ober)?\b|nov(?:ember)?\b|dec(?:ember)?\b|\d{1,2}(?:st|nd|rd|th)\b|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})/i.test(
    text,
  );
}

// Judge unresolved fields against the ledger, not only against this one
// message: a fragmentary reply must never re-ask a field the ledger already
// confirms. But an old value never satisfies a NEW ambiguous mention in this
// message: a fresh date reference, cutoff, or "before" time must clarify.
export function unresolvedAfterLedger(patch: ExtractedPatch, state: ConstraintState, text: string): string[] {
  const date = activeValue(state, 'serviceDate') as string | undefined;
  const window = activeValue(state, 'serviceWindow') as string | undefined;
  const pickup = activeValue(state, 'pickupRequired');
  const mentionsDate = hasDateReference(text);
  const beforeMatch = text.match(/before\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let newBeforeMin: number | undefined;
  if (beforeMatch) {
    let hh = Number(beforeMatch[1]);
    if (beforeMatch[3]?.toLowerCase() === 'pm' && hh < 12) hh += 12;
    if (beforeMatch[3]?.toLowerCase() === 'am' && hh === 12) hh = 0;
    newBeforeMin = hh * 60 + Number(beforeMatch[2] ?? 0);
  }
  const clockMin = (v: unknown): number | undefined => {
    if (typeof v !== 'string') return undefined;
    const m = v.match(/^(\d{1,2})(?::(\d{2}))?/);
    return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : undefined;
  };
  const pickupMin = clockMin(activeValue(state, 'pickupTime'));
  const cutoffMin = clockMin(activeValue(state, 'serviceStartBefore'));
  return patch.unresolvedFields.filter((f) => {
    if (f === 'serviceDate') return !date || mentionsDate;
    if (f === 'serviceWindow') return !window && activeValue(state, 'serviceStartBefore') === undefined;
    if (f === 'serviceStartBefore') {
      // An active window already answers time-of-day (the solver takes its
      // constraint from the window); only a new "before" time reopens it.
      return (activeValue(state, 'serviceStartBefore') === undefined && !window) || newBeforeMin !== undefined;
    }
    if (f === 'pickupRequired') return pickup === undefined;
    if (f === 'pickupTime') return pickup === true && activeValue(state, 'pickupTime') === undefined;
    if (f === 'timeReference') {
      // Grounded only when this message's "before" time is the one already
      // confirmed; a different time is new ambiguity.
      if (newBeforeMin !== undefined) return newBeforeMin !== pickupMin && newBeforeMin !== cutoffMin;
      return pickupMin === undefined && cutoffMin === undefined;
    }
    return true;
  });
}

// Fields whose ambiguity persists across turns until explicitly resolved.
export const PENDING_FIELDS = ['serviceDate', 'serviceStartBefore', 'timeReference'] as const;

// Pending entries a patch clears by resolving the field. A field the same
// patch still lists as unresolved is never cleared by that patch. A
// serviceWindow addition also clears a pending cutoff: the solver takes
// its time constraint from the window, so the cutoff question is answered.
// A pending timeReference clears when the customer names what the time
// applies to: a pickup time, a service-start cutoff, or a window.
export function pendingToClear(patch: ExtractedPatch): string[] {
  const added = new Set(patch.additions.map((a) => a.field));
  const unresolved = new Set(patch.unresolvedFields);
  const out: string[] = [];
  for (const f of PENDING_FIELDS) {
    if (unresolved.has(f)) continue;
    if (f === 'timeReference') {
      const resolves =
        ['pickupTime', 'serviceStartBefore', 'serviceWindow'].some((x) => added.has(x)) ||
        patch.revocations.some((r) => ['pickupTime', 'serviceStartBefore', 'serviceWindow', 'pickupRequired'].includes(r));
      if (resolves) out.push(f);
    } else if (added.has(f) || patch.revocations.includes(f)) {
      out.push(f);
    }
  }
  if (added.has('serviceWindow') && !unresolved.has('serviceStartBefore') && !out.includes('serviceStartBefore')) {
    out.push('serviceStartBefore');
  }
  return out;
}

// Pending entries a turn raises: the field is still unresolved after the
// ledger check and the patch itself raised it.
export function pendingToSet(patch: ExtractedPatch, stillUnresolved: string[]): string[] {
  const cleared = new Set(pendingToClear(patch));
  return PENDING_FIELDS.filter(
    (f) => stillUnresolved.includes(f) && patch.unresolvedFields.includes(f) && !cleared.has(f),
  );
}


function clockMinutes(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const m = v.match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!m) return undefined;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  return hh <= 23 && mm <= 59 ? hh * 60 + mm : undefined;
}

// Candidate selection must honor every confirmed constraint: the window
// bounds the service start, and a confirmed pickup time is exact.
export function slotRequestFor(state: ConstraintState): SlotRequest {
  const window = activeValue(state, 'serviceWindow') as string | undefined;
  const pickupTime = activeValue(state, 'pickupTime');
  const needsPickup = activeValue(state, 'pickupRequired') === true || pickupTime !== undefined;
  // The window and an explicit service-start cutoff both bound the start;
  // the effective upper bound is the tighter of the two.
  const uppers = [window === 'morning' ? 12 * 60 : window === 'afternoon' ? 17 * 60 : undefined, clockMinutes(activeValue(state, 'serviceStartBefore'))].filter(
    (x): x is number => x !== undefined,
  );
  return {
    serviceStartBeforeMin: uppers.length > 0 ? Math.min(...uppers) : undefined,
    serviceStartAtOrAfterMin: window === 'afternoon' ? 12 * 60 : window === 'evening' ? 17 * 60 : undefined,
    pickupRequired: needsPickup,
    pickupAtMin: needsPickup ? clockMinutes(pickupTime) : undefined,
  };
}

// A patch that turns pickup off must also drop any pickup time: a live
// model can add pickupRequired=false without revoking pickupTime, and a
// stale time would still force pickup at the old hour through the solver.
export function dropsStalePickupTime(patch: ExtractedPatch): boolean {
  return (
    patch.additions.some((a) => a.field === 'pickupRequired' && a.value === false) &&
    !patch.revocations.includes('pickupTime')
  );
}

export function summarizeOpenDays(openDays: string[], closedNote: string): string {
  if (openDays.length <= 1) return openDays[0] ?? '';
  return `${openDays[0]} to ${openDays[openDays.length - 1]}${closedNote ? `, ${closedNote}` : ''}`;
}

// Next open day on or after the requested date. Undefined when the request
// is past the whole range: callers must not wrap around to openDays[0],
// an earlier date, and must offer no alternative in that case.
export function demoOfferDay(openDays: string[], date: string): string | undefined {
  return openDays.find((d) => d >= date);
}

const RESET_SCOPED_TABLES = [
  'proposals',
  'jobs',
  'inbox',
  'ledger_entries',
  'pending_ambiguities',
  'mentioned_times',
  'turns',
  'review_tasks',
  'feedback_responses',
  'offer_approvals',
];

// Clears demo state through the server's own SQLite connection, so the API
// stays the only writer (no second process ever touches the file). Runs
// only when a booking exists: bookings are the durable slot blockers.
// Conversations still negotiating keep every row; their holds just expire.
export function resetDemoState(raw: Database.Database): { reset: boolean; bookingsCleared: number } {
  const count = (raw.prepare('SELECT COUNT(*) AS c FROM bookings').get() as { c: number }).c;
  if (count === 0) return { reset: false, bookingsCleared: 0 };
  const keep = `(SELECT id FROM conversations WHERE status = 'negotiating')`;
  raw.exec('BEGIN IMMEDIATE');
  try {
    raw.exec('DELETE FROM bookings');
    raw.exec(`DELETE FROM sqlite_sequence WHERE name = 'bookings'`);
    for (const t of RESET_SCOPED_TABLES) raw.exec(`DELETE FROM ${t} WHERE convo NOT IN ${keep}`);
    raw.exec(`DELETE FROM conversations WHERE id NOT IN ${keep}`);
    // Holds referenced by surviving proposals stay; the rest go.
    raw.exec('DELETE FROM holds WHERE hold_token NOT IN (SELECT hold_token FROM proposals)');
    raw.exec('COMMIT');
  } catch (e) {
    raw.exec('ROLLBACK');
    throw e;
  }
  return { reset: true, bookingsCleared: count };
}

export function knownFacts(state: ConstraintState): string[] {
  const out: string[] = [];
  const date = activeValue(state, 'serviceDate');
  if (typeof date === 'string') out.push(`date ${date}`);
  const win = activeValue(state, 'serviceWindow');
  if (typeof win === 'string') out.push(win);
  const cutoff = activeValue(state, 'serviceStartBefore');
  if (typeof cutoff === 'string') out.push(`service start before ${cutoff}`);
  if (activeValue(state, 'pickupRequired') === true) {
    const pt = activeValue(state, 'pickupTime');
    out.push(typeof pt === 'string' ? `pickup at ${pt}` : 'pickup needed');
  }
  return out;
}

export function createServer(opts: ServerOptions): ManagedServer {
  const store = openStore(opts.dbPath);
  const raw = (store as unknown as { raw: Database.Database }).raw;
  raw.exec(`CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)`);
  try {
    raw.exec(`ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'negotiating'`);
  } catch {
    // column already present
  }
  // Latest simulated-today (YYYY-MM-DD) seen on this conversation's turns.
  // Proposals reuse it as the trusted clock so both endpoints reject past
  // dates against the same reference instead of the wall clock.
  try {
    raw.exec(`ALTER TABLE conversations ADD COLUMN reference_date TEXT`);
  } catch {
    // column already present
  }
  raw.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, convo TEXT NOT NULL, kind TEXT NOT NULL, due_at INTEGER NOT NULL,
    channel TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
    lease_until INTEGER, created_at INTEGER NOT NULL)`);
  raw.exec(`CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, convo TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)`);
  seedOffers(raw);
  raw.exec(`CREATE TABLE IF NOT EXISTS review_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, convo TEXT NOT NULL, rating INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL)`);
  raw.exec(`CREATE TABLE IF NOT EXISTS feedback_responses (
    convo TEXT PRIMARY KEY, rating INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`);
  try {
    raw.exec(`ALTER TABLE proposals ADD COLUMN final_price INTEGER`);
  } catch {
    // column already present
  }
  try {
    raw.exec(`ALTER TABLE proposals ADD COLUMN offer_code TEXT`);
  } catch {
    // column already present
  }
  raw.exec(`CREATE TABLE IF NOT EXISTS turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, convo TEXT NOT NULL, role TEXT NOT NULL,
    text TEXT NOT NULL, created_at INTEGER NOT NULL)`);
  // Ledger entries keyed by record id with upsert: status mutations (revoke,
  // supersede) reuse the same id at a new revision and must overwrite, not duplicate.
  raw.exec(`CREATE TABLE IF NOT EXISTS ledger_entries (
    record_id TEXT PRIMARY KEY, convo TEXT NOT NULL, record_json TEXT NOT NULL)`);
  // Ambiguity raised by one turn stays pending until a later turn explicitly
  // resolves it; a date-less fragment must not silently reuse the old value.
  raw.exec(`CREATE TABLE IF NOT EXISTS pending_ambiguities (
    convo TEXT NOT NULL, field TEXT NOT NULL, PRIMARY KEY (convo, field))`);
  // Scratch memory for a bare clock time a customer mentioned. Deliberately
  // not a ledger constraint: it is unassigned working memory, and the frozen
  // scorer judges active constraints exactly.
  raw.exec(`CREATE TABLE IF NOT EXISTS mentioned_times (
    convo TEXT PRIMARY KEY, time TEXT NOT NULL)`);
  raw.exec(`CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY, convo TEXT NOT NULL, candidate_json TEXT NOT NULL,
    approval_token TEXT NOT NULL, constraints_rev INTEGER NOT NULL,
    hold_token TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
    final_price INTEGER, offer_code TEXT)`);
  let workshop = seededWorkshop(opts.workshopDate, opts.timezone);
  const openDays = [...(opts.workshopDates ?? [opts.workshopDate])].sort();
  // Fail fast: an end date before the start (or a malformed date) yields no
  // open days, and every booking would be refused with a broken offer.
  if (openDays.length === 0) {
    throw new Error('No open workshop days: set WORKSHOP_DATE and WORKSHOP_END_DATE as YYYY-MM-DD, with the end on or after the start.');
  }
  // Same seeded resources every open day; per-day conflicts come from the
  // date-scoped slot IDs in bookings and holds, not from the config. Dated
  // configs derive bays and drivers from the live workshop, so a bay
  // closure applies to every open date, not just the first one.
  const workshopFor = (date: string): WorkshopConfig =>
    date === opts.workshopDate ? workshop : { ...seededWorkshop(date, opts.timezone), bays: workshop.bays, drivers: workshop.drivers };

  const slotIdOf = (c: Candidate, date: string): string => `${c.bayId}@${date}T${c.serviceStartMin}`;
  // Availability is stateful: booked slots and live holds are never proposed.
  const takenSlots = (): Set<string> => {
    const taken = new Set<string>();
    for (const r of raw.prepare('SELECT slot_id FROM bookings').all() as { slot_id: string }[]) taken.add(r.slot_id);
    for (const r of raw.prepare('SELECT slot_id FROM holds WHERE expires_at > ?').all(Date.now()) as { slot_id: string }[])
      taken.add(r.slot_id);
    return taken;
  };
  const available = (cs: Candidate[], date: string): Candidate[] => {
    const t = takenSlots();
    return cs.filter((c) => !t.has(slotIdOf(c, date)));
  };

  const loadLedger = (convo: string): ConstraintState => {
    const rows = raw.prepare('SELECT record_json FROM ledger_entries WHERE convo = ?').all(convo) as {
      record_json: string;
    }[];
    const records = rows.map((r) => JSON.parse(r.record_json));
    return { revision: records.length ? Math.max(...records.map((r) => r.revision)) : 0, records };
  };
  // Latest simulated-today persisted by this conversation's turns. Null for
  // rows predating the column: callers must treat that as unresolved, since
  // no clock has validated the ledger yet.
  const referenceDateOf = (convo: string): string | null =>
    (raw.prepare('SELECT reference_date FROM conversations WHERE id = ?').get(convo) as { reference_date: string | null } | undefined)
      ?.reference_date ?? null;
  const saveLedger = (convo: string, state: ConstraintState, prevRevision: number): void => {
    for (const r of state.records.filter((x) => x.revision > prevRevision)) {
      raw
        .prepare('INSERT OR REPLACE INTO ledger_entries (record_id, convo, record_json) VALUES (?, ?, ?)')
        .run(r.id, convo, JSON.stringify(r));
    }
  };
  const hasPending = (convo: string, field: string): boolean =>
    Boolean(raw.prepare('SELECT 1 FROM pending_ambiguities WHERE convo = ? AND field = ?').get(convo, field));
  const setPending = (convo: string, field: string): void => {
    raw.prepare('INSERT OR IGNORE INTO pending_ambiguities (convo, field) VALUES (?, ?)').run(convo, field);
  };
  const clearPending = (convo: string, field: string): void => {
    raw.prepare('DELETE FROM pending_ambiguities WHERE convo = ? AND field = ?').run(convo, field);
  };
  const pendingBlock = (convo: string): string[] => PENDING_FIELDS.filter((f) => hasPending(convo, f));
  const getMentionedTime = (convo: string): string | undefined =>
    (raw.prepare('SELECT time FROM mentioned_times WHERE convo = ?').get(convo) as { time: string } | undefined)?.time;
  const setMentionedTime = (convo: string, time: string): void => {
    raw.prepare('INSERT OR REPLACE INTO mentioned_times (convo, time) VALUES (?, ?)').run(convo, time);
  };
  const deleteMentionedTime = (convo: string): void => {
    raw.prepare('DELETE FROM mentioned_times WHERE convo = ?').run(convo);
  };

  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (req.method === 'POST' && url.pathname === '/api/turns') {
        const body = (await readBody(req)) as { conversationId: string; text: string; nowIso: string };
        raw.prepare('INSERT OR IGNORE INTO conversations (id, created_at) VALUES (?, ?)').run(body.conversationId, Date.now());
        raw.prepare('UPDATE conversations SET reference_date = ? WHERE id = ?').run(dateInTz(body.nowIso, opts.timezone), body.conversationId);
        raw.prepare('INSERT INTO turns (convo, role, text, created_at) VALUES (?, ?, ?, ?)').run(body.conversationId, 'user', body.text, Date.now());

        const isYes = /^(yes|yeah|yep|yup|sure|ok|confirm)\.?$/i.test(body.text.trim());
        if (isYes) {
          const pendingYes = pendingBlock(body.conversationId);
          if (pendingYes.length > 0) {
            const labels: Record<string, string> = {
              serviceDate: 'which date',
              serviceStartBefore: 'what time of day',
              timeReference: 'what "before ten" applies to (pickup, arrival, or service start)',
            };
            send(res, 200, {
              ledgerRev: loadLedger(body.conversationId).revision,
              question: `Before I check availability I need: ${pendingYes.map((f) => labels[f] ?? f).join('; ')}.`,
              unresolvedFields: pendingYes,
            });
            return;
          }
          const live = raw
            .prepare("SELECT * FROM proposals WHERE convo = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
            .get(body.conversationId) as { id: string; approval_token: string } | undefined;
          if (live) {
            // Same guard as POST /api/confirm: a constraint change after the
            // proposal invalidates its terms, so a bare "yes" must not book it.
            if (loadLedger(body.conversationId).revision !== (live as unknown as { constraints_rev: number }).constraints_rev) {
              send(res, 409, { ok: false, error: 'constraints-changed' });
              return;
            }
            // Same date revalidation as POST /api/confirm: this very turn
            // may have advanced the simulated clock past the proposal date.
            const yesDateNow = activeValue(loadLedger(body.conversationId), 'serviceDate');
            const yesRef = referenceDateOf(body.conversationId);
            if (typeof yesDateNow === 'string' && (typeof yesRef !== 'string' || yesDateNow < yesRef)) {
              send(res, 409, { ok: false, error: 'clarification-required', unresolvedFields: ['serviceDate'] });
              return;
            }
            const result = confirmBooking(store, {
              holdToken: (live as unknown as { hold_token: string }).hold_token,
              approvalToken: live.approval_token,
              idempotencyKey: `yes-${live.id}`,
              cancelToken: randomBytes(16).toString('hex'),
              constraintsRev: (live as unknown as { constraints_rev: number }).constraints_rev,
            });
            if (result.ok) {
              raw.prepare("UPDATE proposals SET status = 'confirmed' WHERE id = ?").run(live.id);
              send(res, 200, { ok: true, booking: { bookingId: result.bookingId }, ledgerRev: loadLedger(body.conversationId).revision });
              return;
            }
          }
          // No proposal to approve. If a single yes/no question is
          // outstanding (pickup choice, or the demo-day offer), this bare
          // affirmative answers it instead: fall through to the normal
          // flow, which maps it deterministically.
          const stateYes = loadLedger(body.conversationId);
          const pickupOutstanding =
            activeValue(stateYes, 'pickupRequired') === undefined &&
            activeValue(stateYes, 'serviceDate') !== undefined &&
            (activeValue(stateYes, 'serviceWindow') !== undefined || activeValue(stateYes, 'serviceStartBefore') !== undefined);
          const yesDate = activeValue(stateYes, 'serviceDate');
          const demoDayOutstanding =
            !pickupOutstanding &&
            typeof yesDate === 'string' &&
            !openDays.includes(yesDate) &&
            demoOfferDay(openDays, yesDate) !== undefined &&
            activeValue(stateYes, 'pickupRequired') !== undefined &&
            (activeValue(stateYes, 'pickupRequired') === false || activeValue(stateYes, 'pickupTime') !== undefined);
          if (!pickupOutstanding && !demoDayOutstanding) {
            send(res, 200, { ledgerRev: stateYes.revision, question: 'There is no open proposal to approve. Tell me a day and whether you need pickup.' });
            return;
          }
        }

        // Win-back blocker replies: price -> deterministic quote, service
        // complaint -> persisted feedback + staff review. Booking-shaped
        // texts stay on the normal interpretation path.
        const lowerText = body.text.toLowerCase();
        const bookingShaped = /\bbook\b|pickup at|\bmorning\b/.test(lowerText);
        const cancelWinbacks = () =>
          raw
            .prepare(`UPDATE jobs SET status = 'cancelled' WHERE convo = ? AND kind LIKE 'winback%' AND status = 'scheduled'`)
            .run(body.conversationId);
        if (!bookingShaped && /(bad service|poor service|terrible|rude|worst|not happy|unhappy|complaint|disappointed)/.test(lowerText)) {
          raw
            .prepare('INSERT OR REPLACE INTO feedback_responses (convo, rating, text, created_at) VALUES (?, ?, ?, ?)')
            .run(body.conversationId, 2, body.text, Date.now());
          raw
            .prepare('INSERT INTO review_tasks (convo, rating, text, status, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(body.conversationId, 2, body.text, 'open', Date.now());
          cancelWinbacks();
          send(res, 200, {
            ledgerRev: loadLedger(body.conversationId).revision,
            interpreter: 'rules-demo',
            routingReason: 'winback blocker: service complaint',
            question:
              'Sorry our service fell short. I have opened a staff review — no automatic refund, staff decide next steps. What specifically can we improve? (simulated workshop)',
          });
          return;
        }
        if (!bookingShaped && /(price|expensive|costly|discount|cheaper)/.test(lowerText)) {
          cancelWinbacks();
          const wbQuote = evaluateOffer(raw, body.conversationId, 'WINBACK10', 'basic');
          const win = wbQuote.eligible
            ? { code: 'WINBACK10', q: wbQuote }
            : { code: 'WELCOME10', q: evaluateOffer(raw, body.conversationId, 'WELCOME10', 'basic') };
          send(res, 200, {
            ledgerRev: loadLedger(body.conversationId).revision,
            interpreter: 'rules-demo',
            routingReason: 'winback blocker: price objection',
            question: win.q.eligible
              ? `Fair point on price. ${win.code} applies (${win.q.reasons.join('; ')}): final price £${win.q.finalPriceGbp} for basic service. Hold a slot and approve to lock that exact price. (simulated workshop)`
              : `On price: no discount is currently eligible (${win.q.reasons.join('; ')}). Staff can review. (simulated workshop)`,
          });
          return;
        }

        // Social turns (greeting, thanks, help, farewell) get a natural
        // reply and never touch booking state. Live modes phrase it with
        // muse-spark-1.3-contributor behind a no-claims check; rules-demo
        // uses the canned text. Booking-shaped messages never land here.
        const social = socialIntent(body.text);
        if (social) {
          const ledger0 = loadLedger(body.conversationId);
          const useModel = opts.interpretMode === 'live' || opts.interpretMode === 'live-baseten';
          const s = await socialReply(social, knownFacts(ledger0), useModel, opts.interpretMode === 'live-baseten' ? 'baseten' : 'meta');
          const socialInterpreter = !s.modelUsed
            ? useModel ? 'canned-social' : 'rules-demo'
            : s.provider === 'modal'
              ? MODAL_FALLBACK_LABEL
              : s.provider === 'baseten'
                ? FALLBACK_LABEL
                : s.provider === 'baseten-direct'
                  ? DIRECT_BASETEN_LABEL
                  : 'muse-spark-1.3-contributor';
          send(res, 200, {
            ledgerRev: ledger0.revision,
            interpreter: socialInterpreter,
            routingReason:
              `social turn (${social}); no booking state changed` +
              (s.modelUsed && s.provider === 'baseten' ? '; Meta quota/auth failure, variant chosen on Baseten' : '') +
              (s.modelUsed && s.provider === 'modal' ? '; Meta and Baseten quota failures, variant chosen on Modal' : '') +
              (s.modelUsed && s.provider === 'baseten-direct' ? '; explicit live-baseten mode, direct Baseten variant choice' : '') +
              (useModel && !s.modelUsed ? '; contributor output unavailable or rejected, canned reply' : ''),
            question: s.text,
          });
          return;
        }

        const before = loadLedger(body.conversationId);
        let patch: ExtractedPatch;
        let interpreter = 'rules-demo';
        let routingReason = 'explicit demo/test mode: rule-based extraction, no model call';
        if (opts.interpretMode === 'live' || opts.interpretMode === 'live-baseten') {
          const live = await liveInterpret(body.text, body.nowIso, opts.timezone, opts.interpretMode === 'live-baseten' ? 'baseten' : 'meta');
          patch = live.patch;
          interpreter = live.interpreter;
          routingReason = live.routingReason;
          if (live.modelError) {
            send(res, 200, {
              ledgerRev: before.revision,
              interpreter,
              routingReason,
              question: `I could not interpret that message (${live.modelError}). Please rephrase with a day and whether you need pickup. Nothing was booked.`,
            });
            return;
          }
        } else {
          patch = extractTurn(body.text, body.nowIso, opts.timezone);
        }
        let next = applyPatch(before, {
          turnId: `t${Date.now()}`,
          excerpt: body.text.slice(0, 200),
          additions: patch.additions,
          supersessions: patch.supersessions,
          revocations: patch.revocations,
        });
        // Cross-turn repair: a bare time ("at 10") answers a pending pickup time.
        const bareTime = body.text.trim().match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
        if (
          bareTime &&
          activeValue(next, 'pickupRequired') === true &&
          activeValue(next, 'pickupTime') === undefined
        ) {
          let hh = Number(bareTime[1]);
          if (bareTime[3] === 'pm' && hh < 12) hh += 12;
          if (bareTime[3] === 'am' && hh === 12) hh = 0;
          next = applyPatch(next, {
            turnId: `t${Date.now()}-repair`,
            excerpt: body.text.slice(0, 200),
            additions: [
              {
                field: 'pickupTime',
                value: `${String(hh).padStart(2, '0')}:${bareTime[2] ?? '00'}`,
                scope: 'booking',
              },
            ],
            supersessions: ['pickupTime'],
          });
        }
        if (dropsStalePickupTime(patch)) {
          next = applyPatch(next, {
            turnId: `t${Date.now()}-revoke`,
            excerpt: body.text.slice(0, 200),
            additions: [],
            revocations: ['pickupTime'],
          });
        }
        // A short affirmative or negative answers the one outstanding
        // yes/no question. Interpretation is stateless, so neither the
        // rules nor the model can know "yup" means pickup here; the
        // server maps it, but only when pickup choice is the single
        // missing fact and no ambiguity is pending.
        const affirm = /^(yes+|yeah|yep|yup|sure|ok+|okay)([.! ]+(i said|please|thanks))?[.! ]*$/i.test(body.text.trim());
        const deny = /^(no thanks|not needed|no need|no+|nope|nah)[.! ]*$/i.test(body.text.trim());
        // Exactly one question is answered per turn: pickup choice first;
        // the demo-day offer only once pickup facts are complete, which is
        // when that offer is actually presented.
        const pickupOutstandingNow =
          activeValue(next, 'pickupRequired') === undefined &&
          !patch.revocations.includes('pickupRequired') &&
          activeValue(next, 'serviceDate') !== undefined &&
          (activeValue(next, 'serviceWindow') !== undefined || activeValue(next, 'serviceStartBefore') !== undefined) &&
          pendingBlock(body.conversationId).length === 0;
        const dateNow = activeValue(next, 'serviceDate');
        const demoDayOutstandingNow =
          !pickupOutstandingNow &&
          typeof dateNow === 'string' &&
          !openDays.includes(dateNow) &&
          demoOfferDay(openDays, dateNow) !== undefined &&
          activeValue(next, 'pickupRequired') !== undefined &&
          (activeValue(next, 'pickupRequired') === false || activeValue(next, 'pickupTime') !== undefined) &&
          pendingBlock(body.conversationId).length === 0;
        if ((affirm || deny) && pickupOutstandingNow) {
          next = applyPatch(next, {
            turnId: `t${Date.now()}-answer`,
            excerpt: body.text.slice(0, 200),
            additions: [{ field: 'pickupRequired', value: affirm, scope: 'booking' }],
            supersessions: ['pickupRequired'],
            revocations: affirm ? [] : ['pickupTime'],
          });
        } else if (affirm && demoDayOutstandingNow) {
          next = applyPatch(next, {
            turnId: `t${Date.now()}-answer`,
            excerpt: body.text.slice(0, 200),
            additions: [{ field: 'serviceDate', value: demoOfferDay(openDays, dateNow as string)!, scope: 'booking' }],
            supersessions: ['serviceDate'],
          });
        } else if (deny && demoDayOutstandingNow) {
          const range = summarizeOpenDays(openDays, opts.workshopClosedNote ?? '');
          const instead = openDays.length === 1 ? 'that day' : demoOfferDay(openDays, dateNow as string)!;
          send(res, 200, {
            ledgerRev: next.revision,
            interpreter,
            routingReason,
            question: `Understood. This demo workshop only runs ${range}, so I cannot check that day. Say the word if ${instead} works instead.`,
          });
          return;
        }
        // Remember a bare clock time ("2pm ok", "14:00") even when this
        // turn cannot assign it yet, then derive from it on every turn:
        // the service window from its hour, and the pickup time once
        // pickup is confirmed. A later "same time" needs no special case,
        // because the remembered time is already there to derive from.
        // Cutoff phrases are stripped before scanning: a time inside
        // "before 10am" is an ambiguous reference, never a remembered
        // time, and no derivation runs while that reference is unresolved
        // or while this turn revoked a time field.
        const scanText = body.text.replace(/before\s+\d{1,2}(?::\d{2})?\s*(am|pm)?/gi, ' ');
        const revokedTimeField = patch.revocations.some((f) =>
          ['pickupTime', 'pickupRequired', 'serviceWindow', 'serviceStartBefore'].includes(f),
        );
        if (revokedTimeField) deleteMentionedTime(body.conversationId);
        const ampm = scanText.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
        const h24 = ampm ? null : scanText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
        let scanned: string | undefined;
        if (ampm) {
          const rawHh = Number(ampm[1]);
          const rawMm = Number(ampm[2] ?? 0);
          if (rawHh >= 1 && rawHh <= 12 && rawMm <= 59) {
            let hh = rawHh;
            if (ampm[3].toLowerCase() === 'pm' && hh < 12) hh += 12;
            if (ampm[3].toLowerCase() === 'am' && hh === 12) hh = 0;
            scanned = `${String(hh).padStart(2, '0')}:${ampm[2] ?? '00'}`;
          }
        } else if (h24) {
          scanned = `${h24[1].padStart(2, '0')}:${h24[2]}`;
        } else if (bareTime && (bareTime[3] || bareTime[2])) {
          let hh = Number(bareTime[1]);
          if (bareTime[3] === 'pm' && hh < 12) hh += 12;
          if (bareTime[3] === 'am' && hh === 12) hh = 0;
          scanned = `${String(hh).padStart(2, '0')}:${bareTime[2] ?? '00'}`;
        }
        if (scanned && getMentionedTime(body.conversationId) !== scanned) {
          setMentionedTime(body.conversationId, scanned);
        }
        const mentioned = patch.unresolvedFields.includes('timeReference') || revokedTimeField
          ? undefined
          : getMentionedTime(body.conversationId);
        if (typeof mentioned === 'string') {
          const adds: { field: string; value: unknown; scope: 'booking' }[] = [];
          if (activeValue(next, 'pickupRequired') === true && activeValue(next, 'pickupTime') === undefined) {
            adds.push({ field: 'pickupTime', value: mentioned, scope: 'booking' });
          }
          if (activeValue(next, 'serviceWindow') === undefined && activeValue(next, 'serviceStartBefore') === undefined) {
            const hh = Number(mentioned.slice(0, 2));
            adds.push({ field: 'serviceWindow', value: hh < 12 ? 'morning' : hh < 17 ? 'afternoon' : 'evening', scope: 'booking' });
          }
          if (adds.length > 0) {
            next = applyPatch(next, {
              turnId: `t${Date.now()}-derive`,
              excerpt: body.text.slice(0, 200),
              additions: adds,
              supersessions: adds.map((a) => a.field),
            });
          }
        }
        saveLedger(body.conversationId, next, before.revision);

        // Fresh conversation, nothing booking-shaped extracted: off-topic.
        // One-line redirect, no entertainment, no state change. Mid-booking
        // fragments never land here because the ledger already has records.
        // A message with no booking signal at all is off-topic even if the
        // model invented unresolved fields for it; the server decides that.
        if (
          before.records.length === 0 &&
          patch.additions.length === 0 &&
          patch.revocations.length === 0 &&
          !patch.unresolvedFields.includes('domain') &&
          !hasBookingSignal(body.text)
        ) {
          send(res, 200, {
            ledgerRev: next.revision,
            interpreter,
            routingReason: 'off-topic message, redirected to booking',
            question: OFF_TOPIC_REPLY,
          });
          return;
        }
        // Pending ambiguity survives later turns until a turn explicitly
        // resolves the field (see pendingToClear). A pending cutoff is only
        // raised when an older cutoff is active to be silently reused.
        for (const f of pendingToClear(patch)) clearPending(body.conversationId, f);

        const date = activeValue(next, 'serviceDate') as string | undefined;
        const window = activeValue(next, 'serviceWindow') as string | undefined;
        const pickup = activeValue(next, 'pickupRequired');
        const missing: string[] = [];
        if (!date) missing.push('which date');
        if (!window && activeValue(next, 'serviceStartBefore') === undefined) missing.push('what time of day');
        if (pickup === undefined) missing.push('whether you need pickup');
        if (pickup === true && activeValue(next, 'pickupTime') === undefined) missing.push('what pickup time');

        const stillUnresolved = unresolvedAfterLedger(patch, next, body.text);
        for (const f of pendingToSet(patch, stillUnresolved)) {
          if (f === 'serviceStartBefore' && activeValue(next, 'serviceStartBefore') === undefined) continue;
          setPending(body.conversationId, f);
        }
        for (const f of pendingBlock(body.conversationId)) {
          if (!stillUnresolved.includes(f)) stillUnresolved.push(f);
        }
        if (missing.length > 0 || stillUnresolved.length > 0) {
          const human: Record<string, string> = {
            timeReference: 'what "before ten" applies to (pickup, arrival, or service start)',
            serviceDate: 'which date',
            serviceWindow: 'what time of day',
            serviceStartBefore: 'what time of day',
            pickupRequired: 'whether you need pickup',
            pickupTime: 'what pickup time',
            domain: 'a car-service request (I cannot book travel or taxis)',
          };
          const bits = [...new Set([...missing, ...stillUnresolved.map((f) => human[f] ?? `clarify ${f}`)])];
          send(res, 200, {
            ledgerRev: next.revision,
            interpreter,
            routingReason,
            question: `Before I check availability I need: ${bits.join('; ')}.`,
            unresolvedFields: stillUnresolved,
          });
          return;
        }
        // A past date can reach the ledger through the live interpreter; the
        // rules extractor only ever resolves forward. Reject against the
        // simulated clock, never the wall clock, and ask for a new date.
        const today = dateInTz(body.nowIso, opts.timezone);
        if (date! < today) {
          send(res, 200, {
            ledgerRev: next.revision,
            interpreter,
            routingReason,
            question: `${date} is in the past (today is ${today}). Which date works for your service?`,
          });
          return;
        }
        if (!openDays.includes(date!)) {
          const range = summarizeOpenDays(openDays, opts.workshopClosedNote ?? '');
          const offered = openDays.length === 1 ? 'that day' : demoOfferDay(openDays, date!);
          send(res, 200, {
            ledgerRev: next.revision,
            interpreter,
            routingReason,
            question:
              offered === undefined
                ? `This demo workshop only runs ${range}, so I cannot check that day.`
                : `This demo workshop only runs ${range}. Want ${offered} instead?`,
          });
          return;
        }
        const out = findSlots(workshopFor(date!), slotRequestFor(next));
        const free = available(out.candidates, date!);
        send(res, 200, {
          ledgerRev: next.revision,
          interpreter,
          routingReason,
          candidates: free,
          compromises: out.compromises,
          reasons: out.reasons,
          question:
            free.length === 0
              ? `No slot fits: ${out.candidates.length === 0 ? out.reasons.join(' ') : 'the matching slot was just taken; try another day or time'}`
              : undefined,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/proposals') {
        const body = (await readBody(req)) as {
          conversationId: string;
          candidateId: string;
          offerCode?: string;
          serviceType?: string;
        };
        const pendingProp = pendingBlock(body.conversationId);
        if (pendingProp.length > 0) {
          send(res, 409, { ok: false, error: 'clarification-required', unresolvedFields: pendingProp });
          return;
        }
        const ledger = loadLedger(body.conversationId);
        // Required facts are enforced here too, not only when candidates
        // are displayed: a caller cannot guess a candidate ID and book
        // around a missing pickup time or window.
        const missingFacts: string[] = [];
        if (!activeValue(ledger, 'serviceDate')) missingFacts.push('serviceDate');
        if (!activeValue(ledger, 'serviceWindow') && !activeValue(ledger, 'serviceStartBefore')) missingFacts.push('serviceWindow');
        if (activeValue(ledger, 'pickupRequired') === undefined) missingFacts.push('pickupRequired');
        if (activeValue(ledger, 'pickupRequired') === true && !activeValue(ledger, 'pickupTime')) missingFacts.push('pickupTime');
        if (missingFacts.length > 0) {
          send(res, 409, { ok: false, error: 'clarification-required', unresolvedFields: missingFacts });
          return;
        }
        const date = activeValue(ledger, 'serviceDate') as string | undefined;
        const window = activeValue(ledger, 'serviceWindow') as string | undefined;
        const pickup = activeValue(ledger, 'pickupRequired');
        // Same simulated clock as the turns endpoint: the conversation's
        // persisted reference date, before any slot lookup or hold. A null
        // reference (pre-migration row) is equally unresolved: any turn
        // sets it, and the proposal can be retried afterwards.
        const propRef = referenceDateOf(body.conversationId);
        if (typeof date === 'string' && (typeof propRef !== 'string' || date < propRef)) {
          send(res, 409, { ok: false, error: 'clarification-required', unresolvedFields: ['serviceDate'] });
          return;
        }
        const reqForSlot = slotRequestFor(ledger);
        const out = findSlots(workshopFor(date!), reqForSlot);
        const cand = out.candidates.find((c: Candidate) => c.id === body.candidateId);
        const candHonors =
          cand !== undefined &&
          (reqForSlot.pickupAtMin === undefined || cand.pickupMin === reqForSlot.pickupAtMin) &&
          (reqForSlot.serviceStartBeforeMin === undefined || cand.serviceStartMin < reqForSlot.serviceStartBeforeMin) &&
          (reqForSlot.serviceStartAtOrAfterMin === undefined || cand.serviceStartMin >= reqForSlot.serviceStartAtOrAfterMin);
        if (!cand || !candHonors || !date || !openDays.includes(date)) {
          send(res, 409, { ok: false, error: 'stale-or-unknown-candidate' });
          return;
        }
        const serviceType = body.serviceType ?? 'basic';
        const basePrice = SERVICE_PRICES[serviceType];
        if (basePrice === undefined) {
          send(res, 400, { ok: false, error: 'unknown-service' });
          return;
        }
        let finalPrice: number | null = null;
        if (body.offerCode) {
          const quote = evaluateOffer(raw, body.conversationId, body.offerCode, serviceType);
          if (!quote.eligible) {
            send(res, 409, { ok: false, error: 'offer-ineligible', reasons: quote.reasons });
            return;
          }
          finalPrice = quote.finalPriceGbp ?? null;
        }
        // A new proposal supersedes other open ones: release their holds first
        // (same slot re-proposed must not collide with its own hold), then die.
        const olds = raw.prepare(`SELECT hold_token FROM proposals WHERE convo = ? AND status = 'open'`).all(body.conversationId) as { hold_token: string }[];
        for (const o of olds) raw.prepare(`DELETE FROM holds WHERE hold_token = ?`).run(o.hold_token);
        raw.prepare(`UPDATE proposals SET status = 'superseded' WHERE convo = ? AND status = 'open'`).run(body.conversationId);
        // Availability recheck after own holds are released: a booked or
        // foreign-held slot must never reach the hold step.
        if (takenSlots().has(slotIdOf(cand, date!))) {
          send(res, 409, { ok: false, error: 'slot-taken' });
          return;
        }
        let hold;
        try {
          hold = holdSlot(store, {
            slotId: `${cand.bayId}@${date}T${cand.serviceStartMin}`,
            serviceStartMin: cand.serviceStartMin,
            pickupMin: cand.pickupMin,
            proposalRev: ledger.revision,
            holdSecs: 300,
          });
        } catch {
          send(res, 409, { ok: false, error: 'slot-held' });
          return;
        }
        const proposalId = `prop-${randomBytes(8).toString('hex')}`;
        const approvalToken = randomBytes(16).toString('hex');
        raw
          .prepare(
            'INSERT INTO proposals (id, convo, candidate_json, approval_token, constraints_rev, hold_token, status, created_at, final_price, offer_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(proposalId, body.conversationId, JSON.stringify(cand), approvalToken, ledger.revision, hold.holdToken, 'open', Date.now(), finalPrice ?? basePrice, body.offerCode ?? null);
        const wbExisting = raw
          .prepare(`SELECT 1 FROM jobs WHERE convo = ? AND kind = 'winback' AND status IN ('scheduled', 'done') LIMIT 1`)
          .get(body.conversationId);
        if (!wbExisting) {
          raw
            .prepare(
              'INSERT INTO jobs (id, convo, kind, due_at, channel, payload_json, status, created_at, max_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              `job-${randomBytes(8).toString('hex')}`,
              body.conversationId,
              'winback',
              Date.now() + 30 * 60000,
              'browser',
              JSON.stringify({
                code: 'WINBACK10',
                text: 'Still deciding? ServiceLoop can offer WINBACK10 — 10% off, capped at £50 (staff-approved). Quote the code when you book; your approval locks the final price. (simulated workshop)',
              }),
              'scheduled',
              Date.now(),
              2,
            );
        }
        send(res, 200, {
          proposalId,
          approvalToken,
          candidate: cand,
          constraintsRev: ledger.revision,
          finalPriceGbp: finalPrice ?? basePrice,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/confirm') {
        const body = (await readBody(req)) as { proposalId: string; approvalToken: string; idempotencyKey: string };
        const prop = raw.prepare('SELECT * FROM proposals WHERE id = ?').get(body.proposalId) as
          | { approval_token: string; hold_token: string; constraints_rev: number; convo: string; status: string; final_price: number | null }
          | undefined;
        if (!prop || prop.approval_token !== body.approvalToken) {
          send(res, 403, { ok: false, error: 'bad-approval' });
          return;
        }
        // Idempotent retry: the same key returns the original booking even though
        // the proposal has since moved to confirmed.
        const prior = raw.prepare('SELECT id, cancel_token FROM bookings WHERE idempotency_key = ?').get(body.idempotencyKey) as
          | { id: number; cancel_token: string }
          | undefined;
        if (prior) {
          send(res, 200, { ok: true, bookingId: prior.id, cancelToken: prior.cancel_token, finalPriceGbp: prop.final_price });
          return;
        }
        if (prop.status !== 'open') {
          send(res, 409, { ok: false, error: 'proposal-superseded' });
          return;
        }
        const pendingConfirm = pendingBlock(prop.convo);
        if (pendingConfirm.length > 0) {
          send(res, 409, { ok: false, error: 'clarification-required', unresolvedFields: pendingConfirm });
          return;
        }
        const ledger = loadLedger(prop.convo);
        if (ledger.revision !== prop.constraints_rev) {
          send(res, 409, { ok: false, error: 'constraints-changed' });
          return;
        }
        // A later turn can advance the simulated clock without touching the
        // ledger revision (social or neutral messages). Revalidate the
        // proposal date against the current reference before booking.
        const confirmDate = activeValue(ledger, 'serviceDate');
        const confirmRef = referenceDateOf(prop.convo);
        if (typeof confirmDate === 'string' && (typeof confirmRef !== 'string' || confirmDate < confirmRef)) {
          send(res, 409, { ok: false, error: 'clarification-required', unresolvedFields: ['serviceDate'] });
          return;
        }
        const cancelToken = randomBytes(16).toString('hex');
        const result = confirmBooking(store, {
          holdToken: prop.hold_token,
          approvalToken: body.approvalToken,
          idempotencyKey: body.idempotencyKey,
          cancelToken,
          constraintsRev: prop.constraints_rev,
        });
        if (result.ok) {
          raw.prepare("UPDATE proposals SET status = 'confirmed' WHERE id = ?").run(body.proposalId);
          raw.prepare(`UPDATE conversations SET status = 'booked' WHERE id = ?`).run(prop.convo);
        }
        send(res, result.ok ? 200 : 409, result.ok ? { ...result, cancelToken, finalPriceGbp: prop.final_price } : result);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/cancel') {
        const body = (await readBody(req)) as { bookingId: number; cancelToken: string };
        if (typeof body.bookingId !== 'number' || typeof body.cancelToken !== 'string') {
          send(res, 400, { ok: false, error: 'bookingId and cancelToken required' });
          return;
        }
        const r = cancelBooking(store, body.bookingId, body.cancelToken);
        raw
          .prepare(`UPDATE jobs SET status = 'cancelled' WHERE convo = (SELECT convo FROM proposals WHERE hold_token = ? LIMIT 1) AND kind IN ('followup', 'blocker') AND status = 'scheduled'`)
          .run(r.holdToken ?? '');
        if (r.ok) {
          raw.prepare(`UPDATE proposals SET status = 'cancelled' WHERE hold_token = ?`).run(r.holdToken);
          const still = raw
            .prepare(`SELECT 1 FROM proposals WHERE convo = (SELECT convo FROM proposals WHERE hold_token = ? LIMIT 1) AND status = 'confirmed' LIMIT 1`)
            .get(r.holdToken);
          if (!still) {
            const convo = (
              raw.prepare(`SELECT convo FROM proposals WHERE hold_token = ? LIMIT 1`).get(r.holdToken) as {
                convo: string;
              }
            ).convo;
            raw.prepare(`UPDATE conversations SET status = 'negotiating' WHERE id = ?`).run(convo);
          }
        }
        send(res, r.ok ? 200 : 403, r.ok ? { ok: true } : { ok: false, error: 'not-authorized' });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/snooze') {
        const body = (await readBody(req)) as { conversationId: string; callbackAt: string; channel: string };
        if (body.channel !== 'browser') {
          send(res, 400, {
            ok: false,
            error: 'unsupported-channel',
            supported: ['browser'],
            note: 'Calls are not placed automatically. Choose browser follow-up or ask for a human handoff.',
          });
          return;
        }
        const due = Date.parse(body.callbackAt);
        if (Number.isNaN(due)) {
          send(res, 400, { ok: false, error: 'bad-callbackAt' });
          return;
        }
        if (due <= Date.now() && !opts.testMode) {
          send(res, 400, { ok: false, error: 'callbackAt must be in the future' });
          return;
        }
        raw
          .prepare('INSERT OR IGNORE INTO conversations (id, created_at) VALUES (?, ?)')
          .run(body.conversationId, Date.now());
        raw.prepare(`UPDATE conversations SET status = 'snoozed' WHERE id = ?`).run(body.conversationId);
        // A fresh snooze replaces pending follow-ups; post-service feedback survives.
        raw
          .prepare(`UPDATE jobs SET status = 'cancelled' WHERE convo = ? AND kind IN ('followup', 'blocker') AND status = 'scheduled'`)
          .run(body.conversationId);
        const jobId = `job-${randomBytes(8).toString('hex')}`;
        raw
          .prepare(
            'INSERT INTO jobs (id, convo, kind, due_at, channel, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            jobId,
            body.conversationId,
            'followup',
            due,
            'browser',
            JSON.stringify({ text: 'Reminder from ServiceLoop: you asked to be reminded. Reply to continue booking (simulated workshop).' }),
            'scheduled',
            Date.now(),
          );
        send(res, 200, { jobId, dueAt: due });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/optout') {
        const body = (await readBody(req)) as { conversationId: string };
        raw
          .prepare('INSERT OR IGNORE INTO conversations (id, created_at) VALUES (?, ?)')
          .run(body.conversationId, Date.now());
        raw.prepare(`UPDATE conversations SET status = 'opted_out' WHERE id = ?`).run(body.conversationId);
        const before = loadLedger(body.conversationId);
        const next = applyPatch(before, {
          turnId: `optout-${Date.now()}`,
          excerpt: 'customer opted out of reminders',
          revocations: ['notificationConsent'],
        });
        saveLedger(body.conversationId, next, before.revision);
        const cancelled = raw
          .prepare(`UPDATE jobs SET status = 'cancelled' WHERE convo = ? AND status = 'scheduled'`)
          .run(body.conversationId);
        send(res, 200, { ok: true, cancelledJobs: Number(cancelled.changes) });
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/conversation/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/conversation/'.length));
        const row = raw.prepare(`SELECT status FROM conversations WHERE id = ?`).get(id) as
          | { status: string }
          | undefined;
        const ledger = loadLedger(id);
        const active: Record<string, unknown> = {};
        for (const r of ledger.records) {
          if (r.status === 'proposed' || r.status === 'confirmed') active[r.field] = r.value;
        }
        send(res, 200, { status: row?.status ?? 'negotiating', ledgerRev: ledger.revision, active });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/inbox') {
        const convo = url.searchParams.get('conversationId') ?? '';
        const rows = raw
          .prepare(`SELECT text, created_at FROM inbox WHERE convo = ? ORDER BY id`)
          .all(convo) as { text: string; created_at: number }[];
        send(res, 200, { messages: rows });
        return;
      }

      // Hourly demo reset, invoked by the Modal function (or the VM timer)
      // through this process's own connection so the API stays the only
      // SQLite writer. Enabled only when SL_RESET_KEY is configured; the
      // caller proves knowledge of the same value. Anything else is a 404.
      if (req.method === 'POST' && url.pathname === '/api/admin/reset-demo') {
        const configured = Buffer.from(process.env.SL_RESET_KEY ?? '');
        const givenHeader = req.headers['x-reset-key'];
        // Compare byte lengths, never string lengths: header values can
        // carry multibyte characters, and a string-length match with a
        // byte-length mismatch would make timingSafeEqual throw, leaking
        // the key length through a 404/500 difference.
        const given = Buffer.from(typeof givenHeader === 'string' ? givenHeader : '');
        const authorized = configured.length > 0 && given.length === configured.length && timingSafeEqual(given, configured);
        if (!authorized) {
          send(res, 404, { ok: false, error: 'not-found' });
          return;
        }
        send(res, 200, resetDemoState(raw));
        return;
      }

      if (opts.testMode && req.method === 'POST' && url.pathname === '/api/workshop/close-bay') {
        workshop = { ...workshop, bays: [] };
        send(res, 200, { ok: true });
        return;
      }

      if (opts.testMode && req.method === 'GET' && url.pathname === '/api/jobs') {
        const convo = url.searchParams.get('conversationId') ?? '';
        const rows = raw.prepare(`SELECT id, status FROM jobs WHERE convo = ? ORDER BY id`).all(convo);
        send(res, 200, { jobs: rows });
        return;
      }

      if (opts.testMode && req.method === 'POST' && url.pathname === '/api/jobs/tick') {
        const body = (await readBody(req)) as { nowMs?: number; tz?: string };
        const out = tick(raw, (job) => {
          const payload = JSON.parse(job.payload_json) as { text: string };
          raw
            .prepare('INSERT INTO inbox (convo, text, created_at) VALUES (?, ?, ?)')
            .run(job.convo, payload.text, Date.now());
        }, body.nowMs ?? Date.now(), body.tz ?? opts.timezone);
        send(res, 200, out);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/offers/quote') {
        const body = (await readBody(req)) as { conversationId: string; offerCode: string; serviceType: string };
        send(res, 200, evaluateOffer(raw, body.conversationId, body.offerCode, body.serviceType));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/offers/approve') {
        const body = (await readBody(req)) as { conversationId: string; offerCode: string; staffKey: string };
        const expected = opts.testMode ? 'staff-demo' : (process.env.WORKSHOP_STAFF_KEY ?? '');
        if (!expected || body.staffKey !== expected) {
          send(res, 403, { ok: false, error: 'staff-approval-denied' });
          return;
        }
        raw
          .prepare('INSERT OR IGNORE INTO offer_approvals (convo, code, created_at) VALUES (?, ?, ?)')
          .run(body.conversationId, body.offerCode, Date.now());
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/service-completed') {
        const body = (await readBody(req)) as { conversationId: string };
        const hasBooking = raw
          .prepare(`SELECT 1 FROM proposals WHERE convo = ? AND status = 'confirmed' LIMIT 1`)
          .get(body.conversationId);
        if (!hasBooking) {
          send(res, 404, { ok: false, error: 'no-confirmed-service' });
          return;
        }
        const existing = raw
          .prepare(`SELECT 1 FROM jobs WHERE convo = ? AND kind = 'feedback' AND status = 'scheduled' LIMIT 1`)
          .get(body.conversationId);
        if (existing) {
          send(res, 200, { ok: true, duplicate: true });
          return;
        }
        const jobId = `job-${randomBytes(8).toString('hex')}`;
        raw
          .prepare(
            'INSERT INTO jobs (id, convo, kind, due_at, channel, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            jobId,
            body.conversationId,
            'feedback',
            Date.now() + 3600000,
            'browser',
            JSON.stringify({ text: 'How was your service? Reply with a rating 1-5 (simulated workshop).' }),
            'scheduled',
            Date.now(),
          );
        send(res, 200, { ok: true, jobId });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/feedback') {
        const body = (await readBody(req)) as { conversationId: string; rating: number; text?: string };
        if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
          send(res, 400, { ok: false, error: 'rating must be 1-5' });
          return;
        }
        raw
          .prepare('INSERT OR REPLACE INTO feedback_responses (convo, rating, text, created_at) VALUES (?, ?, ?, ?)')
          .run(body.conversationId, body.rating, body.text ?? '', Date.now());
        if (body.rating <= 2) {
          raw
            .prepare('INSERT INTO review_tasks (convo, rating, text, status, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(body.conversationId, body.rating, body.text ?? '', 'open', Date.now());
          send(res, 200, {
            ok: true,
            note: 'Sorry it fell short. A staff review task is open. There is no automatic refund; staff decide next steps.',
          });
          return;
        }
        send(res, 200, { ok: true, note: 'Thanks for the rating.' });
        return;
      }

      if (opts.testMode && req.method === 'GET' && url.pathname === '/api/review-tasks') {
        const convo = url.searchParams.get('conversationId') ?? '';
        const rows = raw.prepare(`SELECT rating, text, status FROM review_tasks WHERE convo = ?`).all(convo);
        send(res, 200, { tasks: rows });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/followup/blocker') {
        const body = (await readBody(req)) as { conversationId: string };
        raw
          .prepare('INSERT OR IGNORE INTO conversations (id, created_at) VALUES (?, ?)')
          .run(body.conversationId, Date.now());
        const jobId = `job-${randomBytes(8).toString('hex')}`;
        raw
          .prepare(
            'INSERT INTO jobs (id, convo, kind, due_at, channel, payload_json, status, created_at, max_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            jobId,
            body.conversationId,
            'blocker',
            Date.now(),
            'browser',
            JSON.stringify({
              text: 'What is blocking your booking? Reply to adjust time, pickup, or price (simulated workshop).',
            }),
            'scheduled',
            Date.now(),
            2,
          );
        send(res, 200, { jobId });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/reminders/schedule') {
        const body = (await readBody(req)) as { conversationId: string; delaySec?: number; nowMs?: number };
        raw
          .prepare('INSERT OR IGNORE INTO conversations (id, created_at) VALUES (?, ?)')
          .run(body.conversationId, Date.now());
        // Test-only clock seam so delivery does not depend on the wall
        // clock's quiet hours. Production always uses the real clock.
        const now = opts.testMode && typeof body.nowMs === 'number' ? body.nowMs : Date.now();
        const jobId = `job-${randomBytes(8).toString('hex')}`;
        raw
          .prepare(
            'INSERT INTO jobs (id, convo, kind, due_at, channel, payload_json, status, created_at, max_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            jobId,
            body.conversationId,
            'service-reminder',
            now + (body.delaySec ?? 0) * 1000,
            'browser',
            JSON.stringify({
              text: 'ServiceLoop reminder: your annual car service is due. Reply with a day that suits you and whether you need pickup, or snooze if the timing is off. (simulated workshop)',
            }),
            'scheduled',
            Date.now(),
            2,
          );
        // Due-now reminders deliver through the same worker path (leases,
        // quiet hours, opt-out and booked suppression), not a side channel.
        const out = tick(raw, (job) => {
          const payload = JSON.parse(job.payload_json) as { text: string };
          raw
            .prepare('INSERT INTO inbox (convo, text, created_at) VALUES (?, ?, ?)')
            .run(job.convo, payload.text, Date.now());
        }, now, opts.timezone);
        send(res, 200, { ok: true, jobId, delivered: out.delivered });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/voice') {
        send(res, 501, {
          error: 'voice-transcribe-not-configured',
          note: 'Browser audio upload lands here in M2 with direct Meta voice-transcribe. No audio stored.',
        });
        return;
      }

      send(res, 404, { error: 'not-found' });
    } catch (e) {
      send(res, 500, { error: String(e) });
    }
  });

  return {
    listen: (port: number) =>
      new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
      }),
    close: () => {
      server.close();
      store.close();
    },
  };
}

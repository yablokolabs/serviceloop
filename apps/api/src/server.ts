import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { applyPatch, type ConstraintState } from '../../../packages/domain/src/ledger.js';
import { findSlots, type Candidate, type WorkshopConfig } from '../../../packages/domain/src/solver.js';
import { cancelBooking, confirmBooking, holdSlot, openStore } from '../../../packages/domain/src/store.js';
import { extractTurn, type ExtractedPatch } from './extract.js';
import { liveInterpret } from './modelInterpret.js';
import { evaluateOffer, seedOffers, SERVICE_PRICES } from './offers.js';
import { tick } from '../../worker/src/worker.js';

export interface ServerOptions {
  dbPath: string;
  workshopDate: string;
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
    if (f === 'serviceStartBefore') return activeValue(state, 'serviceStartBefore') === undefined || newBeforeMin !== undefined;
    if (f === 'pickupRequired') return pickup === undefined;
    if (f === 'pickupTime') return pickup !== false && activeValue(state, 'pickupTime') === undefined;
    if (f === 'timeReference') {
      // Grounded only when this message's "before" time is the one already
      // confirmed; a different time is new ambiguity.
      if (newBeforeMin !== undefined) return newBeforeMin !== pickupMin && newBeforeMin !== cutoffMin;
      return pickupMin === undefined && cutoffMin === undefined;
    }
    return true;
  });
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
  raw.exec(`CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY, convo TEXT NOT NULL, candidate_json TEXT NOT NULL,
    approval_token TEXT NOT NULL, constraints_rev INTEGER NOT NULL,
    hold_token TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
    final_price INTEGER, offer_code TEXT)`);
  let workshop = seededWorkshop(opts.workshopDate, opts.timezone);

  const slotIdOf = (c: Candidate): string => `${c.bayId}@${workshop.date}T${c.serviceStartMin}`;
  // Availability is stateful: booked slots and live holds are never proposed.
  const takenSlots = (): Set<string> => {
    const taken = new Set<string>();
    for (const r of raw.prepare('SELECT slot_id FROM bookings').all() as { slot_id: string }[]) taken.add(r.slot_id);
    for (const r of raw.prepare('SELECT slot_id FROM holds WHERE expires_at > ?').all(Date.now()) as { slot_id: string }[])
      taken.add(r.slot_id);
    return taken;
  };
  const available = (cs: Candidate[]): Candidate[] => {
    const t = takenSlots();
    return cs.filter((c) => !t.has(slotIdOf(c)));
  };

  const loadLedger = (convo: string): ConstraintState => {
    const rows = raw.prepare('SELECT record_json FROM ledger_entries WHERE convo = ?').all(convo) as {
      record_json: string;
    }[];
    const records = rows.map((r) => JSON.parse(r.record_json));
    return { revision: records.length ? Math.max(...records.map((r) => r.revision)) : 0, records };
  };
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

  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (req.method === 'POST' && url.pathname === '/api/turns') {
        const body = (await readBody(req)) as { conversationId: string; text: string; nowIso: string };
        raw.prepare('INSERT OR IGNORE INTO conversations (id, created_at) VALUES (?, ?)').run(body.conversationId, Date.now());
        raw.prepare('INSERT INTO turns (convo, role, text, created_at) VALUES (?, ?, ?, ?)').run(body.conversationId, 'user', body.text, Date.now());

        const isYes = /^(yes|yeah|yep|ok|confirm)\.?$/i.test(body.text.trim());
        if (isYes) {
          if (hasPending(body.conversationId, 'serviceDate')) {
            send(res, 200, {
              ledgerRev: loadLedger(body.conversationId).revision,
              question: 'Before I check availability I need: which date.',
              unresolvedFields: ['serviceDate'],
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
          send(res, 200, { ledgerRev: loadLedger(body.conversationId).revision, question: 'There is no open proposal to approve. Tell me a day and whether you need pickup.' });
          return;
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
        saveLedger(body.conversationId, next, before.revision);

        // A pending date ambiguity survives later date-less turns. Only a
        // turn that explicitly adds (or revokes) the date clears it.
        const dateResolved =
          patch.additions.some((a) => a.field === 'serviceDate') || patch.revocations.includes('serviceDate');
        if (dateResolved) {
          clearPending(body.conversationId, 'serviceDate');
        } else if (patch.unresolvedFields.includes('serviceDate') && hasDateReference(body.text)) {
          setPending(body.conversationId, 'serviceDate');
        }
        const pendingDate = !dateResolved && hasPending(body.conversationId, 'serviceDate');

        const date = activeValue(next, 'serviceDate') as string | undefined;
        const window = activeValue(next, 'serviceWindow') as string | undefined;
        const pickup = activeValue(next, 'pickupRequired');
        const missing: string[] = [];
        if (!date) missing.push('which date');
        if (!window && activeValue(next, 'serviceStartBefore') === undefined) missing.push('what time of day');
        if (pickup === undefined) missing.push('whether you need pickup');

        const stillUnresolved = unresolvedAfterLedger(patch, next, body.text);
        if (pendingDate && !stillUnresolved.includes('serviceDate')) stillUnresolved.push('serviceDate');
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
        if (date !== workshop.date) {
          send(res, 200, {
            ledgerRev: next.revision,
            interpreter,
            routingReason,
            question: `This demo workshop only runs ${workshop.date}. Want that day instead?`,
          });
          return;
        }
        const beforeMin = window === 'morning' ? 12 * 60 : undefined;
        const needsPickup = pickup === true || activeValue(next, 'pickupTime') !== undefined;
        const out = findSlots(workshop, { serviceStartBeforeMin: beforeMin, pickupRequired: needsPickup });
        const free = available(out.candidates);
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
        if (hasPending(body.conversationId, 'serviceDate')) {
          send(res, 409, { ok: false, error: 'clarification-required', unresolvedFields: ['serviceDate'] });
          return;
        }
        const ledger = loadLedger(body.conversationId);
        const date = activeValue(ledger, 'serviceDate') as string | undefined;
        const window = activeValue(ledger, 'serviceWindow') as string | undefined;
        const pickup = activeValue(ledger, 'pickupRequired');
        const out = findSlots(workshop, {
          serviceStartBeforeMin: window === 'morning' ? 12 * 60 : undefined,
          pickupRequired: pickup === true || activeValue(ledger, 'pickupTime') !== undefined,
        });
        const cand = out.candidates.find((c: Candidate) => c.id === body.candidateId);
        if (!cand || date !== workshop.date) {
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
        if (takenSlots().has(slotIdOf(cand))) {
          send(res, 409, { ok: false, error: 'slot-taken' });
          return;
        }
        let hold;
        try {
          hold = holdSlot(store, {
            slotId: `${cand.bayId}@${workshop.date}T${cand.serviceStartMin}`,
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
        if (hasPending(prop.convo, 'serviceDate')) {
          send(res, 409, { ok: false, error: 'clarification-required', unresolvedFields: ['serviceDate'] });
          return;
        }
        const ledger = loadLedger(prop.convo);
        if (ledger.revision !== prop.constraints_rev) {
          send(res, 409, { ok: false, error: 'constraints-changed' });
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
        const body = (await readBody(req)) as { nowMs?: number };
        const out = tick(raw, (job) => {
          const payload = JSON.parse(job.payload_json) as { text: string };
          raw
            .prepare('INSERT INTO inbox (convo, text, created_at) VALUES (?, ?, ?)')
            .run(job.convo, payload.text, Date.now());
        }, body.nowMs ?? Date.now(), opts.timezone);
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
        const body = (await readBody(req)) as { conversationId: string; delaySec?: number };
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
            'service-reminder',
            Date.now() + (body.delaySec ?? 0) * 1000,
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
        }, Date.now(), opts.timezone);
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

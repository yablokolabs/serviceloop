// Persistent transactional booking store. SQLite with UNIQUE constraints plus
// transactions; concurrency safety comes from the database, not memory.
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';

export interface Store {
  bookingCount(): number;
  close(): void;
}

interface Db extends Store {
  raw: Database.Database;
}

export function openStore(path: string): Store {
  const raw = new Database(path);
  // WAL stays the default. The Modal deploy sets SQLITE_JOURNAL_MODE=delete:
  // its demo DB sits on a network volume with a second writer (the hourly
  // reset), where WAL visibility is unsafe. Only the exact value switches.
  raw.exec(`PRAGMA journal_mode = ${process.env.SQLITE_JOURNAL_MODE === 'delete' ? 'DELETE' : 'WAL'}`);
  raw.exec(`CREATE TABLE IF NOT EXISTS holds (
    slot_id TEXT PRIMARY KEY,
    hold_token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    proposal_rev INTEGER NOT NULL
  )`);
  raw.exec(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id TEXT UNIQUE NOT NULL,
    hold_token TEXT NOT NULL,
    approval_token TEXT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    cancel_token TEXT NOT NULL DEFAULT '',
    constraints_rev INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  try {
    raw.exec(`ALTER TABLE bookings ADD COLUMN cancel_token TEXT NOT NULL DEFAULT ''`);
  } catch {
    // column already present
  }
  const bookingCount = raw.prepare('SELECT COUNT(*) AS n FROM bookings').pluck();
  return {
    bookingCount: () => Number(bookingCount.get()),
    close: () => raw.close(),
    raw,
  } as Db;
}

function dbOf(store: Store): Database.Database {
  return (store as Db).raw;
}

export interface HoldRequest {
  slotId: string;
  serviceStartMin: number;
  pickupMin?: number;
  proposalRev: number;
  holdSecs: number;
}

export function holdSlot(store: Store, req: HoldRequest): { holdToken: string } {
  const raw = dbOf(store);
  const holdToken = `hold-${req.slotId}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const expiresAt = Date.now() + req.holdSecs * 1000;
  const tx = raw.transaction(() => {
    // Reap only the expired hold for this slot; a live foreign hold must
    // still collide (UNIQUE) so racing holders yield one winner.
    raw.prepare('DELETE FROM holds WHERE slot_id = ? AND expires_at <= ?').run(req.slotId, Date.now());
    raw
      .prepare('INSERT INTO holds (slot_id, hold_token, expires_at, proposal_rev) VALUES (?, ?, ?, ?)')
      .run(req.slotId, holdToken, expiresAt, req.proposalRev);
  });
  tx();
  return { holdToken };
}

export interface ConfirmRequest {
  holdToken: string;
  approvalToken: string;
  idempotencyKey: string;
  cancelToken: string;
  constraintsRev: number;
}

export type ConfirmResult = { ok: true; bookingId: number } | { ok: false; error: string };

export function cancelBooking(
  store: Store,
  bookingId: number,
  cancelToken: string,
): { ok: boolean; holdToken?: string } {
  const raw = dbOf(store);
  const row = raw.prepare('SELECT hold_token FROM bookings WHERE id = ? AND cancel_token = ?').get(bookingId, cancelToken) as
    | { hold_token: string }
    | undefined;
  if (!row) return { ok: false };
  raw.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
  raw.prepare('DELETE FROM holds WHERE hold_token = ?').run(row.hold_token);
  return { ok: true, holdToken: row.hold_token };
}

export function confirmBooking(store: Store, req: ConfirmRequest): ConfirmResult {
  const raw = dbOf(store);
  const tx = raw.transaction(() => {
    const existing = raw
      .prepare('SELECT id FROM bookings WHERE idempotency_key = ?')
      .get(req.idempotencyKey) as { id: number } | undefined;
    if (existing) return { ok: true, bookingId: existing.id } as ConfirmResult;
    const hold = raw.prepare('SELECT slot_id, expires_at FROM holds WHERE hold_token = ?').get(req.holdToken) as
      | { slot_id: string; expires_at: number }
      | undefined;
    if (!hold || hold.expires_at <= Date.now()) return { ok: false, error: 'hold-expired' } as ConfirmResult;
    try {
      const info = raw
        .prepare(
          'INSERT INTO bookings (slot_id, hold_token, approval_token, idempotency_key, cancel_token, constraints_rev, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(hold.slot_id, req.holdToken, req.approvalToken, req.idempotencyKey, req.cancelToken, req.constraintsRev, Date.now());
      // The booking row itself now enforces slot uniqueness; the consumed
      // hold must not keep the slot blocked for the next proposal.
      raw.prepare('DELETE FROM holds WHERE hold_token = ?').run(req.holdToken);
      return { ok: true, bookingId: Number(info.lastInsertRowid) } as ConfirmResult;
    } catch {
      return { ok: false, error: 'slot-taken' } as ConfirmResult;
    }
  });
  return tx();
}

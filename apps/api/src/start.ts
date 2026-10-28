import { createServer } from './server.js';
import { openDaysBetween } from '../../../packages/domain/src/dates.js';

// Interpretation mode is explicit, never a silent fallback: anything that
// is not exactly 'live' or 'live-baseten' runs the labeled rules-demo.
const mode = process.env.INTERPRET_MODE;
const interpretMode = mode === 'live' || mode === 'live-baseten' ? mode : 'rules-demo';

// The demo workshop runs every day from WORKSHOP_DATE through
// WORKSHOP_END_DATE except Sundays.
const workshopDate = process.env.WORKSHOP_DATE ?? '2026-10-31';
const workshopDates = openDaysBetween(workshopDate, process.env.WORKSHOP_END_DATE ?? '2026-11-30');

const srv = createServer({
  dbPath: process.env.DB_PATH ?? 'data/demo.db',
  workshopDate,
  workshopDates,
  workshopClosedNote: 'closed Sundays',
  timezone: process.env.WORKSHOP_TZ ?? 'Asia/Kolkata',
  interpretMode,
});
const port = Number(process.env.PORT ?? 3101);
await srv.listen(port);
console.log(`serviceloop api on 127.0.0.1:${port} (interpret: ${interpretMode})`);

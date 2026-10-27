import { createServer } from './server.js';

const srv = createServer({
  dbPath: process.env.DB_PATH ?? 'data/demo.db',
  workshopDate: process.env.WORKSHOP_DATE ?? '2026-10-31',
  timezone: process.env.WORKSHOP_TZ ?? 'Asia/Kolkata',
});
const port = Number(process.env.PORT ?? 3101);
await srv.listen(port);
console.log(`serviceloop api on 127.0.0.1:${port}`);

// Container entrypoint for Modal (single command per web function).
// Starts the API on 127.0.0.1:API_PORT and the front server on
// WEB_HOST:WEB_PORT in one container. If either process exits, the other
// is stopped and the container exits so Modal restarts it cleanly.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = new Set();

function start(name, cmd, args, env) {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  children.add(child);
  child.on('exit', (code, signal) => {
    console.log(`${name} exited (code=${code} signal=${signal}); stopping container`);
    for (const c of children) {
      if (c !== child) c.kill('SIGTERM');
    }
    setTimeout(() => process.exit(code ?? 1), 2000).unref();
  });
  return child;
}

const API_PORT = process.env.API_PORT ?? '3101';
start('api', process.execPath, ['dist/apps/api/src/start.js'], { PORT: API_PORT });
start('web', process.execPath, ['scripts/serve-production.mjs'], {});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    for (const c of children) c.kill('SIGTERM');
  });
}

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { createServer } from '../../apps/api/src/server.js';

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
let browser: Browser | null = null;
let port = 0;
let vite: ViteDevServer | null = null;
let webUrl = '';
afterAll(async () => {
  await browser?.close();
  await vite?.close();
});

// Isolated API on an ephemeral port with a fresh DB, plus an own Vite dev
// server on an ephemeral port: this test must never depend on (or pollute)
// the long-lived dev servers' shared state, and must run green in CI
// where no dev server exists.
async function page(): Promise<Page> {
  if (!port) {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-e2e-')), 'e2e.db');
    const srv = createServer({ dbPath, workshopDate: '2026-10-31', timezone: 'Asia/Kolkata', testMode: true });
    port = await srv.listen(0);
  }
  if (!vite) {
    vite = await createViteServer({
      configFile: join(process.cwd(), 'apps/web/vite.config.ts'),
      root: join(process.cwd(), 'apps/web'),
      server: { port: 0 },
    });
    await vite.listen();
    const addr = vite.httpServer?.address();
    if (!addr || typeof addr === 'string') throw new Error('vite dev server did not start');
    webUrl = `http://127.0.0.1:${addr.port}/`;
  }
  browser ??= await chromium.launch({ executablePath: CHROME });
  const p = await browser.newPage();
  await p.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    route.continue({ url: `http://127.0.0.1:${port}${url.pathname}${url.search}` });
  });
  return p;
}

describe('browser booking flow', () => {
  test('text, clarification, slot, approval, receipt, cancel', async () => {
    const p = await page();
    await p.goto(webUrl);
    await p.waitForLoadState('networkidle');
    await p.getByLabel('message').fill('car service Saturday please');
    await p.getByRole('button', { name: 'Send' }).click();
    await p.getByText('Before I check availability').waitFor();
    await p.getByLabel('message').fill('service Saturday morning with pickup at 10');
    await p.getByRole('button', { name: 'Send' }).click();
    await p.getByRole('button', { name: 'Hold this slot' }).first().waitFor();
    await p.getByRole('button', { name: 'Hold this slot' }).first().click();
    await p.getByRole('button', { name: 'Approve and book' }).click();
    await p.getByText(/Booked\. Confirmation/).waitFor();
    await p.getByRole('button', { name: 'Cancel booking' }).click();
    await p.getByText('Booking cancelled.').waitFor();
    expect(await p.getByText('simulated workshop', { exact: false }).count()).toBeGreaterThan(0);
    await p.close();
  });

  test('audio upload shows honest not-configured state', async () => {
    const p = await page();
    await p.goto(webUrl);
    await p.waitForLoadState('networkidle');
    await p.setInputFiles('input[type="file"]', {
      name: 'note.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.alloc(44),
    });
    await p.getByText(/not transcribed yet/).waitFor();
    await p.close();
  });
});

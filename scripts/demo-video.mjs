// Genuine demo capture: real Chromium drives the real UI and API.
// Output: evidence/demo-booking.webm plus stills. No staging, no mocks.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const out = new URL('../evidence/demo-video/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: out, size: { width: 1280, height: 800 } },
});
const p = await ctx.newPage();
const dwell = (ms) => new Promise((r) => setTimeout(r, ms));
const say = async (text) => {
  await p.getByLabel('message').fill(text);
  await p.getByRole('button', { name: 'Send' }).click();
};

await p.goto('http://127.0.0.1:5173/');
await p.waitForLoadState('networkidle');
await dwell(12000);

// Vague request -> clarification.
await say('car service Saturday please');
await p.getByText('Before I check availability').waitFor();
await dwell(15000);

// Impossible coupled request -> compromises.
await say('service before 10 with pickup');
await p.getByText(/No slot fits|compromise/i).first().waitFor().catch(() => {});
await dwell(15000);

// Feasible request -> slots.
await say('service Saturday morning with pickup at 10');
await p.getByRole('button', { name: 'Hold this slot' }).first().waitFor();
await dwell(15000);
await p.screenshot({ path: `${out}still-slots.png` });

// Hold, approve, receipt.
await p.getByRole('button', { name: 'Hold this slot' }).first().click();
await p.getByRole('button', { name: 'Approve and book' }).waitFor();
await dwell(12000);
await p.screenshot({ path: `${out}still-approval.png` });
await p.getByRole('button', { name: 'Approve and book' }).click();
await p.getByText(/Booked\. Confirmation/).waitFor();
await dwell(20000);
await p.screenshot({ path: `${out}still-receipt.png` });

// Audio upload honesty + cancel to close the loop.
await p.setInputFiles('input[type="file"]', {
  name: 'note.wav',
  mimeType: 'audio/wav',
  buffer: Buffer.alloc(44),
});
await p.getByText(/not transcribed yet/).waitFor();
await dwell(12000);
await p.getByRole('button', { name: 'Cancel booking' }).click();
await p.getByText('Booking cancelled.').waitFor();
await dwell(10000);

// Architecture diagram scene.
await p.goto('file:///home/azureuser/serviceloop/docs/architecture.svg');
await dwell(24000);
await p.screenshot({ path: `${out}still-diagram.png` });

await ctx.close();
await browser.close();
console.log('video saved to', out);

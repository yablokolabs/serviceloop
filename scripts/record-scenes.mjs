// Staged explainer recording: animated scenes plus live demo segment.
// Each scene records to exact length, then audio is mixed per scene.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}/evidence/demo-video/scenes/`;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
});

async function recordStill(name, seconds) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: out, size: { width: 1280, height: 800 } },
  });
  const p = await ctx.newPage();
  await p.goto(`file://${root}/scripts/demo-scenes/${name}.html`);
  await p.waitForTimeout(seconds * 1000);
  const path = await p.video().path();
  await ctx.close();
  const { renameSync } = await import('node:fs');
  renameSync(path, `${out}${name}.webm`);
  console.log(name, 'recorded');
}

const only = process.argv[2];
for (const [name, secs] of [['s1-title', 8], ['s2-problem', 20], ['s3-workflow', 34], ['s5-arch', 28], ['s6-closing', 9]]) {
  if (!only || only === name) await recordStill(name, secs);
}

// Live demo segment, paced to narration.
if (!only || only === 's4-demo') {
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
  await p.goto('http://127.0.0.1:5173/?convo=demo-live-1');
  await p.waitForLoadState('networkidle');
  // Outbound-first: the workshop reminder opens the conversation.
  await p.evaluate(async () => {
    await fetch('/api/reminders/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: 'demo-live-1' }),
    });
  });
  await p.getByText(/annual car service is due/).waitFor();
  await dwell(5000);
  await say('car service Saturday please');
  await p.getByText('Before I check availability').waitFor();
  await dwell(9000);
  await say('service before 10 with pickup');
  await dwell(11000);
  await say('service Saturday morning with pickup at 10');
  await p.getByRole('button', { name: 'Hold this slot' }).first().waitFor();
  await dwell(7000);
  await p.getByRole('button', { name: 'Hold this slot' }).first().click();
  await p.getByRole('button', { name: 'Approve and book' }).waitFor();
  await dwell(4000);
  await p.getByRole('button', { name: 'Approve and book' }).click();
  await p.getByText(/Booked\. Confirmation/).waitFor();
  await dwell(9000);
  const path = await p.video().path();
  await ctx.close();
  const { renameSync } = await import('node:fs');
  renameSync(path, `${out}s4-demo.webm`);
  console.log('s4-demo recorded');
}

await browser.close();
console.log('all scenes recorded');

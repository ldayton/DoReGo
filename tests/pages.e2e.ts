import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.PAGES_TEST_URL || 'http://127.0.0.1:4318/DoReGo/';
const server = process.env.PAGES_TEST_URL
  ? null
  : spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--mode',
        'pages',
        '--outDir',
        'dist-pages',
        '--host',
        '127.0.0.1',
        '--port',
        '4318',
        '--strictPort',
      ],
      { stdio: 'pipe' }
    );
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* Wait for preview startup. */
    }
    if (server?.exitCode !== null && server) throw new Error('Static preview could not start.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors: string[] = [];
  const samples: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/samples/')) {
      assert.ok(response.ok(), `Sample unavailable: ${response.url()}`);
      samples.push(response.url());
    }
  });
  await page.goto(base);
  await page.locator('#exercise-title').waitFor();
  assert.equal(await page.locator('#gate').count(), 0);
  assert.equal(await page.locator('#noteBeats').count(), 0);
  assert.equal(await page.locator('#solfege').count(), 0);
  assert.equal(await page.locator('#transition').count(), 0);
  assert.deepEqual(await page.locator('#countIn option').allTextContents(), [
    '0 bars',
    '½ bar',
    '1 bar',
    '2 bars',
  ]);
  assert.equal(await page.locator('.brand').getAttribute('href'), '/DoReGo/');
  assert.ok(await page.locator('#video-button').isHidden());
  assert.equal(await page.locator('#bpm').inputValue(), '200');
  await page.locator('#play').click();
  await page.waitForFunction(
    () => Number((document.querySelector('#position') as HTMLInputElement).value) > 0.15
  );
  await page.locator('#play').click();
  assert.ok(samples.length > 0);
  assert.ok(samples.every((url) => url.includes('/DoReGo/samples/bitklavier/')));
  await page.locator('#how-button').click();
  const credits = page.locator('#how-dialog a');
  const creditsPath = await credits.getAttribute('href');
  const notice = await fetch(new URL(creditsPath!, base));
  assert.ok(notice.ok);
  assert.match(await notice.text(), /Creative Commons Attribution 4.0/);
  await page.locator('#how-dialog .close-dialog').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#midi-download').click();
  const download = await downloadPromise;
  const midi = await readFile((await download.path())!);
  assert.equal(midi.toString('ascii', 0, 4), 'MThd');
  await page.locator('#pattern').selectOption('rossini');
  assert.equal(await page.locator('#exercise-title').textContent(), 'Rossini Scale');
  assert.ok(await page.locator('#direction').isHidden());
  assert.ok(await page.locator('#form-error').isHidden());
  assert.ok(
    Number(await page.locator('#high').inputValue()) -
      Number(await page.locator('#low').inputValue()) >=
      19
  );
  const rossiniDownloadPromise = page.waitForEvent('download');
  await page.locator('#midi-download').click();
  const rossiniDownload = await rossiniDownloadPromise;
  assert.ok(
    (await readFile((await rossiniDownload.path())!)).includes(Buffer.from('Rossini Scale'))
  );
  await page.locator('#pattern').selectOption('arpeggio');
  assert.ok(await page.locator('#direction').isVisible());
  // A phone gets a taller, fully fitted keyboard; desktop keeps the video layout.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#stage') as HTMLCanvasElement;
    return canvas.width === canvas.height;
  });
  const mobile = await page.locator('#stage').boundingBox();
  assert.ok(mobile && Math.abs(mobile.width - mobile.height) < 2);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#stage') as HTMLCanvasElement;
    return canvas.width === 1600 && canvas.height === 900;
  });
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${base} loads with working piano samples, playback, MIDI, credits, and static-only controls.`
  );
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}

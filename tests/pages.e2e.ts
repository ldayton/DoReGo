import { chromium } from 'playwright';
import { DEFAULT_SPEC } from '../src/music';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

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
  let releaseSamples!: () => void;
  const sampleGate = new Promise<void>((resolve) => {
    releaseSamples = resolve;
  });
  await page.route('**/samples/bitklavier/*.flac', async (route) => {
    await sampleGate;
    await route.continue();
  });
  await page.goto(base);
  await page.locator('#exercise-title').waitFor();
  await page.getByRole('button', { name: 'Loading...' }).waitFor();
  assert.ok(await page.locator('#play').isDisabled());
  assert.equal(await page.locator('#play').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('.piano-warmup i').count(), 3);
  releaseSamples();
  await page.waitForFunction(
    () => !(document.querySelector('#play') as HTMLButtonElement).disabled
  );
  assert.equal(await page.locator('#play').innerText(), 'Play');
  assert.ok(samples.length > 0, 'Piano samples should load before the first click');
  const preparedSamples = samples.length;
  assert.equal(
    await page.locator('#save-preset, #saved-presets, #delete-preset, #save-dialog').count(),
    0
  );
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
  assert.equal(
    await page.locator('#video-button, #midi-download, #export-dialog, .export-card').count(),
    0
  );
  assert.equal(await page.locator('#pattern').inputValue(), 'rossini');
  assert.equal(await page.locator('#low').inputValue(), '52');
  assert.equal(await page.locator('#high').inputValue(), '76');
  assert.equal(await page.locator('#bpm').inputValue(), '180');
  const playStarted = Date.now();
  await page.locator('#play').click();
  await page.waitForFunction(
    () => Number((document.querySelector('#position') as HTMLInputElement).value) > 0.15
  );
  assert.ok(
    Date.now() - playStarted < 1500,
    'Prepared playback should start without sample loading'
  );
  assert.equal(samples.length, preparedSamples, 'Play must use the preloaded samples');
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
  await page.locator('#pattern').selectOption('rossini');
  assert.equal(await page.locator('#exercise-title').textContent(), 'Rossini Scale');
  assert.ok(await page.locator('#direction').isHidden());
  assert.ok(await page.locator('#form-error').isHidden());
  assert.ok(
    Number(await page.locator('#high').inputValue()) -
      Number(await page.locator('#low').inputValue()) >=
      19
  );
  await page.locator('#pattern').selectOption('arpeggio');
  assert.ok(await page.locator('#direction').isVisible());
  assert.equal(await page.locator('#exercise-title').textContent(), 'Arpeggio & Scale (Ascending)');
  for (const [pattern, label] of [
    ['fiveNote', 'Five-Note Scale'],
    ['octaveArpeggio', 'Octave Arpeggio'],
  ]) {
    await page.locator('#pattern').selectOption(pattern);
    assert.equal(await page.locator('#exercise-title').textContent(), `${label} (Ascending)`);
    assert.ok(await page.locator('#direction').isVisible());
    assert.ok(await page.locator('#key').isDisabled());
    await page.locator('input[name="direction"][value="down"]').check();
    assert.equal(await page.locator('#exercise-title').textContent(), `${label} (Descending)`);
    assert.ok(await page.locator('#form-error').isHidden());
    await page.locator('input[name="direction"][value="up"]').check();
  }
  await page.reload();
  assert.equal(await page.locator('#pattern').inputValue(), 'octaveArpeggio');
  assert.deepEqual(await page.locator('#pattern option').allTextContents(), [
    'Arpeggio & Scale',
    'Octave Arpeggio',
    'Rossini Scale',
    'Five-Note Scale',
    'Major Scale',
  ]);
  await page.locator('#pattern').selectOption('major');
  assert.ok(await page.locator('#note-range').isHidden());
  assert.ok(await page.locator('#range-heading').isHidden());
  assert.ok(await page.locator('#key').isVisible());
  for (const direction of ['up', 'down']) {
    await page.locator(`input[name="direction"][value="${direction}"]`).check();
    await page.locator('#key').selectOption('62');
    assert.equal(await page.locator('#low').inputValue(), direction === 'up' ? '62' : '50');
    assert.equal(await page.locator('#high').inputValue(), direction === 'up' ? '74' : '62');
  }
  await page.reload();
  assert.equal(await page.locator('#key').inputValue(), '62');
  assert.ok(await page.locator('#note-range').isHidden());
  await page.locator('#pattern').selectOption('arpeggio');
  assert.ok(await page.locator('#note-range').isVisible());
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
  const preferencesPage = await browser.newPage();
  const remembered = {
    ...DEFAULT_SPEC,
    pattern: 'fiveNote',
    low: 48,
    high: 67,
    bpm: 156,
    direction: 'down',
    countIn: 4,
    volume: -12,
    restBeats: 4,
    repetitions: 3,
    metronome: true,
    startingChords: false,
  };
  await preferencesPage.addInitScript((spec) => {
    if (!localStorage.getItem('dorego.current'))
      localStorage.setItem('dorego.current', JSON.stringify(spec));
  }, remembered);
  await preferencesPage.goto(base);
  for (const [id, value] of Object.entries(remembered)) {
    const field = preferencesPage.locator(`#${id}`);
    if ((await field.count()) && typeof value !== 'boolean' && !['key', 'direction'].includes(id))
      assert.equal(await field.inputValue(), String(value), `Stored ${id} was overwritten`);
  }
  assert.ok(await preferencesPage.locator('input[name="direction"][value="down"]').isChecked());
  assert.ok(await preferencesPage.locator('#metronome').isChecked());
  assert.ok(!(await preferencesPage.locator('#startingChords').isChecked()));
  await preferencesPage.locator('#bpm').fill('194');
  await preferencesPage.locator('#bpm').press('Tab');
  await preferencesPage.reload();
  assert.equal(await preferencesPage.locator('#bpm').inputValue(), '194');
  assert.equal(await preferencesPage.locator('#pattern').inputValue(), 'fiveNote');
  assert.equal(await preferencesPage.locator('#low').inputValue(), '48');
  assert.equal(await preferencesPage.locator('#high').inputValue(), '67');
  await preferencesPage.close();
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${base} loads with working piano samples, playback, credits, defaults, and no export UI.`
  );
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}

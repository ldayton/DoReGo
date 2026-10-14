import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const revision = '009793ebf849aee57f9a213aeaf8f2d1e2178f4f';
const base = `https://raw.githubusercontent.com/smpldsnds/sfzinstruments-splendid-grand-piano/${revision}/`;
async function get(path) {
  const r = await fetch(base + path.split('/').map(encodeURIComponent).join('/'));
  if (!r.ok) throw Error(`${path}: ${r.status}`);
  return r;
}
const regions = [];
for (const [layer, lowVelocity, highVelocity] of [
  ['PP', 1, 67],
  ['MP', 68, 84],
  ['MF', 85, 100],
  ['FF', 101, 127],
]) {
  const text = await (await get(`data/${layer}.txt`)).text();
  for (const line of text.split('\n')) {
    const m = line.match(/lokey=(\d+) hikey=(\d+) pitch_keycenter=(\d+).*sample=(.+)\.\$EXT/);
    if (!m) continue;
    const [, low, high, midi, file] = m;
    regions.push({
      low: Number(low),
      high: Number(high),
      midi: Number(midi),
      lowVelocity,
      highVelocity,
      file: `${layer}-${midi}.m4a`,
      original: `samples/${file}.m4a`,
    });
  }
}
await mkdir(root + 'public/samples/steinway', { recursive: true });
let index = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (index < regions.length) {
      const r = regions[index++];
      const target = root + 'public/samples/steinway/' + r.file;
      try {
        await readFile(target);
      } catch {
        const bytes = await (await get(r.original)).arrayBuffer();
        await writeFile(target, Buffer.from(bytes));
      }
    }
  })
);
await writeFile(
  root + 'src/steinway-samples.ts',
  `// AKAI Splendid Grand Piano. Public-domain Steinway recordings.\n// Generated from the source SFZ key and velocity regions.\nexport const STEINWAY_REGIONS = ${JSON.stringify(regions.map(({ original, ...r }) => r))} as const;\n`
);
await writeFile(
  root + 'public/samples/steinway/NOTICE.txt',
  `AKAI Splendid Grand Piano\nInstrument: Steinway Grand Piano\nSample license: Public Domain\nSource: https://sfzinstruments.github.io/pianos/splendid_grand_piano/\nEncoded samples: https://github.com/smpldsnds/sfzinstruments-splendid-grand-piano\nRevision: ${revision}\nSFZ conversion: kinwie; string resonance: P. Eastman (resonance samples not included).\nLocal files are renamed copies of the source M4A recordings.\n`
);
console.log(`Downloaded ${regions.length} samples from revision ${revision}.`);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('bitKlavier includes all 16 layers at each original minor-third pitch', async () => {
  const { BITKLAVIER_SAMPLES } = await import('../src/bitklavier-samples');
  assert.equal(BITKLAVIER_SAMPLES.length, 480);
  for (let midi = 21; midi <= 108; midi += 3) {
    assert.deepEqual(
      BITKLAVIER_SAMPLES.filter((sample) => sample.midi === midi).map((sample) => sample.layer),
      Array.from({ length: 16 }, (_, i) => i + 1)
    );
  }
  for (const { file } of BITKLAVIER_SAMPLES) {
    const sample = await readFile(new URL(`../public/samples/bitklavier/${file}`, import.meta.url));
    assert.ok(sample.length > 1024, file);
    assert.equal(sample.toString('ascii', 0, 4), 'fLaC', file);
  }
});

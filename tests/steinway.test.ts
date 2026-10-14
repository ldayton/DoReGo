import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STEINWAY_REGIONS } from '../src/steinway-samples';

test('Steinway key and velocity zones cover the full piano without ambiguous mappings', () => {
  for (let midi = 21; midi <= 108; midi++)
    for (let velocity = 1; velocity <= 127; velocity++) {
      const regions = STEINWAY_REGIONS.filter(
        (r) =>
          midi >= r.low && midi <= r.high && velocity >= r.lowVelocity && velocity <= r.highVelocity
      );
      assert.equal(regions.length, 1, `key ${midi}, velocity ${velocity}`);
    }
});
test('every mapped Steinway sample is bundled locally as a nonempty M4A recording', async () => {
  for (const file of new Set(STEINWAY_REGIONS.map((r) => r.file))) {
    const sample = await readFile(new URL(`../public/samples/steinway/${file}`, import.meta.url));
    assert.ok(sample.length > 1024, file);
    assert.equal(sample.toString('ascii', 4, 8), 'ftyp', file);
  }
});

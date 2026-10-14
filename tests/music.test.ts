import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPEC,
  PATTERNS,
  generateExercise,
  metronomeBeat,
  noteName,
  secondsAt,
  stateAt,
  practiceAt,
  validateSpec,
} from '../src/music';
import { Midi, exportMidi } from '../src/midi';

test('only Arpeggio and Major Scale are offered, with ascending Arpeggio as the default', () => {
  assert.deepEqual(
    Object.values(PATTERNS).map((p) => p.name),
    ['Arpeggio', 'Major Scale']
  );
  assert.equal(DEFAULT_SPEC.pattern, 'arpeggio');
  assert.equal(DEFAULT_SPEC.direction, 'up');
  assert.equal(DEFAULT_SPEC.countIn, 8);
});
test('Arpeggio generates the reference phrase and chromatic sweep in either direction', () => {
  const base = {
    ...DEFAULT_SPEC,
    low: 60,
    high: 68,
    countIn: 0,
    repetitions: 1,
    restBeats: 0,
    gate: 1,
    startingChords: false,
  };
  const up = generateExercise({ ...base, direction: 'up' });
  assert.deepEqual(
    up.notes.slice(0, 13).map((n) => n.midi - 60),
    [0, 4, 7, 5, 4, 2, 0, 4, 7, 5, 4, 2, 0]
  );
  assert.equal(up.notes[13].midi, 61);
  assert.equal(up.totalBeats, 36);
  const down = generateExercise({ ...base, direction: 'down' });
  assert.deepEqual(
    down.notes.slice(0, 13).map((n) => n.midi - 68),
    [0, -3, -7, -5, -3, -2, 0, -3, -7, -5, -3, -2, 0]
  );
  assert.equal(down.notes[13].midi, 67);
  assert.equal(up.title, 'Arpeggio (Ascending)');
  assert.equal(down.title, 'Arpeggio (Descending)');
  for (const n of [...up.notes, ...down.notes]) assert.ok(n.midi >= 60 && n.midi <= 68);
  assert.throws(() => generateExercise({ ...base, high: 66 }), /perfect fifth/);
});
test('Major Scale respects key and range, with ascending and descending order', () => {
  for (let key = 0; key < 12; key++) {
    const spec = {
      ...DEFAULT_SPEC,
      pattern: 'major',
      key,
      low: 45,
      high: 77,
      countIn: 0,
      repetitions: 1,
    };
    const up = generateExercise({ ...spec, direction: 'up' }),
      down = generateExercise({ ...spec, direction: 'down' });
    assert.deepEqual(
      down.notes.map((n) => n.midi),
      up.notes.map((n) => n.midi).reverse()
    );
    for (const n of up.notes) {
      assert.ok(n.midi >= 45 && n.midi <= 77);
      assert.ok(
        (PATTERNS.major.intervals as readonly number[]).includes((n.midi - key + 120) % 12)
      );
    }
  }
});
test('starting chords, tempo, articulation, note length, rests, and rounds stay adjustable', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    low: 60,
    high: 67,
    countIn: 2,
    repetitions: 2,
    restBeats: 3,
    bpm: 120,
    gate: 0.5,
    noteBeats: 0.5,
  });
  assert.deepEqual(
    e.notes.slice(0, 4).map((n) => n.midi),
    [47, 54, 59, 63]
  );
  assert.equal(e.notes[0].onsetBeat, 2);
  assert.equal(e.notes[0].durationBeats, 0.5);
  assert.equal(e.notes[7].midi, 60);
  assert.equal(e.notes[7].onsetBeat, 5);
  assert.equal(e.totalBeats, 29);
  assert.equal(stateAt(e, secondsAt(14.5, 120)).phase, 'rest');
  assert.equal(stateAt(e, secondsAt(14.5, 120)).count, 3);
  assert.equal(new Midi(exportMidi(e)).tracks[0].notes.length, e.notes.length);
});
test('scene boundaries separate preparation, count-in, rhythmic slots, rest, and completion', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    low: 60,
    high: 60,
    bpm: 120,
    countIn: 2,
    repetitions: 2,
    restBeats: 2,
  });
  assert.equal(stateAt(e, -1).phase, 'ready');
  assert.equal(stateAt(e, 0).count, 1);
  assert.equal(stateAt(e, 0.5).count, 2);
  assert.equal(stateAt(e, 1).note?.id, 0);
  assert.equal(stateAt(e, 1.49).note?.id, 0);
  assert.equal(stateAt(e, 1.5).phase, 'rest');
  assert.equal(stateAt(e, 2.5).note?.id, 1);
  assert.equal(stateAt(e, 3).phase, 'complete');
});
test('MIDI preserves fractional note timing and accents every bar of the forward count-in', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    countIn: 8,
    bpm: 120,
    noteBeats: 0.25,
    repetitions: 1,
  });
  assert.deepEqual(
    Array.from({ length: 8 }, (_, beat) => stateAt(e, beat * 0.5).count),
    [1, 2, 3, 4, 1, 2, 3, 4]
  );
  const midi = new Midi(exportMidi(e)),
    clicks = midi.tracks[1].notes;
  assert.equal(midi.header.tempos[0].bpm, 120);
  assert.equal(midi.tracks[1].channel, 9);
  assert.ok(clicks[0].velocity > clicks[1].velocity);
  assert.equal(clicks[0].velocity, clicks[4].velocity);
  assert.deepEqual(
    clicks.map((n) => n.ticks),
    Array.from({ length: 8 }, (_, i) => i * 480)
  );
  for (const [i, n] of e.notes.entries()) {
    assert.equal(midi.tracks[0].notes[i].ticks, Math.round(n.onsetBeat * 480));
    assert.ok(Math.abs(midi.tracks[0].notes[i].time - secondsAt(n.onsetBeat, 120)) < 0.00001);
  }
  assert.equal(metronomeBeat(2, 2).number, 1);
  assert.equal(metronomeBeat(6, 2).number, 1);
});
test('invalid input and removed exercises/directions are rejected', () => {
  for (const patch of [
    { bpm: 0 },
    { bpm: Infinity },
    { low: 90, high: 60 },
    { key: 12 },
    { pattern: '__proto__' },
    { pattern: 'minor' },
    { pattern: 'strawDescending' },
    { direction: 'updown' },
    { repetitions: 1.5 },
    { gate: 0 },
    { noteBeats: 0 },
    { countIn: -1 },
    { metronome: 'true' },
    { transition: NaN },
  ])
    assert.throws(() => generateExercise({ ...DEFAULT_SPEC, ...patch }));
  assert.throws(() => validateSpec(null));
  assert.throws(
    () =>
      generateExercise({
        ...DEFAULT_SPEC,
        low: 24,
        high: 96,
        noteBeats: 4,
        bpm: 30,
        repetitions: 16,
      }),
    /10 minutes/
  );
});
test('note labels use standard MIDI middle C', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(61), 'C♯4');
  assert.equal(noteName(70, 5), 'B♭4');
});
test('practice targets stay fixed through chords and melody and advance only at round boundaries', () => {
  for (const direction of ['up', 'down'] as const) {
    const e = generateExercise({
      ...DEFAULT_SPEC,
      direction,
      low: 60,
      high: 68,
      countIn: 8,
      repetitions: 1,
      restBeats: 2,
      bpm: 120,
    });
    const first = direction === 'up' ? 60 : 68,
      second = direction === 'up' ? 61 : 67;
    for (const beat of [0, 8, 10, 14, 16, 20, 31.99, 32, 33.99]) {
      const p = practiceAt(e, secondsAt(beat, 120));
      assert.equal(p.current.midi, first, `beat ${beat}`);
      assert.equal(p.next?.midi, second);
    }
    assert.notEqual(stateAt(e, secondsAt(16, 120)).note?.midi, first);
    assert.equal(practiceAt(e, secondsAt(34, 120)).current.midi, second);
    assert.equal(practiceAt(e, secondsAt(e.totalBeats, 120)).next, null);
    assert.deepEqual(practiceAt(e, secondsAt(10, 120)), practiceAt(e, secondsAt(10, 120)));
  }
});
test('each complete scale round has one practice target regardless of its individual notes', () => {
  const e = generateExercise({
    ...DEFAULT_SPEC,
    pattern: 'major',
    direction: 'down',
    countIn: 0,
    repetitions: 2,
    bpm: 120,
  });
  assert.equal(e.rounds.length, 2);
  assert.equal(practiceAt(e, secondsAt(3, 120)).current.midi, 72);
  assert.equal(practiceAt(e, secondsAt(3, 120)).next?.midi, 72);
});

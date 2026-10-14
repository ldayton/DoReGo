import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC, generateExercise } from '../src/music';
import { keyboardRange } from '../src/keyboard-layout';

test('mobile keyboard includes every starting chord and phrase note in each round', () => {
  for (const direction of ['up', 'down'] as const) {
    const exercise = generateExercise({
      ...DEFAULT_SPEC,
      low: 36,
      high: 84,
      repetitions: 1,
      direction,
    });
    for (const round of exercise.rounds) {
      const { low, high } = keyboardRange(exercise, round, true);
      const notes = exercise.notes.filter(
        (note) => note.onsetBeat >= round.onsetBeat && note.onsetBeat < round.endBeat
      );
      for (const note of notes)
        assert.ok(
          note.midi >= low && note.midi <= high,
          `${direction}: note ${note.midi} clipped in round ${round.id}`
        );
      assert.ok(high - low <= 27, 'Mobile keyboard should focus on the round, not the whole sweep');
      assert.ok(![1, 3, 6, 8, 10].includes(low % 12));
      assert.ok(![1, 3, 6, 8, 10].includes(high % 12));
    }
    const desktop = keyboardRange(exercise, exercise.rounds[0], false);
    assert.ok(desktop.high - desktop.low > 48);
  }
});

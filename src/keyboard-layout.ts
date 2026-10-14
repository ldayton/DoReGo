import type { Exercise, PracticeRound } from './music';

const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
export function keyboardRange(exercise: Exercise, round: PracticeRound, mobile: boolean) {
  const pitches = mobile
    ? exercise.notes
        .filter((note) => note.onsetBeat >= round.onsetBeat && note.onsetBeat < round.endBeat)
        .map((note) => note.midi)
    : exercise.pitches;
  // Include accompaniment notes outside the singer's configured range.
  let low = Math.max(
    0,
    mobile ? Math.min(...pitches) - 1 : Math.min(exercise.spec.low - 2, ...pitches)
  );
  let high = Math.min(108, mobile ? Math.max(...pitches) + 1 : exercise.spec.high + 2);
  while (isBlack(low)) low--;
  while (isBlack(high)) high++;
  return { low, high };
}

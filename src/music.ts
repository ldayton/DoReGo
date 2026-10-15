export const PATTERNS = {
  arpeggio: {
    name: 'Arpeggio & Scale',
    intervals: [0, 4, 7],
    description: 'An arpeggio with a stepwise return, moving one semitone per round.',
  },
  octaveArpeggio: {
    name: 'Octave Arpeggio',
    intervals: [0, 4, 7, 12, 7, 4, 0],
    description: 'A major arpeggio through an octave and back, moving one semitone per round.',
  },
  rossini: {
    name: 'Rossini Scale',
    intervals: [0, 4, 7, 12, 16, 19, 17, 14, 11, 7, 5, 2, 0],
    description: 'The Rossini arpeggio and descending return, moving one semitone per round.',
  },
  fiveNote: {
    name: 'Five-Note Scale',
    intervals: [0, 2, 4, 5, 7, 5, 4, 2, 0],
    description: 'A five-note major scale out and back, moving one semitone per round.',
  },
  major: {
    name: 'Major Scale',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    description: 'A major scale through your selected range.',
  },
} as const;
export type Pattern = keyof typeof PATTERNS;
export function isVocalPattern(pattern: Pattern) {
  return pattern !== 'major';
}
export function vocalSpan(pattern: Pattern) {
  return pattern === 'rossini' ? 19 : pattern === 'octaveArpeggio' ? 12 : 7;
}
export type Direction = 'up' | 'down';
export type Voice = 'bitklavier';
export interface ExerciseSpec {
  startingChords?: boolean;
  pattern: Pattern;
  key: number;
  low: number;
  high: number;
  direction: Direction;
  bpm: number;
  noteBeats: number;
  repetitions: number;
  restBeats: number;
  countIn: number;
  gate: number;
  volume: number;
  voice: Voice;
  metronome: boolean;
  solfege: boolean;
  transition: number | null;
}
export interface NoteEvent {
  id: number;
  midi: number;
  onsetBeat: number;
  durationBeats: number;
  slotBeats: number;
  repetition: number;
  degree: number;
  velocity?: number;
}
export interface Exercise {
  spec: ExerciseSpec;
  notes: NoteEvent[];
  totalBeats: number;
  phraseBeats: number;
  pitches: number[];
  title?: string;
  guideNotes?: NoteEvent[];
  rounds: PracticeRound[];
}
export interface PracticeRound {
  id: number;
  midi: number;
  degree: number;
  onsetBeat: number;
  endBeat: number;
}
export function practiceAt(exercise: Exercise, seconds: number) {
  const beat = (Math.max(0, seconds) * exercise.spec.bpm) / 60;
  let index = 0;
  for (let i = 1; i < exercise.rounds.length; i++) {
    if (exercise.rounds[i].onsetBeat > beat + 1e-9) break;
    index = i;
  }
  const current = exercise.rounds[index];
  return {
    current,
    next: exercise.rounds[index + 1] ?? null,
    progress: Math.max(
      0,
      Math.min(1, (beat - current.onsetBeat) / (current.endBeat - current.onsetBeat))
    ),
  };
}
export interface Scene {
  beat: number;
  note: NoteEvent | null;
  upcoming: NoteEvent[];
  phase: 'ready' | 'countin' | 'note' | 'rest' | 'complete';
  count: number;
  repetition: number;
  progress: number;
}
export const DEFAULT_SPEC: ExerciseSpec = {
  pattern: 'rossini',
  key: 4,
  low: 52,
  high: 76,
  direction: 'up',
  bpm: 180,
  noteBeats: 1,
  repetitions: 2,
  restBeats: 2,
  countIn: 8,
  gate: 0.88,
  volume: 0,
  voice: 'bitklavier',
  metronome: false,
  solfege: false,
  transition: null,
};
export const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export function noteName(midi: number, key = 0): string {
  return `${([1, 3, 5, 8, 10].includes(key) ? FLATS : SHARPS)[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
export function secondsAt(beat: number, bpm: number) {
  return (beat * 60) / bpm;
}
export function metronomeBeat(beat: number, countIn = 0) {
  // The exercise starts a new bar even after a short two-beat count-in.
  const number = ((Math.floor(beat) - (beat >= countIn ? countIn : 0)) % 4) + 1;
  return { number, frequency: number === 1 ? 1400 : 1000, velocity: number === 1 ? 0.6 : 0.45 };
}
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function validateSpec(input: unknown): ExerciseSpec {
  if (!input || typeof input !== 'object') throw new Error('Choose an exercise first.');
  const s = input as Record<string, unknown>;
  const num = (key: string, min: number, max: number, integer = false) => {
    const n = s[key];
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      n < min ||
      n > max ||
      (integer && !Number.isInteger(n))
    )
      throw new Error(`Invalid ${key}: choose a value from ${min} to ${max}.`);
    return n;
  };
  if (typeof s.pattern !== 'string' || !Object.hasOwn(PATTERNS, s.pattern))
    throw new Error('Choose a supported pattern.');
  if (!['up', 'down'].includes(String(s.direction))) throw new Error('Choose a direction.');
  if (s.voice !== 'bitklavier') throw new Error('Only bitKlavier is supported.');
  for (const key of ['metronome', 'solfege'])
    if (typeof s[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
  const result: ExerciseSpec = {
    pattern: s.pattern as Pattern,
    direction: s.pattern === 'rossini' ? 'up' : (s.direction as Direction),
    voice: s.voice as Voice,
    key: num('key', 0, 11, true),
    low: num('low', 24, 96, true),
    high: num('high', 24, 96, true),
    bpm: num('bpm', 30, 240),
    noteBeats: num('noteBeats', 0.25, 4),
    repetitions: num('repetitions', 1, 16, true),
    restBeats: num('restBeats', 0, 16, true),
    countIn: num('countIn', 0, 8, true),
    gate: num('gate', 0.25, 1),
    volume: num('volume', -60, 0),
    metronome: s.metronome as boolean,
    solfege: s.solfege as boolean,
    transition: s.transition === null ? null : num('transition', 24, 96, true),
  };
  if (s.startingChords !== undefined && typeof s.startingChords !== 'boolean')
    throw new Error('Invalid starting chords setting.');
  result.startingChords = s.startingChords === undefined ? true : s.startingChords;
  if (result.low > result.high) throw new Error('The lowest note must be below the highest note.');
  return result;
}
export function generateExercise(input: unknown): Exercise {
  const spec = validateSpec(input);
  if (isVocalPattern(spec.pattern)) return generateVocalExercise(spec);
  const intervals: readonly number[] = PATTERNS[spec.pattern].intervals;
  const pitches: number[] = [];
  for (let midi = spec.low; midi <= spec.high; midi++)
    if (intervals.includes((midi - spec.key + 120) % 12)) pitches.push(midi);
  if (!pitches.length)
    throw new Error('This range has no notes in the selected key. Widen the range.');
  let phrase = [...pitches];
  if (spec.direction === 'down') phrase.reverse();
  const phraseBeats = phrase.length * spec.noteBeats;
  const notes: NoteEvent[] = [];
  const rounds: PracticeRound[] = [];
  for (let rep = 0; rep < spec.repetitions; rep++) {
    const start = spec.countIn + rep * (phraseBeats + spec.restBeats);
    rounds.push({
      id: rounds.length,
      midi: phrase[0],
      degree: (phrase[0] - spec.key + 120) % 12,
      onsetBeat: start,
      endBeat: start + phraseBeats,
    });
    phrase.forEach((midi, i) =>
      notes.push({
        id: notes.length,
        midi,
        onsetBeat: start + i * spec.noteBeats,
        durationBeats: spec.noteBeats * spec.gate,
        slotBeats: spec.noteBeats,
        repetition: rep + 1,
        degree: (midi - spec.key + 120) % 12,
      })
    );
  }
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > 600)
    throw new Error('Keep exercises under 10 minutes. Reduce repetitions, range, or note length.');
  return { spec, notes, totalBeats, phraseBeats, pitches, rounds };
}
function generateVocalExercise(spec: ExerciseSpec): Exercise {
  const rossini = spec.pattern === 'rossini';
  const span = vocalSpan(spec.pattern);
  const descending = !rossini && spec.direction === 'down';
  if (spec.high - spec.low < span)
    throw new Error(
      rossini
        ? 'Rossini Scale needs a range of at least an octave and a fifth (19 semitones).'
        : span === 12
          ? 'Octave Arpeggio needs a range of at least an octave (12 semitones).'
          : 'These vocal phrases need a range of at least seven semitones (a perfect fifth).'
    );
  const offsets =
    spec.pattern === 'fiveNote'
      ? descending
        ? [0, -2, -3, -5, -7, -5, -3, -2, 0]
        : PATTERNS.fiveNote.intervals
      : spec.pattern === 'octaveArpeggio'
        ? descending
          ? [0, -5, -8, -12, -8, -5, 0]
          : PATTERNS.octaveArpeggio.intervals
        : rossini
          ? PATTERNS.rossini.intervals
          : descending
            ? [0, -3, -7, -5, -3, -2, 0, -3, -7, -5, -3, -2, 0]
            : [0, 4, 7, 5, 4, 2, 0, 4, 7, 5, 4, 2, 0];
  const lengths =
    spec.pattern === 'arpeggio'
      ? [2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2]
      : offsets.map((_, index) => (index === offsets.length - 1 ? 2 : 1));
  const roots: number[] = [];
  if (descending) for (let root = spec.high; root >= spec.low + span; root--) roots.push(root);
  else for (let root = spec.low; root <= spec.high - span; root++) roots.push(root);
  const phraseLength =
    (lengths.reduce((sum, length) => sum + length, 0) + (spec.startingChords ? 6 : 0)) *
    spec.noteBeats;
  const phraseBeats = roots.length * phraseLength + (roots.length - 1) * spec.restBeats;
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > 600)
    throw new Error(
      'Keep exercises under 10 minutes. Reduce repetitions, range, rests, or note length.'
    );
  const notes: NoteEvent[] = [],
    guideNotes: NoteEvent[] = [];
  const rounds: PracticeRound[] = [];
  const add = (
    midi: number,
    onsetBeat: number,
    length: number,
    repetition: number,
    root: number,
    guide: boolean
  ) => {
    const n = {
      id: notes.length,
      midi,
      onsetBeat,
      durationBeats: length * spec.gate,
      slotBeats: length,
      repetition,
      degree: (midi - (descending ? root - span : root) + 120) % 12,
      velocity: guide ? 0.71 : 0.65,
    };
    notes.push(n);
    if (guide) guideNotes.push(n);
    return n;
  };
  for (let rep = 0; rep < spec.repetitions; rep++)
    roots.forEach((root, index) => {
      let beat =
        spec.countIn +
        rep * (phraseBeats + spec.restBeats) +
        index * (phraseLength + spec.restBeats);
      rounds.push({
        id: rounds.length,
        midi: root,
        degree: descending ? span % 12 : 0,
        onsetBeat: beat,
        endBeat: beat + phraseLength,
      });
      if (spec.startingChords) {
        const tonic = descending ? root - span : root;
        const approach = descending ? [-13, -1, 3, 6] : [-13, -6, -1, 3];
        const target = descending ? [-12, 0, 4, 7] : [-12, 0, 4];
        const approachNotes = approach.map((offset) =>
          add(tonic + offset, beat, 2 * spec.noteBeats, rep + 1, root, false)
        );
        guideNotes.push(approachNotes[approachNotes.length - 1]);
        beat += 2 * spec.noteBeats;
        const targetNotes = target.map((offset) =>
          add(tonic + offset, beat, 4 * spec.noteBeats, rep + 1, root, false)
        );
        guideNotes.push(targetNotes[targetNotes.length - 1]);
        beat += 4 * spec.noteBeats;
      }
      offsets.forEach((offset, i) => {
        add(root + offset, beat, lengths[i] * spec.noteBeats, rep + 1, root, true);
        beat += lengths[i] * spec.noteBeats;
      });
    });
  return {
    spec,
    notes,
    guideNotes,
    rounds,
    totalBeats,
    phraseBeats,
    pitches: [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b),
    title: rossini
      ? 'Rossini Scale'
      : `${PATTERNS[spec.pattern].name} (${descending ? 'Descending' : 'Ascending'})`,
  };
}
export function stateAt(exercise: Exercise, seconds: number): Scene {
  const beat = (Math.max(0, seconds) * exercise.spec.bpm) / 60;
  const { notes, spec, totalBeats } = exercise;
  const guide = exercise.guideNotes ?? notes;
  const progress = Math.min(1, beat / totalBeats);
  if (seconds < 0)
    return {
      beat: 0,
      note: guide[0],
      upcoming: guide.slice(1, 4),
      phase: 'ready',
      count: 0,
      repetition: 1,
      progress: 0,
    };
  if (beat >= totalBeats - 1e-9)
    return {
      beat,
      note: null,
      upcoming: [],
      phase: 'complete',
      count: 0,
      repetition: spec.repetitions,
      progress: 1,
    };
  if (beat < spec.countIn)
    return {
      beat,
      note: null,
      upcoming: guide.slice(0, 3),
      phase: 'countin',
      count: metronomeBeat(beat).number,
      repetition: 1,
      progress,
    };
  // A note remains visible for its full slot, including its articulation gap.
  // Keyboard/audio activity uses durationBeats separately.
  const note =
    guide.find((n) => n.onsetBeat <= beat + 1e-9 && beat < n.onsetBeat + n.slotBeats - 1e-9) ??
    null;
  const upcoming = guide.filter((n) => n.onsetBeat > beat + 1e-9).slice(0, 3);
  const repetition =
    note?.repetition ??
    Math.min(
      spec.repetitions,
      Math.floor((beat - spec.countIn) / (exercise.phraseBeats + spec.restBeats)) + 1
    );
  const restEnd = upcoming[0]?.onsetBeat ?? totalBeats;
  return {
    beat,
    note,
    upcoming,
    phase: note ? 'note' : 'rest',
    count: note ? 0 : Math.ceil(restEnd - beat),
    repetition,
    progress,
  };
}
export function solfege(degree: number) {
  return ['Do', 'Di', 'Re', 'Me', 'Mi', 'Fa', 'Fi', 'Sol', 'Le', 'La', 'Te', 'Ti'][degree];
}

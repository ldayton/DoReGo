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
  fifthGlide: {
    name: 'Fifth Glide',
    intervals: [0, 7, 0],
    description: 'A continuous cello glide up a fifth and back, moving one semitone per round.',
  },
  octaveGlide: {
    name: 'Octave Glide',
    intervals: [0, 12, 0],
    description: 'A continuous cello glide up an octave and back, moving one semitone per round.',
  },
} as const;
export type Pattern = keyof typeof PATTERNS;
export function isGlidePattern(pattern: Pattern) {
  return pattern === 'fifthGlide' || pattern === 'octaveGlide';
}
export function isVocalPattern(pattern: Pattern) {
  return pattern !== 'major';
}
export function vocalSpan(pattern: Pattern) {
  return pattern === 'rossini'
    ? 19
    : pattern === 'octaveArpeggio' || pattern === 'octaveGlide'
      ? 12
      : 7;
}
export type Direction = 'up' | 'down' | 'both';
export function directionName(direction: Direction) {
  return direction === 'both'
    ? 'Ascending & Descending'
    : direction === 'down'
      ? 'Descending'
      : 'Ascending';
}
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
  glideSpan?: number;
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
  pattern: 'arpeggio',
  key: 4,
  low: 52,
  high: 76,
  direction: 'up',
  bpm: 150,
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
  if (!['up', 'down', 'both'].includes(String(s.direction))) throw new Error('Choose a direction.');
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
    bpm: num('bpm', 60, 240),
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
export function generateExercise(input: unknown, maxDuration = 600): Exercise {
  const spec = validateSpec(input);
  if (spec.direction === 'both' && isVocalPattern(spec.pattern))
    return generateBidirectionalExercise(spec, maxDuration);
  if (isGlidePattern(spec.pattern)) return generateGlideExercise(spec, maxDuration);
  if (isVocalPattern(spec.pattern)) return generateVocalExercise(spec, maxDuration);
  const intervals: readonly number[] = PATTERNS[spec.pattern].intervals;
  const pitches: number[] = [];
  for (let midi = spec.low; midi <= spec.high; midi++)
    if (intervals.includes((midi - spec.key + 120) % 12)) pitches.push(midi);
  if (!pitches.length)
    throw new Error('This range has no notes in the selected key. Widen the range.');
  let phrase = [...pitches];
  if (spec.direction === 'down') phrase.reverse();
  else if (spec.direction === 'both') phrase.push(...pitches.slice(0, -1).reverse());
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
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
    throw new Error('Keep exercises under 10 minutes. Reduce repetitions, range, or note length.');
  return { spec, notes, totalBeats, phraseBeats, pitches, rounds };
}
const GLIDE_HOLD_BEATS = 2;
const GLIDE_SLIDE_BEATS = 4;
export const GLIDE_BEATS = 3 * GLIDE_HOLD_BEATS + 2 * GLIDE_SLIDE_BEATS;
export function glideOffset(progress: number, span: number) {
  const beat =
    Math.max(0, Math.min(1, progress)) *
    (span < 0 ? 2 * GLIDE_HOLD_BEATS + GLIDE_SLIDE_BEATS : GLIDE_BEATS);
  const ease = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
  if (beat < 2) return 0;
  if (beat < 6) return span * ease((beat - 2) / GLIDE_SLIDE_BEATS);
  if (span < 0 || beat < 8) return span;
  if (beat < 12) return span * (1 - ease((beat - 8) / GLIDE_SLIDE_BEATS));
  return 0;
}
// Share the same piano voicings, timing and guide notes across vocal exercises.
function addStartingChords(
  tonic: number,
  beat: number,
  noteBeats: number,
  descending: boolean,
  add: (midi: number, onset: number, length: number) => NoteEvent,
  guideNotes: NoteEvent[]
) {
  const approach = descending ? [-13, -1, 3, 6] : [-13, -6, -1, 3];
  const target = descending ? [-12, 0, 4, 7] : [-12, 0, 4];
  const approachNotes = approach.map((offset) => add(tonic + offset, beat, 2 * noteBeats));
  guideNotes.push(approachNotes[approachNotes.length - 1]);
  beat += 2 * noteBeats;
  const targetNotes = target.map((offset) => add(tonic + offset, beat, 4 * noteBeats));
  guideNotes.push(targetNotes[targetNotes.length - 1]);
  return beat + 4 * noteBeats;
}
export function notePitchAt(note: NoteEvent, beat: number) {
  return (
    note.midi +
    (note.glideSpan ? glideOffset((beat - note.onsetBeat) / note.slotBeats, note.glideSpan) : 0)
  );
}
function generateGlideExercise(spec: ExerciseSpec, maxDuration: number): Exercise {
  const span = vocalSpan(spec.pattern);
  if (spec.high - spec.low < span)
    throw new Error(
      `${PATTERNS[spec.pattern].name} needs a range of at least ${span === 12 ? 'an octave' : 'a perfect fifth'}.`
    );
  const descending = spec.direction === 'down';
  const roots = Array.from({ length: spec.high - spec.low - span + 1 }, (_, i) =>
    descending ? spec.high - i : spec.low + i
  );
  const cueBeats = spec.startingChords ? 6 * spec.noteBeats : 0;
  const glideBeats =
    (descending ? 2 * GLIDE_HOLD_BEATS + GLIDE_SLIDE_BEATS : GLIDE_BEATS) * spec.noteBeats;
  const phraseLength = cueBeats + glideBeats;
  const phraseBeats = roots.length * phraseLength + (roots.length - 1) * spec.restBeats;
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
    throw new Error('Keep exercises under 10 minutes. Reduce repetitions, range, or rests.');
  const notes: NoteEvent[] = [],
    rounds: PracticeRound[] = [],
    guideNotes: NoteEvent[] = [];
  for (let rep = 0; rep < spec.repetitions; rep++)
    roots.forEach((root, index) => {
      const beat =
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
      if (spec.startingChords)
        addStartingChords(
          descending ? root - span : root,
          beat,
          spec.noteBeats,
          descending,
          (midi, onsetBeat, length) => {
            const note: NoteEvent = {
              id: notes.length,
              midi,
              onsetBeat,
              durationBeats: length * spec.gate,
              slotBeats: length,
              repetition: rep + 1,
              degree: (midi - (descending ? root - span : root) + 120) % 12,
              velocity: 0.65,
            };
            notes.push(note);
            return note;
          },
          guideNotes
        );
      notes.push({
        id: notes.length,
        midi: root,
        degree: descending ? span % 12 : 0,
        onsetBeat: beat + cueBeats,
        durationBeats: glideBeats,
        slotBeats: glideBeats,
        repetition: rep + 1,
        velocity: 0.8,
        glideSpan: descending ? -span : span,
      });
      guideNotes.push(notes[notes.length - 1]);
    });
  return {
    spec,
    notes,
    guideNotes,
    rounds,
    totalBeats,
    phraseBeats,
    pitches: [
      ...new Set(notes.flatMap((note) => [note.midi, note.midi + (note.glideSpan ?? 0)])),
    ].sort((a, b) => a - b),
    title: `${PATTERNS[spec.pattern].name} (${directionName(spec.direction)})`,
  };
}
function generateBidirectionalExercise(spec: ExerciseSpec, maxDuration: number): Exercise {
  const generateLeg = isGlidePattern(spec.pattern) ? generateGlideExercise : generateVocalExercise;
  const up = generateLeg({ ...spec, direction: 'up', countIn: 0, repetitions: 1 }, Infinity);
  const down = generateLeg({ ...spec, direction: 'down', countIn: 0, repetitions: 1 }, Infinity);
  // The top key has just been practiced on the ascending leg. Start the
  // descending leg one key lower, except when the range permits only one key.
  const downStart = down.rounds.length > 1 ? down.rounds[1].onsetBeat : 0;
  const phraseBeats = up.totalBeats + spec.restBeats + down.totalBeats - downStart;
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
    throw new Error(
      'Keep exercises under 10 minutes. Reduce repetitions, range, rests, or note length.'
    );
  const notes: NoteEvent[] = [],
    guideNotes: NoteEvent[] = [],
    rounds: PracticeRound[] = [];
  for (let rep = 0; rep < spec.repetitions; rep++) {
    const start = spec.countIn + rep * (phraseBeats + spec.restBeats);
    for (const [leg, trim, shift] of [
      [up, 0, start],
      [down, downStart, start + up.totalBeats + spec.restBeats - downStart],
    ] as const) {
      const guide = new Set(leg.guideNotes!.map((n) => n.id));
      for (const note of leg.notes) {
        if (note.onsetBeat < trim) continue;
        const copy = {
          ...note,
          id: notes.length,
          onsetBeat: note.onsetBeat + shift,
          repetition: rep + 1,
        };
        notes.push(copy);
        if (guide.has(note.id)) guideNotes.push(copy);
      }
      for (const round of leg.rounds)
        if (round.onsetBeat >= trim)
          rounds.push({
            ...round,
            id: rounds.length,
            onsetBeat: round.onsetBeat + shift,
            endBeat: round.endBeat + shift,
          });
    }
  }
  return {
    spec,
    notes,
    guideNotes,
    rounds,
    totalBeats,
    phraseBeats,
    pitches: [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b),
    title: `${PATTERNS[spec.pattern].name} (${directionName('both')})`,
  };
}
function generateVocalExercise(spec: ExerciseSpec, maxDuration: number): Exercise {
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
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
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
        beat = addStartingChords(
          descending ? root - span : root,
          beat,
          spec.noteBeats,
          descending,
          (midi, onset, length) => add(midi, onset, length, rep + 1, root, false),
          guideNotes
        );
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

import { noteName, PATTERNS, solfege, stateAt, type Exercise } from './music';

const C = {
  paper: '#faf9f4',
  ink: '#29382b',
  muted: '#82877a',
  line: '#e5e7dd',
  green: '#d9eb9b',
  accent: '#ec8052',
  white: '#ffffff',
};
export const WIDTH = 1600;
export const HEIGHT = 900;
function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = C.ink,
  weight = 500,
  align: CanvasTextAlign = 'center'
) {
  ctx.font = `${weight} ${size}px Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}
export function drawExercise(canvas: HTMLCanvasElement, exercise: Exercise, seconds: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  const { spec, notes } = exercise;
  const scene = stateAt(exercise, seconds);
  const sounding = new Set(
    notes
      .filter((n) => n.onsetBeat <= scene.beat && scene.beat < n.onsetBeat + n.durationBeats)
      .map((n) => n.midi)
  );
  if (scene.phase === 'ready') {
    sounding.clear();
    for (const n of notes) if (n.onsetBeat === notes[0].onsetBeat) sounding.add(n.midi);
  }
  ctx.save();
  ctx.scale(canvas.width / WIDTH, canvas.height / HEIGHT);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = '#eef0e7';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < HEIGHT; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  // Soft opaque reading area keeps the note visually quiet.
  ctx.fillStyle = C.paper;
  ctx.fillRect(340, 130, 920, 420);
  text(ctx, 'DO RE GO', 65, 56, 21, C.ink, 700, 'left');
  text(
    ctx,
    `${exercise.title ?? PATTERNS[spec.pattern].name}  /  ${spec.bpm} BPM`,
    WIDTH - 65,
    56,
    20,
    C.muted,
    500,
    'right'
  );
  const labels = {
    ready: 'MAKE A LITTLE ROOM FOR YOUR VOICE',
    countin: `${Math.ceil(spec.countIn / 4)}-BAR COUNT-IN`,
    note: exercise.title ? 'FOLLOW THE GUIDE' : `ROUND ${scene.repetition} OF ${spec.repetitions}`,
    rest: 'BREATHE & RESET',
    complete: 'NICELY DONE. TAKE A BREATH.',
  };
  text(ctx, labels[scene.phase], 800, 155, 19, C.muted, 600);
  if (scene.phase === 'countin') {
    const currentBeat = Math.floor(scene.beat),
      currentBar = Math.floor(currentBeat / 4);
    const bars = Math.ceil(spec.countIn / 4);
    text(ctx, String(scene.count), 800, 295, 174, scene.count === 1 ? C.accent : C.ink, 500);
    text(ctx, `BAR ${currentBar + 1} OF ${bars} · 4/4`, 800, 399, 22, C.muted, 500);
    const cardWidth = 264,
      gap = 20,
      left = 800 - (bars * cardWidth + (bars - 1) * gap) / 2;
    for (let bar = 0; bar < bars; bar++) {
      const x = left + bar * (cardWidth + gap),
        active = bar === currentBar,
        complete = bar < currentBar;
      rounded(
        ctx,
        x,
        432,
        cardWidth,
        88,
        14,
        active ? '#edf1e3' : C.paper,
        active ? '#acbf86' : C.line
      );
      text(
        ctx,
        `BAR ${bar + 1}${complete ? ' · DONE' : active ? ' · NOW' : ''}`,
        x + cardWidth / 2,
        452,
        15,
        active ? C.ink : C.muted,
        600
      );
      const beats = Math.min(4, spec.countIn - bar * 4);
      for (let beat = 0; beat < beats; beat++) {
        const absoluteBeat = bar * 4 + beat,
          now = absoluteBeat === currentBeat,
          past = absoluteBeat < currentBeat;
        const cx = x + cardWidth / 2 + (beat - (beats - 1) / 2) * 48;
        const pulse = now ? 1 - (scene.beat - currentBeat) : 0;
        ctx.beginPath();
        ctx.arc(cx, 488, 15 + 3 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = now ? C.accent : past ? C.green : '#e5e8dd';
        ctx.fill();
        if (beat === 0) {
          ctx.strokeStyle = active ? C.accent : '#b6c59a';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        text(
          ctx,
          String(beat + 1),
          cx,
          488,
          16,
          now ? C.white : past ? C.ink : C.muted,
          now ? 700 : 500
        );
      }
    }
  } else if (scene.note) {
    const label = spec.solfege
      ? solfege(scene.note.degree)
      : noteName(scene.note.midi, spec.key).slice(0, -1);
    text(ctx, label, spec.solfege ? 800 : 778, 325, label.length > 2 ? 158 : 190, C.ink, 500);
    if (!spec.solfege)
      text(
        ctx,
        String(Math.floor(scene.note.midi / 12) - 1),
        800 + (label.length > 1 ? 128 : 95),
        365,
        48,
        C.muted,
        400
      );
    const sub = exercise.title
      ? sounding.size > 1
        ? [...sounding]
            .sort((a, b) => a - b)
            .map((n) => noteName(n, spec.key))
            .join(' · ')
        : 'Guide note'
      : spec.solfege
        ? noteName(scene.note.midi, spec.key)
        : [
            'tonic',
            'raised tonic',
            'second',
            'minor third',
            'major third',
            'fourth',
            'raised fourth',
            'fifth',
            'minor sixth',
            'sixth',
            'minor seventh',
            'major seventh',
          ][scene.note.degree];
    text(ctx, sub, 800, 445, 24, C.muted, 400);
    if (scene.phase !== 'ready') {
      rounded(ctx, 650, 492, 300, 4, 2, C.line);
      rounded(
        ctx,
        650,
        492,
        300 * Math.min(1, Math.max(0, (scene.beat - scene.note.onsetBeat) / scene.note.slotBeats)),
        4,
        2,
        C.accent
      );
    } else if (spec.countIn)
      text(
        ctx,
        `${spec.countIn % 4 === 0 ? `${spec.countIn / 4}-bar` : `${spec.countIn}-beat`} count-in · then follow the guide`,
        800,
        496,
        18,
        C.muted,
        400
      );
  } else {
    text(
      ctx,
      scene.phase === 'complete' ? '✓' : '—',
      800,
      318,
      150,
      scene.phase === 'complete' ? '#779c40' : C.muted,
      400
    );
    text(
      ctx,
      scene.phase === 'rest'
        ? `Next round in ${scene.count}`
        : 'Your voice, a little more at home.',
      800,
      445,
      25,
      C.muted,
      400
    );
  }
  // Upcoming note names are derived directly from sequence position.
  if (scene.upcoming.length) {
    text(ctx, 'UP NEXT', 580, 555, 16, C.muted, 600, 'right');
    scene.upcoming.forEach((n, i) => {
      rounded(ctx, 610 + i * 130, 530, 112, 50, 25, i === 0 ? '#edf1e3' : '#f2f3ec');
      text(
        ctx,
        spec.solfege ? solfege(n.degree) : noteName(n.midi, spec.key),
        666 + i * 130,
        555,
        22,
        i === 0 ? C.ink : C.muted
      );
    });
  }
  // Include a small amount of context around the configured range.
  let low = Math.max(0, Math.min(spec.low - 2, ...exercise.pitches)),
    high = Math.min(108, spec.high + 2);
  while ([1, 3, 6, 8, 10].includes(low % 12)) low--;
  while ([1, 3, 6, 8, 10].includes(high % 12)) high++;
  const whites: number[] = [];
  for (let n = low; n <= high; n++) if (![1, 3, 6, 8, 10].includes(n % 12)) whites.push(n);
  const width = Math.min(1300, whites.length * 91),
    x0 = (WIDTH - width) / 2,
    keyW = width / whites.length,
    y0 = 637,
    keyH = 170;
  rounded(ctx, x0 - 8, y0 - 8, width + 16, keyH + 16, 16, '#dde1d6');
  for (const [i, n] of whites.entries()) {
    const active = sounding.has(n);
    const inRange = n >= spec.low && n <= spec.high;
    rounded(
      ctx,
      x0 + i * keyW + 1,
      y0,
      keyW - 2,
      keyH,
      7,
      active ? C.green : inRange ? C.white : '#f1f2eb',
      '#dce0d4'
    );
    if (n % 12 === 0 || active)
      text(
        ctx,
        noteName(n, spec.key),
        x0 + (i + 0.5) * keyW,
        y0 + keyH - 25,
        Math.min(18, keyW * 0.3),
        active ? C.ink : C.muted,
        active ? 700 : 400
      );
  }
  for (let n = low; n <= high; n++) {
    if (![1, 3, 6, 8, 10].includes(n % 12)) continue;
    const prevIndex = whites.indexOf(n - 1);
    if (prevIndex < 0) continue;
    const active = sounding.has(n);
    rounded(
      ctx,
      x0 + (prevIndex + 1) * keyW - keyW * 0.3,
      y0,
      keyW * 0.6,
      keyH * 0.61,
      5,
      active ? '#a8c769' : C.ink
    );
  }
  if (spec.transition !== null && spec.transition >= low && spec.transition <= high) {
    let index = whites.indexOf(spec.transition);
    const black = index < 0;
    if (black) index = whites.indexOf(spec.transition - 1);
    const x = x0 + (index + (black ? 1 : 0.5)) * keyW;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y0 - 25);
    ctx.lineTo(x, y0 + keyH + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, 'YOUR TRANSITION', x, y0 - 42, 14, C.accent, 600);
  }
  text(
    ctx,
    `${noteName(spec.low, spec.key)} — ${noteName(spec.high, spec.key)}`,
    65,
    858,
    17,
    C.muted,
    500,
    'left'
  );
  text(ctx, 'a little practice, a little progress', 800, 858, 17, C.muted, 400);
  text(
    ctx,
    `${Math.min(notes.length, scene.note ? scene.note.id + 1 : scene.phase === 'complete' ? notes.length : notes.filter((n) => n.onsetBeat < scene.beat).length)} / ${notes.length} notes`,
    WIDTH - 65,
    858,
    17,
    C.muted,
    500,
    'right'
  );
  ctx.restore();
}

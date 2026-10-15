import {
  noteName,
  PATTERNS,
  solfege,
  stateAt,
  practiceAt,
  type PracticeRound,
  type Exercise,
} from './music';

import { keyboardView, whiteKeyPosition, vocalPhraseNotes } from './keyboard-layout';

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
export const MOBILE_HEIGHT = 1600;
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
export function drawExercise(
  canvas: HTMLCanvasElement,
  exercise: Exercise,
  seconds: number,
  mobile = false,
  reducedMotion = false
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  const { spec, notes } = exercise;
  const scene = stateAt(exercise, seconds);
  const practice = practiceAt(exercise, seconds);
  const keyboardNotes = mobile ? vocalPhraseNotes(exercise, practice.current) : notes;
  const sounding = new Set(
    keyboardNotes
      .filter((n) => n.onsetBeat <= scene.beat && scene.beat < n.onsetBeat + n.durationBeats)
      .map((n) => n.midi)
  );
  if (scene.phase === 'ready') {
    sounding.clear();
    for (const n of keyboardNotes)
      if (n.onsetBeat === keyboardNotes[0].onsetBeat) sounding.add(n.midi);
  }
  ctx.save();
  ctx.scale(canvas.width / WIDTH, canvas.height / (mobile ? MOBILE_HEIGHT : HEIGHT));
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, WIDTH, mobile ? MOBILE_HEIGHT : HEIGHT);
  ctx.strokeStyle = '#eef0e7';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mobile ? MOBILE_HEIGHT : HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < (mobile ? MOBILE_HEIGHT : HEIGHT); y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  // Soft opaque reading area keeps the note visually quiet.
  ctx.fillStyle = C.paper;
  ctx.fillRect(340, 130, 920, 420);
  text(ctx, 'DO RE GO', 65, 56, mobile ? 32 : 21, C.ink, 700, 'left');
  text(
    ctx,
    `${exercise.title ?? PATTERNS[spec.pattern].name}  /  ${spec.bpm} BPM`,
    WIDTH - 65,
    56,
    mobile ? 30 : 20,
    C.muted,
    500,
    'right'
  );
  const labels = {
    ready: 'READY',
    countin: `${Math.ceil(spec.countIn / 4)}-BAR COUNT-IN`,
    note: `ROUND ${practice.current.id + 1} OF ${exercise.rounds.length}`,
    rest: 'REST',
    complete: 'COMPLETE',
  };
  text(ctx, labels[scene.phase], 800, 155, mobile ? 34 : 19, C.muted, 600);
  if (scene.phase === 'countin') {
    const currentBeat = Math.floor(scene.beat),
      currentBar = Math.floor(currentBeat / 4);
    const bars = Math.ceil(spec.countIn / 4);
    text(
      ctx,
      String(scene.count),
      800,
      mobile ? 365 : 295,
      mobile ? 260 : 174,
      scene.count === 1 ? C.accent : C.ink,
      500
    );
    text(
      ctx,
      `BAR ${currentBar + 1} OF ${bars} · 4/4`,
      800,
      mobile ? 510 : 399,
      mobile ? 34 : 22,
      C.muted,
      500
    );
    const cardWidth = mobile ? 540 : 264,
      gap = mobile ? 40 : 20,
      left = 800 - (bars * cardWidth + (bars - 1) * gap) / 2;
    for (let bar = 0; bar < bars; bar++) {
      const x = left + bar * (cardWidth + gap),
        active = bar === currentBar,
        complete = bar < currentBar;
      rounded(
        ctx,
        x,
        mobile ? 565 : 432,
        cardWidth,
        mobile ? 145 : 88,
        14,
        active ? '#edf1e3' : C.paper,
        active ? '#acbf86' : C.line
      );
      text(
        ctx,
        `BAR ${bar + 1}${complete ? ' · DONE' : active ? ' · NOW' : ''}`,
        x + cardWidth / 2,
        mobile ? 601 : 452,
        mobile ? 26 : 15,
        active ? C.ink : C.muted,
        600
      );
      const beats = Math.min(4, spec.countIn - bar * 4);
      for (let beat = 0; beat < beats; beat++) {
        const absoluteBeat = bar * 4 + beat,
          now = absoluteBeat === currentBeat,
          past = absoluteBeat < currentBeat;
        const cx = x + cardWidth / 2 + (beat - (beats - 1) / 2) * (mobile ? 96 : 48);
        const pulse = now ? 1 - (scene.beat - currentBeat) : 0;
        ctx.beginPath();
        ctx.arc(cx, mobile ? 660 : 488, (mobile ? 26 : 15) + 3 * pulse, 0, Math.PI * 2);
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
          mobile ? 660 : 488,
          mobile ? 28 : 16,
          now ? C.white : past ? C.ink : C.muted,
          now ? 700 : 500
        );
      }
    }
  } else if (scene.phase === 'complete') {
    text(ctx, '✓', 800, mobile ? 400 : 325, mobile ? 260 : 150, '#779c40', 400);
  }
  // Practice targets are stable for the whole round, independent of sounding notes.
  const compact = scene.phase === 'countin';
  const drawTarget = (round: PracticeRound | null, title: string, x: number, primary: boolean) => {
    const y = mobile ? (compact ? 825 : 410) : compact ? 557 : 335;
    text(
      ctx,
      title,
      x,
      mobile ? (compact ? 770 : 280) : compact ? 531 : 225,
      mobile ? (compact ? 26 : 36) : compact ? 14 : 20,
      C.muted,
      600
    );
    const label = round
      ? spec.solfege
        ? solfege(round.degree)
        : noteName(round.midi, spec.key)
      : '—';
    text(
      ctx,
      label,
      x,
      y,
      mobile ? (compact ? 48 : primary ? 250 : 180) : compact ? 28 : primary ? 148 : 94,
      primary ? C.ink : C.muted,
      500
    );
    if (round && spec.solfege && !compact)
      text(ctx, noteName(round.midi, spec.key), x, 440, 26, C.muted, 400);
  };
  if (scene.phase !== 'complete') {
    drawTarget(practice.current, 'CURRENT', compact ? 680 : mobile ? 520 : 650, true);
    drawTarget(practice.next, 'NEXT', compact ? 920 : mobile ? 1120 : 1080, false);
    if (!compact) {
      rounded(ctx, 495, mobile ? 600 : 488, 310, 4, 2, C.line);
      rounded(ctx, 495, mobile ? 600 : 488, 310 * practice.progress, 4, 2, C.accent);
      if (scene.phase === 'ready' && spec.countIn)
        text(
          ctx,
          `${spec.countIn % 4 === 0 ? `${spec.countIn / 4}-bar` : `${spec.countIn}-beat`} count-in`,
          800,
          mobile ? 720 : 558,
          mobile ? 32 : 19,
          C.muted,
          400
        );
      if (scene.phase === 'rest')
        text(
          ctx,
          `Next round in ${scene.count}`,
          800,
          mobile ? 720 : 558,
          mobile ? 34 : 22,
          C.muted,
          400
        );
    }
  }
  const { low, high, left, count } = keyboardView(exercise, seconds, mobile, reducedMotion);
  const whites: number[] = [];
  for (let n = low; n <= high; n++) if (![1, 3, 6, 8, 10].includes(n % 12)) whites.push(n);
  const width = mobile ? 1480 : Math.min(1300, count * 91),
    x0 = (WIDTH - width) / 2,
    keyW = width / count,
    y0 = mobile ? 930 : 637,
    keyH = mobile ? 500 : 170;
  rounded(ctx, x0 - 8, y0 - 8, width + 16, keyH + 16, 16, '#dde1d6');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, width, keyH);
  ctx.clip();
  for (const n of whites) {
    const i = whiteKeyPosition(n) - left;
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
        y0 + keyH - (mobile ? 48 : 25),
        Math.min(mobile ? 42 : 18, keyW * (mobile ? 0.48 : 0.3)),
        active ? C.ink : C.muted,
        active ? 700 : 400
      );
  }
  for (let n = low; n <= high; n++) {
    if (![1, 3, 6, 8, 10].includes(n % 12)) continue;
    const prevIndex = whiteKeyPosition(n - 1) - left;
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
  ctx.restore();
  if (spec.transition !== null && spec.transition >= low && spec.transition <= high) {
    const black = [1, 3, 6, 8, 10].includes(spec.transition % 12);
    const index = whiteKeyPosition(spec.transition) - left;
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
    mobile ? 1530 : 858,
    mobile ? 30 : 17,
    C.muted,
    500,
    'left'
  );
  text(
    ctx,
    `${Math.min(notes.length, scene.note ? scene.note.id + 1 : scene.phase === 'complete' ? notes.length : notes.filter((n) => n.onsetBeat < scene.beat).length)} / ${notes.length} notes`,
    WIDTH - (mobile ? 180 : 65),
    mobile ? 1530 : 858,
    mobile ? 30 : 17,
    C.muted,
    500,
    'right'
  );
  ctx.restore();
}

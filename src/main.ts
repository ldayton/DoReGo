import {
  createIcons,
  Play,
  Pause,
  RotateCcw,
  Download,
  ArrowUpRight,
  ChevronDown,
  Plus,
  Minus,
  Maximize2,
  Music2,
  SlidersHorizontal,
  X,
  Check,
  Bookmark,
  Volume2,
  ArrowRight,
} from 'lucide';
import {
  DEFAULT_SPEC,
  isVocalPattern,
  PATTERNS,
  SHARPS,
  generateExercise,
  noteName,
  secondsAt,
  formatTime,
  stateAt,
  type ExerciseSpec,
} from './music';
import { Player, RELEASE_TAIL } from './audio';
import { drawExercise, WIDTH, HEIGHT } from './render';
import { exportMidi } from './midi';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const icons = {
  Play,
  Pause,
  RotateCcw,
  Download,
  ArrowUpRight,
  ChevronDown,
  Plus,
  Minus,
  Maximize2,
  Music2,
  SlidersHorizontal,
  X,
  Check,
  Bookmark,
  Volume2,
  ArrowRight,
};
function iconify() {
  createIcons({ icons, attrs: { 'stroke-width': 1.7 } });
}
function savedSpec(): ExerciseSpec {
  try {
    return restoreSpec(JSON.parse(localStorage.getItem('dorego.current') || 'null'));
  } catch {
    return { ...DEFAULT_SPEC };
  }
}
// Upgrade the previous default once; later explicit one-bar choices remain intact.
try {
  if (localStorage.getItem('dorego.countInVersion') !== '2') {
    const current = JSON.parse(localStorage.getItem('dorego.current') || 'null');
    if (current?.countIn === 4) {
      current.countIn = 8;
      localStorage.setItem('dorego.current', JSON.stringify(current));
    }
    const presets = JSON.parse(localStorage.getItem('dorego.presets') || '[]');
    if (Array.isArray(presets)) {
      for (const preset of presets) if (preset?.spec?.countIn === 4) preset.spec.countIn = 8;
      localStorage.setItem('dorego.presets', JSON.stringify(presets));
    }
    localStorage.setItem('dorego.countInVersion', '2');
  }
} catch {
  /* Storage is optional. */
}
let spec = savedSpec();
let exercise = generateExercise(spec);
let mode: 'ready' | 'playing' | 'paused' | 'complete' = 'ready';
let position = 0;
let raf = 0;
const player = new Player();
let jobId: string | null = null;
let exportActive = false;
let exportGeneration = 0;
let pollTimer: ReturnType<typeof setTimeout>;
const PRESETS: Record<string, Partial<ExerciseSpec>> = {
  Arpeggio: { pattern: 'arpeggio', direction: 'up' },
  'Major Scale': { pattern: 'major', direction: 'up' },
};
function restoreSpec(input: unknown): ExerciseSpec {
  if (!input || typeof input !== 'object') throw new Error('Invalid saved exercise.');
  const saved = { ...input } as Record<string, unknown>;
  if (saved.pattern === 'strawDescending') {
    saved.pattern = 'arpeggio';
    saved.direction = 'down';
  } else if (saved.pattern === 'vocalArpeggios' || saved.pattern === 'minorArpeggio')
    saved.pattern = 'arpeggio';
  else if (['minor', 'pentatonic', 'fiveTone', 'chromatic'].includes(String(saved.pattern)))
    saved.pattern = 'major';
  if (saved.direction === 'updown') saved.direction = 'up';
  return generateExercise(saved).spec;
}

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="/" aria-label="DoReGo home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>DoReGo<span class="brand-dot">.</span></a>
    <span class="header-note">A little practice. A little progress.</span>
    <button class="quiet-button" id="how-button">How it works <i data-lucide="arrow-up-right"></i></button>
  </header>
  <main>
    <section class="intro"><div><p class="eyebrow"><span class="live-dot"></span> YOUR DAILY DOSE OF DO · RE · MI</p><h1>Find your next note.</h1><p class="intro-copy">A warm-up that moves with you. Make it yours, then sing along.</p></div><span class="intro-sketch" aria-hidden="true">♪<span>let’s make<br>some room.</span></span></section>
    <div class="studio">
      <aside class="settings" aria-label="Exercise settings">
        <div class="panel-heading"><h2>Your exercise</h2><i data-lucide="sliders-horizontal"></i></div>
        <form id="exercise-form">
          <label class="field">Exercise<select name="pattern" id="pattern">${Object.entries(
            PATTERNS
          )
            .map(([id, p]) => `<option value="${id}">${p.name}</option>`)
            .join('')}</select></label>
          <p id="vocal-help" class="field-hint" hidden>Generates the vocal phrase at each semitone in your range. Rounds repeat the full sweep; rests separate phrases.</p>
          <div class="field-row"><label class="field">Key<select name="key" id="key">${SHARPS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label><label class="field">Direction<select name="direction" id="direction"><option value="up">Ascending</option><option value="down">Descending</option></select></label></div>
          <div class="range-label"><span>Vocal range</span><span class="range-actions"><button type="button" id="transpose-down" title="Move range and key down one semitone" aria-label="Transpose down one semitone"><i data-lucide="minus"></i></button><button type="button" id="transpose-up" title="Move range and key up one semitone" aria-label="Transpose up one semitone"><i data-lucide="plus"></i></button></span></div>
          <div class="field-row"><label class="field small-label">Lowest note<select name="low" id="low"></select></label><span class="range-dash">—</span><label class="field small-label">Highest note<select name="high" id="high"></select></label></div>
          <div class="tempo-label"><label for="bpm">Tempo</label><span><input name="bpm" id="bpm" type="number" min="30" max="240" step="1" aria-label="Tempo in beats per minute"/><span>BPM</span></span></div>
          <input id="tempo-slider" type="range" min="30" max="240" step="1" aria-label="Tempo slider" />
          <div class="slider-labels"><span>Take it slow</span><span>Pick it up</span></div>
          <details class="more-settings"><summary>Make it your own <i data-lucide="chevron-down"></i></summary><div class="advanced"><label id="starting-chords-field" class="toggle-row" hidden><span>Starting-note chords</span><input name="startingChords" id="startingChords" type="checkbox" role="switch" checked /></label>
            <div class="field-row"><label class="field">Rounds<input name="repetitions" id="repetitions" type="number" min="1" max="16" step="1" /></label><label class="field">Rest (beats)<input name="restBeats" id="restBeats" type="number" min="0" max="16" step="1" /></label></div>
            <div class="field-row"><label class="field">Count-in<select name="countIn" id="countIn"><option value="0">None</option><option value="2">½ bar (2 beats)</option><option value="4">1 bar (4 beats)</option><option value="8">2 bars (8 beats)</option></select></label><label class="field">Note length<select name="noteBeats" id="noteBeats"><option value="0.25">¼ beat</option><option value="0.5">½ beat</option><option value="1">1 beat</option><option value="2">½ bar (2 beats)</option><option value="4">1 bar (4 beats)</option></select></label></div>
            <label class="field">Articulation<select name="gate" id="gate"><option value="0.65">Detached</option><option value="0.88">Natural</option><option value="1">Connected</option></select></label>
            <label class="field">Guide sound<select name="voice" id="voice"><option value="piano">Steinway Grand</option><option value="soft">Soft sine</option><option value="bright">Bright triangle</option></select></label>
            <label class="field">Guide volume <span class="volume-row"><i data-lucide="volume-2"></i><input name="volume" id="volume" type="range" min="-36" max="0" step="1" /></span></label>
            <label class="toggle-row"><span>Metronome throughout</span><input name="metronome" id="metronome" type="checkbox" role="switch" /></label>
            <label class="toggle-row"><span>Movable-do syllables</span><input name="solfege" id="solfege" type="checkbox" role="switch" /></label>
            <label class="field">Personal transition marker<select name="transition" id="transition"><option value="">Off</option></select><span class="field-hint">Optional visual reference for your own register transition.</span></label>
          </div></details>
          <p id="form-error" class="error-message" role="alert" hidden></p>
        </form>
        <div class="preset-footer"><button class="quiet-button" id="save-preset"><i data-lucide="bookmark"></i> Save preset</button><select id="saved-presets" aria-label="Load or delete a saved preset"><option value="">My presets</option></select><button id="delete-preset" class="icon-button" aria-label="Delete selected preset" title="Delete selected preset" disabled><i data-lucide="x"></i></button></div>
      </aside>
      <section class="workspace" aria-label="Practice studio">
        <div class="exercise-heading"><div><span class="eyebrow muted">THE PRACTICE ROOM</span><h2 id="exercise-title"></h2></div><span class="session-tag"><span class="live-dot"></span><span id="session-status">Ready when you are</span></span></div>
        <div class="practice-card" id="practice-card"><canvas id="stage" width="1600" height="900" aria-label="Exercise note and piano keyboard" role="img"></canvas><button class="fullscreen-button" id="fullscreen" aria-label="Enter fullscreen practice" title="Fullscreen practice"><i data-lucide="maximize-2"></i></button><span class="sr-only" id="note-announcement" aria-live="polite"></span></div>
        <div class="transport"><div class="transport-buttons"><button id="restart" class="icon-button" title="Restart exercise" aria-label="Restart exercise"><i data-lucide="rotate-ccw"></i></button><button id="play" class="play-button"><i data-lucide="play"></i><span>Let’s sing</span></button></div><div class="scrubber"><label for="position" class="sr-only">Playback position</label><input id="position" type="range" min="0" max="100" step="0.01" value="0"/><div class="time-labels"><span id="elapsed">0:00</span><span id="duration">0:00</span></div></div><span class="shortcut"><kbd>space</kbd> to play</span></div>
        <div class="below-player"><p id="exercise-summary"></p><span>Made for your voice <span class="tiny-star">✳</span></span></div>
        <div class="export-card"><div class="export-icon"><i data-lucide="music-2"></i></div><div class="export-copy"><h3>Take your practice with you.</h3><p>MIDI for your music tools. A video to sing along anywhere.</p></div><div class="export-actions"><button class="secondary-button" id="midi-download"><i data-lucide="download"></i> MIDI</button><button class="dark-button" id="video-button">Export video <i data-lucide="arrow-up-right"></i></button></div></div>
      </section>
    </div>
    <section class="starter-section"><div><p class="eyebrow muted">A PLACE TO BEGIN</p><h2>Not sure? Start here.</h2></div><div class="starter-cards">${Object.entries(
      PRESETS
    )
      .map(
        ([name], i) =>
          `<button class="starter-card" data-preset="${name}"><span class="preset-glyph glyph-${i}" aria-hidden="true">${['↗', '♧', '≈'][i]}</span><div><h3>${name}</h3><p>${['A phrase that moves through your range', 'Find your footing, one note at a time'][i]}</p></div><i data-lucide="arrow-right"></i></button>`
      )
      .join('')}</div></section>
    <footer><span>DoReGo. Built for the joy of getting a little better.</span><span>Your practice stays on this computer.</span></footer>
  </main>
  <dialog id="export-dialog" class="dialog"><div class="dialog-top"><span class="eyebrow muted">TAKE IT WITH YOU</span><button class="icon-button close-dialog" aria-label="Close video export"><i data-lucide="x"></i></button></div><h2>Your next practice,<br>ready to go.</h2><p class="dialog-copy">A crisp MP4 with guide audio, note names, and the piano keyboard. Rendered right here on your computer.</p><label class="field">Video quality<select id="video-quality"><option value="720">720p · 30 fps</option><option value="1080">1080p · 30 fps</option></select></label><div id="export-progress" hidden><div class="progress-track"><div id="export-bar"></div></div><p id="export-stage" role="status">Getting ready…</p></div><p id="export-error" class="error-message" role="alert" hidden></p><a id="video-download" class="dark-button download-link" hidden>Download MP4 <i data-lucide="download"></i></a><div class="dialog-actions"><button class="secondary-button" id="cancel-export" hidden>Cancel export</button><button class="dark-button" id="start-export">Create video <i data-lucide="arrow-up-right"></i></button></div><p class="field-hint">Export may take a few minutes. Completed downloads stay available for one hour while the app is running.</p></dialog>
  <dialog id="save-dialog" class="dialog"><form id="save-form"><div class="dialog-top"><span class="eyebrow muted">KEEP A GOOD THING</span><button type="button" class="icon-button close-dialog" aria-label="Close save preset"><i data-lucide="x"></i></button></div><h2>Make it a regular.</h2><label class="field">Preset name<input id="preset-name" placeholder="My morning warm-up" maxlength="60" required /></label><button class="dark-button" type="submit">Save preset <i data-lucide="bookmark"></i></button></form></dialog>
  <dialog id="how-dialog" class="dialog"><div class="dialog-top"><span class="eyebrow muted">HELLO, DO RE GO</span><button class="icon-button close-dialog" aria-label="Close how it works"><i data-lucide="x"></i></button></div><h2>A small ritual.<br>A voice that grows.</h2><ol class="how-steps"><li><strong>Find your range.</strong> Choose comfortable notes, a pattern, and a pace. Start small.</li><li><strong>Follow the guide.</strong> Listen to the count-in, then match each note. Pause or move the playhead whenever you need.</li><li><strong>Make it a habit.</strong> Save a favorite preset, or download MIDI and video for later.</li></ol><p class="dialog-copy">The default guide uses locally stored Steinway grand piano recordings. Optional sine and triangle sounds are also available. No microphone or internet connection is needed. The transition marker is a personal reference you set yourself. Use a comfortable range and avoid pushing your voice.</p><p class="field-hint">Shortcuts: Space to play or pause. R to restart. F for fullscreen.</p></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

const canvas = $<HTMLCanvasElement>('#stage');
canvas.width = WIDTH;
canvas.height = HEIGHT;
const form = $<HTMLFormElement>('#exercise-form');
const numeric = [
  'key',
  'low',
  'high',
  'bpm',
  'noteBeats',
  'repetitions',
  'restBeats',
  'countIn',
  'gate',
  'volume',
] as const;
for (let midi = 24; midi <= 96; midi++)
  for (const id of ['low', 'high', 'transition'])
    $<HTMLSelectElement>(`#${id}`).add(new Option(noteName(midi), String(midi)));
function populate() {
  for (const [key, value] of Object.entries(spec)) {
    const element = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
    if (!element) continue;
    if (element instanceof HTMLInputElement && element.type === 'checkbox')
      element.checked = !!value;
    else element.value = value === null ? '' : String(value);
  }
  $<HTMLInputElement>('#tempo-slider').value = String(spec.bpm);
  const vocal = isVocalPattern(spec.pattern);
  for (const id of ['key']) {
    const element = $<HTMLSelectElement>(`#${id}`);
    element.disabled = vocal;
    element.closest('.field')!.classList.toggle('vocal-hidden', vocal);
  }
  $('#vocal-help').hidden = !vocal;
  $('#starting-chords-field').hidden = !vocal;
  $<HTMLInputElement>('#startingChords').checked = spec.startingChords ?? true;
}
function readForm(): ExerciseSpec {
  const result = { ...spec, ...Object.fromEntries(new FormData(form)) } as Record<string, unknown>;
  for (const key of numeric) result[key] = Number(result[key]);
  result.transition = result.transition === '' ? null : Number(result.transition);
  result.metronome = $<HTMLInputElement>('#metronome').checked;
  result.solfege = $<HTMLInputElement>('#solfege').checked;
  result.startingChords = $<HTMLInputElement>('#startingChords').checked;
  return generateExercise(result).spec;
}
let toastTimeout: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $('#toast').hidden = true;
  }, 4000);
}
function persist() {
  try {
    localStorage.setItem('dorego.current', JSON.stringify(spec));
  } catch {
    /* Practice works without storage. */
  }
}
function setError(message: string | null) {
  const el = $('#form-error');
  el.textContent = message;
  el.hidden = !message;
  for (const id of ['play', 'midi-download', 'video-button', 'save-preset'])
    $<HTMLButtonElement>(`#${id}`).disabled = !!message;
}
function stop(reset = true) {
  player.stop();
  cancelAnimationFrame(raf);
  if (reset) position = 0;
  mode = reset ? 'ready' : 'paused';
  update();
}
function refresh() {
  stop();
  try {
    spec = readForm();
    exercise = generateExercise(spec);
    setError(null);
    persist();
    populate();
    update();
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Check the exercise settings.');
  }
}
form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('change', refresh);
$<HTMLInputElement>('#tempo-slider').addEventListener('input', () => {
  $<HTMLInputElement>('#bpm').value = $<HTMLInputElement>('#tempo-slider').value;
  refresh();
});
$<HTMLInputElement>('#bpm').addEventListener('input', () => {
  $<HTMLInputElement>('#tempo-slider').value = $<HTMLInputElement>('#bpm').value;
});
for (const [id, change] of [
  ['transpose-down', -1],
  ['transpose-up', 1],
] as const)
  $(`#${id}`).addEventListener('click', () => {
    if (spec.low + change < 24 || spec.high + change > 96)
      return toast('That is the edge of the supported range.');
    spec = {
      ...spec,
      key: (spec.key + change + 12) % 12,
      low: spec.low + change,
      high: spec.high + change,
    };
    populate();
    refresh();
  });
let announced = '';
function update() {
  const duration = secondsAt(exercise.totalBeats, spec.bpm);
  const time = mode === 'ready' ? -1 : position;
  drawExercise(canvas, exercise, time);
  const scene = stateAt(exercise, time);
  const description = scene.note
    ? noteName(scene.note.midi, spec.key)
    : scene.phase === 'countin'
      ? `Count-in: bar ${Math.floor(scene.beat / 4) + 1} of ${Math.ceil(spec.countIn / 4)}, beat ${scene.count}`
      : scene.phase === 'rest'
        ? 'Rest'
        : 'Exercise complete';
  canvas.setAttribute(
    'aria-label',
    `${exercise.title ?? PATTERNS[spec.pattern].name}. ${description}`
  );
  if (description !== announced) {
    $('#note-announcement').textContent = description;
    announced = description;
  }
  $('#exercise-title').textContent =
    exercise.title ??
    `${PATTERNS[spec.pattern].name} (${spec.direction === 'down' ? 'Descending' : 'Ascending'})`;
  $('#session-status').textContent =
    mode === 'ready'
      ? 'Ready when you are'
      : mode === 'paused'
        ? 'Take your time'
        : mode === 'complete' || scene.phase === 'complete'
          ? 'Practice complete'
          : scene.phase === 'rest'
            ? 'Breathe & reset'
            : scene.phase === 'countin'
              ? 'Finding the beat'
              : 'You’re doing the work';
  $('.session-tag').classList.toggle('is-playing', mode === 'playing');
  const button = $('#play');
  const label =
    mode === 'playing'
      ? 'Pause'
      : mode === 'paused'
        ? 'Keep going'
        : mode === 'complete'
          ? 'Sing again'
          : 'Let’s sing';
  if (button.dataset.mode !== mode) {
    button.innerHTML = `<i data-lucide="${mode === 'playing' ? 'pause' : 'play'}"></i><span>${label}</span>`;
    button.dataset.mode = mode;
    iconify();
  }
  const slider = $<HTMLInputElement>('#position');
  slider.max = String(duration);
  slider.value = String(Math.min(position, duration));
  slider.style.setProperty('--fill', `${100 * Math.min(position / duration, 1)}%`);
  $('#elapsed').textContent = formatTime(Math.min(position, duration));
  $('#duration').textContent = formatTime(duration);
  $('#exercise-summary').textContent = exercise.title
    ? `${exercise.notes.length} notes · ${spec.repetitions} rounds · Generated from your range`
    : `${exercise.notes.length} notes · ${spec.repetitions} ${spec.repetitions === 1 ? 'round' : 'rounds'} · ${spec.countIn ? (spec.countIn % 4 === 0 ? `${spec.countIn / 4}-bar count-in` : `${spec.countIn}-beat count-in`) : 'No count-in'}`;
}
function tick() {
  if (mode !== 'playing') return;
  position = player.position;
  if (position >= secondsAt(exercise.totalBeats, spec.bpm) + RELEASE_TAIL) {
    player.stop();
    position = secondsAt(exercise.totalBeats, spec.bpm);
    mode = 'complete';
    update();
    return;
  }
  update();
  raf = requestAnimationFrame(tick);
}
async function togglePlay() {
  if ($<HTMLButtonElement>('#play').disabled) return;
  if (mode === 'playing') {
    position = player.position;
    stop(false);
    return;
  }
  if (position >= secondsAt(exercise.totalBeats, spec.bpm)) position = 0;
  mode = 'playing';
  update();
  if (exercise.spec.voice === 'piano') $('#session-status').textContent = 'Loading Steinway grand…';
  try {
    if (await player.play(exercise, position)) tick();
  } catch (error) {
    stop(false);
    toast(error instanceof Error ? error.message : 'Could not start audio.');
  }
}
$('#play').addEventListener('click', () => void togglePlay());
$('#restart').addEventListener('click', () => stop());
$<HTMLInputElement>('#position').addEventListener('input', () => {
  player.stop();
  cancelAnimationFrame(raf);
  position = Number($<HTMLInputElement>('#position').value);
  mode = 'paused';
  update();
});
$('#fullscreen').addEventListener('click', () => void toggleFullscreen());
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('#practice-card').requestFullscreen();
  } catch {
    toast('Fullscreen is not available in this browser.');
  }
}
document.addEventListener('keydown', (event) => {
  if (
    (event.target as HTMLElement).closest('input, select, textarea, button, summary, dialog') ||
    document.querySelector('dialog[open]') ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat
  )
    return;
  if (event.code === 'Space') {
    event.preventDefault();
    void togglePlay();
  }
  if (event.key.toLowerCase() === 'r') stop();
  if (event.key.toLowerCase() === 'f') void toggleFullscreen();
});
function download(bytes: Uint8Array, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('#midi-download').addEventListener('click', () => {
  download(exportMidi(exercise), 'audio/midi', 'DoReGo-exercise.mid');
  toast('Your MIDI is ready.');
});

type StoredPreset = { id: string; name: string; spec: ExerciseSpec };
function presets(): StoredPreset[] {
  try {
    const data = JSON.parse(localStorage.getItem('dorego.presets') || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(
      (p) =>
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        (() => {
          try {
            p.spec = restoreSpec(p.spec);
            return true;
          } catch {
            return false;
          }
        })()
    );
  } catch {
    return [];
  }
}
function showPresets(selected = '') {
  const select = $<HTMLSelectElement>('#saved-presets');
  select.replaceChildren(new Option('My presets', ''));
  for (const preset of presets()) select.add(new Option(preset.name, preset.id));
  select.value = selected;
  $<HTMLButtonElement>('#delete-preset').disabled = !selected;
}
$('#save-preset').addEventListener('click', () => {
  $<HTMLInputElement>('#preset-name').value = '';
  $<HTMLDialogElement>('#save-dialog').showModal();
});
$('#save-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $<HTMLInputElement>('#preset-name').value.trim();
  if (!name) return;
  const current = presets();
  if (current.length >= 50) return toast('You have 50 presets. Delete one to make room.');
  const preset = { id: crypto.randomUUID(), name, spec: { ...spec } };
  try {
    localStorage.setItem('dorego.presets', JSON.stringify([...current, preset]));
    showPresets(preset.id);
    $<HTMLDialogElement>('#save-dialog').close();
    toast('A good warm-up, saved.');
  } catch {
    toast('Your browser could not save this preset.');
  }
});
$('#saved-presets').addEventListener('change', () => {
  const preset = presets().find((p) => p.id === $<HTMLSelectElement>('#saved-presets').value);
  $<HTMLButtonElement>('#delete-preset').disabled = !preset;
  if (preset) {
    spec = { ...preset.spec };
    populate();
    refresh();
    toast(`Loaded ${preset.name}`);
  }
});
$('#delete-preset').addEventListener('click', () => {
  try {
    localStorage.setItem(
      'dorego.presets',
      JSON.stringify(presets().filter((p) => p.id !== $<HTMLSelectElement>('#saved-presets').value))
    );
    showPresets();
    toast('Preset deleted.');
  } catch {
    toast('Could not delete this preset.');
  }
});
document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) =>
  button.addEventListener('click', () => {
    spec = { ...DEFAULT_SPEC, ...PRESETS[button.dataset.preset!] };
    populate();
    refresh();
    toast(`${button.dataset.preset}, ready to sing.`);
  })
);
$('#how-button').addEventListener('click', () => $<HTMLDialogElement>('#how-dialog').showModal());
document
  .querySelectorAll<HTMLButtonElement>('.close-dialog')
  .forEach((button) => button.addEventListener('click', () => button.closest('dialog')!.close()));
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) =>
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  })
);
$('#video-button').addEventListener('click', () => {
  stop(false);
  $<HTMLDialogElement>('#export-dialog').showModal();
});

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}
interface Job {
  id: string;
  status: string;
  progress: number;
  stage: string;
  error: string | null;
}
function exportState(active: boolean) {
  exportActive = active;
  $('#cancel-export').hidden = !active;
  $<HTMLButtonElement>('#start-export').disabled = active;
  $<HTMLSelectElement>('#video-quality').disabled = active;
}
function exportFailure(error: unknown) {
  exportState(false);
  $('#export-error').textContent =
    error instanceof Error ? error.message : 'Export failed. Please try again.';
  $('#export-error').hidden = false;
  $('#export-stage').textContent = 'Could not complete this export';
}
async function pollExport(generation: number) {
  if (!jobId || generation !== exportGeneration) return;
  try {
    const job = await request<Job>(`/api/exports/${jobId}`);
    if (generation !== exportGeneration) return;
    $('#export-bar').style.width = `${job.progress * 100}%`;
    $('#export-stage').textContent = job.stage;
    if (job.status === 'complete') {
      exportState(false);
      const link = $<HTMLAnchorElement>('#video-download');
      link.href = `/api/exports/${job.id}/download`;
      link.hidden = false;
      toast('Your practice video is ready.');
    } else if (job.status === 'failed') exportFailure(new Error(job.error || 'Export failed.'));
    else if (job.status === 'cancelled') exportState(false);
    else pollTimer = setTimeout(() => void pollExport(generation), 700);
  } catch (error) {
    if (generation === exportGeneration) exportFailure(error);
  }
}
$('#start-export').addEventListener('click', async () => {
  if (exportActive) return;
  const generation = ++exportGeneration;
  clearTimeout(pollTimer);
  jobId = null;
  $('#export-error').hidden = true;
  $('#video-download').hidden = true;
  $('#export-progress').hidden = false;
  $('#export-bar').style.width = '0%';
  $('#export-stage').textContent = 'Opening the renderer';
  exportState(true);
  // Cancellation becomes available once the server has returned a job ID.
  $<HTMLButtonElement>('#cancel-export').disabled = true;
  try {
    const job = await request<Job>('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec, height: Number($<HTMLSelectElement>('#video-quality').value) }),
    });
    jobId = job.id;
    $<HTMLButtonElement>('#cancel-export').disabled = false;
    void pollExport(generation);
  } catch (error) {
    exportFailure(error);
  }
});
$('#cancel-export').addEventListener('click', async () => {
  if (!jobId) return;
  try {
    await request(`/api/exports/${jobId}`, { method: 'DELETE' });
    ++exportGeneration;
    clearTimeout(pollTimer);
    exportState(false);
    $('#export-stage').textContent = 'Export cancelled. You can start again anytime.';
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not cancel the export.');
  }
});
populate();
showPresets();
iconify();
update();
window.addEventListener('pagehide', () => player.stop());

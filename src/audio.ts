import { CelloGlides, preloadCello } from './cello';
import * as Tone from 'tone';
import { secondsAt, type Exercise } from './music';
import { preloadSteinway, SteinwayGrand } from './steinway';
import { audioEvents, type AudioEvent } from './audio-timeline';

export const RELEASE_TAIL = 0.8;
let playbackContext: AudioContext | undefined;
function initPlayback() {
  if (!playbackContext) {
    // This is a sequenced player: reliability matters more than live-key latency.
    playbackContext = new AudioContext({ latencyHint: 'playback' });
    Tone.setContext(new Tone.Context({ context: playbackContext, lookAhead: 0.15 }), true);
  }
}
function makeGraph(volume: number) {
  // Catch unusually loud chord sums without changing ordinary piano dynamics.
  const limiter = new Tone.Limiter(-1).toDestination();
  const output = new Tone.Volume(volume <= -60 ? -Infinity : volume).connect(limiter);
  const synth = new SteinwayGrand(output);
  const cello = new CelloGlides(output);
  const click = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.02 },
    volume: -9,
  }).connect(output);
  return {
    synth,
    cello,
    click,
    output,
    dispose() {
      synth.dispose();
      cello.dispose();
      click.dispose();
      output.dispose();
      limiter.dispose();
    },
  };
}
function playEvent(event: AudioEvent, graph: ReturnType<typeof makeGraph>, time: number, late = 0) {
  if (event.kind === 'click') {
    if (late < 0.04)
      graph.click.triggerAttackRelease(event.frequency, event.duration, time, event.velocity);
  } else if (event.kind === 'glide' && event.glide) {
    graph.cello.play(
      event.glide.midi,
      event.glide.span,
      event.glide.duration,
      event.elapsed + late,
      time,
      event.velocity
    );
  } else if (event.duration > late) {
    graph.synth.triggerAttackRelease(
      event.frequency,
      event.duration - late,
      time,
      event.velocity,
      event.elapsed + late
    );
  }
}
export class Player {
  private graph: ReturnType<typeof makeGraph> | null = null;
  private epoch = 0;
  private offset = 0;
  private pending = 0;
  private scheduler: ReturnType<typeof setInterval> | undefined;
  async prepare(exercise: Exercise) {
    initPlayback();
    await Promise.all([preloadSteinway(exercise), preloadCello(exercise)]);
  }
  async play(exercise: Exercise, offset = 0) {
    this.stop();
    const token = ++this.pending;
    this.offset = offset;
    initPlayback();
    await Tone.start();
    if (token !== this.pending) return false;
    await Promise.all([preloadSteinway(exercise), preloadCello(exercise)]);
    if (token !== this.pending) return false;
    this.graph = makeGraph(exercise.spec.volume);
    this.offset = offset;
    this.epoch = Tone.now() + 0.05;
    const graph = this.graph;
    const events = audioEvents(exercise, offset);
    let cursor = 0;
    const fill = () => {
      const now = graph.output.context.immediate();
      // Bound live node count; keep a full second buffered through UI stalls.
      while (cursor < events.length && this.epoch + events[cursor].time < now + 1) {
        const event = events[cursor++];
        const planned = this.epoch + event.time;
        const time = Math.max(planned, now + 0.015);
        playEvent(event, graph, time, Math.max(0, time - planned));
      }
    };
    fill();
    this.scheduler = setInterval(fill, 100);
    return true;
  }
  get position() {
    if (!this.graph || !playbackContext) return this.offset;
    const stamp = playbackContext.getOutputTimestamp?.();
    const contextTime = stamp?.contextTime ?? 0;
    const performanceTime = stamp?.performanceTime ?? 0;
    const audibleTime =
      contextTime > 0 && performanceTime > 0
        ? Math.min(
            playbackContext.currentTime,
            contextTime + Math.max(0, performance.now() - performanceTime) / 1000
          )
        : playbackContext.currentTime -
          playbackContext.baseLatency -
          (playbackContext.outputLatency || 0);
    return this.offset + Math.max(0, audibleTime - this.epoch);
  }
  stop() {
    ++this.pending;
    clearInterval(this.scheduler);
    this.scheduler = undefined;
    const graph = this.graph;
    this.graph = null;
    if (graph) {
      // A hard disconnect at an arbitrary waveform position creates a click.
      graph.output.volume.rampTo(-100, 0.02, graph.output.context.immediate());
      setTimeout(() => graph.dispose(), 50);
    }
  }
}
export async function renderAudio(exercise: Exercise): Promise<Uint8Array> {
  await Promise.all([preloadSteinway(exercise), preloadCello(exercise)]);
  const duration = secondsAt(exercise.totalBeats, exercise.spec.bpm) + RELEASE_TAIL;
  let cleanup = () => {};
  const result = await Tone.Offline(
    () => {
      const graph = makeGraph(exercise.spec.volume);
      cleanup = () => graph.dispose();
      for (const event of audioEvents(exercise, 0)) playEvent(event, graph, event.time);
    },
    duration,
    2,
    44100
  ).finally(() => cleanup());
  const audio = result.get();
  if (!audio) throw new Error('Could not render the audio track.');
  const channels = audio.numberOfChannels,
    length = audio.length;
  const data = new ArrayBuffer(44 + length * channels * 2),
    view = new DataView(data);
  const str = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, data.byteLength - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, length * channels * 2, true);
  const samples = Array.from({ length: channels }, (_, channel) => audio.getChannelData(channel));
  for (let i = 0; i < length; i++)
    for (let ch = 0; ch < channels; ch++) {
      const v = Math.max(-1, Math.min(1, samples[ch][i]));
      view.setInt16(44 + (i * channels + ch) * 2, Math.round(v * (v < 0 ? 32768 : 32767)), true);
    }
  result.dispose();
  return new Uint8Array(data);
}

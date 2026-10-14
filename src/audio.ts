import * as Tone from 'tone';
import { secondsAt, metronomeBeat, type Exercise, type Voice } from './music';
import { preloadSteinway, SteinwayGrand } from './steinway';

export const RELEASE_TAIL = 0.8;
function makeGraph(voice: Voice, volume: number) {
  const output = new Tone.Volume(volume).toDestination();
  const options =
    voice === 'soft'
      ? {
          oscillator: { type: 'sine' as const },
          envelope: { attack: 0.035, decay: 0.15, sustain: 0.6, release: 0.35 },
        }
      : {
          oscillator: { type: 'triangle' as const },
          envelope: { attack: 0.005, decay: 0.13, sustain: 0.5, release: 0.18 },
        };
  const synth =
    voice === 'piano'
      ? new SteinwayGrand(output)
      : new Tone.PolySynth(Tone.Synth, options).connect(output);
  const click = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.02 },
    volume: -9,
  }).connect(output);
  return {
    synth,
    click,
    output,
    dispose() {
      synth.dispose();
      click.dispose();
      output.dispose();
    },
  };
}
function schedule(
  exercise: Exercise,
  graph: ReturnType<typeof makeGraph>,
  epoch: number,
  offset: number
) {
  const { bpm, countIn, metronome } = exercise.spec;
  for (const n of exercise.notes) {
    const start = secondsAt(n.onsetBeat, bpm),
      end = secondsAt(n.onsetBeat + n.durationBeats, bpm);
    if (end <= offset) continue;
    graph.synth.triggerAttackRelease(
      Tone.Frequency(n.midi, 'midi').toFrequency(),
      end - Math.max(start, offset),
      epoch + Math.max(0, start - offset),
      n.velocity ?? 0.7
    );
  }
  for (let beat = 0; beat < exercise.totalBeats; beat++) {
    const start = secondsAt(beat, bpm);
    if (start < offset || (beat >= countIn && !metronome)) continue;
    const click = metronomeBeat(beat, countIn);
    graph.click.triggerAttackRelease(
      click.frequency,
      0.025,
      epoch + start - offset,
      click.velocity
    );
  }
}
export class Player {
  private graph: ReturnType<typeof makeGraph> | null = null;
  private epoch = 0;
  private offset = 0;
  private pending = 0;
  async play(exercise: Exercise, offset = 0) {
    this.stop();
    const token = ++this.pending;
    this.offset = offset;
    await Tone.start();
    if (token !== this.pending) return false;
    await preloadSteinway(exercise);
    if (token !== this.pending) return false;
    this.graph = makeGraph(exercise.spec.voice, exercise.spec.volume);
    this.offset = offset;
    this.epoch = Tone.immediate() + 0.08;
    schedule(exercise, this.graph, this.epoch, offset);
    return true;
  }
  get position() {
    return this.graph ? this.offset + Math.max(0, Tone.immediate() - this.epoch) : this.offset;
  }
  stop() {
    ++this.pending;
    this.graph?.dispose();
    this.graph = null;
  }
}
export async function renderAudio(exercise: Exercise): Promise<Uint8Array> {
  await preloadSteinway(exercise);
  const duration = secondsAt(exercise.totalBeats, exercise.spec.bpm) + RELEASE_TAIL;
  let cleanup = () => {};
  const result = await Tone.Offline(
    () => {
      const graph = makeGraph(exercise.spec.voice, exercise.spec.volume);
      cleanup = () => graph.dispose();
      schedule(exercise, graph, 0, 0);
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

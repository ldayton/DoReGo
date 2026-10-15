import * as Tone from 'tone';
import { glideOffset, type Exercise } from './music';

// VSCO uses a different octave naming convention; these keys come from its SFZ.
export const CELLO_KEYS = [36, 40, 43, 47, 50, 53, 57, 60, 64, 67, 71, 74, 77];
export function celloKey(midi: number, span: number) {
  const midpoint = midi + span / 2;
  return CELLO_KEYS.reduce((best, key) =>
    Math.abs(key - midpoint) < Math.abs(best - midpoint) ? key : best
  );
}
const buffers = new Map<number, AudioBuffer>();
const loading = new Map<number, Promise<void>>();
export async function preloadCello(exercise: Exercise) {
  const keys = [
    ...new Set(
      exercise.notes.filter((n) => n.glideSpan).map((n) => celloKey(n.midi, n.glideSpan!))
    ),
  ];
  // Small sustained recordings, loaded once and reused for every round.
  for (const key of keys) {
    if (buffers.has(key)) continue;
    if (!loading.has(key))
      loading.set(
        key,
        (async () => {
          try {
            const response = await fetch(
              `${import.meta.env.BASE_URL}samples/vsco-cello/${key}.flac`
            );
            if (!response.ok)
              throw new Error('Could not load the cello recordings. Please try again.');
            const context = Tone.getContext();
            const original = await context.decodeAudioData(await response.arrayBuffer());
            const buffer = context.createBuffer(
              original.numberOfChannels,
              original.length,
              original.sampleRate
            );
            let peak = 0;
            for (let ch = 0; ch < original.numberOfChannels; ch++)
              for (const value of original.getChannelData(ch))
                peak = Math.max(peak, Math.abs(value));
            for (let ch = 0; ch < original.numberOfChannels; ch++) {
              const data = buffer.getChannelData(ch),
                input = original.getChannelData(ch);
              for (let i = 0; i < data.length; i++)
                data[i] = input[i] * (0.75 / Math.max(peak, 0.001));
              // Crossfade into the loop's beginning before wrapping. The attack is
              // retained, while a slow exercise can sustain without a hard seam.
              const loopStart = Math.floor(0.8 * buffer.sampleRate);
              const loopEnd = Math.floor((buffer.duration - 0.5) * buffer.sampleRate);
              const crossfade = Math.floor(0.15 * buffer.sampleRate);
              for (let i = 0; i < crossfade; i++) {
                const blend = (1 - Math.cos((Math.PI * i) / (crossfade - 1))) / 2;
                data[loopEnd - crossfade + i] =
                  data[loopEnd - crossfade + i] * (1 - blend) + data[loopStart + i] * blend;
              }
            }
            buffers.set(key, buffer);
          } finally {
            loading.delete(key);
          }
        })()
      );
    await loading.get(key);
  }
}
export class CelloGlides {
  private sources = new Set<() => void>();
  constructor(private destination: Tone.Volume) {}
  play(
    midi: number,
    span: number,
    fullDuration: number,
    elapsed: number,
    time: number,
    velocity: number
  ) {
    const key = celloKey(midi, span),
      buffer = buffers.get(key);
    if (!buffer) throw new Error('The cello recordings are not ready.');
    const duration = fullDuration - elapsed;
    if (duration <= 0) return;
    const context = this.destination.context;
    const source = context.createBufferSource(),
      gain = context.createGain(),
      soften = context.createBiquadFilter();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0.95;
    source.loopEnd = Math.floor((buffer.duration - 0.5) * buffer.sampleRate) / buffer.sampleRate;
    const centsAt = (seconds: number) =>
      (midi - key + glideOffset(seconds / fullDuration, span)) * 100;
    // One continuous source and audio-clock automation, including after seeking.
    source.playbackRate.setValueCurveAtTime(
      Float32Array.from(
        { length: 4096 },
        (_, i) => 2 ** (centsAt(elapsed + (duration * i) / 4095) / 1200)
      ),
      time,
      duration
    );
    soften.type = 'highshelf';
    soften.frequency.value = 2500;
    soften.gain.value = -4;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(
      velocity,
      time + Math.min(elapsed ? 0.02 : 0.16, duration / 3)
    );
    gain.gain.setValueAtTime(velocity, time + Math.max(duration / 3, duration - 0.18));
    gain.gain.linearRampToValueAtTime(0, time + duration);
    source.connect(soften).connect(gain);
    Tone.connect(gain, this.destination);
    // Integrate the varying playback rate to resume the original recording at
    // the same point, rather than restarting its bow attack at a new pitch.
    let offset = 0.35;
    const steps = 512;
    for (let i = 0; i < steps; i++)
      offset += (elapsed / steps) * 2 ** (centsAt((elapsed * (i + 0.5)) / steps) / 1200);
    if (offset >= source.loopEnd)
      offset =
        source.loopStart + ((offset - source.loopStart) % (source.loopEnd - source.loopStart));
    const cleanup = () => {
      source.onended = null;
      source.disconnect();
      soften.disconnect();
      gain.disconnect();
      this.sources.delete(cancel);
    };
    const cancel = () => {
      source.stop();
      cleanup();
    };
    source.onended = cleanup;
    this.sources.add(cancel);
    source.start(time, offset);
    source.stop(time + duration + 0.02);
  }
  dispose() {
    for (const cancel of this.sources) cancel();
    this.sources.clear();
  }
}

import { holdParam, type LiveVoice } from './tempo-clock';
import * as Tone from 'tone';
import { BITKLAVIER_SAMPLES } from './bitklavier-samples';
import type { Exercise } from './music';

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<void>>();
export function pianoRegion(midi: number, velocity: number) {
  const layer = Math.max(1, Math.min(16, Math.ceil(velocity * 16)));
  const samples = BITKLAVIER_SAMPLES.filter((sample) => sample.layer === layer);
  const region = samples.reduce((best, sample) =>
    Math.abs(sample.midi - midi) < Math.abs(best.midi - midi) ? sample : best
  );
  return { ...region, folder: 'bitklavier' };
}
// Keep only the audio needed for the requested note lengths, without changing
// the source recordings. Longer subsequent exercises reload the full source.
const complete = new Set<string>();
const CACHE_BYTES = 128 * 1024 * 1024;
let preloadGeneration = 0;
export async function preloadSteinway(exercise: Exercise) {
  const generation = ++preloadGeneration;
  const files = new Map<string, number>();
  for (const n of exercise.notes) {
    if (n.glideSpan) continue;
    const r = pianoRegion(n.midi, n.velocity ?? 0.7);
    const file = `${r.folder}/${r.file}`;
    const needed = Math.ceil(
      ((n.durationBeats * 60) / exercise.spec.bpm + 0.5) * 2 ** ((n.midi - r.midi) / 12)
    );
    files.set(file, Math.max(files.get(file) ?? 0, needed));
  }
  const queue = [...files];
  let index = 0;
  // Avoid simultaneous large FLAC decodes saturating the CPU and memory.
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (index < queue.length) {
        const [file, needed] = queue[index++];
        while (
          !buffers.has(file) ||
          (!complete.has(file) && buffers.get(file)!.duration < needed)
        ) {
          if (!loading.has(file))
            loading.set(
              file,
              (async () => {
                try {
                  const response = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
                  if (!response.ok)
                    throw new Error(
                      'Could not load the piano recordings. Check that the local app is running.'
                    );
                  const context = Tone.getContext();
                  const decoded = await context.decodeAudioData(await response.arrayBuffer());
                  const frames = Math.min(decoded.length, Math.ceil(needed * decoded.sampleRate));
                  let retained = decoded;
                  if (frames < decoded.length) {
                    retained = context.createBuffer(
                      decoded.numberOfChannels,
                      frames,
                      decoded.sampleRate
                    );
                    for (let channel = 0; channel < decoded.numberOfChannels; channel++)
                      retained.copyToChannel(
                        decoded.getChannelData(channel).subarray(0, frames),
                        channel
                      );
                  } else complete.add(file);
                  if (!buffers.has(file) || buffers.get(file)!.length < retained.length)
                    buffers.set(file, retained);
                } finally {
                  loading.delete(file);
                }
              })()
            );
          await loading.get(file);
        }
        // Touch the entry so unused older exercises are evicted first.
        const buffer = buffers.get(file)!;
        buffers.delete(file);
        buffers.set(file, buffer);
      }
    })
  );
  if (generation !== preloadGeneration) return;
  let bytes = [...buffers.values()].reduce((sum, b) => sum + b.length * b.numberOfChannels * 4, 0);
  for (const [file, buffer] of buffers) {
    if (bytes <= CACHE_BYTES) break;
    if (files.has(file)) continue;
    buffers.delete(file);
    complete.delete(file);
    bytes -= buffer.length * buffer.numberOfChannels * 4;
  }
}
export class SteinwayGrand {
  private sources = new Set<() => void>();
  constructor(private destination: Tone.Volume) {}
  triggerAttackRelease(
    frequency: number,
    duration: number,
    time: number,
    velocity: number,
    elapsed = 0
  ) {
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const region = pianoRegion(midi, velocity);
    const buffer = buffers.get(`${region.folder}/${region.file}`);
    if (!buffer) throw new Error('The piano samples are not ready.');
    const context = this.destination.context;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const rate = 2 ** ((midi - region.midi) / 12);
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain);
    Tone.connect(gain, this.destination);
    // All envelope and stop events run on the audio clock, including offline.
    // Native ended fires after the actual stop, unlike Tone's early JS callback.
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(velocity, time + Math.min(0.002, duration / 2));
    gain.gain.setValueAtTime(velocity, time + duration);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + duration + 0.35);
    gain.gain.linearRampToValueAtTime(0, time + duration + 0.36);
    const cleanup = () => {
      source.onended = null;
      source.disconnect();
      gain.disconnect();
      this.sources.delete(cancel);
    };
    const cancel = () => {
      source.stop();
      cleanup();
    };
    source.onended = cleanup;
    this.sources.add(cancel);
    source.start(time, Math.min(elapsed * rate, buffer.duration));
    source.stop(time + duration + 0.36);
    return {
      cancel,
      retime(at, remaining) {
        holdParam(gain.gain, at);
        gain.gain.linearRampToValueAtTime(velocity, at + Math.min(0.002, remaining / 2));
        gain.gain.setValueAtTime(velocity, at + remaining);
        gain.gain.exponentialRampToValueAtTime(0.00001, at + remaining + 0.35);
        gain.gain.linearRampToValueAtTime(0, at + remaining + 0.36);
        source.stop(at + remaining + 0.36);
      },
    } satisfies LiveVoice;
  }
  dispose() {
    for (const cancel of this.sources) cancel();
    this.sources.clear();
  }
}

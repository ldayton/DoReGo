import * as Tone from 'tone';
import { STEINWAY_REGIONS } from './steinway-samples';
import type { Exercise } from './music';

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<void>>();
export function steinwayRegion(midi: number, velocity: number) {
  const key = Math.max(21, Math.min(108, Math.round(midi)));
  const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)));
  const region = STEINWAY_REGIONS.find(
    (r) => key >= r.low && key <= r.high && vel >= r.lowVelocity && vel <= r.highVelocity
  );
  if (!region) throw new Error(`No Steinway sample is mapped for note ${midi}.`);
  return region;
}
export async function preloadSteinway(exercise: Exercise) {
  if (exercise.spec.voice !== 'piano') return;
  const files = new Set(exercise.notes.map((n) => steinwayRegion(n.midi, n.velocity ?? 0.7).file));
  await Promise.all(
    [...files].map((file) => {
      if (buffers.has(file)) return;
      if (!loading.has(file))
        loading.set(
          file,
          (async () => {
            try {
              const response = await fetch(`/samples/steinway/${file}`);
              if (!response.ok)
                throw new Error(
                  'Could not load the Steinway recordings. Check that the local app is running.'
                );
              buffers.set(
                file,
                await Tone.getContext().decodeAudioData(await response.arrayBuffer())
              );
            } finally {
              loading.delete(file);
            }
          })()
        );
      return loading.get(file);
    })
  );
}
export class SteinwayGrand {
  private sources = new Set<Tone.ToneBufferSource>();
  constructor(private destination: Tone.Volume) {}
  triggerAttackRelease(frequency: number, duration: number, time: number, velocity: number) {
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const region = steinwayRegion(midi, velocity),
      buffer = buffers.get(region.file);
    if (!buffer) throw new Error('The Steinway samples are not ready.');
    const source = new Tone.ToneBufferSource({
      url: buffer,
      playbackRate: 2 ** ((midi - region.midi) / 12),
      fadeIn: 0.002,
      fadeOut: 0.35,
      curve: 'exponential',
      onended: () => {
        // Tone simulates offline clock callbacks before rendering the native
        // audio graph. Keep those nodes connected until rendering completes.
        if (!source.context.isOffline) this.sources.delete(source);
      },
    }).connect(this.destination);
    this.sources.add(source);
    source.start(time, 0, duration, velocity);
  }
  dispose() {
    for (const source of this.sources) source.dispose();
    this.sources.clear();
  }
}

import * as MidiModule from '@tonejs/midi';
import { metronomeBeat, type Exercise } from './music';

// The package exposes a UMD default in Node and named ESM exports in bundlers.
export const { Midi } = (Reflect.get(MidiModule, 'default') ?? MidiModule) as typeof MidiModule;

export function exportMidi(exercise: Exercise): Uint8Array {
  const midi = new Midi();
  midi.header.name = exercise.title ?? 'DoReGo vocal exercise';
  midi.header.setTempo(exercise.spec.bpm);
  const ppq = midi.header.ppq;
  const track = midi.addTrack();
  track.name = 'Guide notes';
  track.instrument.number = 0;
  for (const n of exercise.notes)
    track.addNote({
      midi: n.midi,
      ticks: Math.round(n.onsetBeat * ppq),
      durationTicks: Math.round(n.durationBeats * ppq),
      velocity: n.velocity ?? 0.78,
    });
  // A timed all-notes-off preserves the full final slot in MIDI players, even
  // when articulation makes the final sounding note shorter than that slot.
  track.addCC({ number: 123, ticks: Math.round(exercise.totalBeats * ppq), value: 0 });
  if (exercise.spec.countIn || exercise.spec.metronome) {
    const click = midi.addTrack();
    click.name = 'Count-in & metronome';
    click.channel = 9;
    for (let beat = 0; beat < exercise.totalBeats; beat++)
      if (beat < exercise.spec.countIn || exercise.spec.metronome)
        click.addNote({
          midi: metronomeBeat(beat, exercise.spec.countIn).number === 1 ? 76 : 77,
          ticks: beat * ppq,
          durationTicks: Math.round(ppq * 0.06),
          velocity: metronomeBeat(beat, exercise.spec.countIn).velocity,
        });
  }
  return midi.toArray();
}

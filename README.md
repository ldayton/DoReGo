# DoReGo

A local vocal exercise studio. Build a warm-up, follow the guide notes, and export MIDI or an MP4 with synchronized sound and keyboard visuals.

## Run

Requires Node.js 22.12+ and npm. Video export also requires FFmpeg and the Playwright Chromium browser.

```sh
cd ~/source/DoReGo
npm ci
npm run setup:browser
# macOS, if FFmpeg is not already installed:
brew install ffmpeg
npm run dev
```

Open **http://127.0.0.1:4317**. The server binds to loopback only. Set `PORT` to change the port, or `FFMPEG_PATH` to use a specific FFmpeg executable.

For a production build:

```sh
npm run build
npm start
```

No account, API key, microphone access, or hosted service is required. CC BY 4.0 bitKlavier Grand Steinway D recordings are bundled locally in public/samples/bitklavier. Dependencies and Chromium need to be downloaded once during setup. Your latest exercise lives in this browser's local storage; exported video files temporarily live on this computer.

## Practice

- Seven exercises: **Arpeggio & Scale** (default: E3–E5, 150 BPM), **Octave Arpeggio**, **Rossini Scale**, **Five-Note Scale**, **Major Scale**, **Fifth Glide**, and **Octave Glide**. Rossini and the glides have fixed up-and-back phrases; the other exercises offer **Ascending** and **Descending** directions.
- Choose your lowest/highest vocal notes and direction. Major Scale instead uses a single Key selector for the starting note, including its octave; the other exercises move by semitone through your range.
- Desktop note fields accept typed names such as E3 or F#4 and open a note grid organized by octave. Mobile uses snapping swipe wheels. Arrow keys move by semitone and Page Up/Down by octave.
- Transpose the key and range together with the minus/plus buttons.
- Adjust tempo (60–240 BPM), rounds, inter-round rests, count-in, and volume. Pitched phrases use the sampled bitKlavier Steinway Grand with fixed natural articulation. Glides use sustained VSCO cello recordings, with the usual piano chord introduction. All beats are quarter-note beats. The default count-in is two bars of 4/4 (eight beats), displayed as two labeled four-beat groups with the active beat highlighted and each downbeat accented.
- Piano samples warm up automatically before playback. A “Loading...” indicator appears immediately while preparing; Play becomes available as soon as the selected exercise is ready; failed loads offer a retry.
- Exercise, range, tempo, direction, and other preferences are saved automatically in browser local storage and restored on return. New users start with Arpeggio & Scale E3–E5 at 150 BPM.
- Tempo −/+ buttons step by 5 BPM. Repeats count additional passes (None means one pass); repeats and rest use stacked arrows on desktop and None–4 dropdowns on mobile.
- Optional metronome.
- Play/pause, scrub, restart, and fullscreen. Space toggles playback, R restarts, F toggles fullscreen when a form control is not focused. Editing settings resets playback so the display and sound use the same exercise.

On phones, the practice canvas uses a taller layout with larger keys. The keyboard focuses on the vocal phrase, keeps key sizes fixed for the whole exercise, and slides between rounds. Intro chords remain audible but are not visualized on mobile. Desktop and exported video retain the wide layout.

Note names stay visible for the full rhythmic slot. The highlighted key follows the sounding duration, so detached notes have a short unlit gap. Repeated notes get a fresh progress bar. No pitch detection or singing assessment is implemented.

## Exports

Exports are CLI-only; the practice UI has no export controls.

```sh
npm run export -- midi --output exercise.mid
# With the local server running:
npm run export -- video --output exercise.mp4
# Optional partial ExerciseSpec JSON and video quality:
npm run export -- video --spec exercise.json --height 1080 --output exercise.mp4
```

Without a spec file, exports use Arpeggio & Scale E3–E5 at 150 BPM. Use `--url` for a different local server URL. Ctrl+C cancels a video export.

**MIDI** exports directly to the requested file without a running server. It contains guide notes, tempo, and percussion-channel count-in/metronome clicks when enabled. A timed all-notes-off controller preserves the final slot. Guide volume/timbre and visual preferences are preview/video settings; MIDI uses a standard piano program and fixed guide-note velocity for downstream editing.

**Video** is rendered locally at 720p or 1080p, 30 fps, as H.264/AAC MP4. It includes the same count-in, note sequence, rests, guide sound, and visual settings as practice. Audio is rendered offline and gets an 0.8-second release tail. Each image is computed directly from `frameIndex / fps`, so exporting does not depend on recording real-time playback or keeping a tab foregrounded.

One video renders at a time. The CLI reports progress and saves the completed MP4 to the requested output path. The server removes temporary exports after one hour.

Browser visuals update on animation frames. Exported visuals are quantized to video frames; sound is scheduled on the audio timeline. Bluetooth or other output-device latency can affect perceived live synchronization.

## Architecture

`src/music.ts` validates the exercise and generates one immutable-by-convention sequence in quarter-note beats. Each note has a MIDI pitch, onset, sounding duration, rhythmic slot, repetition, and ID. Display spelling is separate from pitch.

- `stateAt(exercise, seconds)` computes count-in, current note, upcoming notes, rest, and completion at any time.
- `src/render.ts` draws that state to Canvas without wall-clock reads, accumulated animation state, or random effects. The practice UI and headless export use the same function.
- `src/audio.ts` uses Tone.js and an explicit AudioContext epoch. Live playback schedules one second ahead at 100 ms intervals in a playback-latency context. Pause/resume retains the position within a piano sample; stopping fades out over 20 ms. Native buffer sources handle piano envelopes, stop times, and cleanup on the audio clock. Output timestamps align the live display with the device clock where supported. A final limiter protects loud chord sums. Offline audio uses the same scheduling function and encodes PCM WAV.
- `src/midi.ts` converts beats to the MIDI library's PPQ and writes a file with Tonejs/Midi.
- `server/exporter.ts` runs an isolated Playwright page, renders WAV, streams exact-time Canvas frames to FFmpeg while honoring stream backpressure, checks the encoder exit status, and cleans up temporary audio. The browser page never needs to access arbitrary files or URLs.
- `server/index.ts` supplies the local API, input validation, loopback binding, host/origin checks, and Vite development middleware or built static assets.

The first version uses fixed tempo per exercise. Changing tempo rebuilds all consumers. It does not yet implement tempo ramps, arbitrary MIDI import.

## Verify

```sh
npm test
npm run build
# Start the app in another terminal, then:
npm run test:e2e
```

The model tests cover all keys and patterns, boundary states, range constraints, invalid inputs, MIDI timing, and clicks. End-to-end tests cover desktop/mobile layout, playback and pause/resume, saved exercise, transposition, MIDI download, rendering the same frame after out-of-order seeks, a real MP4 export with audible audio, expected guide pitches at their scheduled times, an encoded video frame compared with the shared renderer, export cancellation, concurrent-export rejection, and cross-origin protection. They require Chromium, FFmpeg, and ffprobe, and save screenshots and output files under ignored `work/`. Use `TEST_URL` to test another local port.

All runtime dependency versions are pinned by `package-lock.json`. The app does not copy source from the reference visualizer projects. Its dependencies retain their respective licenses.

### Generated exercises

**Arpeggio & Scale** generates a reusable vocal phrase and shifts it one semitone at a time through your range. Ascending uses 1–3–5–4–3–2–1 twice; descending uses 5–3–1–2–3–4–5 twice, sharing the middle endpoint. A range of at least a perfect fifth is required. Rounds repeat the full sweep; rests separate phrases. Starting-note chords are optional and can include accompaniment below your vocal range.

**Five-Note Scale** uses 1–2–3–4–5–4–3–2–1 ascending, or 5–4–3–2–1–2–3–4–5 descending. **Octave Arpeggio** uses 1–3–5–8–5–3–1 ascending, or 8–5–3–1–3–5–8 descending. Both hold the final note for two beats and move by semitone through the selected range, with optional starting chords. Selecting either expands a smaller range to fit its perfect fifth or octave.

**Rossini Scale** uses the fixed sequence 1–3–5–8–10–12–11–9–7–5–4–2–1, with regular beats and a held final note. It shifts upward by semitone between rounds, fitting the entire melody within the chosen range. It needs at least 19 semitones; selecting it expands a smaller range to fit. Direction is hidden and ignored for this exercise. Starting chords, repeats, count-in, rests, and tempo remain available.

**Major Scale** uses Key as its starting note and generates one octave ascending or descending, without lowest/highest controls. Rounds repeat that scale, with the configured rest between rounds.

All exercises use the tempo, fixed exercise timing, natural articulation, count-in, rounds, volume, and export settings. Older saved exercise types are mapped to Arpeggio & Scale or Major Scale; the former combined up-and-down direction maps to ascending.

## bitKlavier Grand

Piano exercises and starting cues use bitKlavier Grand Piano Bar (Steinway D). Older saved sound choices are automatically migrated to bitKlavier. Main sustained recordings retain all 16 velocity layers and stereo 44.1 kHz / 16-bit resolution, losslessly converted to FLAC. Only the samples needed by an exercise load into memory. The browser adaptation uses nearest sampled pitches, equal velocity zones, and an envelope release; it does not implement the original instrument's pedal, sympathetic resonance, or release samples. Playback and video export use the same adaptation.

Source and full credits: https://bitklavier.com/the-bitklavier-grand/ . Recorded by Andres Villalta, played by Matt Wang, produced by Dan Trueman. Licensed CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . Attribution and transformation details are bundled in `public/samples/bitklavier/NOTICE.txt` and linked from Help.

Rebuild the assets with `python3 scripts/setup-bitklavier.py` (requires FFmpeg; downloads the approximately 1 GB source archive into ignored `work/`).

### Cello glides

Fifth Glide and Octave Glide use CC0 VSCO 2 Community Edition cello-section recordings. Each round begins with the usual six-beat piano chord introduction (when starting chords are enabled), then a fourteen-beat continuous slide: hold two beats, rise four, hold two, descend four, hold two. Rounds move up by semitone while keeping the complete glide inside the chosen vocal range. Direction is fixed for glides; the starting-chord option works as it does for the other vocal exercises.

One sustained recording, chosen nearest the glide's pitch midpoint, plays throughout the phrase with smooth audio-clock pitch automation. Samples load only when needed; crossfaded sustain loops support slower tempos, and pause/seek resumes at the correct pitch and sample position. The keyboard follows the sounding pitch with a moving marker; Current/Next still show round targets. Video uses the same cello playback; MIDI exports a separate cello track with pitch bends and a declared octave bend range.

Source: https://versilian-studios.com/vsco-community/ and https://github.com/sgossner/VSCO-2-CE . The thirteen quiet sustained-vibrato recordings are losslessly converted to FLAC using the publisher's SFZ pitch mapping. License and adaptation details are in `public/samples/vsco-cello/NOTICE.txt` and linked from Help. These are digitally bent sustained ensemble recordings, rather than recorded portamento transitions.

`npm run test:glides` checks desktop/mobile controls, persistence, pause/resume inside a glide, and browser-rendered audio at 60 BPM, including held pitch accuracy, sustained output through looping, headroom, and silent release.

### Audio reliability checks

`npm run test:audio` instruments live browser playback of a wide-range bitKlavier exercise at full volume. It checks bounded source count, sample tail memory retention, native scheduling through a 400 ms main-thread stall, non-silent output without clipping, and silent cleanup after pause. The sample loader limits concurrent decodes to four, retains only the duration needed by each exercise (including pitch shift and release), reloads longer samples when necessary, and evicts unused cached data above 128 MiB. An exercise that itself needs more than that budget keeps its required samples. Original recordings remain unchanged. Tests cannot certify the absence of glitches at physical speakers or external audio devices.

## GitHub Pages

The public site is https://ldayton.github.io/DoReGo/ . `.github/workflows/deploy.yml` tests, builds, and deploys each push to `main`; it can also be run manually from Actions. Repository Settings → Pages must use GitHub Actions as the source. Failed checks prevent deployment.

`npm run build:pages` produces `dist-pages/` with the `/DoReGo/` base path. `npm run test:pages` starts a static preview and verifies piano playback, sample paths, defaults, credits, and the absence of export controls. Install the Playwright Chromium browser first with `npm run setup:browser`. The Pages site supports practice. MIDI and video exports are CLI-only; video requires the local FFmpeg rendering server. `npm run build` and `npm start` continue to run the full local app.

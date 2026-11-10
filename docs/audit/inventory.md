# Remotion_System — static audit inventory (for the Blender "video factory" rebuild)

Read-only audit, 2026-11-10. Nothing was installed, executed, rendered or tested. Evidence tags:
**[code]** read in source · **[doc]** only claimed in docs/notes (PROGRESS.md, NOTES.md, ENGINE.md) · **[test]** a test file
asserts it (not run here). Nothing is "[ran]". Paths are repo-relative; branch tags: `M` main, `V2`, `V3`,
`EP` = episode/co-authored-by, `PR` = prod/noir-git-blame. "newest" for shared engine code = `EP` unless stated.
Checkouts: `/home/user/ref/{main,v2,v3,episode_co-authored-by,prod_noir-git-blame}`.

## 1. Branch map

History is linear `main ⊂ v2 ⊂ v3`; `EP` and `PR` both fork from the v3 tip (5a6294b), 4 commits each.

| Branch | Tip | Commits | Adds over parent (`git diff --shortstat`) |
|---|---|---|---|
| main | 8e9db13335b0d6da6e929b21be578151896ddc86 | 6 | Whole V1: engine core, 2 actors, `dev-office`, camera solver, voice pipeline, catalog, single-file CLI, 5 test files; videos `it-works-on-my-machine`, `launch-promo`. (81 files, +9430/−288 after the scaffold commit bf11a55) |
| v2 | 6f9db515713ef5a0507aa96d85314731633ea808 | 20 | 112 files, +7080/−326. New: `AGENTS.md`, `THIRD_PARTY_NOTICES.md`, `.claude/skills/make-episode/`, `src/engine/{fx,ui}/`, `core/{recipes,fx,pacing}.ts`, `actors/ik.ts`, `world/micro-keyboard/`, `audio/{audit,sfx.data}.ts`, `public/sfx/` (27 CC0 WAVs), `catalog/fx.json`, 7 more test files, video `ctrl-z`; live Eleven v4; `review`, `render --master`. |
| v3 | 5a6294b15394fc9b947b3ea40cf6d7df3a13c59d | 26 | 116 files, +7737/−772. New: `src/engine/inspect/` (11 files), `core/{behaviour,spline,trace}.ts`, `camera/choreo.ts`, `audio/{analysis,voiceReport,captionLayout}.ts`, `fx/state.ts`, `world/floating-space/`, CLI split into `scripts/cli/*.ts`, `scripts/{stt,voiceTools,video}.ts`, `scripts/compare-stills.mjs`, `catalog/direction.json`, `tests/{goldens,faults}/`, 9 more test files; videos `one-take`, `ctrl-z-remaster`. |
| episode/co-authored-by | bfc638b60176c8f4a113e73c87a0d4be985b1454 | 30 | 43 files, +1012/−13. **Engine commit 9b8b6d2** (15 files, +195/−12) + video `co-authored-by` + PROGRESS production log. |
| prod/noir-git-blame | 25ccc3d2a2ec07ba0c8e1d13bd73bfc951d78c30 | 30 | 58 files, +4686/−1. **Zero shared-engine changes**: every changed path is under `videos/noir-git-blame/`, `public/videos/noir-git-blame/`, plus one line in `videos/registry.ts`. PROGRESS.md is unchanged from v3; the production log is `videos/noir-git-blame/NOTES.md`. |

**Engine-level difference between the two production branches** [code, `git diff --stat 5a6294b <tip>`]:

- `EP` only (commit 9b8b6d2): `src/engine/audio/musicGain.ts` (new; ramped duck, end fade), `audio/Soundtrack.tsx`
  (`loopVolumeCurveBehavior="extend"`), `core/schema.ts` + `core/timeline.ts` (`music.attack/release/fadeOut`),
  `remotion.config.ts` (`swangle` on Linux, `REMOTION_GL` override), `scripts/cli/{shared,media}.ts` (POSIX `--props`
  quoting), `src/engine/world/shaderGuards.ts` (flat-normal NaN guard, imported by `player/EpisodePlayer.tsx`),
  `tests/music.test.ts`, `tests/shader-guards.test.ts`, catalog/doc updates.
- `PR` has none of that. It solved the same three problems **locally**: `videos/noir-git-blame/tools/bin/npx` (shim that
  repairs `--props`, appends `--gl=swangle`, `--concurrency=1`), a pre-ducked score stem (`tools/build-score.mts`, engine
  duck disabled with `"duck": 1`), and a video-local desk to avoid the RoundedBox artifact (NOTES.md §1,2,5,7).
- "Audio-only render mode" and the "mastering tool" on `PR` are **video-local, not engine features**:
  `videos/noir-git-blame/index.tsx` (`Gated`: `--props='{"audioOnly":true}'` mounts only `<Soundtrack>`) and
  `videos/noir-git-blame/tools/master.mts` (192 kHz look-ahead limiter → two-pass linear loudnorm → mux).
- A rebuild that wants everything must take `EP` as the engine base and port the `PR` video-local tools.

**Dependencies** [code, `package.json`]: identical on v2/v3/EP/PR. Node `^20.19 || ^22.13 || >=24`; `remotion`,
`@remotion/{cli,three,media,captions,noise,layout-utils,paths}` 4.0.536; `three` 0.186.1; `@react-three/fiber` 9.8.2;
`@react-three/drei` 10.7.9; `@react-three/postprocessing` 3.2.0; `postprocessing` 6.39.5; `react`/`react-dom` 19.2.3;
`shiki` 4.0.2; `zod` 4.5.4. Dev: `typescript` 5.9.3, `vitest` 4.1.10, `tsx` 4.23.15, `eslint` 10.12.0, `prettier` 3.8.1.
main lacks only `@remotion/layout-utils` and `@remotion/paths`. External tools assumed on PATH: system `ffmpeg`
(contact sheets, PSNR, loudnorm, whisper filter), PowerShell + Windows SAPI for the `system` voice provider.
Remotion License applies (free ≤3 employees) [doc, THIRD_PARTY_NOTICES.md].

**Best reference per area**

| Area | Use | Why |
|---|---|---|
| Shared engine, CLI, tests, skill, docs | `EP` | superset of v3 + music ramp, Linux GL, NaN guard, 23 test files |
| Voice/takes/analysis | `EP` (= v3) | `scripts/voice.ts`, `src/engine/audio/analysis.ts` |
| Custom set, custom actor, fonts, overlay captions, generated SFX, score building, mastering, audio-only | `PR` `videos/noir-git-blame/` | only place these exist |
| Production gotchas on GPU-less Linux | `PR` `videos/noir-git-blame/NOTES.md` + `EP` `PROGRESS.md` tail | two independent logs of the same environment |
| Original minimal design | `M` | smallest readable version of rig/solver/timeline |

## 2. End-to-end pipeline trace

| Stage | Command | Code path | Notes |
|---|---|---|---|
| Scaffold | `npm run cli -- new <slug> [--env …|custom] [--preset]` | `scripts/cli/scaffold.ts` `newVideo` | writes `videos/<slug>/{BRIEF.md,episode.json,index.tsx}`, appends to `videos/registry.ts`; `--env custom` also writes `video.data.ts` [code] |
| Authoring | edit `episode.json` | schema `src/engine/core/schema.ts` `EpisodeSchema` (zod strictObject → unknown keys are errors); exported to `catalog/episode.schema.json` by `scripts/catalog.ts` | top-level keys: `id,title,engine,profile,allow,defaults,format,seed,set,mood,cast,dialogue,actions,camera,lighting,props,sfx,music,events,fx,captions,end` [code] |
| Custom code | `videos/<slug>/index.tsx` | `src/engine/player/defineVideo.ts` `defineVideo({episode, components, screens, actors, scene, overlay, ...data})` | pure data the Node CLI must see (`environments`, `actorDefs`, `componentKinds`, `screenKinds`) lives in `video.data.ts`, because `@remotion/media` has no Node export [code + doc PROGRESS "Phase 1–4"] |
| Load (Node) | all CLI commands | `scripts/video.ts` `loadVideo`/`resolveVideo`; `scripts/cli/shared.ts` `resolve` | reads episode.json + video.data.ts + `public/videos/<slug>/voice.json` |
| Resolve | implicit | `src/engine/core/timeline.ts` `resolveEpisode(ep, voice, ctx)` → `ResolvedEpisode` (absolute seconds, serializable); `core/recipes.ts` expands `do`; `core/fx.ts`; `world/layout.ts` `resolveLayout`; `core/behaviour.ts` `resolveBehaviour` | [test] `tests/timeline.test.ts`, `recipes.test.ts`, `layout.test.ts`, `behaviour.test.ts` |
| Voice | `voice <slug> [--provider elevenlabs\|system\|fixture] [--force] [--takes l3=3] [--max-credits N] [--no-stt]`; `--check`, `--report`, `--audition l3`, `--show l3` | `scripts/cli/voices.ts` → `scripts/voice.ts` `generateVoices`; `scripts/stt.ts`; `scripts/voiceTools.ts` | see below |
| Validate | `validate <slug>` | `scripts/cli/check.ts` `validate` → resolver errors/warnings, `core/pacing.ts` `beatSheet`, `audio/audit.ts` `auditAudio`, `inspect/inspect.ts` `inspectEpisode` | prints ✖ error / ⚠ warning / · note / ~ accepted-by-intent |
| Inspect / explain | `inspect <slug> [--json]`, `explain <slug> --t 4.2 [--actor id\|--camera]` | `src/engine/inspect/{framing,camera,motion,contact,overlay,grammar}.ts`, `explain.ts`, `core/trace.ts` | per-frame Node evaluation, no rendering; [test] `tests/inspect.test.ts`, `faults.test.ts` |
| Stills | `stills <slug> [--frames a,b\|--edges\|--at findings] [--verify] [--guides]` | `scripts/cli/media.ts` `stills` → `npx remotion render <slug> out/<slug>/stills --sequence --frames=… --image-format=png --props={"silent":true}` then ffmpeg `drawtext`+`tile` → `out/<slug>/contact*.png` | `--verify` re-renders `--concurrency=1` and byte-compares, PSNR < 45 dB fails; `--guides` shades platform UI bands (top 10 %, bottom 20 %, right rail) |
| Preview | `preview <slug> --from s --to s [--scale 0.5] [--strip 8]`; `npm run dev` (Remotion Studio; `.claude/launch.json` port 3000) | `media.ts` `preview` | `out/<slug>/preview.mp4` + `preview-strip.png` |
| Render | `render <slug> [--draft] [--master] [--out] [--timeout]` | `media.ts` `render` → `npx remotion render <slug> out/<slug>.mp4`; composition registered by `src/Root.tsx` from `videos/registry.ts`; player `src/engine/player/EpisodePlayer.tsx` (ThreeCanvas: SetView, ActorView, Lighting, Camera/PostFX; DOM: FxOverlay, overlay, Captions; Soundtrack) | final renders refuse unvoiced/stale lines and missing files, drafts refuse only missing files — enforced both in CLI and in `defineVideo.calculateMetadata` [code] [test `audit.test.ts`] |
| Master | `render --master` | `media.ts`: ffmpeg two-pass `loudnorm I=-14:TP=-1.5:LRA=11 … linear=true`, AAC 256k/48 kHz, video stream copied | `PR` shows it silently goes *dynamic* on high-crest mixes (NOTES §14) → `tools/master.mts` |
| Review | `review <slug>` | `media.ts` `review`: frame sheet from the MP4 (every shot middle + accent peak), `ebur128` LUFS/true peak, clipped samples, per-SFX level vs dialogue RMS, "lands on word" | `out/<slug>/review-sheet.png` |
| Regression | `node scripts/compare-stills.mjs [--baseline dir] <slug>…` | byte-identical count + PSNR + differing-pixel count vs `out/baseline` | baselines are not committed (`out/` is git-ignored) |

**Timing / anchor grammar** [code `core/schema.ts:9`, `core/timeline.ts` `timeOf` ≈ l.147–168] [test `tests/timeline.test.ts`]

```
TIME_REF_RE = /^([A-Za-z][\w-]*)\.(start|end|word:(\d+)(?:\.(start|end))?)([+-]\d+(?:\.\d+)?)?$/
```

- A time is a non-negative number (seconds) or `<lineId>.start | .end | .word:N | .word:N.end`, optional `±offset`.
- `word:N` is 1-based and counts the **timed words of the chosen take** (`line.start + words[N-1].start|end`); a warning is
  raised when timed-word count ≠ script word count. Result is clamped to ≥ 0. Unknown/later line → error, t = 0.
- Dialogue is laid out sequentially: line start = `at` (number or ref to an **earlier** line) else previous end + `gap`
  (default 0.35 s; first line at 0.6 s). Line duration = voice clip duration (after trim) or an estimate (`estimateWords`).
- Episode duration = `end` (time ref) else last cue + 1.5 s; fps default 30; presets landscape 1920×1080, portrait
  1080×1920, square. Shots after `end` are errors; cues after it warn.
- Everything downstream (actions, camera, lighting, props, sfx, events, fx, rack focus, move windows, joint/shot keys)
  uses the same `TimeRef`, so re-voicing re-times the whole film.

**Voice** [code `scripts/voice.ts`, `src/engine/audio/speech.ts`, `audio/analysis.ts`] [test `voice.test.ts`, `voice-performance.test.ts`]

- Providers: `elevenlabs` (`POST /v1/text-to-speech/{voiceId}/with-timestamps?output_format=wav_24000`, default model
  `eleven_v4`, character alignment → words via `wordsFromAlignment`; inline tags like `[sighs]` are performed and stripped
  from captions/word refs); `system` (Windows SAPI through PowerShell, 16 kHz, `SpeakProgress` word timings — Windows
  only); `fixture` (deterministic babble for tests/drafts). Never auto-selected by the presence of a key:
  paid runs require `--provider elevenlabs`; `--max-credits` aborts before any request.
- Output: `public/videos/<slug>/voice/<line>[-t<n>]-<hash>.wav` + `public/videos/<slug>/voice.json`
  (`VoiceManifest {version:1, lines: Record<id | "id#take", VoiceLine>}`).
- `VoiceLine` = `{file, hash, scheme:2, provider, text, duration, words:[{text,start,end}], envelope:{rate:60, values[]},
  model, voiceId, format, tier, generatedAt, take?, analysis?}`. Example (EP, `co-authored-by` `l2`): text
  `"I'm... right here."`, duration 1.92, words `[{"I'm...",0,0.88},{"right",0.96,1.2},{"here.",1.36,1.92}]`, envelope
  116 values @60 Hz, `analysis {noiseFloor −73.5, peak −11.45, loudness −27.59 LUFS, segments [[0.02,0.61],[0.91,1.7]],
  tags [], tail −58.6, f0 {median 218,…}}`.
- Cache key = `voiceFingerprint(voiceRequest(...))` (effective request: provider, text, voice id, model, settings, seed);
  takes use another seed (`takeSeed`), stored as `l3#1`, selected by the line's `take: n | {n, by: director|agent, why}`.
- STT: `scripts/stt.ts` uses ffmpeg's `whisper` filter with a local ggml model (`$WHISPER_MODEL` or
  `~/.cache/remotion-system/whisper/ggml-tiny.en-q5_1.bin`); WER vs script, threshold 20 %. Not available → "words not
  verified". The EP log says clips were checked with *ElevenLabs* speech-to-text instead — **no code for that is in the
  repo** [doc only]. PR notes used faster-whisper/librosa ad hoc — also not in the repo [doc only].
- Engine-2 resolver corrections (`defaults.trim/level/speechMotion`): edge trim as in/out points on the untouched file
  (`ResolvedLine.clip`), per-speaker median levelling (`gain` dB, −12/+6, peak ≤ −1 dBFS), `talkScale`, `shapedTalk`
  (30 ms lead / 70 ms release) for the mouth and `slowTalk` (±0.2 s) for body energy.

**Delivery** [code `audio/Soundtrack.tsx`, `audio/musicGain.ts`, `audio/Captions.tsx`, `audio/captionLayout.ts`]

- Mix = Remotion `<Audio>` per line (`trimBefore`, per-frame volume), per SFX (`volume`), one looped music bed.
  No bus processing, no sample-accurate fades (deferred "M5 mix plan" was never built — see §7).
- Music duck: bed × `duck` under voiced lines ±0.15 s; `EP` engine 2 ramps (attack 0.25 s, release 0.6 s, sine) and fades
  out the last 0.6 s; engine 1 / v3 / `PR` = hard per-frame switch [test `tests/music.test.ts`, EP only].
- Captions are **burned in** as DOM overlay: `@remotion/captions` pages from word timings; styles `subtitle` (name tag +
  progressive words), `pop` (big word highlight), `none`. **No sidecar SRT/VTT export exists** on any branch [code: grep].
- Output: H.264 MP4 via Remotion (`Config.setVideoImageFormat("jpeg")`), AAC; target −14 LUFS / −1.5 dBTP with `--master`.

## 3. Capability inventory

Paths are under `src/engine/` on `EP` unless prefixed. "First" = branch where it first appears.

### Runtime engine — actors and performance

| Capability | Where | First | Evidence / exercised by |
|---|---|---|---|
| Channel-based rig evaluator (flat `Record<string, number>`; no skeleton type) | `actors/rig.ts` (`ActorDefinition`, `ActorTrack`, `actorBase`, `actorFinal`) | M | [code] [test `tests/actors.test.ts`]; every episode |
| Poses (absolute channel sets, cross-faded) | `actors/*/…data.ts` `poses`; `rig.ts` `sequenceAt` | M | [test actors]; `it-works-on-my-machine` (10 pose cues) |
| Emotions (face-channel sets) + `intensity` 0..1 | `rig.ts` `emotionChannels`; intensity V3 | M / V3 | [test `performance.test.ts` "emotion intensity"]; `co-authored-by` |
| Gestures (`set` envelope + additive `add(u)` functions) | `GestureDef` in `rig.ts` | M | [test actors]; `noir-git-blame` (11) |
| Locomotion: queued `move` segments, eased, auto gait from path speed, yaw from heading / `face` | `rig.ts` `moveSegments`, `placementAt` | M | [test actors, timeline "moves queue"]; `launch-promo`, `ctrl-z`, `one-take` |
| Turn cues (deg or toward a place) | `rig.ts` `TurnCue` | M | `ctrl-z`, `noir-git-blame` |
| Look-at (world point / actor anchor / `"camera"` / null), shared by torso·head·pupils | `rig.ts` `lookAngles`; actor `life` | M | [test actors "look-at"] |
| Idle life: breathing, seeded blinks (+ reaction blinks), sway noise, typing jitter | `rig.ts` `blinkAt`; actor `life` | M | [test actors determinism] |
| Mouth animation: amplitude envelope (60 Hz), **not visemes** | `audio/speech.ts` `sampleEnvelope`/`shapedTalk`; `player/scene.ts` `talk` | M / V3 | [test voice, voice-performance]; phoneme track is an explicit non-feature (docs/ENGINE.md §7) |
| Joint overrides (`joints`, absolute/add, duration, blend) | `rig.ts` `applyOverrides` | M | `ctrl-z` payoff, `co-authored-by` shush |
| Keyed joints (Hermite spline via points) | `rig.ts` `overrideValues`, `core/spline.ts` | V3 | [test performance "keyed joints"]; used through `do: facepalm` in `ctrl-z-remaster` |
| Two-bone arm IK / FK, closed form, resolve-time only | `actors/ik.ts` `armIK`, `armFK`, `childFrame` | V2 | [test actors "reach": FK(IK) < 1 cm] |
| Interaction recipes `do`: press, point, pick-up, place, react, sit-down, stand-up, facepalm, sip | `core/recipes.ts` | V2 (facepalm/sip late V2; via points V3) | [test `recipes.test.ts` 14 cases]; `ctrl-z` (press×4, point, pick-up, place, react) |
| Sockets / held props (`hold: {handR: "mug"}`), held item hidden from set | `rig.ts` `HoldCue`; `player/EpisodePlayer.tsx` `HeldItem` | M | `ctrl-z` duck; `noir-git-blame` fedora on mascot `top` |
| Effectors (points + capsules) for contact checks | `actors/*/…data.ts` `effectors`; `rig.ts` `worldEffectors` | V3 | [test `effectors.test.ts`] |
| Listening layer (look at speaker after persona delay, phrase-end nods, blinks on cuts) | `rig.ts` `listenLook`/`listenBeat`; `player/scene.ts` `listenSpec`, `phraseEnds` | V3 | [test performance "listening"]; `ctrl-z-remaster`, `co-authored-by` (`defaults.listen: 1`) |
| Persona (reaction delay, nod amount) | `ActorDefinition.persona` | V3 | [code] rayan 0.2 s/1, claude 0.35 s/0.5 |
| Speech motion (body energy from slow envelope) | `speech.ts` `slowTalk`; `life` `talkBody` | V3 | [test voice-performance "resolved voice"] |
| Engine version gate (`engine: 1|2`), `defaults` switches, `allow` intents | `core/behaviour.ts` | V3 | [test `behaviour.test.ts`]; `catalog/direction.json` |
| Video-local actor | `defineVideo({actors})` + `video.data.ts` `actorDefs`; `actors/check.ts` `checkActorDef` | M (check V2) | `PR` narrator (invisible voice-over actor) |

### Camera

| Capability | Where | First | Evidence |
|---|---|---|---|
| Semantic shots: establishing, wide, full, medium, close, two-shot, over-shoulder, insert, custom | `camera/solve.ts` `SHOT_TYPES`, `shotLayout` | M | [test `camera.test.ts` framing × 3 aspect ratios]; `catalog/camera.json` |
| Solver: side/angle choice, distance fitting vertical and horizontal FOV, height, lead room, perspective-correct | `solve.ts` `shotLayout` | M | [test camera] |
| Occlusion avoidance (boxes of props/walls/actors); only un-authored parameters are corrected; `lock`, `allowOcclusion` | `solve.ts` `segmentHitsBox` | M | [test camera "corrections help, but never override intent"] |
| `track` (aim) / `follow` (body) with `lag`, `lead` | `solve.ts` `shotFrame` | M / lead V3 | [test camera "tracking", choreo "follow lead"]; `launch-promo`, `ctrl-z`, `one-take` |
| Moves: static, push-in, pull-out, truck, orbit, crane, handheld, life; windows (`at`, `duration`), `amount`, `ease` | `solve.ts` `MOVES`; windows V3 | M / V3 | [test choreo "move windows"] |
| Solver-space `keys` (angle/distance/size/height/lens/offset/roll, spline) | `solve.ts`, `core/spline.ts` | V3 | [test choreo]; `one-take` orbit, `noir-git-blame` |
| World-space `path` keys | `solve.ts` | V3 | [test choreo "world paths"]; `noir-git-blame` (3 shots) |
| Focus: `auto` (speaking subject face), `none`, target; `rack`; DOF `{bokeh, range}`; engine-2 focus pull 0.45 s | `solve.ts`; `camera/Camera.tsx` | M / V3 | [test choreo "engine 2 corrections"] |
| `blend` between shots; engine-2 arc blend around subject | `camera/choreo.ts` `arcBlend` | M / V3 | [test choreo] |
| Camera life drift (seeded) | `choreo.ts` `lifeOffset` | V3 | [test choreo]; `co-authored-by` (`cameraLife: 1`) |
| Shake / glitch applied to rendered camera | `fx/state.ts` `cameraWithFx`, `chromaAt` | V2 | [test `fx.test.ts`] |
| Post stack: DepthOfField, Bloom, Vignette, tone mapping, MSAA ×4; `ComposerGate` delayRender | `camera/Camera.tsx` | M | [code]; docs disagree on tone mapper ("AGX" PROGRESS vs "Neutral" ENGINE.md) — unverified |

### Environments, sets, props, screens

| Capability | Where | First | Evidence |
|---|---|---|---|
| Environment = data (shell, items, marks, cameras, bounds, defaultMood, shadowRadius) | `world/<env>/*.data.ts`, `world/environments.ts`, `world/layout.ts` | M | [test `layout.test.ts`] |
| Per-episode overrides `set.remove/move/params/add/shell/marks/cameras` | `layout.ts` `resolveLayout` | M | [test layout "prop parenting", "user-authored data"]; `co-authored-by` (remove mug, add duck) |
| Prop catalog (size = occluder box, anchors, params, `origin: "top"`) + R3F views | `world/props.data.ts` (258 l), `world/props.tsx` (392 l) | M | `catalog/props.json` |
| Timed prop state cues (`props: [{at,item,set}]`), key presses, visibility | `core/timeline.ts`; `world/SetView.tsx` | M | `ctrl-z` (8 cues) |
| Screens: Canvas2D textures redrawn per frame, presets code (shiki), terminal, error, deploy, window, off; `popup` | `world/Screen.tsx`, `world/screens.data.ts`, `ui/drawWindow.ts` | M / window V2 | `catalog/screens.json`; `it-works` |
| Video-local environment + component kinds + screen kinds | `video.data.ts` + `defineVideo({components, screens})` | M | `launch-promo` (5 components, 4 screens), `noir-git-blame` (16 components, 3 screens) |

### Lighting, moods, post

| Capability | Where | First | Evidence |
|---|---|---|---|
| Mood data: key/fill/rim/ambient/hemi/fog/background/exposure/bloom/practicals/pulse; inline `{base, …}` | `lighting/moods.ts`, `lighting/Lighting.tsx` | M | `catalog/moods.json` |
| Timed lighting cues with transition | `timeline.ts` `lighting` | M | `it-works` red-alert; `noir-git-blame` (12 cues, lightning) |
| Non-temporal post only (determinism rule) | AGENTS.md rules | M | [doc] |

### Graphics, overlays, text, captions

| Capability | Where | First | Evidence |
|---|---|---|---|
| `fx` accents: text (pop/stagger/slam/type), window, callout, impact, shake, glitch, flash, dip | `core/fx.ts`, `fx/{state,FxOverlay,FxWorld}.tsx` | V2 | [test `fx.test.ts`]; `catalog/fx.json`; `ctrl-z` (12) |
| `AppWindow` (DOM) + `drawWindow` (Canvas) on one model: chat, terminal, dialog, notification | `ui/{window,AppWindow,drawWindow}.ts(x)` | V2 | [test fx "AppWindow model"] |
| `KineticText` (auto-fit via `@remotion/layout-utils`) | `ui/KineticText.tsx` | V2 | `ctrl-z` |
| `events` + `useEvent(name)` hook for custom components | `timeline.ts`; `engine/index.ts` | M | `launch-promo` (title, beat, endcard), `noir-git-blame` (11) |
| Captions (see §2) + `caption` text override | `audio/Captions.tsx`, `captionLayout.ts` | M / V3 | [test voice "captions"] |
| Custom overlay captions (typewriter + serif), film grain, end card | `PR` `videos/noir-git-blame/overlay.tsx` | PR | video-local; outside `inspect` overlay checks (NOTES §11) |

### Audio

| Capability | Where | First | Evidence |
|---|---|---|---|
| Voice generation, cache, takes, analysis, STT, report/audition/show | `scripts/voice.ts`, `voiceTools.ts`, `stt.ts`; `audio/{speech,analysis,voiceReport}.ts` | M / V3 | [test voice, voice-performance] |
| SFX library by name (27 local CC0 + legacy remote meme URLs flagged `unknown`) | `audio/sfx.data.ts`; `public/sfx/` | V2 | [test `audit.test.ts` "sfx library"]; `catalog/sfx.json` |
| Generated SFX via `sfx[].prompt` (ElevenLabs `/v1/sound-generation`) | `scripts/voice.ts` `elevenLabsSfx` (≈ l.221, 492–504) | M | [code]; EP bed/room tone/squeak say "ElevenLabs sound generation" [doc] |
| Episode-local generated SFX with provenance hashes | `PR` `tools/gen-sfx.mts`, `tools/sfx.json`, `public/videos/noir-git-blame/sfx/provenance.json` | PR | video-local |
| Music bed, loop, duck | `audio/Soundtrack.tsx`, `musicGain.ts` | M / ramp EP | [test music, EP] |
| Sidechain-ducked score stem | `PR` `tools/build-score.mts` (ffmpeg `sidechaincompress`) | PR | video-local; must be rebuilt after timing changes |
| Mastering −14 LUFS | `scripts/cli/media.ts` `render --master` (V2); `PR` `tools/master.mts` (oversampled limiter) | V2 / PR | [doc] measured −13.8 LUFS, −2.1 dBTP |
| Audio-only render | `PR` `videos/noir-git-blame/index.tsx` `Gated` | PR | video-local |
| Audio readiness audit | `audio/audit.ts` `auditAudio` | V2 | [test audit] |

### Agent tooling

| Capability | Where | First | Evidence |
|---|---|---|---|
| CLI (`list, show, new, voice, validate, inspect, explain, stills, preview, render, review, catalog`) | `scripts/cli.ts` + `scripts/cli/{discover,scaffold,voices,check,media,shared}.ts` | M (split V3) | [code] |
| Generated catalog | `scripts/catalog.ts` → `catalog/{actors/*,environments/*,camera,direction,fx,moods,props,screens,sfx}.json`, `episode.schema.json` | M | [test `catalog.test.ts` freshness] |
| Skill `make-episode` | `.claude/skills/make-episode/SKILL.md` + `references/{creative-direction,direction-cookbook,qa-render}.md` + `evals/evals.json` (2 prompts, assertions) | V2 | [doc] eval results in PROGRESS only; grader `grade.mjs` not committed |
| Findings with source + intent (`allow`) | `inspect/findings.ts`, `core/trace.ts`, `core/behaviour.ts` `INTENTS` (14) | V3 | [test inspect, faults] |
| Golden visual-state hashes | `inspect/sweep.ts`; `tests/goldens/{ctrl-z,it-works-on-my-machine,launch-promo}.json` | V3 | [test `golden.test.ts`, `sweep.test.ts`] |
| Pacing / beat sheet (hook ≤ 1.5 s, dead air ≤ 1.5 s) | `core/pacing.ts`; profile `standard` | V2 | [test `pacing.test.ts`] |
| Secrets hygiene | `.env.example`; `.gitignore` | V2 | [test `secrets.test.ts`] |

### Tests (EP; 23 files, 169 literal `it(` — docs claim 221 with parametrised cases; v3 = 21 files / "215")

| File | Asserts (from `describe` blocks) |
|---|---|
| `tests/actors.test.ts` | determinism, look-at, resolve-time arm reach |
| `tests/audit.test.ts` | `auditAudio` readiness, sfx library licences |
| `tests/behaviour.test.ts` | engine version, profile, intent resolution |
| `tests/camera.test.ts` | framing across aspect ratios, tracking, corrections never override authored values |
| `tests/catalog.test.ts` | committed catalog equals generated; every video resolves |
| `tests/choreo.test.ts` | spline, move windows, solver keys, world paths, lead/life, engine-2 corrections |
| `tests/effectors.test.ts` | Rayan and mascot effectors vs FK and anchors |
| `tests/faults.test.ts` + `tests/fault-set.ts` + `tests/faults/*.json` (10) | fault fixtures load: arm-through-face, camera-in-prop, caption-over-face, cut-mid-word, floating-feet, focus-off-screen, jump-cut, teleport + controls (silence, offscreen) |
| `tests/floating-space.test.ts` | environment geometry, marks, walkable bridge |
| `tests/fx.test.ts` | accent resolution, AppWindow model |
| `tests/golden.test.ts` | per-second visual digests of 3 finished videos |
| `tests/inspect.test.ts` | inspect finds every fault; intent controls accepted; explain |
| `tests/layout.test.ts` | prop parenting, cycles, user-authored overrides |
| `tests/music.test.ts` (EP) | ramped duck, engine-1 hard switch equality, fade out |
| `tests/pacing.test.ts` | hook / dead-air notes |
| `tests/performance.test.ts` | listening, emotion intensity, keyed joints, via-point self-touch |
| `tests/recipes.test.ts` | all recipes standing and seated, hand-to-self |
| `tests/secrets.test.ts` | no key in tracked files |
| `tests/shader-guards.test.ts` (EP) | flat-normal guard patches the chunk once |
| `tests/sweep.test.ts` | sweep order independence, digests |
| `tests/timeline.test.ts` | resolver, time refs, same-speaker overlap |
| `tests/voice-performance.test.ts` | LUFS, floor/segments, trim, levels, WER, takes, credit cap, engine-2 voice corrections |
| `tests/voice.test.ts` | WAV helpers, mocked ElevenLabs, cost safety, fingerprint, cache, captions, tags; fixture `tests/fixtures/elevenlabs-v4.json` |

### Review tools

`stills` (+`--edges`, `--at findings`, `--guides`, `--verify`), `preview` strip, `review` sheet + mix report,
`scripts/compare-stills.mjs`, `voice --show` waveform PNG, `voice --audition` WAV, skill evals
(`.claude/skills/make-episode/evals/evals.json`). All are [code]; none of their outputs are committed.

## 4. Assets and data

**Everything visible is procedural.** No `.glb/.gltf/.fbx/.obj`, no image textures, no HDRIs in any branch [code:
`git ls-files`; no `useGLTF`/`useTexture`/`TextureLoader` in `src/`]. Characters, props and sets are React Three Fiber
JSX built from three.js primitives (boxes, cylinders, spheres, torus, circle, drei `RoundedBox`, `THREE.Points`),
flat-shaded standard materials, with Canvas2D textures for screens/signage. A Blender rebuild must **model every asset
from the TSX dimensions**; there is nothing to import.

| Kind | Count | Catalog names (EP) | Source files |
|---|---|---|---|
| Actors | 2 (+1 video-local) | `rayan` (humanoid, 1.78 m, 46 channels), `claude` (mascot "creature", 0.27 m at scale 1, 21 channels); `narrator` (PR, bodiless) | `actors/rayan/{rayan.data.ts 370 l, Rayan.tsx 266 l}`, `actors/claude/{claude.data.ts 192 l, Claude.tsx 98 l}` |
| Rayan poses (12) | | stand_idle, explaining, arms_crossed, thinking, shrug, celebrate, sit_idle, sit_typing, sit_explaining, sit_arms_crossed, walk, crouch | `rayan.data.ts` |
| Rayan emotions (6) / gestures (9) | | neutral, happy, skeptical, shocked, angry, tired / flinch, stomp, wave, nod, head_shake, facepalm, double_take, beat, type_burst | |
| Claude poses (9) | | stand_idle, asking_question, explaining, side_glance, caring_lean, proud_puff, startled_back, celebrate, walk | `claude.data.ts` |
| Claude emotions (8) / gestures (7) | | neutral, curious, skeptical, happy, shocked, annoyed, pleading, tired / flinch, hop, nod, shake, spin, wiggle, beat | |
| Props | 19 | desk, office_chair, monitor, keyboard, mug, desk_lamp, plant, bookshelf, rug, window (M); giant_keyboard, giant_screen, rubber_duck, dust_motes (V2); floating_island, light_bridge, starfield, planet, space_rocks (V3) | `world/props.data.ts`, `world/props.tsx`, `world/micro-keyboard/MicroKeyboard.tsx`, `world/floating-space/FloatingSpace.tsx` |
| Environments | 3 shared (+2 video-local) | `dev-office` (12 items; marks chair-seat, desk-mascot, beside-desk, door; cameras establishing, wide-front, high-corner), `micro-keyboard` (4 items; marks on-g/h/enter/ctrl/z/x/a/space, drop-enter), `floating-space` (10 items; 7 marks; 5 cameras); `launch-stage` (launch-promo), `pi-office` (PR, 19 items, 5 marks, 3 cameras) | `world/*/…data.ts`; `videos/*/video.data.ts` |
| Moods | 6 | day-office, late-night, red-alert, soft-studio (M); macro-warm (V2); space-cool (V3) | `lighting/moods.ts` |
| Shots / moves | 9 / 8 | see §3 camera | `camera/solve.ts` |
| Screens | 6 | code, terminal, error, deploy, window, off | `world/screens.data.ts` |
| fx accents | 8 | text, window, callout, impact, shake, glitch, flash, dip | `core/fx.ts` |
| Intents | 14 | silence, slow-open, offscreen, back-of-head, abrupt, clipping, floating, text-over-face, jump-cut, cross-line, mid-word-cut, soft-focus, static, quick-cuts | `core/behaviour.ts` |

**Audio assets** (committed)

| Path | Size | Source | Licence |
|---|---|---|---|
| `public/sfx/*.wav` (27: key-clack, key-slam, impact-{heavy,medium,soft,wood,metal}, click, select, toggle, tick, pop, pluck, error, glitch, scratch, confirm, notify, window-open, window-close, power-up, power-down, success, zap, whoosh, whip, mouse-click) | ≈1.4 MB total (3–125 KB each) | Kenney Interface/Impact/Digital Audio; whoosh/whip/mouse-click via remotion.media (freesound CC0) | **CC0-1.0** (`THIRD_PARTY_NOTICES.md`, `audio/sfx.data.ts` per-file `license/author/source/original`) |
| Remote meme sounds (29 names: vine-boom, windows-xp-error, ding, record-scratch, anime-wow, yippee, switch, …) | not committed; fetched from Remotion-hosted URLs at render time | Remotion `sfx` | **unknown rights**, flagged; used only by the two V1 videos |
| `public/videos/it-works-on-my-machine/voice/` 7 WAV 495 KB; `launch-promo` 5 WAV 546 KB; `one-take` 7 WAV 536 KB | | Windows SAPI (`provider: system`) | no restriction stated |
| `public/videos/ctrl-z/voice/` 5 WAV 682 KB; `ctrl-z-remaster` 1 WAV 127 KB | | ElevenLabs `eleven_v4`, tier `free` | **non-commercial forever**, title must credit elevenlabs.io |
| `public/videos/co-authored-by/voice/` 19 WAV (11 lines + 8 alt takes) 2.0 MB; `sfx/{lofi-bed.mp3 722 KB, roomtone.mp3 1.2 MB, duck-squeak.wav 30 KB}` | | ElevenLabs v4 voices (Liam / Jessica) + ElevenLabs sound generation (`eleven_text_to_sound_v2`) | free plan → non-commercial (BRIEF.md l.57, PROGRESS tail). No CREDITS file for this video |
| `PR public/videos/noir-git-blame/voice/` 16 WAV 2.0 MB | | ElevenLabs v4, "Callum" + "Liam", free | non-commercial, credit elevenlabs.io (`CREDITS.md`) |
| `PR …/music/{Night_on_the_Docks_-_Sax.mp3 5.9 MB, Bass_Walker.mp3 6.5 MB, Fast_Talkin.mp3 2.5 MB}`, `score.wav` 10.6 MB (derived) | 24.9 MB | Kevin MacLeod, incompetech.com | **CC BY 4.0**, attribution required |
| `PR …/sfx/*.wav` 14 files 11.4 MB + `provenance.json` | | ElevenLabs sound generation; 3 local derivations | free plan → non-commercial |

**Fonts**: shared engine uses system stacks only (`src/engine/fonts.ts`: Segoe UI / Arial, Segoe UI Black / Arial
Black, Consolas / DejaVu Sans Mono) — glyphs differ per OS, so renders are not cross-platform identical. `PR` bundles
`public/videos/noir-git-blame/fonts/`: Special Elite (Apache-2.0), Playfair Display (OFL-1.1), VT323 (OFL-1.1), licence
texts alongside, loaded behind a `delayRender` `FontGate`. Repo code licence: `UNLICENSED`, private (`package.json`).
Design patterns adapted from Remocn and Onda (both MIT), "no code copied" [doc THIRD_PARTY_NOTICES.md].

## 5. Episodes

No rendered MP4/PNG output is committed on any branch (`out/` is git-ignored). Voice audio **is** committed for all 7.
All are 30 fps. Durations are [doc] (PROGRESS / NOTES), since nothing was resolved here.

| Slug (first branch) | Format / length | Engine | Cast @ placement | Set | Custom code | Capabilities exercised | Voice |
|---|---|---|---|---|---|---|---|
| `it-works-on-my-machine` (M) | 16:9, 30.4 s | 1 | rayan seated `chair-seat` (`sit_typing`); claude `desk-mascot` ×1.6 | shared `dev-office` + 2 screen params | `index.tsx` 28 l: `EndTitle` overlay | 7 lines, 22 actions (pose/emotion/gesture/look only), 12 shots (close, OTS, insert, two-shot, establishing), lighting cue, screen prop cues, 4 remote meme SFX, 1 event. No contact, no locomotion | SAPI, 7 clips |
| `launch-promo` (M) | 9:16, 28.7 s | 1 | claude `podium-top` ×4.2; rayan `stage-left` | **video-local** `launch-stage` (`video.data.ts` 39 l) | `index.tsx` 281 l: StageFloor, Cyclorama, Podium, HoloScreen, NeonBar, StageSpots, Confetti, Overlay, `ShadowPrepass`, 4 screen drawings | custom set, 1 walk + `follow` shot, 6 events driving custom components, kinetic overlay, `pop` captions, 6 remote meme SFX | SAPI, 5 clips |
| `ctrl-z` (V2) | 9:16, 31.3 s | 1 | rayan falls from `[6.056,2.9,0]`; claude ×2 on a key | shared `micro-keyboard` | none (5-line `index.tsx`) + `BRIEF.md` | **character-to-prop contact**: press×4 (stomp sinks key), point, pick-up + carry + place (duck onto CTRL), react; 7 moves, `follow` + `track`; 12 fx (impact, shake, slam text, windows, callouts, glitch); raw `joints` face-in-hand; CC0 SFX | ElevenLabs v4 free, 5 clips |
| `ctrl-z-remaster` (V3) | 9:16, 9.2 s | 2 | same world, payoff only | `micro-keyboard` | none + `BRIEF.md` | via-point `do: facepalm`, listening (`defaults.listen: 1`), reaction cut, `allow` | 1 clip reused |
| `one-take` (V3) | 9:16, 14 s | 2 | rayan `stand-right`, claude `stand-left` ×4 | shared `floating-space` | none + `BRIEF.md` | **camera tracking showcase**: one `follow {lag 0.6, lead 0.3}` shot with 3 solver `keys` orbiting 160°→30° around a walker, 1.2 s arc `blend`, focus pulls; no sfx/fx | SAPI, 3 lines + 4 alt takes |
| `co-authored-by` (EP) | 9:16, ≈34.8 s (1044 frames) | 2 | rayan seated (`sit_explaining`, listen 0); claude `desk-mascot` ×1.5 (listen 1) | shared `dev-office`, `remove: [mug]`, `add` duck (`rubber_duck`, scale 0.36, recoloured), 2 screens | none + `BRIEF.md` (75 l) | 11 lines with tags, recorded take choices, 17 shots (5 custom, authored angles/offsets, 2 inserts), `cameraLife`, listening, 2 `joints` "shush" overrides, 3 fx (terminal window, pop text, callout pinned to duck), **generated bed + room tone + squeak**, ramped music duck. No recipes, no locomotion | ElevenLabs v4 free, 11 + 8 takes |
| `noir-git-blame` (PR) | 9:16, ≈55 s (1659 frames; NOTES says "~54 s") | 2 | claude `desk-top` ×1.8 wearing fedora (`hold: {top}`); rayan enters from `hall`; bodiless `narrator` | **video-local** `pi-office` (19 items, 16 custom kinds) | `set.tsx` 1094 l, `video.data.ts` 120 l, `screens.ts` 120 l, `overlay.tsx` 124 l, `lib.ts` 98 l, `index.tsx` 96 l, `tools/` (score, sfx, master, npx shim), `NOTES.md` 175 l | most episode-specific customization: custom set + actor + screens + captions + fonts + grain + end card; 12 lighting cues (lightning), 11 events, 18 shots (11 custom, 3 `path`, 1 `keys`, rack, roll, dolly zoom), `do: point`, 2 moves, **generated SFX with provenance, CC-BY score stem, sidechain duck, limiter master, audio-only + split render** | ElevenLabs v4 free, 16 clips |

**Recommended baseline episode for the rebuild: `ctrl-z` (V2, frozen)** — it is the only episode that combines
locomotion, tracked/follow camera, hand-to-prop contact (pick-up → carry → place → press), prop state changes, fx
accents and real word-timed voices, has **zero custom code** (so parity is purely an engine question), has a committed
golden (`tests/goldens/ctrl-z.json`), a documented editorial review (PROGRESS "Ctrl+Z — editorial review") and a
documented list of known defects from `inspect` (PROGRESS M1 triage: arm through face 28.4–31.2 s, unreachable IK at
20.6/22.2 s, 44 cm/frame celebrate snap) that a rebuild should beat. Secondary: `co-authored-by` for the seated
dialogue + audio-bed path (newest engine), `one-take` for camera choreography, `noir-git-blame` for the custom-set and
delivery path. Caveat: `ctrl-z` voices are free-plan ElevenLabs (non-commercial).

## 6. How actors are structured for animation

**There is no skeleton, skinning or mesh deformation.** An actor is rigid primitive meshes inside nested transform
groups; its entire animatable state is `Channels = Record<string, number>` (`actors/rig.ts`). Each `ActorDefinition`
declares `channels: Record<name, {rest, min, max}>`; the view (`Rayan.tsx`) reads them as Euler XYZ rotations (radians)
or scalars. Conventions (`rayan.data.ts` header): metres, +Y up, actor faces **+Z**, +X = actor's left; yaw in degrees,
0 = facing +Z. `head.x`/`torso.x` positive = forward/down; `hip.x` negative = leg forward; `knee.x` positive = bend.
(Blender is Z-up/−Y-forward: a fixed axis conversion and an Euler-order decision are needed.)

Rayan joint hierarchy (offsets in metres from `Rayan.tsx` / `rayanEffectors`; names in brackets are the channels):

```
root (ground position + yaw, uniform scale)                      ← placement, not channels
└ pelvis  pos [0, pelvis.y, 0]  rot [pelvis.x,0,0]               rest pelvis.y 0.72 (seated 0.44, crouch 0.37)
  ├ torso  +[0,0.06,0]  rot torso.{x,y,z}
  │ ├ neck +[0,0.46,0] (no rotation)
  │ │ └ head +[0,0.07,0] rot head.{x,y,z}   centre +[0,0.19,0], face front z +0.23, socket "head" +[0,0.45,0]
  │ │     face channels: browL/R.y, browL/R.rz, lidL, lidR, pupil.x, pupil.y, mouth.open, mouth.wide, mouth.smile, blush
  │ └ shoulderL/R  +[±0.25,0.38,0] rot shoulder?.{x,y,z}   rest [0.05,0,±0.14]
  │     └ elbow  +[±0.02,-0.23,0] rot elbow?.{x,y,z}       rest x −0.28
  │         └ wrist +[0,-0.22,0] rot wrist?.{x,y,z}
  │             └ palm socket "handL"/"handR" +[0,-0.04,0.04]
  └ hipL/R  +[±0.1,-0.05,0] rot hip?.{x,y,z}
      └ knee +[0,-0.34,0] rot [knee?.x,0,0]  → ankle +[0,-0.31,0.035] → sole +[0,-0.0375,0]
```

46 channels total. No fingers, no spine chain, no shoulder/clavicle, no foot/ankle rotation, no foot IK (feet are
"planted" only because poses are authored so). The mascot (`claude.data.ts`) has **no joints**: `body.{y,z,rx,ry,rz}`,
`squash`, `squash.emotion`, `footL/R.{y,z}`, `eyeL/R.{x,y,sx,sy,rz}` (21 channels) — object-level squash/tilt + eye
shape scaling; sockets include `top`.

**Pose format** — a partial channel map merged over rest values (`poseChannels`), e.g. `rayan.data.ts`:

```ts
sit_typing: { description: "Seated, leaning in, hands on a keyboard; fingers type automatically.",
  set: { "pelvis.y": 0.44, "hipL.x": -π/2, "hipL.y": 0.06, "kneeL.x": π/2, "hipR.x": -π/2, "hipR.y": -0.06, "kneeR.x": π/2,
         "torso.x": 0.12, "head.x": 0.14,
         "shoulderL.x": -0.7, "shoulderL.y": -0.22, "shoulderL.z": 0.15, "elbowL.x": -1.05, "elbowL.y": 0, "elbowL.z": 0,
         "shoulderR.x": -0.7, "shoulderR.y": 0.22, "shoulderR.z": -0.15, "elbowR.x": -1.05, … } }
```

**Layering order per frame** (`actorBase` → `actorFinal`, all pure functions of `t`, recomputed from cue history):

1. Placement/locomotion: `moves` → queued segments (speed default `def.walk.speed`, ease `smooth`), yaw events
   (heading 0.35 s, turns 0.4 s), `walk` amount from path speed (central difference), `walkPhase = dist / stride · 2π`.
2. Pose: `sequenceAt` cross-fade, default transition 0.4 s (each cue blends from wherever the previous one had got to).
3. Emotion: same, 0.22 s, only face channels; optional `intensity`.
4. Gestures: for `t ∈ [at, at + duration/speed]`: `set` lerped by an attack/release envelope (defaults 0.2/0.25 s) ×
   intensity; `add(u)` offsets (code functions, e.g. nod = `sin(4πu)·0.2·sin(πu)` on `head.x`) summed.
5. Framing anchors (`feet, waist, chest, head, face, top`) computed here, before life, so cameras stay steady.
6. Look (0.35 s blends; listening fills `1 − authored weight`) + `def.life(c, signals)`: breath, blink, talk, talkBody,
   gaze split (torso 0.22 / head 0.6 / pupils), gait procedural walk cycle (hips ±0.5 rad, knees, arm swing, bob), typing.
7. `joints` overrides (`OverrideCue`: absolute lerp or additive, blend 0.25 s default, optional duration, optional
   spline `keys`), then clamp every channel to `[min, max]`.
8. Holds: `{socket: item|null}` step function → item rendered as a child of the socket group.

Gestures as code closures and `life` as imperative code are the two things that cannot be copied as data; for Blender
they must be re-expressed as sampled F-curves/NLA strips or re-implemented in Python and baked per frame.

**Action example** (`videos/ctrl-z/episode.json`, V2):

```json
{"at": "l4.end+0.25", "actor": "rayan", "do": "pick-up", "item": "duck", "sound": "pop", "volume": 0.7}
{"at": "l4.end+1.75", "actor": "rayan", "do": "place", "target": "keyboard.key:ctrl", "sound": "impact-soft", "rotation": -20}
{"at": "l5.end+0.45", "actor": "rayan", "joints": {"shoulderR.x": -1.993, "shoulderR.y": 0.674, "elbowR.x": -1.142, "head.x": 0.45, "torso.x": 0.2, "lidL": 0.85, "lidR": 0.85}, "transition": 0.3}
```

**Hand-to-prop contact** (`core/recipes.ts`, `actors/ik.ts`; [test `recipes.test.ts`, `actors.test.ts`]):

- It is **resolve-time baking, not runtime constraints**. A `do` action expands into ordinary cues: optional `move`
  (walk within reach), `pose: crouch` for low targets, `look`, a `joints` override whose values come from
  `def.reach(c, target, side)` → `armIK` (closed-form two-bone: shoulder Euler XYZ + elbow hinge about X, pole vector
  `[±0.6,−1,−0.25]`, out-of-reach → straight arm, `reached: false`), then `hold` at the contact time (pick-up: reach
  start + 0.45 s), then release/stand/look-away cues, plus `props` cues and `sfx` at the contact moment.
- Grab = re-parenting: the item disappears from the set and renders under the palm socket. There is no grip pose, no
  finger animation, no hand orientation solve (wrist channels are zeroed by `reach`).
- Place = a hidden copy of the item at the destination toggled visible at contact (keeps camera occluders static);
  on a pressable anchor (`keyboard.key:<id>`) its weight issues the key-down prop cue.
- Press: standing on the key → `stomp`/`hop` gesture, contact at `stompContact` (0.45) of the gesture, root moved down
  by key travel in 0.07 s; otherwise a hand tap at +0.28 s.
- Self-contact (`facepalm`, `sip`): `selfReach(…, {precise})` targets a point in the bowed head's frame, keyed through a
  via point in front of the chest over 0.6 s (engine 2).
- Verification is separate: recipes record `contact {at, point, side, reached}` in the trace and `inspect/contact.ts`
  checks miss distance (`MISS` 0.1 m), limb-in-head depth (0.04/0.06 m), forearm through furniture top, floating feet
  (0.03 m) from `effectors`. The IK is evaluated against the actor's base at that instant, so later looks/life can
  move the body after baking (documented cause of the precise-mode `head.y` hold).

## 7. Not verifiable, absent, or only claimed

- **Nothing was executed**: test counts ("221 tests"), golden equality, render times, LUFS numbers, determinism results
  and STT recall are all [doc]. Literal `it(` count on EP is 169 in 23 files.
- **No rendered outputs** anywhere in git: `out/<slug>.mp4`, contact sheets, `out/baseline*/`, `out/skill-eval/`,
  `out/ctrl-z-remaster/compare/`, auditions and waveform strips are all referenced in PROGRESS but absent.
- **Absent tooling referenced in docs**: `grade.mjs` (skill eval grader), `.claude/skills/make-episode-workspace/`
  (git-ignored), the whisper model, ElevenLabs STT usage (EP log) and the librosa/faster-whisper stem analysis (PR
  NOTES §12–13) have no code in the repo.
- **Planned but never built** (PROGRESS V3 plan): M5 sound and mix (sample-accurate fades, mix plan), M6 look and
  captions (character light, face exposure), M7 delivery (bundle reuse, props-injected episodes), M8 skill pilot/evals.
  M3 "blind comparator review" not run; M3/M4 director reviews "pending".
- **No subtitle sidecars, no thumbnails/cover export, no multi-aspect re-export, no upload step** in code.
- **Tone mapping** stated as AGX (PROGRESS phase 0) and Neutral (ENGINE.md §3) — not checked in `Camera.tsx`.
- `noir-git-blame` length: NOTES says "~54 s"; the split render covers frames 0–1658 (55.3 s at 30 fps).
- PR `index.tsx` comment cites "NOTES.md, problem 14" for audio-only and `master.mts` cites "problem 13"; the notes
  number them 15 and 14 (stale cross-references after "notes 13-15" were added).
- `/home/user/Remtion_System` itself is checked out at main (8e9db13) on branch `claude/zen-einstein-9a53hz`; its
  CLAUDE.md is the V1 text. All later material was read from `/home/user/ref`.

**Search for "Missing Frame", "HyperFrames", "Blender"** (case-insensitive, all five trees + `git grep` on each tip +
commit messages): "Missing Frame" — **0 hits**. "Blender" — **0 hits**. "HyperFrames" — 0 hits on main; exactly three
hits, identical on v2, v3, EP and PR:

- `CLAUDE.md:7` — "HyperFrames / general-video / motion-graphics skills — this repository has its own engine and
  workflow." (end of the sentence starting l.5: "…use the project skill **`make-episode`** … Don't route these requests
  to the globally installed HyperFrames / general-video / motion-graphics skills…")
- `PROGRESS.md:170` — "requests to the skill rather than the global HyperFrames/video skills."
- `.claude/skills/make-episode/SKILL.md:3` (frontmatter `description`) — "…In this repo, use this instead of the
  HyperFrames / general-video / motion-graphics skills."

So HyperFrames is mentioned only as an *external, globally installed skill to avoid*; it is not a dependency and no
HyperFrames code or config exists here. Nothing in the repo anticipates Blender.

## 8. Gotchas and lessons a rebuild must respect

Determinism and rendering (PROGRESS phases 0–4, ENGINE.md §8)

- Every on-screen value is a pure function of `t`; frames are rendered out of order in parallel tabs. No accumulation,
  no `Math.random`/`Date`, no temporal post. A cache keyed by rounded time once broke order independence.
- Async-built content corrupts first frames: EffectComposer needed `ComposerGate`; SMAA lookup textures were replaced by
  MSAA; fonts need a `delayRender` gate (PR `FontGate`); pre-passes (reflections) read last frame's shadow maps
  (`ShadowPrepass`).
- Residual 1–4/255 noise on translucent pixels across render orders is accepted; scene *state* is exact (goldens hash
  state, not pixels).
- GPU-less Linux: SwiftShader works but costs ≈2.4–5 s per 1080×1920 frame, and extra tabs do not help (PR NOTES §6:
  `--concurrency=1`); a 55 s film ≈ 70 min–2 h. `dust_motes` point sprites render as squares under SwiftShader
  (NOTES §3, unfixed). Zero-derivative slivers produced NaN normals (fixed on EP only).
- Remotion: `--props` JSON needs POSIX quoting; sparse `--frames` lists crash audio mixing unless `silent`; a missing
  audio file aborts any render; an audio-only render still mounts the 3D scene unless the composition opts out.

Direction and acting (AGENTS.md gotchas, PROGRESS reviews)

- Seated actors need seated poses; the stock `facepalm` gesture is tuned for seated and misses standing → use recipes.
- Gestures along the lens axis vanish — shoot pointing from the side. A subject looking at another actor may face
  away from a solver-chosen camera → `look: "camera"` or an authored `angle`.
- Solver closes put the eyeline into the lens; coverage can cross the 180° line; monitors block two-shots in
  `dev-office` (monitors at the seated actor's left, mascot at the right).
- Numeric camera `height` is metres **relative to the subject's face**, not the floor (NOTES §4, doc gap).
- Mascot scale: 1.5–1.8 on a desk, ~2 on giant keys, ~4 beside Rayan.
- A 0.25 s pose transition into `celebrate` moves hands 44 cm in one frame; the teleport rule (step ≥ 3× neighbours)
  misses uniformly-too-fast motion — a peak-speed check is still missing.
- Coarse furniture boxes include empty space under tabletops → only forearms through a top count as clipping.
- Authored values are never auto-corrected; deliberate choices are marked with `allow` and reported as accepted.
- Engine-1 videos are frozen: new automatic behaviour must be gated on `behaviour.defaults` and prove golden equality.
- Vertical-video safe areas: keep faces/text out of top 10 %, bottom 20 %, right rail; medium shots clipped heads
  into the top band on the first EP render. Slam text ≈200 px, UI text 60–70 px at 1080 wide.

Voice and audio

- ElevenLabs alignment stretches a line's last word to the end of the file → protect a word only as long as its sound
  lasts when trimming. v4 alignment includes tag characters; cost = 1 credit per character including tags.
- SAPI word timings assume 16 kHz. System voices are Windows-only; on Linux use `fixture` for timing drafts.
- Unknown CLI flags are ignored: `voice --dry-run` spent 584 credits (NOTES §9). The CLI needs strict flag parsing.
- `music.src` resolves from `public/`, `sfx` from `public/videos/<id>/` (NOTES §8).
- Levelling is per speaker, not across speakers: narrator/Claude sat 4.5 dB under Rayan until hand `gain` (NOTES §13).
- Hard per-frame duck steps ≈ 9 dB at `duck 0.35` on v3/PR; `--master`'s "linear" loudnorm silently turns dynamic when
  crest factor > 12.5 dB; sample-peak limiting leaves inter-sample overs (+0.1 dBTP) → oversampled limiter first.
- SFX must be placed by measurement: onset offsets inside clips (door bang 0.41 s in), keep hits off words and within
  ≈ +5 dB of dialogue; bed never under ≈ −25 LUFS; music 9–14 dB under every line.
- No narrator/voice-over concept in the engine; PR fakes it with a bodiless actor whose anchors sit on the detective.
- The agent cannot hear: every audio judgement in the logs is "measured, not heard"; take choices record
  `by: agent | director`.

Process

- Network to npm was ~18 KB/s in the original environment (hence no Google Fonts, no three typeface files, canvas-text
  planes instead of `Text3D`).
- Skill evals barely separated with/without-skill runs on objective assertions (24/24 vs 23/24); the value was in
  briefs, hooks and the QA loop. Baseline cost: 1,017–1,421 s and ~250 k tokens per agent to reach validated stills.
- Free-plan ElevenLabs output and the remote meme sounds block monetization of every committed episode as-is; the
  noir score additionally requires CC BY attribution.

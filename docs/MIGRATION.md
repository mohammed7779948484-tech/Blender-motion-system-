# Migration matrix

Source repository: `mohammed7779948484-tech/Remtion_System` (read-only reference). Exact commits inspected:

| Branch | Commit | Role |
|---|---|---|
| `main` | `8e9db13335b0d6da6e929b21be578151896ddc86` | V1 |
| `v2` | `6f9db515713ef5a0507aa96d85314731633ea808` | recipes/IK, fx accents, CC0 sounds, skill |
| `v3` | `5a6294b15394fc9b947b3ea40cf6d7df3a13c59d` | inspect/explain, camera choreography, performance layer, voice analysis |
| `episode/co-authored-by` | `bfc638b60176c8f4a113e73c87a0d4be985b1454` | **starting point** (v3 + music ramp, Linux GL, shader guard) |
| `prod/noir-git-blame` | `25ccc3d2a2ec07ba0c8e1d13bd73bfc951d78c30` | video-local set, score, mastering, audio-only (no engine changes) |

The first commit of this repository (`0ba2149`) is that starting point copied with `cp -r`, unmodified, so
`git diff 0ba2149 HEAD -- src scripts tests` shows every change made to carried-over code.

Decision key: **carry** = copied unchanged · **adapt** = copied and modified · **replace** = different implementation ·
**build** = new · **drop** = not available in the Blender picture · **defer** = not migrated yet.
"Verify" gives a command or file; ✔ = run in this session, ◻ = not run.

## Authoring and direction

| Capability (old location) | Decision | Effect on what the user sees | Verify |
|---|---|---|---|
| Recipe schema, strict validation (`src/engine/core/schema.ts`) | carry | none — old `episode.json` files load as-is | ✔ `npm test` (timeline, catalog) |
| Dialogue-relative timing `l2.word:3` (`core/timeline.ts`) | carry | none | ✔ `tests/timeline.test.ts`; edit E-3 in COMPARISON |
| Poses, emotions, gestures, look-at, life, listening, speech motion (`actors/rig.ts`, `*.data.ts`) | carry (evaluated in the probe, baked to keys) | same motion; in Blender it is keyframes on rigid parts, editable per shot | ✔ contact sheet old vs new |
| Interaction recipes + arm IK, held props (`core/recipes.ts`, `actors/ik.ts`) | carry | same contact; held prop appears as an object parented to the hand | see "Capability checks" |
| Locomotion, turns | carry | same | see "Capability checks" (`one-take`) |
| Camera solver, semantic shots, moves, keys, paths, follow/track, focus (`camera/solve.ts`, `choreo.ts`) | carry (sampled) | same framing; each shot's camera is a normal animated Blender camera | ✔ SSIM old/new in COMPARISON |
| Camera shake fx | carry (sampled into the camera) | same | ◻ no episode in the verified set uses it |
| Environments, layout overrides, marks (`world/layout.ts`) | carry | same | ✔ both built videos use `dev-office` |
| Video-local sets/components (`video.data.ts`, `defineVideo`) | carry | same; assets are tagged `scene-<slug>` and stay local to the video | see "Capability checks" (`launch-promo`) |
| Moods and timed lighting cues (`lighting/moods.ts`) | adapt (lights mapped to Blender units) | close match; point-light falloff and shadow softness differ slightly | ✔ red-alert shots in the contact sheet |
| `validate`, `inspect`, `explain`, pacing, intents | carry | none | ✔ ran `validate` on both videos |
| Scaffold `new`, catalog, `list`/`show` | carry | none | ✔ `new standup-update` |
| Recipe edits from the command line | **build** (`factory edit`) | new: camera/action/line/any key, validated, rolled back when invalid | ✔ E-3 |

## Picture

| Capability | Decision | Effect | Verify |
|---|---|---|---|
| Final 3D picture: R3F in headless Chromium (`player/EpisodePlayer.tsx`) | **replace** with Blender EEVEE per shot | soft shadows, real depth of field, proper anti-aliasing; no bloom (below) | ✔ COMPARISON frames |
| Asset definitions: TSX primitives (`world/props.tsx`, `actors/*/*.tsx`) | adapt: still the origin; sampled once into `library/*.blend`, which become the editable copies | assets can now be changed in Blender | ✔ library edit test E-5 |
| Editable scene files | **build** (`videos/<slug>/scenes/*.blend`) | new | ✔ E-4 |
| Shot-level render reuse | **build** (content-hash cache) | unchanged shots are not re-rendered | ✔ COMPARISON "rerender" |
| Animated screens (Canvas2D textures) | adapt: captured per frame as PNG image sequences | same content on monitors | ✔ shot-0498 (insert) |
| Tone mapping | carry (Khronos PBR Neutral in both) | same palette | ✔ |
| Depth of field | replace (camera DOF, f-stop from legacy bokeh scale) | similar amount, physically shaped blur | ✔ close shots |
| Vignette | **drop** (not re-implemented) | corners slightly brighter than the old picture | visible in A/B frames |
| Bloom | **drop** (EEVEE bloom was removed upstream; a compositor glare node was not added) | bright screens/lamps do not glow | visible in A/B frames |
| Chromatic-aberration glitch, fog | **drop** for now | `glitch` accents lose the colour fringe; fogged moods lose fog | ◻ |
| Custom `ShaderMaterial`, `Line`, `InstancedMesh`, drei `MeshReflectorMaterial` | **drop** with a warning from `plan` (shader: flat colour carried) | affects `floating-space` starfield shader and `launch-promo` reflective floor | see "Capability checks" |
| `THREE.Points` (dust, stars) | adapt: small octahedra | round-ish points instead of square sprites | ◻ |
| Legacy renderer (`render`, `stills`, `preview`, Studio) | carry | still available as a fast preview and for A/B | ✔ used for the baseline |
| Determinism check `stills --verify` | carry (legacy renderer only) | Blender frames were not order-tested | ◻ |

## Graphics, captions, audio, delivery

| Capability | Decision | Effect | Verify |
|---|---|---|---|
| Per-video overlay, fx accents (text/window/callout/flash/dip), KineticText, AppWindow | carry (rendered in the composite) | same | ✔ end title in the final MP4 |
| World-anchored 2D (callouts pinned to objects) | carry — positions come from the same solver camera | same, unless the shot's camera was hand-edited in Blender (overlay would not follow) | ◻ |
| Burned-in captions (`audio/Captions.tsx`) | carry | same | ✔ frames |
| Sidecar subtitles | **build** (`.srt`, `.vtt`) | new | ✔ `tests/factory.test.ts`, `factory/qa.sh` |
| Voice pipeline, cache, takes, analysis (`scripts/voice.ts`) | carry | none | ✔ `tests/voice*.test.ts` |
| Offline voice on Linux | **build** (`--provider espeak`) | real (robotic) speech with word timings instead of fixture babble | ✔ `standup-update` |
| ElevenLabs provider | carry, opt-in | unchanged; **not exercised** (paid) | ◻ |
| Sound effects, music bed, ramped duck (`audio/Soundtrack.tsx`, `musicGain.ts`) | carry | same mix | ✔ loudness in COMPARISON |
| Remote meme sounds | carry in code; **removed from the baseline recipe** (CC0 replacements) | three different effect sounds in `it-works-on-my-machine` | ✔ `validate` no longer warns |
| `render --master` (−14 LUFS two-pass loudnorm) | carry for legacy renders; **defer** for `build` | factory output is not loudness-mastered automatically | ◻ |
| `review` (frame sheet, loudness, mix) | carry | works on the factory MP4 (same path `out/<slug>.mp4`) | ✔ |
| Audio-only render, sidechain score, oversampled limiter (`prod/noir-git-blame` `videos/noir-git-blame/tools/`) | **defer** — video-local tools on a branch that was not imported | not available | ◻ |
| `noir-git-blame` episode (custom set, fonts, CC-BY score, ElevenLabs audio) | **defer** — not imported (non-commercial audio, 25 MB music) | not available | ◻ |

## Tooling and tests

| Capability | Decision | Verify |
|---|---|---|
| 23 engine test files (221 tests) | carry | ✔ `npm test` → 225 passed (221 + 4 new) |
| Factory tests | build (`tests/factory.test.ts`) | ✔ |
| `make-episode` skill, legacy AGENTS/PROGRESS/ENGINE docs | carry as reference under `docs/legacy/`; new `AGENTS.md` | — |
| Lint | carry (the starting commit already fails `npm run lint` with 2 errors) | ✔ same 2 errors before and after |

## Capability checks on other episodes

Filled in from runs in this session — see [COMPARISON.md](COMPARISON.md#capability-checks).

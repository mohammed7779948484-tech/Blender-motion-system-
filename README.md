# Video Factory

A recipe-driven pipeline for stylized 3D episodes and ads. An agent (or a person) writes an `episode.json` recipe —
cast, dialogue, actions, camera, lighting — choosing characters, sets, props and motions from a shared library. The
factory turns it into **editable Blender scenes** (one `.blend` per shot), renders only the shots that changed, and
composites picture, titles, captions and the audio mix into an MP4 with sidecar subtitles.

It is a rebuild of `Remtion_System` (source commits and what was kept: [docs/MIGRATION.md](docs/MIGRATION.md)).
The direction engine of that system is carried over unchanged; the picture now comes from Blender.

```
episode.json ─▶ plan ─▶ scenes (Blender, editable) ─▶ shots (cached renders) ─▶ compose ─▶ out/<slug>.mp4 .srt .vtt
```

## Setup

Requirements: Node 22, ffmpeg/ffprobe, Blender 5.2 LTS. No GPU is required (see "Verified environments").

```bash
npm ci
```

Blender: install 5.2 LTS and either put `blender` on `PATH` or set `BLENDER=/path/to/blender`. On a GPU-less Linux
machine Blender's EEVEE renderer needs Mesa's software drivers:

```bash
apt-get install -y libegl1 libegl-mesa0 mesa-vulkan-drivers espeak-ng
```

(`espeak-ng` is the offline voice used when no other voice provider is available.) Check the installation:

```bash
npm test
```

## Make a video

Every command is `npm run factory -- <command>`; run it without arguments for the full list.

```bash
npm run factory -- list                                  # shared actors, props, sets, moods, shots, sounds
npm run factory -- new my-episode --env dev-office       # scaffold videos/my-episode/ (recipe + BRIEF.md)
# edit videos/my-episode/episode.json  (schema: catalog/episode.schema.json)
npm run factory -- voice my-episode                      # offline voices + word timings (espeak on Linux)
npm run factory -- validate my-episode                   # direction, timing, framing and contact findings
npm run factory -- build my-episode --profile draft      # quick look: half size, 2 samples
npm run factory -- build my-episode                      # final: out/my-episode.mp4 + .srt + .vtt
```

`build` runs four stages and skips whatever is still valid; each can be run alone:

| Stage | Command | Output | Re-runs when |
|---|---|---|---|
| plan | `plan <slug>` | `out/<slug>/plan/` (per-shot scene description) | the recipe, voice timing or view code changed |
| scenes | `scenes <slug>` | `videos/<slug>/scenes/shot-NNNN.blend`, `library/*.blend` | that shot's plan changed and the scene was not edited by hand |
| shots | `shots <slug>` | `out/<slug>/cache/<key>/f*.png` → `out/<slug>/frames/` | the shot's `.blend`, a library file it links, or the render profile changed |
| compose | `compose <slug>` | `out/<slug>.mp4`, `.srt`, `.vtt` | always (it is the cheap stage) |

`npm run factory -- status <slug>` shows, per shot, whether the scene is current, stale or hand-edited and whether
its render is cached.

## Edit a video

Three levels, from fastest to most manual. All of them end with `npm run factory -- build <slug>`.

**1. The recipe, by command** — e.g. "when Claude says *passed* (word 5 of line l3), move the camera closer to Rayan
and have him raise his hand":

```bash
npm run factory -- edit standup-update camera --at l3.word:5 --shot close --subject rayan --move push-in --amount 0.15
```

```bash
npm run factory -- edit standup-update action --at l3.word:5 --actor rayan --gesture wave
```

Times follow the dialogue (`l3.start`, `l3.end+0.3`, `l3.word:5`), so re-voicing re-times everything. An invalid
edit is rolled back. `edit <slug> line l2 --text "..."` and `edit <slug> set <dot.path> --value <json>` cover the rest;
anything can also be edited directly in `episode.json`.

**2. A shot scene, in Blender** — open it, change what you like (camera, lights, objects, keyframes), save:

```bash
npm run factory -- open standup-update shot-0000
```

The next build sees that the file differs from what the factory generated, keeps your version, and re-renders only
that shot. If the recipe later changes that same shot, the build keeps your scene and tells you;
`scenes <slug> --force --only shot-0000` regenerates it. The same edit can be scripted (for agents, no GUI):

```bash
npm run factory -- scene-edit standup-update shot-0000 --py "bpy.data.objects['camera'].data.lens *= 1.2"
```

**3. A shared asset, in Blender** — open `library/rayan.blend` (or any file listed by `npm run factory -- library`),
edit meshes or materials, save. Every scene of every video links these datablocks, so the next build of each video
re-renders the shots that use the asset and nothing else.

Titles, captions and per-video overlays are React components (`videos/<slug>/index.tsx`, `src/engine/ui`,
`src/engine/audio/Captions.tsx`); changing them only re-runs `compose`.

## Preview and review

- `build <slug> --profile draft` (EEVEE, half size) or `--profile blocking` (Workbench: motion and framing only).
- `npm run dev` — Remotion Studio with the legacy real-time 3D preview of every video (no Blender involved;
  lighting differs slightly from the Blender picture).
- `stills <slug>` / `preview <slug> --from 2 --to 5` — legacy-renderer contact sheets and short previews.
- `review <slug>` — frame sheet from the final MP4, loudness, clipped samples, per-sound level against dialogue.
- `factory/qa.sh out/<slug>.mp4` — ffprobe summary, loudness, black-frame and silence detection.

## Layout

```
videos/<slug>/episode.json      the recipe            videos/<slug>/scenes/*.blend   editable shot scenes (+ manifest.json)
videos/<slug>/index.tsx         per-video overlays     library/*.blend                shared assets (linked by every scene)
public/videos/<slug>/           voice clips, voice.json  public/sfx/                  CC0 sound effects
src/engine/                     direction engine (carried over)     src/factory/      scene probe + compositor players
scripts/cli/factory.ts          plan/scenes/shots/compose/edit      factory/blender/  build.py, render.py
catalog/                        machine-readable asset and schema catalog            docs/  audit, research, plan, comparison
```

## Verified environments

| Environment | What was run | Result |
|---|---|---|
| Linux x86-64 container (Ubuntu 24.04, 4 vCPU, 15 GB, **no GPU**), Node 22.23, Blender 5.2.3 LTS, ffmpeg 6.1, Mesa 25.2 llvmpipe | tests, both videos end to end, all edit paths | works; numbers in [docs/COMPARISON.md](docs/COMPARISON.md) |
| Workstation with a GPU; macOS; Windows | not available in this session | **not verified** — expected to work (same Blender and Node versions); EEVEE render times should drop by an order of magnitude |
| Blender GUI | not available (headless container) | **not verified** interactively; scenes were opened, modified and saved with Blender's Python in background mode |

## Documentation

- [AGENTS.md](AGENTS.md) — the working guide for agents (commands, rules, gotchas).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the stages fit and what each file contains.
- [docs/audit/inventory.md](docs/audit/inventory.md), [docs/audit/baseline-run.md](docs/audit/baseline-run.md) — the old system.
- [docs/research/sources.md](docs/research/sources.md), [docs/research/experiments.md](docs/research/experiments.md) — tool research and tests.
- [docs/PLAN.md](docs/PLAN.md), [docs/MIGRATION.md](docs/MIGRATION.md) — plan and per-capability decisions.
- [docs/COMPARISON.md](docs/COMPARISON.md) — old vs new: quality, timings, reuse.
- [notes.md](notes.md) — practical lessons.

## Licences

Code carried over from `Remtion_System` is private/unlicensed (see `THIRD_PARTY_NOTICES.md` for dependencies and
audio). Remotion requires a company licence above three people. Sound effects in `public/sfx/` are CC0. Committed
voice clips are Windows system voices (`it-works-on-my-machine`) and eSpeak NG output (`standup-update`); no
ElevenLabs audio and no remotely hosted meme sounds are used by the videos in this repository.

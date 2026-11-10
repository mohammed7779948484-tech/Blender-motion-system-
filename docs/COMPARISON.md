# Old workflow vs new workflow

Everything in this file was measured in this session unless marked otherwise. Raw timings:
[audit/logs/old-timings.tsv](audit/logs/old-timings.tsv), [audit/logs/new-timings.tsv](audit/logs/new-timings.tsv),
build logs in the same folder.

## Conditions

- **Recipe**: `it-works-on-my-machine` — same `episode.json`, same committed voice clips, same overlay code in both.
  One intentional difference: three remote meme sounds with unknown rights were replaced by CC0 library sounds in
  the new repository (picture and voice timing are unaffected).
- **Hardware**: one Linux container, 4 vCPU, 15 GB RAM, **no GPU**. Both renderers therefore ran on software
  rasterisers (old: Chromium + SwiftShader; new: Blender EEVEE on Mesa llvmpipe). On a GPU the ranking of the
  initial render may differ; that comparison is **pending**.
- **Output**: 1920×1080, 30 fps, 912 frames, H.264 yuv420p + AAC 48 kHz, burned-in captions, in both.
- **Old**: `episode/co-authored-by` @ `bfc638b`, `npm run cli -- render`, Remotion 4.0.536, concurrency 2×.
- **New**: this repository, `npm run factory -- build`, Blender 5.2.3 LTS, profile `final` (EEVEE, 4 samples,
  shadows, depth of field), same Remotion version as compositor.
- Timed runs were made with nothing else running, after one early measurement was spoiled by a parallel job.

## Result in one table

| | Old (browser 3D) | New (Blender scenes) |
|---|---|---|
| Initial render, 30.4 s episode | **2,278 s** (38 min) | **≈7,000 s** (117 min): plan 569 + scenes 4 + shots 6,414 + compose 81–113 ¹ |
| Per frame of 3D | 2.5 s | 7.0 s render + 0.5–0.6 s sampling |
| Rerender, nothing changed | 2,278 s (no cache ²) | **81 s** (0 shots rendered) |
| Change the end-title text | 2,278 s | **79 s** (`compose`) |
| Change one camera cue in the recipe (39-frame shot) | 2,278 s | **838 s** (re-sample 453 + 1 scene + 1 shot 306 + compose 77) |
| Move the camera of one shot by hand in the scene (27-frame shot) | not possible (no scene files) | **296 s** (edit 1.6 + 1 shot 214 + compose 79) |
| Change a shared asset (Claude's body colour) | edit TSX, 2,278 s per video | every shot showing the asset re-renders, in every video; others stay cached |
| Fast look while directing | `validate` 2 s, one still 10 s, contact sheet 84 s | the same commands (legacy renderer is kept); Blender `draft` build 782 s for a 9.6 s episode |
| Editable scene files | none | 1 `.blend` per shot + 13 shared library files |
| Sidecar captions | none | `.srt` + `.vtt` |

¹ The first full build was interrupted by a tool time limit during the 11th shot and resumed (frames already on
disk are kept); its shots ran at 8.3 s/frame while small jobs shared the CPU. The 6,414 s figure is a second,
uninterrupted render of all 12 shots on an idle machine.
² Checked by rendering the same 39 frames twice with the old system: 116.8 s and 116.9 s.

**Reading it**: on this GPU-less machine the new pipeline is about 3× slower for the first render and 3–29×
faster for every later change, because only the affected shot is rendered. The break-even is the first revision.

## Image quality

Full-video metric, new final vs old render, all 912 frames: **SSIM 0.940, PSNR 23.4 dB** (not expected to be
identical: different rasteriser, light falloff, depth of field, no bloom or vignette).

- Frames from the new MP4: [img/final-frames.png](img/final-frames.png); old contact sheet:
  [img/legacy-contact.png](img/legacy-contact.png); same frame side by side (second recipe, legacy left, Blender
  draft right): [img/ab-legacy-vs-blender.png](img/ab-legacy-vs-blender.png).
- Same in both: framing, poses, expressions, screen contents, mood change to red alert, captions, end title.
- Different by design in the new picture: softer shadow edges and lens-shaped depth of field.
- Missing in the new picture: bloom around lamp and screens, vignette. Monitor glow on faces is slightly stronger.
- Two Blender renders of the same scenes are not byte-identical (PSNR 63.8 dB between them over 15 s) — visually
  identical, but pixel-exact determinism, which the old system verified with `stills --verify`, is not provided.

## Motion

Motion is the old engine's, sampled every frame and stored as keyframes (reduced within 0.5 mm / 0.0004 quaternion
units). Checked on stills at shot middles in every shot and on the gesture added by edit E-3; no per-frame motion
metric was computed. Hand-edited scenes can change motion freely.

## Audio and synchronisation

Both MP4s are mixed by the same Remotion soundtrack component from the same timeline.

- Voice onsets (ffmpeg `silencedetect`, first seven): 2.492, 3.695, 5.148, 7.790, 10.057, 13.453, 16.754 s —
  **identical in old and new**.
- Resolved sound cues at 16.63, 18.18, 18.23, 26.70 s are present in the new mix at those times (peaks −5.5, −2.9,
  −5.4 dBFS).
- Loudness: old −17.0 LUFS, peak 0.0 dBFS; new −17.5 LUFS, true peak −0.7 dBFS (different effect sounds). Neither
  is mastered to −14 LUFS; `review` flags the peak above −1 dBFS.
- Captions: 7 burned-in lines and 7 cues in each sidecar; cue 1 starts at 2.400 s = line l1 start.
- Mouths are amplitude-driven from the voice envelope at the same frame times as before. I cannot listen: sync
  was checked by measurement only.

## Edit tests (new system)

| # | Edit | How | Time to new MP4 | What was redone | Evidence |
|---|---|---|---|---|---|
| E-1 | End title "Run your tests." → "Write your tests." | edit `videos/…/index.tsx`, `compose` | 79 s | composite only | [img/edits-baseline.png](img/edits-baseline.png) top right |
| E-2 | Tighter medium shot of Rayan (`"size": 0.8` on one camera cue) | edit `episode.json`, `build` | 838 s | plan re-sampled; 1 of 12 scenes rebuilt; 1 shot rendered | same image, bottom left → bottom middle |
| E-3 | "When Claude says *passed*, push in on Rayan and have him raise his hand" (second recipe, draft profile) | two `factory edit` commands (1.6 s each, validated) + `build --profile draft` | 391 s | plan 144 s; 2 of 5 scenes (the cut splits a shot); 2 shots | [img/standup-edits.png](img/standup-edits.png) top right, bottom left |
| E-4 | Shift the camera of one shot in its `.blend` | `scene-edit … --py "…shift_x = 0.06"` (same as saving in Blender), `build` | 296 s | 1 shot rendered; scene reported "kept — edited by hand" | [img/edits-baseline.png](img/edits-baseline.png) top left → top middle |
| E-5 | Recolour Claude in `library/claude.blend` | Blender script on the library file, `build --profile draft` | 645 s | all 5 shots of `standup-update` (Claude is in each); baseline video: 12 of 12 shots reported "render needed" | [img/standup-edits.png](img/standup-edits.png) bottom middle |

After E-2 the hand-edited shot from E-4 was still kept ("kept — edited by hand") and still cached. The
repository was then returned to the original recipe; E-3 is kept in `standup-update` as its final direction.

## Reuse checks

| Check | Expected | Observed |
|---|---|---|
| Build twice, no change | 0 shots rendered | "0 rendered, 12 reused", 81 s |
| Re-sample the plan without a recipe change | no scene rebuilt | "0 built, 12 kept" |
| Hand-edit one scene | that shot only | 1 rendered, 11 reused |
| Recipe change to one shot | that scene + shot only; hand-edited scene untouched | 1 built, 11 kept; 1 rendered, 11 reused |
| Edit a library material | every shot that uses it, in every video | 5/5 and 12/12 "render needed" |
| Revert the library file | cached again | "0 rendered, 5 reused", 23 s |
| Add unrelated datablocks to a library file | nothing re-renders | all 12 "cached" — **after a fix**: building `ctrl-z` and `launch-promo` had added their variants to `library/rayan.blend`, which invalidated every cached shot of the baseline under the first key scheme (whole-file hash) and cost a full re-render. The key now uses a fingerprint of the datablocks a shot actually links. |

## Capability checks

Other episodes were pushed through `plan` and `scenes`, and a middle frame of several shots was rendered
(half size, 4 samples). They were **not** rendered in full or composited.

| Capability | Episode | Result | Evidence |
|---|---|---|---|
| Character-to-prop contact (press, pick-up, carry, place), locomotion on a shared set | `ctrl-z` (937 frames, 15 shots) | sampled in 558 s, 15 scenes built in 4.5 s; duck on the CTRL key, Rayan standing on keys, celebrate pose render correctly | [img/cap-ctrl-z.png](img/cap-ctrl-z.png) |
| Camera tracking / follow with solver keys | `one-take` (417 frames, 3 shots) | sampled in 162 s; the follow shot is an animated Blender camera (27 location keys over 151 frames). One `ShaderMaterial` (starfield) reported as not transferable | [img/cap-one-take.png](img/cap-one-take.png) |
| Episode-specific customisation: video-local set and components, 9:16 | `launch-promo` (862 frames, 8 shots) | sampled in 483 s; custom podium, screens, neon and cyclorama become `scene-launch-promo` / per-kind library files. The reflective floor (`MeshReflectorMaterial`) is reported as not transferable and renders without reflections | [img/cap-launch-promo.png](img/cap-launch-promo.png) |

## Still pending

- Timing on a machine with a GPU, and on macOS/Windows.
- Opening and saving a scene in the Blender GUI by a person (only scripted edits were possible here).
- Full renders and composites of `ctrl-z`, `one-take`, `launch-promo`, `co-authored-by`; anything from `noir-git-blame`.
- "The Missing Frame": not present in the repository, so no like-for-like timing against that trial.
- A paid, natural-sounding voice (ElevenLabs) through the new path; loudness mastering of factory output.
- Parallel shot rendering (shots are independent jobs; this machine has too few cores to benefit).

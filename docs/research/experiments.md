# Experiments

All run in this session on the machine described in [../COMPARISON.md](../COMPARISON.md#conditions) (4 vCPU, no GPU).
Each entry: question → what was run → result → decision.

## E1 — Can Blender render headless here, and with which engine?

Official `blender-5.2.3-linux-x64.tar.xz`; one test scene (plane, flat-shaded monkey, sun), 1920×1080, 3 frames.

| Engine | Seconds per frame | Notes |
|---|---|---|
| EEVEE, default 64 samples, before installing EGL | — | hung/timeout (no EGL library present) |
| EEVEE, 8 samples, OpenGL on Mesa llvmpipe (after `apt-get install libegl1 libegl-mesa0 mesa-vulkan-drivers`) | 24.2, 20.2, 20.4 | works; prints `EGL_BAD_MATCH` warnings |
| EEVEE, 8 samples, `--gpu-backend vulkan` (lavapipe) | 28.0, 17.2, 17.0 | works, slightly faster |
| Workbench | 2.5, 1.9, 2.0 | no scene lighting |
| Cycles CPU, 16 samples + denoise | 46.8, 46.5, 47.8 | too slow |

Decision: EEVEE on OpenGL (default backend, fewer moving parts); Workbench as the `blocking` profile; Cycles rejected here.

## E2 — Can the old views be transferred by sampling instead of exporting?

`src/factory/probe.ts` walks the mounted three.js scene after each frame and posts JSON to a local collector.
First test, 60 frames of `it-works-on-my-machine`: 80 s **while another render was using the CPU**; full episode
(912 frames) alone: 569 s, 462 s and 453 s on three runs (0.50–0.62 s/frame). 308 objects in the establishing shot,
13 asset kinds, 0 unsupported constructs. `one-take` (417 frames): 162 s, `ctrl-z` (937): 558 s, `launch-promo`
(862): 483 s; the last two report one `ShaderMaterial` each as not transferable.

Decision: adopt. Cost to remember: any recipe or code change re-samples the whole episode (≈0.5 s/frame).

## E3 — Do linked library datablocks work for per-shot animated scenes?

`factory/blender/build.py` writes `library/<kind>.blend` once and links meshes and static materials into each shot;
objects stay local and carry the material in an object-level slot. Result for the first shot: 137 linked meshes,
0 local meshes, 13 libraries, file size 163 KB, build ≈1.5 s per shot. Editing one material in `library/claude.blend`
changed the render of every scene that links it (E9).

## E4 — Does the Blender picture match the legacy picture?

First contact sheet: [e4-first-contact-sheet.png](e4-first-contact-sheet.png) against
[../img/legacy-contact.png](../img/legacy-contact.png). Framing, poses, screens, mood change to red all match.
Point lights were too weak with ×4π and were corrected to ×4π². Full-video metric after the fix: SSIM 0.940,
PSNR 23.4 dB (COMPARISON). Side-by-side of one frame from the second recipe:
[../img/ab-legacy-vs-blender.png](../img/ab-legacy-vs-blender.png).

## E5 — Is Remotion faster as a pure compositor?

Compositing 912 Blender frames with overlay, captions and audio: 113 s the first time, 77–81 s afterwards
(≈11 fps), against 2,278 s for the legacy 3D render of the same composition. A 288-frame 960×540 draft: 22 s.

## E6 — How many EEVEE samples does this style need?

Shot `shot-0068` (close-up with depth of field), 1920×1080, seconds per frame:

| 16 samples | 8 | 4 | 1 | 8, no DOF | 8, no shadows | 50 % size, 2 samples, no DOF | Workbench 50 % |
|---|---|---|---|---|---|---|---|
| 31.5 | 16.6 | 9.2 | 3.3 | 12.0 | 10.7 | 2.6 | 0.35 |

Crops at 1, 4 and 16 samples and the upscaled draft: [e6-samples-1-4-16-draft.png](e6-samples-1-4-16-draft.png).
1 sample shows stair-stepped edges; 4 and 16 are indistinguishable at normal size. Decision: `final` = 4 samples,
`draft` = half size, 2 samples, no DOF. Measured over whole episodes: final 8.4 s/frame, draft 2.1 s/frame.

## E7 — HyperFrames as the compositor

`npm view hyperframes` → 0.9.27, Apache-2.0; `npx hyperframes --help` runs here and offers `init`, `preview`,
`render`, `lint`, `check`, `snapshot`, `audio`, `diff`. A composition render was **not** run: using it would mean
rewriting the existing React caption/overlay components and audio mix as HTML timelines, with no gain for this
recipe. Decision: not on the default path; recorded as the alternative for new HTML-only graphics and for teams
above Remotion's free-licence threshold. Status: documentation + CLI check only.

## E8 — Offline voice with word timings on Linux

`espeak-ng` 1.51: each line is synthesised whole, word starts are taken from the lengths of the spoken prefixes.
First version placed every word ≈0.4 s late (the prefix files end with silence and phrase-final lengthening);
after trimming trailing silence and subtracting 60 ms the starts follow the audible words (checked against
`silencedetect` gaps for line l1). Timings remain approximate (≈±0.1 s). Used for `standup-update`.

## E9 — Does reuse behave as designed?

See COMPARISON "Reuse checks": unchanged build renders 0 shots; one hand-edited scene → 1 shot; one recipe camera
change → 1 scene rebuilt, 1 shot; library edit → every shot linking it, in both videos; reverting the library file
→ all cached again. Scene plans had to be made byte-stable first (three.js uuids are random per run; ids are now
assigned by order of first appearance).

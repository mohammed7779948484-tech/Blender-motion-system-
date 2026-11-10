# Plan

Written after the audit ([audit/inventory.md](audit/inventory.md)) and the first experiments
([research/experiments.md](research/experiments.md)), before the implementation. Status column updated at the end
of the session.

## Starting point

`episode/co-authored-by` @ `bfc638b` — the only branch whose shared engine contains everything (v3 engine + ramped
music duck, Linux software-GL config, shader NaN guard; 23 test files). `prod/noir-git-blame` @ `25ccc3d` adds no
engine code, only video-local tools; its notes were used as requirements (mastering, audio-only render).

## Architecture decision

The old system has two halves that the audit shows are cleanly separable (`src/engine/player/scene.ts`):

1. a **direction engine** — recipe schema, dialogue-relative timing, recipes/IK, camera solver, moods, voice pipeline,
   inspect/validate — pure TypeScript, deterministic, 221 tests;
2. a **picture renderer** — procedural React Three Fiber views rendered in headless Chromium, with no scene files,
   no manual editing and no reuse between renders.

The rebuild keeps (1) unchanged, and replaces what (2) *outputs*: instead of pixels, the views are sampled once per
frame into a **scene plan**, from which Blender scenes are built, edited, rendered and cached per shot. Remotion
stays as the 2D compositor (captions, overlays, audio), where it needs no WebGL.

```
episode.json ──resolve──▶ timeline ──probe (R3F views, no pixels)──▶ scene plan (per shot)
   ▲ edit command                                                          │ build (Blender, links library/*.blend)
   │                                                                       ▼
   │                                                  videos/<slug>/scenes/shot-NNNN.blend  ◀── open / edit by hand
   │                                                                       │ render (cache key = scene + library + profile)
   │                                                                       ▼
 voice.json ─────────────▶ Remotion composite: frames + overlays + captions + mix ──▶ out/<slug>.mp4 + .srt + .vtt
```

Why not model the assets natively in Blender first: there are no asset files to import (everything is TSX
primitives), and transcribing ≈1,800 lines of view code by hand would fork the definition of every character.
Sampling moves all current and future views — including video-local sets — without per-asset work; from then on the
library `.blend` files are the editable copy.

## Phases and acceptance checks

| # | Phase | Acceptance check | Status |
|---|---|---|---|
| 0 | Audit + baseline | inventory with exact commits; old tests and a render run on this machine | done — [audit/inventory.md](audit/inventory.md), [audit/baseline-run.md](audit/baseline-run.md) |
| 1 | Carry the engine over | `npm test` and `npm run typecheck` pass in the new repo | done |
| 2 | Scene probe → plan | every frame sampled; shots, objects, materials, lights, camera in `out/<slug>/plan/` | done |
| 3 | Library + shot scenes | `library/*.blend` created once; each shot `.blend` opens in Blender, links the library, is animated | done |
| 4 | Cached shot renders | unchanged shot = 0 s; edited scene or library file re-renders only its users | done — [COMPARISON.md](COMPARISON.md) |
| 5 | Composite | MP4 with picture, burned captions, mixed audio; sidecar `.srt`/`.vtt`; ffprobe + loudness checks | done |
| 6 | Edit paths | recipe edit by command, scene edit by hand/headless, asset edit in the library — each verified in a new build | done |
| 7 | Second recipe | a new episode from the same shared assets built with the same commands | done — `videos/standup-update/` |
| 8 | Capability checks | contact (`ctrl-z`), camera tracking (`one-take`), custom set (`launch-promo`) pass through the probe | done for plan + scenes + sample frames; full renders pending — [COMPARISON.md](COMPARISON.md#capability-checks) |
| 9 | Comparison + docs | same recipe, hardware and output settings; README, notes, matrix | done |

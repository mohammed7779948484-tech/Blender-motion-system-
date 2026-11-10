# Notes — practical lessons

One lesson per note; the second line says why it mattered. Update a note instead of adding a duplicate.

### 1. Sample the old views instead of re-modelling them
The old engine evaluates the scene as a pure function of time, so serialising the mounted three.js scene graph per frame moved all 13 asset kinds and every animation layer into Blender with no per-asset code. → [src/factory/probe.ts](src/factory/probe.ts), [docs/research/experiments.md](docs/research/experiments.md) E2

### 2. Probe in one browser tab, in frame order
Object identity is the three.js `uuid`, which differs per tab; `--concurrency=1` keeps it stable so mounting, unmounting and held props become visibility keys instead of mismatched objects. → [scripts/factory/plan.ts](scripts/factory/plan.ts)

### 3. EEVEE does run without a GPU, at about 2 s per sample per 1080p frame
Upstream threads call it unreliable, but with `libegl1 libegl-mesa0 mesa-vulkan-drivers` installed it works on llvmpipe; the `EGL_BAD_MATCH` lines are noise. 4 samples was visually equal to 16 on this flat-shaded style. → experiments E1, E6

### 4. Cycles on 4 CPU cores is not an option
47 s per 1080p frame at 16 samples means half a day per 30 s episode. → experiments E1

### 5. Never run two renders at once on this class of machine when timing
Two software-GL jobs on 4 cores more than doubled each other's time and made the first baseline timing useless. → [docs/audit/baseline-run.md](docs/audit/baseline-run.md)

### 6. Blender point lights need ×4π² from three.js candela, suns map 1:1, ambient ÷π
With ×4π the desk lamp and monitor glow were visibly too weak against the legacy frame. → [factory/blender/build.py](factory/blender/build.py) `POINT_WATTS`

### 7. Use "Khronos PBR Neutral" as the view transform
It is the same tone mapping the legacy renderer applied; Filmic/AgX shift the palette of every asset. → `scene_settings` in build.py

### 8. Give every library mesh one empty material slot and assign materials on the object
A linked mesh cannot be modified, and without a slot an object cannot carry its own material; object-level slots keep one mesh shareable across differently coloured instances. → `make_mesh` in build.py

### 9. A hand-edited scene must be detected by content, not by timestamp
The manifest stores the sha1 of each `.blend` as generated; any other sha1 means "edited" and the build keeps the file. Git checkouts and copies change mtimes, hashes do not. → [scripts/cli/factory.ts](scripts/cli/factory.ts) `sceneState`

### 10. The render cache key must include the linked library files
Otherwise an asset edit in `library/*.blend` would silently reuse stale frames. → `renderKey` in factory.ts, [docs/COMPARISON.md](docs/COMPARISON.md)

### 11. Name shot files by first frame, not by index
Inserting a cut then leaves every other shot's file name, hand edits and cached render untouched. → `buildPlan`

### 12. `read_factory_settings` resets preferences too
Set `save_version = 0` immediately before each save or Blender leaves `.blend1` backups next to every scene. → build.py

### 13. Blender 5.x actions are slotted
`action.fcurves` is gone; create a slot, a layer, a keyframe strip and use its channelbag. Bulk `foreach_set` on keyframe points keeps a 12-shot build near one second per shot. → `channelbag` in build.py

### 14. Reduce baked keys before writing them
Per-frame samples reduced with a tolerance (Ramer–Douglas–Peucker on the time series) leave curves a person can actually edit. → `rdp` in build.py

### 15. eSpeak word timings from prefix lengths need two corrections
Trim each prefix's trailing silence and subtract ≈60 ms of phrase-final lengthening, or every word starts late. Timings are still approximate (±0.1 s). → `espeakClip` in [scripts/voice.ts](scripts/voice.ts)

### 16. Remotion as a compositor must load frames over HTTP, not from `public/`
The bundler copies `public/` on every render; a gigabyte of PNG frames there would be copied each time. → `compose` in factory.ts

### 17. Meme sounds and free-tier ElevenLabs clips block commercial use
The old episodes relied on both; the deliverables here use CC0 effects and offline voices only. → `THIRD_PARTY_NOTICES.md`, audit §4

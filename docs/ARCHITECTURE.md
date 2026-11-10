# Architecture

```
videos/<slug>/episode.json ─┐
public/videos/<slug>/voice.json ─┤ resolve (src/engine/core/timeline.ts) → ResolvedEpisode: absolute times for every cue
                                 ▼
 1 plan     scripts/factory/plan.ts + src/factory/{FactoryPlayer.tsx,probe.ts}
            Remotion renders the composition with --props mode=probe. The legacy React Three Fiber views are mounted
            on a 48-pixel canvas; after every frame the three.js scene graph is serialised and POSTed to a local
            collector: transforms, visibility, materials, lights, camera, and (once) geometry and canvas textures.
            Reduced to out/<slug>/plan/shot-NNNN.json (one per camera shot) + geoms.json + tex/*.png.
                                 ▼
 2 scenes   factory/blender/build.py   (blender -b --factory-startup)
            a) library sync: library/<kind>.blend is created the first time a kind (rayan, desk, monitor…) is used;
               missing meshes/materials are added, existing datablocks are never touched.
            b) per shot: link meshes + static materials from the library, create the object hierarchy under
               "three_world", key transforms/visibility/material values/lights/camera (keys reduced to what linear
               interpolation cannot reproduce), build the world from ambient + hemisphere + background.
            videos/<slug>/scenes/manifest.json records, per shot, the plan hash it was built from and the sha1 of the
            file as generated. A different sha1 later = edited by hand = never overwritten without --force.
                                 ▼
 3 shots    factory/blender/render.py  (blender -b <shot>.blend), profiles in factory/profiles.json
            cache key = sha1(shot .blend + every linked library .blend + animated-texture identity + profile + range)
            out/<slug>/cache/<key>/f#####.png; out/<slug>/frames/ is a hard-linked flat view of the current cut.
                                 ▼
 4 compose  Remotion, --props mode=comp: <Img> of the Blender frame + video overlay + fx overlay + captions +
            soundtrack (all unchanged legacy components). Writes out/<slug>.mp4 and .srt/.vtt sidecars.
```

## Why a probe instead of an exporter or native Blender assets

The old engine evaluates the whole scene as a pure function of time (`evaluateScene`), and its views are the only
definition of what a character looks like and how its 46 animation channels turn into transforms. Sampling the
mounted scene graph transfers every asset, every custom per-video set and every animation layer (poses, gestures,
IK reaches, held props, walking, listening, blinking) without knowing anything about them. Measured cost: ≈0.6 s
per frame (see research/experiments.md, E2).

## Identity and names

- An object's identity while sampling is its three.js `uuid` (one browser tab, frames in order). An object that is
  unmounted and remounted, or whose geometry is replaced, becomes a new Blender object with visibility keys.
- Asset kind: nearest ancestor named `actor:<id>` (→ the cast entry's actor), a child of `set:<env>` named after a
  layout item (→ the item's kind), `held:<item>`, or `shell`. Everything else is `scene-<slug>` (video-local).
- Library mesh name: `<kind>/<GeometryType>-<hash of vertex data>[-flat]`. Library material name:
  `<kind>/<Type>_<rrggbb>_r<roughness>…`. A scene asks for datablocks by these names, so editing a datablock in the
  library changes every scene; a geometry the library does not have yet is added under a new name.
- Materials that animate or carry a canvas texture stay local to the shot (they need keys or an image sequence).

## Units and conventions

- three.js space is copied verbatim under the empty `three_world` (rotated +90° about X). World space in Blender is
  Z-up as usual; move things in world space and it behaves as expected.
- Frame numbers are Remotion's (0-based) in every scene, file name and cache.
- Lights: directional intensity → sun strength 1:1; point/spot candela → watts × 4π²; ambient and hemisphere lights
  become the world shader (÷π); the background colour is visible to camera rays only.
- Colour: view transform "Khronos PBR Neutral" (the legacy renderer used the same tone mapping), sRGB display.
- Camera: vertical sensor fit, lens from the solver's vertical field of view; depth of field from the solver's focus
  distance (f-stop derived from the legacy bokeh scale).

## What a build re-does

| You changed | plan | scenes | shots | compose |
|---|---|---|---|---|
| nothing | reused | kept | all cached | re-run |
| a title, caption style, sound cue, overlay code (`videos/<slug>/index.tsx`) | re-sampled¹ | kept | all cached | re-run |
| one camera cue / action in the recipe | re-sampled | affected shots rebuilt | affected shots | re-run |
| a shot `.blend` by hand | reused | kept (edited) | that shot | re-run |
| a library `.blend` | reused | kept | shots that link it | re-run |
| dialogue text / voice | re-sampled | most shots rebuilt (timing moved) | most shots | re-run |

¹ The plan's input hash covers all code under `src/` and the video folder, so any code or recipe edit re-samples;
shots whose sampled content is unchanged keep their scene and their cached render.

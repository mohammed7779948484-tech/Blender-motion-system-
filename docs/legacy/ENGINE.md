# Engine reference

`src/engine/index.ts` is the public API. Discovery data for agents is generated into `catalog/`
(`npm run catalog`): actor manifests, props, environments, camera shots/moves, moods, screens, sfx and
`episode.schema.json`. This document explains how the pieces fit and how to extend them.

## 1. Model

```
videos/<slug>/episode.json ─┐
public/videos/<slug>/voice.json (generated) ─┼─▶ resolveEpisode() ─▶ ResolvedEpisode (absolute seconds, serializable)
videos/<slug>/video.data.ts (optional) ─┘                         │
                                                                  ▼  per frame t = frame / fps (pure)
                                   evaluateScene(): actor channels · camera (layout + per-frame) · mood
                                                                  ▼
                       <EpisodePlayer>: ThreeCanvas (set, actors, lights, camera, post) + captions + audio
```

- `defineVideo({ episode, ... })` turns a folder into a Remotion composition. Its `calculateMetadata`
  fetches `voice.json` and resolves timing, so duration follows the voices.
- **Determinism**: every value on screen is a pure function of `t`. Cue transitions are recomputed from
  the cue history; idle motion uses seeded noise; mouths read precomputed envelopes; the camera's shot
  layout is computed once per shot and tracking uses a fixed time window over pure trajectories.
  `npm run cli -- stills <slug> --verify` renders frames in two different orders and compares bytes.
- **Engine version, profile, intent** (`core/behaviour.ts`): `engine: 2` (what `new` writes) opts into
  current defaults; omitted means 1, the original behaviour, kept exactly for older videos. Every new
  automatic behaviour reads only from the resolved `behaviour`, never from the engine version directly.
  `profile` names the check thresholds (`list direction`). `allow: [...]` on the episode or a shot marks a
  finding as deliberate: it is reported as "accepted by intent", never hidden. `defaults` holds the switches:
  corrections that engine 2 turns on (`focusPull`, `arcBlend`, `viaPoints`, `trim`, `level`, `speechMotion`) and
  opt-in styles that stay off until asked for (`cameraLife` 0..2, `listen` 0..1).
- **Visual state** (`inspect/sweep.ts`): `createSweep(resolved).at(frame)` is everything the picture
  depends on (actors, the rendered camera incl. shake, mood, prop states, screen accents, caption page),
  ~1 ms per frame in Node. Goldens (`tests/goldens/`) hash it for every finished video, so `npm test`
  fails on any unintended change; accept an intended one with `UPDATE_GOLDENS=1 npx vitest run tests/golden.test.ts`.

### Module map (where things live)

| Area | Module | Responsibility |
|---|---|---|
| Direction | `core/schema.ts`, `core/timeline.ts`, `core/recipes.ts`, `core/fx.ts` | episode.json schema → resolved, absolute-time data |
| Behaviour | `core/behaviour.ts` | engine version, profiles, intents (the only switch for new defaults) |
| Pacing | `core/pacing.ts` | beat sheet, pacing findings |
| Scene | `player/scene.ts` | pure per-frame evaluation (actors, camera, mood) |
| Visual state | `inspect/sweep.ts` | per-frame picture state + digests (goldens, checks, remix gate) |
| Checks | `inspect/inspect.ts` + `framing/camera/motion/contact/overlay/grammar.ts`, `findings.ts`, `context.ts` | findings with time, object, level, source, intent |
| Explain | `inspect/explain.ts` | every layer of an actor / the camera at a time, with sources |
| Provenance | `core/trace.ts` | where each resolved cue came from (filled when inspect/explain ask) |
| Camera | `camera/solve.ts` (pure), `camera/choreo.ts` (pure), `camera/Camera.tsx` (R3F + post) | shot layout, per-frame camera, focus; paths, `life`, arc blends |
| Splines | `core/spline.ts` (pure) | Hermite/Catmull-Rom keyframe interpolation shared by camera `keys` and keyed joints |
| Accents | `fx/state.ts` (pure), `fx/FxOverlay.tsx`, `fx/FxWorld.tsx` | which accents show, shake/glitch, placement |
| Captions | `audio/captionLayout.ts` (pure), `audio/Captions.tsx` | pages, layout constants, rendering |
| Voice/audio | `audio/speech.ts` (pure), `audio/Soundtrack.tsx`, `scripts/voice.ts` (Node I/O) | clips, words, envelopes, takes, playback (clip windows, gain) |
| Voice analysis | `audio/analysis.ts`, `audio/voiceReport.ts` (pure); `scripts/stt.ts`, `scripts/voiceTools.ts` (Node) | floor, segments, LUFS, tags, f0; edge trim, levels, validation, take report; whisper STT; strips, auditions |
| Actors | `actors/rig.ts`, `actors/*/…data.ts` | channels, poses, life, overrides (keyed joints), listening; `effectors` (body points/volumes for contact checks), `persona` |
| Node tools | `scripts/cli.ts`, `scripts/video.ts` (loader), `scripts/catalog.ts` | CLI, video loading, catalog |

Engine code stays pure and browser-safe; file system, ffmpeg and HTTP live in `scripts/` (`scripts/cli.ts` dispatches
to `scripts/cli/*.ts`: discover, scaffold, voices, check, media; `scripts/video.ts` loads video folders).

**Diagnosis loop.** `inspect` evaluates every frame in Node and reports findings: an *error* is objectively broken
(camera inside geometry), a *warning* probably unintended (a teleport, a limb through the head, a caption over a face,
a cut mid-word, a jump cut, floating feet, an unreachable recipe target), a *note* a question (static runs, short shots,
pacing, crossing the line). Each names the episode.json entry most likely responsible (recipe cues carry their step,
e.g. `actions[22] … do:pick-up step 'reach'`) and the `allow` intent that would mark it deliberate. `explain` shows
why a state is what it is at a time. Contact checks use each actor's `effectors(c)` (head/face/hands/feet points and
capsules from the FINAL channels); thresholds are depths, not touching (a palm on a face is contact, not clipping).
Furniture boxes are coarse, so hands count only when the forearm comes down through an item's top. Teleports are
discontinuities (a big step that is also ≥3× the surrounding steps), so fast smooth moves pass.

## 2. `episode.json`

Validated by zod (strict: unknown keys are errors). Abbreviated example:

```jsonc
{
  "$schema": "../../catalog/episode.schema.json",
  "id": "my-video", "title": "My Video",
  "format": { "preset": "landscape" },            // landscape 1920×1080 | portrait 1080×1920 | square; or width/height/fps
  "seed": "anything",                             // changes idle motion / blinks
  "set": {
    "environment": "dev-office",
    "remove": ["plant"], "move": { "desk": { "position": [0.2, 0, 0.6] } },
    "params": { "monitor-main": { "screen": { "preset": "code", "code": "…" } } },
    "add": [{ "id": "mug-2", "kind": "mug", "on": "desk", "position": [0.1, 0.76, 0] }],
    "shell": { "wall": "#3b2f4a" }, "marks": {}, "cameras": {}
  },
  "mood": "late-night",
  "cast": {
    "rayan":  { "actor": "rayan", "at": "chair-seat", "pose": "sit_typing", "appearance": { "jacketColor": "#22c55e" },
                "voice": { "system": "Microsoft David Desktop", "elevenlabs": { "voiceId": "…", "model": "eleven_multilingual_v2" } } },
    "claude": { "actor": "claude", "at": "desk-mascot", "scale": 1.6 }
  },
  "dialogue": [
    { "id": "l1", "speaker": "rayan", "text": "Okay. Final deploy.", "at": 2 },
    { "id": "l2", "speaker": "claude", "text": "Did you run the tests?", "gap": 0.5 }   // no `at`: follows previous line
  ],
  "actions": [
    { "at": "l2.word:3", "actor": "rayan", "look": "claude", "pose": "sit_idle", "emotion": "skeptical" },
    { "at": "l2.end+0.4", "actor": "rayan", "gesture": "facepalm", "speed": 0.8 },
    { "at": 6, "actor": "rayan", "move": { "to": "door", "speed": 1.2 } },
    { "at": 9, "actor": "rayan", "joints": { "elbowR.x": -2.2 }, "duration": 1, "transition": 0.2 },
    { "at": 9, "actor": "rayan", "hold": { "handR": "mug" } }
  ],
  "camera": [
    { "at": 0, "shot": "establishing", "move": "push-in" },
    { "at": "l1.start", "shot": "close", "subject": "rayan", "track": true },
    { "at": "l2.start", "shot": "over-shoulder", "subject": "claude", "over": "rayan", "rack": [{ "at": "l2.end", "to": "rayan" }] },
    { "at": 6, "shot": "full", "subject": "rayan", "follow": { "lag": 0.8 } },
    { "at": 9, "shot": "insert", "item": "monitor-main", "anchor": "screen" }
  ],
  "lighting": [{ "at": "l2.end", "mood": "red-alert", "transition": 0.2 }],
  "props":    [{ "at": "l2.end", "item": "monitor-main", "set": { "screen": { "preset": "error" } } }],
  "sfx":      [{ "at": "l2.end", "sound": "vine-boom", "volume": 0.6 }],      // library name | URL | file in public/videos/<id>/
  "music":    { "src": "music/bed.mp3", "volume": 0.3, "duck": 0.35 },     // engine 2: + attack 0.25, release 0.6, fadeOut 0.6 (s)
  "events":   [{ "at": "l2.end+1", "name": "title", "duration": 3, "data": { "text": "…" } }],
  "captions": { "style": "subtitle" },                                       // subtitle | pop | none
  "end": "l2.end+4"
}
```

**Time references**: a number (seconds), `"<line>.start"`, `"<line>.end"`, `"<line>.word:<n>"` (n-th word,
1-based, start) or `"<line>.word:<n>.end"`, each optionally `+0.3` / `-0.2`. Lines can only reference
earlier lines.

**Places / targets**: `[x,y,z]`, a set mark name (`chair-seat`, `door`…), a set item id (`monitor-main`,
`monitor-main.screen`), an actor (`claude`, `claude.face`), or `"camera"` (look into the lens).

**Actions** (any combination per entry): `pose`, `emotion`, `gesture` (+`speed`, `intensity`), `look`
(`null` = straight ahead), `move` (`to`, `speed|duration`, `face`: `path|keep|<deg>`, `ease`: `in` for falls;
arriving at a mark turns to its yaw), `turn` (deg or target), `hold` (`{ socket: item|null }`; a held set item
hides from the set), `joints` (precise channel overrides, see the actor manifest's `channels`; `mode: add` for
offsets, `duration` to release; `keys: [{ at, joints }]` for a smooth spline through via points, `joints` being
the values at `at`), `transition` (blend seconds). `intensity` is the gesture's strength, or — on an action without
a gesture — how far toward the `emotion` (0..1).

**Interaction recipes** — `"do"` expands at resolve time into the cues above (plus props cues and sfx), so
nothing new runs per frame and every anatomy uses its own channels (`reach`, `recipeGestures` in its definition):

| do | needs | what it does |
|---|---|---|
| `press` | `target: "item.anchor"` | standing on it → stomp (Rayan) / hop (mascot) and sink with the key; otherwise a hand tap. `weight: false` = too light (nothing moves). `duration` = hold, then release. |
| `point` | `target` | look + straight arm at it (mascot leans). `duration` = how long. |
| `pick-up` | `item` | walks close if needed, crouches for low things, reaches, holds it in the near hand (mascot: on top). |
| `place` | `target` | walks close, reaches, releases; the carried item reappears there (a copy toggled visible, so camera occluders stay static). On a pressable anchor its weight presses it. |
| `react` | `target?` | flinch + shocked + look at the source. |
| `sit-down` / `stand-up` | `target?` (seat mark / where to walk) | walk + slow pose blend. |
| `facepalm` | — | palm on the face, head bowed, eyes shut (seated or standing, via the actor's `selfReach`); armless actors get `tired` + a head shake. Engine 2 (`defaults.viaPoints`): `selfReach(…, { precise: true })` aims at the bowed head (palm over the eye), holds the head's turn, and a keyed override rises through a point in front of the chest (0.6 s); a contact is recorded for `inspect`. |
| `sip` | a held item | brings it to the mouth (`hand` picks which); same engine-2 via point. |

Every recipe takes `sound` (played at the moment of contact). Only `emotion` is applied alongside a `do`. For
choreography the recipes can't express, use `joints` or a custom `scene` component.

**Accents** (`"fx": [...]`, see `catalog/fx.json`, `npm run cli -- list fx`): `text` (kinetic type: pop | stagger |
slam | type, auto-fit), `window` (AppWindow: chat | terminal | dialog | notification), `callout` (arrow + label pinned
to `on`: item.anchor / actor[.anchor] / mark / point), `impact` (3D burst at `on`), `shake`, `glitch` (chromatic
aberration), `flash`, `dip` (cover a cut at its middle). Each takes `at`, optional `duration`, `sound`, `volume`.
Screen accents keep clear of the vertical-video UI bands; the effect set for post is fixed per episode.

**Camera shots**: `establishing` (`spot`), `wide`, `full`, `medium`, `close`, `two-shot`, `over-shoulder`
(`over`), `insert` (`item`, `anchor`), `custom` (`position`, `target`, `fov`). Modifiers: `angle` (deg around
the subject from its facing; + = its left), `height` (`eye|low|high|metres`), `size` (framing multiplier),
`distance`, `lens` (mm, short side) or `fov`, `offset` (`[x,y]` subject screen position), `roll`,
`move` (one or a list of `push-in`, `pull-out`, `truck`, `orbit`, `crane`, `handheld`, each with `amount`),
`track` / `follow` (`{ lag }`), `focus` (`auto|none|target`), `rack` (`[{at,to,duration}]`), `dof`
(`auto|off|{bokeh,range}`), `blend` (seconds, instead of a cut), `lock` (no corrections),
`allowOcclusion` (ids allowed in front).

## 3. Camera behaviour

- **Layout, once per shot**: from the subjects' anchors sampled across the whole shot, the shot size,
  lens and aspect ratio, it chooses side/angle, a distance that fits both the vertical and horizontal
  field of view (so 9:16 two-shots back off automatically), height and lead room.
- **Per frame**: aim, position and focus are recomputed at `t`. `track` pans/tilts to a subject smoothed
  over `[t-lag, t]`; `follow` also moves the camera body with a longer window. Moves are eased offsets over
  the shot. `blend` interpolates two pure shot evaluations.
- **Corrections only fill gaps**: occluders (walls, solid props, other actors) and set bounds can change
  the angle, distance or lens *only when you didn't author them*. Authored values and `lock: true` are kept
  and `validate` reports the problem instead.
- **DOF** follows the speaking subject's face (`focus: auto`) on close/medium/OTS/insert shots; wide shots
  are sharp. Post stack: DepthOfField, Bloom, Vignette, Neutral tone mapping, MSAA.

## 4. Code escape hatches (inside the video folder)

```tsx
// videos/<slug>/index.tsx
import { defineVideo, useEpisode, useEvent, useAnchor, ScreenSurface } from "../../src/engine";
import episode from "./episode.json";
import data from "./video.data";               // optional: { environments, actorDefs, componentKinds }

const Billboard: React.FC = () => {             // extra 3D content (inside the canvas)
  const { t } = useEpisode();
  const hit = useEvent("boom");                 // { active, progress, local, data, started }
  return hit.active ? <mesh scale={1 + hit.progress}>…</mesh> : null;
};

export default defineVideo({
  episode, ...data,
  components: { neon_sign: NeonSign },          // custom set item kinds (place them with set.add)
  screens: { dashboard: drawDashboard },        // custom screen presets: { "preset": "dashboard" }
  actors: { robot: { def: robotDef, View: Robot } },
  scene: Billboard,                             // extra 3D
  overlay: TitleCard,                           // extra 2D (Remotion DOM, below captions)
});
```

Everything is also usable without the player: `evaluateActor(track, t)`, `<ActorView>`, `cameraAt`,
`<SetView>`, `<Lighting>`, `<PostFX>`, `ScreenSurface`.

## 5. Actors

Contract (`src/engine/actors/rig.ts`): an actor's state is a flat map of named **channels** it defines
itself (Rayan: joint angles + face; the mascot: squash, tilt, eye shapes). A definition provides `channels`
(rest/min/max), `poses`, `emotions`, `gestures` (absolute `set` blended by an envelope and/or additive `add(u)`),
`sockets`, `appearance`, framing `anchors(channels)` (`feet, waist, chest, head, face, top`) and
`life(channels, signals)` mapping breath, blinks, amplitude talk, look yaw/pitch and gait onto its channels.
Layering: placement/locomotion → pose → emotion → gestures → life → `joints` overrides.
Optional `persona` (`{ description, listen: { delay, nod } }`) holds acting defaults read only by opt-in behaviours.
Listening (`ActorTrack.listen`, built by `player/scene.ts` from `defaults.listen` / cast `listen`, the other speakers'
lines and their phrase ends, and the cut times) is a look source below authored looks — it fills `1 − authored
weight` — plus a `beat` life signal (a seeded nod 0.12 s after some phrase ends) and blinks on cuts. Off (no
`listen`) everything is exactly as before.

**Add an actor**: `src/engine/actors/<id>/<id>.data.ts` (pure) + `<Id>.tsx` (R3F view taking `channels`,
`appearance`, `held`); register in `actors/defs.ts` and `actors/index.ts`; `npm run catalog && npm test`.
A one-off actor can live in a video folder instead (`actors` + `actorDefs` in `video.data.ts`).

## 6. Sets, props, screens, moods

- Environment = data (`world/<env>/<env>.data.ts`): `shell` (floor/walls), `items` (catalog kind, position,
  yaw, `on` parent, params), `marks`, camera `cameras`, `bounds`, `defaultMood`. Register in
  `world/environments.ts`. Brand-new locations for one video can be defined in its `video.data.ts`.
- Prop = catalog metadata (`world/props.data.ts`: size = occluder box, anchors, params) + view
  (`world/props.tsx`). Props get time-resolved params (`props` cues) and the mood's practical-light levels.
- Screens (`world/Screen.tsx`): canvas textures redrawn per frame by pure `draw(ctx, {t, since}, params)`;
  presets `code` (shiki-highlighted typing), `terminal`, `error`, `deploy`, `window` (AppWindow: AI chat, terminal,
  dialog, notification), `off`. Any preset accepts `popup: { kind: dialog|notification, title, message }`.
  Resolutions above 1024 keep the 1024-wide layout but render sharper (giant screens use 2048).
- Reusable UI (`src/engine/ui/`): `AppWindow` (DOM) and `drawWindow` (Canvas2D) share one pure model
  (`windowState`), so the same params work as an overlay or on any in-world screen; `KineticText` for titles and
  punchlines. Use them directly in a video's `overlay`/`scene`, or through `fx` / the `window` screen preset.
- `micro-keyboard` environment: the world is a laptop scaled ~50× (keys 0.95 m, tops at 0.42 m), actors stay
  real size. `giant_keyboard` keys press via props cues `{ "keys": { "ctrl": true } }` or the `press` recipe;
  anchors `key:<id>`; marks `on-<key>` and `drop-enter`. Environments may set `shadowRadius` for big sets.
- `floating-space` environment (`world/floating-space/`): `shell.floor: "none"`; two `floating_island`s (tops at
  y = 0, sized by item `scale`) joined by a `light_bridge`, a `starfield` (procedural nebula dome, 54 m, + twinkling
  stars), a ringed `planet`, decorative bobbing islands and `space_rocks`; mood `space-cool`, `shadowRadius` 8.
  Marks `stand-left`, `stand-right`, `stand-center`, `on-bridge`, `far-spot`, `far-spot-2`, `drop-in`; spots
  `establishing`, `wide`, `hero-low`, `high`, `along-bridge` (framed for 9:16). Props with `origin: "top"` in the
  catalog (islands, bridge) are positioned by their top surface and their occluder box hangs below it.
- Moods (`lighting/moods.ts`): data for key/fill/rim/ambient/hemi/fog/background/exposure/bloom/practicals,
  plus optional `pulse`. Inline moods: `{ "base": "late-night", "bloom": 1.2, … }`.

## 7. Voice, captions, sound

- `npm run cli -- voice <slug>` writes `public/videos/<slug>/voice/<line>-<hash>.wav` + `voice.json`
  (duration, words, 60 Hz envelope). Providers: `elevenlabs` (needs `ELEVENLABS_API_KEY` in `.env`;
  `with-timestamps` endpoint, wav_24000, character alignment → words), `system` (offline Windows SAPI with
  word timings), `fixture` (deterministic babble). Lines are cached by content hash; stale clips removed.
  Without a manifest, timing is estimated and Studio shows a warning.
- Mouths: **amplitude-driven stylized mouthing**, not phoneme lip-sync. A phoneme/viseme track (e.g. from
  Rhubarb) would be the upgrade: add it to `voice.json` and map it in an actor's `life`.
- Captions: word timings → `@remotion/captions` pages; styles `subtitle` (name tag + progressive words) and
  `pop` (big word-highlight).
- SFX: library names resolve to the local CC0 kit in `public/sfx/` (`npm run cli -- list sfx`: description, tags,
  loudness, license; provenance in `src/engine/audio/sfx.data.ts` and `THIRD_PARTY_NOTICES.md`), then to legacy
  Remotion-hosted meme sounds (unknown rights → warned). Also URLs or files under `public/videos/<id>/`.
- Analysis (`audio/analysis.ts`, stored per clip as `analysis` in `voice.json`, backfilled free by `voice <slug>`):
  10 ms frame levels → noise floor (10th percentile), sound segments (≥ floor + 6 dB), BS.1770 loudness, peak,
  clipping, the last 30 ms, tag spans (alignment times, else the gap between the neighbouring words) with the energy
  inside them, pitch. Speech-to-text (`scripts/stt.ts`): ffmpeg's whisper filter with a local ggml model
  (`$WHISPER_MODEL`), word error rate vs the script; without a model, validation says the words are unverified.
- Engine-2 voice corrections (resolver): `trim` → `ResolvedLine.clip` in/out points on the untouched file (head cut
  frame-aligned; never sound, a word — up to where its sound ends — or a performed tag; only edges with > 120 ms of
  quiet, padded 60/200 ms), words/envelope shifted; `level` → `gain` dB toward the speaker's median loudness
  (-12/+6 dB, peak ≤ -1 dBFS, plus the line's `gain`); `speechMotion` → `talkScale` (envelope peak relative to the
  speaker's loudest line), mouth `shapedTalk` (30 ms lead, 70 ms release, closed form) and body `talkBody`
  (`slowTalk`, ±0.2 s). The Soundtrack plays clip windows with `trimBefore` and a volume; sample-accurate fades
  belong to the M5 mix plan (Remotion volumes are per frame; cuts land in ≥ 120 ms of near-floor audio).
- Takes: `voice <slug> --takes l3=3` adds `l3#1`, `l3#2` (ElevenLabs/fixture: another seed; system voices: another
  rate); take 0 keeps every existing fingerprint. The line's `take` picks one; `--max-credits` refuses an expensive
  run before any request. `--report` (tiers 1–2 + a labelled measured pick), `--audition`, `--show`.
- Voices: `voice --check` (free) shows plan, credits, models and usable voices. Paid generation needs
  `--provider elevenlabs`; the default model is `eleven_v4` (stability + similarity only; inline audio tags like
  `[sighs]` are performed, and stripped from captions, word refs and offline voices). Clips are cached by a
  fingerprint of the effective request and record model/voice/plan tier; free-plan clips are non-commercial.
- Audio readiness: final renders (CLI or plain `npx remotion render`) refuse unvoiced/stale lines and missing
  files; drafts (`render --draft`) only refuse missing files (a 404 aborts any render).

## 8. Troubleshooting

- Blank 3D in exports but fine in Studio → something renders asynchronously; gate it with `delayRender`
  (see `ComposerGate` in `camera/Camera.tsx`).
- `stills --verify` reports differences → something depends on render order (state, async textures,
  `Math.random`). Scene state can be checked in Node with `evaluateScene` in both orders.
- Render timeout after sleep → re-run. Sparse `--frames` lists must be rendered `--props={"silent":true}`.
- Passes that render before the main render (reflections, render targets) read shadow maps from the
  previous frame → order-dependent pixels. Refresh shadows first with a negative-priority `useFrame`
  pre-render (`ShadowPrepass` in `videos/launch-promo/index.tsx`). Only render-order plumbing may use
  `useFrame`; never animate with it.
- Async textures (e.g. SMAA lookup images) make a tab's first frame differ — that's why the engine uses MSAA.

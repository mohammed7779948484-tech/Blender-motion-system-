# Direction cookbook (episode.json patterns)

Copy, then adapt. Field reference: `catalog/episode.schema.json`; `npm run cli -- validate` tells you what's wrong.
Working example using almost everything here: `videos/ctrl-z/episode.json`.

## Contents
1. Skeleton · 2. Cast & voices · 3. Dialogue & time refs · 4. Actions · 5. Recipes · 6. Accents (fx)
7. Screens & props cues · 8. Set overrides · 9. Camera · 10. Sound · 11. Mood · 12. Custom locations
13. Escape hatches

## 1. Skeleton
```json
{
  "$schema": "../../catalog/episode.schema.json",
  "id": "my-slug", "title": "My Title",
  "format": { "preset": "portrait" },
  "set": { "environment": "micro-keyboard" },
  "cast": { "rayan": { "actor": "rayan", "at": "on-g" } },
  "dialogue": [], "actions": [], "fx": [], "sfx": [], "props": [],
  "camera": [{ "at": 0, "shot": "medium", "subject": "rayan" }],
  "captions": { "style": "pop" },
  "end": "l3.end+2"
}
```

## 2. Cast & voices
```json
"rayan":  { "actor": "rayan", "at": "chair-seat", "pose": "sit_typing", "emotion": "tired",
            "voice": { "system": "Microsoft David Desktop", "rate": 1, "elevenlabs": { "voiceId": "TX3LPaxmHKxFdv7VOQHJ" } } },
"claude": { "actor": "claude", "at": "desk-mascot", "scale": 1.6, "yaw": -15,
            "voice": { "system": "Microsoft Zira Desktop", "pitch": "+30%", "rate": 1, "elevenlabs": { "voiceId": "cgSgspJ2msm6clMCkdW9" } } }
```
- `at`: a mark (`show environment <id>` lists them), an item id, or `[x, y, z]` (y > 0 to stand on things).
- Environments (`set.environment`): `dev-office` (desk, monitors, lamp: `chair-seat`, `desk-mascot`, `beside-desk`),
  `micro-keyboard` (giant laptop, stand on keys: `on-g`, `on-h`, `on-enter`…), `floating-space` (two floating islands
  + a hard-light bridge in a starfield, mood `space-cool`: `stand-left`, `stand-right`, `stand-center`, `on-bridge`,
  `far-spot`, `far-spot-2`, `drop-in`; walk `stand-right` → `far-spot` and the straight path follows the bridge;
  spots `establishing`, `wide`, `hero-low`, `high`, `along-bridge`). Anything else: `new --env custom` (section 12).
- Mascot scale: ~1.5 on a desk, ~2 on giant keys next to Rayan, ~4 standing beside him on the floor or an island.
- Voice ids: `voice --check` lists the ones this key can use (Liam `TX3LPaxmHKxFdv7VOQHJ` = young male creator,
  Jessica `cgSgspJ2msm6clMCkdW9` = cute/playful, Will `bIHbv24MWmeRgasZH58o`, Laura `FGY2WhTYpPnrIDTdsKH5`).

## 3. Dialogue & time refs
```json
{ "id": "l1", "speaker": "rayan", "text": "[panicked] Wait. Did I just deploy... on a Friday?", "at": 1.3 },
{ "id": "l2", "speaker": "claude", "text": "[cheerfully] Relax! Just press Control Z.", "gap": 0.2 },
{ "id": "l3", "speaker": "claude", "text": "[sighs] I weigh nothing.", "at": "l2.end+5.9" }
```
Per line (all optional): `"take": { "n": 2, "by": "director", "why": "…" }` (which generated take plays; `by:
"agent"` = measured, not heard), `"trim": false` or `{ "start": 0.2, "end": 2.4 }` (file seconds; engine 2 trims
silent edges itself), `"gain": -6` (dB on top of levelling), `"caption": "Hey!!"` (shown instead of the spoken text).
Engine-2 voice corrections, off with `"defaults": { "trim": false, "level": false, "speechMotion": false }`.

Refs: `"l2.start"`, `"l2.end+0.3"`, `"l3.word:2"` (2nd spoken word; tags don't count), `"l3.word:2.end-0.1"`.
Lines can only reference earlier lines, and refs only point at dialogue lines: beats before the first line use
absolute seconds. A pause between words is the right spot for a UI ping:
`"l1.word:1.end+0.03"`.

## 4. Actions
```json
{ "at": "l1.start", "actor": "rayan", "emotion": "shocked", "look": "camera" },
{ "at": "l2.word:3", "actor": "claude", "gesture": "nod" },
{ "at": 4, "actor": "rayan", "pose": "celebrate", "transition": 0.45 },
{ "at": 5, "actor": "rayan", "move": { "to": "on-z", "duration": 2.3 } },
{ "at": 0.1, "actor": "rayan", "move": { "to": "on-enter", "duration": 0.38, "ease": "in", "face": "keep" } },
{ "at": 7, "actor": "rayan", "turn": 0, "transition": 0.2 },
{ "at": 8, "actor": "rayan", "hold": { "handR": "mug" } }
```
`look`: actor (`"claude"`, `"claude.face"`), item (`"keyboard.key:ctrl"`), mark, `[x,y,z]`, `"camera"`, `null`.
`turn`: degrees or a place/actor — not `"camera"` (use `look: "camera"` to face the lens).
A `move` to a mark turns to the mark's yaw on arrival; `ease: "in"` for falls. Big pose changes need time: arms
thrown overhead in 0.25 s (`celebrate`) move the hands 44 cm in one frame — give them ≥ ~0.4 s.

**Performance.**
- `intensity` on an action without a `gesture` is how far toward its `emotion` (0..1):
  `{ "emotion": "angry", "intensity": 0.4 }` reads irritated, not furious. With a gesture it stays the gesture's strength.
- `gesture: "beat"` (Rayan: head dip + brow lift; mascot: forward dip) is a small emphasis accent — put it on a word:
  `{ "at": "l3.word:4", "actor": "rayan", "gesture": "beat" }`.
- Keyed joints pass smoothly through every key (via points), so a limb goes around the body instead of through it:
  `{ "at": 2, "actor": "rayan", "joints": { "shoulderR.x": -0.3 }, "keys": [{ "at": 2.3, "joints": { "shoulderR.x": -1.2, "elbowR.x": -1.6 } },
  { "at": 2.6, "joints": { "shoulderR.x": -2.0, "elbowR.x": -1.1 } }], "duration": 1.5, "transition": 0.3 }`.
  `joints` are the values at `at`; a channel first keyed later takes that first keyed value from the start.

**Listening (opt-in).** `"defaults": { "listen": 1 }` for the episode, or `"listen": 0..1` on a cast member (0 =
restrained: exactly off). Characters then look at whoever is speaking after their persona's reaction delay (Rayan
0.2 s, the mascot 0.35 s), glance away now and then in long lines, nod at some phrase ends (word gaps ≥ 0.3 s and the
line end) and blink on cuts. It never overrides an authored `look`: it only fills the weight a look leaves
(`look: null` hands control back to it). It shows only when the listener is on screen — cut to a reaction shot during
the line (`videos/ctrl-z-remaster`).

## 5. Recipes (`do`)
```json
{ "at": "l2.end+2.75", "actor": "rayan",  "do": "press", "target": "keyboard.key:z", "sound": "key-slam", "volume": 0.5 },
{ "at": "l2.end+3.3",  "actor": "claude", "do": "press", "target": "keyboard.key:ctrl", "weight": false, "sound": "pluck" },
{ "at": "l4.start",    "actor": "rayan",  "do": "point", "target": "duck", "duration": 1.0 },
{ "at": "l4.end+0.25", "actor": "rayan",  "do": "pick-up", "item": "duck", "sound": "pop", "volume": 0.7 },
{ "at": "l4.end+1.75", "actor": "rayan",  "do": "place", "target": "keyboard.key:ctrl", "rotation": -20, "sound": "impact-soft", "volume": 0.45 },
{ "at": 0.48,          "actor": "rayan",  "do": "react", "target": "claude" },
{ "at": 1,             "actor": "rayan",  "do": "sit-down", "target": "chair-seat" },
{ "at": 9,             "actor": "rayan",  "do": "stand-up", "target": "beside-desk" },
{ "at": 6,             "actor": "rayan",  "do": "sip", "duration": 1.2 },
{ "at": "l5.end+0.4",  "actor": "rayan",  "do": "facepalm", "duration": 1.8 }
```
- `facepalm` (palm on the face, head bowed, eyes shut) and `sip` (held cup to the mouth) work seated and standing.
  `sip` needs a `pick-up` first; the armless mascot's `facepalm` becomes a tired head shake. On engine 2
  (`defaults.viaPoints`, on by default) the palm lands over the eye of the bowed head, the hand rises in front of the
  chest first (no sweep through the head), and the head's turn is held meanwhile, so a look or listening can't swing
  the face away from the hand. Prefer the recipe to raw `joints` for a hand on the face.
- `press` while standing on the key = stomp/hop and the actor sinks with the key; otherwise a hand tap. Keys stay
  down unless you give `duration`. Release a key you stood on by moving off it and a props cue `{ "keys": { "z": false } }`.
- `place` on a pressable anchor presses it (the weight); the carried item reappears there.
- Recipes walk the actor close first when the target is out of reach; budget ~1.5 s for pick-up/place. Within
  reach they just turn toward it and turn back afterwards (a seated actor doesn't stay swivelled).
- Walk in and sit: `move` to a mark next to the chair (`beside-desk`), then `do: "sit-down"` with
  `target: "chair-seat"`. Moves are straight lines (no pathfinding): pick marks with a clear path. Frame the walk with
  `follow` or cut it in two; a semantic shot on a moving subject frames its whole path and comes out wide.

## 6. Accents (`fx`)
```json
{ "type": "text", "at": 0.55, "text": "DEPLOYED.", "style": "slam", "size": 210, "duration": 0.95, "accent": "#ff6b4a" },
{ "type": "text", "at": "l5.end+1.75", "text": "never deploy on a friday", "style": "type", "position": [0.5, 0.62], "size": 64, "duration": 1.55 },
{ "type": "window", "at": "l1.word:1.end+0.03", "kind": "notification", "title": "PagerDuty", "message": "🔥 production is on fire", "icon": "🚨", "accent": "#ff4d4f", "duration": 2.4, "sound": "notify", "volume": 0.45 },
{ "type": "window", "at": 12, "kind": "dialog", "title": "Undo failed", "message": "Hold CTRL + Z together", "buttons": ["OK"], "duration": 1.6, "sound": "error", "volume": 0.6 },
{ "type": "window", "at": 3, "kind": "chat", "title": "Claude", "messages": [{ "from": "user", "text": "center this div" }, { "from": "ai", "text": "No." }], "position": "center", "duration": 4 },
{ "type": "window", "at": 6, "kind": "terminal", "lines": ["$ npm test", "! 3 failing", "+ 12 passing"], "duration": 3 },
{ "type": "callout", "at": 7.7, "on": "keyboard.key:ctrl", "text": "CTRL", "duration": 1.9, "sound": "select", "volume": 0.5 },
{ "type": "impact", "at": 0.48, "on": "keyboard.key:enter", "size": 1.3, "sound": "impact-heavy", "volume": 0.8 },
{ "type": "shake", "at": 0.48, "amount": 0.07, "duration": 0.45 },
{ "type": "glitch", "at": 12, "duration": 0.5, "sound": "glitch", "volume": 0.6 },
{ "type": "flash", "at": 5 },
{ "type": "dip", "at": 20, "duration": 0.7 }
```
Text styles: `pop` (word by word), `stagger`, `slam`, `type`; `position`: `top` (default for text/notifications),
`center`, `bottom`, or `[x, y]` fractions. `dip` is fully covered at its middle — put a cut there.

## 7. Screens & props cues
```json
"props": [
  { "at": 0.5, "item": "screen", "set": { "screen": { "preset": "deploy", "label": "Deploying to PRODUCTION…", "duration": 2.2 } } },
  { "at": 12, "item": "screen", "set": { "screen": { "preset": "error", "title": "UNDO FAILED", "message": "ctrl ✗  z ✓", "lines": ["hint: find something heavy"] } } },
  { "at": 23, "item": "screen", "set": { "screen": { "preset": "window", "kind": "terminal", "title": "undo", "lines": ["$ git revert HEAD", "+ Undo successful"], "interval": 0.25 } } },
  { "at": 3, "item": "monitor-main", "set": { "screen": { "preset": "code", "code": "fix();", "popup": { "kind": "notification", "title": "Slack", "message": "boss: got a sec?" } } } },
  { "at": 7, "item": "keyboard", "set": { "keys": { "enter": false }, "highlight": ["ctrl", "z"] } },
  { "at": 9, "item": "mug-2", "set": { "visible": true } }
]
```
Screen presets: `code`, `terminal`, `error`, `deploy`, `window`, `off` (+ `popup` on any). `show screen <id>`.
`code` highlights `lang`: typescript, python, bash, json, css, html (anything else shows as plain text).

## 8. Set overrides
```json
"set": {
  "environment": "micro-keyboard",
  "move":   { "duck": { "position": [-4.512, 0.42, 1.9] } },
  "params": { "keyboard": { "backlight": 0.75 }, "screen": { "screen": { "preset": "code", "code": "…", "speed": 0, "fontSize": 44 } } },
  "add":    [{ "id": "mug-2", "kind": "mug", "on": "desk", "position": [0.1, 0.76, 0], "params": { "visible": false } }],
  "remove": ["plant"]
}
```
Positions of items `on` a parent are in the parent's frame. Micro-keyboard key tops: `npm run cli -- show prop
giant_keyboard` lists `key:<id>` anchors (y 0.42; pressed keys sink 0.18).

## 9. Camera
```json
{ "at": 0, "shot": "custom", "position": [7.7, 0.75, 3.1], "target": [6.05, 1.9, 0], "fov": 52 },
{ "at": 0.95, "shot": "close", "subject": "rayan", "angle": -10 },
{ "at": 4.5, "shot": "medium", "subject": "claude", "angle": 30 },
{ "at": 7.4, "shot": "full", "subject": "rayan", "follow": { "lag": 0.35 } },
{ "at": 9.9, "shot": "two-shot", "subject": ["rayan", "claude"], "height": "low", "size": 0.85 },
{ "at": 11, "shot": "over-shoulder", "subject": "claude", "over": "rayan" },
{ "at": 12, "shot": "insert", "item": "monitor-main", "anchor": "screen" },
{ "at": 27, "shot": "close", "subject": "rayan", "angle": -15, "move": { "type": "push-in", "amount": 0.15 } }
```
`angle` is degrees around the subject from its facing in the middle of the shot (+ = its left); for a `two-shot`
it is measured from the side of the line between the two heads that the first subject faces. Authored values are
used exactly; solver warnings in `validate` mean a blocked or out-of-frame shot, or a shot that sees the back of a head.
`offset: [x, y]` moves the subject on screen in half-frame units (+x right, +y up), e.g. `[0, -0.12]` drops a face
below a top toast. `fov` is vertical, as in three.js. In `dev-office` the monitors block many angles on the seated
actor — try a few (`validate` is instant) before rendering stills. Close shots of the desk mascot work best from the front.

**Moves inside a shot.** Moves span the shot unless timed: `{ "type": "push-in", "amount": 0.2, "at": "l3.word:4",
"duration": 0.8 }` lands a push on a word. `move: "life"` is a barely visible breathing drift (opt-in, `amount` 0–2);
`defaults.cameraLife` applies it to every shot without a move. `move: "static"` stays locked off.

**Sustained choreography (`keys`).** Keyframes in the solver's terms, smooth through every key (no stop at each one),
relative to the subject — with `follow` the camera rides along while orbiting:
```json
{ "at": "l2.end", "shot": "full", "subject": "rayan", "blend": 1.2, "follow": { "lag": 0.6, "lead": 0.3 },
  "keys": [ { "at": "l2.end", "angle": 160 }, { "at": "l2.end+2.6", "angle": 95, "size": 1.15 },
            { "at": "l2.end+5", "angle": 30, "size": 0.95, "height": "low" } ],
  "allow": ["back-of-head"] }
```
(`videos/one-take`: a 7 s walk across the light bridge, from behind to a low front ¾.) Key fields: `angle` (as above),
`distance` or `size`, `height`, `lens`/`fov` (key distance and lens together for a dolly-zoom), `offset`, `roll`. Values
hold until a later key changes them. `angle` is measured from the subject's facing mid-shot: a mark arrival turns the
actor to the mark's yaw — use `move.face: "path"` to keep the walking direction. Authored keys are never corrected:
`inspect` checks the real path (faces blocked or out of frame, camera inside geometry). `follow`/`track` take
`{ "lag": s, "lead": s }` (lead looks ahead of a walker).

**Authored flights (`path`).** World-space keys on a `custom` shot: `"path": [{ "at": 0, "position": [0,1,4],
"target": [0,1,0] }, { "at": 4, "position": [1,3,3], "target": [0,0.8,0], "lens": 28 }]` (crane, fly-through).

**Engine 2 corrections** (on by default with `"engine": 2`, off with `"defaults": { "focusPull": false, "arcBlend":
false }`): auto focus holds the last speaker and pulls (~0.45 s) instead of snapping; `blend` arcs around the subject
instead of moving in a straight line through it. (The third correction, `viaPoints`, is in the recipes — section 5.)

## 10. Sound
```json
"sfx": [{ "at": 0.48, "sound": "key-slam", "volume": 0.9 }, { "at": "l2.end+0.1", "sound": "whoosh", "volume": 0.5 }]
```
By purpose (all CC0, `list sfx`): hits `key-clack key-slam impact-heavy impact-medium impact-soft impact-wood
impact-metal`; UI `click select toggle tick notify error confirm window-open window-close mouse-click`; comedy
`pop pluck scratch`; digital `glitch zap power-up power-down success`; transitions `whoosh whip`.
Episode-specific files: put them in `public/videos/<slug>/` and use the relative path (`"sound": "sfx/my.wav"`).

**Bed (music / room tone).** `"music": { "src": "videos/<slug>/sfx/bed.mp3", "volume": 0.1, "duck": 0.5 }` loops under
everything and drops to `duck` × volume while anyone speaks. Engine 2 ramps the duck (`attack` 0.25 s, `release` 0.6 s,
sine) and fades the bed out over the last `fadeOut` 0.6 s; set any of them to 0 for a hard switch. A second, unducked
layer (room tone, rain) is an ordinary `sfx` at 0 with a file at least as long as the episode. The references this
studio imitates keep a bed under the whole short (≈10–12 dB under the voices between lines). ElevenLabs' Music API
needs a paid plan; its sound-generation endpoint (`loop: true`, `duration_seconds` ≤ 30) makes seamless beds and
one-shots (a squeak) on the free plan — cache the files in `public/videos/<slug>/` and note the prompt in BRIEF.md.
You can't listen: check a generated bed's level (`ebur128`), pulse (onset autocorrelation) and key (chroma) before using it.

## 11. Mood
`"mood": "macro-warm"` or inline `{ "base": "macro-warm", "fill": { "color": "#7f97ff", "intensity": 0.8, "position": [-6, 4, 9] } }`;
change over time with `"lighting": [{ "at": "l2.end", "mood": "red-alert", "transition": 0.2 }]`. `list moods`.

## 12. Custom locations (`new --env custom`)
Facts you'd otherwise dig out of engine source:
- `shell.floor: "none"` removes the built-in floor (sky, space); otherwise a 40 × 40 m floor sits at y = 0.
- The key light aims at the origin and casts shadows within ±`shadowRadius` m (default 4.5): keep the stage near the
  origin or set `shadowRadius` on the environment.
- The camera far plane is 80 m: domes and backdrops must sit inside it.
- A custom item has anchors only through `size` (the centre of its size box); add `marks` for look and move targets
  (`"look": "cloud-top"`). `size` also makes it a camera occluder.
- Components get `{ id, params, since, t, practicals, screens, cues }`; animate only from those. `useEvent(name)`
  returns the latest event with that name, so a repeated beat can reuse one name. `ScreenSurface` draws any screen
  preset or your own draw function onto a plane.
- The scaffold casts Rayan and Claude on its two marks; remove whoever the story doesn't need.

## 13. Escape hatches
- **Exact joint poses** (`joints`, released after `duration`):
  `{ "at": 27.8, "actor": "rayan", "joints": { "shoulderR.x": -1.99, "elbowR.x": -1.14, "head.x": 0.45 }, "transition": 0.3 }`.
  `facepalm` and `sip` cover the common hand-to-face moves. For any other hand target, run the actor's `reach` once
  in a scratch script kept outside the repo (your session scratchpad, e.g. `x.mts`, run from the repo root with
  `node --import tsx <scratchpad>/x.mts`; the engine is imported by file URL so any checkout path works). Targets
  are root-local metres, +Z forward, +X = his left; hands reach ~0.5 m; for a seated actor start from
  `rayanDef.poses.sit_idle.set`:
  ```ts
  import path from "node:path";
  import { pathToFileURL } from "node:url";
  const engine = (p: string) => import(pathToFileURL(path.resolve("src/engine", p)).href); // cwd = repo root
  const { rayanDef } = await engine("actors/rayan/rayan.data.ts");
  const { restChannels } = await engine("actors/rig.ts");
  // Standing example; for a seated actor use rayanDef.poses.sit_idle.set here.
  const c = { ...restChannels(rayanDef), ...rayanDef.poses.stand_idle.set, "torso.x": 0.2, "head.x": 0.45 };
  const face = rayanDef.anchors(c).face;                       // anchors: feet waist chest head face top
  const r = rayanDef.reach!(c, [face[0] - 0.11, face[1] - 0.07, face[2] - 0.06], "R");
  console.log(r.reached, JSON.stringify(r.set));               // paste r.set (+ head/torso) into "joints"
  ```
- **Custom 3D/2D** in `index.tsx`: `scene` (inside the canvas), `overlay` (DOM), `components` (custom set item kinds,
  listed in `video.data.ts` `componentKinds`), `screens` (custom screen draw functions, `screenKinds`).

# Remotion_System — video authoring guide (for coding agents)

A code-first studio for stylized low-poly 3D shorts: Remotion + React Three Fiber. Each video is a folder in
`videos/<slug>/` that **reuses** the shared engine (`src/engine`) and adds its own brief (`BRIEF.md`), direction
(`episode.json`) and, when needed, its own code. Full reference: `docs/ENGINE.md`.

**Making or changing a video?** Follow the workflow in `.claude/skills/make-episode/SKILL.md` (brief → direction →
voices → checks → render → review) and its `references/` (creative direction, JSON cookbook, QA). Videos in this
repo are made with this engine, not with other video frameworks.

## Commands

```
npm run cli -- list [actors|props|environments|shots|moves|moods|screens|fx|sfx|videos|direction]
npm run cli -- show actor rayan            # or: prop giant_keyboard | environment micro-keyboard | mood macro-warm | screen window | fx callout | sfx key-slam
npm run cli -- new <slug> [--env dev-office|micro-keyboard|floating-space|custom] [--preset portrait] [--title "..."]   # writes BRIEF.md; 9:16 default
npm run cli -- voice <slug>                          # free offline voices (drafts)
npm run cli -- voice --check                         # free: ElevenLabs plan, credits, models, voices
npm run cli -- voice <slug> --provider elevenlabs    # paid (Eleven v4); never implied by a key in .env
npm run cli -- voice <slug> --takes l3=3 [--max-credits N]   # alternative takes; --report / --audition l3 / --show l3
npm run cli -- validate <slug>                       # beat sheet, audio readiness + every inspect finding (✖ ⚠ · ~)
npm run cli -- inspect <slug> [--json]               # per-frame checks in Node (~1 s): framing, camera, motion, contact, overlays — with time, object, source
npm run cli -- explain <slug> --t 4.2 [--actor rayan | --camera]   # every layer at that moment and the episode.json entry behind it
npm run cli -- stills <slug> [--edges | --at findings | --frames 0,90] [--verify] [--guides]   # labelled contact sheets → out/<slug>/contact*.png
npm run cli -- preview <slug> --from 3 --to 6        # short low-res MP4 + preview-strip.png to judge motion
npm run cli -- render <slug> [--master] [--draft]    # → out/<slug>.mp4 (--master: -14 LUFS)
npm run cli -- review <slug>                         # after render: frame sheet + loudness/mix report
npm run dev        # Remotion Studio preview
npm test           # engine tests (determinism, goldens, fault set, camera, resolver, recipes, fx, voice, audit, catalog freshness)
npm run catalog    # regenerate catalog/ after changing the shared engine
```

## Rules

- **Isolation**: a video only touches `videos/<slug>/` and `public/videos/<slug>/`. Change the set with
  `set.remove / move / params / add` overrides, never by editing shared data. Import only from `src/engine`.
- **Change the shared engine only for reusable capabilities** (a new prop, pose, recipe, accent, mood, shot
  behaviour). Then: add/adjust tests, `npm run catalog`, `npm test`, and re-run `stills` of existing videos to check
  for regressions (byte-identical, or only harmless 1–3/255 GPU noise on translucent effects). `npm test` includes
  golden hashes of every finished video's frame-by-frame visual state: a failure means the change reached the
  picture of an existing video. New automatic behaviour must read the resolved `behaviour` (`engine: 2`, profile,
  `allow`) so engine-1 videos stay exactly as they are; refresh goldens (`UPDATE_GOLDENS=1`) only for intended changes.
- **Creative intent**: static shots, silence, darkness and restraint are valid. When a check reports something
  you did on purpose, mark it with `allow` on the shot or episode (`list direction`); it is then listed as accepted.
- **Determinism** (custom code too): everything must be a pure function of the frame. Use
  `useCurrentFrame()`/`useEpisode().t`, Remotion `interpolate`/`spring`/`random(seed)`, `@remotion/noise`.
  Never `Math.random`, `Date`, `useFrame` animation, damping/accumulation, or async-loaded content without
  `delayRender`. Postprocessing must stay non-temporal, and its effect set is fixed per episode.
- **Camera**: prefer semantic shots (`close`, `medium`, `over-shoulder`, `two-shot`, `insert`…) with a
  `subject`; the solver frames for the aspect ratio, avoids occluders and focuses. Anything you author
  (`angle`, `distance`, `lens`, `position`…) is used exactly — a blocked authored angle is reported, not fixed.
- **Secrets and cost**: never print or commit `.env`; paid ElevenLabs runs need `--provider elevenlabs`.
  Free-plan voice clips are non-commercial (credit "elevenlabs.io" in titles); prefer the CC0 sound kit.
- Mouths are amplitude-driven stylized mouthing (not phoneme lip-sync).

## Examples

- `videos/ctrl-z/` — 9:16 skit on the `micro-keyboard` world: brief, recipes (press/point/pick-up/place/react),
  accents (impact, shake, slam text, toast, callouts, glitch, dialog, end card), Eleven v4 voices, CC0 sounds.
- `videos/it-works-on-my-machine/` — 16:9 skit in the shared `dev-office` set; JSON direction plus one overlay.
- `videos/launch-promo/` — 9:16 promo on a **new location defined inside the video folder**
  (`video.data.ts` environment + custom stage components, holo-screen drawings, kinetic text overlays).
- `videos/one-take/` — engine-2 camera choreography: one sustained `follow` shot with `keys` (an orbit from behind to a
  low front ¾ across the floating-space bridge), an arcing blend, focus pulls, and deliberate shots marked with `allow`.
- `videos/ctrl-z-remaster/` — engine-2 performance: the ctrl-z payoff copied (ctrl-z itself stays frozen) and redirected
  with opt-in listening plus a reaction shot, the via-point `do: "facepalm"` instead of raw joints, and a slower `celebrate`.

## Gotchas learned building the first videos

- Seated actors need seated poses (`sit_idle`, `sit_typing`, `sit_explaining`, `sit_arms_crossed`); standing
  poses bring standing legs. The stock `facepalm` gesture stops at chest height; for a palm on the face use the
  `do: "facepalm"` recipe (seated or standing; on engine 2 it lands over the eye and never passes through the head).
  `do: "sip"` brings a held mug to the mouth.
- Scene presets: `dev-office` (desk set), `micro-keyboard` (giant laptop), `floating-space` (two rock islands joined
  by a light bridge in a starfield: stand on `stand-left`/`stand-right`, walk `stand-right` → `far-spot` across the
  bridge; island tops are at y = 0, no ground below), or `new --env custom` for a place of your own.
- In `dev-office` the monitors sit at the seated actor's left and the mascot spot at their right: front-ish
  angles see faces; strong side angles get blocked (validate will tell you).
- The Claude mascot is ~0.27 m at scale 1; use `scale` 1.5–1.8 on a desk, ~2 on giant keys, ~4 standing next to Rayan.
- Gestures along the lens axis (pointing at the camera) vanish; shoot them from the side.
- On GPU-less Linux (cloud containers, CI) renders use SwiftShader (`swangle`, see `remotion.config.ts`; `REMOTION_GL`
  overrides): correct but slow — ~4–5 s per 1080×1920 frame, so check with `stills`/short `preview`s and render the full
  video once. Offline system voices need Windows; draft timing with `--provider fixture` or go straight to ElevenLabs.
- If a render dies after the machine slept, just re-run it. Remote meme sounds download at render time.
- A subject whose head is turned away (e.g. looking at another actor) can face away from a solver-chosen
  camera: add `look: "camera"` or author an `angle`, then re-check the contact sheet.
- Effects that render extra passes before the main render (drei `MeshReflectorMaterial`) see last frame's
  shadow maps — see the `ShadowPrepass` in `videos/launch-promo/index.tsx`; confirm with `stills --verify`.

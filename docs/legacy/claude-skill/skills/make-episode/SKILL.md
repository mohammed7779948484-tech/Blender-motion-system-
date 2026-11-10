---
name: make-episode
description: Make a new short video episode (dev/AI comedy skit, meme, short story, character-led reel/short/TikTok) in this Remotion_System repo, from idea to rendered MP4 — brief first, then episode.json direction (cast Rayan + the Claude mascot, environments like the office, the giant micro-keyboard or floating space islands, interaction recipes, fx accents, screens, CC0 sound effects, Eleven v4 voices), visual QA and an editorial review. Use this whenever someone asks to create, write, direct, animate, voice, fix or render a video, episode, short, skit, scene or gag in this repository, or to change an existing episode — even if they never say "episode". In this repo, use this instead of the HyperFrames / general-video / motion-graphics skills.
---

# Make an episode

This repo is a code-first studio: each video is a folder `videos/<slug>/` with a **BRIEF.md** (intent), an
**episode.json** (executable direction: cast, dialogue, actions, camera, fx, sfx…) and optional custom code, all
driving a shared deterministic 3D engine (`src/engine`). Your job is to make something people stop scrolling for —
a clear hook, escalation, a payoff — and to prove it renders correctly.

Work in this order. Each step has a cheap check, so problems surface before the expensive ones.

## 1. Idea → BRIEF.md

```
npm run cli -- new <slug> [--env dev-office|micro-keyboard|floating-space|custom] [--preset portrait|landscape|square] [--title "..."]   # portrait (9:16) by default
```

`new` scaffolds the folder, registers it in `videos/registry.ts` (that edit is expected), and writes a BRIEF.md template. Fill it in **before** directing:
concept in one line, the hook (what happens in the first 1–2 s), beats (setup → escalation → payoff), who does
what, setting, sound plan, what you reuse, what you must build. Keep it short and editable — it is the north
star for every later decision, not a form. Read `references/creative-direction.md` for hooks, comedic timing,
camera grammar, mobile readability and sound design before writing the beats.

`--env custom` creates a video-local location (`video.data.ts` + components), the pattern to copy when the story
needs a place that doesn't exist yet; "Custom locations" in the cookbook lists the engine facts you'll need (floor,
shadows, far plane, anchors). Don't edit shared engine data for one video.

## 2. Discover what exists (don't read engine source unless you're extending the engine)

```
npm run cli -- list                 # everything: actors, props, environments, shots, moves, moods, screens, fx, sfx
npm run cli -- list fx              # accents: text, window, callout, impact, shake, glitch, flash, dip (+ when to use)
npm run cli -- list sfx             # CC0 sound kit with tags + loudness; remote meme sounds are flagged
npm run cli -- show actor rayan     # poses, emotions, gestures, sockets, channels
npm run cli -- show environment micro-keyboard
```

`catalog/*.json` holds the same data; `catalog/episode.schema.json` is the full schema.

## 3. Direct episode.json

Patterns for everything below are in `references/direction-cookbook.md` (copy-paste JSON). Essentials:

- **Time everything off dialogue** (`"l2.end+0.3"`, `"l3.word:2"`) so re-voicing keeps the beats aligned.
- **Interactions**: `"do": "press" | "point" | "pick-up" | "place" | "react" | "sit-down" | "stand-up" | "facepalm" |
  "sip"` expand into ordinary cues for each actor's anatomy (the mascot hops/leans, Rayan reaches with his arms,
  seated or standing). `"weight": false` makes a press fail on purpose. `sound` + `volume` play at the moment of contact.
- **Accents** (`"fx"`): punch text, UI windows (chat / terminal / dialog / notification toast), callouts pinned to
  3D things, impacts, camera shake, glitch, flash/dip. They are what makes a beat land on a phone.
- **Camera**: prefer semantic shots (`close`, `medium`, `full`, `two-shot`, `over-shoulder`, `insert`) with a
  `subject`; the solver frames for 9:16 and avoids occluders. Use `custom` only for deliberate compositions.
  `angle` is measured from where the subject faces in the middle of the shot; looks, turns and recipes change that,
  so a character looking at someone else can show you the back of their head (`validate` warns).
- **Performance**: emotion `intensity`, a `beat` gesture on a word for emphasis, and opt-in listening
  (`defaults.listen` / cast `listen`, 0..1: listeners look at the speaker, nod at phrase ends, blink on cuts; authored
  looks always win, 0 is exactly off). Cut to the listener during a line to use it. Cookbook "Actions".
- **Screens** (`props` cues on monitors/the giant screen): `code`, `terminal`, `error`, `deploy`, `window`, plus a
  `popup` on any of them. Text on in-world screens is small on phones — repeat the key words in a `window`/`text` fx.

## 4. Custom code (only when JSON can't express it)

`videos/<slug>/index.tsx` → `defineVideo({ episode, components, screens, actors, scene, overlay })`; pure data the
CLI must see goes in `video.data.ts`. Reusable pieces you can drop into an overlay or scene: `AppWindow`,
`KineticText`, `drawWindow`/`ScreenSurface`, `useEpisode`, `useEvent`, `useAnchor`, `useFxPoint`.

Everything must be a pure function of the frame (`useCurrentFrame()` / `useEpisode().t`, `interpolate`, `spring`,
`random(seed)`, `@remotion/noise`). No `Math.random`, `Date`, CSS animations, `useFrame` animation, or anything that
accumulates state — Remotion renders frames out of order in parallel, so stateful motion flickers or diverges.
Before writing markup or 3D code, load the installed `remotion-best-practices` skill (and the relevant
`r3f-*` skill); where their advice conflicts with these determinism rules, these rules win.

For one-off choreography the recipes can't do, use `joints` overrides — with `keys` (via points) when a limb has to
go around the body — and compute exact arm values with the actor's `reach` (see "Escape hatches" in the cookbook).

## 5. Voices

```
npm run cli -- voice <slug>                          # free offline voices: use for drafting and timing
npm run cli -- voice --check                         # free: plan, credits left, models, usable voice ids
npm run cli -- voice <slug> --provider elevenlabs    # paid, Eleven v4 (~1 credit per character incl. tags)
```

Draft with offline voices; switch to ElevenLabs once the script is locked (it prints the character count first).
Offline (SAPI) clips leave ~0.7 s of silence after each line, so drafts run long and captions linger: time the next
beat off the last spoken word (`"l2.word:5.end+0.2"`) rather than `"l2.end"`, and keep `gap`s small. That timing
also survives the switch to v4, whose clips are tighter. SAPI also pauses ~0.5–0.9 s at commas and full stops inside
a line. `voice.rate` N speeds it up by roughly 6N % (below 3 it barely changes; 4 ≈ 10 % faster).
Inline tags like `[sighs]`, `[panicked]`, `[proudly]` are performed by v4 and stripped from captions and word refs.
Unchanged lines are cached, so editing one line only re-buys that line. Free-plan clips are non-commercial and the
post title must credit "elevenlabs.io" — `validate` reminds you; mention it in your report.

Every clip is analysed when it's made (and `voice <slug>` backfills old clips for free): noise floor, where there is
sound, loudness, peak, where each tag sits and whether a `[sighs]`/`[laughs]` actually made a sound, pitch. When the
local whisper model exists (`~/.cache/remotion-system/whisper/ggml-tiny.en-q5_1.bin`, read by ffmpeg's whisper
filter) it also transcribes each clip and compares the words with the script. On engine 2 this drives three
corrections: silent heads/tails are trimmed (never sound, words or a performed tag; pauses inside a line stay), each
line is levelled to its speaker, and mouths follow loudness relative to the speaker (quiet lines read smaller).

```
npm run cli -- voice <slug> --show l3          # waveform strip: words, tags + their energy, sound, floor, trim points
npm run cli -- voice <slug> --takes l3=3,l5=2 [--max-credits 400]   # alternative takes (take 0 keeps the cache)
npm run cli -- voice <slug> --report           # per take: ✔/✖ validation, length, pace, pauses, loudness, pitch
npm run cli -- voice <slug> --audition l3      # every take of l3 in one WAV, announced by (take + 1) beeps
```

**Takes.** Ask for takes only on key lines. Look at the strip instead of guessing a trim. You can't hear: the
director auditions key lines (give them the audition file) and records the choice on the line,
`"take": { "n": 2, "by": "director", "why": "the tired sigh" }`; for other lines take `--report`'s measured pick and
record it as `"by": "agent"` with its reason — say in your report that those were measured, not heard. Per line:
`trim` (`false` or `{ "start", "end" }` in file seconds), `gain` (dB on top of levelling, e.g. -6 for a mutter),
`caption` (on-screen text without re-voicing).

## 6. Check (loop here until it's right)

```
npm run cli -- validate <slug>          # fix every ✖; read every ⚠ (framing, camera, motion, contact, overlays, audio); beat sheet
npm run cli -- explain <slug> --t 12.4 --actor rayan   # WHY something is the way it is at that moment (layers + sources)
npm run cli -- stills <slug> --guides   # then LOOK at out/<slug>/contact.png (middle of each shot)
npm run cli -- stills <slug> --edges    # start/end of every shot + recipe contacts → contact-edges.png
npm run cli -- stills <slug> --at findings             # one labelled frame per open finding → contact-findings.png
npm run cli -- preview <slug> --from 8 --to 11         # motion: preview.mp4 + preview-strip.png to look at
npm run cli -- stills <slug> --frames 18,360 --verify   # spot checks → contact-frames.png + render-order determinism
```

Fix findings from their `source` (the episode.json entry named after ←) instead of guessing; `inspect` runs in about a
second, so re-check after each fix and render stills only to confirm. Look at the contact sheet like a viewer on a phone: faces visible and lit, the gag readable in each shot, text big
enough and outside the shaded platform-UI zones, nothing important cropped. `references/qa-render.md` lists what
each warning means and the fixes that came up in practice. Warnings are questions, not rules: when something is a
deliberate choice (a held silence, a slow open, a character leaving frame), mark it with `allow` on the shot or the
episode and it is reported as accepted instead.

## 7. Render and review

```
npm run cli -- render <slug> --master   # final MP4, audio mastered to -14 LUFS (refuses unvoiced/stale/missing audio)
npm run cli -- review <slug>            # frame sheet of every shot/accent + loudness, dialogue vs sfx, sounds on words
```

Then do the editorial pass: hook in the first second, pacing (no dead air), comedic timing (a beat before each
punchline, sounds on the hits), acting, readability, mix, payoff. Fix and re-render. Report what you verified
(render + review numbers), what you couldn't (e.g. you can't listen — say the audio was checked by measurement),
the voice/sound licensing status, and any engine changes.

## Rules that keep the studio working

- A video only touches `videos/<slug>/` and `public/videos/<slug>/`. Change shared sets with `set.remove/move/
  params/add`, not by editing engine data.
- Change the shared engine only for reusable capabilities; then add tests, `npm run catalog`, `npm test`, and
  re-run `stills` of existing videos to check for regressions.
- Never print or commit `.env`. Don't spend ElevenLabs credits without the user expecting it.

# QA, rendering and review

## validate / inspect
`validate` prints the beat sheet, direction and audio problems, then every `inspect` finding (`inspect <slug>` alone,
`--json` for tools). Each finding has a time range, the object, the episode.json entry behind it (after `←`, with the
recipe step) and the `allow` intent that would mark it deliberate:
- `✖` error — objectively broken (bad ids/time refs, missing audio, the camera inside geometry). Must fix.
- `⚠` warning — probably unintended. Fix it, or mark it deliberate with `allow` if it really is the point.
- `·` note — a question (static runs, very short shots, pacing, crossing the line). Often exactly right.
- `~ accepted by intent` — you marked it deliberate (`allow` on the episode, shot, action, cast member or accent;
  `list direction`). Use it for creative choices, never to hide a mistake; accepted findings go in your report.

| Finding | Usual fix |
|---|---|
| `framing/face-offscreen` | loosen `size`, add `offset`, `follow`/`track`, or cut; `allow: ["offscreen"]` for a deliberate exit |
| `framing/back-of-head` | author an `angle`, `look: "camera"`, or cut elsewhere |
| `camera/inside-occluder` (✖) | shorten the move, change angle/position, or move/remove the item for that shot |
| `camera/cut-mid-word` | cut on `lN.word:K` / `lN.word:K.end` or in a pause |
| `camera/jump-cut` | change size by ~30 %+ or angle by ~30°+ between the two shots |
| `camera/focus-jump`, `focus-off-screen` | `rack` the focus, or focus on a subject in frame |
| `motion/teleport` | lengthen the move/transition (a full-arm pose like `celebrate` needs ≥ ~0.4 s); a snap on purpose: ease `"snap"` or `allow: ["abrupt"]` on the action |
| `motion/jitter` | longer transitions, fewer overlapping cues on that actor |
| `contact/penetration` (limb × head) | a straight joints blend sweeps through the body: use the recipe (`do: "facepalm"`, engine 2), or `keys` with a via point in front of the chest |
| `contact/penetration` (hand × item) | raise the reach target, or move the actor off the furniture |
| `contact/unreachable`, `missed-contact` | move the actor closer to the target (or the target closer) |
| `contact/floating` | put the actor on a mark / the surface height; `allow: ["floating"]` on the cast member if it hovers |
| `overlay/caption-over-face`, `text-over-face` | reframe (shot `offset`/size) or move the accent (`position`) |
| `line lN: [sighs] not performed` | another take (`--takes lN=3`, `--report`), or drop the tag |
| `line lN: clipping`, `cut off` | another take; a cut-off tail can also be a too-tight hand `trim` |
| `line lN: speech-to-text heard "…"` | listen-free check failed: another take, or reword (a small model can mishear names: read the transcript) |
| `trim … cuts into word/sound/tag` | widen the line's `trim` (look at `voice <slug> --show lN`) |
| `lN has N takes and no recorded choice` | `--audition lN` for the director (key lines) or `--report`'s measured pick → `"take": {n, by, why}` |
| other `⚠` lines: stale/no voice clip, free plan, unknown rights, unknown params | `voice`; licensing in the report; typo |

When a finding is unclear, `explain <slug> --t <time> --actor <id>` (or `--camera`) shows every layer at that moment —
placement/move, pose, emotion, gestures, look, joints weights, holds, speech, point speeds — with its source.
`stills <slug> --at findings` renders one labelled frame per open finding so you can see it.

## stills and preview
`stills <slug> --guides` renders the middle of every shot into `out/<slug>/contact.png`, shading the vertical-video
UI zones; every tile is labelled with its time and shot. `--edges` renders each shot just after it starts and just
before it ends (+ recipe contact moments) → `contact-edges.png` — moves and blends go wrong at the ends. `--at findings`
→ `contact-findings.png`; `--frames a,b,c` (frame numbers) → `contact-frames.png`. `preview <slug> --from a --to b`
renders a short half-size MP4 and `preview-strip.png` (8 evenly spaced frames): look at the strip to judge motion.
Check:
- faces visible and lit; nobody cropped at the head; the subject of the beat is big enough to read
- text readable at thumbnail size and outside the shaded zones; no two overlays fighting for the same spot
- the gag reads without sound (a viewer scrolling muted)

`stills … --verify` renders the same frames in a second order and compares, printing the largest difference and how
many pixels differ. Byte-identical is normal; up to ~4/255 on a few hundred pixels of translucent things (dust, holo
screens, puffs) is known GPU noise. Anything bigger means
something depends on render order (state, `Math.random`, async content) — fix it.

## Fixes that came up in practice

| Symptom | Fix |
|---|---|
| Opening frame is empty (character still out of frame) | start the action earlier / closer; the hook must be visible at frame 0 |
| A gag happens in a wide shot where the actor is tiny | cut to a `medium` on that actor for the gag |
| Pointing/hand gestures disappear | shoot from the side the arm moves across (`angle` ±60–70), not along the lens |
| Custom shot crops the head | prefer a semantic shot (`full`, `medium`) with `angle` |
| Facepalm doesn't reach the face | `do: "facepalm"` (the stock `facepalm` gesture stops at chest height) |
| Back of a head in a shot | author `angle` or `look: "camera"` on that actor |
| A toast or caption covers a face | shot `offset: [0, -0.12]`, or move the accent (`position`, `width`) |
| Screen text too small on a phone | repeat it in a `window` or `text` accent |
| UI ping lands on a word | put it in a pause: `"lN.word:K.end+0.03"` |
| Hit much louder than voices (`review` ⚠) | `volume` 0.4–0.6 on that sound / recipe |
| Drafts run long / captions linger after lines | offline voices trail ~0.7 s of silence: time beats off `lN.word:K.end`, small `gap`s |
| Overlapping lines (negative gaps) hide caption words | don't overlap one speaker's lines; start the next line in the trailing silence instead |

## render
- `render <slug>` — final: refuses unvoiced/stale dialogue and missing files (also enforced inside plain
  `npx remotion render`). `--draft` renders with estimated timing/silence. `--master` normalises the soundtrack to
  -14 LUFS (true peak -1.5 dBTP) — use it for anything you'd post. `--timeout ms` for slow remote sounds.
- Renders take ~1–3 min for 30 s. If a render dies after the machine slept, re-run it.

## review (after render)
`review <slug>` writes `out/<slug>/review-sheet.png` (every shot + accent, from the real MP4) and prints loudness,
true peak, clipping, dialogue level vs each sound, and sounds that land on words. Then the editorial pass:

1. Hook: does the first second show and sound like something happened?
2. Pacing: any stretch where nothing changes? Shots ≤ ~3 s?
3. Timing: a beat before each punchline; sounds on contact; reactions cut in.
4. Acting: readable emotions; looks pointing at what matters.
5. Readability on a phone: text size, safe zones, faces.
6. Mix: voices on top; nothing clipping; loudness ≈ -14 LUFS after `--master`.
7. Payoff: lands, then the video ends quickly.

You can't listen to audio — say so and report the measured numbers instead.

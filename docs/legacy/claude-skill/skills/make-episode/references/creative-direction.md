# Creative direction for short-form episodes

Principles, not templates. Break any of them when the joke needs it — but know why.

## The first second

Most viewers decide in about a second. Open on motion, sound and a question at once: a character falling onto a
key with a CLACK, a red error filling the screen, a line that starts mid-panic. Avoid establishing shots, logos and
"so, today…" openings; establish geography later, when it's needed for the joke. `validate` warns when nothing
happens in the first 1.5 s.

## Shape

- **Setup** — one clear situation and want ("undo the deploy"). One sentence, ideally one line of dialogue.
- **Escalation** — the obvious solution fails in a funny, specific way (the AI is too light to press the key).
  Each beat should raise stakes or absurdity; repeat a failure at most three times (rule of three: fail, fail, twist).
- **Payoff** — a reversal that recontextualises the effort (the AI already redeployed it). Land it on an image the
  viewer can screenshot, and end within ~2 s of it. A title card after the payoff should be quick.

For 9:16, 20–35 s is a good range. Cut anything that doesn't set up or pay off something.

## Comedic timing

- Give the punchline a beat of air before it (0.2–0.5 s of stillness or silence) and cut to the reaction right after.
- Reactions sell jokes: a close on the face (`emotion`, `react`, a `facepalm`-style pose) is often funnier than the
  event itself.
- Put sounds exactly on contact (recipes do this with `sound`), not on the start of a motion.
- Specific beats generic: "Fri 23:58", "release.ts", "PagerDuty" are funnier than "late", "a file", "an alert".

## Camera grammar (vertical)

- Shot length follows the scene: quick banter and gags cut every 1–3 s on action (a landing, a press, a turn); a
  sustained move can carry a whole beat (a walk, a reveal, a confession) — see `keys`/`follow` in the cookbook. A
  locked-off frame is a choice too (stillness, awkward silence): `move: "static"`. Decide per shot; nothing is forced.
- Every move needs a reason: follow a subject, reveal something, change the distance as the emotion changes. Moves
  can start and stop inside a shot (`move.at`/`duration`), so a push-in can land on the punchline word.
- `close` for emotion and lines, `medium` for gestures, `full`/`wide` once for geography, `insert`/screen fx for
  information. A wide shot with tiny characters doesn't sell a gag — cut in when the gag happens.
- Keep faces on the side they're looking from and screen direction consistent within a scene.
- Moving subjects: `follow`/`track`. A run seen from the front/along the set reads better than from the side.
- When an arm action matters (pointing, a hand on a face), shoot it from the side the arm moves across, not along
  the lens axis — foreshortened gestures disappear.

## Readable on a phone

- Text ≥ ~60 px on a 1080-wide frame; ≤ 6 words per punch line. `fx text` auto-fits.
- Keep important things out of the platform UI bands (top ~10%, bottom ~20%, right rail): `stills --guides` shades them.
- In-world screen text is decoration; repeat what matters in a `window`/`text` accent.
- Captions (`pop`) show the dialogue — don't duplicate a line word for word in a text accent.

## Character performance

- Rayan: expressive face (shocked, skeptical, angry, tired, happy), big poses (celebrate, crouch), gestures (wave,
  nod, head_shake, facepalm, double_take, flinch, stomp). He reaches and carries.
- Claude mascot: no arms — it acts with squash, tilt, hops, wiggles and its eyes. Make its physical limits part of
  the joke instead of fighting them.
- Use `look` to direct attention: characters looking at the thing tell the viewer where to look.
- A listener sells the line: cut to their reaction during it. Listening (`defaults.listen`) gives a live listener for
  free — the look at the speaker, a nod as a phrase lands. A stone-faced listener (`listen: 0`) is also a choice:
  deadpan comedy lives on stillness; the mascot's persona is already late and small.
- Audio tags in lines (`[sighs]`, `[panicked]`, `[whispers]`, `[laughs]`) give v4 delivery; one per line is plenty.

## Sound design

- Every physical hit gets a sound; UI events get UI sounds (notify, error, select); transitions get a whoosh.
- Under dialogue keep effects 0.3–0.7 volume; `review` flags hits more than ~6 dB above the voices and sounds that land
  on words. Leave silence before a punchline.
- Prefer the CC0 kit (`list sfx`). Remote meme sounds have unknown rights.

## Worked example: Ctrl+Z (`videos/ctrl-z`)

Hook: tiny Rayan crashes onto a giant ENTER key → slam text "DEPLOYED." + PagerDuty toast. Setup: "Did I just
deploy… on a Friday?" / "Just press Control-Z." Escalation: sprint across the keys (callouts mark CTRL and Z),
Z goes down, the mascot's two hops on CTRL do nothing (glitch + error dialog), "I weigh nothing. I'm literally a
cloud." Turn: "Duck. Now." — he carries the rubber debugging duck onto CTRL (its weight presses it), stomps Z:
UNDO SUCCESSFUL. Payoff: "Oh, and I redeployed it for you." + "Deploy succeeded" toast → face in hand → CTRL+Z title.

# Ctrl+Z — payoff (remaster) — brief

> Production acceptance for the V3 performance layer (M3). A copy of the payoff scene of `videos/ctrl-z/`
> (which stays frozen), directed on `engine: 2`. Not a release: the l5 clip is a free-tier ElevenLabs take
> (non-commercial; credit elevenlabs.io).

**Concept (one line):** The undo finally works — and the AI cheerfully admits it redeployed anyway. Facepalm.
**Platform / format:** 9:16 · ~9 s (the ctrl-z payoff, 22.0–31.2 s of the original)

## Beats
1. The duck holds CTRL down. Rayan glances at it, runs back to Z, stomps it: UNDO SUCCESSFUL. He celebrates,
   the mascot wiggles.
2. "Oh, and I redeployed it for you." Rayan listens — turns to the speaker, a small nod as the line lands.
3. Facepalm. Record scratch, "Deploy succeeded ✓", CTRL+Z end title.

## What changes against the original (and why)
- The raw `joints` facepalm (its right arm swept through the head, 28.4–31.2 s in the original) is the
  `do: "facepalm"` recipe: on engine 2 it aims at the bowed head and rises through a point in front of the chest.
- `celebrate` gets a 0.45 s transition (the original 0.25 s swings the hands up at 13 m/s, 44 cm in one frame;
  0.45 s peaks at 7 m/s), and the return to
  `stand_idle` 0.45 s.
- Listening on (`defaults.listen: 1`); Rayan's authored look at the mascot during l5 is gone — listening does it,
  with his persona's 0.2 s reaction delay and a nod at the phrase end.
- A restrained cut (`defaults.listen: 0`) is rendered for comparison: Rayan then simply doesn't react until the
  facepalm.

# Third-party notices and asset provenance

Everything below is safe for a monetized channel unless marked otherwise. `npm run cli -- list sfx` shows the
license of every library sound; `validate`/`render` warn when an episode uses something not cleared.

## Design patterns adapted (no code copied)

| Source | License | What was adapted | Where |
|---|---|---|---|
| [Remocn](https://github.com/Remocn/remocn) (`claude-chat`, `terminal-simulator`, `typewriter`) | MIT | Typewriter timing (characters per second + blinking caret), AI reply streaming after a typing indicator, window chrome layout | `src/engine/ui/window.ts`, `AppWindow.tsx`, `drawWindow.ts` |
| [Onda](https://github.com/degueba/onda) (`word-stagger`, motion primitives) | MIT | Per-word stagger with fade + rise | `src/engine/ui/KineticText.tsx` |

The implementations are original (frame-pure, system fonts, no Google Fonts or shader dependencies).

## Sound effects (`public/sfx/`)

| Files | Source | License | Attribution |
|---|---|---|---|
| UI, impact and digital sounds (see `src/engine/audio/sfx.data.ts`, field `original`) | [Kenney](https://kenney.nl) — Interface Sounds, Impact Sounds, Digital Audio | CC0 1.0 | not required (credited here anyway) |
| `whoosh.wav`, `whip.wav`, `mouse-click.wav` | [remotion.media](https://www.remotion.dev/docs/sfx) (originally freesound.org CC0 uploads) | CC0 1.0 | not required |

Remote library sounds still used by the two V1 videos (`vine-boom`, `windows-xp-error`, `ding`, `record-scratch`,
`anime-wow`, `yippee`, `switch`, …) are hosted by Remotion with **unknown / third-party rights** (meme clips). They
are kept so those videos render unchanged, flagged `license: unknown`, and should not be used in monetized work.

## Voices

ElevenLabs clips record their plan tier in `public/videos/<slug>/voice.json`. Clips generated on the **free plan
are non-commercial forever** (also after upgrading) and the published title must credit "elevenlabs.io".
Offline Windows SAPI voices and fixture voices have no such restriction.

## npm packages added in V2

| Package | Version | License |
|---|---|---|
| `@remotion/layout-utils` | 4.0.536 | MIT |
| `@remotion/paths` (was already installed via `@remotion/studio`) | 4.0.536 | MIT |

Remotion itself is under the [Remotion License](https://www.remotion.dev/license): free for individuals and
companies with up to 3 employees; larger companies need a company license.

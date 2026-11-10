# Baseline run of the old system

Everything here was **run** in this session, in a scratch copy of `episode/co-authored-by` @
`bfc638b60176c8f4a113e73c87a0d4be985b1454` (`/home/user/work/baseline`). Raw timings:
[logs/old-timings.tsv](logs/old-timings.tsv). Machine: Linux container, 4 vCPU, 15 GB RAM, no GPU, Node 22.23.4,
Remotion 4.0.536 with its own `chrome-headless-shell`, GL backend `swangle` (SwiftShader via ANGLE, from
`remotion.config.ts`), render concurrency 2× (Remotion's default here).

Baseline episode: `it-works-on-my-machine` — 16:9, 1920×1080, 30 fps, 912 frames (30.4 s), 7 lines, 12 shots,
shared `dev-office` set, Rayan + Claude, one overlay title, committed Windows-SAPI voice clips. Chosen because it
is the canonical two-character dialogue skit in the shared set, has no licence-restricted voice audio, and exercises
captions, a lighting cue, animated screens, sound effects and an overlay. (`ctrl-z` covers contact and tracking
better but ships non-commercial ElevenLabs audio; it was used for the capability checks instead.)

| Step | Command | Wall time | Result |
|---|---|---|---|
| install | `npm ci` | 55.5 s | ok |
| tests | `npm test` | 8.6 s | 23 files, **221 passed** |
| typecheck | `npm run typecheck` | 6.5 s | ok |
| lint | `npm run lint` | 4.0 s | **fails**: 2 errors, 32 warnings (pre-existing) |
| discover | `npm run cli -- list` / `list videos` | 2.3 s / 1.1 s | ok |
| validate | `npm run cli -- validate it-works-on-my-machine` | 2.1 s | valid; 2 face-blocked warnings, 4 notes, warns about 3 remote meme sounds with unknown rights |
| inspect / explain | `inspect …`, `explain … --t 8 --actor rayan` | 2.0 s / 2.9 s | ok |
| contact sheet | `stills it-works-on-my-machine` | 83.8 s | 12 stills → [../img/legacy-contact.png](../img/legacy-contact.png) |
| determinism | `stills … --frames 148,559 --verify` | 43.7 s | 2/2 frames byte-identical across render orders |
| one still | `stills … --frames 478` | 10.0 s | ok |
| **full render** | `npm run cli -- render it-works-on-my-machine` | **2,278 s** (38 min, 2.50 s/frame) | 1920×1080 h264 yuv420p 30 fps, 912 frames; AAC 48 kHz; 12.9 MB; −17.0 LUFS, peak 0.0 dBFS |
| partial render, twice | `npx remotion render … --frames=459-497` | 116.8 s, 116.9 s | identical cost both times → nothing is cached between renders |

## Failed or discarded attempts

- First full render: the browser crashed at frame 563 of 912 ("target closed") when the container was restarted;
  the log is kept as `11-render-initial.log` in the scratch directory.
- Second full render ran while another software-GL job used the CPU and was stopped at frame 432 after 1,690 s;
  discarded as a timing. The 2,278 s figure is the third run, alone on the machine.

## Observations

- Image: flat-shaded, hard shadow edges, visible aliasing on thin geometry (glasses, keyboard), bloom around
  lamp and screens, vignette. No artefacts specific to software GL were seen in the 12 stills.
- Audio: voice onsets in the MP4 at 2.49, 3.70, 5.15, 7.79, 10.06, 13.45 s match the resolved line/word timings;
  mouths are amplitude-driven.
- Any change — a title, one camera cue, one action — requires the full 38-minute render for a new deliverable;
  the fast feedback paths are `validate` (2 s), one still (10 s) and a frame-range render (≈3 s/frame).

## Not run

- `prod/noir-git-blame`: tests, audio-only render and mastering tool were not run (time went to the renders above).
- `co-authored-by` render (second episode) — not run.
- ElevenLabs voice generation — paid, not approved.
- The repository's `system` voice provider — Windows only.

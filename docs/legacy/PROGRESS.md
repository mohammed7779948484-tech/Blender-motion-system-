# Progress log

Resume point for anyone continuing this build. Plan: phases 0–8 (scaffold/spike → actors →
set/props/lighting → camera → episode JSON/audio → CLI/docs → video 1 → video 2 → handoff).

## Status

| Phase | State | Notes |
|---|---|---|
| 0 Scaffold + risk spike | ✅ done | see findings below |
| 1 Core + actors | ✅ done | actor tests + visual pose/emotion review |
| 2 Set, props, screens, lighting | ✅ done | dev-office layout reworked after stills review |
| 3 Camera + post | ✅ done | camera tests: framing ×3 aspects, tracking, occlusion, overrides |
| 4 Episode JSON, audio, captions | ✅ done | system voices + captions + mouths verified in an MP4 |
| 5 CLI, catalog, docs | ✅ done | CLAUDE.md, docs/ENGINE.md, catalog/, `npm run cli` |
| 6 Video 1 | ✅ done | `it-works-on-my-machine`: 16:9, 30.4 s, renders in ~52 s → out/it-works-on-my-machine.mp4 |
| 7 Video 2 | ✅ done | `launch-promo`: 9:16, 28.7 s, custom stage in its folder → out/launch-promo.mp4 |
| 8 Handoff | ✅ done | tests, validation, determinism checks, docs |

## Phase 0 findings (2026-10-18)

- `create-video` refuses a folder containing `.git`; scaffolded in a temp dir and moved in (blank template, rspack).
- Network here is ~18 KB/s to the npm registry: installs take ~1 h. Dropped `@remotion/google-fonts`
  (its metadata alone is tens of MB). Fonts use system stacks (`src/engine/fonts.ts`): Consolas / Segoe UI.
- `three` 0.186 on npm no longer ships `examples/fonts`, so drei `Text3D` has no typeface → 3D titles use
  canvas-text planes instead (decision change vs. plan).
- **EffectComposer renders blank in exports** (works in Studio): it builds passes over several React
  updates, and Remotion captures a tab's first frame before that. Fixed with `ComposerGate`
  (`src/engine/camera/Camera.tsx`): delayRender until passes exist for the current camera, then `advance()`.
- After the fix: DOF/bloom/vignette/AGX visible in exported frames; frame 90 rendered via `remotion still`
  is **byte-identical** to frame 90 from a `--sequence` render; MP4 frame vs PNG = 42.7 dB PSNR (codec loss).
- Audio via `@remotion/media` `<Audio>` present in MP4 (aac, -21 dB mean). Captions as DOM overlay render.
- Speed: 150 frames @1280×720 with shadows + post ≈ 10 s (angle GL on GPU, default concurrency).
- Offline voices: Windows SAPI (David, Zira, Mark) works; `SpeakProgress` word timings assume 16 kHz →
  generate at 16 kHz (or scale by 16000/sampleRate).
- Remotion's bundled ffmpeg lacks `psnr`/`tile`; CLI uses system `ffmpeg` when present for contact sheets
  and pixel comparisons (skips gracefully otherwise).
- three r186 removed PCFSoftShadowMap → use `shadows="percentage"`.

## Phase 1–4 findings

- SMAA's lookup textures load asynchronously, so the first frame of each render tab had different edge
  anti-aliasing. Replaced by composer MSAA (multisampling 4); `stills --verify` is now byte-identical.
- The anchor cache keyed time by `toFixed(5)`, which made results depend on evaluation order (nearby
  sample times shared entries). Now keyed by the exact time.
- Remotion's inline audio mixing crashes (EINVAL) on sparse `--frames` lists even with `--muted`; stills
  pass `--props={"silent":true}` and the player then skips the soundtrack.
- `@remotion/media` has no Node export, so the CLI cannot import video modules. Pure per-video data
  (environments, actorDefs, componentKinds) lives in optional `videos/<slug>/video.data.ts`.

## Phase 6–7 findings

- Directing video 1 needed: seated variants of explaining/arms-crossed poses; inserts must not treat their own
  target as an occluder; over-shoulder offsets must scale with the foreground actor's *width* (small mascot).
- Video 2 (new location, custom components, portrait, walking + follow) needed only two generic solver fixes:
  follow shots are occlusion-tested where the camera will travel, and framing distance is now
  perspective-correct (camera above/below the aim with wide portrait lenses clipped heads).
  Video 1 stills were re-rendered afterwards: no regressions (framing marginally looser).
- Reuse proof: video 2 added no files to `src/engine`; everything location-specific lives in
  `videos/launch-promo/` (environment data, 5 stage components, 4 screen drawings, overlays, spotlights).

## Verification snapshot (end of build)

- `npm test`: 57 tests in 5 files (actors, camera incl. tracking/occlusion/overrides/aspect ratios, resolver, voice cache,
  mocked ElevenLabs, catalog freshness, every video resolves). `tsc` clean.
- `cli validate`: both videos valid, no warnings.
- `cli stills --verify` (parallel vs single-tab sequential render):
  - video 1: 11/12 frames byte-identical, 1 frame at 116 dB PSNR.
  - video 2: 3/8 byte-identical, others ≥ 92 dB (≤ 233 pixels off by 1–3 levels near translucent holo
    screens; GPU precision). Scene *state* is exactly deterministic (tested in Node).

## Reuse vs build changes

- shiki (cached locally) used for screen syntax colours as planned.
- `@remotion/google-fonts` → system font stacks (bandwidth); swap to `@remotion/fonts` + woff2 later if needed.
- drei `Text3D` → canvas-text planes (no typeface files available offline).

## Open issues / next steps

- ElevenLabs path implemented against the documented API (with-timestamps, wav_24000, sound-generation) and
  tested with mocked HTTP only — no key yet. To finish: add `ELEVENLABS_API_KEY` to `.env`, run
  `npm run cli -- voice <slug> --provider elevenlabs` for both videos, re-render.
- Current voices are offline Windows SAPI voices (robotic but intelligible). Mouths are amplitude-driven, not
  phoneme lip-sync (upgrade path documented in docs/ENGINE.md §7).
- SFX use Remotion-hosted files fetched at render time (slow on this network); could be cached under public/.
- Residual sub-perceptual pixel noise (≤3/255 on a few hundred pixels) on translucent/reflective effects.
- No drei `Text3D` (no typeface files offline); 3D titles use canvas-text planes.

---

# V2 (started 2026-10-18) — plan: stabilize V1 → live Eleven v4 → episode-driven slice ("Ctrl+Z", 9:16) → make-episode skill

| Phase | State | Notes |
|---|---|---|
| 0 Safety + baseline | ✅ done | key moved to ignored `.env` (never printed); `.env.example` restored + `tests/secrets.test.ts`; exposure scan: 0/6 commits, nothing staged, no other files (key appeared only in a local session log → rotation recommended, low urgency). Baseline stills in `out/baseline/`. |
| 1 V1 defect fixes | ✅ done | 11 confirmed defects fixed; each new regression test failed on the old code. 86 tests. Stills vs baseline: video 1 12/12 byte-identical; video 2 3/8 identical, others max diff 4/255 on ~0.001% of pixels (≈26 px, the known translucent-holo GPU noise) — harmless. |
| 2 Eleven v4 live | ✅ done | live smoke test passed on the free plan (23 credits, 9,977 left). See log. |
| 3 Showcase slice | ✅ done | `videos/ctrl-z` (9:16, 31.3 s, Eleven v4, CC0 sfx, mastered −14.4 LUFS); editorial review below. |
| 4 Regressions | ✅ done | 111 tests, tsc clean; both originals validate; stills vs baseline: video 1 12/12 byte-identical, video 2 4/8 identical + 4 frames ≤4/255 on ≤89 px (known holo GPU noise); both MP4s re-rendered (30.4 s 16:9, 28.7 s 9:16, audio present) and reviewed. |
| 5 Docs + skill | ✅ done | `.claude/skills/make-episode/` (skill-creator), `CLAUDE.md` → `@AGENTS.md` + skill pointer; 2 eval rounds with fresh agents; feedback applied (log below). 118 tests, tsc clean. |

## V2 log
- Voice cost safety: ElevenLabs runs only with explicit `--provider elevenlabs` (a key alone never switches; an
  ElevenLabs-voiced manifest needs the flag before buying changed lines); `--provider` values validated; character
  count printed before paid generation; manifest written after every clip (a failure keeps paid clips).
- Cache key is now a fingerprint of the *effective* request (`voiceRequest` + `voiceFingerprint` in `speech.ts`,
  scheme 2). Legacy (scheme 1) clips stay valid while their old hash matches → both existing videos untouched.
- Phase 1 fixes: resolver stale-voice detection (names the cause); `auditAudio` shared by `validate`/`render`/
  `calculateMetadata` (final renders refuse unvoiced/stale lines + missing files; drafts refuse only missing files);
  duration from all content; shots after `end` are errors, cues after it warn; moves queue like the rig; same-speaker
  overlap warns; prop parents/cycles/transitive remove/typo ids validated in `resolveLayout`; unknown screen presets/
  params, prop params, appearance keys warn; `checkActorDef` for video-supplied actors; `componentKinds`/`screenKinds`
  without implementations reported; ComposerGate timeout → `cancelRender`; caption pages never hide the next line;
  CLI boolean flags no longer swallow the slug; `new` no longer hard-codes expiring voice ids; `render --draft/--timeout`.
- Verified empirically: `@remotion/media` `<Audio>` aborts a render (even a draft) on a 404 → missing files block drafts.
  A final render with a missing clip now fails up front with a readable list (also via plain `npx remotion render`).
- Screen preset metadata moved to pure `world/screens.data.ts` (Node-safe validation); `SCREEN_PRESETS` keeps its shape.
- **Phase 2 — Eleven v4 verified live (2026-10-18).** Docs: v4 on Text-to-Speech and Text-to-Dialogue, ≤10k chars;
  `wav_24000` allowed on free; v4 settings = stability + similarity only. Chose per-line TTS `/with-timestamps`
  (per-line caching; Dialogue re-buys the whole exchange on any edit). First key was restricted (no `user_read`,
  `models_read`) → reported as a blocker; user widened the key policy. `voice --check`: plan free, 10,000 credits,
  `eleven_v4`/`eleven_v4_turbo` listed, 21 premade voices (defaults now Liam / Jessica / Will / Laura).
  Live line `Ship it. [laughs] Okay!` → RIFF WAV 16-bit mono 24 kHz; alignment present for v4 and includes the tag
  characters (parser skips them → 3 monotonic words); 0.9 s performed laugh between words; cost **23 credits = 1 per
  character incl. tags** (account counter lags a few seconds); re-run = 0 generated (cache); final 9:16 render: AAC
  audio, clip lands at exactly 0.600 s (cross-correlation), captions tag-free and word-synced, mouth opens on speech.
  Response captured as `tests/fixtures/elevenlabs-v4.json` (no headers/key). Temporary video removed.
  Not verified: v4 request stitching (off for v4 by default). Free-plan clips are non-commercial forever and need
  "elevenlabs.io" in the title → `validate`/`render` warn.
- Phase 3 progress: micro-keyboard environment (giant keyboard/screen/duck/dust, macro-warm mood); recipes
  (`do`: press, point, pick-up, place, react, sit-down, stand-up) with closed-form reach (FK(IK) < 1 cm);
  `fx` cues (text, window, callout, impact, shake, glitch, flash, dip; catalog/fx.json, `list fx`);
  reusable components AppWindow (one model, DOM + Canvas2D renderers; patterns adapted from Remocn/Onda, MIT —
  no code copied) and KineticText (fitText via @remotion/layout-utils 4.0.536); `window` screen preset and
  `popup` param on any screen. ctrl-z draft episode + BRIEF.md (renders; stills reviewed once).

## Ctrl+Z — editorial / audiovisual review (final render, 9:16, 31.3 s)

Method: watched by frame sheets from the real MP4 (`review` sheet: every shot + accent), measured audio with
`review` (EBU R128, dialogue vs sfx, words). I can't listen, so delivery/tone judgments rely on the v4 timing data
(e.g. the 0.8 s performed sigh) and levels, not on hearing.

- **Hook (0–1 s)**: Rayan is in frame from frame 0, falling; CLACK + impact debris + shake at 0.48 s, "DEPLOYED." slams
  in at 0.55 s. Passes: motion, sound and a question within the first second.
- **Pacing**: a new beat every 1–3 s (beat sheet); the longest still stretch is Claude's sigh line (4.2 s), which is
  the deliberate pause before "Duck. Now." No dead-air warnings.
- **Comedic timing**: the useless hops get their own medium shot; glitch + error land 0.2 s after the second hop
  (beat of air before the failure); "Deploy succeeded" toast lands after the line ends, then face-in-hand 0.4 s later,
  then the title — reaction before title.
- **Acting**: readable emotions in the closes (shocked, skeptical, pleading, tired); point read from the side;
  crouch pick-up and carry; place presses CTRL; celebrate on success; face-in-hand payoff (joints override from `reach`).
- **Mobile readability**: slam text ~200 px; toast/dialog text ≈ 60–70 px at 1080 wide; callouts pinned to the
  keys; all key text outside the platform UI bands (`--guides`). Screen text in-world is decoration; the dialog
  repeats what matters.
- **Mix**: −14.4 LUFS integrated after `--master`, true peak −1.4 dBFS, 0 clipped samples; no sound lands on a word;
  all hits within +5 dB of dialogue (success jingle and the final key slam are the loudest, intentionally).
- **Payoff**: "Oh, and I redeployed it for you." → green "✓ LIVE" + toast → face in hand under the CTRL+Z title,
  ends ~1.7 s later.
- **Fixed during review**: empty first 0.3 s (fall started too high), tiny hops in a wide two-shot, pointing
  foreshortened toward the lens, head cropped in the carry shot, facepalm not reaching the face standing (shared
  gesture is tuned for seated), notification pings on words, three hits 6–8 dB over the voices, −18 LUFS loudness,
  end title covering the payoff face, duplicated popup on the giant screen.
- **Known limits**: free-plan voices (non-commercial; credit elevenlabs.io); 1–2/255 render-order noise on ≤90 px of
  translucent dust/puff pixels (verified harmless).

## Phase 5 — make-episode skill and fresh-agent evals (2026-10-19)
- Skill created with skill-creator: `SKILL.md` (brief → discover → direct → custom code → voices → check → render +
  review) and references `creative-direction.md`, `direction-cookbook.md`, `qa-render.md`; `evals/evals.json` holds
  the two prompts and their assertions. `CLAUDE.md` imports `AGENTS.md` (one copy of the rules) and routes video
  requests to the skill rather than the global HyperFrames/video skills.
- Method: one fresh agent per prompt × {with skill, without skill}, each in its own git worktree (offline voices, no
  credits), graded by `grade.mjs` plus reading their BRIEF/episode/contact sheets. Workspace (gitignored):
  `.claude/skills/make-episode-workspace/`; viewer `out/skill-eval/review.html`.
- Round 1 was invalid for the cloud-stage prompt (worktrees cut from `main`, without V2); its findings were still fixed
  (commit c255a4b). Round 2 (worktrees on `v2`): with skill 24/24 assertions, without skill 23/24 (the baseline
  skipped the `sit-down` recipe). The objective assertions barely separate the two because AGENTS.md is already
  strong; the qualitative difference was in the briefs, hooks and QA loop. Both with-skill episodes were good; the
  office-css run reused `AppWindow` through `fx window` — the second real usage of the component.
- Round 2 feedback → fixes (commit 49247ba): `facepalm` and `sip` recipes (via the actor's `selfReach`, seated or
  standing; the mascot gets tired + head shake); stationary pick-up/place turn back; `validate` warns when a shot sees
  the back of its subject; same-speaker overlap ignores trailing silence; `shell.floor: "none"`; `stills --frames`
  writes `contact-frames.png`; `--verify` prints max difference and pixel count; `new` template opens on a close-up.
  Docs now state camera `angle`/`offset` semantics, custom-location facts (floor, shadowRadius, far plane 80 m,
  anchors from `size`, `useEvent`), walk-in-and-sit, SAPI rate/pauses; the wrong AGENTS.md facepalm gotcha is fixed.
- Check after the fixes: 118 tests, tsc clean, catalog regenerated; ctrl-z, it-works-on-my-machine and launch-promo
  validate with the same warnings as before, and their resolved episodes are byte-identical to the previous commit
  (render code for them is unchanged), so no re-render was needed.

## Next steps
- Rotate the ElevenLabs key (it appeared once in a local session log; never committed).
- Before monetizing: voice with a paid plan (free-plan clips stay non-commercial) and replace the remote meme sounds
  in the two V1 videos with kit sounds (`validate` lists them).
- Deferred from the plan: `floating-space` preset (`new --env custom` covers new worlds today), a 3D chat screen,
  music ducking.
- Optional: `render --master` the two V1 videos (−16.8 / −17.3 LUFS as originally mixed).

---

# V3 — Production Quality Upgrade (started 2026-10-19, branch `v3`)

Plan (approved): M0 safety net and picture sweep → M1 diagnose/explain → M2 camera choreography → M3 performance →
M4 voice performance and speech motion → M5 sound and mix → M6 look and captions → M7 delivery → M8 skill, pilot, evals.
Rules: engine-1 videos must not change (goldens); stylistic behaviours are opt-in, engine 2 only corrects clear defects;
`allow` marks deliberate choices; every milestone updates the skill/docs it affects.

| Milestone | State | Notes |
|---|---|---|
| M0 Safety net, picture sweep, yardstick | ✅ done | see below |
| M1 Diagnose and explain | ✅ done | see below |
| M2 Camera choreography | ✅ done | see below |
| M3 Performance layer | ✅ done (your review pending) | see below |
| M4 Voice performance and speech motion | ✅ done (your take auditions pending) | see below |

## M0 — safety net, picture sweep and yardstick
- `core/behaviour.ts`: `engine` (1 default = original behaviour, 2 = current; `new` writes 2), `profile` (only
  `standard`, reproducing today's thresholds), `allow` intents on the episode or a shot (`silence`, `slow-open`,
  `offscreen`, `back-of-head`). `validate` reports matching findings as `~ accepted by intent`, never hides them.
  Catalog: `catalog/direction.json`, `list direction`.
- Pure extractions (no behaviour change): `fx/state.ts` (shake → `cameraWithFx`, glitch → `chromaAt`, active
  screen accents, accent placement, callout geometry), `audio/captionLayout.ts` (pages, page at time, layout
  constants). `scripts/video.ts`: shared Node loader for the CLI and tests.
- `inspect/sweep.ts`: per-frame visual state (actors, rendered camera, mood, chroma, prop states, screen accents,
  caption page) + per-second digests. `tests/golden.test.ts` + `tests/goldens/` freeze the three finished videos.
- **No-op proof**: a dump of the resolved episodes and every frame's actors/camera/chroma/mood/props/caption pages
  made with the v2 code equals the new code paths exactly (2,711 frames, 0 differing fields, no rounding). Stills vs a
  fresh v2 baseline (`out/baseline-v3/`): 28/35 byte-identical, 7 at 91–116 dB PSNR with 0.0000 % of pixels over
  3/255 (the known translucent-effect GPU noise). `validate` on the three videos: same warnings as v2 (header adds
  engine/profile).
- Latent bugs fixed: `validate` now evaluates scenes with the video's custom actor definitions; camera `move.ease`
  is a checked enum (an unknown ease used to reach the renderer as `undefined`).
- **Fault set** (`tests/faults/`, loader `tests/fault-set.ts`): 7 visual faults (teleport, arm through face during
  a joints blend, caption over face, camera pushed into the desk, cut mid-word, floating feet, focus on an off-screen
  actor), each with the expected check/time/object/source, plus 2 intent controls (deliberate silence, deliberate
  exit). Detection is asserted from M1 on; audio/delivery faults arrive with their checks (M4/M5/M7).
- Timing spike (ctrl-z, 1080×1920): `stills` CLI 11–14 s per video (8–15 frames incl. contact sheet); raw render
  1 frame 7.4 s, 15 frames 9.1 s; `remotion bundle` alone 3.6 s ≈ 40 % of a stills run → bundle reuse is justified
  (M7, with episode/voice injected as props so edits don't need a rebuild). Scene sweep: ~2,700 frames in ~3 s.
- Baseline yardstick: skill-eval agents needed 1,017–1,421 s and ~250 k tokens to reach validated stills (V2 eval
  round 2). Face exposure is measured from M6 on, against the baseline sheets kept in `out/baseline-v3/`.
- Tests: 155 (16 files), tsc clean.

## M1 — diagnose and explain
- CLI split mechanically: `scripts/cli.ts` dispatches to `scripts/cli/{shared,discover,scaffold,voices,check,media}.ts`.
- `effectors(c)` for Rayan and the mascot (head centre, front of face, hands, elbows, soles + capsules), mirroring the
  views and computed from the FINAL channels (so looks/turns count). Tested against the arm FK and the framing anchors.
- Provenance: `core/trace.ts`; the resolver records the source of every cue/shot/accent/sound/prop cue and the cast
  start, recipes label their steps (`do:pick-up step 'reach'`) and report contact moments (point, hand, IK reached).
  `allow` now also sits on actions, cast members and accents (intents: abrupt, clipping, floating, text-over-face,
  jump-cut, cross-line, mid-word-cut, soft-focus, static, quick-cuts + the M0 ones). Recipe impacts (key press-down,
  release) declare themselves `abrupt`. None of this changes resolved output (goldens unchanged).
- `inspect` (`src/engine/inspect/`): framing (faces in frame, back of head — every frame), camera (inside geometry,
  cut mid-word, jump cut, crossing the line, focus off screen/jumping), motion (teleports as discontinuities, jitter on
  root/head/camera), contact (limb through head, forearm through a furniture top, unreachable/missed recipe contacts,
  floating), overlays (caption/accent over a face — estimated rects), grammar + pacing notes (profile thresholds).
  Levels error/warning/note; findings carry source, related active cues and the intent that would accept them.
  `validate` now prints all findings instead of its own 3-sample framing checks.
- `explain <slug> --t s [--actor id | --camera]`: every layer at that moment with progress and source.
- `stills --edges` (shot starts/ends + contact moments), `--at findings`, labelled tiles; `preview --from --to` (half-size
  MP4 + an 8-frame strip to judge motion).
- **Fault set**: 8/8 visual faults found with the right check, object, time and source (jump cut added after a sampling
  bug — see below); both intent controls produce only accepted findings. 173 tests.
- **Speed**: inspect of a 30 s episode incl. resolving: 0.2–1.0 s (ctrl-z 937 frames 0.9 s).
- **Triage of the finished videos** (every open finding checked against `stills --at findings` frames):
  | Video | Open findings | Verdict |
  |---|---|---|
  | ctrl-z | arm through the face 28.4–31.2 s (payoff joints override) | real — the clip visible in the V2 sheet |
  | | arms snap overhead 23.83 s (`celebrate` pose, 0.25 s transition) | real — confirmed with `explain` + `preview` strip |
  | | back of head 20.5/22.1/22.7 s (duck pick-up/place), mascot 10.0 s | real (frames show the backs) |
  | | pick-up/place IK targets unreachable 20.6/22.2 s | real (the duck snaps into a hand that doesn't reach it) |
  | | dialog window over the mascot's face 13.3–13.7 s | real overlap (arguably deliberate) |
  | | suspended 3 frames before the opening fall | real, deliberate (would be `allow: ["floating"]`) |
  | it-works, launch-promo | no warnings; notes only (pacing, crossing the line) | — |
  False positives found and fixed during triage: hands "inside" the desk box (boxes include the empty space under a
  desktop → only forearms coming down through a top count); camera jitter right after a shake; a fast smooth slide read
  as a teleport (→ discontinuity rule); three "jump cuts" that compared two frames of the same shot (cut sampled by
  rounding → first frame after the cut; a jump-cut fault now guards it). Frozen videos are not edited.
- Known, for later milestones: the `facepalm` recipe aims at the face anchor (ignores the bowed head) → palm ~8 cm
  inside the head (M3 correction); the dev-office `beside-desk` mark puts an idle standing hand into the desk edge
  (shared set data; no finished video uses it — fix with M3/M8 when a production needs the mark).

## M2 — camera choreography
- Moves can start and stop inside a shot (`move.at` time ref, `duration`); without them the numbers are exactly the old
  ones (tested equal).
- `keys`: solver-space keyframes (angle around the subject, distance/size, height, lens/fov, offset, roll) through a
  cubic Hermite spline with Catmull-Rom tangents in time (continuous speed through inner keys, eased ends), relative to
  the subject so `follow` carries the camera. `path`: world-space position/target/lens/roll keys for authored flights.
  `follow`/`track` take `lead`. New move `life` (subtle push + seeded drift), opt-in per shot or via `defaults.cameraLife`.
- Engine 2 corrections, baked into shots by the resolver from `behaviour.defaults` (switchable): auto focus holds the
  last speaker among the subjects and pulls over 0.45 s (sine ease) instead of snapping, also in pauses; blends arc
  around the subject (aim straight, aim→camera vector turned and log-scaled) instead of cutting through it.
  Module: `camera/choreo.ts` (pure math); `solve.ts` integration is small.
- `inspect` framing now checks occlusion along the camera's real path every frame (`face-blocked`; actors with effectors
  are tested by their capsules, coarse item boxes need ≥4 frames). On it-works it found two real monitor occlusions of
  Rayan's face (shots 5 and 7, confirmed in `stills --at findings`).
- Goldens: the resolved hash changed for all three finished videos (the added `behaviour.defaults`, all off for engine 1);
  every per-second visual digest is identical — no frame changed.
- Production acceptance — `videos/one-take/` (new example, engine 2, 14 s): a two-shot with focus pulls, an arcing
  1.2 s blend into one `full` `follow` shot whose keys orbit from behind Rayan (stepping onto the light bridge) to his
  side over the void to a low front ¾ as he arrives, then a locked-off wide. `inspect`: 0 warnings; the deliberate
  back views are accepted by `allow`. Found and fixed with inspect/explain while directing it: the orbit ended behind
  him; a mark arrival turned him away from the camera (→ `move.face: "path"`). preview-strip confirms one continuous
  move. Not yet voiced; faces are dark (character light comes in M6).
- Tests: 186 (choreo.test.ts: spline, windows, keys orbit around a walker + smoothness + order independence,
  dolly-zoom, paths, lead, life only where asked, focus pull vs snap, arc vs straight blend, corrections switch off).
- Skill: camera grammar now says shot length follows the scene (no 1–3 s rule), cookbook documents windows, keys,
  path, lead, life and the engine-2 corrections.

## M3 — performance layer
- Listening (opt-in, `defaults.listen` / cast `listen`, 0..1; 0 = restrained = exactly off): `player/scene.ts` builds an
  `ActorTrack.listen` from the other speakers' lines, their phrase ends (word gaps ≥ 0.3 s + the last word) and the cut
  times; `rig.ts` adds it as a look source *below* authored looks (fills `1 − authored weight`, so `look: null` hands
  control back), after the persona's reaction delay, held ~1 s after the line, seeded glances away in lines > 3 s;
  `LifeSignals.beat` drives a seeded nod 0.12 s after some phrase ends; blinks on cuts.
- `persona` on the actor definitions (Rayan: quick, nods along — delay 0.2 s, nod 1; mascot: late and small — 0.35 s,
  0.5). `beat` gesture for word emphasis on both. Emotion `intensity` (on an action without a gesture; with one it stays
  the gesture's strength). Keyed joints: action `keys: [{ at, joints }]` → `OverrideCue.keys`, a Hermite spline through
  every key (`core/spline.ts`, now shared with the camera); `joints` are the values at `at`; keys before the action are
  errors, keys after its `duration` warnings.
- Engine-2 correction `defaults.viaPoints`: `facepalm`/`sip` call `selfReach(…, { precise: true })` — targets on the
  bowed head itself (palm over the eye on that side, cup in front of the mouth), the head's turn held so a look or
  listening can't swing the face away from the hand — through a keyed override that rises via a point in front of the
  chest (head half bowed) over 0.6 s; the recipe records a contact so `inspect` checks the landing. Measured (Rayan,
  seated and standing): engine 1 palm 7.6 cm inside the head (flagged), engine 2 3.4 cm off the head surface, contact
  missed by 0.5 cm, no penetration during the rise. The first precise target (y 0.12 in the head frame) landed at the
  mouth and was raised after looking at the frames: with a ~37° bow "in front of the eyes" projects below the glasses,
  and the visible fist sits ~4 cm behind the effector point.
- Goldens: resolved hashes of the three finished videos refreshed (two new `behaviour.defaults` fields); every frame's
  visual digest identical — verified before refreshing, and the resolved episodes equal the old ones with the two fields
  removed.
- Tests: 199 (20 files). `tests/performance.test.ts`: listening off unless asked, looks at the speaker only after the
  delay and lets go, restrained identical to off (episode or one character), authored looks win, nods only after phrase
  ends, word gaps become phrase ends, emotion intensity halfway, keyed joints pass through via points + validation, engine
  1 facepalm still penetrates / engine 2 doesn't (seated + standing), via key + contact, `viaPoints: false` = legacy, sip.
- Production acceptance — `videos/ctrl-z-remaster/` (engine 2, 9.2 s): the ctrl-z payoff (22.04–31.2 s of the
  original) copied with the l5 clip and its manifest entry; ctrl-z untouched. Directed changes: `do: "facepalm"` instead
  of the raw joints; `celebrate` 0.45 s (the original 0.25 s swings the hands up at 13 m/s, 44 cm in one frame; 0.45 s
  peaks at 7 m/s); listening on, Rayan's authored look at the mascot during l5 removed, and a reaction cut to him at
  "for you." so the listening is on screen (turn to the speaker, nod at the phrase end). `inspect`: 0 errors, 0 warnings,
  1 accepted (he runs away from the lens to Z — `allow: ["back-of-head"]` on that shot; the opening glance at the duck
  starts in place, `transition: 0`). Comparison material in `out/ctrl-z-remaster/compare/`: matched-frame sheets
  `before-frames.png` / `after-frames.png` / `restrained-frames.png`, previews `before|after|restrained.mp4` and strips.
  The restrained cut (listening 0) stares ahead through the line — restraint stays restraint.
- Found while directing, for later: the teleport rule (a step ≥ 3× its neighbours) misses motion that is continuous but
  far too fast — the remaster's 0.25 s `celebrate` passes inspect at 44 cm/frame because neighbouring frames are fast
  too (the original was flagged at 23.83 s for the same ~0.45 m step: whether the rule fires depends on how the
  neighbouring frames fall). A peak-speed note for hands
  would catch it. The blind comparator review of the before/after material (plan M3) has not been run yet.

## M4 — voice performance and speech motion
Decisions (2026-10-19, user): speech-to-text = local whisper through ffmpeg (the installed ffmpeg 8.1 has the
whisper.cpp filter; model `ggml-tiny.en-q5_1.bin`, ~32 MB, in `~/.cache/remotion-system/whisper/`, `$WHISPER_MODEL`
overrides); key-line takes = the user auditions them, the agent picks the rest by measured criteria, labelled.
- Clip analysis (`audio/analysis.ts`, pure; stored per clip in `voice.json`, computed at generation, backfilled free
  by `voice <slug>`): 10 ms levels → noise floor, sound segments, BS.1770 loudness (tested: a 0.1-amplitude 997 Hz
  sine reads -23.0 LUFS), peak/clipping, tail level, tag spans (ElevenLabs alignment times when they are real
  spans, else the gap between the neighbouring words) with the energy inside them, pitch (autocorrelation).
  ctrl-z's five real v4 clips, analysed read-only: l3's `[sighs]` found performed at 0.06–0.80 s; no clip fails
  validation; Claude's three lines spread over 3 LU before levelling.
- Edge trim (engine-2 correction `defaults.trim`, line `trim: false | {start, end}`): in/out points on the
  untouched file, only edges with > 120 ms of quiet, padded 60 ms / 200 ms, frame-aligned in-point, never sound,
  a word or a performed tag; pauses inside a line stay. Found on the first real strip: ElevenLabs alignment stretches
  a line's last word to the end of the file, which would have blocked every tail trim → a word protects only as far
  as its sound continues. A hand trim that cuts into protected audio warns.
- Levels (`defaults.level`): each line toward its speaker's median loudness (-12/+6 dB, peak ≤ -1 dBFS), plus the
  line's `gain`. Played as the Audio volume. Fades: Remotion volumes are per frame, so the 8/30 ms fades move to the
  M5 mix plan; cuts land in ≥ 120 ms of near-floor audio (the preview measured -91 dB right after a trimmed tail).
- Speech motion (`defaults.speechMotion`): `talkScale` = envelope peak relative to the speaker's loudest line (quiet
  lines read smaller — tested: a line 12 dB down peaks at < 0.5 of the loud one, equal on engine 1), mouth with a
  30 ms lead and 70 ms closed-form release, and a slow ±0.2 s envelope `talkBody` for Rayan's head/torso/hands and
  the mascot's body (equal to `talk` on engine 1, so finished videos are unchanged).
- `caption` overrides the shown text (words for refs and timing untouched). Takes: `voice <slug> --takes l3=3`
  stores `l3#1`, `l3#2` (ElevenLabs/fixture: another seed; system voices: another rate), take 0 keeps every existing
  fingerprint (tested), the line's `take: n | { n, by: director|agent, why }` selects and records the choice;
  `--max-credits` refuses an expensive paid run before any request (tested with a counting fake fetch).
- Take evaluation, three tiers kept apart (`audio/voiceReport.ts`, `scripts/voiceTools.ts`): tier 1 validation
  (clipping, cut-off tail, nonverbal tag performed, speech-to-text word error ≤ 20 %); tier 2 facts (length and
  trimmed length, fit to a slot when the next line's start doesn't follow from this one, words/s, pauses, LUFS,
  peak, pitch range); tier 3 `--audition` (all takes in one WAV, announced by take + 1 beeps) for the director, or
  `--report`'s measured pick labelled "measured, not heard". `validate` lists failed validation, multi-take lines
  without a recorded choice, unverified words. `--show` draws the waveform strip (words, tags + energy, sound,
  floor, trim) as a PNG.
- Goldens: resolved hashes refreshed for three new `behaviour.defaults` fields; every per-second visual digest of
  the finished videos identical (checked before refreshing; the resolved episodes equal the old ones without them).
- Tests: 215 (21 files). `tests/voice-performance.test.ts`: loudness, floor/segments/sigh detection, failed
  validation (missing sigh, clipping, cut-off), the sigh-tail fault keeps its sigh, no protected energy removed
  across generated clips, levels and caps, WER, take fingerprints/seeds, takes end to end (generate, keep, select,
  remove), free backfill, the credit cap, resolver trim/level/speech motion on engine 2 vs untouched on engine 1,
  slower body envelope, `trim: false` / switches off / hand-trim warning, caption override, take report + findings.
- Production acceptance (the pilot is M8, so on `videos/one-take`, voiced for the first time with free offline
  voices): l1–l3 trimmed (SAPI's ~0.5 s tails; l2's 1.2 s inner pause kept, see `out/one-take/voice-l2.png`),
  levelled, 3 takes on the two key lines l2 and l3, all passing tier 1; auditions `out/one-take/audition-l2.wav` and
  `audition-l3.wav` wait for the director; `--report` suggests take 0 for both by measurement. A preview render
  confirms the trimmed, levelled playback (audio in each line window, silence between). `ctrl-z-remaster` (engine 2,
  now trimmed/levelled/speech motion) still inspects with 0 warnings. No ElevenLabs credits were spent.

## Production — `videos/co-authored-by/` (2026-10-21, branch `episode/co-authored-by`)
Original 9:16 short (~35 s, engine 2) made end to end in a GPU-less Linux cloud container.
- **References**: 7 studio shorts (36–83 s) studied by contact sheets and loudness profiles: deadpan dialogue-led
  comedy, 2–6-word lines, close shot/reverse-shot, full-frame screen inserts that reveal the escalation,
  speaker-coloured captions, a callback button; a continuous bed (never under ≈ −25 LUFS), mastered −14 LUFS.
- **Story**: Rayan rubber-ducks a bug at 2:47 AM and shushes the mascot beside him; finds the missing `return` by
  saying it out loud, thanks the duck; the commit trailer says `Co-Authored-By: Claude` — "I was emotionally present."
  Button: a squeak, callout "actual co-author".
- **Audio**: Eleven v4 (Liam / Jessica, series voices), 3 takes on 4 key lines, choices recorded as measured picks;
  every clip checked by ElevenLabs speech-to-text (no local whisper here) — one take rejected ("Doc"). Bed, room tone
  and squeak from ElevenLabs sound generation (Music API is paid-only), vetted by level, pulse and chroma.
- **QA loop findings that changed the film**: solver closes put Rayan's eyeline into the lens (→ authored angles);
  duck coverage crossed the 180° line (→ duck turned to ¾ profile, shot from the coverage side); yellow duck read lime
  under the cyan monitor (→ orange-shifted); monitor blocked the two-shot; a 1.4 s commit reveal typed too slowly to
  read (→ `pop`, +0.3 s); payoff needed a physical beat (`beat` + glance to camera + wiggle); review of render 1:
  medium shots clipped heads into the top UI band, bed ~4 dB too quiet, window whoosh +3.9 dB.
- **Engine/tooling** (reusable, goldens unchanged, 221 tests): ramped music duck + end fade on engine 2 and the
  loop's volume curve on the episode timeline; `swangle` on GPU-less Linux; POSIX `--props` quoting; flat-normal NaN
  guard (SwiftShader white dashes on RoundedBox slivers). Render speed here: ~3.5 s/frame (1044 frames ≈ 50 min).
- **Licensing**: ElevenLabs free plan → non-commercial; credit elevenlabs.io in the post title. SFX kit CC0.

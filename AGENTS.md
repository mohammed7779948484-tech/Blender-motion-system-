# Video Factory — working guide for agents

Entry point: `npm run factory -- <command>` (same CLI as `npm run cli`). Run it bare for the command list.
Human overview: [README.md](README.md). How it works: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Produce an episode

1. **Discover** — `npm run factory -- list`, `show actor rayan`, and `catalog/*.json` (actors, environments, camera,
   direction, `episode.schema.json`). `npm run factory -- library` lists the Blender asset files.
2. **Scaffold** — `npm run factory -- new <slug> [--env dev-office] [--preset landscape|portrait|square]`. Fill `BRIEF.md`.
3. **Direct** — edit `videos/<slug>/episode.json`. Time everything off dialogue: `"l2.start"`, `"l2.end+0.3"`,
   `"l3.word:4"`. Prefer semantic shots with a `subject`. Small changes: `npm run factory -- edit …` (README).
4. **Voice** — `npm run factory -- voice <slug>` (offline: eSpeak NG on Linux/macOS, system voices on Windows).
   `--provider elevenlabs` is paid and needs explicit approval. Re-run after changing dialogue.
5. **Check** — `npm run factory -- validate <slug>`: fix every ✖, read every ⚠.
6. **Look** — `npm run factory -- build <slug> --profile draft`, then view frames:
   `ffmpeg -ss 3 -i out/<slug>-draft.mp4 -frames:v 1 /tmp/f.png`. `--profile blocking` is faster still.
7. **Deliver** — `npm run factory -- build <slug>` → `out/<slug>.mp4`, `.srt`, `.vtt`; then `review <slug>` and
   `factory/qa.sh out/<slug>.mp4`.

## Rules

- A video touches only `videos/<slug>/` and `public/videos/<slug>/`. Shared changes (`src/engine`, `library/`,
  `factory/`) must be reusable; after changing `src/engine` run `npm test` and `npm run catalog`.
- **Do not hand-edit generated scenes from code.** Use the recipe for direction. Use `scene-edit`/Blender for what the
  recipe cannot say (a light, a prop nudge, a material). A hand-edited scene is kept by later builds — which also
  means recipe changes to that shot no longer reach it until `scenes <slug> --force --only <shot>`.
- Library `.blend` files are created once from the engine's views and never overwritten. They are the place to change
  how a character or prop *looks*. Changing its *structure or motion* (joints, poses, gestures) happens in `src/engine/actors`.
- Keep object names in library/scene files: the builder links meshes and materials by name.
- Determinism: custom React code must be a pure function of the frame (no `Math.random`, `Date`, `useFrame`).
- Paid services and publishing need the owner's approval. Never commit `.env`.
- Unknown CLI flags are ignored by the carried-over parser: check spelling (`--provider`, `--profile`).

## What changed for people who knew the old system

- `render <slug>` still exists and renders with the legacy browser 3D renderer (useful for A/B and fast previews).
  The deliverable is now made by `build <slug>`.
- 2D layers are unchanged: `overlay`, fx accents (`text`, `window`, `callout`, …), captions, sound and music cues.
- Not transferred to Blender (reported by `plan` as "not transferable"): custom shader materials (a colour is
  carried over), three.js lines, instanced meshes, fog, bloom and chromatic-aberration post effects.
  See [docs/MIGRATION.md](docs/MIGRATION.md).

## Gotchas

- The scene plan is re-sampled whenever anything under `src/` or `videos/<slug>/` changes (≈0.6 s per frame here).
  Shots whose sampled content is identical are not rebuilt or re-rendered.
- EEVEE on a CPU costs about 2 s per sample per 1080p frame; use `draft` while iterating.
- Shot files are named by their first frame (`shot-0148`). Inserting a cut renames nothing else; re-timing dialogue
  renames every later shot (and orphans hand edits into `scenes/orphaned/`).
- Screen textures that animate are image sequences under `out/<slug>/plan/`; run `plan` before opening a scene on a
  fresh checkout or monitors will be pink.
- Seated actors need seated poses; gestures along the lens axis vanish; a subject looking at another actor may face
  away from a solver-chosen camera (`look: "camera"` or an authored `angle`). More in `docs/legacy/AGENTS.md`.

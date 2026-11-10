# Research: tools, projects and packages considered

Date: 2026-11-10. Evidence labels: **[doc]** = read in upstream documentation or a search result (linked),
**[exp]** = tested in this session (details and numbers in [experiments.md](experiments.md)), **[unverified]** = could not
be confirmed online or locally; treated as a risk, not a fact.

The questions came from the audit ([../audit/inventory.md](../audit/inventory.md)): the old system is a deterministic
TypeScript "direction engine" with procedural React Three Fiber views, no editable scene files, no render reuse, no
sidecar captions, and ≈3–5 s per frame on GPU-less Linux.

## 1. 3D authoring and rendering

| Candidate | Version / licence | Finding | Decision |
|---|---|---|---|
| **Blender** | 5.2.3 LTS (2026-10-22), GPL; bundled Python 3.13 | Current LTS; 4.5 LTS also maintained **[doc]** [blender.org/download/lts](https://www.blender.org/download/lts/). Runs headless here: `blender -b` from the official tarball **[exp E1]**. | **Adopt** as the scene editor and 3D renderer. |
| EEVEE (Blender) | part of Blender | Needs OpenGL/Vulkan even headless; upstream threads call GPU-less use unreliable **[doc]** ([devtalk thread](https://devtalk.blender.org/t/blender-2-8-unable-to-open-a-display-by-the-rendering-on-the-background-eevee/1436), [headless EGL commit](https://lists.blender.org/pipermail/bf-blender-cvs/2022-August/176810.html), [issue 85336](https://projects.blender.org/blender/blender/issues/85336)). In this container it **does** work on Mesa llvmpipe (EGL) and on lavapipe (`--gpu-backend vulkan`) after installing `libegl1 libegl-mesa0 mesa-vulkan-drivers`; EGL prints harmless `EGL_BAD_MATCH` lines **[exp E1]**. | **Adopt** as the default engine; speed on CPU is the main cost (E1, E6). |
| Cycles CPU | part of Blender | 47 s per 1080p frame at 16 samples + denoise on 4 cores **[exp E1]** — 12 h for a 30 s episode. | **Reject** for this hardware; remains a profile option on GPU machines. |
| Workbench | part of Blender | ≈2 s per 1080p frame, but studio lighting only (no mood lights) **[exp E1]**. | **Adapt**: `blocking` profile for fast motion checks. |
| `bpy` from PyPI | 5.2.3 | Exists **[doc]** [pypi.org/project/bpy](https://pypi.org/project/bpy/) (`pip index versions bpy` → 5.2.3 **[exp]**). Adds a second way to get Blender; the artist still needs the application. | **Reject** (use the application binary everywhere, one code path). |
| glTF as interchange (three `GLTFExporter` → Blender importer) | — | Would move geometry, but not per-frame material/light/texture animation, and needs name matching afterwards. | **Reject** in favour of a direct scene-graph probe (E2), which carries everything in one pass. |
| Blender library linking | part of Blender | Mesh and material datablocks can be linked from library `.blend` files and used by local, animatable objects **[exp E3]**. Collection instancing/library overrides were not needed. | **Adopt** (linked datablocks, object-level material slots). |

## 2. Agent-facing Blender tooling

| Candidate | Version / licence | Finding | Decision |
|---|---|---|---|
| Blender Lab MCP server | v1.0.0 (2026-04), needs Blender ≥ 5.1; licence not stated on the pages read **[unverified]** | Official add-on + stdio server; executes requests inside a running Blender; background mode only for synchronous requests **[doc]** [readme](https://projects.blender.org/lab/blender_mcp/raw/branch/main/readme.md), [comparison](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026). | **Not integrated**: the factory is driven by a CLI and files, which works without a live Blender session. Compatible as an optional interactive layer on top of the same `.blend` scenes. |
| blender-mcp (S. Ahuja) | MIT | Community server, socket add-on **[doc]** [mcpservers.org](https://mcpservers.org/servers/blender-mcp). | Same as above. |
| Flamenco (Blender Studio render farm) | — | Relevant once shots are rendered on several machines; shot jobs here are already independent `blender -b <shot>.blend` commands. Not researched further in this session **[unverified]**. | **Later**; noted as the scale-out path. |

## 3. Composition, graphics, captions

| Candidate | Version / licence | Finding | Decision |
|---|---|---|---|
| **Remotion** | 4.0.536 (pinned by the old repo); Remotion License — free for individuals and companies up to 3 people, paid company licence above **[doc]** [license](https://www.remotion.dev/docs/license), [FAQ](https://www.remotion.dev/docs/license/faq); v5 migration notes mention mandatory telemetry for company licences **[doc]** [5.0 migration](https://remotion.dev/docs/5-0-migration) | All existing 2D layers (captions, fx overlay, kinetic text, per-video overlays) and the audio mix are Remotion components driven by the resolved timeline. Used as a pure compositor over Blender frames it needs no WebGL and renders several times faster than the 3D path **[exp E5]**. | **Adopt, unchanged version**, as compositor + legacy preview renderer. Licence threshold is an operating cost to check for the company. |
| **HyperFrames** (HeyGen) | Apache-2.0; npm `hyperframes`, `@hyperframes/*`; Node ≥ 22 + FFmpeg | HTML + data attributes (`data-start`, `data-duration`, `data-track-index`), seekable GSAP/CSS/WAAPI timelines, deterministic frame capture in headless Chrome, `<video>`/`<audio>` clips, CLI `init / preview / render` **[doc]** [github.com/heygen-com/hyperframes](https://github.com/heygen-com/hyperframes), [intro](https://hyperframes.heygen.com/introduction). No licence threshold. Small test: see **[exp E7]**. | **Available, not on the default path**: it would mean rewriting the React overlay/caption components and re-implementing the audio mix that already work; its advantage is licensing and plain-HTML authoring. Documented as the alternative compositor for new, self-contained graphics packages. |
| ffmpeg drawtext/libass | system ffmpeg | Fast, but cannot reuse the React overlays or word-highlight captions. | Used for encoding, contact sheets, QA metrics and mastering only. |
| OpenTimelineIO | 0.18.x **[doc]** [KDE packaging notice](https://mail.kde.org/pipermail/neon-notifications/2026-May/078141.html), [repo](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | Edit-decision interchange; no Blender VSE adapter confirmed **[unverified]**. The shot list is already a small JSON (`out/<slug>/plan/plan.json`). | **Reject for now** (no consumer). |
| Sidecar captions | SRT / WebVTT | Not present in the old system (audit §2). Trivial to emit from the resolved line timings. | **Build** (`compose` writes `.srt` and `.vtt`). |

## 4. Voice and timing

| Candidate | Licence | Finding | Decision |
|---|---|---|---|
| ElevenLabs with-timestamps | paid; free tier is non-commercial and requires credit | Existing provider in the carried-over voice pipeline; all committed ElevenLabs clips are non-commercial (audit §4). | **Kept, opt-in only** (`--provider elevenlabs`); needs approval before use. Not used in this session. |
| Windows SAPI (`system`) | OS voices | Existing provider; Windows only. The baseline episode's committed clips come from it. | **Kept**. Its committed clips are reused for the like-for-like comparison. |
| eSpeak NG | GPL-3.0 (program); output audio is not restricted | apt package 1.51; robotic but fully offline, per-word timing obtainable by synthesising word by word **[exp E8]**. | **Adopt as the Linux offline provider** (`--provider espeak`) so new recipes get real audio + word timings without paid services. |
| Piper | piper1-gpl is GPL-3.0; original MIT repo archived Oct 2025 **[doc]** [piper vs kokoro](https://www.promptquorum.com/power-local-llm/piper-vs-kokoro-tts) | Better quality; no confirmed word-timestamp output **[unverified]**; per-voice dataset licences vary. | **Later** (would plug into the same provider interface). |
| Kokoro-82M | Apache-2.0 model **[doc]** [replicate readme](https://replicate.com/siegerts/kokoro-tts-82m/readme); timestamped ONNX variant exists **[unverified]** | Best free quality candidate; needs a model download and an ONNX/torch runtime. | **Later**; recommended next provider. |
| faster-whisper / stable-ts / WhisperX | MIT / MIT / BSD | Word timestamps or forced alignment for any TTS **[doc]** [whisper-timestamped](https://github.com/linto-ai/whisper-timestamped), [stable-ts](https://pypi.org/project/stable-ts/2.15.2/). The old repo already has an optional ffmpeg-whisper STT check. | **Later**; not needed while providers return word timings themselves. |

## 5. Orchestration, caching, QA

| Topic | Decision and reason |
|---|---|
| Task runner (doit, Snakemake, Ninja, Turborepo) | **Build a small content-hash cache inside the existing Node CLI.** Four stages with one hash each do not justify a new dependency; the cache rules must also understand "this scene was edited by hand", which generic runners do not. |
| Shot cache key | sha1(shot `.blend` bytes + bytes of every linked library `.blend` + animated-texture identity + render profile + frame range). Verified by edit tests **[exp E9]**. |
| Frame format | PNG per frame from Blender (lossless, resumable: `use_overwrite = False`), H.264 yuv420p + AAC from Remotion as before. |
| Colour | Blender view transform "Khronos PBR Neutral" = the tone mapping the old renderer used (`ToneMappingMode.NEUTRAL`), display sRGB. |
| QA | ffprobe stream checks, ffmpeg `ebur128`, `blackdetect`, `silencedetect`, SSIM/PSNR between old and new frames, labelled contact sheets (carried-over `stills`/`review` commands plus `factory/qa.sh`). |

## Not verified online

- Licence text of the Blender Lab MCP server; Flamenco's current version; whether OTIO has a maintained Blender adapter.
- Piper word-alignment output and the licence of the timestamped Kokoro ONNX export.
- Remotion's current major version on 2026-11-10 (the pinned 4.0.536 was kept; no upgrade attempted).
- "The Missing Frame" (the 27.5 s Blender trial mentioned in the brief) is not in any branch of the repository
  (0 hits for "Missing Frame" and "Blender" — audit §7), so its tool split could not be inspected or re-timed.

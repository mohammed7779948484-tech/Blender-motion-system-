# Co-Authored-By — brief

**Concept (one line):** At 2:47 AM Rayan debugs by explaining his code to a rubber duck and shushes the AI sitting
right next to him — the duck "solves" it, and Claude still signs the commit.
**Platform / format:** 9:16 Shorts / Reels / TikTok · ~30 s
**Audience:** developers and AI-curious viewers. Two insider truths make it shareable: rubber-duck debugging works
(you find the bug by saying it out loud), and Claude Code adds `Co-Authored-By: Claude` to commits.

## What the references taught (7 shorts in the same studio style)
- Deadpan, dialogue-led comedy: lines of 2–6 words, a human who wants something small, an AI that answers flat.
- Shot / reverse-shot closes with shallow focus, cutting every ~1.5–3 s on the line; one wide to reset geography.
- The escalation is *revealed* in full-frame screen inserts (terminal, diff, UI) the viewer can read muted.
- Speaker-coloured centred captions (human white, AI orange).
- Low-key, warm-practical lighting; dark rooms; faces sculpted by a lamp.
- A callback button in the last 2 s ("You're absolutely right!", "...Am I?").
- Continuous bed under everything (music or room tone, measured: never below ~−25 LUFS between lines), mastered −14 LUFS.

## Hook (0–2 s)
Frame 0: tight close on a yellow rubber duck under the desk lamp, a slow push-in, and Rayan's voice, dead serious:
"Okay, duck. Here's the bug." The image (a grown man briefing a bath toy at night) is the question.

## Beats
1. **Setup** — "Okay, duck. Here's the bug." Cut to Claude on the desk beside him, flat: "I'm… right here."
   Rayan doesn't look away from the duck, finger up: "Shh. He's listening."
2. **Escalation (Claude tries three times)** —
   - Claude, whispered: "It's a bath toy."
   - Rayan explains to the duck (screen insert shows the bug): "So. I filter the users… I map the names…"
   - Claude leans in, bright: "I could rewrite it in Rust?" → Rayan, without looking: "SHH."
3. **Turn** — Rayan freezes mid-thought: "…and then I never return them." Beat. [gasps] "Duck. You *genius*."
   Reaction close on Claude: annoyed squint.
4. **Payoff** — Rayan types the fix and commits; terminal window slides up:
   `git commit -m "fix: actually return the users"` → `Co-Authored-By: Claude`. Rayan slowly turns: "…You did nothing."
   Claude, proud puff: "[proudly] I was emotionally present."
5. **Button** — insert on the duck: one tiny squeak. Callout: "actual co-author". Cut out.

## Characters & performance
- **Rayan** (seated, sit_explaining / sit_typing): sincere, intense, a man in a 2 AM trance. Body turned to the duck,
  back half to Claude; the finger-up shush; the gasp; the slow turn of betrayal at the end.
- **Claude** (mascot on the desk, his right): polite, small, increasingly ignored → leans in (caring_lean), whispers,
  goes annoyed, then proud_puff on the payoff. Its smallness is the joke: it is right there and nobody listens.
- **The duck**: never moves. Pushes-in on it as if it were thinking. It gets the last sound.

## Setting & look
`dev-office`, mood `late-night`, pushed darker: lamp warm on faces, monitor glow cool, city window behind.
Duck added on the desk at Rayan's left (by the monitors), mascot stays at his right → he turns *away* from the AI to
talk to the toy. Camera: close singles (shot / reverse-shot), dramatic push-ins on the duck, a monitor insert for the
bug, a terminal window for the commit, a two-shot for geography and the final turn. Camera life on everything else.

## Sound
- Voices: ElevenLabs Eleven v4 (Rayan: earnest young male; Claude: bright, polite, small). Tags: [whispers], [gasps],
  [proudly]. Takes on the key lines (l4 whisper, l9 gasp, l11 payoff); choices recorded.
- Bed: soft late-night room tone (fan hum, faint rain on the window) + a quiet lo-fi pad — generated once with
  ElevenLabs, cached in `public/videos/co-authored-by/`, ducked under dialogue.
- SFX (CC0 kit): keyboard burst on the fix, `notify` on the commit window, `select` on the callout, a soft `pop` on
  Claude's proud puff; generated: one rubber-duck squeak. Silence before "Duck. You genius." and before the squeak.

**Generated audio (ElevenLabs sound generation, `eleven_text_to_sound_v2`, free plan → non-commercial), cached in
`public/videos/co-authored-by/sfx/`:**
- `lofi-bed.mp3` — 30 s, loop, influence 0.6: "lo-fi hip hop instrumental loop, mellow Rhodes electric piano chords,
  soft vinyl crackle, muted kick and brushed snare, 75 bpm, calm late night study music". Measured −16.6 LUFS; tonal
  (C minor with borrowed major chords, 96 % of energy in 7 pitch classes); weak drum pulse → reads as a chord pad.
  The Music API itself needs a paid plan (402).
- `roomtone.mp3` — 30 s loop ×2, +16 dB, influence 0.5: "quiet late night home office room tone, soft computer fan
  hum, gentle rain on a window, no music, no voices".
- `duck-squeak.wav` — first of two squeaks (0–0.34 s, 60 ms fade), influence 0.7: "a single short squeak of a small
  rubber duck toy being squeezed once, close up, dry, no reverb". Harmonic, fundamental ≈ 1.3 kHz with a slight glide.

## Reuse vs custom
Reused: dev-office set, Rayan + Claude, recipes/gestures, `window` (terminal) and `callout` fx, code screen preset,
camera solver, listening. Custom (in this folder only): duck added with `set.add`, generated bed + squeak.

## Payoff check
Rewatch/share: every dev has rubber-ducked, and every Claude Code user has seen the co-author trailer. Last image:
the duck, uncredited, with "actual co-author" pointing at it. Screenshot frame: the terminal with
`Co-Authored-By: Claude` and the mascot's proud puff — "I was emotionally present."

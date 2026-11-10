// Music bed gain per moment — pure, shared by <Soundtrack> and tests. Under dialogue the bed drops to
// `duck` × volume. With attack/release > 0 the duck ramps (sine ease) instead of switching; with both 0 it is
// the original hard switch (speech window = line ± 0.15 s). fadeOut fades the bed to silence before `end`.
import type { ResolvedEpisode } from "../core/timeline";

const PAD = 0.15;
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/** How far into the duck the bed is at `t` (0 = full level, 1 = fully ducked). */
export const duckAmount = (t: number, lines: Pick<ResolvedEpisode["lines"][number], "start" | "end" | "voiced">[], attack: number, release: number) => {
  let k = 0;
  for (const l of lines) {
    if (!l.voiced) continue;
    const a = l.start - PAD;
    const b = l.end + PAD;
    if (t >= a && t <= b) return 1;
    if (attack > 0 && t < a && t > a - attack) k = Math.max(k, ease((t - (a - attack)) / attack));
    if (release > 0 && t > b && t < b + release) k = Math.max(k, ease(1 - (t - b) / release));
  }
  return k;
};

/** Volume of the music bed at `t` seconds of an episode lasting `end` seconds. */
export const musicVolumeAt = (t: number, music: NonNullable<ResolvedEpisode["music"]>, lines: ResolvedEpisode["lines"], end: number) => {
  const k = duckAmount(t, lines, music.attack, music.release);
  const fade = music.fadeOut > 0 ? Math.min(1, Math.max(0, (end - t) / music.fadeOut)) : 1;
  return music.volume * (1 - (1 - music.duck) * k) * fade;
};

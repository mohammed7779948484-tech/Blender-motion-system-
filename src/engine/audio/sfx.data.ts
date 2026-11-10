// Sound-effect library (pure data). Shared sounds live in public/sfx/ with their provenance; episodes
// use them by name ("sound": "key-clack"). Episode-specific files go in public/videos/<slug>/.
// Levels: every kit file peaks near 0 dBFS; `meanDb` tells how loud it feels (≈ -12 loud, -25 subtle).
// Under dialogue, volumes of 0.3–0.7 usually sit right.

export type SfxMeta = {
  /** Public-relative file, or an https URL for remote (legacy) sounds. */
  file: string;
  tags: string[];
  description: string;
  /** Seconds. */
  duration?: number;
  /** SPDX id, or "unknown" when rights are unclear (do not use in monetized work). */
  license: string;
  author: string;
  source: string;
  original?: string;
  meanDb?: number;
};

/** Local, CC0, committed in public/sfx/ (see THIRD_PARTY_NOTICES.md). */
export const SFX_KIT: Record<string, SfxMeta> = {
  "key-clack": {file: "sfx/key-clack.wav", tags: ["keyboard","impact","click"], description: "Hard plastic clack — a key bottoming out (plate impact, medium).", duration: 0.609, license: "CC0-1.0", author: "Kenney — Impact Sounds", source: "https://kenney.nl/assets/impact-sounds", original: "impactPlate_medium_000.ogg", meanDb: -25.6},
  "key-slam": {file: "sfx/key-slam.wav", tags: ["keyboard","impact","heavy"], description: "Heavy plastic slam — someone landing on a key (plate impact, heavy).", duration: 0.489, license: "CC0-1.0", author: "Kenney — Impact Sounds", source: "https://kenney.nl/assets/impact-sounds", original: "impactPlate_heavy_000.ogg", meanDb: -22.6},
  "impact-heavy": {file: "sfx/impact-heavy.wav", tags: ["impact","punch","hit","heavy"], description: "Heavy punchy body hit — landings, slams.", duration: 0.649, license: "CC0-1.0", author: "Kenney — Impact Sounds", source: "https://kenney.nl/assets/impact-sounds", original: "impactPunch_heavy_000.ogg", meanDb: -18},
  "impact-medium": {file: "sfx/impact-medium.wav", tags: ["impact","punch","hit"], description: "Medium punch hit.", duration: 0.431, license: "CC0-1.0", author: "Kenney — Impact Sounds", source: "https://kenney.nl/assets/impact-sounds", original: "impactPunch_medium_000.ogg", meanDb: -17.2},
  "impact-soft": {file: "sfx/impact-soft.wav", tags: ["impact","soft","thud","drop"], description: "Soft heavy thud — putting something heavy down.", duration: 0.527, license: "CC0-1.0", author: "Kenney — Impact Sounds", source: "https://kenney.nl/assets/impact-sounds", original: "impactSoft_heavy_000.ogg", meanDb: -17.4},
  "impact-wood": {file: "sfx/impact-wood.wav", tags: ["impact","wood","knock"], description: "Wooden knock.", duration: 0.33, license: "CC0-1.0", author: "Kenney — Impact Sounds", source: "https://kenney.nl/assets/impact-sounds", original: "impactWood_medium_000.ogg", meanDb: -22.6},
  "impact-metal": {file: "sfx/impact-metal.wav", tags: ["impact","metal","clang"], description: "Metallic clang.", duration: 0.269, license: "CC0-1.0", author: "Kenney — Impact Sounds", source: "https://kenney.nl/assets/impact-sounds", original: "impactMetal_medium_000.ogg", meanDb: -21.5},
  "click": {file: "sfx/click.wav", tags: ["ui","click","mouse"], description: "Short UI click.", duration: 0.097, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "click_001.ogg", meanDb: -26.4},
  "select": {file: "sfx/select.wav", tags: ["ui","select","blip"], description: "UI select blip — highlights, callouts.", duration: 0.04, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "select_001.ogg", meanDb: -17.3},
  "toggle": {file: "sfx/toggle.wav", tags: ["ui","toggle","switch"], description: "UI toggle switch.", duration: 0.136, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "toggle_001.ogg", meanDb: -14},
  "tick": {file: "sfx/tick.wav", tags: ["ui","tick","timer"], description: "Small tick.", duration: 0.045, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "tick_001.ogg", meanDb: -21.8},
  "pop": {file: "sfx/pop.wav", tags: ["ui","pop","appear","comedic"], description: "Bubbly pop — things appearing, cute hops.", duration: 0.188, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "drop_002.ogg", meanDb: -19.8},
  "pluck": {file: "sfx/pluck.wav", tags: ["comedic","boing","bounce","fail"], description: "Rubbery pluck — a useless hop, comedic bounce.", duration: 0.1, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "pluck_001.ogg", meanDb: -20.5},
  "error": {file: "sfx/error.wav", tags: ["ui","error","fail","buzz"], description: "UI error buzz.", duration: 0.5, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "error_006.ogg", meanDb: -18},
  "glitch": {file: "sfx/glitch.wav", tags: ["ui","glitch","digital","error"], description: "Digital glitch stutter.", duration: 0.017, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "glitch_001.ogg", meanDb: -9.8},
  "scratch": {file: "sfx/scratch.wav", tags: ["comedic","scratch","stop"], description: "Short scratchy stop — record-scratch-style beat.", duration: 0.139, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "scratch_001.ogg", meanDb: -12.3},
  "confirm": {file: "sfx/confirm.wav", tags: ["ui","success","confirm","positive"], description: "Positive UI confirmation.", duration: 0.29, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "confirmation_001.ogg", meanDb: -11.3},
  "notify": {file: "sfx/notify.wav", tags: ["ui","notification","bong","alert"], description: "Notification bong — toasts, pings.", duration: 0.12, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "bong_001.ogg", meanDb: -16.2},
  "window-open": {file: "sfx/window-open.wav", tags: ["ui","open","whoosh","appear"], description: "Window opening swoosh.", duration: 0.225, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "maximize_008.ogg", meanDb: -12.7},
  "window-close": {file: "sfx/window-close.wav", tags: ["ui","close","whoosh","disappear"], description: "Window closing swoosh.", duration: 0.225, license: "CC0-1.0", author: "Kenney — Interface Sounds", source: "https://kenney.nl/assets/interface-sounds", original: "minimize_008.ogg", meanDb: -12.7},
  "power-up": {file: "sfx/power-up.wav", tags: ["digital","power-up","rise","positive"], description: "Rising digital power-up.", duration: 0.467, license: "CC0-1.0", author: "Kenney — Digital Audio", source: "https://kenney.nl/assets/digital-audio", original: "powerUp2.ogg", meanDb: -17.7},
  "power-down": {file: "sfx/power-down.wav", tags: ["digital","power-down","fall","fail"], description: "Falling phaser — failure, deflation.", duration: 0.467, license: "CC0-1.0", author: "Kenney — Digital Audio", source: "https://kenney.nl/assets/digital-audio", original: "phaserDown1.ogg", meanDb: -15},
  "success": {file: "sfx/success.wav", tags: ["digital","success","jingle","positive"], description: "Three-tone success jingle.", duration: 0.849, license: "CC0-1.0", author: "Kenney — Digital Audio", source: "https://kenney.nl/assets/digital-audio", original: "threeTone1.ogg", meanDb: -12.1},
  "zap": {file: "sfx/zap.wav", tags: ["digital","zap","electric"], description: "Electric zap.", duration: 1.019, license: "CC0-1.0", author: "Kenney — Digital Audio", source: "https://kenney.nl/assets/digital-audio", original: "zap1.ogg", meanDb: -12.2},
  "whoosh": {file: "sfx/whoosh.wav", tags: ["transition","whoosh","fast"], description: "Fast whoosh — cuts, quick moves.", duration: 0.154, license: "CC0-1.0", author: "freesound.org uploader via remotion.media", source: "https://remotion.media/whoosh.wav", original: "whoosh.wav", meanDb: -18.6},
  "whip": {file: "sfx/whip.wav", tags: ["transition","whip","swish"], description: "Whip swish — whip pans, snappy entrances.", duration: 0.173, license: "CC0-1.0", author: "freesound.org uploader via remotion.media", source: "https://remotion.media/whip.wav", original: "whip.wav", meanDb: -19.1},
  "mouse-click": {file: "sfx/mouse-click.wav", tags: ["ui","click","mouse"], description: "Real mouse click.", duration: 0.397, license: "CC0-1.0", author: "freesound.org uploader via remotion.media", source: "https://remotion.media/mouse-click.wav", original: "mouse-click.wav", meanDb: -31.6},
};

/**
 * Remote meme sounds hosted by Remotion (fetched at render time). Kept so the V1 videos render unchanged;
 * rights are unknown/third-party, so `validate` warns when an episode uses them.
 */
const REMOTE_LEGACY = [
  "page-turn", "switch", "shutter-modern", "shutter-old", "ding", "bruh", "vine-boom", "windows-xp-error", "fah", "spongebob-fail",
  "omg-hell-nah", "price-is-right-fail", "romance-meme", "bone-crack", "anime-wow", "yippee", "loading-lag", "wilhelm-scream", "mac-quack",
  "skedaddle", "snapchat-notification", "nelly-ahh", "sanctuary-guardian-what", "minecraft-hurt", "oh-my-god-vine", "illuminati-confirmed",
  "dramatic-boomer", "triggered", "record-scratch",
];
export const SFX_REMOTE: Record<string, SfxMeta> = Object.fromEntries(
  REMOTE_LEGACY.map((n) => [n, { file: `https://remotion.media/${n}.wav`, tags: ["meme", "remote"], description: "Remotion-hosted meme sound (downloaded at render time).", license: "unknown", author: "third party (via remotion.media)", source: `https://www.remotion.dev/docs/sfx/${n}` }]),
);

/** Everything addressable by name; local kit sounds win over remote ones with the same name. */
export const SFX_INFO: Record<string, SfxMeta> = { ...SFX_REMOTE, ...SFX_KIT };

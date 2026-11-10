// Prop catalog metadata (pure). Origin = bottom centre (top centre for `origin: "top"` props), front faces +Z, metres.
// `size` doubles as the occluder box used by the camera solver.
import type { Vec3 } from "../core/time";
import { BRIDGE_THICKNESS, BRIDGE_WIDTH, ISLAND_DEPTH, ISLAND_RADIUS, SKY_RADIUS } from "./floating-space/space";
import { KEY_TOP, KEY_TRAVEL, KEYBOARD_SIZE, KEYS, keyTop } from "./micro-keyboard/keys";

export type ParamSpec = { type: "color" | "boolean" | "number" | "string" | "screen" | "object" | "list"; default: unknown; description: string };

/** Params every set item accepts, whatever its kind. */
export const COMMON_ITEM_PARAMS: Record<string, ParamSpec> = {
  visible: { type: "boolean", default: true, description: "false hides the item (toggle it with props cues, e.g. a placed copy appearing)" },
};

export type PropMeta = {
  description: string;
  size: Vec3;
  /** Blocks camera rays (false for flat things like rugs). */
  occluder: boolean;
  /** "top": the item's position is its top surface and the size box hangs below it (floating platforms). */
  origin?: "bottom" | "top";
  /** Named points in prop-local space (framing targets, seats, surfaces). */
  anchors: Record<string, Vec3>;
  params: Record<string, ParamSpec>;
  /**
   * Pressable (the `press` recipe): which param a press sets and how far it travels. `keyed`: anchors
   * named `key:<id>` press `{ [param]: { <id>: true } }`; otherwise `{ [param]: true }`.
   */
  press?: { param: string; travel: number; keyed?: boolean };
};

const screenParam: ParamSpec = {
  type: "screen",
  default: { preset: "code" },
  description: "Screen content: { preset: code|terminal|error|deploy|off, ...preset params }",
};

export const PROPS: Record<string, PropMeta> = {
  desk: {
    description: "Wooden desk with dark legs.",
    size: [1.6, 0.76, 0.75],
    occluder: true,
    anchors: { top: [0, 0.76, 0], center: [0, 0.6, 0] },
    params: {
      color: { type: "color", default: "#7a5a40", description: "Desktop wood" },
      legColor: { type: "color", default: "#2b2b33", description: "Legs" },
      width: { type: "number", default: 1.6, description: "Desk width (m)" },
    },
  },
  office_chair: {
    description: "Swivel office chair. Seat actors at its `chair-seat` mark (sit_* poses).",
    size: [0.62, 1.1, 0.62],
    occluder: false,
    anchors: { seat: [0, 0.46, 0.02], back: [0, 0.85, -0.24] },
    params: {
      color: { type: "color", default: "#232838", description: "Upholstery" },
      accent: { type: "color", default: "#f59e0b", description: "Trim" },
    },
  },
  monitor: {
    description: "Flat monitor on a stand with an animated screen.",
    size: [0.62, 0.5, 0.2],
    occluder: true,
    anchors: { screen: [0, 0.31, 0.03], top: [0, 0.5, 0] },
    params: {
      screen: screenParam,
      bezel: { type: "color", default: "#17181d", description: "Frame" },
    },
  },
  keyboard: {
    description: "Low-profile keyboard.",
    size: [0.44, 0.03, 0.15],
    occluder: false,
    anchors: { top: [0, 0.03, 0] },
    params: { color: { type: "color", default: "#2a2d36", description: "Body" } },
  },
  mug: {
    description: "Coffee mug (holdable).",
    size: [0.09, 0.11, 0.09],
    occluder: false,
    anchors: { top: [0, 0.11, 0] },
    params: {
      color: { type: "color", default: "#f4f4f5", description: "Mug" },
      steam: { type: "boolean", default: false, description: "Steam wisps" },
    },
  },
  desk_lamp: {
    description: "Articulated desk lamp; its light follows mood.practicals.lamp.",
    size: [0.22, 0.48, 0.22],
    occluder: false,
    anchors: { bulb: [0, 0.42, 0.12] },
    params: {
      color: { type: "color", default: "#f59e0b", description: "Lamp body" },
      on: { type: "boolean", default: true, description: "Light on" },
      light: { type: "color", default: "#ffcf8a", description: "Light colour" },
    },
  },
  plant: {
    description: "Potted leafy plant.",
    size: [0.5, 1.0, 0.5],
    occluder: true,
    anchors: { top: [0, 1.0, 0] },
    params: {
      pot: { type: "color", default: "#c2410c", description: "Pot" },
      leaves: { type: "color", default: "#2f9e5a", description: "Leaves" },
      scale: { type: "number", default: 1, description: "Overall scale" },
    },
  },
  bookshelf: {
    description: "Tall shelf with seeded colourful books.",
    size: [1.0, 1.8, 0.35],
    occluder: true,
    anchors: { top: [0, 1.8, 0] },
    params: {
      color: { type: "color", default: "#5b4636", description: "Wood" },
      seed: { type: "string", default: "shelf", description: "Book colour/layout seed" },
    },
  },
  rug: {
    description: "Flat rug.",
    size: [2.4, 0.01, 1.8],
    occluder: false,
    anchors: {},
    params: {
      color: { type: "color", default: "#3b3f6b", description: "Main colour" },
      border: { type: "color", default: "#f59e0b", description: "Border" },
    },
  },
  // ---- micro-keyboard world (a laptop scaled ~50×: normal-size actors stand on the keys)
  giant_keyboard: {
    description: "Giant laptop keyboard (14.5 × 5 keys, 0.95 m pitch). Stand actors on key tops (marks `on-<key>`, y 0.42). Press keys with props cues `{ \"keys\": { \"ctrl\": true } }` (false = release) or the `press` recipe; anchors `key:<id>` (enter, ctrl, z, space, a…).",
    size: [KEYBOARD_SIZE[0], KEY_TOP, KEYBOARD_SIZE[2]],
    occluder: true,
    press: { param: "keys", travel: KEY_TRAVEL, keyed: true },
    anchors: { center: [0, KEY_TOP, 0], top: [0, KEY_TOP, 0], ...Object.fromEntries(KEYS.map((k) => [`key:${k.id}`, keyTop(k.id)])) },
    params: {
      keys: { type: "object", default: {}, description: "Pressed keys: { <key id>: true|false }; each change animates the key from that cue's time" },
      color: { type: "color", default: "#1c1d22", description: "Keycaps" },
      legend: { type: "color", default: "#e7e9ee", description: "Key labels" },
      deck: { type: "color", default: "#8d939c", description: "Aluminium deck around the keys" },
      glow: { type: "color", default: "#ff9a3d", description: "Backlight colour showing between the keys" },
      backlight: { type: "number", default: 0.6, description: "Backlight strength (0 = off)" },
      highlight: { type: "list", default: [], description: "Key ids whose keycap glows (e.g. [\"ctrl\", \"z\"])" },
    },
  },
  giant_screen: {
    description: "Giant laptop lid behind the keyboard: a 14 × 9 m screen tilted back. `screen` takes any screen preset (code, terminal, error, deploy, chat…).",
    size: [15.6, 9.8, 0.4],
    occluder: true,
    anchors: { screen: [0, 5.1, 0.25], center: [0, 5.1, 0], top: [0, 9.8, -1.2] },
    params: {
      screen: screenParam,
      bezel: { type: "color", default: "#16171b", description: "Lid frame" },
      tilt: { type: "number", default: 14, description: "Lid tilt back (degrees)" },
    },
  },
  rubber_duck: {
    description: "Rubber debugging duck (holdable, ~0.4 m: knee-high for a person, tiny in the real world).",
    size: [0.34, 0.4, 0.42],
    occluder: false,
    anchors: { top: [0, 0.4, 0], center: [0, 0.2, 0] },
    params: { color: { type: "color", default: "#ffd23f", description: "Body" } },
  },
  dust_motes: {
    description: "Floating dust specks catching the light (pure drift; good for macro shots).",
    size: [0, 0, 0],
    occluder: false,
    anchors: {},
    params: {
      count: { type: "number", default: 360, description: "Number of specks" },
      area: { type: "list", default: [16, 5, 10], description: "Box [w, h, d] (metres) around the item origin, from the floor up" },
      color: { type: "color", default: "#ffd9a8", description: "Speck colour" },
      seed: { type: "string", default: "dust", description: "Layout seed" },
    },
  },
  // ---- floating-space world (rock islands in a starfield; no ground plane)
  floating_island: {
    description: "Floating low-poly rock island. Its position is the flat walkable TOP (stand actors at that y); the rock hangs below. Size it with the item `scale` (top radius ≈ 1 m × scale, walkable within 0.86 × that). `bob`/`spin` are for decorative islands only: actors don't ride along.",
    size: [ISLAND_RADIUS * 2, ISLAND_DEPTH, ISLAND_RADIUS * 2],
    occluder: true,
    origin: "top",
    anchors: { top: [0, 0, 0], center: [0, -ISLAND_DEPTH / 2, 0], bottom: [0, -ISLAND_DEPTH, 0] },
    params: {
      seed: { type: "string", default: "island", description: "Shape seed (outline, rock facets, crystals)" },
      rock: { type: "color", default: "#5a5475", description: "Rock underside" },
      top: { type: "color", default: "#7fcf9f", description: "Moss on the walkable top" },
      crystal: { type: "color", default: "#7ce8ff", description: "Glowing crystals on the rim and under the rock" },
      crystals: { type: "number", default: 3, description: "Number of rim crystals (in the island's local back arc, yaw 125°–235°: rotate the island to aim them); 0 = none" },
      bob: { type: "number", default: 0, description: "Bob amplitude (m) — decorative islands only" },
      spin: { type: "number", default: 0, description: "Slow yaw (degrees/second) — decorative islands only" },
    },
  },
  light_bridge: {
    description: "Hard-light walkway between islands (local +X along the span). Its position is the walking surface, like an island top; walk `move` cues across it. Pulses travel along it.",
    size: [3, BRIDGE_THICKNESS, BRIDGE_WIDTH],
    occluder: false,
    origin: "top",
    anchors: { center: [0, 0, 0], top: [0, 0, 0] },
    params: {
      length: { type: "number", default: 3, description: "Span length (m)" },
      width: { type: "number", default: BRIDGE_WIDTH, description: "Walkway width (m)" },
      color: { type: "color", default: "#6fe7ff", description: "Light colour" },
      speed: { type: "number", default: 0.6, description: "Pulses per second running along the span (0 = still)" },
    },
  },
  starfield: {
    description: `Space backdrop: a ${SKY_RADIUS} m nebula sky dome (procedural shader) plus twinkling stars around the item origin (keep it at the set centre; the camera far plane is 80 m). Unaffected by fog.`,
    size: [0, 0, 0],
    occluder: false,
    anchors: {},
    params: {
      seed: { type: "string", default: "stars", description: "Star and nebula layout seed" },
      count: { type: "number", default: 2400, description: "Number of stars" },
      twinkle: { type: "number", default: 0.5, description: "Twinkle depth (0 = steady)" },
      nebula: { type: "list", default: ["#6a3fd1", "#1aa6c4", "#d0479c"], description: "Nebula cloud colours" },
      sky: { type: "color", default: "#060716", description: "Deep-space base colour" },
      brightness: { type: "number", default: 1, description: "Overall sky and star brightness" },
    },
  },
  planet: {
    description: "Distant low-poly planet with an optional ring (a backdrop element: place it 30–45 m away). Lit by the mood; ignores fog.",
    size: [0, 0, 0],
    occluder: false,
    anchors: {},
    params: {
      radius: { type: "number", default: 4.5, description: "Planet radius (m)" },
      color: { type: "color", default: "#7fd6c8", description: "Main colour" },
      band: { type: "color", default: "#4a68d0", description: "Band colour" },
      ring: { type: "color", default: "#a9b6e6", description: "Ring colour (\"none\" = no ring)" },
      tilt: { type: "number", default: 50, description: "Spin axis tilt toward +Z (degrees): 0 shows the ring edge-on from the front, ~50 opens it" },
      seed: { type: "string", default: "planet", description: "Band layout seed" },
      spin: { type: "number", default: 1.5, description: "Rotation (degrees/second)" },
    },
  },
  space_rocks: {
    description: "Field of small drifting, tumbling rocks in a ring around the item origin (decorative). Keeps clear of the inner radius (the action) and of a 90° cone toward +Z (the usual camera side).",
    size: [0, 0, 0],
    occluder: false,
    anchors: {},
    params: {
      count: { type: "number", default: 46, description: "Number of rocks" },
      inner: { type: "number", default: 9, description: "Clear radius around the origin (m)" },
      outer: { type: "number", default: 26, description: "Outer radius (m)" },
      height: { type: "list", default: [-9, 9], description: "Vertical range [min, max] (m)" },
      color: { type: "color", default: "#4e4867", description: "Rock colour" },
      seed: { type: "string", default: "rocks", description: "Layout seed" },
    },
  },
  window: {
    description: "Wall window with a procedural city skyline (lit by mood.practicals.window).",
    size: [1.3, 1.2, 0.12],
    occluder: true,
    anchors: { center: [0, 0.6, 0] },
    params: {
      frame: { type: "color", default: "#e7e5e4", description: "Frame" },
      seed: { type: "string", default: "city", description: "Skyline seed" },
    },
  },
};

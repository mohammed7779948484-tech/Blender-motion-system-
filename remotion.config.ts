/**
 * Applies to `npx remotion studio|render|still`. The CLI in scripts/ spawns those
 * commands, so this file is the single place for render settings.
 * All options: https://remotion.dev/docs/config
 */
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
// Three.js needs a real GL backend in headless Chrome; angle uses the GPU on Windows/macOS. GPU-less Linux
// (CI, cloud containers) renders with SwiftShader through ANGLE ("swangle"). REMOTION_GL overrides either.
const gl = process.env.REMOTION_GL ?? (process.platform === "linux" ? "swangle" : "angle");
Config.setChromiumOpenGlRenderer(gl as "angle" | "swangle" | "egl" | "swiftshader" | "vulkan" | "angle-egl");
// WebGL tabs compile many shaders on first frame; under load (or after the machine wakes from sleep)
// the default 30 s can be too short.
Config.setDelayRenderTimeoutInMilliseconds(120000);

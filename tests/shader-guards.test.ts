// Flat-normal guard: the patched chunk keeps three's exact expression for non-degenerate faces and only adds a
// fallback where cross(dFdx, dFdy) is zero (software GL on sliver triangles → NaN → white pixels).
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { guardFlatNormals } from "../src/engine/world/shaderGuards";

describe("shader guards", () => {
  it("patches three's flat-shading normal once and keeps normalize(cross) for real faces", () => {
    const original = "vec3 fdx = dFdx( vViewPosition );\n\tvec3 fdy = dFdy( vViewPosition );\n\tvec3 normal = normalize( cross( fdx, fdy ) );";
    const chunks = { normal_fragment_begin: `#ifdef FLAT_SHADED\n\t${original}\n#endif` };
    expect(guardFlatNormals(chunks)).toBe(true);
    const once = chunks.normal_fragment_begin;
    expect(once).toContain("normalize( flatCross )");
    expect(once).toContain("dot( flatCross, flatCross ) > 0.0");
    expect(guardFlatNormals(chunks)).toBe(true); // idempotent
    expect(chunks.normal_fragment_begin).toBe(once);
  });

  it("is applied to the real three.js chunk when the player loads", async () => {
    await import("../src/engine/world/shaderGuards");
    expect(THREE.ShaderChunk.normal_fragment_begin).toContain("flatCross");
  });
});

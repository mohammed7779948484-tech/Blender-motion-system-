// Shader robustness patches, applied once when the player module loads (before any material compiles).
//
// Flat shading derives a face normal from screen-space derivatives: normalize(cross(dFdx(p), dFdy(p))).
// Software GL (SwiftShader, used on GPU-less Linux) returns zero derivatives on some sliver triangles —
// e.g. the rounded edges of drei's RoundedBox — so the normal becomes NaN and the pixel blows out to white
// (then depth of field smears it into dashes). The guard keeps the exact same expression whenever the cross
// product is non-zero, so every pixel a GPU already shaded correctly is unchanged; only would-be-NaN pixels
// fall back to a normal facing the camera.
import * as THREE from "three";

const FLAT = "vec3 normal = normalize( cross( fdx, fdy ) );";
const GUARDED = "vec3 flatCross = cross( fdx, fdy );\n\tvec3 normal = dot( flatCross, flatCross ) > 0.0 ? normalize( flatCross ) : normalize( vViewPosition );";

export const guardFlatNormals = (chunks: Record<string, string> = THREE.ShaderChunk as unknown as Record<string, string>) => {
  const src = chunks.normal_fragment_begin;
  if (src.includes(FLAT)) chunks.normal_fragment_begin = src.replace(FLAT, GUARDED);
  return chunks.normal_fragment_begin.includes("flatCross");
};

guardFlatNormals();

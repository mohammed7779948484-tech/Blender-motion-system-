// Scene probe: serialises the live three.js scene graph of one frame (transforms, visibility,
// materials, lights) plus, the first time each is seen, geometry and canvas textures.
// The legacy React Three Fiber views stay the single definition of what things look like and how
// channels map to transforms; Blender only receives the sampled result (see docs/ARCHITECTURE.md).
import * as THREE from "three";

export type ProbeObject = {
  id: string;
  parent: string | null;
  name: string;
  type: string;
  vis: boolean;
  p: number[];
  q: number[];
  s: number[];
  geom?: string;
  mat?: string;
  shadow?: [boolean, boolean];
  light?: Record<string, unknown>;
  points?: { size: number };
};

export type ProbeFrame = {
  frame: number;
  objects: ProbeObject[];
  materials: Record<string, Record<string, unknown>>;
  geometries: Record<string, Record<string, unknown>>;
  textures: Record<string, string>;
  unsupported: string[];
};

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const hex = (c: THREE.Color | undefined) => (c ? [r5(c.r), r5(c.g), r5(c.b)] : undefined);

const b64 = (arr: ArrayBufferView) => {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

type Sent = { geoms: Set<string>; tex: Map<string, number> };
const sentOf = (): Sent => {
  const w = window as unknown as { __vfSent?: Sent };
  return (w.__vfSent ??= { geoms: new Set(), tex: new Map() });
};

const attr = (g: THREE.BufferGeometry, name: string, size: number) => {
  const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
  if (!a) return undefined;
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i);
    out[i * size + 1] = a.getY(i);
    if (size > 2) out[i * size + 2] = a.getZ(i);
  }
  return b64(out);
};

const geometryPayload = (g: THREE.BufferGeometry) => {
  const pos = g.getAttribute("position");
  const index = g.getIndex();
  const params = (g as unknown as { parameters?: Record<string, unknown> }).parameters;
  return {
    kind: g.type,
    // Constructor parameters identify a primitive ("BoxGeometry 0.4 0.02 0.3"): the library names meshes by them.
    sig: `${g.type}:${params ? Object.values(params).map((v) => (typeof v === "number" ? r5(v) : typeof v === "object" ? "" : String(v))).join(",") : ""}:${pos?.count ?? 0}`,
    count: pos?.count ?? 0,
    position: attr(g, "position", 3),
    normal: attr(g, "normal", 3),
    uv: attr(g, "uv", 2),
    color: attr(g, "color", 3),
    index: index ? b64(Uint32Array.from(index.array as ArrayLike<number>)) : undefined,
  };
};

const texturePayload = (t: THREE.Texture, out: ProbeFrame, sent: Sent): string | undefined => {
  const img = t.image as HTMLCanvasElement | undefined;
  if (!img || typeof (img as HTMLCanvasElement).toDataURL !== "function") return undefined;
  if (sent.tex.get(t.uuid) !== t.version) {
    sent.tex.set(t.uuid, t.version);
    out.textures[`${t.uuid}@${t.version}`] = img.toDataURL("image/png");
  }
  return `${t.uuid}@${t.version}`;
};

const materialPayload = (m: THREE.Material, out: ProbeFrame, sent: Sent) => {
  const a = m as THREE.MeshStandardMaterial & { uniforms?: Record<string, { value: unknown }> };
  const p: Record<string, unknown> = {
    type: m.type,
    name: m.name,
    color: hex(a.color),
    opacity: r5(m.opacity),
    transparent: m.transparent,
    side: m.side,
    flat: a.flatShading === true,
    vertexColors: m.vertexColors === true,
    toneMapped: m.toneMapped,
    additive: m.blending === THREE.AdditiveBlending,
  };
  if (a.emissive) {
    p.emissive = hex(a.emissive);
    p.emissiveIntensity = r5(a.emissiveIntensity ?? 1);
  }
  if (typeof a.roughness === "number") p.roughness = r5(a.roughness);
  if (typeof a.metalness === "number") p.metalness = r5(a.metalness);
  if (a.map) p.map = texturePayload(a.map, out, sent);
  if (a.emissiveMap) p.emissiveMap = texturePayload(a.emissiveMap, out, sent);
  if (m.type === "ShaderMaterial" || m.type === "RawShaderMaterial") {
    // No general translation for custom shaders: carry a colour uniform if there is one and report it.
    const u = Object.values(a.uniforms ?? {}).find((x) => x.value instanceof THREE.Color);
    if (u) p.color = hex(u.value as THREE.Color);
    out.unsupported.push(`material ${m.type}${m.name ? ` "${m.name}"` : ""}`);
  }
  return p;
};

const lightPayload = (l: THREE.Light) => {
  const p: Record<string, unknown> = { kind: l.type, color: hex(l.color), intensity: r5(l.intensity), shadow: l.castShadow === true };
  const d = l as THREE.SpotLight & THREE.HemisphereLight;
  if (l.type === "HemisphereLight") p.ground = hex(d.groundColor);
  if (l.type === "PointLight" || l.type === "SpotLight") {
    p.distance = r5(d.distance ?? 0);
    p.decay = r5(d.decay ?? 2);
  }
  if (l.type === "SpotLight") {
    p.angle = r5(d.angle);
    p.penumbra = r5(d.penumbra);
  }
  return p;
};

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();

export const sampleScene = (scene: THREE.Scene, frame: number): ProbeFrame => {
  const sent = sentOf();
  const out: ProbeFrame = { frame, objects: [], materials: {}, geometries: {}, textures: {}, unsupported: [] };
  scene.updateMatrixWorld(true);
  const walk = (o: THREE.Object3D, parent: string | null, parentVisible: boolean) => {
    const vis = parentVisible && o.visible;
    const rec: ProbeObject = {
      id: o.uuid,
      parent,
      name: o.name,
      type: o.type,
      vis,
      p: [r5(o.position.x), r5(o.position.y), r5(o.position.z)],
      q: [r5(o.quaternion.x), r5(o.quaternion.y), r5(o.quaternion.z), r5(o.quaternion.w)],
      s: [r5(o.scale.x), r5(o.scale.y), r5(o.scale.z)],
    };
    const mesh = o as THREE.Mesh;
    if ((mesh.isMesh || (o as THREE.Points).isPoints) && mesh.geometry) {
      const g = mesh.geometry;
      rec.geom = g.uuid;
      if (!sent.geoms.has(g.uuid)) {
        sent.geoms.add(g.uuid);
        out.geometries[g.uuid] = geometryPayload(g);
      }
      const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (m) {
        rec.mat = m.uuid;
        if (!out.materials[m.uuid]) out.materials[m.uuid] = materialPayload(m, out, sent);
      }
      rec.shadow = [mesh.castShadow === true, mesh.receiveShadow === true];
      if ((o as THREE.Points).isPoints) rec.points = { size: r5((mesh.material as THREE.PointsMaterial).size ?? 0.02) };
      if ((o as THREE.InstancedMesh).isInstancedMesh) out.unsupported.push(`InstancedMesh "${o.name}"`);
    } else if ((o as THREE.Light).isLight) {
      const l = o as THREE.DirectionalLight;
      rec.light = lightPayload(l);
      if (l.type === "DirectionalLight" || l.type === "SpotLight") {
        // A Blender lamp shines along its local -Z: replace the rotation by "look from position to target".
        l.getWorldPosition(_from);
        l.target.getWorldPosition(_to);
        _m.lookAt(_from, _to, THREE.Object3D.DEFAULT_UP);
        _q.setFromRotationMatrix(_m);
        if (o.parent) _q.premultiply(o.parent.getWorldQuaternion(_pq).invert());
        rec.q = [r5(_q.x), r5(_q.y), r5(_q.z), r5(_q.w)];
      }
    } else if ((o as THREE.Line).isLine) out.unsupported.push(`Line "${o.name}"`);
    out.objects.push(rec);
    for (const c of o.children) walk(c, o.uuid, vis);
  };
  for (const c of scene.children) walk(c, null, true);
  return out;
};

export const sceneExtras = (scene: THREE.Scene) => ({
  background: scene.background instanceof THREE.Color ? hex(scene.background) : undefined,
  fog: scene.fog ? { color: hex((scene.fog as THREE.Fog).color), near: (scene.fog as THREE.Fog).near, far: (scene.fog as THREE.Fog).far } : undefined,
  environmentIntensity: (scene as unknown as { environmentIntensity?: number }).environmentIntensity,
});

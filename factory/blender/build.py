# Builds the shared asset library and per-shot .blend scenes from a scene plan.
#   blender -b --factory-startup --python factory/blender/build.py -- job.json
# job.json: {root, plan_dir, library_dir, shots: [{plan, blend}], library_only?: bool}
#
# Coordinates: the plan is in three.js space (metres, +Y up). Everything hangs under one empty
# ("three_world") rotated +90 degrees about X, so local transforms are copied verbatim and the
# Blender world is Z-up as usual.
import base64, json, math, os, sys, hashlib
import bpy
import numpy as np

JOB = json.load(open(sys.argv[sys.argv.index("--") + 1]))
ROOT = JOB["root"]
PLAN_DIR = JOB["plan_dir"]
LIB_DIR = JOB["library_dir"]
GEOMS = json.load(open(os.path.join(PLAN_DIR, "geoms.json")))
POINT_WATTS = 4 * math.pi * math.pi * JOB.get("point_gain", 1.0)  # three candela -> Blender watts (see docs/research/experiments.md)
REPORT = {"library": {}, "shots": []}
bpy.context.preferences.filepaths.save_version = 0


def f32(b):
    return np.frombuffer(base64.b64decode(b), dtype=np.float32)


def lib_file(kind):
    return os.path.join(LIB_DIR, kind.replace(":", "_") + ".blend")


# ---------------------------------------------------------------- meshes
def make_mesh(name, g, flat=False, points=None):
    pos = f32(g["position"]).reshape(-1, 3).astype(np.float64)
    col = f32(g["color"]).reshape(-1, 3) if g.get("color") else None
    if points is not None:
        # three.Points -> one small octahedron per point (same world size, still one object).
        r = points["size"] / 2
        o = np.array([[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]])
        t = np.array([[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]])
        n = len(pos)
        verts = (pos[:, None, :] + o[None, :, :]).reshape(-1, 3)
        tris = (t[None, :, :] + (np.arange(n) * 6)[:, None, None]).reshape(-1, 3)
        if col is not None:
            col = np.repeat(col, 6, axis=0)
        normals = None
        uv = None
    else:
        verts = pos
        if g.get("index"):
            tris = np.frombuffer(base64.b64decode(g["index"]), dtype=np.uint32).reshape(-1, 3)
        else:
            tris = np.arange(len(pos) - len(pos) % 3, dtype=np.uint32).reshape(-1, 3)
        normals = f32(g["normal"]).reshape(-1, 3) if g.get("normal") and not flat else None
        uv = f32(g["uv"]).reshape(-1, 2) if g.get("uv") else None
    # Drop degenerate triangles (three tolerates them, Blender's mesh validation would shuffle loops).
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    keep = np.linalg.norm(np.cross(b - a, c - a), axis=1) > 1e-12
    keep &= (tris[:, 0] != tris[:, 1]) & (tris[:, 1] != tris[:, 2]) & (tris[:, 0] != tris[:, 2])
    tris = tris[keep]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    me.loops.add(len(tris) * 3)
    me.loops.foreach_set("vertex_index", tris.astype(np.int32).ravel())
    me.polygons.add(len(tris))
    me.polygons.foreach_set("loop_start", np.arange(0, len(tris) * 3, 3, dtype=np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(tris), 3, dtype=np.int32))
    me.update(calc_edges=True)
    loop_v = tris.ravel()
    if uv is not None and len(tris):
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", uv[loop_v].astype(np.float32).ravel())
    if col is not None and len(verts):
        attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
        attr.data.foreach_set("color", np.concatenate([col, np.ones((len(col), 1), dtype=np.float32)], axis=1).ravel())
    me.polygons.foreach_set("use_smooth", np.full(len(tris), not flat and points is None, dtype=bool))
    if normals is not None and len(tris):
        try:
            me.normals_split_custom_set_from_vertices(normals.tolist())
        except Exception:
            pass
    me.materials.append(None)  # one slot, filled per object (slot link = OBJECT), so linked meshes stay shareable
    me.update()
    return me


def mesh_name(o, mats):
    flat = bool(mats.get(o.get("mat"), {}).get("flat"))
    return f"{o['kind']}/{o['geom']}{'-flat' if flat else ''}", flat


# ---------------------------------------------------------------- materials
def image_for(sha_or_list, shot, tag):
    """A still image, or an image sequence (one hard-linked file per frame of the shot)."""
    tex = os.path.join(PLAN_DIR, "tex")
    if isinstance(sha_or_list, str):
        img = bpy.data.images.load(os.path.join(tex, sha_or_list + ".png"), check_existing=True)
        return img, False
    seq = os.path.join(PLAN_DIR, "texseq", shot["name"], tag)
    os.makedirs(seq, exist_ok=True)
    for i, s in enumerate(sha_or_list):
        dst = os.path.join(seq, f"t{shot['start'] + i:05d}.png")
        if s and not os.path.exists(dst):
            os.link(os.path.join(tex, s + ".png"), dst)
    img = bpy.data.images.load(os.path.join(seq, f"t{shot['start']:05d}.png"))
    img.source = "SEQUENCE"
    return img, True


def make_material(name, m, shot=None, tag="m"):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (400, 0)
    color = list(m.get("color") or [1, 1, 1]) + [1]
    unlit = m.get("type") in ("MeshBasicMaterial", "PointsMaterial", "ShaderMaterial", "RawShaderMaterial", "SpriteMaterial")
    if unlit:
        sh = nt.nodes.new("ShaderNodeEmission")
        sh.name = "Shader"
        csock = sh.inputs["Color"]
        sh.inputs["Strength"].default_value = 1.0
    else:
        sh = nt.nodes.new("ShaderNodeBsdfPrincipled")
        sh.name = "Shader"
        csock = sh.inputs["Base Color"]
        sh.inputs["Roughness"].default_value = m.get("roughness", 1.0)
        sh.inputs["Metallic"].default_value = m.get("metalness", 0.0)
        if m.get("emissive"):
            sh.inputs["Emission Color"].default_value = list(m["emissive"]) + [1]
            sh.inputs["Emission Strength"].default_value = m.get("emissiveIntensity", 1.0)
    csock.default_value = color
    surface = sh.outputs[0]
    src = None
    for prop, target in (("map", csock), ("emissiveMap", None if unlit else sh.inputs["Emission Color"])):
        if not m.get(prop) or target is None or shot is None:
            continue
        img, seq = image_for(m[prop], shot, f"{tag}-{prop}")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.name = "Tex-" + prop
        tex.image = img
        tex.location = (-500, 0 if prop == "map" else -300)
        if seq:
            tex.image_user.frame_start = 0
            tex.image_user.frame_offset = -1
            tex.image_user.frame_duration = 100000
            tex.image_user.use_auto_refresh = True
        src = tex.outputs["Color"]
        if prop == "map" and any(abs(c - 1) > 1e-4 for c in color[:3]):
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            nt.links.new(src, mix.inputs[6])
            mix.inputs[7].default_value = color
            src = mix.outputs[2]
        nt.links.new(src, target)
    if m.get("vertexColors"):
        att = nt.nodes.new("ShaderNodeVertexColor")
        att.layer_name = "Col"
        att.location = (-300, 200)
        nt.links.new(att.outputs["Color"], csock)
    opacity = m.get("opacity", 1.0)
    animated_alpha = "opacity" in (m.get("anim") or {})
    if m.get("transparent") and (opacity < 1 or animated_alpha or m.get("additive")):
        if unlit:
            tr = nt.nodes.new("ShaderNodeBsdfTransparent")
            mixs = nt.nodes.new("ShaderNodeMixShader")
            mixs.name = "AlphaMix"
            mixs.inputs[0].default_value = opacity
            nt.links.new(tr.outputs[0], mixs.inputs[1])
            if m.get("additive"):
                add = nt.nodes.new("ShaderNodeAddShader")
                nt.links.new(tr.outputs[0], add.inputs[0])
                nt.links.new(sh.outputs[0], add.inputs[1])
                nt.links.new(add.outputs[0], mixs.inputs[2])
            else:
                nt.links.new(sh.outputs[0], mixs.inputs[2])
            surface = mixs.outputs[0]
        else:
            sh.inputs["Alpha"].default_value = opacity
        mat.surface_render_method = "BLENDED"
    nt.links.new(surface, out.inputs["Surface"])
    mat.use_backface_culling = m.get("side", 0) == 0
    mat.diffuse_color = color[:3] + [opacity]
    mat.roughness = m.get("roughness", 1.0)
    return mat


def animate_material(mat, m, shot):
    anim = m.get("anim") or {}
    if not anim:
        return
    sh = mat.node_tree.nodes["Shader"]
    n = shot["end"] - shot["start"]
    frames = np.arange(shot["start"], shot["end"])
    unlit = sh.bl_idname == "ShaderNodeEmission"

    def key(sock, vals, width):
        v = np.array(vals, dtype=np.float64).reshape(n, width)
        for i in rdp(frames, v, 2e-3):
            sock.default_value = list(v[i]) + [1] if width == 3 else float(v[i][0])
            sock.keyframe_insert("default_value", frame=int(frames[i]))

    if "color" in anim:
        key(sh.inputs["Color" if unlit else "Base Color"], anim["color"], 3)
    if not unlit and "emissive" in anim:
        key(sh.inputs["Emission Color"], anim["emissive"], 3)
    if not unlit and "emissiveIntensity" in anim:
        key(sh.inputs["Emission Strength"], anim["emissiveIntensity"], 1)
    if "opacity" in anim:
        node = mat.node_tree.nodes.get("AlphaMix")
        key(node.inputs[0] if node else sh.inputs["Alpha"], anim["opacity"], 1)


# ---------------------------------------------------------------- animation
def rdp(frames, values, eps):
    """Indices of the keys to keep so linear interpolation stays within eps of every sample."""
    n = len(frames)
    if n <= 2:
        return list(range(n))
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        t = ((frames[a + 1:b] - frames[a]) / (frames[b] - frames[a]))[:, None]
        err = np.abs(values[a + 1:b] - (values[a] + (values[b] - values[a]) * t)).max(axis=1)
        k = int(err.argmax())
        if err[k] > eps:
            i = a + 1 + k
            keep[i] = True
            stack.append((a, i))
            stack.append((i, b))
    return np.nonzero(keep)[0].tolist()


def channelbag(idblock, name):
    act = bpy.data.actions.new(name)
    ad = idblock.animation_data_create()
    ad.action = act
    slot = act.slots.new(id_type=idblock.id_type, name=name)
    ad.action_slot = slot
    layer = act.layers.new("Layer")
    strip = layer.strips.new(type="KEYFRAME")
    return strip.channelbag(slot, ensure=True)


def set_curve(cb, path, index, frames, vals, constant=False, group=None):
    fc = cb.fcurves.new(path, index=index) if group is None else cb.fcurves.new(path, index=index, group_name=group)
    fc.keyframe_points.add(len(frames))
    co = np.empty(len(frames) * 2, dtype=np.float32)
    co[0::2] = frames
    co[1::2] = vals
    fc.keyframe_points.foreach_set("co", co)
    fc.keyframe_points.foreach_set("interpolation", np.full(len(frames), 0 if constant else 1, dtype=np.int32))
    fc.update()


def animate_object(ob, o, shot):
    n = shot["end"] - shot["start"]
    frames = np.arange(shot["start"], shot["end"], dtype=np.float64)
    cb = None
    specs = (("P", "location", 3, 5e-4, None), ("Q", "rotation_quaternion", 4, 4e-4, [3, 0, 1, 2]), ("S", "scale", 3, 5e-4, None))
    for key, path, width, eps, order in specs:
        v = o[key]
        if len(v) == width:
            continue
        arr = np.array(v, dtype=np.float64).reshape(n, width)
        if order:
            arr = arr[:, order]
        keep = rdp(frames, arr, eps)
        cb = cb or channelbag(ob, ob.name)
        for i in range(width):
            set_curve(cb, path, i, frames[keep], arr[keep, i], group="Transform")
    vis = o["V"]
    if isinstance(vis, list):
        hid = 1 - np.array(vis)
        keep = [0] + [i for i in range(1, n) if hid[i] != hid[i - 1]]
        cb = cb or channelbag(ob, ob.name)
        for path in ("hide_render", "hide_viewport"):
            set_curve(cb, path, 0, frames[keep], hid[keep], constant=True)
    elif not vis:
        ob.hide_render = True
        ob.hide_viewport = True


def first(v, width):
    return v[:width]


def place(ob, o):
    ob.rotation_mode = "QUATERNION"
    ob.location = first(o["P"], 3)
    q = first(o["Q"], 4)
    ob.rotation_quaternion = (q[3], q[0], q[1], q[2])
    ob.scale = first(o["S"], 3)


# ---------------------------------------------------------------- library
def needed(shots):
    """kind -> {"meshes": {name: (geomKey, flat, points)}, "materials": {name: spec}, "sample": shot}"""
    need = {}
    for shot in shots:
        mats = shot["materials"]
        for o in shot["objects"]:
            if not o.get("geom"):
                continue
            k = need.setdefault(o["kind"], {"meshes": {}, "materials": {}, "sample": shot})
            name, flat = mesh_name(o, mats)
            k["meshes"].setdefault(name, (o["geom"], flat, o.get("points")))
            m = mats.get(o.get("mat"))
            if m and m.get("lib"):
                k["materials"].setdefault(m["lib"], m)
    return need


def sync_library(shots):
    """Create library files that do not exist; add datablocks that are missing. Existing ones are never modified."""
    for kind, k in needed(shots).items():
        path = lib_file(kind)
        new = not os.path.exists(path)
        if new:
            bpy.ops.wm.read_factory_settings(use_empty=True)
        else:
            bpy.ops.wm.open_mainfile(filepath=path)
        added = []
        for name, (gk, flat, points) in k["meshes"].items():
            if name not in bpy.data.meshes:
                make_mesh(name, GEOMS[gk], flat, points).use_fake_user = True
                added.append(name)
        for name, m in k["materials"].items():
            if name not in bpy.data.materials:
                mat = make_material(name, m)
                mat.use_fake_user = True
                mat.asset_mark()
                added.append(name)
        if new:
            # A viewable copy of the asset as it stands in the first shot that uses it (for editing in context).
            shot = k["sample"]
            scene = bpy.data.scenes[0] if bpy.data.scenes else bpy.data.scenes.new("Scene")
            scene.name = kind
            build_objects(scene, shot, only_kind=kind, animate=False, local=True)
            scene.unit_settings.system = "METRIC"
        if added or new:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            bpy.context.preferences.filepaths.save_version = 0
            bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
        REPORT["library"][kind] = {"file": os.path.relpath(path, ROOT), "created": new, "added": added, "meshes": len(k["meshes"]), "materials": len(k["materials"])}


def link_library(shots):
    for kind, k in needed(shots).items():
        path = lib_file(kind)
        with bpy.data.libraries.load(path, link=True, relative=False) as (src, dst):
            dst.meshes = [n for n in k["meshes"] if n in src.meshes and n not in bpy.data.meshes]
            dst.materials = [n for n in k["materials"] if n in src.materials and n not in bpy.data.materials]


# ---------------------------------------------------------------- scene objects
def collection_for(scene, name, cache):
    if name not in cache:
        c = bpy.data.collections.new(name)
        scene.collection.children.link(c)
        cache[name] = c
    return cache[name]


def build_objects(scene, shot, only_kind=None, animate=True, local=False):
    mats = shot["materials"]
    cols = {}
    world = bpy.data.objects.new("three_world", None)
    world.rotation_euler = (math.pi / 2, 0, 0)
    world.empty_display_size = 0.2
    scene.collection.objects.link(world)
    objs = [o for o in shot["objects"] if only_kind is None or o["kind"] == only_kind]
    ids = {}
    for o in objs:
        ids.setdefault(o["id"], []).append(o)
    made = {}
    matcache = {}
    counts = {}
    for o in objs:
        data = None
        if o.get("geom"):
            name, flat = mesh_name(o, mats)
            data = bpy.data.meshes.get(name) or make_mesh(name, GEOMS[o["geom"]], flat, o.get("points"))
        elif o.get("light"):
            L = o["light"]
            kind = {"DirectionalLight": "SUN", "PointLight": "POINT", "SpotLight": "SPOT"}.get(L["kind"])
            if kind and not local:
                data = bpy.data.lights.new(o["name"] or L["kind"], kind)
                col = first(L["color"], 3)
                inten = L["intensity"] if not isinstance(L["intensity"], list) else L["intensity"][0]
                data.color = col
                gain = 1.0 if kind == "SUN" else POINT_WATTS
                data.energy = inten * gain
                data.use_shadow = bool(L.get("shadow"))
                if kind == "SUN":
                    data.angle = math.radians(1.5)
                else:
                    data.shadow_soft_size = 0.04
                    if L.get("distance"):
                        data.use_custom_distance = True
                        data.cutoff_distance = L["distance"]
                if kind == "SPOT":
                    data.spot_size = min(math.pi, 2 * L.get("angle", 0.5))
                    data.spot_blend = L.get("penumbra", 0)
                if animate:
                    n = shot["end"] - shot["start"]
                    frames = np.arange(shot["start"], shot["end"], dtype=np.float64)
                    cb = None
                    if isinstance(L["intensity"], list):
                        v = np.array(L["intensity"], dtype=np.float64)[:, None] * gain
                        keep = rdp(frames, v, 1e-3 * gain)
                        cb = cb or channelbag(data, data.name)
                        set_curve(cb, "energy", 0, frames[keep], v[keep, 0])
                    if len(L["color"]) > 3:
                        v = np.array(L["color"], dtype=np.float64).reshape(n, 3)
                        keep = rdp(frames, v, 2e-3)
                        cb = cb or channelbag(data, data.name)
                        for i in range(3):
                            set_curve(cb, "color", i, frames[keep], v[keep, i])
        label = o["name"] or (o.get("geom") or o["type"]).split("-")[0].lower()
        base = f"{o['asset'].split(':')[-1]}.{label}" if o["asset"] != "scene" and not label.startswith(("actor:", "set:")) else label
        counts[base] = counts.get(base, 0) + 1
        ob = bpy.data.objects.new(base if counts[base] == 1 else f"{base}.{counts[base]:03d}", data)
        ob["vf_id"] = o["key"]
        if data is None:
            ob.empty_display_size = 0.03
        collection_for(scene, o["asset"] if not o.get("light") else "lights", cols).objects.link(ob)
        place(ob, o)
        if o.get("geom"):
            mk = o.get("mat")
            m = mats.get(mk)
            if m:
                if mk not in matcache:
                    lib = m.get("lib")
                    mat = bpy.data.materials.get(lib) if lib else None
                    if mat is None:
                        mat = make_material(lib or f"{o['kind']}/local-{len(matcache):03d}", m, shot, tag=f"m{len(matcache):03d}")
                        if animate:
                            animate_material(mat, m, shot)
                    matcache[mk] = mat
                # Material on the object slot: the linked mesh stays untouched and shareable.
                if len(ob.material_slots):
                    ob.material_slots[0].link = "OBJECT"
                    ob.material_slots[0].material = matcache[mk]
            sh = o.get("shadow") or [True, True]
            ob.visible_shadow = bool(sh[0]) and not (m or {}).get("transparent", False) and (m or {}).get("type") != "MeshBasicMaterial"
        if animate:
            animate_object(ob, o, shot)
        made[o["key"]] = ob
    for o in objs:
        ob = made[o["key"]]
        parents = ids.get(o["parent"]) if o["parent"] else None
        ob.parent = made[parents[0]["key"]] if parents else world
    return made


def build_world(scene, shot):
    w = bpy.data.worlds.new("mood")
    scene.world = w
    nt = w.node_tree
    nt.nodes.clear()
    n = shot["end"] - shot["start"]
    frames = np.arange(shot["start"], shot["end"], dtype=np.float64)
    amb = np.zeros((n, 3))
    sky = np.zeros((n, 3))
    ground = np.zeros((n, 3))
    for o in shot["objects"]:
        L = o.get("light")
        if not L or L["kind"] not in ("AmbientLight", "HemisphereLight"):
            continue
        col = np.array(L["color"], dtype=np.float64).reshape(-1, 3)
        inten = np.array(L["intensity"] if isinstance(L["intensity"], list) else [L["intensity"]], dtype=np.float64)[:, None]
        if L["kind"] == "AmbientLight":
            amb += col * inten / math.pi
        else:
            sky += col * inten / math.pi
            ground += np.array(L["ground"], dtype=np.float64)[None, :] * inten / math.pi
    bg = np.array(shot["background"], dtype=np.float64).reshape(-1, 3)
    bg = np.repeat(bg, n, axis=0) if len(bg) == 1 else bg

    def rgb(name, vals, y):
        node = nt.nodes.new("ShaderNodeRGB")
        node.name = node.label = name
        node.location = (-600, y)
        node.outputs[0].default_value = list(vals[0]) + [1]
        if np.abs(vals - vals[0]).max() > 1e-4:
            for i in rdp(frames, vals, 2e-3):
                node.outputs[0].default_value = list(vals[i]) + [1]
                node.outputs[0].keyframe_insert("default_value", frame=int(frames[i]))
        return node.outputs[0]

    a, s, g, b = rgb("Ambient", amb, 300), rgb("HemisphereSky", sky, 100), rgb("HemisphereGround", ground, -100), rgb("Background", bg, -300)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs[1].default_value = -1
    ramp.inputs[2].default_value = 1
    nt.links.new(sep.outputs["Z"], ramp.inputs[0])
    hemi = nt.nodes.new("ShaderNodeMix")
    hemi.data_type = "RGBA"
    nt.links.new(ramp.outputs[0], hemi.inputs[0])
    nt.links.new(g, hemi.inputs[6])
    nt.links.new(s, hemi.inputs[7])
    add = nt.nodes.new("ShaderNodeMix")
    add.data_type = "RGBA"
    add.blend_type = "ADD"
    add.inputs[0].default_value = 1
    nt.links.new(a, add.inputs[6])
    nt.links.new(hemi.outputs[2], add.inputs[7])
    lp = nt.nodes.new("ShaderNodeLightPath")
    pick = nt.nodes.new("ShaderNodeMix")
    pick.data_type = "RGBA"
    nt.links.new(lp.outputs["Is Camera Ray"], pick.inputs[0])
    nt.links.new(add.outputs[2], pick.inputs[6])
    nt.links.new(b, pick.inputs[7])
    bgn = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(pick.outputs[2], bgn.inputs["Color"])
    nt.links.new(bgn.outputs[0], out.inputs["Surface"])


def build_camera(scene, shot, world):
    cam = bpy.data.cameras.new("camera")
    ob = bpy.data.objects.new("camera", cam)
    scene.collection.objects.link(ob)
    ob.parent = world
    scene.camera = ob
    c = shot["camera"]
    n = shot["end"] - shot["start"]
    frames = np.arange(shot["start"], shot["end"], dtype=np.float64)
    cam.sensor_fit = "VERTICAL"
    cam.sensor_height = 24
    cam.clip_start = 0.03
    cam.clip_end = 200
    lens = 12 / np.tan(np.radians(np.array(c["fov"], dtype=np.float64)) / 2)
    cam.lens = float(lens[0])
    o = {"P": c["P"], "Q": c["Q"], "S": [1, 1, 1], "V": 1}
    # hemisphere-continuous quaternions
    q = np.array(c["Q"], dtype=np.float64).reshape(n, 4)
    for i in range(1, n):
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]
    o["Q"] = q.ravel().tolist()
    if n == 1 or (np.abs(q - q[0]).max() < 1e-6 and np.abs(np.array(c["P"]).reshape(n, 3) - np.array(c["P"][:3])).max() < 1e-6):
        o["P"], o["Q"] = c["P"][:3], q[0].tolist()
    place(ob, o)
    animate_object(ob, o, shot)
    focus = np.array(c["focus"], dtype=np.float64).reshape(n, 2)
    cb = None
    if np.abs(lens - lens[0]).max() > 1e-3:
        keep = rdp(frames, lens[:, None], 1e-2)
        cb = cb or channelbag(cam, "camera-lens")
        set_curve(cb, "lens", 0, frames[keep], lens[keep])
    if focus[:, 1].max() > 0:
        cam.dof.use_dof = True
        cam.dof.focus_distance = float(focus[0, 0]) or 10
        # three's bokeh scale has no physical unit; this mapping matched the legacy blur by eye (experiments.md).
        cam.dof.aperture_fstop = float(max(1.4, 9.0 / max(0.5, focus[:, 1].max())))
        if np.abs(focus[:, 0] - focus[0, 0]).max() > 1e-3:
            keep = rdp(frames, focus[:, :1], 5e-3)
            cb = cb or channelbag(cam, "camera-lens")
            set_curve(cb, "dof.focus_distance", 0, frames[keep], focus[keep, 0])
    return ob


def scene_settings(scene, shot):
    r = scene.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x, r.resolution_y, r.resolution_percentage = shot["width"], shot["height"], 100
    r.fps = shot["fps"]
    scene.frame_start, scene.frame_end = shot["start"], shot["end"] - 1
    scene.frame_set(shot["start"])
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    r.filepath = "//render/f#####"
    r.film_transparent = False
    scene.eevee.taa_render_samples = 16
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB"
    scene.unit_settings.system = "METRIC"
    scene["vf_shot"] = shot["name"]
    scene["vf_frames"] = [shot["start"], shot["end"]]


def build_shot(entry):
    shot = json.load(open(entry["plan"]))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.data.scenes[0] if bpy.data.scenes else bpy.data.scenes.new("Scene")
    scene.name = shot["name"]
    link_library([shot])
    made = build_objects(scene, shot)
    world = bpy.data.objects["three_world"]
    build_world(scene, shot)
    build_camera(scene, shot, world)
    scene_settings(scene, shot)
    os.makedirs(os.path.dirname(entry["blend"]), exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=entry["blend"], compress=True, relative_remap=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile()
    linked = sorted({bpy.path.abspath(l.filepath) for l in bpy.data.libraries})
    REPORT["shots"].append({"name": shot["name"], "blend": os.path.relpath(entry["blend"], ROOT), "objects": len(made), "libraries": [os.path.relpath(p, ROOT) for p in linked],
                            "local_meshes": sum(1 for m in bpy.data.meshes if m.library is None), "linked_meshes": sum(1 for m in bpy.data.meshes if m.library is not None)})


all_shots = [json.load(open(e["plan"])) for e in JOB["shots"]]
sync_library(all_shots)
if not JOB.get("library_only"):
    for e in JOB["shots"]:
        build_shot(e)
json.dump(REPORT, open(JOB["report"], "w"), indent=1)

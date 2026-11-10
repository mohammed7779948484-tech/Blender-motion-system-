# Fingerprint of the library datablocks a shot scene actually uses (linked meshes and materials).
#   blender -b <shot>.blend --python factory/blender/fingerprint.py -- out.json
# The render cache keys on this instead of the library files' bytes, so adding assets for another
# video to a library file does not invalidate renders that never see them.
import hashlib, json, sys
import bpy
import numpy as np

h = hashlib.sha1()


def arr(seq, attr, n, dtype=np.float32):
    a = np.empty(len(seq) * n, dtype=dtype)
    if len(seq):
        seq.foreach_get(attr, a)
    return np.round(a, 5).tobytes() if dtype == np.float32 else a.tobytes()


def value(v):
    try:
        return [round(float(x), 5) for x in v]
    except TypeError:
        return round(float(v), 5) if isinstance(v, (int, float)) else str(v)


used_meshes = sorted({o.data.name for o in bpy.data.objects if o.type == "MESH" and o.data.library})
used_mats = sorted({s.material.name for o in bpy.data.objects for s in o.material_slots if s.material and s.material.library})
for name in used_meshes:
    me = bpy.data.meshes[name]
    h.update(name.encode())
    h.update(arr(me.vertices, "co", 3))
    h.update(arr(me.loops, "vertex_index", 1, np.int32))
    h.update(arr(me.polygons, "use_smooth", 1, np.bool_))
    for uv in me.uv_layers:
        h.update(arr(uv.data, "uv", 2))
    for ca in me.color_attributes:
        h.update(arr(ca.data, "color", 4))
for name in used_mats:
    m = bpy.data.materials[name]
    spec = {"name": name, "blend": m.surface_render_method, "cull": m.use_backface_culling, "nodes": [], "links": []}
    if m.node_tree:
        for n in sorted(m.node_tree.nodes, key=lambda n: n.name):
            ins = {i.identifier: value(i.default_value) for i in n.inputs if hasattr(i, "default_value") and not i.is_linked}
            outs = {o.identifier: value(o.default_value) for o in n.outputs if hasattr(o, "default_value")}
            img = getattr(n, "image", None)
            spec["nodes"].append([n.name, n.bl_idname, ins, outs, img.filepath if img else "", getattr(n, "blend_type", ""), getattr(n, "layer_name", "")])
        spec["links"] = sorted([l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier] for l in m.node_tree.links)
    h.update(json.dumps(spec, sort_keys=True).encode())
json.dump({"fingerprint": h.hexdigest(), "meshes": len(used_meshes), "materials": len(used_mats)}, open(sys.argv[sys.argv.index("--") + 1], "w"))

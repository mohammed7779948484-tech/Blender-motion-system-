# Renders the frame range of one shot scene.
#   blender -b <shot>.blend --python factory/blender/render.py -- job.json
# job.json: {out_dir, profile: {engine, percent, samples, dof, shadows}, frames?: [first, last]}
# Frames are written as f#####.png; existing files are kept (an interrupted render resumes).
import json, os, sys, time
import bpy

job = json.load(open(sys.argv[sys.argv.index("--") + 1]))
p = job["profile"]
s = bpy.context.scene
r = s.render
r.engine = p.get("engine", "BLENDER_EEVEE")
r.resolution_percentage = int(p.get("percent", 100))
if r.engine == "BLENDER_EEVEE":
    s.eevee.taa_render_samples = int(p.get("samples", 16))
    if hasattr(s.eevee, "use_raytracing"):
        s.eevee.use_raytracing = bool(p.get("raytracing", False))
    if hasattr(s.eevee, "use_shadows"):
        s.eevee.use_shadows = bool(p.get("shadows", True))
elif r.engine == "CYCLES":
    s.cycles.samples = int(p.get("samples", 16))
    s.cycles.use_denoising = True
    s.cycles.device = "CPU"
if not p.get("dof", True) and s.camera:
    s.camera.data.dof.use_dof = False
if job.get("frames"):
    s.frame_start, s.frame_end = job["frames"]
os.makedirs(job["out_dir"], exist_ok=True)
r.filepath = os.path.join(job["out_dir"], "f#####")
r.image_settings.file_format = "PNG"
r.image_settings.color_mode = "RGB"
r.image_settings.compression = 15
r.use_overwrite = False
t = time.time()
bpy.ops.render.render(animation=True)
n = s.frame_end - s.frame_start + 1
print(f"VF_RENDER frames={n} seconds={time.time() - t:.2f}")

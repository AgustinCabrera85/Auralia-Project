"""Run with Blender 5.2 --factory-startup --background --python scripts/generate-cliff-lod.py.

Creates a texture-free visual LOD; the game reuses the original GLB material.
The high-resolution source and its separate collision shell remain untouched.
"""
from pathlib import Path
import bpy

project = Path(__file__).resolve().parents[1]
source = project / "public/assets/world/cliffs/Acantilado_2_closed.glb"
target = project / "public/assets/world/cliffs/Acantilado_2_lod.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))

visual = next(obj for obj in bpy.data.objects if obj.type == "MESH" and
              obj.name.startswith("tripo_node_"))
for obj in list(bpy.data.objects):
    if obj != visual:
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.object.select_all(action="DESELECT")
visual.select_set(True)
bpy.context.view_layer.objects.active = visual
before = len(visual.data.polygons)
modifier = visual.modifiers.new("Distant cliff silhouette", "DECIMATE")
modifier.ratio = .11
bpy.ops.object.modifier_apply(modifier=modifier.name)
after = len(visual.data.polygons)
visual.name = "cliff_lod_visual"
visual.data.materials.clear()
bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB",
                          use_selection=True)
print(f"Cliff LOD: {before} -> {after} triangles, {target}")

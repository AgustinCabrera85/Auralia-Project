"""Run with Blender 5.2 --factory-startup --background --python scripts/generate-tree-lods.py.

Creates texture-free visual LODs with UVs. Runtime shares each original tree material.
"""
from pathlib import Path
import bpy

project = Path(__file__).resolve().parents[1]
trees = (
    ("public/assets/vegetation/Arbolito_1.glb", 800),
    ("public/assets/vegetation/Arbolito_2.glb", 900),
    ("public/assets/vegetation/Arbolito_3.glb", 1800),
    ("public/assets/world/vegetation/Arbolito_sin_hojas.glb", 600),
)

for relative, target_faces in trees:
    source = project / relative
    target = source.with_name(source.stem + "_lod.glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    visual = max((obj for obj in bpy.data.objects if obj.type == "MESH"),
                 key=lambda obj: len(obj.data.polygons))
    for obj in list(bpy.data.objects):
        if obj != visual:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    visual.select_set(True)
    bpy.context.view_layer.objects.active = visual
    before = len(visual.data.polygons)
    modifier = visual.modifiers.new("Distant tree", "DECIMATE")
    modifier.ratio = min(1, target_faces / before)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    after = len(visual.data.polygons)
    visual.name = source.stem + "_lod_visual"
    visual.data.materials.clear()
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB",
                              use_selection=True)
    print(f"Tree LOD: {source.name} {before} -> {after} triangles, {target}")

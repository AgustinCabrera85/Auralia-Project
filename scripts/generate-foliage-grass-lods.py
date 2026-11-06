"""Build distant V4 ground-cover LODs from whole connected leaf/blade islands.

Run with Blender 5.2 in background mode. Imported material slots and embedded
textures are retained; no triangles are cut through the middle of a blade.
"""

import argparse
import bpy
import bmesh
import hashlib
import sys
from pathlib import Path


SOURCE_NAMES = (
    "Grass_01_Short", "Grass_02_Tall", "Grass_03_Golden",
    "Meadow_01_Pink", "Meadow_02_Blue", "Meadow_03_Mixed",
)


def face_islands(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    unseen = set(bm.faces)
    islands = []
    while unseen:
        start = unseen.pop()
        group = {start}
        stack = [start]
        while stack:
            face = stack.pop()
            for vertex in face.verts:
                for neighbor in vertex.link_faces:
                    if neighbor in unseen:
                        unseen.remove(neighbor)
                        group.add(neighbor)
                        stack.append(neighbor)
        islands.append(group)
    return bm, islands


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    root = Path(__file__).resolve().parent.parent
    assets = root / "public" / "assets" / "foliage-v4"
    for name in SOURCE_NAMES:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
            for block in tuple(collection):
                if block.users == 0:
                    collection.remove(block)
        bpy.ops.import_scene.gltf(filepath=str(assets / f"{name}.glb"))
        meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
        if len(meshes) != 1:
            raise RuntimeError(f"{name}: expected one mesh, got {len(meshes)}")
        obj = meshes[0]
        bm, islands = face_islands(obj.data)
        sizes = sorted((len(group) for group in islands), reverse=True)
        print(f"{name}: {len(sizes)} islands, {sum(sizes)} faces, largest={sizes[:8]}")
        if args.inspect:
            bm.free()
            continue
        removed = []
        kept_faces = 0
        for group in islands:
            coordinates = sorted(tuple(vertex.co) for vertex in
                {vertex for face in group for vertex in face.verts})
            center = [sum(point[axis] for point in coordinates) / len(coordinates)
                for axis in range(3)]
            key = f"{name}:{center[0]:.4f}:{center[1]:.4f}:{center[2]:.4f}".encode()
            score = int.from_bytes(hashlib.blake2b(key, digest_size=8).digest(), "little") / 2**64
            keep_rate = .40 if name.startswith("Meadow") and len(group) >= 8 else .20
            if score < keep_rate:
                kept_faces += len(group)
            else:
                removed.extend(group)
        bmesh.ops.delete(bm, geom=removed, context="FACES")
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        output = assets / f"{name}_LOD1.glb"
        bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB",
            use_selection=True, export_materials="EXPORT")
        print(f"{name}: kept {kept_faces}/{sum(sizes)} faces -> {output.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

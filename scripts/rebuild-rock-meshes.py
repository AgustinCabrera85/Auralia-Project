"""Rebuild open rock scans as closed volumes, retaining their baked color UVs.

Run with Blender 5: blender --factory-startup --background --python scripts/rebuild-rock-meshes.py
The source GLBs are references only. Runtime loads the resulting closed meshes.
"""

from pathlib import Path
import bmesh
import bpy
import sys


ROOT = Path(__file__).resolve().parents[1] / 'public/assets/world'
ASSETS = (
    ('cliffs/Acantilado_2.glb', 'cliffs/Acantilado_2_closed.glb', 0.012),
    ('rocks/Formacion_rocosa_1.glb', 'rocks/Formacion_rocosa_1_closed.glb', 0.03),
    ('rocks/Escalon_rocoso.glb', 'rocks/Escalon_rocoso_closed.glb', 0.035),
    ('rocks/Meseta_rocosa_pasto.glb', 'rocks/Meseta_rocosa_pasto_closed.glb', 0.035),
    ('rocks/Set_Rocas_Rectanculares_Piezas_1K.glb',
     'rocks/Set_Rocas_Rectanculares_Piezas_1K_closed.glb', None),
    ('rocks/Pack_rocas_1.glb', 'rocks/Pack_rocas_1_closed.glb', None),
)


def bounds(mesh):
    return [(min(vertex.co[axis] for vertex in mesh.vertices),
             max(vertex.co[axis] for vertex in mesh.vertices)) for axis in range(3)]


def rebuild(original, voxel_size):
    source_bounds = bounds(original.data)
    rebuilt = original.copy()
    rebuilt.data = original.data.copy()
    bpy.context.collection.objects.link(rebuilt)
    bpy.ops.object.select_all(action='DESELECT')
    rebuilt.select_set(True)
    bpy.context.view_layer.objects.active = rebuilt
    if voxel_size is None:
        # Fragmented scans become one solid boulder, column or ledge. A voxel
        # remesh would merely close every detached shard and leave open space
        # between them, which looks like a transparent lattice in the game.
        hull = bmesh.new()
        for vertex in original.data.vertices:
            hull.verts.new(vertex.co)
        hull.verts.ensure_lookup_table()
        bmesh.ops.convex_hull(hull, input=list(hull.verts), use_existing_faces=False)
        loose = [vertex for vertex in hull.verts if not vertex.link_faces]
        bmesh.ops.delete(hull, geom=loose, context='VERTS')
        hull.to_mesh(rebuilt.data)
        hull.free()
    else:
        rebuilt.data.remesh_voxel_size = voxel_size
        bpy.ops.object.voxel_remesh()

    # The voxel grid rounds the silhouette outward. Restore exact dimensions so
    # all existing world placements and catalogued rock footprints remain valid.
    voxel_bounds = bounds(rebuilt.data)
    for vertex in rebuilt.data.vertices:
        for axis in range(3):
            low, high = source_bounds[axis]
            voxel_low, voxel_high = voxel_bounds[axis]
            vertex.co[axis] = low + (vertex.co[axis] - voxel_low) * (
                high - low) / (voxel_high - voxel_low)

    # The source material already contains baked color. Project its UVs onto the
    # new surface so rock cracks, moss and grass survive without source triangles.
    if not rebuilt.data.uv_layers:
        rebuilt.data.uv_layers.new(name='UVMap')
    transfer = rebuilt.modifiers.new('Project baked color UV', 'DATA_TRANSFER')
    transfer.object = original
    transfer.use_loop_data = True
    transfer.data_types_loops = {'UV'}
    transfer.loop_mapping = 'POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    rebuilt.data.update()

    check = bmesh.new()
    check.from_mesh(rebuilt.data)
    boundaries = sum(edge.is_boundary for edge in check.edges)
    nonmanifold = sum(not edge.is_manifold for edge in check.edges)
    faces = len(check.faces)
    check.free()
    if boundaries or nonmanifold or not rebuilt.data.uv_layers:
        raise RuntimeError(f'{original.name}: open mesh or missing color UV '
                           f'({boundaries} boundaries, {nonmanifold} nonmanifold)')
    print('CLOSED', original.name, 'faces', faces, 'voxel', voxel_size,
          'boundary', boundaries, 'nonmanifold', nonmanifold, flush=True)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    source_name = original.name
    original.name = f'source-{source_name}'
    rebuilt.name = source_name
    rebuilt.data.name = source_name
    return rebuilt


selected = set(sys.argv[sys.argv.index('--') + 1:]) if '--' in sys.argv else set()
for source_name, target_name, fixed_voxel in ASSETS:
    if selected and source_name not in selected:
        continue
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    source = ROOT / source_name
    target = ROOT / target_name
    bpy.ops.import_scene.gltf(filepath=str(source))
    originals = [item for item in bpy.context.scene.objects
                 if item.type == 'MESH' and item.data.polygons]
    reconstructed = []
    for original in originals:
        voxel_size = fixed_voxel if source_name.startswith('cliffs/') else None
        reconstructed.append(rebuild(original, voxel_size))
        if source_name.startswith('cliffs/'):
            collision = rebuild(original, 0.025)
            collision.name = 'cliff_collision'
            collision.data.name = 'cliff_collision'
            reconstructed.append(collision)
    bpy.ops.object.select_all(action='DESELECT')
    for item in reconstructed:
        item.select_set(True)
    bpy.context.view_layer.objects.active = reconstructed[0]
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB',
                              use_selection=True, export_apply=True)
    print('EXPORTED', target_name, target.stat().st_size, flush=True)

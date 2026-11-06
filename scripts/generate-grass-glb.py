"""Bake Auralia's four static grass tuft meshes into one runtime GLB.

Run with Blender 5.2:
  blender --background --factory-startup --python scripts/generate-grass-glb.py
"""

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "assets" / "grass" / "grass_tufts.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

material = bpy.data.materials.new("Grass leaves")
material.diffuse_color = (0.30, 0.58, 0.20, 1)
material.use_nodes = True
shader = material.node_tree.nodes.get("Principled BSDF")
vertex_color = material.node_tree.nodes.new("ShaderNodeVertexColor")
vertex_color.layer_name = "COLOR_0"
material.node_tree.links.new(vertex_color.outputs["Color"], shader.inputs["Base Color"])
shader.inputs["Roughness"].default_value = 0.95
material.use_backface_culling = False


def make_tuft(name: str, height_scale: float, flower: bool = False) -> None:
    vertices = []
    faces = []
    colors = []

    def add(x, height, z, color):
        vertices.append((x, z, height))  # Blender Z-up; glTF export converts to Y-up.
        colors.append((*color, 1.0))
        return len(vertices) - 1

    base = (0.08, 0.28, 0.045)
    middle = (0.16, 0.45, 0.08)
    tip = (0.29, 0.61, 0.14)
    for i in range(6):
        angle = i * math.tau / 6 + 0.21 * math.sin(i * 4.7 + height_scale * 3)
        dx, dz = math.cos(angle), math.sin(angle)
        px, pz = -dz, dx
        radial = 0.035 + 0.1 * ((i * 7) % 5) / 5
        height = height_scale * (0.76 + 0.34 * ((i * 3 + 2) % 7) / 7)
        width = 0.17 * (0.78 + 0.35 * ((i * 5 + 1) % 7) / 7)
        curve = 0.09 + 0.09 * ((i * 2 + 3) % 5) / 5
        bx, bz = dx * radial, dz * radial
        mx, mz = bx + dx * curve * 0.42, bz + dz * curve * 0.42
        tx, tz = bx + dx * curve + px * 0.035, bz + dz * curve + pz * 0.035
        a = add(bx - px * width * 0.5, 0, bz - pz * width * 0.5, base)
        b = add(bx + px * width * 0.5, 0, bz + pz * width * 0.5, base)
        c = add(mx - px * width * 0.32, height * 0.57, mz - pz * width * 0.32, middle)
        d = add(mx + px * width * 0.32, height * 0.57, mz + pz * width * 0.32, middle)
        e = add(tx, height, tz, tip)
        faces.extend(((a, b, c), (b, d, c), (c, d, e)))

    if flower:
        stem = (0.18, 0.46, 0.09)
        center = (0.94, 0.76, 0.18)
        petal = (0.97, 0.97, 0.84)
        s0 = add(-0.017, 0.05, 0, stem)
        s1 = add(0.017, 0.05, 0, stem)
        s2 = add(-0.01, 1.46, 0, stem)
        s3 = add(0.01, 1.46, 0, stem)
        faces.extend(((s0, s1, s2), (s1, s3, s2)))
        core = add(0, 1.485, 0, center)
        for i in range(5):
            a = i * math.tau / 5
            b = (i + 1) * math.tau / 5
            left = add(math.cos(a) * 0.036, 1.485, math.sin(a) * 0.036, petal)
            right = add(math.cos(b) * 0.036, 1.485, math.sin(b) * 0.036, petal)
            outer = add(math.cos((a + b) * 0.5) * 0.12, 1.5,
                        math.sin((a + b) * 0.5) * 0.12, petal)
            faces.extend(((core, left, outer), (core, outer, right)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    layer = mesh.color_attributes.new(name="COLOR_0", type="FLOAT_COLOR", domain="CORNER")
    for loop in mesh.loops:
        layer.data[loop.index].color = colors[loop.vertex_index]
    mesh.color_attributes.active_color = layer
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)


for variant, size, has_flower in (
    ("short", 0.75, False),
    ("medium", 1.06, False),
    ("tall", 1.4, False),
    ("flower", 1.4, True),
):
    make_tuft(f"grass_{variant}", size, has_flower)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB",
                          export_yup=True)
print(f"Wrote {OUTPUT}")

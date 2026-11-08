r"""Export Santi's NLA actions and facial shape keys from the source .blend.

Run from the repository root:
  blender --background --factory-startup "F:\santi project\Santi_NLA_SK_Opt.blend" \
    --python scripts/export-santi.py
"""

from pathlib import Path

import bpy


RIG_NAME = "Santi_Rig_Mixamo"
EXPECTED_NLA_TRACKS = 35
OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "public/assets/characters/santi/Santi_NLA_SK_Opt.glb"
)

rig = bpy.data.objects[RIG_NAME]
tracks = rig.animation_data.nla_tracks
if len(tracks) != EXPECTED_NLA_TRACKS:
    raise RuntimeError(f"Expected {EXPECTED_NLA_TRACKS} NLA tracks, got {len(tracks)}")

# The source blend was saved in REST mode. In that mode, Blender exports every
# action name but samples the same T-pose at every frame.
rig.data.pose_position = "POSE"
rig.animation_data.action = None
for track in tracks:
    track.mute = False

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_bake_animation=True,
    export_force_sampling=True,
    export_morph=True,
    export_morph_animation=False,
)
print(f"Exported {len(tracks)} Santi actions to {OUTPUT}")

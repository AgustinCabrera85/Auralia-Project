"""Extract the seven authored surface channels without touching the heightfield."""

import base64
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/auralia-preview/data/WorldStudio_v3_6_fuente.ptrterrain"
OUTPUT = ROOT / "public/auralia-preview/data"

with ZipFile(SOURCE) as archive:
    terrain = json.loads(archive.read("project.json"))["terrain"]
paint = terrain["manualTerrain"]["surfacePaint"]["materials"]
size = paint["resolution"]
assert paint["version"] == 1 and size == 320
assert paint["origin"] == {"x": -7000.0, "z": -7000.0}
assert paint["span"] == {"x": 14000, "z": 14000}

masks = {}
for key in ("weightsA", "weightsB"):
    raw = base64.b64decode(paint[key], validate=True)
    assert len(raw) == size * size * 4
    masks[key] = raw
assert not any(masks["weightsB"][7::4]), "Unexpected eighth material channel"

for key, raw in masks.items():
    (OUTPUT / f"{key}.rgba").write_bytes(raw)

metadata = {
    "schema": "auralia-worldstudio-material-weights-v1",
    "source": SOURCE.relative_to(ROOT).as_posix(),
    "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    "resolution": size,
    "originXZ": [paint["origin"]["x"], paint["origin"]["z"]],
    "spanXZ": [paint["span"]["x"], paint["span"]["z"]],
    "orientation": "columns +X east; rows +Z south; row 0 is the northern edge",
    "encoding": "interleaved unsigned RGBA8; channels 0-3 in weightsA, 4-6 in weightsB, channel 7 unused",
    "channelCount": 7,
    "files": {key: {
        "path": f"/auralia-preview/data/{key}.rgba",
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
    } for key, raw in masks.items()},
    "nonzeroPixels": [sum(value > 0 for value in raw[channel::4])
                      for raw, channel in [(masks["weightsA"], i) if i < 4
                                           else (masks["weightsB"], i - 4) for i in range(7)]],
    "channelNames": None,
    "note": "The project serializes weights but not channel names or original PBR textures. Babylon preview maps each original channel to a shared Auralia 1K visual approximation.",
}
(OUTPUT / "surface-materials.json").write_text(
    json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"Extracted {size}x{size} World Studio material masks from {SOURCE.name}")

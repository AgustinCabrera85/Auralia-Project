"""Build a visual ocean coverage mask from the approved R16 and water guide.

This never writes height data. The guide chooses ocean-connected neighborhoods;
the original elevations locate the actual sea-level contour inside them.
Requires Pillow. Run from the repository root.
"""

import json
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "auralia-preview" / "data"
manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
tile_resolution = manifest["resolution"]
side = tile_resolution * 5
raw = bytearray(side * side * 2)
for tile in manifest["tiles"]:
    tile_bytes = (ROOT / "public" / tile["heightFile"].lstrip("/")).read_bytes()
    if len(tile_bytes) != tile_resolution * tile_resolution * 2:
        raise ValueError(f"Invalid source R16 sector: {tile['id']}")
    for row in range(tile_resolution):
        source = row * tile_resolution * 2
        dest = ((tile["cz"] + 2) * tile_resolution + row) * side * 2
        dest += (tile["cx"] + 2) * tile_resolution * 2
        raw[dest : dest + tile_resolution * 2] = tile_bytes[source : source + tile_resolution * 2]

size = 2048
height = Image.frombytes("I;16", (side, side), bytes(raw)).convert("F").resize(
    (size, size), Image.Resampling.BILINEAR
)
source_guide = Image.open(DATA / "water-mask-reference.png").convert("RGB")
ocean = Image.new("L", source_guide.size)
ocean.putdata([
    255 if blue > 240 and red < 100 and green < 100 else 0
    for red, green, blue in source_guide.getdata()
])
# The guide is only 640 px wide. Expand its ocean side by two guide pixels so
# the R16 sea-level contour, rather than its pixel boundary, sets the coast.
near_ocean = ocean.filter(ImageFilter.MaxFilter(5)).resize(
    (size, size), Image.Resampling.BILINEAR
)
minimum = manifest["heightEncoding"]["minMetres"]
metres_per_unit = (
    manifest["heightEncoding"]["maxMetres"] - minimum
) / 65535
sea_level = manifest["seaLevelMetres"]
pixels = bytearray(size * size)
for index, (value, guide) in enumerate(zip(height.getdata(), near_ocean.getdata())):
    metres = minimum + value * metres_per_unit
    # A narrow sub-metre ramp antialiases the shoreline without moving its
    # sea-level crossing by more than one source-height pixel.
    shore = max(0.0, min(1.0, (sea_level + 0.35 - metres) / 0.7))
    coverage = max(0.0, min(1.0, (guide / 255 - 0.15) / 0.55))
    pixels[index] = round(255 * shore * coverage)

output = DATA / "shore-water-mask-2048.png"
Image.frombytes("L", (size, size), bytes(pixels)).save(output, optimize=True)
print(f"Wrote {output.relative_to(ROOT)} ({size} x {size}); source R16 unchanged")

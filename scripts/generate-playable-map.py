"""Rebuild the small navigation raster from original R16 data (no 3D meshes)."""
from pathlib import Path
import array
import json
import sys
from PIL import Image

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'public/auralia-preview/data/manifest.json').read_text())
size, samples = 640, manifest['resolution']
image = Image.new('RGB', (size, size), (24, 68, 85))
pixels = image.load()
low = manifest['heightEncoding']['minMetres']
span = manifest['heightEncoding']['maxMetres'] - low
for tile in manifest['tiles']:
    data = array.array('H')
    data.frombytes((root / ('public' + tile['heightFile'])).read_bytes())
    if sys.byteorder != 'little':
        data.byteswap()
    a, b, c, d = tile['boundsXZ']
    for py in range(round((b + 7000) / 14000 * size), round((d + 7000) / 14000 * size)):
        z = py / size * 14000 - 7000
        j = min(samples - 1, max(0, round((z - b) / (d - b) * (samples - 1))))
        for px in range(round((a + 7000) / 14000 * size), round((c + 7000) / 14000 * size)):
            x = px / size * 14000 - 7000
            i = min(samples - 1, max(0, round((x - a) / (c - a) * (samples - 1))))
            h = low + data[j * samples + i] / 65535 * span
            if h > manifest['seaLevelMetres']:
                t = min(1, max(0, h / 1100))
                pixels[px, py] = (round(111 + 72 * t), round(143 + 38 * t), round(94 + 74 * t))
output = root / 'public/auralia-preview/maps/playable-geography.png'
output.parent.mkdir(parents=True, exist_ok=True)
image.save(output)
print(output)

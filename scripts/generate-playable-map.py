"""Bake shaded relief from bake-playable-map.cjs samples (numpy + Pillow).

Geometry/water come from PlayableWorld. Colour and light are cartographic
illustration; no terrain, hydrology or destinations are edited by this tool.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / '.test-build/playable-map'


def smooth(a, b, v):
    t = np.clip((v-a)/(b-a), 0, 1)
    return t*t*(3-2*t)


def blur(array, radius):
    lo, hi = float(array.min()), float(array.max())
    im = Image.fromarray(np.uint8((array-lo)/max(hi-lo, 1e-6)*255))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius))).astype(float)/255*(hi-lo)+lo


def bake():
    meta = json.loads((SAMPLES / 'metadata.json').read_text(encoding='utf-8'))
    size = meta['size']
    height = np.fromfile(SAMPLES / 'height.f32', dtype='<f4').reshape(size, size)
    water = np.fromfile(SAMPLES / 'water.f32', dtype='<f4').reshape(size, size)
    desert = np.fromfile(SAMPLES / 'aridity.f32', dtype='<f4').reshape(size, size)
    step = (meta['bounds'][2]-meta['bounds'][0])/size
    wet = water > height+.08
    # Flatten water before illumination: lake beds must not cast mountain shadows.
    relief = np.where(wet, water, height)
    dz, dx = np.gradient(relief, step, step)
    slope = np.hypot(dx, dz)
    length = np.sqrt(1+(dx*2.4)**2+(dz*2.4)**2)
    light = np.clip((-dx*2.4*-.55-dz*2.4*-.55+.63)/length, 0, 1)
    ambient = np.clip((relief-blur(relief, 8))/160, -.16, .13)
    shade = np.clip(.64+light*.66+ambient, .55, 1.3)
    rng = np.random.default_rng(271828)
    grain = rng.random((size, size))-.5
    woodland = blur(rng.random((size, size)), 7)
    woodland = (woodland-woodland.min())/max(float(np.ptp(woodland)), .001)
    green = np.zeros((size, size, 3)) + [91, 113, 66]
    green += ((woodland-.5)*19)[..., None]*np.array([.7, 1, .6])
    highland = smooth(180, 950, height)*.7
    green = green*(1-highland[..., None])+np.array([130, 130, 102])*highland[..., None]
    rock = np.maximum(smooth(.2, .9, slope)*.8, smooth(900, 1550, height)*.55)
    color = green*(1-rock[..., None])+np.array([137, 133, 116])*rock[..., None]
    # Match the actual dry region, including sandstone on its steep slopes.
    sandstone = smooth(.18, .85, slope)*.85
    dry_color = np.array([207, 169, 105])*(1-sandstone[..., None])+np.array([174, 103, 66])*sandstone[..., None]
    color = color*(1-desert[..., None])+dry_color*desert[..., None]
    snow = smooth(1210, 1650, height)*(1-smooth(.8, 1.9, slope))*.87*(1-desert)
    color = color*(1-snow[..., None])+np.array([218, 222, 211])*snow[..., None]
    # Sand follows actual shorelines, not the old lake scaffold polygons.
    shore = blur(wet.astype(float), 1.4)
    sand = np.clip(shore*1.7, 0, .75)*(1-smooth(.28, .8, slope))*(1-desert)
    color = color*(1-sand[..., None])+np.array([174, 158, 116])*sand[..., None]
    color *= shade[..., None]
    color += grain[..., None]*5
    depth = np.maximum(0, water-height)
    deep = smooth(0, 40, depth)
    water_color = np.array([60, 118, 123])*(1-deep[..., None])+np.array([23, 53, 65])*deep[..., None]
    rim = np.clip(1-shore, 0, 1)*wet*.25
    water_color += rim[..., None]*np.array([44, 54, 43])
    water_color += (grain*.8)[..., None]
    color = np.where(wet[..., None], water_color, color)
    image = Image.fromarray(np.uint8(np.clip(color, 0, 255)), 'RGB')
    draw = ImageDraw.Draw(image)
    min_x, min_z, max_x, max_z = meta['bounds']
    point = lambda x, z: ((x-min_x)/(max_x-min_x)*size, (z-min_z)/(max_z-min_z)*size)
    town = meta['town']
    # Only roads/buildings present in Brisalia, at their true footprints.
    for road in meta['roads']:
        points = [point(town['x']+p[0], town['z']+p[1]) for p in road['points']]
        draw.line(points, fill=(163, 144, 105), width=max(1, round(road['width']/step)))
    for building in meta['buildings']:
        x, z = town['x']+building['x'], town['z']+building['z']+building.get('footprintOffsetZ', 0)
        w, d = building['width']/2, building['depth']/2
        draw.rectangle([point(x-w, z-d), point(x+w, z+d)], fill=(154, 143, 121), outline=(77, 80, 65))
    output = ROOT / 'public/auralia-preview/maps/playable-relief.webp'
    image.save(output, quality=91, method=6)
    print(f'{output}: {size} x {size}, {output.stat().st_size/1024:.0f} KiB')


if __name__ == '__main__':
    bake()

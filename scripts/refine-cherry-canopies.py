"""Rebuild the existing cherry GLBs with branching, layered blossom crowns.

Run: python scripts/refine-cherry-canopies.py
Reuses the original embedded bark/blossom atlases without changing their pixels.
Both LODs derive from the same seeded branch skeleton and blossom positions.
"""
import copy
import json
import math
import random
import struct
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/expansion-v3'
TREES = [('Tree_Cherry_01_PinkBloom', 1701, 'pink'),
         ('Tree_Cherry_02_WhiteBloom', 1702, 'white'),
         ('Tree_Cherry_03_TwistedTwin', 1703, 'twin')]


def unit(v):
    return v / max(float(np.linalg.norm(v)), 1e-8)


def bezier(points, t):
    a, b, c, d = points
    return (1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d


class Geometry:
    def __init__(self):
        self.positions, self.normals, self.uvs, self.colors, self.indices = [], [], [], [], []

    def tube(self, curve, radius, rings, sides, tint):
        start = len(self.positions)
        previous_axis = None
        for i in range(rings+1):
            t = i/rings
            center = bezier(curve, t)
            tangent = unit(bezier(curve, min(1, t+.005))-bezier(curve, max(0, t-.005)))
            axis = unit(np.cross(tangent, [0, 0, 1]) if previous_axis is None else
                        previous_axis-tangent*np.dot(previous_axis,tangent))
            if np.linalg.norm(axis) < .1:
                axis = unit(np.cross(tangent, [1, 0, 0]))
            previous_axis = axis
            across = np.cross(tangent, axis)
            r = radius * max(.045, (1-t)**.85)
            for j in range(sides+1):
                angle = j/sides*math.tau
                normal = axis*math.cos(angle)+across*math.sin(angle)
                self.positions.append((center+normal*r).tolist())
                self.normals.append(normal.tolist())
                self.uvs.append([j/sides, t*3])
                self.colors.append([*tint, 1])
                if i < rings and j < sides:
                    a = start+i*(sides+1)+j
                    self.indices += [a, a+1, a+sides+1, a+1, a+sides+2, a+sides+1]

    def blossom(self, center, normal, size, spin, quadrant, tint):
        normal = unit(normal)
        axis = unit(np.cross(normal, [0, 1, 0]))
        if np.linalg.norm(axis) < .1:
            axis = np.array([1., 0., 0.])
        across = np.cross(normal, axis)
        u = (axis*math.cos(spin)+across*math.sin(spin))*size*.5
        v = (-axis*math.sin(spin)+across*math.cos(spin))*size*.5
        start = len(self.positions)
        # Four independent blossom sprays occupy the existing 2x2 atlas.
        ox, oy = (quadrant % 2)*.5, (quadrant//2)*.5
        for dx, dy, tx, ty in [(-1,-1,.01,.01),(1,-1,.49,.01),(1,1,.49,.49),(-1,1,.01,.49)]:
            self.positions.append((center+u*dx+v*dy).tolist())
            self.normals.append(normal.tolist())
            self.uvs.append([ox+tx, oy+ty])
            self.colors.append([*tint, 1])
        self.indices += [start,start+1,start+2,start,start+2,start+3]


def skeleton(seed, variant):
    rng = random.Random(seed)
    limbs, sprays = [], []
    v = lambda *p: np.array(p, dtype=float)
    lean = rng.uniform(-.35,.35)
    trunk = [v(0,0,0),v(-.18+lean,1.3,.12),v(.34+lean,2.7,-.08),v(.18+lean,3.8,.1)]
    limbs.append((trunk,.39,12,8))
    twin = [v(.04,.15,.02),v(.65,1.1,.12),v(-.42,2.5,.35),v(-.65,3.5,.25)]
    if variant == 'twin': limbs.append((twin,.29,12,7))
    count = 9 if variant == 'twin' else 8
    for i in range(count):
        angle = i*2.399963+rng.uniform(-.22,.22)
        outward = v(math.cos(angle),0,math.sin(angle))
        side = v(-math.sin(angle),0,math.cos(angle))
        base = bezier(twin if variant=='twin' and i%2 else trunk,.49+.45*i/(count-1))
        reach = rng.uniform(3.3,4.5) if i < count-2 else rng.uniform(1.6,2.8)
        top = rng.uniform(4.5,5.7) if i < count-2 else rng.uniform(6,6.8)
        end = outward*reach+v(.15,top,.1)
        main = [base,base+outward*.8+v(0,1.25,0),end-outward*reach*.3+v(0,.6,0),end]
        limbs.append((main,rng.uniform(.12,.20),10,6))
        for j, t in enumerate([.43,.63,.80,.96]):
            start = bezier(main,t)
            direction = unit(outward*.65+side*((-1 if j%2 else 1)*rng.uniform(.5,.9)))
            tip = start+direction*rng.uniform(1.0,1.65)+v(0,rng.uniform(.1,.75),0)
            secondary = [start,start+direction*.35+v(0,.35,0),tip-direction*.3+v(0,.35,0),tip]
            limbs.append((secondary,.043+(1-t)*.045,6,5))
            for k, s in enumerate([.38,.67,.95]):
                fork = bezier(secondary,s)
                direction2 = unit(direction*.7+side*((-1 if k%2 else 1)*.65))
                end2 = fork+direction2*rng.uniform(.5,.95)+v(0,rng.uniform(-.25,.45),0)
                twig = [fork,fork+direction2*.2+v(0,.16,0),end2-direction2*.18+v(0,.05,0),end2]
                limbs.append((twig,.018,4,3))
                # Blossom groups follow the twig and overlap into irregular
                # layers, leaving the main forks and sky windows readable.
                for n in range(30):
                    u = rng.uniform(.1,1.1)
                    center = bezier(twig,min(1,u))
                    center += v(rng.gauss(0,.34),rng.gauss(.12,.22),rng.gauss(0,.34))
                    normal = v(rng.uniform(-1,1),rng.uniform(.15,1),rng.uniform(-1,1))
                    size = rng.uniform(.38,.72)
                    light = rng.uniform(.8,1)
                    tint = (1*light,.91*light,.86*light) if variant=='white' else (1*light,.63*light,.76*light)
                    sprays.append((center,normal,size,rng.random()*math.tau,rng.randrange(4),tint,rng.random()))
    return limbs, sprays


def read_template(path):
    blob = path.read_bytes()
    length = struct.unpack_from('<I',blob,12)[0]
    doc = json.loads(blob[20:20+length])
    binary = blob[28+length:]
    images = []
    for image in doc['images']:
        view = doc['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset',0)
        images.append(binary[offset:offset+view['byteLength']])
    return doc, images


def write_glb(path, template, images, meshes, variant, lod):
    doc = {k:copy.deepcopy(template[k]) for k in ['materials','textures','samplers','images'] if k in template}
    doc.update(asset={'version':'2.0','generator':'Auralia branching cherry crowns v2'},
               scene=0,scenes=[{'nodes':[0]}],nodes=[{'mesh':0,'name':path.stem,
               'extras':{'species':'cherry','variant':variant,'canopyRevision':2,'lod':lod}}],
               meshes=[{'name':path.stem,'primitives':[]}],bufferViews=[],accessors=[])
    binary=bytearray()
    def view(data, target=None):
        while len(binary)%4: binary.append(0)
        row={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
        if target: row['target']=target
        doc['bufferViews'].append(row);binary.extend(data)
        return len(doc['bufferViews'])-1
    for image,data in zip(doc['images'],images): image['bufferView']=view(data)
    def accessor(values, shape, indices=False):
        array=np.array(values,dtype='<u4' if indices else '<f4')
        row={'bufferView':view(array.tobytes(),34963 if indices else 34962),
             'componentType':5125 if indices else 5126,'count':len(values),'type':shape}
        if shape=='VEC3': row.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
        doc['accessors'].append(row);return len(doc['accessors'])-1
    for material,mesh in enumerate(meshes):
        attrs={name:accessor(values,shape) for name,values,shape in [
            ('POSITION',mesh.positions,'VEC3'),('NORMAL',mesh.normals,'VEC3'),
            ('TEXCOORD_0',mesh.uvs,'VEC2'),('COLOR_0',mesh.colors,'VEC4')]}
        doc['meshes'][0]['primitives'].append({'attributes':attrs,'indices':accessor(mesh.indices,'SCALAR',True),'material':material,'mode':4})
    doc['buffers']=[{'byteLength':len(binary)}]
    encoded=json.dumps(doc,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4);binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))
    result+=struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
    path.write_bytes(result)


def main():
    for name,seed,variant in TREES:
        template,images=read_template(ASSETS/(name+'.glb'))
        limbs,sprays=skeleton(seed,variant)
        for lod in (0,1):
            wood,flowers=Geometry(),Geometry()
            for curve,radius,rings,sides in limbs:
                wood.tube(curve,radius,max(2,rings//2) if lod else rings,max(3,sides-2) if lod else sides,(.55,.47,.43))
            for center,normal,size,spin,quadrant,tint,keep in sprays:
                if lod and keep>.43: continue
                flowers.blossom(center,normal,size*(1.4 if lod else 1),spin,quadrant,tint)
            out=ASSETS/(name+('_LOD1' if lod else '')+'.glb')
            write_glb(out,template,images,[wood,flowers],variant,lod)
            print(json.dumps({'file':out.name,'triangles':(len(wood.indices)+len(flowers.indices))//3,
                              'flowerCards':len(flowers.positions)//4,'bytes':out.stat().st_size}))


if __name__=='__main__': main()

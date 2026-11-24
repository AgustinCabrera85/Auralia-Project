"""Validate exported near/far crowns, not just the generator's parameters."""
import json
import struct
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parents[1]
for name,budget,radius in [('Tree_Cherry_01_PinkBloom',12000,7),
                          ('Tree_Cherry_02_WhiteBloom',12000,7.1),
                          ('Tree_Cherry_03_TwistedTwin',13000,7.2)]:
    sizes=[]
    for lod in (False,True):
        path=root/'public/assets/expansion-v3'/(name+('_LOD1' if lod else '')+'.glb')
        blob=path.read_bytes();magic,version,total=struct.unpack_from('<III',blob)
        assert magic==0x46546c67 and version==2 and total==len(blob)
        length=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+length]);binary=blob[28+length:]
        def read(index):
            a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
            width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
            dtype={5125:'<u4',5126:'<f4'}[a['componentType']]
            return np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=v.get('byteOffset',0)).reshape(-1,width)
        triangles=0;bounds=[]
        for part in doc['meshes'][0]['primitives']:
            p=read(part['attributes']['POSITION']);n=read(part['attributes']['NORMAL']);indices=read(part['indices']).reshape(-1,3)
            assert np.isfinite(p).all() and np.isfinite(n).all() and indices.max()<len(p)
            assert np.max(np.abs(np.linalg.norm(n,axis=1)-1))<.0001
            assert np.linalg.norm(p[:,[0,2]],axis=1).max()<radius,'planting clearance contains actual crown'
            face=np.cross(p[indices[:,1]]-p[indices[:,0]],p[indices[:,2]]-p[indices[:,0]])
            facing=np.sum(face*np.mean(n[indices],axis=1),axis=1)
            assert (facing>0).mean()>.99,'branch faces point outward with backface culling'
            triangles+=len(indices);bounds.append((p.min(axis=0),p.max(axis=0)))
        assert triangles<budget and (not lod or triangles<5600)
        low=np.min([b[0] for b in bounds],axis=0);high=np.max([b[1] for b in bounds],axis=0)
        assert -.1<low[1]<=0 and high[1]>8,'root collar meets ground with full flowering crown'
        sizes.append((high-low,triangles))
        assert doc['nodes'][0]['extras']['canopyRevision']==2
        assert doc['materials'][1]['alphaMode']=='MASK' and len(doc['images'])==2
    assert sizes[1][1]<sizes[0][1]*.46,'far LOD cuts triangles by more than half'
    assert np.max(np.abs(sizes[0][0]-sizes[1][0]))<.45,'far crown retains its silhouette'
    print(name,{'near':sizes[0][1],'far':sizes[1][1]})

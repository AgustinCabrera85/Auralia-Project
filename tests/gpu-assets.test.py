"""Ensure derived models retain authored geometry, transforms and animation bytes."""
import hashlib,json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;PUBLIC=ROOT/'public'
manifest=json.loads((PUBLIC/'assets/gpu/manifest.json').read_text())
def load(path):
 raw=path.read_bytes()
 if path.suffix=='.glb':
  n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);return g,[raw[28+n:]]
 g=json.loads(raw);return g,[(PUBLIC/b['uri'].lstrip('/') if b['uri'].startswith('/') else path.parent/b['uri']).read_bytes() for b in g.get('buffers',[])]
count=0
for asset in manifest['models']:
 old,ob=load(PUBLIC/asset['source'].lstrip('/'));new,nb=load(PUBLIC/asset['output'].lstrip('/'))
 for field in ['nodes','scenes','scene','meshes','skins','animations','accessors','materials','samplers']:
  assert old.get(field)==new.get(field),(asset['source'],field)
 excluded={i['bufferView'] for i in old.get('images',[]) if 'bufferView' in i}
 for i,(a,b) in enumerate(zip(old.get('bufferViews',[]),new.get('bufferViews',[]))):
  if i in excluded:continue
  av=ob[a.get('buffer',0)][a.get('byteOffset',0):a.get('byteOffset',0)+a['byteLength']]
  bv=nb[b.get('buffer',0)][b.get('byteOffset',0):b.get('byteOffset',0)+b['byteLength']]
  assert av==bv,(asset['source'],'binary view',i);count+=1
 for image in new.get('images',[]):
  assert image['mimeType']=='image/ktx2'
  assert (PUBLIC/asset['output'].lstrip('/')).parent.joinpath(image['uri']).is_file()
for image in manifest['images']:
 assert image['width']%4==0 and image['height']%4==0,'KHR_texture_basisu block alignment'
 path=PUBLIC/'assets/gpu/textures'/f'{image["key"]}.ktx2';data=path.read_bytes()
 assert data[:12]==b'\xabKTX 20\xbb\r\n\x1a\n'
 assert struct.unpack_from('<II',data,20)==(image['width'],image['height'])
 assert struct.unpack_from('<I',data,40)[0]>1,'mipmaps missing'
print(f'GPU assets: {len(manifest["models"])} models, {count} binary geometry/animation views identical, {len(manifest["images"])} full-resolution KTX2 textures OK')

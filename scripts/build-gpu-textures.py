"""Derive GPU-compressed assets; authored files are never rewritten.
Usage: python scripts/build-gpu-textures.py --toktx path/to/toktx.exe
Inputs are the URLs actually resident in artifacts/memory-regression/texture-list.json.
"""
import argparse, concurrent.futures, hashlib, io, json, os, re, struct, subprocess
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
PUBLIC=ROOT/'public'; OUT=PUBLIC/'assets/gpu'; TMP=ROOT/'.test-build/gpu-textures'
for p in [OUT/'models',OUT/'textures',TMP]: p.mkdir(parents=True,exist_ok=True)
args=argparse.ArgumentParser();args.add_argument('--toktx',required=True);options=args.parse_args()
toktx=str(Path(options.toktx).resolve()); mapping={}; jobs={}; assets=[]; encoded_cache={}

def image_job(data,linear):
    encoded_key=(hashlib.sha256(data).digest(),linear)
    if encoded_key in encoded_cache:return encoded_cache[encoded_key]
    im=Image.open(io.BytesIO(data)).convert('RGBA')
    key=hashlib.sha256(im.tobytes()+struct.pack('<II?',*im.size,linear)).hexdigest()[:24]
    source_size=im.size
    # KHR_texture_basisu requires block-aligned base dimensions. Resample upward
    # by at most three texels; never reduce resolution or alter model UVs.
    aligned=((im.width+3)//4*4,(im.height+3)//4*4)
    if im.size!=aligned:
        im=im.resize(aligned,Image.Resampling.LANCZOS)
        key=hashlib.sha256((key+':aligned-v1').encode()).hexdigest()[:24]
    output=OUT/'textures'/f'{key}.ktx2'
    if key not in jobs:
        png=TMP/f'{key}.png'
        if not png.exists() or Image.open(png).size!=im.size:im.save(png)
        jobs[key]={'key':key,'input':png,'output':output,'linear':linear,'width':im.width,'height':im.height,'sourceWidth':source_size[0],'sourceHeight':source_size[1]}
    uri='/assets/gpu/textures/'+output.name;encoded_cache[encoded_key]=uri
    return uri

def process_model(url):
    source=PUBLIC/url.lstrip('/'); raw=source.read_bytes();binary=None
    if source.suffix=='.glb':
        length,kind=struct.unpack_from('<II',raw,12);gltf=json.loads(raw[20:20+length]);offset=20+length
        if offset<len(raw):size,kind=struct.unpack_from('<II',raw,offset);binary=raw[offset+8:offset+8+size]
    else:gltf=json.loads(raw)
    color=set()
    for m in gltf.get('materials',[]):
        for tex in [m.get('pbrMetallicRoughness',{}).get('baseColorTexture'),m.get('emissiveTexture')]:
            if tex:color.add(tex['index'])
    roles={}
    for i,t in enumerate(gltf.get('textures',[])):
        image=t.get('extensions',{}).get('EXT_texture_webp',{}).get('source',t.get('source'))
        if image is not None:roles.setdefault(image,set()).add(i in color)
    image_views=set()
    for i,image in enumerate(gltf.get('images',[])):
        if 'bufferView' in image:
            view=gltf['bufferViews'][image['bufferView']];image_views.add(image['bufferView'])
            data=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        else:data=(source.parent/image['uri']).resolve().read_bytes()
        if len(roles.get(i,{False}))>1:raise ValueError(f'Mixed color/data texture: {url} image {i}')
        uri=image_job(data,not next(iter(roles.get(i,{False}))))
        image.clear();image.update(uri='../textures/'+Path(uri).name,mimeType='image/ktx2')
    for t in gltf.get('textures',[]):
        ext=t.setdefault('extensions',{});image=ext.pop('EXT_texture_webp',{}).get('source',t.pop('source',None))
        ext['KHR_texture_basisu']={'source':image}
    for field in ['extensionsUsed','extensionsRequired']:
        gltf[field]=[s for s in gltf.get(field,[]) if s!='EXT_texture_webp']
        if gltf.get('textures') and 'KHR_texture_basisu' not in gltf[field]:gltf[field].append('KHR_texture_basisu')
    key=hashlib.sha256(url.encode()).hexdigest()[:20]
    if binary is not None:
        # Keep accessor bufferView IDs stable. Empty unused image views; repack
        # every geometry/skin/animation view byte-for-byte on 4-byte boundaries.
        packed=bytearray()
        for i,view in enumerate(gltf.get('bufferViews',[])):
            data=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']] if i not in image_views else bytes(4)
            packed.extend(bytes((-len(packed))%4));view['byteOffset']=len(packed);view['byteLength']=len(data);view['buffer']=0;packed.extend(data)
        (OUT/'models'/f'{key}.bin').write_bytes(packed)
        gltf['buffers']=[{'uri':f'{key}.bin','byteLength':len(packed)}]
    else:
        for b in gltf.get('buffers',[]):b['uri']=Path(os.path.relpath((source.parent/b['uri']).resolve(),OUT/'models')).as_posix()
    (OUT/'models'/f'{key}.gltf').write_text(json.dumps(gltf,separators=(',',':')),encoding='utf8')
    mapping[url]=f'/assets/gpu/models/{key}.gltf';assets.append({'source':url,'output':mapping[url],'images':len(gltf.get('images',[]))})

textures=json.loads((ROOT/'artifacts/memory-regression/texture-list.json').read_text())
models=set()
for texture in textures:
    url=texture.get('url','') or ''
    match=re.search(r'(/assets/[^#]+\.glb)#',url)
    if match:models.add(match[1])
# All 27 authored houses share the same compressed image pool.
models.update('/'+p.relative_to(PUBLIC).as_posix() for p in (PUBLIC/'assets/buildings/brisalia-rev3-final/shared_gltf').glob('*.gltf'))
for url in sorted(models):process_model(url)
for texture in textures:
    url=texture.get('url','') or ''
    if not url.startswith('/assets/') or not re.search(r'\.(png|webp|jpe?g)$',url,re.I):continue
    # Custom terrain texture arrays use their own bounded 512px decoded input.
    if '/terrain/biomes/' in url:continue
    linear=bool(re.search(r'normal|rough|metal|mask|height',url,re.I))
    mapping[url]=image_job((PUBLIC/url.lstrip('/')).read_bytes(),linear)

def compress(job):
    existing=job['output'].read_bytes()[:28] if job['output'].exists() else b''
    if len(existing)<28 or struct.unpack_from('<II',existing,20)!=(job['width'],job['height']):
        staging=TMP/f'{job["key"]}.ktx2'
        if staging.exists():staging.unlink()
        cmd=[toktx,'--t2','--encode','uastc','--uastc_quality','3','--zcmp','9','--genmipmap','--assign_oetf','linear' if job['linear'] else 'srgb','--threads','2',str(staging),str(job['input'])]
        result=subprocess.run(cmd,capture_output=True,text=True)
        if result.returncode:raise RuntimeError(result.stderr+result.stdout)
        staging.replace(job['output'])
    return {**{k:job[k] for k in ['key','width','height','sourceWidth','sourceHeight','linear']},'bytes':job['output'].stat().st_size}
print(f'{len(models)} models, {len(jobs)} unique images',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    images=[]
    for image in pool.map(compress,jobs.values()):
        images.append(image)
        if len(images)%20==0:print(f'{len(images)}/{len(jobs)} compressed',flush=True)
manifest={'generator':'Khronos toktx 4.4.2 UASTC quality 3, Zstd 9, full-resolution mipmaps','mapping':mapping,'models':assets,'images':images}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
(ROOT/'src/world/gpuAssetManifest.ts').write_text('/** Generated by scripts/build-gpu-textures.py; original assets stay unchanged. */\nexport const GPU_ASSET_URLS:Readonly<Record<string,string>>='+json.dumps(mapping,indent=2)+';\n',encoding='utf8')
print(f'Done: {sum(i["bytes"] for i in images)/1048576:.1f} MiB encoded textures',flush=True)

import json,base64,zipfile,hashlib
from pathlib import Path
import numpy as np
root=Path.cwd(); manifest=json.loads((root/'public/auralia-preview/data/manifest.json').read_text())
project=json.loads(zipfile.ZipFile(root/'public/auralia-preview/data/WorldStudio_v3_6_fuente.ptrterrain').read('project.json'))
sculpt=project['terrain']['manualTerrain']['sculpt']; source=np.frombuffer(base64.b64decode(sculpt['data']),dtype='<f4').reshape(sculpt['resolution'],sculpt['resolution'])
low=manifest['heightEncoding']['minMetres']; scale=(manifest['heightEncoding']['maxMetres']-low)/65535
errors=[]; tiles=[]
for tile in manifest['tiles']:
 p=root/'public'/tile['heightFile'].lstrip('/'); h=np.fromfile(p,dtype='<u2').reshape(640,640)*scale+low
 x=(np.linspace(tile['boundsXZ'][0],tile['boundsXZ'][2],640)+7000)/14000*639
 z=(np.linspace(tile['boundsXZ'][1],tile['boundsXZ'][3],640)+7000)/14000*639
 ix=np.minimum(638,x.astype(int));iz=np.minimum(638,z.astype(int));tx=x-ix;tz=z-iz
 interpolated=(source[iz[:,None],ix[None,:]]*(1-tx)+source[iz[:,None],ix[None,:]+1]*tx)*(1-tz[:,None])+(source[iz[:,None]+1,ix[None,:]]*(1-tx)+source[iz[:,None]+1,ix[None,:]+1]*tx)*tz[:,None]
 delta=h-interpolated;errors.append(delta.ravel())
 tiles.append(dict(id=tile['id'],resolution=[640,640],bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),sourceBilinearResidualRmsM=float(np.sqrt(np.mean(delta*delta))),sourceBilinearResidualMaxM=float(abs(delta).max())))
e=np.concatenate(errors)
audit=dict(schema='auralia-preview-source-audit-v1',sourceSculptResolution=[640,640],sourceSculptSpanM=14000,sourceSculptSpacingM=14000/639,r16SpacingM=2800/639,r16TotalBytes=sum(t['bytes']for t in tiles),sourceBilinearResidualRmsM=float(np.sqrt(np.mean(e*e))),sourceBilinearResidualAbsPercentilesM=dict(zip(['50','95','99','100'],map(float,np.percentile(abs(e),[50,95,99,100])))),tiles=tiles)
output=root/'artifacts/world-preview/source-audit.json';output.write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in audit.items()if k!='tiles'},indent=2))

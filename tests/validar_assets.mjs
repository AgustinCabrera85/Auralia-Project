import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { AuraliaHeightAtlas } from '../src/auralia-preview/atlas.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const raw = JSON.parse(readFileSync(join(projectRoot, 'public/auralia-preview/data/manifest.json'), 'utf8'));
const atlas = new AuraliaHeightAtlas(raw);
const materials = JSON.parse(readFileSync(join(projectRoot, 'public/auralia-preview/data/surface-materials.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if (materials.schema !== 'auralia-worldstudio-material-weights-v1' || materials.channelCount !== 7 || materials.resolution !== 320)
  throw new Error('Metadatos de máscaras incompatibles');
if (digest(readFileSync(join(projectRoot, materials.source))) !== materials.sourceSha256)
  throw new Error('El proyecto World Studio fuente cambió respecto de las máscaras');
const maskA = readFileSync(join(projectRoot, 'public', materials.files.weightsA.path.replace(/^\/+/, '')));
const maskB = readFileSync(join(projectRoot, 'public', materials.files.weightsB.path.replace(/^\/+/, '')));
if (maskA.length !== 320 * 320 * 4 || maskB.length !== maskA.length ||
    digest(maskA) !== materials.files.weightsA.sha256 || digest(maskB) !== materials.files.weightsB.sha256)
  throw new Error('Máscaras de materiales incompletas o alteradas');
if (maskB.some((value, index) => index % 4 === 3 && value !== 0))
  throw new Error('El octavo canal debe estar vacío');
atlas.setMaterialWeights(materials, maskA, maskB);
if (atlas.materialAt(-5200, -3800)[2] < .4 || atlas.materialAt(5200, -3700)[6] < .4 ||
    atlas.materialAt(1450, -520)[4] < .4 || atlas.materialAt(2500, -3500)[3] < .3)
  throw new Error('Las máscaras no coinciden con la orientación de las regiones de referencia');
const n = raw.resolution;
const observed = new Set();
for (const t of raw.tiles) {
  const key = `${t.cx},${t.cz}`;
  if (observed.has(key)) throw new Error(`Sector repetido: ${key}`);
  observed.add(key);
  const bytes = readFileSync(join(projectRoot, 'public', t.heightFile.replace(/^\/+/, '')));
  const colors = readFileSync(join(projectRoot, 'public', t.colorFile.replace(/^\/+/, '')));
  if (bytes.length !== n*n*2) throw new Error(`Altura corrupta: ${key}`);
  if (colors.length !== raw.colorResolution**2*3) throw new Error(`Color corrupto: ${key}`);
  const arr = new Uint16Array(n*n);
  for(let i=0;i<arr.length;i++)arr[i]=bytes.readUInt16LE(2*i);
  atlas.tiles.set(key,{...t,height:arr,color:new Uint8Array(colors)});
}
if (observed.size !== 25) throw new Error(`Esperados 25 sectores, recibidos ${observed.size}`);
let edges=0;
for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++){
  const a=atlas.tiles.get(`${cx},${cz}`).height;
  if(cx<2){const b=atlas.tiles.get(`${cx+1},${cz}`).height; for(let j=0;j<n;j++) if(a[j*n+n-1]!==b[j*n])throw new Error(`Grieta X: ${cx},${cz} fila${j}`);edges++;}
  if(cz<2){const b=atlas.tiles.get(`${cx},${cz+1}`).height;for(let j=0;j<n;j++) if(a[(n-1)*n+j]!==b[j])throw new Error(`Grieta Z: ${cx},${cz} col${j}`);edges++;}
}
// Every east / west or north / south border must sample to the same height.
for(let x=-5600;x<=5600;x+=1400){
  const a=atlas.sample(x,-1400), b=atlas.sample(x,-1400-1e-5);
  if(Math.abs(a-b)>1)throw new Error('Discontinuidad en muestra de borde: '+x);
}
for(const i of raw.islands){
  const file=i.file.split('/').pop();
  const buf=readFileSync(join(projectRoot,'public/auralia-preview/models',file));
  if(buf.toString('ascii',0,4)!=='glTF'||buf.readUInt32LE(4)!==2)throw new Error(`GLB inválido: ${file}`);
}
if(!(raw.islands.find(i=>i.id==='albor').positionXYZ[0]<0&&raw.islands.find(i=>i.id==='umbrael').positionXYZ[0]>0)){
  throw new Error('Las ubicaciones Albor / Umbrael no respetan oeste / este');
}
const report={passed:true,tiles:observed.size,bordersChecked:edges,materialChannels:materials.channelCount,materialResolution:materials.resolution,heightRange:[raw.heightEncoding.minMetres,raw.heightEncoding.maxMetres],maxHeightErrorMeters:(raw.heightEncoding.maxMetres-raw.heightEncoding.minMetres)/131070,modelGlbs:raw.islands.length,randomHeight:atlas.sample(0,0)};
console.log('Auralia preview: controles OK',JSON.stringify(report,null,2));

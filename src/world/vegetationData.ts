import { biomeWeightsAt, chunkOf, geographyMasks, hash01, isStarterArea, MAINLAND, sampleMainlandHeight } from './terrainData';
import { waterSurfaceAt } from './geographicFeatures';
import { ASSET_CATALOG } from './assetCatalog';
import { GEOLOGY_FORMATIONS, geologyFaceExcludes, geologyPoint } from './geologyData';

export const VEGETATION_CONFIG = {
  seed: 89031,
  renderRadiusChunks: { trees: 3, plants: 2 },
  candidatesPerChunk: { arbolito1: 8, arbolito2: 12, arbolito3: 2, plantitas1: 16, arbolitoSeco: 3, tronco1: 4 },
  // The player is roughly 4 m tall; these sizes keep the trees visually dominant.
  baseScale: {
    arbolito1:ASSET_CATALOG.arbolito1.referenceScale, arbolito2:ASSET_CATALOG.arbolito2.referenceScale,
    arbolito3:ASSET_CATALOG.arbolito3.referenceScale, plantitas1:ASSET_CATALOG.plantitas1.referenceScale,
    arbolitoSeco:ASSET_CATALOG.arbolitoSeco.referenceScale, tronco1:ASSET_CATALOG.tronco1.referenceScale
  },
  scaleVariation: 0.16,
  crownRadius: { arbolito1: 0.43, arbolito2: 0.38, arbolito3: 0.5, plantitas1: 0.5, arbolitoSeco: .4, tronco1: .5 },
  clusterCellSize: 135,
  minHeightAboveWater: { trees: 1.5, plants: 0.55 },
  maxSlope: { trees: 0.45, plants: 0.62 },
  roadMaskLimit: 0.55,
  obstacleRadius: { arbolito1: 1.2, arbolito2: 1.4, arbolito3: 1.7, arbolitoSeco: 1.2 }
} as const;

export type VegetationKind = keyof typeof VEGETATION_CONFIG.candidatesPerChunk;
export type VegetationExclusion = { x: number; z: number; radius: number };
export type VegetationPlacement = {
  kind: VegetationKind;
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  obstacleRadius: number;
};

const kinds: readonly VegetationKind[] = ['arbolito1','arbolito2','arbolito3','plantitas1','arbolitoSeco','tronco1'];
const clamp01 = (value:number):number => Math.max(0,Math.min(1,value));

/** World-space cluster centers cross chunk borders, while seeded candidates avoid a visible grid. */
function clusterAt(x:number,z:number):number {
  const size=VEGETATION_CONFIG.clusterCellSize;
  const gx=Math.floor(x/size),gz=Math.floor(z/size);
  let influence=0;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const cx=gx+dx,cz=gz+dz;
    const px=(cx+.15+.7*hash01(cx,cz,VEGETATION_CONFIG.seed+1))*size;
    const pz=(cz+.15+.7*hash01(cx,cz,VEGETATION_CONFIG.seed+2))*size;
    const radius=42+36*hash01(cx,cz,VEGETATION_CONFIG.seed+3);
    influence=Math.max(influence,1-clamp01((Math.hypot(x-px,z-pz)-radius*.25)/(radius*.95)));
  }
  return influence;
}

function densityAt(kind:VegetationKind,x:number,z:number,wetness:number,cluster:number):number {
  const w=biomeWeightsAt(x,z);
  const weights:Record<VegetationKind,[number,number,number,number,number,number]>={
    // valle, bosque, sierras, humedales, costa, cumbres
    arbolito1:[.58,.4,.12,.15,.08,.02],
    arbolito2:[.1,.8,.08,.12,.025,.01],
    arbolito3:[.035,.1,.025,.055,.01,.02],
    plantitas1:[.72,.48,.12,.78,.18,.03],
    arbolitoSeco:[.01,.22,.05,.015,.005,.01],
    tronco1:[.035,.28,.02,.035,.005,.005]
  };
  const d=weights[kind];
  let probability=d[0]*w.valle+d[1]*w.ecos+d[2]*w.sierras+d[3]*w.nacar+d[4]*w.costa+d[5]*w.cumbres;
  if(kind==='arbolito3'){
    const special=Math.max(
      Math.exp(-(Math.hypot(x+350,z+285)**2)/(115**2)),
      Math.exp(-(Math.hypot(x-200,z+660)**2)/(130**2))
    );
    probability+=special*.32;
  }
  const grouping=kind==='plantitas1'||kind==='tronco1' ? .42+.58*cluster : .12+.88*cluster;
  const moisture=kind==='plantitas1'||kind==='tronco1' ? .72+.65*wetness : 1-.48*wetness;
  return clamp01(probability*grouping*moisture);
}

/** Pure per-chunk distribution. Never reads the current player or load order. */
export function vegetationForChunk(cx:number,cz:number,exclusions:readonly VegetationExclusion[]=[]):VegetationPlacement[]{
  const size=MAINLAND.chunkSize,placements:VegetationPlacement[]=[];
  for(const kind of kinds){
    const count=VEGETATION_CONFIG.candidatesPerChunk[kind];
    for(let i=0;i<count;i++){
      const seed=VEGETATION_CONFIG.seed+i*17+kinds.indexOf(kind)*1009;
      const x=(cx+hash01(cx,cz,seed+1))*size;
      const z=(cz+hash01(cx,cz,seed+2))*size;
      if(isStarterArea(x,z)||geologyFaceExcludes(x,z))continue;
      const water=MAINLAND.waterLevel;
      const h=sampleMainlandHeight(x,z);
      const tree=kind!=='plantitas1'&&kind!=='tronco1';
      const variation=1+VEGETATION_CONFIG.scaleVariation*(2*hash01(cx,cz,seed+4)-1);
      const scale=VEGETATION_CONFIG.baseScale[kind]*variation;
      const crownRadius=VEGETATION_CONFIG.crownRadius[kind]*scale;
      if(h<water+(tree?VEGETATION_CONFIG.minHeightAboveWater.trees:VEGETATION_CONFIG.minHeightAboveWater.plants))continue;
      const inlandWater=waterSurfaceAt(x,z);
      if(inlandWater&&h<inlandWater.level+(tree?1.7:.35))continue;
      const masks=geographyMasks(x,z);
      if(masks.road>VEGETATION_CONFIG.roadMaskLimit)continue;
      if(exclusions.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+crownRadius))continue;
      const cluster=clusterAt(x,z);
      const w=biomeWeightsAt(x,z);
      const wetness=clamp01(masks.lake*.7+masks.river*.55+w.nacar*.65);
      if(hash01(cx,cz,seed+3)>=densityAt(kind,x,z,wetness,cluster))continue;
      const step=2.5;
      const slope=Math.hypot(
        sampleMainlandHeight(x+step,z)-sampleMainlandHeight(x-step,z),
        sampleMainlandHeight(x,z+step)-sampleMainlandHeight(x,z-step)
      )/(2*step);
      if(slope>(tree?VEGETATION_CONFIG.maxSlope.trees:VEGETATION_CONFIG.maxSlope.plants))continue;
      const clearance=Math.max(tree?5:2.5,crownRadius);
      if([[-clearance,0],[clearance,0],[0,-clearance],[0,clearance]].some(([dx,dz])=>sampleMainlandHeight(x+dx,z+dz)<=water+.2))continue;
      const radius=tree?VEGETATION_CONFIG.obstacleRadius[kind as keyof typeof VEGETATION_CONFIG.obstacleRadius]*variation:kind==='tronco1'?.7*variation:0;
      if(tree&&placements.some(p=>p.obstacleRadius>0&&Math.hypot(p.x-x,p.z-z)<.6*(VEGETATION_CONFIG.crownRadius[p.kind]*p.scale+crownRadius)))continue;
      placements.push({kind,x,y:h,z,scale,yaw:hash01(cx,cz,seed+5)*Math.PI*2,obstacleRadius:radius});
    }
  }
  for(const formation of GEOLOGY_FORMATIONS)for(let i=-1;i<=1;i++){
    const across=formation.kind==='canyon'?68+(i===0?8:0):51+(i===0?8:0);
    const point=geologyPoint(formation,i*22,across);
    const cell=chunkOf(point.x,point.z);
    if(cell.cx!==cx||cell.cz!==cz)continue;
    const y=sampleMainlandHeight(point.x,point.z);
    const scale=VEGETATION_CONFIG.baseScale.plantitas1;
    if(y<=MAINLAND.waterLevel+1||geologyFaceExcludes(point.x,point.z)||
      exclusions.some(e=>Math.hypot(point.x-e.x,point.z-e.z)<e.radius+2)||
      placements.some(p=>p.obstacleRadius>0&&Math.hypot(point.x-p.x,point.z-p.z)<3))continue;
    placements.push({kind:'plantitas1',x:point.x,y,z:point.z,scale,
      yaw:hash01(i,formation.seed,9)*Math.PI*2,obstacleRadius:0});
  }
  return placements;
}

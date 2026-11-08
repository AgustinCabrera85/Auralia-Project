import { EXPANSION_V3_ASSETS, type ExpansionV3Id } from './expansionV3Catalog';
import { getWorldDocument, type PlacedAsset } from './editor/WorldEditState';
import { insideFoliageForest } from './foliageForestConfig';
import { geologyFaceExcludes } from './geologyData';
import { LAKE_RESERVATIONS, LAGOONS, MAIN_RIVER, waterSurfaceAt } from './geographicFeatures';
import { biomeWeightsAt, geographyMasks, hash01, isStarterArea, LANDMARKS,
  MAINLAND, sampleMainlandHeight } from './terrainData';

export const EXPANSION_PREFIX='expansion-v3-';
export const EXPANSION_GROVES=[
  {name:'cerezos-nacar',x:110,z:-330,rx:115,rz:95,family:'cherry'},
  {name:'cerezos-ecos',x:-245,z:-335,rx:95,rz:100,family:'cherry'},
  {name:'jacarandas-orientales',x:625,z:-415,rx:150,rz:110,family:'jacaranda'}
] as const;
const cherry:readonly ExpansionV3Id[]=['v3TreeCherryPink','v3TreeCherryWhite','v3TreeCherryTwin'];
const jacaranda:readonly ExpansionV3Id[]=['v3TreeJacarandaViolet','v3TreeJacarandaWide'];
const banks:readonly ExpansionV3Id[]=['v3TreeWillowWeeping','v3TreeWillowOld',
  'v3TreeWillowLeaning','v3TreeRiverSarandi','v3TreeRiverFork'];
const reeds:readonly ExpansionV3Id[]=['v3WetlandTotoraTall','v3WetlandTotoraLow',
  'v3WetlandJuncosDense','v3WetlandJuncosSparse','v3WetlandCyperus',
  'v3WetlandIrisYellow','v3WetlandMixedShore'];
const ground:readonly ExpansionV3Id[]=['v3WetlandFern','v3WetlandBankFlowers'];
const floating:readonly ExpansionV3Id[]=['v3WetlandLilyWhite','v3WetlandLilyPink',
  'v3WetlandCamalote','v3WetlandDuckweed'];
const choose=(ids:readonly ExpansionV3Id[],seed:number):ExpansionV3Id=>
  ids[Math.floor(hash01(seed,913,4171)*ids.length)];

/** One deterministic decoration pass. No savegame state or runtime per-frame sampling. */
export function expansionBiomeAssets(existing:readonly PlacedAsset[]=[]):PlacedAsset[]{
  const result:PlacedAsset[]=[],trees:{x:number;z:number;radius:number}[]=[];
  const protectedAssets=existing.filter(p=>(p.collisionRadius??0)>0);
  const clear=(x:number,z:number,radius:number):boolean=>
    !isStarterArea(x,z)&&!insideFoliageForest(x,z)&&!geologyFaceExcludes(x,z)&&
    geographyMasks(x,z).road<.45&&
    LANDMARKS.every(p=>Math.hypot(x-p.x,z-p.z)>24+radius)&&
    protectedAssets.every(p=>Math.hypot(x-p.x,z-p.z)>(p.collisionRadius??0)*p.scale+radius+2);
  const slope=(x:number,z:number):number=>Math.hypot(
    sampleMainlandHeight(x+2,z)-sampleMainlandHeight(x-2,z),
    sampleMainlandHeight(x,z+2)-sampleMainlandHeight(x,z-2))/4;
  const add=(id:ExpansionV3Id,x:number,z:number,seed:number,tree=false):boolean=>{
    const scale=(.87+hash01(seed,172,27)*.26)*(tree?1.4:1);
    const spread=tree?7.5*scale:1.8*scale;
    if(!clear(x,z,spread))return false;
    const h=sampleMainlandHeight(x,z),water=waterSurfaceAt(x,z);
    const catalog=EXPANSION_V3_ASSETS[id];
    if(catalog.surface==='water'){
      // All corners must be on still water: no lily pads on islands, paths or river falls.
      if(!water||!['lake','lagoon'].includes(water.kind)||h>water.level-.25)return false;
      for(const [dx,dz] of [[spread,0],[-spread,0],[0,spread],[0,-spread]]){
        const edge=waterSurfaceAt(x+dx,z+dz);
        if(!edge||edge.kind!==water.kind||Math.abs(edge.level-water.level)>.01||
          sampleMainlandHeight(x+dx,z+dz)>water.level-.12)return false;
      }
    }else{
      if(h<MAINLAND.waterLevel+.18||slope(x,z)>(tree?.30:.24))return false;
      // Reeds tolerate damp soil; dry flowers/trees keep their roots out of deep water.
      if(water&&h<water.level+(tree?.65:-.45))return false;
      if(tree){
        if(h>55||trees.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+spread))return false;
        if([[spread,0],[-spread,0],[0,spread],[0,-spread]].some(([dx,dz])=>
          Math.abs(sampleMainlandHeight(x+dx,z+dz)-h)>2.6))return false;
        trees.push({x,z,radius:spread});
      }
    }
    result.push({id:EXPANSION_PREFIX+seed,assetId:id,x,z,scale,
      yaw:hash01(seed,782,91)*Math.PI*2,yOffset:catalog.surface==='water'?.045:-.025,
      collisionRadius:tree?catalog.collisionRadius:0});
    return true;
  };
  for(const [g,grove] of EXPANSION_GROVES.entries())for(let i=0;i<180;i++){
    const seed=10000+g*1000+i,angle=hash01(seed,21,17)*Math.PI*2;
    const radius=Math.sqrt(hash01(seed,29,31));
    const x=grove.x+Math.cos(angle)*radius*grove.rx;
    const z=grove.z+Math.sin(angle)*radius*grove.rz;
    const w=biomeWeightsAt(x,z);
    if(w.valle+w.ecos+w.nacar<.55)continue;
    add(choose(grove.family==='cherry'?cherry:jacaranda,seed),x,z,seed,true);
  }
  for(const [b,basin] of [...LAKE_RESERVATIONS,...LAGOONS].entries()){
    for(let i=0;i<96;i++){
      const seed=20000+b*1000+i*6;
      const angle=(i+hash01(i,b,712)*.7)/96*Math.PI*2;
      // Find this bank's actual waterline, including terrain edits and protected islands.
      let lo=.60,hi=1.16;
      for(let j=0;j<10;j++){
        const r=(lo+hi)/2;
        const h=sampleMainlandHeight(basin.x+Math.cos(angle)*basin.radiusX*r,
          basin.z+Math.sin(angle)*basin.radiusZ*r);
        if(h<basin.level+.65)lo=r;else hi=r;
      }
      const bank=(lo+hi)/2;
      for(let p=0;p<3;p++){
        const radial=bank+(p-1)*.018;
        const x=basin.x+Math.cos(angle)*basin.radiusX*radial;
        const z=basin.z+Math.sin(angle)*basin.radiusZ*radial;
        const h=sampleMainlandHeight(x,z);
        if(h<basin.level-.45||h>basin.level+1.8)continue;
        add(choose(p===2?ground:reeds,seed+p),x,z,seed+p);
      }
      if(i%3===0){
        const radial=bank+12/Math.min(basin.radiusX,basin.radiusZ);
        add(choose(banks,seed+3),basin.x+Math.cos(angle)*basin.radiusX*radial,
          basin.z+Math.sin(angle)*basin.radiusZ*radial,seed+3,true);
      }
      // Discrete floating colonies leave the lake centre and navigation routes open.
      if(i%4<2){
        const radial=.56+hash01(seed,19,81)*.27;
        add(choose(floating,seed+4),basin.x+Math.cos(angle)*basin.radiusX*radial,
          basin.z+Math.sin(angle)*basin.radiusZ*radial,seed+4);
      }
    }
  }
  // Lower riverbanks, downstream of the mountains; never on steep high-water reaches.
  for(let n=9;n<MAIN_RIVER.length-1;n++){
    const a=MAIN_RIVER[n],b=MAIN_RIVER[n+1];
    const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/18);
    const nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
    for(let i=0;i<steps;i++)for(const side of [-1,1]){
      const seed=30000+n*1000+i*8+(side+1)*2,t=(i+.5)/steps;
      const width=a.width+(b.width-a.width)*t;
      const x=a.x+(b.x-a.x)*t+nx*side*(width+12);
      const z=a.z+(b.z-a.z)*t+nz*side*(width+12);
      add(choose(banks,seed),x,z,seed,true);
      add(choose(reeds,seed+1),x-nx*side*5,z-nz*side*5,seed+1);
    }
  }
  return result;
}

/** Generated decoration shares the existing lazy GLB/LOD batches and editor collisions. */
export function installExpansionBiomeAssets():number{
  const world=getWorldDocument();
  const existing=world.assets.filter(p=>!p.id.startsWith(EXPANSION_PREFIX));
  const expansion=expansionBiomeAssets(existing);
  world.assets=[...existing,...expansion];
  return expansion.length;
}

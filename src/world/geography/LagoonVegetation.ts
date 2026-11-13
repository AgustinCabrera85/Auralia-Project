import { CASCADE_LAGOON as lagoon, GROTTO_PORTALS, LAGOON_FALLS, lagoonChannelAt } from '../lagoonData';
import { getWorldDocument, type PlacedAsset } from '../editor/WorldEditState';
import { regionPoint, type PlayableWorld } from './PlayableWorld';
import type { GeographicBounds } from './GeographicSource';
import { nearTerrainSurfaceAt } from '../terrainLod';

export const LAGOON_VEGETATION_PREFIX='lagoon-shore-v1-';
const random=(seed:number)=>{const n=Math.sin(seed*127.1+83.7)*43758.5453;return n-Math.floor(n);};
const reeds=['v3WetlandTotoraTall','v3WetlandJuncosDense','v3WetlandIrisYellow'] as const;

/** Open corridors at the three falls, outlet and grotto. Coordinates are local
 * to the migrated watershed, so this reservation also follows its regional frame. */
export function lagoonPlantingClear(x:number,z:number):boolean{
  if(GROTTO_PORTALS.some(p=>Math.hypot(x-p.x,z-p.z)<22))return false;
  if(LAGOON_FALLS.some(f=>Math.abs(x-f.x)<f.width/2+23&&z<f.z+f.run+40))return false;
  const c=lagoonChannelAt(x,z);
  return c.distance>c.width+18;
}

/** Small deterministic patches, not a continuous hedge. Roots use the canonical
 * rendered triangles; floating plants are confined to the quiet shallow shelf. */
function* lagoonVegetationPatches(world:PlayableWorld,existing:readonly PlacedAsset[]):Generator<void,PlacedAsset[]>{
  const result:PlacedAsset[]=[],level=lagoon.level+world.lagoon.y;
  const grid=new Map<string,number>();
  const surfaceAt=(x:number,z:number)=>nearTerrainSurfaceAt(x,z,(gx,gz)=>{
    const key=`${gx}:${gz}`;let h=grid.get(key);
    if(h===undefined){h=world.heightAt(gx,gz);grid.set(key,h);}return h;
  });
  const point=(angle:number,r:number)=>({x:lagoon.x+Math.cos(angle)*lagoon.radiusX*r,
    z:lagoon.z+Math.sin(angle)*lagoon.radiusZ*r});
  const height=(angle:number,r:number)=>{const p=point(angle,r),q=regionPoint(world.lagoon,p.x,p.z);return surfaceAt(q.x,q.z).height;};
  const add=(id:string,assetId:string,angle:number,r:number,seed:number,floating=false)=>{
    const p=point(angle,r);if(!lagoonPlantingClear(p.x,p.z))return;
    const q=regionPoint(world.lagoon,p.x,p.z),surface=surfaceAt(q.x,q.z);
    const relative=surface.height-level,ground=assetId==='v3WetlandFern'||assetId==='v3WetlandBankFlowers';
    if(Math.hypot(surface.slopeX,surface.slopeZ)>.25)return;
    if(floating?relative>-.3||relative<-2.6:ground?relative<.35||relative>2.4:relative<-.7||relative>.65)return;
    if(existing.some(a=>Math.hypot(q.x-a.x,q.z-a.z)<(a.collisionRadius??0)*a.scale+3))return;
    if(result.some(a=>Math.hypot(q.x-a.x,q.z-a.z)<2.1))return;
    if(floating){
      // Keep the entire pad above water, including its furthest leaf.
      for(const [dx,dz] of [[0,0],[2,0],[-2,0],[0,2],[0,-2]]){
        const water=world.waterFieldAt(q.x+dx,q.z+dz);
        if(water?.kind!=='lagoon'||Math.abs(water.level-level)>.01||
          surfaceAt(q.x+dx,q.z+dz).height>level-.2)return;
      }
    }
    result.push({id:LAGOON_VEGETATION_PREFIX+id,assetId,...q,
      scale:.72+random(seed+1)*.36,yaw:random(seed+2)*Math.PI*2,
      yOffset:floating?.035:0,collisionRadius:0});
  };
  for(let patch=0;patch<72;patch++){
    const seed=patch*101;if(random(seed)>.82)continue;
    const angle=(patch+random(seed+3)*.45)*Math.PI*2/72;
    if(height(angle,.94)>=level||height(angle,1.13)<=level)continue;
    let lo=.94,hi=1.13;
    for(let i=0;i<16;i++){const mid=(lo+hi)/2;if(height(angle,mid)<level)lo=mid;else hi=mid;}
    const shore=(lo+hi)/2;
    for(let i=0;i<14;i++){
      const s=seed+i*7,a=angle+(random(s+4)-.5)*.052;
      add(`${patch}-reed-${i}`,reeds[Math.floor(random(s+5)*reeds.length)],a,
        shore+(random(s+6)-.65)*.043,s);
    }
    for(let i=0;i<6;i++){
      const s=seed+i*11+40,a=angle+(random(s+4)-.5)*.065;
      add(`${patch}-bank-${i}`,i%2?'v3WetlandFern':'v3WetlandBankFlowers',a,
        shore+.022+random(s+6)*.06,s);
    }
    if(patch%3===0)for(let i=0;i<7;i++){
      const s=seed+i*17+70;
      add(`${patch}-pad-${i}`,'v3WetlandLilyWhite',angle+(random(s+4)-.5)*.08,
        shore-.03-random(s+6)*.06,s,true);
    }
    yield;
  }
  return result;
}

export function lagoonVegetationAssets(world:PlayableWorld,existing:readonly PlacedAsset[]=[]):PlacedAsset[]{
  const patches=lagoonVegetationPatches(world,existing);let step;
  do{step=patches.next();}while(!step.done);return step.value;
}

/** Only placement metadata is retained. AuthoredAssets streams shared GLBs and
 * their existing LODs nearby; no extra R16 sectors are fetched for planting. */
export class LagoonVegetation {
  private installed=false;
  private pending:Generator<void,PlacedAsset[]>|null=null;
  count=0;
  generationMs=0;
  constructor(private readonly world:PlayableWorld){}
  ensure(x:number,z:number):boolean{
    if(this.installed)return false;
    const center=regionPoint(this.world.lagoon,lagoon.x,lagoon.z);
    if(Math.hypot(x-center.x,z-center.z)>900)return false;
    const rx=lagoon.radiusX*this.world.lagoon.scale*1.18+12;
    const rz=lagoon.radiusZ*this.world.lagoon.scale*1.18+12;
    const bounds:GeographicBounds=[center.x-rx,center.z-rz,center.x+rx,center.z+rz];
    if(!this.world.isReady(bounds))return false;
    const start=performance.now(),doc=getWorldDocument();
    this.pending??=lagoonVegetationPatches(this.world,
      doc.assets.filter(a=>!a.id.startsWith(LAGOON_VEGETATION_PREFIX)));
    do{
      const step=this.pending.next();
      if(step.done){
        doc.assets=[...doc.assets.filter(a=>!a.id.startsWith(LAGOON_VEGETATION_PREFIX)),...step.value];
        this.count=step.value.length;this.installed=true;this.pending=null;break;
      }
    }while(performance.now()-start<2.5);
    this.generationMs+=performance.now()-start;
    return this.installed;
  }
}

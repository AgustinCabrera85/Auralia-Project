import { activeGeography } from './ActiveGeography';
import { hash01 } from '../terrainData';

/** Budgets apply only to the migrated continent; legacy forests keep their rules. */
export const WORLD_FOREST={radiusChunks:22,fullDistance:135,mediumDistance:420,
  fadeStart:1100,fadeEnd:1560,maxFullTrees:96,maxFrontTrees:96,maxMediumTrees:240,placementStep:18} as const;

/** Two radial rows in each fixed azimuth lane. A lake/clearing does not push
 * the first visible forest edge into the cheapest LOD. Input is distance sorted. */
export function forestFrontRows<T extends {x:number;z:number;obstacleRadius?:number}>(
  trees:readonly {p:T;distance:number}[],focus:{x:number;z:number},view:{x:number;z:number}):Set<T>{
  const result=new Set<T>(),lanes=new Map<number,number[]>();
  for(const {p,distance} of trees){
    if(!p.obstacleRadius||distance<160||distance>1100)continue;
    const dx=p.x-focus.x,dz=p.z-focus.z;
    if((dx*view.x+dz*view.z)/distance<.5)continue;
    const lane=Math.floor((Math.atan2(dz,dx)+Math.PI)/(Math.PI*2)*144),rows=lanes.get(lane)??[];
    if(rows.length>=2||rows.length&&distance-rows[0]<14)continue;
    rows.push(distance);lanes.set(lane,rows);result.add(p);
    if(result.size>=WORLD_FOREST.maxFrontTrees)break;
  }
  return result;
}
export const worldForestEnabled=()=>activeGeography()?.source.id==='worldstudio-playable-v1';
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
function noise(x:number,z:number,seed:number):number{
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,z-iz);
  const a=hash01(ix,iz,seed),b=hash01(ix+1,iz,seed),c=hash01(ix,iz+1,seed),d=hash01(ix+1,iz+1,seed);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
/** Broad groves and clearings cross streaming cells without rectangular edges. */
export function worldForestCover(x:number,z:number):number{
  return smooth(.24,.72,.75*noise(x/440,z/440,16381)+.25*noise(x/170,z/170,23891));
}
/** One tree candidate per jittered world-space slot, shared by all species.
 * Even at chunk borders trunks remain at least nine metres apart. */
export function worldForestCandidates(cx:number,cz:number){
  const rows=[];
  for(let iz=0;iz<4;iz++)for(let ix=0;ix<4;ix++){
    const gx=cx*4+ix,gz=cz*4+iz,pick=hash01(gx,gz,89131);
    const kind=pick<.43?'arbolito1':pick<.82?'arbolito2':pick<.94?'arbolito3':'arbolitoSeco';
    rows.push({kind,x:(gx+.25+.5*hash01(gx,gz,89132))*18,z:(gz+.25+.5*hash01(gx,gz,89133))*18,
      chance:hash01(gx,gz,89134),variation:hash01(gx,gz,89135),yaw:hash01(gx,gz,89136)});
  }
  return rows;
}

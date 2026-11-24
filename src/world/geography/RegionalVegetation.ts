import type {PlayableRegion} from './PlayablePlaces';
import {OCASO_DESERT} from './OcasoDesert';

/** Continental atlas coordinates, never legacy island coordinates. Multipliers
 * leave forests/jungle dense and make valleys, plains and coasts visibly open. */
export const VEGETATION_REGIONS=[
 {id:'VAL',x:-1250,z:1600,trees:.3,grass:1},
 {id:'OCC',x:-4300,z:1120,trees:.42,grass:.85},
 {id:'ECO',x:-4670,z:-1600,trees:1,grass:.85},
 {id:'SIE',x:-2850,z:-3150,trees:.22,grass:.5},
 {id:'CRI',x:50,z:-4700,trees:.04,grass:.12},
 {id:'ALB',x:2380,z:-3650,trees:.08,grass:.25},
 {id:'DES',x:OCASO_DESERT.x,z:OCASO_DESERT.z,trees:.03,grass:.08},
 {id:'MAL',x:5250,z:-4320,trees:.06,grass:.15},
 {id:'NAC',x:1190,z:-480,trees:.7,grass:.9},
 {id:'SEL',x:4750,z:720,trees:1.15,grass:1},
 {id:'LLA',x:-1370,z:3340,trees:.12,grass:1},
 {id:'COS',x:3700,z:3400,trees:.16,grass:.55}
] as const;

/** Blend over 600 m at regional borders; density never steps at a stream cell. */
export function regionalVegetationSampler(regions:readonly PlayableRegion[]=[]){
 const profiles=VEGETATION_REGIONS.map(profile=>{
  const region=regions.find(r=>r.id===profile.id);
  return {...profile,x:region?.x??profile.x,z:region?.z??profile.z};
 });
 return (x:number,z:number):{trees:number;grass:number}=>{
  const distances=profiles.map(p=>Math.hypot(x-p.x,z-p.z)),closest=Math.min(...distances);
  let trees=0,grass=0,total=0;
  for(let i=0;i<profiles.length;i++){
   const t=Math.min(1,(distances[i]-closest)/600),weight=1-t*t*(3-2*t);
   trees+=profiles[i].trees*weight;grass+=profiles[i].grass*weight;total+=weight;
  }
  return {trees:trees/total,grass:grass/total};
 };
}

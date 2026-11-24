import { CASTLE_BUILDING, castleCourtyardHeight } from '../brisaliaLayout';

/** The existing Rev5 fortress, at its original scale, on the lake island's plateau. */
export const NACAR_PALACE={x:1450,z:-520,yaw:180} as const;
export const NACAR_PALACE_ARRIVAL={x:1450,z:-414} as const;
export type PalacePlacement={x:number;z:number;yaw:number;groundHeight:number};
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

export function inNacarPalaceFootprint(x:number,z:number,pad=0):boolean{
  return Math.abs(x-NACAR_PALACE.x)<CASTLE_BUILDING.width/2+pad&&
    Math.abs(z-NACAR_PALACE.z-CASTLE_BUILDING.footprintOffsetZ)<CASTLE_BUILDING.depth/2+pad;
}

export function nacarPalaceClearance(x:number,z:number):number{
  const dx=Math.abs(x-NACAR_PALACE.x)-CASTLE_BUILDING.width/2;
  const dz=Math.abs(z-NACAR_PALACE.z-CASTLE_BUILDING.footprintOffsetZ)-CASTLE_BUILDING.depth/2;
  const body=Math.hypot(Math.max(dx,0),Math.max(dz,0))+Math.min(Math.max(dx,dz),0);
  // The approach is part of the clearing too, including the map arrival.
  const approach=Math.max(Math.abs(x-NACAR_PALACE.x)-15,
    Math.abs(z-(NACAR_PALACE.z+101))-15);
  return Math.min(body,approach);
}

/** Carve one support terrace into the real terrain; never add a second floor mesh. */
export function nacarPalaceHeight(x:number,z:number,height:number,base:number):number{
  const dx=x-NACAR_PALACE.x,dz=z-NACAR_PALACE.z;
  const distance=Math.hypot(Math.max(Math.abs(dx)-104,0),Math.max(-94-dz,0,dz-108));
  const weight=1-smooth(0,18,distance);
  if(weight===0)return height;
  return height+(base+castleCourtyardHeight(dx,dz)-height)*weight;
}

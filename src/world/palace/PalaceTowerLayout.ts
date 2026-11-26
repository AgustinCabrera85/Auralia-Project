import type {P3} from './PalaceGeometry';

export const PALACE_TOWER_CENTERS=[-32,32] as const;
export const PALACE_TOWER_ROOMS=['S02','S07'] as const;
export const towerCeilingHole=(x:number):[number,number][]=>[[x-3.8,.2],[x+3.8,.2],[x+3.8,9.8],[x-3.8,9.8]];
export const towerRoofHole=(x:number):[number,number][]=>[[x-2.3,2],[x+2.3,2],[x+2.3,8],[x-2.3,8]];
export function towerFlights(cx:number){
  return Array.from({length:4},(_,i)=>{
    const x=cx+(i%2?1.2:-1.2),start:P3=[x,4.8+i*2.5,i%2?2:8],end:P3=[x,7.3+i*2.5,i%2?8:2];
    return {start,end,width:1.9};
  });
}

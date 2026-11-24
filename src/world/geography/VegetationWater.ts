import type {ActiveWorldGeography} from './ActiveGeography';

/** Check the plant's footprint, not just its trunk/root. Rings also catch a
 * narrow river between the centre and the outside of a wide crown. */
export function vegetationTouchesWater(world:ActiveWorldGeography,x:number,z:number,radius:number):boolean{
 if(world.waterAt(x,z))return true;
 const rings=Math.max(1,Math.ceil(radius/2.5));
 for(let ring=1;ring<=rings;ring++){
  const r=radius*ring/rings,count=Math.max(8,Math.ceil(2*Math.PI*r/2.5));
  for(let i=0;i<count;i++){
   const angle=i/count*Math.PI*2;
   if(world.waterAt(x+Math.cos(angle)*r,z+Math.sin(angle)*r))return true;
  }
 }
 return false;
}

import { caveTriangle, emptyCaveGeometry, VOLCANIC_CAVE, type CaveGeometry } from './volcanicCaveData';
type Point=readonly [number,number,number];
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export const caveEntranceLocal=(x:number,z:number)=>{
  const dx=x-VOLCANIC_CAVE.entrance.x,dz=z-VOLCANIC_CAVE.entrance.z;
  const s=Math.sin(VOLCANIC_CAVE.entranceYaw),c=Math.cos(VOLCANIC_CAVE.entranceYaw);
  return {x:dx*c-dz*s,z:dx*s+dz*c};
};
export const caveEntrancePoint=(x:number,z:number)=>{
  const s=Math.sin(VOLCANIC_CAVE.entranceYaw),c=Math.cos(VOLCANIC_CAVE.entranceYaw);
  return {x:VOLCANIC_CAVE.entrance.x+x*c+z*s,z:VOLCANIC_CAVE.entrance.z-x*s+z*c};
};
export function caveApproachWeight(x:number,z:number):number{
  if(Math.abs(x-VOLCANIC_CAVE.entrance.x)>21||Math.abs(z-VOLCANIC_CAVE.entrance.z)>33)return 0;
  const p=caveEntranceLocal(x,z);
  return (1-smooth(7,17,Math.abs(p.x)))*smooth(-18,-7,p.z)*(1-smooth(15,30,p.z));
}
/** Carve only a small landing into the existing near-grid triangles. Drawing,
 * walking and the camera all receive this same floor, with no extra terrain mesh. */
export function caveApproachHeight(x:number,z:number,height:number,rawHeight:(x:number,z:number)=>number):number{
  const weight=caveApproachWeight(x,z);if(!weight)return height;
  const p=caveEntranceLocal(x,z),anchor=caveEntrancePoint(0,16),end=caveEntrancePoint(0,30);
  const floor=rawHeight(anchor.x,anchor.z)+1;
  const landing=floor+(rawHeight(end.x,end.z)-floor)*smooth(6,30,p.z);
  return height+(landing-height)*weight;
}

/** A real, open vestibule: angular rim, two walls, roof and a recessed end.
 * The hillside supplies the floor; the rock shell is only 48 triangles. */
export function buildCaveMouth(ground:(x:number,z:number)=>number):{rock:CaveGeometry;back:CaveGeometry}{
  const rock=emptyCaveGeometry(),back=emptyCaveGeometry();
  const aperture:readonly (readonly [number,number])[]=[[-6.2,0],[-6.5,3.5],[-5.5,7],[-3.5,9],[-.8,10],[3.3,9.4],[5.5,7],[6.2,3.2],[6.1,0]];
  const floor=ground(0,4);
  const lip=aperture.map(([x,y]):Point=>[x,floor+y,4]);
  const recess=aperture.map(([x,y]):Point=>[x*.72,floor+y*.8,-6.5]);
  const edge:readonly (readonly [number,number])[]=[[-12,7],[-14,-2],[-13,-12],[-8,-16],[0,-18],[9,-16],[14,-10],[14,0],[12,7]];
  const outer=edge.map(([x,z]):Point=>[x,ground(x,z)-.3,z]);
  const triangle=(g:CaveGeometry,a:Point,b:Point,c:Point,toward:Point,tint=1)=>caveTriangle(g,a,b,c,toward,tint,0);
  for(let i=0;i<lip.length-1;i++){
    triangle(rock,lip[i],outer[i],outer[i+1],[0,1,1]);triangle(rock,lip[i],outer[i+1],lip[i+1],[0,1,1]);
    // A middle ring gives a readable transition into shadow without more meshes.
    const middle=(j:number):Point=>[(lip[j][0]+recess[j][0])/2,(lip[j][1]+recess[j][1])/2,-1.25];
    const inward:Point=[-(lip[i][0]+lip[i+1][0])/2,-1,0];
    triangle(rock,lip[i],lip[i+1],middle(i+1),inward,.72);triangle(rock,lip[i],middle(i+1),middle(i),inward,.72);
    triangle(rock,middle(i),middle(i+1),recess[i+1],inward,.36);triangle(rock,middle(i),recess[i+1],recess[i],inward,.36);
  }
  const center:Point=[0,floor+3.5,-6.5];
  for(let i=0;i<recess.length;i++)triangle(back,center,recess[i],recess[(i+1)%recess.length],[0,0,1]);
  return {rock,back};
}

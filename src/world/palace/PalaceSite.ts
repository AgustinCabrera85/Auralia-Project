/** The plan stays in metres; only the palace root converts to the game's actor scale. */
export const PALACE_SCALE=3.8/1.85;
import {expandX,expandZ,contractX,contractZ} from './PalaceExpansion';
export const BRISALIA_PALACE_SITE={x:-450,z:1800,yaw:Math.PI};
export const palaceWorld=(x:number,z:number)=>({x:BRISALIA_PALACE_SITE.x-expandX(x)*PALACE_SCALE,z:BRISALIA_PALACE_SITE.z-expandZ(z)*PALACE_SCALE});
export const palaceLocal=(x:number,z:number)=>({x:contractX((BRISALIA_PALACE_SITE.x-x)/PALACE_SCALE),z:contractZ((BRISALIA_PALACE_SITE.z-z)/PALACE_SCALE)});
export const PALACE_APPROACH={width:7,points:[{x:-1016.6,z:1848},{x:-800,z:1880},{x:-640,z:1910},{x:-450,z:1915},palaceWorld(0,-24)]};
export const PALACE_ARRIVAL=palaceWorld(7,-26);
export function palaceSiteClearance(x:number,z:number):number{
  const p=palaceLocal(x,z);return Math.max(Math.abs(p.x)-50,Math.abs(p.z-30)-54)*PALACE_SCALE;
}
export function palaceSiteHeight(x:number,z:number,height:number,floor:number):number{
  const p=palaceLocal(x,z),d=Math.max(Math.abs(p.x)-50,Math.abs(p.z-30)-54);
  if(d>=24)return height;
  const t=Math.max(0,Math.min(1,d/24)),weight=1-t*t*(3-2*t);
  // Soil is recessed below the specified slabs, terrace and garden surfaces.
  const plaza=Math.max(Math.abs(p.x)-32,Math.abs(p.z+14.2)-9.8);
  const walks=Math.min(Math.max(Math.abs(p.x-39)-3,Math.abs(p.z+12)-12),Math.max(Math.abs(p.x+39)-3,Math.abs(p.z+12)-12));
  const paved=Math.min(plaza,walks),recess=.22*(1-Math.max(0,Math.min(1,paved/2)));
  return height+((floor-(.6+recess)*PALACE_SCALE)-height)*weight;
}

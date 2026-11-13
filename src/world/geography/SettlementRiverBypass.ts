import type { StudioSpline } from './WorldStudioSource';
import { STUDIO_RIVER_LEVELS } from './StudioRiverLevels';

/** User-approved local Prado diversion. Keep the settlement platform and every
 * route point outside its approach; only the conflicting reach takes an arc. */
export function settlementRiverBypass(spline:StudioSpline,town:{x:number;z:number}):StudioSpline{
  const cx=town.x,cz=town.z-20,radius=230,scaleX=1.2;
  const points=spline.controlPoints.map((p,i)=>({...p,y:STUDIO_RIVER_LEVELS[spline.id]?.[i]??p.y??1}));
  const distance=(p:{x:number;z:number})=>Math.hypot((p.x-cx)/scaleX,p.z-cz);
  const inside=points.flatMap((p,i)=>distance(p)<radius?[i]:[]);if(!inside.length)return spline;
  const first=Math.max(0,inside[0]-1),last=Math.min(points.length-1,inside.at(-1)!+1),a=points[first],b=points[last];
  const angle=Math.atan2(a.z-cz,(a.x-cx)/scaleX),end=Math.atan2(b.z-cz,(b.x-cx)/scaleX);
  const turn=Math.atan2(Math.sin(end-angle),Math.cos(end-angle)),steps=Math.ceil(Math.abs(turn)*radius/12);
  const arc=Array.from({length:steps-1},(_,i)=>{
    const t=(i+1)/steps,r=distance(a)*(1-t)+distance(b)*t,theta=angle+turn*t;
    return {x:cx+Math.cos(theta)*r*scaleX,z:cz+Math.sin(theta)*r,y:a.y+(b.y-a.y)*t};
  });
  return {...spline,resolvedLevels:true,controlPoints:[...points.slice(0,first+1),...arc,...points.slice(last)]};
}

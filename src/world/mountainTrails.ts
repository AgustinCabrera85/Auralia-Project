import { MOUNTAIN_TRAILS } from './mountainTrailData';
import { routeProjection, type BridgeRoute, type RoutePoint } from './mountainRoutes';

export type MountainTrail={id:string;name:string;from:string;to:string;width:number;points:RoutePoint[];
  bounds:{minX:number;maxX:number;minZ:number;maxZ:number}};

/** Narrow stone terraces follow the contour and retain their outer edge down
 * to solid ground. One shared profile drives both the mesh and foot support. */
export function createMountainTrails(heightAt:(x:number,z:number)=>number,bridges:readonly BridgeRoute[]):MountainTrail[]{
  const anchors=new Map<string,RoutePoint>();
  for(const b of bridges){anchors.set(b.id+':west',b.points[0]);anchors.set(b.id+':east',b.points.at(-1)!);}
  const trails:MountainTrail[]=MOUNTAIN_TRAILS.map(def=>{
    const width=4.8,anchors2D:RoutePoint[]=def.points.map(([x,z])=>({x,z,y:heightAt(x,z)+.12}));
    for(const [key,index] of [[def.from,0],[def.to,anchors2D.length-1]] as const){
      const end=anchors.get(key);if(end)anchors2D[index]={...end};
    }
    const waypoints:RoutePoint[]=[anchors2D[0]];
    for(let i=1;i<anchors2D.length-1;i++){
      const a=anchors2D[i-1],p=anchors2D[i],b=anchors2D[i+1];
      const la=Math.hypot(p.x-a.x,p.z-a.z),lb=Math.hypot(b.x-p.x,b.z-p.z),trim=Math.min(10,la*.22,lb*.22);
      const start={x:p.x+(a.x-p.x)*trim/la,z:p.z+(a.z-p.z)*trim/la};
      const end={x:p.x+(b.x-p.x)*trim/lb,z:p.z+(b.z-p.z)*trim/lb};
      for(let j=0;j<=8;j++){
        const t=j/8,u=1-t,x=u*u*start.x+2*u*t*p.x+t*t*end.x,z=u*u*start.z+2*u*t*p.z+t*t*end.z;
        waypoints.push({x,z,y:heightAt(x,z)+.12});
      }
    }
    waypoints.push(anchors2D.at(-1)!);
    const points:RoutePoint[]=[];
    for(let i=1;i<waypoints.length;i++){
      const a=waypoints[i-1],b=waypoints[i],length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(length/2);
      for(let j=i===1?0:1;j<=count;j++){
        const t=j/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
        // A level walking strip, including its full width, clears the slope.
        const nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
        const ground=heightAt(x,z),support=Math.max(...[-1,-.5,0,.5,1].map(s=>heightAt(x+nx*width*.5*s,z+nz*width*.5*s)));
        const endBlend=Math.min(1,Math.hypot(x-waypoints[0].x,z-waypoints[0].z)/(def.id==='senda-viaducto-oeste'?30:10),
          Math.hypot(x-waypoints.at(-1)!.x,z-waypoints.at(-1)!.z)/10);
        points.push({x,z,y:ground+(support-ground)*endBlend+.12});
      }
    }
    points[0].y=waypoints[0].y;points.at(-1)!.y=waypoints.at(-1)!.y;
    return {id:def.id,name:def.name,from:def.from,to:def.to,width,points,bounds:{
      minX:Math.min(...points.map(p=>p.x))-width,maxX:Math.max(...points.map(p=>p.x))+width,
      minZ:Math.min(...points.map(p=>p.z))-width,maxZ:Math.max(...points.map(p=>p.z))+width}};
  });
  // Smooth the grade and share junction elevations; there is no step between
  // two trails. Repeated passes propagate any junction correction outwards.
  for(let pass=0;pass<4;pass++){
    const levels=new Map<string,number>();
    for(const trail of trails){
      const p=trail.points;
      // The first few metres continue the existing hillside abutment (41°);
      // all longer stretches stay below 31°. Both are walkable without sprint.
      const grade=(i:number)=>trail.id==='senda-viaducto-oeste'&&Math.hypot(p[i].x-p[0].x,p[i].z-p[0].z)<12?.88:.6;
      for(let i=1;i<p.length;i++)p[i].y=Math.max(p[i].y,p[i-1].y-grade(i)*Math.hypot(p[i].x-p[i-1].x,p[i].z-p[i-1].z));
      for(let i=p.length-2;i>=0;i--)p[i].y=Math.max(p[i].y,p[i+1].y-grade(i+1)*Math.hypot(p[i+1].x-p[i].x,p[i+1].z-p[i].z));
      for(const [key,end]of [[trail.from,p[0]],[trail.to,p.at(-1)!]] as const)levels.set(key,Math.max(levels.get(key)??-Infinity,end.y));
    }
    for(const trail of trails){trail.points[0].y=levels.get(trail.from)!;trail.points.at(-1)!.y=levels.get(trail.to)!;}
  }
  return trails;
}

export function mountainTrailSurfaceAt(trails:readonly MountainTrail[],x:number,z:number,originY=Infinity){
  let nearest:{height:number;normalY:number;distance:number}|null=null;
  for(const trail of trails){
    const b=trail.bounds;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;
    for(let i=1;i<trail.points.length;i++){
      const a=trail.points[i-1],b=trail.points[i],r=trail.width/2;
      if(x<Math.min(a.x,b.x)-r||x>Math.max(a.x,b.x)+r||z<Math.min(a.z,b.z)-r||z>Math.max(a.z,b.z)+r)continue;
      const p=routeProjection(x,z,a,b);
      if(p.distance<r&&p.y<=originY+.05&&(!nearest||p.distance<nearest.distance))
        nearest={height:p.y,normalY:p.normalY,distance:p.distance};
    }
  }
  return nearest;
}

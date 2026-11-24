import { MOUNTAIN_TRAILS } from './mountainTrailData';
import { routeProjection, type BridgeRoute, type RoutePoint } from './mountainRoutes';
import { waterSurfaceAt } from './geographicFeatures';

export type MountainTrail={id:string;name:string;from:string;to:string;width:number;points:RoutePoint[];
  crossings:{start:number;end:number}[];
  bounds:{minX:number;maxX:number;minZ:number;maxZ:number}};

/** Ground corridors are paint only; river crossings retain structural support. */
export function createMountainTrails(heightAt:(x:number,z:number)=>number,bridges:readonly BridgeRoute[],waterAt=waterSurfaceAt):MountainTrail[]{
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
        points.push({x,z,y:heightAt(x,z)+.04});
      }
    }
    points[0].y=waypoints[0].y;points.at(-1)!.y=waypoints.at(-1)!.y;
    const crossings:{start:number;end:number}[]=[];
    let start=-1;
    for(let i=0;i<=points.length;i++){
      const p=points[i],water=p?waterAt(p.x,p.z):null;
      const wet=!!(p&&water&&heightAt(p.x,p.z)<water.level+.35);
      if(wet&&start<0)start=i;
      if(!wet&&start>=0){
        const a=Math.max(0,start-4),b=Math.min(points.length-1,i+3);
        const previous=crossings.at(-1);
        if(previous&&a<=previous.end)previous.end=b;else crossings.push({start:a,end:b});
        start=-1;
      }
    }
    for(const crossing of crossings)for(let i=crossing.start;i<=crossing.end;i++){
      const p=points[i],water=waterAt(p.x,p.z);
      if(water)p.y=Math.max(p.y,water.level+5);
    }
    return {id:def.id,name:def.name,from:def.from,to:def.to,width,points,crossings,bounds:{
      minX:Math.min(...points.map(p=>p.x))-width,maxX:Math.max(...points.map(p=>p.x))+width,
      minZ:Math.min(...points.map(p=>p.z))-width,maxZ:Math.max(...points.map(p=>p.z))+width}};
  });
  // Only raised river crossings propagate a ramp into their banks. Dry roads
  // keep the canonical terrain height and have no independent floor collider.
  for(const trail of trails){
    const p=trail.points;
    for(let i=1;i<p.length;i++)p[i].y=Math.max(p[i].y,p[i-1].y-.48*Math.hypot(p[i].x-p[i-1].x,p[i].z-p[i-1].z));
    for(let i=p.length-2;i>=0;i--)p[i].y=Math.max(p[i].y,p[i+1].y-.48*Math.hypot(p[i+1].x-p[i].x,p[i+1].z-p[i].z));
    const merged:MountainTrail['crossings']=[];
    for(const c of trail.crossings){
      while(c.start>0&&p[c.start].y>heightAt(p[c.start].x,p[c.start].z)+.1)c.start--;
      while(c.end<p.length-1&&p[c.end].y>heightAt(p[c.end].x,p[c.end].z)+.1)c.end++;
      const previous=merged.at(-1);if(previous&&c.start<=previous.end)previous.end=Math.max(previous.end,c.end);else merged.push(c);
    }
    trail.crossings=merged;
  }
  return trails;
}

export function mountainTrailSurfaceAt(trails:readonly MountainTrail[],x:number,z:number,originY=Infinity){
  let nearest:{height:number;normalY:number;distance:number}|null=null;
  for(const trail of trails){
    const b=trail.bounds;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;
    for(let i=1;i<trail.points.length;i++){
      if(!trail.crossings.some(c=>i>c.start&&i<=c.end))continue;
      const a=trail.points[i-1],b=trail.points[i],r=trail.width/2;
      if(x<Math.min(a.x,b.x)-r||x>Math.max(a.x,b.x)+r||z<Math.min(a.z,b.z)-r||z>Math.max(a.z,b.z)+r)continue;
      const p=routeProjection(x,z,a,b);
      const along=((x-a.x)*(b.x-a.x)+(z-a.z)*(b.z-a.z))/((b.x-a.x)**2+(b.z-a.z)**2);
      if(along<-.00001||along>1.00001)continue;
      if(p.distance<r&&p.y<=originY+.05&&(!nearest||p.distance<nearest.distance))
        nearest={height:p.y,normalY:p.normalY,distance:p.distance};
    }
  }
  return nearest;
}

/** Split at structural crossings so underwater beds receive no road paint. */
export function groundRoads(trails:readonly MountainTrail[]){
  const roads:{width:number;points:RoutePoint[]}[]=[];
  for(const trail of trails){
    let start=0;
    for(const crossing of trail.crossings){
      if(crossing.start>start)roads.push({width:trail.width,points:trail.points.slice(start,crossing.start+1)});
      start=crossing.end;
    }
    if(start<trail.points.length-1)roads.push({width:trail.width,points:trail.points.slice(start)});
  }
  return roads;
}

import { mountainTrailExcludes } from './mountainTrailData';
export type RoutePoint={x:number;y:number;z:number};
export const MOUNTAIN_PORTALS=[
  {id:'cueva-antigua',name:'Galerías de Ferragrís · acceso de Altapiedra',x:-300,z:-640,node:'sur'},
  {id:'galerias-canon',name:'Galerías de Ferragrís · salida al cañón',x:-520,z:-1040,node:'canon'},
  {id:'galerias-cordillera',name:'Galerías de Ferragrís · salida a la cordillera',x:-780,z:-1320,node:'norte'}
] as const;
export const TUNNEL_NODES:Readonly<Record<string,RoutePoint>>={
  sur:{x:-300,y:-100,z:-640},recodo:{x:-420,y:-97,z:-860},
  sala:{x:-490,y:-94,z:-950},canon:{x:-520,y:-92,z:-1040},
  galeria:{x:-640,y:-88,z:-1140},norte:{x:-780,y:-84,z:-1320},
  cristales:{x:-365,y:-96,z:-1000}
};
export const TUNNEL_LINKS=[['sur','recodo'],['recodo','sala'],['sala','canon'],
  ['sala','galeria'],['galeria','norte'],['sala','cristales']] as const;
export const TUNNEL_RADIUS=5.2,CHAMBER_RADIUS=12;
export function tunnelFloorAt(a:RoutePoint,b:RoutePoint,t:number):number{
  const length=Math.hypot(b.x-a.x,b.z-a.z);
  const blend=Math.max(0,Math.min(1,(t*length-CHAMBER_RADIUS)/(length-2*CHAMBER_RADIUS)));
  return a.y+(b.y-a.y)*blend;
}
export function routeProjection(x:number,z:number,a:RoutePoint,b:RoutePoint){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(length*length)));
  return {t,distance:Math.hypot(x-a.x-dx*t,z-a.z-dz*t),
    x:a.x+dx*t,z:a.z+dz*t,y:a.y+(b.y-a.y)*t,dx:dx/length,dz:dz/length,
    normalY:1/Math.hypot(1,(b.y-a.y)/length)};
}
export function tunnelSurfaceAt(x:number,z:number,margin=0):{height:number;ceiling:number;normalY:number}|null{
  for(const node of Object.values(TUNNEL_NODES))
    if(Math.hypot(x-node.x,z-node.z)<CHAMBER_RADIUS-margin)
      return {height:node.y,ceiling:node.y+10,normalY:1};
  for(const [from,to] of TUNNEL_LINKS){
    const p=routeProjection(x,z,TUNNEL_NODES[from],TUNNEL_NODES[to]);
    if(p.distance<TUNNEL_RADIUS-margin){const height=tunnelFloorAt(TUNNEL_NODES[from],TUNNEL_NODES[to],p.t);
      return {height,normalY:p.normalY,ceiling:height+10};}
  }
  return null;
}
export const BRIDGE_DEFINITIONS=[
  {id:'viaducto-canon',name:'Viaducto del Cañón',a:{x:-510,z:-1040},b:{x:-330,z:-1040},width:8.4,clearance:8,approach:120,maxApproach:600},
  {id:'puente-cordillera',name:'Puente de la Cordillera',a:{x:-770,z:-1320},b:{x:-570,z:-1320},width:7.2,clearance:8,approach:120,maxApproach:600},
  {id:'pasarela-desague',name:'Puente del Desagüe',a:{x:-50,z:-514},b:{x:15,z:-553},width:5,clearance:2,approach:30,maxApproach:90}
] as const;
export type BridgeRoute={id:string;name:string;width:number;points:RoutePoint[];spanStart:number;spanEnd:number};
/** Minimal 26-degree envelope joins the deck to the actual terrain. Long ramps
 * are structural walkways, not edits that cut trenches through the heightfield. */
export function createBridgeRoutes(heightAt:(x:number,z:number)=>number):BridgeRoute[]{
  return BRIDGE_DEFINITIONS.map(def=>{
    const length=Math.hypot(def.b.x-def.a.x,def.b.z-def.a.z);
    const dx=(def.b.x-def.a.x)/length,dz=(def.b.z-def.a.z)/length,step=3;
    const footprint=(x:number,z:number)=>Math.max(...[-.5,0,.5].map(side=>
      heightAt(x-dz*def.width*side,z+dx*def.width*side)));
    const deck=Math.max(...Array.from({length:Math.ceil(length/step)+1},(_,i)=>
      footprint(def.a.x+dx*Math.min(length,i*step),def.a.z+dz*Math.min(length,i*step))))+def.clearance;
    let points:RoutePoint[]=[],approach:number=def.approach;
    for(;approach<=def.maxApproach;approach+=60){
      const count=Math.ceil((length+2*approach)/step);
      points=Array.from({length:count+1},(_,i)=>{
        const along=-approach+i*(length+2*approach)/count;
        const x=def.a.x+dx*along,z=def.a.z+dz*along;
        // At the abutments the centre meets the existing path. Beyond the
        // first 20 m, the entire width clears the hillside, including rails.
        const endBlend=Math.min(1,(along+approach)/20,(length+approach-along)/20);
        const ground=heightAt(x,z),support=ground+(footprint(x,z)-ground)*endBlend;
        return {x,z,y:along>=0&&along<=length?deck:support+.18};
      });
      for(const portal of MOUNTAIN_PORTALS){
        if(Math.abs(portal.z-def.a.z)>6)continue;
        const nearby=points.filter(p=>Math.abs(p.x-portal.x)<10);
        const level=Math.max(...nearby.map(p=>p.y));
        for(const p of nearby)p.y=level;
      }
      const grade=.48*(length+2*approach)/count;
      for(let i=1;i<points.length;i++)points[i].y=Math.max(points[i].y,points[i-1].y-grade);
      for(let i=points.length-2;i>=0;i--)points[i].y=Math.max(points[i].y,points[i+1].y-grade);
      if([points[0],points.at(-1)!].every(p=>p.y-heightAt(p.x,p.z)<.3))break;
    }
    return {id:def.id,name:def.name,width:def.width,points,spanStart:approach,spanEnd:approach+length};
  });
}
export function bridgeSurfaceAt(routes:readonly BridgeRoute[],x:number,z:number,originY=Infinity){
  for(const route of routes){
    const first=route.points[0],last=route.points.at(-1)!;
    if(x<Math.min(first.x,last.x)-route.width||x>Math.max(first.x,last.x)+route.width||
      z<Math.min(first.z,last.z)-route.width||z>Math.max(first.z,last.z)+route.width)continue;
    for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i],dx=b.x-a.x,dz=b.z-a.z;
      const along=((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz);
      // Deck strips are rectangles. Rounded segment caps return the previous
      // vertex height on ascending ramps and make the feet sink into the mesh.
      if(along<-.00001||along>1.00001)continue;
      const p=routeProjection(x,z,a,b);
      if(p.distance<route.width/2&&p.y<=originY+.05)return {height:p.y,normalY:p.normalY,route};
    }
  }
  return null;
}
/** Rails block lateral exits, but the two ramp ends remain open. */
export function bridgeRailBlocks(route:BridgeRoute,x:number,z:number):boolean{
  if(MOUNTAIN_PORTALS.some(p=>Math.abs(p.z-z)<route.width+3&&Math.abs(p.x-x)<8))return false;
  const a=route.points[0],b=route.points.at(-1)!,dx=b.x-a.x,dz=b.z-a.z;
  const along=((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz);
  return along>0&&along<1;
}
export function mountainRouteExcludes(x:number,z:number,radius=0):boolean{
  if(mountainTrailExcludes(x,z,radius))return true;
  if(MOUNTAIN_PORTALS.some(p=>Math.hypot(x-p.x,z-p.z)<14+radius))return true;
  return BRIDGE_DEFINITIONS.some(b=>{
    const length=Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z),dx=(b.b.x-b.a.x)/length,dz=(b.b.z-b.a.z)/length;
    return routeProjection(x,z,{x:b.a.x-dx*b.maxApproach,z:b.a.z-dz*b.maxApproach,y:0},
      {x:b.b.x+dx*b.maxApproach,z:b.b.z+dz*b.maxApproach,y:0}).distance<b.width/2+6+radius;
  });
}

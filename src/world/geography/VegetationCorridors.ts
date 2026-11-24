type Point={x:number;z:number};
export type VegetationRoute={width:number;points:readonly Point[]};
type Segment={a:Point;b:Point;radius:number};
/** Signed distance to roads and bridge decks, indexed once rather than scanning
 * the continent's routes for every blade. Clearances beyond 64 m are irrelevant. */
export class VegetationCorridors {
 private readonly cells=new Map<string,Segment[]>();
 private readonly size=128;
 add(routes:readonly VegetationRoute[]):void{
  for(const route of routes)for(let i=1;i<route.points.length;i++){
   const a=route.points[i-1],b=route.points[i],radius=Math.max(0,route.width/2);
   const segment={a:{...a},b:{...b},radius},pad=radius+64;
   for(let z=Math.floor((Math.min(a.z,b.z)-pad)/this.size);z<=Math.floor((Math.max(a.z,b.z)+pad)/this.size);z++)
    for(let x=Math.floor((Math.min(a.x,b.x)-pad)/this.size);x<=Math.floor((Math.max(a.x,b.x)+pad)/this.size);x++){
     const key=x+':'+z,list=this.cells.get(key)??[];list.push(segment);this.cells.set(key,list);
    }
  }
 }
 clearanceAt(x:number,z:number):number{
  let distance=64;
  for(const {a,b,radius} of this.cells.get(Math.floor(x/this.size)+':'+Math.floor(z/this.size))??[]){
   const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
   distance=Math.min(distance,Math.hypot(x-a.x-dx*t,z-a.z-dz*t)-radius);
  }
  return distance;
 }
}

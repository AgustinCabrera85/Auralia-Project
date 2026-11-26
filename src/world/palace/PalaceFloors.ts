import {PALACE_PLAN} from './BrisaliaPalacePlan';
import {face,geometry,type Geometry,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';

/** Partition the existing slab top into finishes. No raised overlays, duplicate
 * paving, threshold lips or changes to the stair holes/collision elevation. */
export function palaceFloorFinishes(id:string,source:Geometry):Part[]{
  const level=id==='SL-PA'?'PA':'PB',plan=PALACE_PLAN.levels[level],top=level==='PA'?4.8:0;
  const zones:{bounds:readonly number[];material:string}[]=[];
  if(level==='PA')for(const room of plan.rooms)if(!['EA','EB','B01','S02','S07'].includes(room.id))zones.push({bounds:room.bounds_xz,material:'floorOak'});
  for(const bath of plan.bathrooms)zones.push({bounds:bath.bounds_xz,material:'paving'});
  const cuts:(readonly [number,number])[]=[
    ...[...new Set(zones.flatMap(z=>[z.bounds[0],z.bounds[1]]))].map(at=>[0,at] as const),
    ...[...new Set(zones.flatMap(z=>[z.bounds[2],z.bounds[3]]))].map(at=>[2,at] as const),
  ];
  const batches=new Map<string,Geometry>([['paving',geometry()]]);
  const clip=(poly:P3[],axis:number,at:number,side:number)=>{
    const out:P3[]=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-at)*side,db=(b[axis]-at)*side;
      if(da>=-1e-7)out.push(a);
      if(da<-1e-7&&db>1e-7||da>1e-7&&db<-1e-7){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t) as P3);}
    }return out;
  };
  for(let i=0;i<source.indices.length;i+=3){
    const ns=source.indices.slice(i,i+3),normal=source.normals.slice(ns[0]*3,ns[0]*3+3) as P3,p=ns.map(n=>source.positions.slice(n*3,n*3+3) as P3);
    if(normal[1]<.9||Math.abs(p[0][1]-top)>1e-6){face(batches.get('paving')!,p,normal);continue;}
    let polys=[p];
    for(const [axis,at] of cuts)polys=polys.flatMap(q=>q.some(v=>v[axis]<at-1e-7)&&q.some(v=>v[axis]>at+1e-7)?[clip(q,axis,at,-1),clip(q,axis,at,1)].filter(q=>q.length>=3):[q]);
    for(const q of polys){
      const x=q.reduce((s,p)=>s+p[0],0)/q.length,z=q.reduce((s,p)=>s+p[2],0)/q.length;
      const material=zones.filter(v=>x>=v.bounds[0]&&x<=v.bounds[1]&&z>=v.bounds[2]&&z<=v.bounds[3]).at(-1)?.material??'paving';
      const g=batches.get(material)??geometry();face(g,q,normal);batches.set(material,g);
    }
  }
  return [...batches].filter(([,g])=>g.indices.length).map(([material,data])=>({id:material==='paving'?id:id+':'+material,material,data,solid:true,detail:false}));
}

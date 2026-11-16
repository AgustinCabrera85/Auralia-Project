import { BRISALIA_BUILDINGS, BRISALIA_PATHS, BRISALIA_SCALE, brisaliaApproach } from './brisaliaLayout';
import type { WayfindingAsset } from './wayfindingAssets';

export type GuidePoint=readonly [number,number];
export type GuideRoad={points:readonly GuidePoint[]};
export type GuideRoute={label:string;points:GuidePoint[];distance:number};
export type WayfindingSite={id:string;asset:WayfindingAsset;at:GuidePoint;region:string;location:string;yaw:number;routes:GuideRoute[]};
const distance=(a:GuidePoint,b:GuidePoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:GuidePoint,b:GuidePoint)=>a[0]*b[1]-a[1]*b[0];
const minus=(a:GuidePoint,b:GuidePoint):GuidePoint=>[a[0]-b[0],a[1]-b[1]];

/** Follow authored paths, including crossings inside segments, instead of pointing
 * straight through buildings. Reusable for other regions when roads are drawn. */
export function traceRoadRoute(roads:readonly GuideRoad[],start:GuidePoint,end:GuidePoint):GuidePoint[]{
  const segments=roads.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,cuts:[0,1]})));
  const point=(s:typeof segments[number],t:number):GuidePoint=>[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t];
  const project=(p:GuidePoint)=>{
    let best={segment:-1,t:0,d:Infinity};
    segments.forEach((s,i)=>{const v=minus(s.b,s.a),length=v[0]**2+v[1]**2;
      const t=length?Math.max(0,Math.min(1,((p[0]-s.a[0])*v[0]+(p[1]-s.a[1])*v[1])/length)):0;
      const d=distance(p,point(s,t));if(d<best.d)best={segment:i,t,d};});
    if(best.segment<0)throw new Error('Wayfinding needs at least one road');
    segments[best.segment].cuts.push(best.t);return point(segments[best.segment],best.t);
  };
  const from=project(start),to=project(end);
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const a=segments[i],b=segments[j],u=minus(a.b,a.a),v=minus(b.b,b.a),delta=minus(b.a,a.a),den=cross(u,v);
    if(Math.abs(den)>1e-8){const t=cross(delta,v)/den,s=cross(delta,u)/den;
      if(t>=-1e-8&&t<=1+1e-8&&s>=-1e-8&&s<=1+1e-8){a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,s)));}
    }else if(Math.abs(cross(delta,u))<1e-7){
      // Collinear road/door approach endpoints must share the same graph nodes.
      for(const [target,points] of [[a,[b.a,b.b]],[b,[a.a,a.b]]] as const){
        const d=minus(target.b,target.a),n=d[0]**2+d[1]**2;
        if(n)for(const p of points){const t=((p[0]-target.a[0])*d[0]+(p[1]-target.a[1])*d[1])/n;if(t>0&&t<1)target.cuts.push(t);}
      }
    }
  }
  const key=(p:GuidePoint)=>`${Math.round(p[0]*1e4)/1e4}:${Math.round(p[1]*1e4)/1e4}`;
  const nodes=new Map<string,{p:GuidePoint;edges:Map<string,number>;d:number;previous?:string}>();
  const add=(p:GuidePoint)=>{const k=key(p);if(!nodes.has(k))nodes.set(k,{p,edges:new Map(),d:Infinity});return k;};
  for(const s of segments){const cuts=[...new Set(s.cuts)].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){const a=point(s,cuts[i-1]),b=point(s,cuts[i]),ka=add(a),kb=add(b),d=distance(a,b);nodes.get(ka)!.edges.set(kb,d);nodes.get(kb)!.edges.set(ka,d);}}
  const fromKey=key(from),toKey=key(to),pending=new Set(nodes.keys());nodes.get(fromKey)!.d=0;
  while(pending.size){let next:string|undefined,min=Infinity;for(const k of pending)if(nodes.get(k)!.d<min){next=k;min=nodes.get(k)!.d;}
    if(next===undefined)break;pending.delete(next);if(next===toKey)break;
    const n=nodes.get(next)!;for(const [k,cost] of n.edges){const other=nodes.get(k)!;if(n.d+cost<other.d){other.d=n.d+cost;other.previous=next;}}}
  if(!Number.isFinite(nodes.get(toKey)?.d))throw new Error('Wayfinding destinations must be connected by roads');
  const route:GuidePoint[]=[];let k:string|undefined=toKey;
  while(k!==undefined){const n:{p:GuidePoint;previous?:string}=nodes.get(k)!;route.unshift(n.p);k=n.previous;}
  return route.filter((p,i)=>i===0||distance(p,route[i-1])>.001);
}

export function brisaliaWayfinding(origin:{x:number;z:number}):WayfindingSite[]{
  const S=BRISALIA_SCALE,metric=(x:number,z:number):GuidePoint=>[x*S,z*S];
  const entry=(id:string)=>brisaliaApproach(BRISALIA_BUILDINGS.find(b=>b.id===id)!);
  const destinations={castillo:{label:'Castillo',at:metric(135,-69)},posada:{label:'Posada',at:entry('B02')},
    taller:{label:'Taller',at:entry('B04')},centro:{label:'Centro',at:metric(-10,-65)},salida:{label:'Acceso sur',at:metric(1,10)}};
  const sites:{id:string;asset:WayfindingAsset;at:GuidePoint;junction:GuidePoint;location:string;yaw:number;dest:(keyof typeof destinations)[]}[]=[
    {id:'welcome',asset:'wayfindingBoard',at:metric(4.8,4),junction:metric(1,4),location:'Acceso sur',yaw:Math.PI,dest:['castillo','posada','taller']},
    {id:'welcome-lamp',asset:'wayfindingLamp',at:metric(4.8,7.1),junction:metric(1,4),location:'Acceso sur',yaw:Math.PI,dest:[]},
    {id:'south-bend',asset:'wayfindingPointer2',at:metric(-13.4,-6.6),junction:metric(-10,-10),location:'Camino sur',yaw:Math.PI,dest:['centro','salida']},
    {id:'central',asset:'wayfindingBoard',at:metric(20.7,-61.4),junction:metric(17,-65),location:'Cruce central',yaw:0,dest:['castillo','posada','taller']},
    {id:'central-lamp',asset:'wayfindingLamp',at:metric(21.2,-68.6),junction:metric(17,-65),location:'Cruce central',yaw:Math.PI,dest:[]},
    {id:'castle',asset:'wayfindingPointer1',at:metric(138.5,-57),junction:metric(135,-57),location:'Camino al castillo',yaw:Math.PI,dest:['castillo']},
    {id:'castle-lamp',asset:'wayfindingLamp',at:metric(131.5,-58),junction:metric(135,-57),location:'Camino al castillo',yaw:0,dest:[]}
  ];
  return sites.map(s=>{
    const routes=s.dest.map(id=>{const d=destinations[id],points=traceRoadRoute(BRISALIA_PATHS,s.junction,d.at);
      return {label:d.label,points:points.map(([x,z])=>[x+origin.x,z+origin.z] as const),distance:points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]),0)};});
    return {id:s.id,asset:s.asset,at:[s.at[0]+origin.x,s.at[1]+origin.z],region:'Brisalia',location:s.location,yaw:s.yaw,routes};
  });
}

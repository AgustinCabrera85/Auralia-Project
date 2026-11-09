import { CASCADE_LAGOON, LAGOON_CHANNELS, LAGOON_FALLS } from './lagoonData';
import { MAIN_RIVER, STREAMS } from './geographicFeatures';
import { HEADWATER_CATCHMENTS, HEADWATER_LAKE, HEADWATER_TRIBUTARIES, clamp01,
  type DrainagePoint } from './watershedHeadwaters';
import type { Season } from './climate/ClimateModel';

export type DrainageReach={id:string;to:string|null;kind:'channel'|'fall'|'lake'|'sea';
  points:readonly DrainagePoint[];catchment?:number;share?:number};
const point=(x:number,z:number,level:number,width=1):DrainagePoint=>({x,z,level,width});
const confluence=STREAMS[0].points.at(-1)!;
const mainStart=MAIN_RIVER.findIndex(p=>p.x===confluence.x&&p.z===confluence.z);
/** Explicit directed network. A lake is a storage node, never a dead end.
 * The downstream trunk reuses the existing geography, not a second water mesh. */
export const PILOT_DRAINAGE:readonly DrainageReach[]=[
  ...LAGOON_CHANNELS.map((points,i):DrainageReach=>({id:`reach-${i}`,points,kind:'channel',
    to:i<3?`fall-${i}`:i===3?'prado':HEADWATER_TRIBUTARIES[i-4].receives===2?'upland-lake':`reach-${HEADWATER_TRIBUTARIES[i-4].receives}`,
    catchment:i===3?undefined:i<3?i:HEADWATER_TRIBUTARIES[i-4].catchment,
    share:i===0?1:i===1?.2:i===2?.15:i===3?0:HEADWATER_TRIBUTARIES[i-4].catchment===1?.4:.85})),
  ...LAGOON_FALLS.map((f,i):DrainageReach=>({id:`fall-${i}`,to:'lagoon',kind:'fall',
    points:[point(f.x,f.z,f.top),point(f.x,f.z+f.run,f.bottom)]})),
  {id:'upland-lake',to:'reach-2',kind:'lake',points:[
    HEADWATER_TRIBUTARIES.at(-1)!.points.at(-1)!,
    point(HEADWATER_LAKE.x,HEADWATER_LAKE.z,HEADWATER_LAKE.level),LAGOON_CHANNELS[2][0]]},
  {id:'lagoon',to:'reach-3',kind:'lake',points:[
    point(CASCADE_LAGOON.x,CASCADE_LAGOON.z,CASCADE_LAGOON.level),LAGOON_CHANNELS[3][0]]},
  {id:'prado',to:'main-lower',kind:'channel',points:STREAMS[0].points},
  {id:'main-lower',to:'sea',kind:'channel',points:MAIN_RIVER.slice(mainStart)},
  {id:'sea',to:null,kind:'sea',points:[MAIN_RIVER.at(-1)!]}
];

/** Pure build-time validation, also used by the drainage audit and tests. */
export function validateDrainage(reaches:readonly DrainageReach[]=PILOT_DRAINAGE):string[]{
  const errors:string[]=[],byId=new Map(reaches.map(r=>[r.id,r]));
  if(byId.size!==reaches.length)errors.push('Duplicate drainage reach');
  for(const r of reaches){
    if(!r.points.length)errors.push(`${r.id}: missing geometry`);
    for(let i=1;i<r.points.length;i++)if(r.points[i].level>r.points[i-1].level+.001)
      errors.push(`${r.id}: uphill segment ${i}`);
    const visited=new Set<string>();let next:DrainageReach|undefined=r;
    while(next?.to){
      if(visited.has(next.id)){errors.push(`${r.id}: drainage cycle`);break;}
      visited.add(next.id);next=byId.get(next.to);
      if(!next)errors.push(`${r.id}: missing receiver`);
    }
    if(next&&!next.to&&next.kind!=='sea')errors.push(`${r.id}: inland dead end`);
    const receiver=r.to?byId.get(r.to):undefined;
    if(receiver&&r.points.length&&receiver.points.length){
      const a=r.points.at(-1)!,b=receiver.points[0];
      if(a.level<b.level-.001)errors.push(`${r.id}: uphill junction`);
      // Lake mouths can join anywhere within their basin. Other joins share a vertex.
      if(receiver.kind!=='lake'&&(Math.hypot(a.x-b.x,a.z-b.z)>.001||Math.abs(a.level-b.level)>.001))
        errors.push(`${r.id}: disconnected junction`);
    }
  }
  return errors;
}

/** Relative supply for art direction, not a calibrated discharge in m³/s.
 * Aquifer baseflow survives dry weather; rainfall and seasonal melt add supply. */
export function catchmentSupply(index:number,rain:number,season:Season):number{
  const c=HEADWATER_CATCHMENTS[index];
  const melt=c.snow*({spring:.32,summer:.16,autumn:.02,winter:0}[season]);
  return c.baseflow+c.runoff*clamp01(rain)+melt;
}
export class WatershedHydrology {
  readonly supply=new Float64Array(3);
  readonly flows=new Float64Array(PILOT_DRAINAGE.length);
  private readonly receivers=PILOT_DRAINAGE.map(r=>PILOT_DRAINAGE.findIndex(p=>p.id===r.to));
  private readonly order:number[]=[];
  private readonly lagoonIndex=PILOT_DRAINAGE.findIndex(r=>r.id==='lagoon');
  private readonly lakeIndex=PILOT_DRAINAGE.findIndex(r=>r.id==='upland-lake');
  private lakeOutflow=0;
  private lagoonOutflow=0;
  private initialized=false;
  phase=0;
  intensity=1;
  constructor(){
    const errors=validateDrainage();if(errors.length)throw new Error(errors.join('; '));
    const pending=PILOT_DRAINAGE.map(()=>0);
    for(const receiver of this.receivers)if(receiver>=0)pending[receiver]++;
    const queue=pending.flatMap((n,i)=>n===0?[i]:[]);
    for(let q=0;q<queue.length;q++){
      const i=queue[q];this.order.push(i);const next=this.receivers[i];
      if(next>=0&&--pending[next]===0)queue.push(next);
    }
  }
  /** Three scalar responses and a tiny fixed DAG; no geometry, raycasts or allocations. */
  update(dt:number,rain=0,season:Season='spring'){
    const step=Math.max(0,Math.min(dt,.1));
    for(let i=0;i<3;i++){
      const target=catchmentSupply(i,rain,season);
      const response=i===0?75:14;
      this.supply[i]+= (target-this.supply[i])*(this.initialized?1-Math.exp(-step/response):1);
    }
    this.flows.fill(0);
    for(const i of this.order){
      const r=PILOT_DRAINAGE[i];
      if(r.catchment!==undefined)this.flows[i]+=this.supply[r.catchment]*(r.share??0);
      if(i===this.lakeIndex){
        this.lakeOutflow+=(this.flows[i]-this.lakeOutflow)*(this.initialized?1-Math.exp(-step/45):1);
        this.flows[i]=this.lakeOutflow;
      }
      if(i===this.lagoonIndex){
        this.lagoonOutflow+=(this.flows[i]-this.lagoonOutflow)*(this.initialized?1-Math.exp(-step/60):1);
        this.flows[i]=this.lagoonOutflow;
      }
      const next=this.receivers[i];if(next>=0)this.flows[next]+=this.flows[i];
    }
    this.initialized=true;
    // Integrate the phase: changing flow never jumps texture coordinates.
    this.intensity=.65+clamp01(this.lagoonOutflow/1.2)*.7;
    this.phase+=step*this.intensity;
  }
}

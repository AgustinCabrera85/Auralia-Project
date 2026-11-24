export type FlightPoint={x:number;y:number;z:number};
type FlightWorld={ground:(x:number,z:number)=>number;water:(x:number,z:number)=>number|null;
  obstacles:readonly {minX:number;maxX:number;minZ:number;maxZ:number;top:number}[]};
type Segment={length:number;x:number;z:number;angle:number;radius:number;turn:number};
export type BirdFlightPath={segments:Segment[];horizontalLength:number;startSlope:number;lift:number;length:number;
  samples:{u:number;distance:number}[];start:FlightPoint;end:FlightPoint};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const length=(a:FlightPoint,b:FlightPoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const turnAngle=(a:number)=>{const t=((a%(Math.PI*2))+Math.PI*2)%(Math.PI*2);return t>Math.PI*2-1e-7?0:t;};

function pointAt(path:BirdFlightPath,u:number):FlightPoint{
  if(u<=0)return {...path.start};if(u>=1)return {...path.end};
  let travel=u*path.horizontalLength,segment=path.segments[path.segments.length-1];
  for(const s of path.segments){segment=s;if(travel<=s.length)break;travel-=s.length;}
  const s=segment,a=s.angle+s.turn*travel/s.radius;
  const x=s.turn?s.x+Math.cos(a)*s.radius:s.x+Math.cos(s.angle)*travel;
  const z=s.turn?s.z+Math.sin(a)*s.radius:s.z+Math.sin(s.angle)*travel;
  // Cubic altitude profile retains the incoming slope and levels off at arrival.
  const y=path.start.y+(path.end.y-path.start.y)*smooth(u)+
    path.startSlope*path.horizontalLength*u*(1-u)**2+path.lift*Math.sin(Math.PI*u)**2;
  return {x,y,z};
}

/** Arc-length lookup keeps speed constant through turns and altitude changes. */
export function sampleBirdFlight(path:BirdFlightPath,travel:number):{point:FlightPoint;tangent:FlightPoint;u:number}{
  const d=clamp(travel,0,path.length),table=path.samples;
  let lo=0,hi=table.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(table[m].distance<d)lo=m;else hi=m;}
  const a=table[lo],b=table[hi],t=(d-a.distance)/Math.max(1e-9,b.distance-a.distance),u=a.u+(b.u-a.u)*t;
  const point=pointAt(path,u),before=pointAt(path,Math.max(0,u-.00001)),after=pointAt(path,Math.min(1,u+.00001));
  const n=length(before,after)||1;
  return {point,tangent:{x:(after.x-before.x)/n,y:(after.y-before.y)/n,z:(after.z-before.z)/n},u};
}

/** Tangent circle/straight/circle routes have a bounded turn radius and never
 * stop horizontally to change altitude. Extra orbit space accommodates a descent
 * when the destination is directly underneath the bird. */
export function planBirdFlight(start:FlightPoint,end:FlightPoint,velocity:FlightPoint,heading:number,
  world:FlightWorld,options:{heading?:number;departure?:boolean;side:number}):BirdFlightPath{
  const horizontalSpeed=Math.hypot(velocity.x,velocity.z),moving=horizontalSpeed>.2;
  const incoming=moving?Math.atan2(velocity.z,velocity.x):Math.PI/2-heading;
  const d=Math.hypot(end.x-start.x,end.z-start.z);
  const outgoing=options.heading!==undefined?Math.PI/2-options.heading:d>2?Math.atan2(end.z-start.z,end.x-start.x):incoming;
  const radius=5,minimum=Math.abs(end.y-start.y)*2.8;
  let segments:Segment[]=[],best=Infinity;
  for(const first of [options.side,-options.side])for(const last of [first,-first]){
    const ax=start.x-Math.sin(incoming)*radius*first,az=start.z+Math.cos(incoming)*radius*first;
    const bx=end.x-Math.sin(outgoing)*radius*last,bz=end.z+Math.cos(outgoing)*radius*last;
    const dx=bx-ax,dz=bz-az,centers=Math.hypot(dx,dz),cross=(last-first)*radius;
    if(centers<1e-7||centers<Math.abs(cross))continue;
    const tangent=Math.atan2(dz,dx)-Math.asin(clamp(cross/centers,-1,1));
    const a=turnAngle(first*(tangent-incoming)),b=turnAngle(last*(outgoing-tangent));
    const line=Math.sqrt(Math.max(0,centers*centers-cross*cross));
    let total=(a+b)*radius+line;
    const loops=Math.max(0,Math.ceil((minimum-total)/(2*Math.PI*radius)));
    total+=loops*2*Math.PI*radius;
    if(total>=best)continue;best=total;
    segments=[{length:(a+loops*2*Math.PI)*radius,x:ax,z:az,angle:incoming-first*Math.PI/2,radius,turn:first},
      {length:line,x:ax+Math.sin(tangent)*radius*first,z:az-Math.cos(tangent)*radius*first,angle:tangent,radius:1,turn:0},
      {length:b*radius,x:bx,z:bz,angle:tangent-last*Math.PI/2,radius,turn:last}].filter(s=>s.length>1e-7);
  }
  // Coincident endpoints with equal heading use a complete orbit.
  if(!segments.length){
    const turn=options.side,loops=Math.max(1,Math.ceil(minimum/(2*Math.PI*radius)));
    segments=[{length:loops*2*Math.PI*radius,x:start.x-Math.sin(incoming)*radius*turn,
      z:start.z+Math.cos(incoming)*radius*turn,angle:incoming-turn*Math.PI/2,radius,turn}];
  }
  const horizontalLength=segments.reduce((sum,s)=>sum+s.length,0);
  const startSlope=options.departure?.38:moving?clamp(velocity.y/horizontalSpeed,-.6,.65):0;
  const path:BirdFlightPath={segments,horizontalLength,startSlope,lift:0,length:0,samples:[],start:{...start},end:{...end}};
  const count=Math.max(160,Math.ceil(horizontalLength*5));
  // Smooth lift clears the sampled corridor while leaving endpoint slopes intact.
  for(let i=1;i<count;i++){
    const u=i/count,p=pointAt(path,u),remaining=length(p,end),departed=length(p,start);
    const clearance=.45*smooth(Math.min(departed/3,remaining/10));
    const water=world.water(p.x,p.z);
    let floor=Math.max(world.ground(p.x,p.z),water??-Infinity)+clearance;
    for(const o of world.obstacles){
      if(p.x<o.minX-.4||p.x>o.maxX+.4||p.z<o.minZ-.4||p.z>o.maxZ+.4)continue;
      const endSupport=end.x>=o.minX-.4&&end.x<=o.maxX+.4&&end.z>=o.minZ-.4&&end.z<=o.maxZ+.4;
      const startSupport=start.x>=o.minX-.4&&start.x<=o.maxX+.4&&start.z>=o.minZ-.4&&start.z<=o.maxZ+.4;
      let top=o.top+clearance;
      if(endSupport)top=Math.min(top,end.y+(o.top+clearance-end.y)*smooth(remaining/Math.max(12,(o.top-end.y)*4)));
      if(startSupport)top=Math.min(top,start.y+(o.top+clearance-start.y)*smooth(departed/Math.max(9,(o.top-start.y)*4)));
      floor=Math.max(floor,top);
    }
    const weight=Math.sin(Math.PI*u)**2;
    if(p.y<floor&&weight>1e-7)path.lift+=(floor-p.y)/weight+.03;
  }
  let previous=pointAt(path,0);path.samples.push({u:0,distance:0});
  for(let i=1;i<=count;i++){
    const u=i/count,p=pointAt(path,u);path.length+=length(previous,p);path.samples.push({u,distance:path.length});previous=p;
  }
  return path;
}

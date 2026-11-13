import { applyHeadwaterRelief, HEADWATER_CATCHMENTS, HEADWATER_LAKE,
  HEADWATER_TRIBUTARIES, headwaterLakeRadius } from './watershedHeadwaters';
/** One watershed datum for terrain, water, planting and traversal (metres). */
export const CASCADE_LAGOON={name:'Laguna de las Tres Vertientes',x:-160,z:-810,
  radiusX:170,radiusZ:135,level:24,depth:18} as const;
export type ChannelPoint={x:number;z:number;level:number;width:number};
export const LAGOON_FALLS=[
  {id:'ferragris',x:-286,z:-918,top:34,bottom:24,width:14,run:16},
  {id:'velo',x:-174,z:-954,top:69,bottom:24,width:11,run:15},
  {id:'gemelas',x:-52,z:-931,top:59,bottom:24,width:17,run:17}
] as const;
export const LAGOON_CHANNELS:readonly (readonly ChannelPoint[])[]=[
  [{x:-714,z:-1510,level:150,width:11},{x:-670,z:-1320,level:122,width:13},
   {x:-545,z:-1190,level:78,width:12},{x:-420,z:-1040,level:40,width:14},
   {x:-325,z:-978,level:36,width:12},{x:-286,z:-918,level:34,width:7}],
  [{x:-205,z:-1058,level:74,width:6},{x:-184,z:-998,level:71,width:7},
   {x:-174,z:-954,level:69,width:5.5}],
  [{x:18,z:-1115,level:64,width:7},{x:18,z:-1085,level:64,width:7},
   {x:18,z:-1020,level:64,width:7},{x:0,z:-994,level:64,width:7},{x:-38,z:-970,level:61,width:8},
   {x:-52,z:-931,level:59,width:8.5}],
  // The lake has an outlet: it is not an endlessly filling bowl.
  [{x:-150,z:-699,level:24,width:13},{x:-104,z:-638,level:21,width:11},
   {x:-28,z:-554,level:16,width:9},{x:55,z:-426,level:12,width:7},
   {x:110,z:-340,level:10,width:4}],
  ...HEADWATER_TRIBUTARIES.map(t=>t.points)
];
/** Source controls: aquifer outlet, rain ravine and upland lake outlet. */
export const LAGOON_SPRINGS=LAGOON_CHANNELS.slice(0,3).map((route,index)=>{
  const a=route[0],b=route[1],length=Math.hypot(b.x-a.x,b.z-a.z);
  return {...a,id:['ferragris','velo','gemelas'][index],kind:HEADWATER_CATCHMENTS[index].kind,dx:(b.x-a.x)/length,dz:(b.z-a.z)/length,
    // Keep the opening inside its basin, including the two narrower springs.
    mouthDistance:Math.min(16,a.width+6)};
});
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export function inLagoonRegion(x:number,z:number):boolean{return x>-1040&&x<300&&z>-1890&&z<-315;}
export function lagoonRadius(x:number,z:number):number{
  const l=CASCADE_LAGOON;return Math.hypot((x-l.x)/l.radiusX,(z-l.z)/l.radiusZ);
}
/** Streaming follows the whole watershed, including its distant upstream end. */
export function watershedDistance(x:number,z:number):number{
  let distance=Math.max(0,Math.hypot(x-CASCADE_LAGOON.x,z-CASCADE_LAGOON.z)-170);
  for(const route of LAGOON_CHANNELS)for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz));
    distance=Math.min(distance,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
  }
  return distance;
}
export function lagoonChannelAt(x:number,z:number){
  let best={distance:Infinity,level:0,width:0,dx:0,dz:1,pastEnd:0,routeIndex:-1,along:0};
  if(!inLagoonRegion(x,z))return best;
  for(const [routeIndex,route] of LAGOON_CHANNELS.entries()){
    const end=route.at(-1)!,before=route.at(-2)!;
    const pastEnd=Math.max(0,((x-end.x)*(end.x-before.x)+(z-end.z)*(end.z-before.z))/Math.hypot(end.x-before.x,end.z-before.z));
    let along=0;
    for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(len*len));
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(distance<best.distance)best={distance,level:a.level+(b.level-a.level)*t,
      width:a.width+(b.width-a.width)*t,dx:dx/len,dz:dz/len,pastEnd,routeIndex,along:along+len*t};
    along+=len;
  }}return best;
}
export function lagoonWaterAt(x:number,z:number):{level:number;kind:'lagoon'|'stream';distance:number;edge:number}|null{
  if(!inLagoonRegion(x,z))return null;
  const highLake=headwaterLakeRadius(x,z);
  if(highLake<1.02)return {level:HEADWATER_LAKE.level,kind:'lagoon',distance:highLake,edge:clamp((1.02-highLake)/.08)};
  const r=lagoonRadius(x,z);
  if(r<1.015)return {level:24,kind:'lagoon',distance:r,edge:clamp((1.015-r)/.08)};
  const c=lagoonChannelAt(x,z);
  if(c.pastEnd<.05&&c.distance<c.width+35)return {level:c.level,kind:'stream',distance:c.distance,edge:clamp((c.width+35-c.distance)/6)};
  return null;
}
/** Exclusive visual ownership prevents the legacy cell water from bridging
 * samples across the cascade's vertical drop and creating hanging strips. */
export function ownsLagoonWater(x:number,z:number):boolean{
  return lagoonRadius(x,z)<1.035||lagoonWaterAt(x,z)!==null||
    LAGOON_FALLS.some(f=>Math.abs(x-f.x)<f.width*.5+40&&z>f.z-40&&z<f.z+f.run+25);
}
/** This final local pass creates broad banks, an incised river and a deep basin.
 * Falls spill over shelves with a recess behind the falling sheet, never uphill. */
export function applyLagoonRelief(x:number,z:number,base:number,waterFloor=-Infinity):number{
  if(!inLagoonRegion(x,z))return base;
  let h=applyHeadwaterRelief(x,z,base);const r=lagoonRadius(x,z),l=CASCADE_LAGOON;
  if(r<1.6){
    const bed=l.level-l.depth*(1-smooth(.25,1.025,r));
    const bank=l.level+1.5+Math.max(0,r-1.06)*16;
    const target=r<1.025?bed:bank;
    h+=(target-h)*(1-smooth(1.18,1.6,r));
  }
  for(const f of LAGOON_FALLS){
    const across=Math.abs(x-f.x),back=f.z-z;
    const shelf=(1-smooth(f.width*.7,f.width*.7+28,across))*
      smooth(-5,12,back)*(1-smooth(85,135,back));
    h+=(Math.max(h,f.top+3)-h)*shelf;
    // Smooth plunge pools cut into the base of each cliff.
    const d=Math.hypot((x-f.x)/(f.width+10),(z-f.z-f.run)/24);
    if(d<1.3)h+=(Math.min(h,l.level-7)-h)*(1-smooth(.6,1.3,d));
  }
  const sampled=lagoonChannelAt(x,z),c={...sampled,level:Math.max(waterFloor,sampled.level)};
  const beforeChannel=h,endFade=1-smooth(0,12+Math.min(100,Math.max(0,c.distance-c.pastEnd-c.width)*2),c.pastEnd);
  if(c.distance<c.width+120){
    // Keep a dry shoulder above the water even where the original valley is
    // lower. Fade it broadly into the hills rather than making a raised wall.
    const crest=c.level+3+c.width*.12;
    h+=Math.max(0,crest-h)*(1-smooth(c.width+40,c.width+120,c.distance));
    // A deeper bed and a distinct, rounded bank contain the river. Controlling
    // this inner profile independently of the hills also avoids sudden spikes
    // where a steep mountain intersects the channel. Water meshes and collision
    // support both sample this same terrain; its water level stays unchanged.
    const tributary=c.routeIndex>=4;
    const sourceDepth=tributary?smooth(0,24,c.along):1;
    const bed=c.level-(tributary?1.4+c.width*.35:4+c.width*.16)*sourceDepth;
    const channel=bed+(crest-bed)*smooth(c.width*.45,c.width+(tributary?8:14),c.distance);
    h=channel+(h-channel)*smooth(c.width+14,c.width+52,c.distance);
  }
  h=beforeChannel+(h-beforeChannel)*endFade*smooth(.85,1.06,r);
  for(const [index,f] of LAGOON_FALLS.entries()){
    const back=f.z-z,approach=LAGOON_CHANNELS[index].at(-2)!;
    // The upstream throat follows the incoming bend, then meets the straight
    // fall lip. A fixed X here used to dam the diagonal Ferragrís approach.
    const centre=f.x+(approach.x-f.x)*clamp(back/(f.z-approach.z));
    const across=Math.abs(x-centre),half=f.width*.5;
    const lip=smooth(-4,0,back)*(1-smooth(18,36,back))*(1-smooth(half+8,half+22,across));
    if(lip>0){
      const level=Math.max(f.top,c.level),bed=level-3.5;
      const bank=bed+5.5*smooth(half*.5,half+1.5,across);
      h+=(bank-h)*lip;
    }
  }
  for(const spring of LAGOON_SPRINGS.filter(s=>s.kind==='aquifer')){
    const dx=x-spring.x,dz=z-spring.z,d=Math.hypot(dx,dz);
    const behind=-(dx*spring.dx+dz*spring.dz);
    if(behind>0&&d<spring.width+55){
      // A rounded headwater basin backed by a raised rock shoulder. The river
      // starts inside this bowl, not on a rectangular water plane in mid-air.
      const bed=spring.level-3.5;
      const shoulder=spring.level+7+Math.max(0,behind-20)*.3;
      const basin=bed+(shoulder-bed)*smooth(spring.width*.6,spring.width+25,d);
      h+=(basin-h)*(1-smooth(spring.width+35,spring.width+55,d))*smooth(0,8,behind);
    }
  }
  const mouth=Math.hypot(x+6,z+858);
  if(mouth<26)h+=(Math.min(h,10)-h)*(1-smooth(12,26,mouth));
  // The regional bounding box is a CPU shortcut, not a visible cliff. Blend
  // back to the original surface before reaching any of its four boundaries.
  // Restore the upland lake's level bed after nearby rills carve their junction.
  const highLake=headwaterLakeRadius(x,z);
  if(highLake<.94)h=Math.min(h,HEADWATER_LAKE.level-HEADWATER_LAKE.depth*(1-smooth(.35,1,highLake)));
  const boundary=Math.min(x+1040,300-x,z+1890,-315-z);
  return base+(h-base)*smooth(0,24,boundary);
}

export type GrottoPoint={x:number;y:number;z:number};
export const GROTTO_WATER=-110;
export const GROTTO_ROOM={x:260,z:-890,radius:36};
export const GROTTO_NODES:Readonly<Record<string,GrottoPoint>>={
  boca:{x:80,y:-123,z:-850},sifon:{x:150,y:-126,z:-850},
  recodo:{x:200,y:-123,z:-890},sala:{x:260,y:-114,z:-890},
  sendero:{x:330,y:-103,z:-940},mirador:{x:380,y:-98,z:-1000},
  galeria:{x:350,y:-103,z:-830},bosque:{x:400,y:-98,z:-780}
};
export const GROTTO_LINKS=[['boca','sifon'],['sifon','recodo'],['recodo','sala'],
  ['sala','sendero'],['sendero','mirador'],['sala','galeria'],['galeria','bosque']] as const;
export const GROTTO_PORTALS=[
  {id:'laguna-sumergida',name:'Sifón de las Tres Vertientes',x:-6,z:-858,node:'boca',submerged:true},
  {id:'gruta-mirador',name:'Mirador de la Gruta',x:50,z:-1060,node:'mirador',submerged:false},
  {id:'gruta-bosque',name:'Sendero del Bosque Húmedo',x:160,z:-720,node:'bosque',submerged:false}
] as const;
export const grottoRoomFloor=(x:number)=>-114+(x-260)*.27;
export const grottoRoof=(node:keyof typeof GROTTO_NODES)=>node==='boca'||node==='sifon'?10:node==='recodo'?12:17;
/** Shared miter at a bend so adjoining gallery shells meet without sky cracks. */
export function grottoJointNormal(node:keyof typeof GROTTO_NODES,dx:number,dz:number){
  const neighbours=GROTTO_LINKS.flatMap(([a,b])=>a===node?[b]:b===node?[a]:[]);
  if(neighbours.length!==2)return {x:-dz,z:dx};
  const p=GROTTO_NODES[node];let tx=0,tz=0;
  for(const key of neighbours){const q=GROTTO_NODES[key],len=Math.hypot(q.x-p.x,q.z-p.z);
    const sign=(q.x-p.x)*dx+(q.z-p.z)*dz<0?-1:1;
    tx+=(q.x-p.x)/len*sign;tz+=(q.z-p.z)/len*sign;
  }
  const len=Math.hypot(tx,tz),nx=-tz/len,nz=tx/len,projection=nx*(-dz)+nz*dx;
  return {x:nx/projection,z:nz/projection};
}
export function grottoSegment(a:GrottoPoint,b:GrottoPoint){
  // Clip galleries at the central room's edge so their walls never bisect it.
  const len=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/len,dz=(b.z-a.z)/len;
  if(a===GROTTO_NODES.sala)a={x:a.x+dx*35,y:grottoRoomFloor(a.x+dx*35),z:a.z+dz*35};
  if(b===GROTTO_NODES.sala)b={x:b.x-dx*35,y:grottoRoomFloor(b.x-dx*35),z:b.z-dz*35};
  if(a===GROTTO_NODES.boca)a={x:a.x-dx*3,y:a.y,z:a.z-dz*3};
  if(b===GROTTO_NODES.mirador||b===GROTTO_NODES.bosque)b={x:b.x+dx*3,y:b.y,z:b.z+dz*3};
  return {a,b};
}
export function grottoSurfaceAt(x:number,z:number,margin=0){
  const radius=Math.hypot(x-260,z+890);
  if(radius<36-margin)
    return {height:grottoRoomFloor(x),ceiling:-73-Math.max(0,radius-17)/19*11,normalY:1/Math.hypot(1,.27)};
  for(const [aa,bb] of GROTTO_LINKS){
    const {a,b}=grottoSegment(GROTTO_NODES[aa],GROTTO_NODES[bb]);
    const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
    const raw=((x-a.x)*dx+(z-a.z)*dz)/len2;
    if((aa==='boca'&&raw<0)||((bb==='mirador'||bb==='bosque')&&raw>1))continue;
    const t=clamp(raw);
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(distance<6-margin){
      const height=a.y+(b.y-a.y)*t;
      // The first siphon is fully submerged; the chamber opens into air.
      const roof=grottoRoof(aa)+(grottoRoof(bb)-grottoRoof(aa))*t;
      const ceiling=height+2+Math.sqrt(1-(distance/6.15)**2)*(roof-2);
      return {height,ceiling,normalY:1/Math.hypot(1,(b.y-a.y)/Math.sqrt(len2))};
    }
  }return null;
}

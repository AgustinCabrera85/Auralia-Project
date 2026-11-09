/** Authored drainage controls. Coordinates are shared by terrain, water and the
 * hydrology bake; no terrain sampling or fluid simulation runs in this module. */
export type DrainagePoint={x:number;z:number;level:number;width:number};
export const HEADWATER_LAKE={name:'Laguna Alta de las Gemelas',x:18,z:-1140,
  radiusX:42,radiusZ:48,level:64,depth:7} as const;
export const HEADWATER_CATCHMENTS=[
  {id:'ferragris',name:'Recarga de Ferragrís',kind:'aquifer',x:-714,z:-1510,level:150,
    length:260,halfWidth:170,rise:100,runoff:.30,baseflow:.16,snow:0},
  {id:'velo',name:'Quebrada del Velo',kind:'rain',x:-205,z:-1058,level:74,
    length:220,halfWidth:130,rise:95,runoff:.58,baseflow:.055,snow:0},
  {id:'gemelas',name:'Circo de las Gemelas',kind:'uplandLake',x:18,z:-1105,level:64,
    length:300,halfWidth:145,rise:205,runoff:.48,baseflow:.08,snow:1}
] as const;
/** Ends are exact junctions on the existing rivers or on the upland lake.
 * Channels start narrow; no large river is born at full width on a bare slope. */
export const HEADWATER_TRIBUTARIES:readonly {id:string;catchment:number;receives:number;
  points:readonly DrainagePoint[]}[]=[
  {id:'velo-oeste',catchment:1,receives:1,points:[
    {x:-277,z:-1190,level:132,width:1.3},{x:-262,z:-1140,level:108,width:2.1},
    {x:-232,z:-1094,level:87,width:2.8},{x:-205,z:-1058,level:74,width:4}]},
  {id:'velo-este',catchment:1,receives:1,points:[
    {x:-127,z:-1165,level:126,width:1.3},{x:-148,z:-1116,level:101,width:2},
    {x:-181,z:-1075,level:80,width:2.6},{x:-205,z:-1058,level:74,width:4}]},
  {id:'gemelas-deshielo',catchment:2,receives:2,points:[
    {x:75,z:-1345,level:224,width:1.5},{x:63,z:-1290,level:181,width:2},
    {x:44,z:-1240,level:130,width:2.7},{x:27,z:-1190,level:64,width:3.5},
    {x:18,z:-1160,level:64,width:4}]}
];
export const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};
export function headwaterLakeRadius(x:number,z:number):number{
  const l=HEADWATER_LAKE;return Math.hypot((x-l.x)/l.radiusX,(z-l.z)/l.radiusZ);
}
/** Rounded drainage hollows, backed and separated by broad shoulders. The
 * centre descends southward; lateral slopes funnel runoff into the hollow. */
export function applyHeadwaterRelief(x:number,z:number,base:number):number{
  let h=base;
  for(const c of HEADWATER_CATCHMENTS){
    const along=c.z-z,across=(x-c.x)/c.halfWidth;
    if(along< -35||along>c.length+100||Math.abs(across)>1.65)continue;
    const t=clamp01(along/c.length);
    const valley=c.level+c.rise*Math.pow(t,1.25)+24*across*across;
    const weight=(1-smooth(.65,1.65,Math.abs(across)))*smooth(-35,25,along)*
      (1-smooth(c.length,c.length+100,along));
    h+=(valley-h)*weight;
  }
  const r=headwaterLakeRadius(x,z),l=HEADWATER_LAKE;
  if(r<1.65){
    const bed=l.level-l.depth*(1-smooth(.35,1,r));
    const bank=l.level+2+Math.max(0,r-1)*14;
    const target=r<1?bed:bank;
    h+=(target-h)*(1-smooth(1.12,1.65,r));
  }
  return h;
}

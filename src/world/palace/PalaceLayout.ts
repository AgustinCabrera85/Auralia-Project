import {PALACE_PLAN} from './BrisaliaPalacePlan';
import type {Opening} from './PalaceModel';
// Keep the supplied plan intact; these are the user's later facade/access
// corrections, applied consistently to geometry, frames and vegetation boxes.
export const PALACE_OPENINGS:Record<string,Opening[]> = Object.fromEntries(Object.entries(PALACE_PLAN.levels).map(([level,plan])=>[level,plan.openings.map(source=>{
  const o:Opening={...source,center_xyz:[...source.center_xyz]};
  if(o.kind==='window'&&o.center_xyz[2]===0){
    const p=[...o.center_xyz];
    if(level==='PA'){if(Math.abs(p[0])===23.5)p[0]=Math.sign(p[0])*24;if(Math.abs(p[0])===14.5)p[0]=Math.sign(p[0])*16;}
    if(o.id==='PB-V008'){o.width=1.8;o.height=2.2;o.bottom_y=.9;p[1]=2;}
    o.center_xyz=p;
  }
  // Keep flues continuous and move the paired windows off their masonry shaft.
  if(/^(PB|PA)-V011$/.test(o.id))o.center_xyz=[o.center_xyz[0],o.center_xyz[1],34.5];
  if(/^(PB|PA)-V015$/.test(o.id))o.center_xyz=[o.center_xyz[0],o.center_xyz[1],22.5];
  // The round corner buttress occupies the old northern jamb. Leave room for
  // both the casing and inward leaf sweep inside the four-metre cross passage.
  if(o.id==='PB-D002'||o.id==='PB-D003'){
    o.center_xyz=[o.center_xyz[0],o.center_xyz[1],12.5];o.width=2;o.angle_deg=90;
  }
  if(o.id==='PA-D002'||o.id==='PA-D007'){
    o.width=1.8;o.leaf_count=2;o.angle_deg=90;
  }
  return o;
})]));
// P11's rear wall is reserved for the future dais/thrones. Two lateral exits
// replace the original central rear doorway, clear of the aligned windows.
const rear=PALACE_OPENINGS.PB.find(o=>o.id==='PB-D004')!;
rear.center_xyz=[-18,1.5,56];rear.width=1.8;rear.height=3;rear.leaf_count=1;
PALACE_OPENINGS.PB.push({...rear,id:'PB-D030',center_xyz:[18,1.5,56]});
// The two upper corner rooms now serve their towers, with a clear stair core.
PALACE_OPENINGS.PA=PALACE_OPENINGS.PA.filter(o=>!['PA-D032','PA-D037'].includes(o.id));
export const palaceLevelWalls=(level:string)=>PALACE_PLAN.levels[level as 'PB'|'PA'].walls.filter(w=>!['PA-W003','PA-W026','PA-W008','PA-W044'].includes(w.id));
export const palaceLevelBaths=(level:string)=>{
  const baths:readonly {id:string;bounds_xz:readonly number[]}[]=PALACE_PLAN.levels[level as 'PB'|'PA'].bathrooms;
  return baths.filter(b=>!['BS02','BS07'].includes(b.id));
};
type Furniture={level:'PB'|'PA';id:string;name:string;bounds:readonly number[];kind:string;height:number};
export const PALACE_FURNITURE=PALACE_PLAN.furniture.flatMap<Furniture>(f=>{
  if(/^(S02|S07|BS02|BS07)-/.test(f.id))return [];
  // Two bookcases flank the Escribania flue; timber never enters the shaft.
  if(f.id==='S10-F2')return [{...f,id:f.id+'a',bounds:[34.6,35.2,15,19.15] as const},{...f,id:f.id+'b',bounds:[34.6,35.2,20.85,24] as const}];
  if(f.id==='S09-F2')return [{...f,id:f.id+'a',bounds:[-35.4,-34.8,28,31.15] as const},{...f,id:f.id+'b',bounds:[-35.4,-34.8,32.85,36] as const}];
  return [f];
});
export const PALACE_COLUMNS=PALACE_PLAN.columns.filter(c=>c.center_xz[0]!==0).map(c=>{
  let [x,z]:number[]=[...c.center_xz];
  if(Math.abs(x)===12)x=Math.sign(x)*11.6;
  if(z===22.4)z=24;if(z===35.6)z=34;
  return {...c,center_xz:[x,z] as const};
});

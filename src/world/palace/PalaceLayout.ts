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
  }return o;
})]));
// P11's rear wall is reserved for the future dais/thrones. Two lateral exits
// replace the original central rear doorway, clear of the aligned windows.
const rear=PALACE_OPENINGS.PB.find(o=>o.id==='PB-D004')!;
rear.center_xyz=[-18,1.5,56];rear.width=1.8;rear.height=3;rear.leaf_count=1;
PALACE_OPENINGS.PB.push({...rear,id:'PB-D030',center_xyz:[18,1.5,56]});
export const PALACE_COLUMNS=PALACE_PLAN.columns.filter(c=>c.center_xz[0]!==0).map(c=>{
  let [x,z]:number[]=[...c.center_xz];
  if(Math.abs(x)===12)x=Math.sign(x)*11.6;
  if(z===22.4)z=24;if(z===35.6)z=34;
  return {...c,center_xz:[x,z] as const};
});

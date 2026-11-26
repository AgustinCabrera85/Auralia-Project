import {PALACE_PLAN} from './BrisaliaPalacePlan';
import {geometry,handrailGeometry,rampGeometry,unionBoxes,type Box,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';

type Stair=typeof PALACE_PLAN.stairs[number];
/** One chain follows both flights, the intermediate landing and every exposed
 * edge upstairs. Only the actual arrival aperture is open. Coordinates are
 * shared by the visible handrail, posts and the collision guard. */
export function stairRailPath(stair:Stair):P3[]{
  const side=Math.sign(stair.bounds_xz[0]+stair.bounds_xz[1]);
  return [
    [28.4,1.05,40.1],[28.65,1.05,40.1],[33.15,3.45,40.1],
    [34.65,3.45,40.1],[34.65,3.45,43.9],[33.15,3.45,43.9],
    [28.65,5.85,43.9],[28.5,5.85,43.9],[28.5,5.85,44.15],
    [34.95,5.85,44.15],[34.95,5.85,39.85],[26.85,5.85,39.85],
    [26.85,5.85,42.35],[28.5,5.85,42.35],
    [28.65,5.85,42.35],[33.15,3.45,42.35],[33.3,3.45,42.35],
    [33.3,3.45,41.7],[33.15,3.45,41.7],[28.65,1.05,41.7],[28.4,1.05,41.7],
  ].map(([x,y,z])=>[x*side,y,z]);
}
export function palaceStairRails(stair:Stair):Part[]{
  const path=stairRailPath(stair),parts:Part[]=[],newels:Box[]=[],balusters:Box[]=[],points:P3[]=[];
  const add=(id:string,material:string,data:Part['data'],solid=false)=>parts.push({id:stair.id+':'+id,material,data,solid,detail:false});
  const base=(q:P3)=>{
    if(q[1]>5.84)return 4.8;
    const surfaces=[...stair.steps,...stair.landings].filter(s=>q[0]>=s.bounds_xz[0]-1e-6&&q[0]<=s.bounds_xz[1]+1e-6&&q[2]>=s.bounds_xz[2]-1e-6&&q[2]<=s.bounds_xz[3]+1e-6&&s.top_y<q[1]-.5);
    return surfaces.length?Math.max(...surfaces.map(s=>s.top_y)):0;
  };
  // The short horizontal easing pieces use the adjacent newel, not doubled posts.
  const newelNodes=[0,2,3,4,5,8,9,10,11,12,13,16,17,20];
  for(const index of newelNodes){const q=path[index],[x,y,z]=q;points.push(q);newels.push([x-.11,x+.11,base(q)-.025,y+.14,z-.11,z+.11]);}
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]),count=Math.ceil(length/.3);
    for(let j=1;j<count;j++){
      const q=a.map((v,k)=>v+(b[k]-v)*j/count) as P3;
      if(points.some(p=>Math.hypot(p[0]-q[0],p[2]-q[2])<.16&&Math.abs(p[1]-q[1])<.3))continue;
      const [x,y,z]=q;balusters.push([x-.065,x+.065,base(q)-.015,y-.065,z-.065,z+.065]);
    }
    add('guard-collider'+i,'hidden',rampGeometry(a,b,.12,1.1),true);
  }
  add('continuous-handrail','oak',handrailGeometry(path,.2,.18));
  add('newels','oak',unionBoxes(newels,geometry(),true));
  add('stair-balusters','oak',unionBoxes(balusters,geometry(),true));
  add('newel-ironwork','iron',unionBoxes(points.map(([x,y,z])=>[x-.118,x+.118,y-.18,y-.11,z-.118,z+.118] as Box)));
  // The landing bears on a rear crossbeam and two masonry piers, outside the
  // walking route. Its underside no longer hangs unsupported in the room.
  const side=Math.sign(stair.bounds_xz[0]+stair.bounds_xz[1]),x=side*34.55;
  add('landing-bearers','trim',unionBoxes([
    [x-.28,x+.28,1.5,1.8,40,44],
    [x-.28,x+.28,0,1.5,40,40.5],[x-.28,x+.28,0,1.5,43.5,44],
  ]),true);
  return parts;
}

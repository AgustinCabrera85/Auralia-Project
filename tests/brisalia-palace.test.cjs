const assert=require('node:assert/strict');
const {PALACE_PLAN:p}=require('../.test-build/world/palace/BrisaliaPalacePlan.js');
const {buildPalaceModel}=require('../.test-build/world/palace/PalaceModel.js');
const {palaceFurnishing}=require('../.test-build/world/palace/PalaceFurnishing.js');
const {roofGeometry,slabBoxes,unionBoxes,turnedGeometry,inPoly}=require('../.test-build/world/palace/PalaceGeometry.js');
const {palaceWorld,palaceLocal,palaceSiteHeight,PALACE_SCALE}=require('../.test-build/world/palace/PalaceSite.js');
const {expandGeometry,expandX,expandZ}=require('../.test-build/world/palace/PalaceExpansion.js');
const {PALACE_OPENINGS,PALACE_COLUMNS}=require('../.test-build/world/palace/PalaceLayout.js');
const {palaceSurfaceMaps}=require('../.test-build/world/palace/PalaceSurfaceMaps.js');
const {stairRailPath}=require('../.test-build/world/palace/PalaceStairRails.js');
const {COURTYARD_EAVE:eave}=require('../.test-build/world/palace/PalaceRoof.js');
function projectedArea(g){let sum=0;for(let i=0;i<g.indices.length;i+=3){const [a,b,c]=g.indices.slice(i,i+3).map(n=>g.positions.slice(n*3,n*3+3));sum+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/2;}return sum;}
for(const roof of p.roofs){const [x0,x1,z0,z1]=roof.bounds_xz,expected=(x1-x0)*(z1-z0)-roof.cutouts_xz.reduce((s,r)=>s+(r[1]-r[0])*(r[3]-r[2]),0),g=roofGeometry(roof);assert.ok(Math.abs(projectedArea(g)-expected)<1e-5,roof.id+': roof has holes or double faces');}
for(const s of p.slabs){const boxes=slabBoxes(s.outer,s.holes,s.bottom_y,s.top_y);assert.ok(!boxes.some(b=>b[0]<0&&b[1]>0&&b[4]<29&&b[5]>29),'Courtyard filled');}
// Two overlapping slabs union to a 3x1 top, instead of four square metres.
const union=unionBoxes([[0,2,0,1,0,1],[1,3,0,1,0,1]]);assert.ok(Math.abs(projectedArea(union)-6)<1e-7);
const model=buildPalaceModel();palaceFurnishing(model.parts,model.doors);
// Architectural lining must not pop with a jump or wrap the exterior in oak.
const lining=model.parts.find(p=>p.id==='PA:skirting');assert.equal(lining.detail,false);
for(let i=0;i<lining.data.positions.length;i+=3){const [x,,z]=lining.data.positions.slice(i,i+3);assert.ok(x>=-35.8-1e-6&&x<=35.8+1e-6&&z>=.2-1e-6&&z<=55.8+1e-6,'Interior oak protrudes through the exterior wall');}
for(const stair of p.stairs){
 const path=stairRailPath(stair),g=model.parts.find(p=>p.id===stair.id+':continuous-handrail').data,edges=new Map();
 for(let i=0;i<g.indices.length;i+=3)for(let j=0;j<3;j++){
  const key=[g.indices[i+j],g.indices[i+(j+1)%3]].map(n=>g.positions.slice(n*3,n*3+3).map(v=>v.toFixed(5)).join(',')).sort().join('|');edges.set(key,(edges.get(key)||0)+1);
 }
 assert.ok([...edges.values()].every(n=>n===2),'Open or doubled joint in '+stair.id+' handrail');
 assert.ok(path.some((q,i)=>i&&q[2]===42.35&&path[i-1][2]===42.35&&Math.abs(q[0]-path[i-1][0])>1.6),'Upper landing guard is missing');
}
const galleryBeam=model.parts.find(p=>p.id==='gallery-beams').data;
for(let i=0;i<galleryBeam.positions.length;i+=3)assert.ok(Math.abs(galleryBeam.positions[i+1]-4.8)>1e-6,'Oak beam shares the paving plane');
const roof=expandGeometry(model.parts.find(p=>p.id==='roof-shell').data),roofArea=(expandX(36.8)-expandX(-36.8))*(expandZ(56.8)-expandZ(-.8))-(expandX(eave.right)-expandX(eave.left))*(expandZ(eave.back)-expandZ(eave.front));
assert.ok(Math.abs(projectedArea(roof)-roofArea)<1e-4,'Roof has holes or stacked surfaces: '+projectedArea(roof)+' / '+roofArea);
assert.equal(expandX(16)-expandX(-16),40);assert.equal(expandZ(40)-expandZ(18),32);
assert.equal(expandX(20)-expandX(-20),48);assert.equal(expandZ(56)-expandZ(44),16);
assert.equal(model.doors.length,73);assert.equal(model.anchors.length,33);
for(const upper of PALACE_OPENINGS.PA.filter(o=>o.kind==='window'&&o.center_xyz[2]===0))assert.ok(PALACE_OPENINGS.PB.some(o=>o.kind==='window'&&o.center_xyz[0]===upper.center_xyz[0]&&o.center_xyz[2]===0),'Unaligned '+upper.id);
for(const o of [...PALACE_OPENINGS.PB,...PALACE_OPENINGS.PA].filter(o=>o.kind==='door'))for(const c of PALACE_COLUMNS){
  const axis=o.span_axis==='X'?0:1,at=o.center_xyz[axis===0?0:2],cross=o.center_xyz[axis===0?2:0];
  if(Math.abs(c.center_xz[1-axis]-cross)>4.05)continue;
  assert.ok(Math.abs(c.center_xz[axis]-at)>o.width/2+.37,'Column obstructs approach '+o.id+' / '+c.id);
}
for(const b of model.parts.filter(p=>p.material==='banner'))assert.equal(new Set(b.data.positions.filter((_,i)=>i%3===2)).size,1,'Flag has thickness');
// On each long timber face, grain V must follow the longitudinal axis, including
// the bottom faces visible from inside. Expansion must retain that orientation.
for(const [axis,box] of [[0,[-20,20,4.2,4.5,27.8,28.2]],[1,[-.2,.2,0,4.5,27.8,28.2]],[2,[-.2,.2,4.2,4.5,10,55]]]){
 const timber=unionBoxes([box],undefined,true);
 for(const g of [timber,expandGeometry(timber)])for(let n=0;n<g.positions.length/3;n++){
  if(Math.abs(g.normals[n*3+axis])>.5)continue;
  assert.ok(Math.abs(g.uvs[n*2+1]-g.positions[n*3+axis]/2)<1e-6,'Cross-grain on timber axis '+axis);
 }
}
for(const kind of ['oak','limestone','cutstone','whiteMarble','stucco','terracotta','cloth','marble']){
 const maps=palaceSurfaceMaps(kind,128);assert.ok(maps.height.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 for(let i=0;i<maps.normalHeight.length;i+=4){const n=maps.normalHeight.slice(i,i+3).map(v=>v);assert.ok(Math.abs(Math.hypot(...Array.from(n,v=>v/127.5-1))-1)<.015,'Invalid tangent normal '+kind);}
}
assert.ok(!model.parts.some(p=>p.id==='facade-bands0.03'),'Base band obstructs threshold');
assert.ok(!model.parts.some(p=>/^pilaster|^capital/.test(p.id)),'Old pilasters overlap the finished corner quoins');
const balconySlab=model.parts.find(p=>p.id==='portico-balcony-slab');assert.ok(balconySlab?.solid,'Portico columns have no supporting balcony slab');
assert.ok(Math.min(...balconySlab.data.positions.filter((_,i)=>i%3===2))<=-1.1,'Balcony floor does not reach its front guardrail');
// The soffit is a complete downward-facing roof, not just double-sided tiles.
const shell=model.parts.find(p=>p.id==='roof-shell').data,soffit=model.parts.find(p=>p.id==='roof-soffit').data;
assert.ok(Math.abs(projectedArea(shell)-projectedArea(soffit))<1e-5,'Roof underside has a sight hole');
assert.ok(soffit.normals.filter((_,i)=>i%3===1).every(y=>y<0),'Soffit faces away from the viewer below');
assert.ok(model.parts.find(p=>p.id==='roof-fascia').data.indices.length>0,'Roof has open paper-thin eaves');
// A column is an assembly with one axis. The piecewise building enlargement
// must not displace or widen its square plinth/capital relative to the shaft.
for(const c of PALACE_COLUMNS)for(const [lo,hi] of c.segments_y){
 const center=[expandX(c.center_xz[0]),expandZ(c.center_xz[1])];
 for(const suffix of [':column',':column-plinth',':column-collider']){
  const part=model.parts.find(p=>p.id===c.id+suffix+lo),g=expandGeometry(part.data,part.rigid);
  for(const [k,axis] of [0,2].entries()){
   const v=g.positions.filter((_,i)=>i%3===axis);
   assert.ok(Math.abs((Math.min(...v)+Math.max(...v))/2-center[k])<1e-6,c.id+suffix+': off-axis column assembly');
  }
 }
}
// A rail must reach the round shaft. Oversized square sockets left a gap,
// especially along the axis stretched from 22 to 32 metres.
const joined=expandGeometry(model.parts.find(p=>p.id==='courtyard:joined-rails').data);
const railCovers=(x,z)=>{
 for(let i=0;i<joined.indices.length;i+=3){
  const ids=joined.indices.slice(i,i+3);if(!ids.every(n=>Math.abs(joined.positions[n*3+1]-5.9)<1e-6))continue;
  const q=ids.map(n=>[joined.positions[n*3],joined.positions[n*3+2]]);
  const signs=q.map((a,j)=>{const b=q[(j+1)%3];return (b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);});
  if(signs.every(s=>s>=-1e-7)||signs.every(s=>s<=1e-7))return true;
 }return false;
};
for(const c of PALACE_COLUMNS){
 const x=expandX(c.center_xz[0]),z=expandZ(c.center_xz[1]);
 for(const s of [-1,1]){
  if(Math.abs(x)===20&&z+s*.24>=18&&z+s*.24<=50)assert.ok(railCovers(x,z+s*.24),'Rail is detached from '+c.id);
  if((z===18||z===50)&&Math.abs(x+s*.24)<=20)assert.ok(railCovers(x+s*.24,z),'Rail is detached from '+c.id);
 }
}
// The courtyard timber verge projects beyond the plaster ceiling edge and
// closes against the flat soffit, leaving no coplanar material competition.
const fascia=model.parts.find(p=>p.id==='roof-fascia').data;
for(const [axis,edge,ceiling] of [[0,eave.left,-16],[0,eave.right,16],[2,eave.front,18],[2,eave.back,40]]){
 assert.ok(Math.abs(edge-ceiling)>=.5,'Eave occupies the ceiling edge');
 const ys=[];
 for(let i=0;i<fascia.indices.length;i+=3){
  const ids=fascia.indices.slice(i,i+3);
  if(ids.every(n=>Math.abs(fascia.positions[n*3+axis]-edge)<1e-6))ys.push(...ids.map(n=>fascia.positions[n*3+1]));
 }
 assert.ok(ys.length&&Math.abs(Math.min(...ys)-8.9)<1e-6&&Math.abs(Math.max(...ys)-9.2)<1e-6,'Incomplete courtyard fascia');
}
const gable=model.parts.find(p=>p.id==='pavilion-gables').data,r=p.roofs[0],mid=(r.bounds_xz[0]+r.bounds_xz[1])/2;
for(let i=0;i<gable.positions.length;i+=3){
 const [x,y]=gable.positions.slice(i,i+2),roofY=r.ridge_y-Math.abs(x-mid)*(r.ridge_y-r.eave_y)/(mid-r.bounds_xz[0]);
 assert.ok(y<=roofY-.18+1e-6,'Plaster gable intersects timber verge');
}
// Backface culling must expose the top to the sky and the underside below.
for(const g of [shell,soffit,fascia])for(let i=0;i<g.indices.length;i+=3){
 const ids=g.indices.slice(i,i+3),[a,b,c]=ids.map(n=>g.positions.slice(n*3,n*3+3)),n=g.normals.slice(ids[0]*3,ids[0]*3+3),u=b.map((v,j)=>v-a[j]),v=c.map((x,j)=>x-a[j]);
 const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 assert.ok(cross.reduce((s,x,j)=>s+x*n[j],0)<1e-8,'Roof has reversed triangle winding');
}
for(const plan of Object.values(p.levels))for(const room of plan.rooms){
 const g=model.parts.find(p=>p.id===room.id+':ceiling-beams')?.data;if(!g)continue;
 const xs=g.positions.filter((_,i)=>i%3===0),zs=g.positions.filter((_,i)=>i%3===2),[x0,x1,z0,z1]=room.bounds_xz;
 assert.ok(Math.min(...xs)<=x0+.06&&Math.max(...xs)>=x1-.06&&Math.min(...zs)<=z0+.06&&Math.max(...zs)>=z1-.06,room.id+': beam ends are not embedded in the walls');
}
// No architrave is allowed to occupy the wall's reveal plane: this was the
// cause of the changing grey triangles on jambs and lintels.
for(const [level,plan] of Object.entries(p.levels)){
 const g=model.parts.find(p=>p.id===level+':casings').data;
 for(const o of PALACE_OPENINGS[level]){
  const w=plan.walls.find(w=>w.id===o.wall_id),axis=o.span_axis==='X'?0:2,cross=axis===0?2:0,at=o.center_xyz[axis],c=o.center_xyz[cross];
  for(let i=0;i<g.positions.length;i+=3){
   const q=g.positions.slice(i,i+3),reveal=Math.abs(q[axis]-at+o.width/2)<1e-6||Math.abs(q[axis]-at-o.width/2)<1e-6;
   if(reveal&&q[1]>o.bottom_y+1e-6&&q[1]<o.bottom_y+o.height-1e-6)assert.ok(Math.abs(q[cross]-c)>=w.thickness/2-1e-6,o.id+': casing duplicates plaster reveal');
  }
 }
}
// Both guard posts and flight balusters must start on a tread or landing.
for(const stair of p.stairs)for(const kind of ['newels','stair-balusters']){
 const g=model.parts.find(p=>p.id===stair.id+':'+kind).data,embed=kind==='newels'?.025:.015;
 for(let i=0;i<g.indices.length;i+=3){
  const ns=g.indices.slice(i,i+3);if(g.normals[ns[0]*3+1]>-.9)continue;
  const q=[0,1,2].map(a=>ns.reduce((s,n)=>s+g.positions[n*3+a],0)/3),y=q[1]+embed;
  if(Math.abs(y-4.8)<1e-5){assert.ok(!inPoly(stair.upper_floor_hole_xz,q[0],q[2]),'Upper guard post stands in the stair opening');continue;}
  const surfaces=[...stair.steps,...stair.landings].filter(s=>q[0]>=s.bounds_xz[0]-.07&&q[0]<=s.bounds_xz[1]+.07&&q[2]>=s.bounds_xz[2]&&q[2]<=s.bounds_xz[3]);
  assert.ok(surfaces.some(s=>Math.abs(y-s.top_y)<1e-5),'Floating '+stair.id+' '+kind);
 }
}
// Non-uniform enlargement must retain distinct smooth vertex normals.
const round=expandGeometry(turnedGeometry(8,28,[[.2,0],[.2,2]],16,true));
assert.ok(round.indices.some((n,i)=>i%3===0&&Math.abs(round.normals[n*3]-round.normals[round.indices[i+1]*3])>1e-3),'Expansion flattened curved surface normals');
for(const stair of p.stairs){
 const g=model.parts.find(p=>p.id===stair.id+':visible-treads1').data,flight=stair.collision_ramps[1];
 for(let i=0;i<g.positions.length;i+=3)if(g.normals[i+1]<-.5){
  const rampY=flight.start_xyz[1]+(g.positions[i]-flight.start_xyz[0])*(flight.end_xyz[1]-flight.start_xyz[1])/(flight.end_xyz[0]-flight.start_xyz[0]);
  assert.ok(Math.abs(rampY-g.positions[i+1]-.3)<1e-6,'Stair flight has a hanging solid block instead of an inclined slab');
 }
}
for(const part of model.parts){const g=part.data;assert.ok(g.positions.every(Number.isFinite)&&g.uvs.every(Number.isFinite)&&g.normals.every(Number.isFinite),part.id+': invalid geometry/UV');assert.ok(g.indices.length%3===0);}
const point=palaceWorld(0,-16),local=palaceLocal(point.x,point.z);assert.ok(Math.abs(local.z+16)<1e-8);
assert.ok(palaceSiteHeight(point.x,point.z,40,50)<50-.7*PALACE_SCALE,'Soil intersects plaza');
console.log(JSON.stringify({roofs:p.roofs.length,doors:model.doors.length,rooms:model.anchors.length,parts:model.parts.length,triangles:model.parts.reduce((s,p)=>s+p.data.indices.length/3,0)}));

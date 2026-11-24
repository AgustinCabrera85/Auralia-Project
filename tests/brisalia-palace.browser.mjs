import {ArcRotateCamera,FreeCamera,Matrix,Vector3,Ray} from '@babylonjs/core';
import {PALACE_PLAN} from '/src/world/palace/BrisaliaPalacePlan.ts';
import {PALACE_SCALE,palaceWorld} from '/src/world/palace/PalaceSite.ts';
import {PALACE_OPENINGS} from '/src/world/palace/PalaceLayout.ts';
import {CharacterTraversalController} from '/src/game/CharacterTraversalController.ts';
const assert=(v,m)=>{if(!v)throw Error(m);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const w=()=>window.__auraliaGame.world;
const wp=(x,y,z)=>{const p=palaceWorld(x,z);return new Vector3(p.x,w().brisaliaPalace.floorHeight+y*PALACE_SCALE,p.z);};
export async function visit(){
 const world=w();assert(!world.brisaliaPalace.loaded,'Palace was loaded unnecessarily at town startup');
 const place=world.geographicWorld.destination('palacio-brisalia');await world.travelGeographic(place.x,place.z,place.name,place);
 for(let i=0;i<240&&!world.geographicStatus.ready;i++)await sleep(250);
 assert(world.brisaliaPalace.loaded,'Palace failed to load: '+world.brisaliaPalace.error);
 const fountain=world.brisaliaPalace.fountain;
 assert(!fountain.error,'Fountain asset failed');
 const bounds=fountain.meshes.map(m=>m.getBoundingInfo().boundingBox),height=Math.max(...bounds.map(b=>b.maximumWorld.y))-Math.min(...bounds.map(b=>b.minimumWorld.y));
 assert(Math.abs(height/PALACE_SCALE-2.5)<.01,'Fountain does not match the plan height');
 world.climate.setElapsedHours(10);return {position:world.player.position.asArray(),stats:world.brisaliaPalace.stats};
}
export async function view(name='overview'){
 const world=w(),p=world.brisaliaPalace;
 world.engine.stopRenderLoop();
 const presets={overview:[0,28,112,.48,Math.PI/2+.2],front:[0,-5,68,1.3,Math.PI/2],court:[0,29,34,1.1,-Math.PI/2+.5],hall:[0,9,13,1.18,Math.PI/2+.7],upper:[0,46,17,1.1,Math.PI/2+.5],stairs:[-30,42,15,1.12,Math.PI/2+.2]};
 const [x,z,r,b,a]=(presets[name]??presets.hall),y=name==='upper'?6:name==='overview'?5:2;
 world.player.position.copyFrom(wp(x,y-2,z));p.update(1,world.player.position,0);
 const interiors={court:[[12,2.2,37],[-9,4.5,21]],hall:[[7.7,1.85,12],[0,2,3]],upper:[[4.8,6.65,54],[0,6.8,45]],stairs:[[-25,1.85,39],[-33,2.7,42.5]],ceiling:[[0,1.8,7],[0,4.4,7.01]],bedroom:[[-31.5,6.65,8.5],[-33,6.4,5]],bathroom:[[-34.5,6.65,3],[-35,6.1,1]],audience:[[0,1.85,45.4],[0,2.3,55.8]],'audience-ceiling':[[0,1.8,50],[0,4.4,50.01]],flag:[[-6,5.5,35],[-8,5.5,39.62]],'facade-close':[[8,1.85,-8],[0,4.5,0]]};
 let camera;
 interiors['stair-top']=[[-26,6.65,43],[-32,4.7,41]];
 interiors['gallery-close']=[[-18,6.65,35],[-20.7,6.2,29]];
 interiors['beam-joint']=[[-30,6.65,22],[-35.8,8.7,20]];
 interiors['gallery-rail']=[[-18,6.65,29],[-15,6,34]];
 interiors['roof-below']=[[33,1.85,-6],[32,10.2,0]];
 interiors['gallery-night']=[[-18,6.65,35],[-17,6.3,27]];
 interiors['stair-side']=[[-26.5,3.6,41],[-33,3.5,43]];
 interiors['portico-support']=[[14,2,-5],[9.55,4.6,-.58]];
 interiors['stair-landing']=[[-30.5,5.2,41.9],[-34,2.5,42]];
 interiors['stair-arrival']=[[-26,7.7,45],[-29,4.8,42]];
 interiors['gallery-floor']=[[-18,6.5,32],[-16,4.8,29]];
 interiors['column-close']=[[-18,6.4,33],[-16,6.3,31.2]];
 interiors['facade-standing']=[[18,1.85,-7],[21,5.3,0]];
 interiors['facade-jump']=[[18,3.6,-7],[21,5.3,0]];
 interiors['court-eave-low']=[[8,1.85,29],[0,9.1,18]];
 interiors['court-eave-upper']=[[10,6.65,29],[0,9.1,18]];
 interiors['court-eave-above']=[[10,12,29],[0,9.1,18]];
 interiors['court-eave-corner']=[[-12,6.6,22],[-16,8.9,18]];
 interiors['column-base']=[[-17.5,5.7,32.5],[-16,5.05,31.2]];
 interiors['column-capital']=[[-17.5,7.8,32.5],[-16,8.4,31.2]];
 world.climate.setElapsedHours(name==='gallery-night'?0:10);
 if(interiors[name]){const [eye,target]=interiors[name];world.player.position.copyFrom(wp(eye[0],eye[1]-1.85,eye[2]));p.update(1,world.player.position,0);camera=new FreeCamera('palace-review-'+name,wp(...eye),world.scene);camera.setTarget(wp(...target));camera.fov=name==='audience'?1.5:1.4;}
 else camera=new ArcRotateCamera('palace-review-'+name,a,b,r*PALACE_SCALE,wp(x,y,z),world.scene);
 camera.minZ=.05;camera.maxZ=6000;world.scene.activeCamera=camera;
 world.player.setEnabled(false);
 for(let i=0;i<8;i++){world.scene.render();await sleep(100);}
}
export function check(){
 const world=w(),p=world.brisaliaPalace,results={rooms:[],stairs:[],doors:[],stats:p.stats};
 world.engine.stopRenderLoop();
 assert(p.doors.length===73,'Expected 70 room doors plus 3 WC doors, got '+p.doors.length);
 assert(world.village.buildings.get('B28').root.metadata.region==='nacar','Old palace was overwritten');
 for(const [level,plan] of Object.entries(PALACE_PLAN.levels))for(const room of plan.rooms){
  const [x,y,z]=room.navigation_anchor_xyz,at=wp(x,y,z),floor=p.collision.ground(at.x,at.z,at.y+.35,.7);
  // Stair anchors are circulation markers, not necessarily a tread centre.
  if(room.kind==='stairs')continue;
  assert(floor&&Math.abs(floor.height-at.y)<.05,room.id+': missing floor at navigation anchor');
  assert(p.collision.headroom(at.x,at.y+.02,at.z,3.8),room.id+': blocked headroom');results.rooms.push(room.id);
 }
 const input=(dx,dz)=>({moveX:dx,moveZ:dz,forwardX:dx,forwardZ:dz,horizontal:0,vertical:1,run:false,sprint:false,jumpPressed:false});
 const walk=(points,id)=>{
  const c=new CharacterTraversalController(),start=points[0];c.teleport(start.x,start.y+.01,start.z);
  for(const target of points.slice(1)){
   let frame=0;for(;frame<600;frame++){
    const pos=c.position,d=target.subtract(new Vector3(pos.x,pos.y,pos.z));d.y=0;if(d.length()<.15)break;d.normalize();
    c.step(1/60,input(d.x,d.z),world.traversalWorld(world.zones.get('brisalia'),pos.y,true));
   }
   assert(frame<600,`${id}: stuck ${JSON.stringify(c.position)} toward ${target.asArray()}`);
  }
  assert(Math.abs(c.position.y-points.at(-1).y)<.15,id+': wrong final floor');return {id,position:c.position};
 };
 for(const sign of [-1,1]){
  const points=[[27.5,0,40.9],[33.8,2.4,40.9],[33.8,2.4,43.1],[27.5,4.8,43.1],[26.4,4.8,43.1]].map(([x,y,z])=>wp(x*sign,y,z));
  results.stairs.push(walk(points,'stairs'+sign+'up'),walk([...points].reverse(),'stairs'+sign+'down'));
 }
 const front=[wp(0,-.59,-6),wp(0,0,-1),wp(0,0,4)];results.stairs.push(walk(front,'front-up'),walk([...front].reverse(),'front-down'));
 const approaches=[];
 for(const id of ['PB-D011','PB-D012','PB-D013','PB-D014','PB-D015','PB-D016','PB-D017','PB-D028']){
   const o=PALACE_OPENINGS.PB.find(o=>o.id===id),[x,,z]=o.center_xyz;
   let target;if(z===14)target=wp(x,x===0?0:-.08,20);else if(z===44)target=wp(x,x===0?0:-.08,38);else target=wp(x>0?14:-14,-.08,z);
   approaches.push(walk([wp(x,0,z),target],id+'-courtyard'));
 }results.approaches=approaches;
 for(const part of p.parts)if(part.hidden)assert(!part.mesh.isVisible&&part.mesh.visibility===0&&!part.mesh.isPickable,'A collision mesh became visible');
 // Exercise the exact two failures from the player's captures: the short
 // landing edge was open, and facade lining popped when the player jumped.
 for(const sign of [-1,1]){
  const a=wp(sign*27.7,5.3,42.8),b=wp(sign*27.7,5.3,41.7),delta=b.subtract(a);
  assert(p.collision.cast(new Ray(a,delta.normalizeToNew(),delta.length())),'Missing upper landing guard '+sign);
 }
 for(const y of [0,.5,1,2,3,4,4.8,6]){
  p.update(1,wp(18,y,-7),0);
  assert(p.parts.filter(q=>!q.detail&&!q.hidden).every(q=>q.mesh.isVisible),'Architecture disappears at player height '+y);
 }
 for(const name of ['stone','plaster','roof','oak','paving','banner','column']){
   const m=p.materials.get(name);assert(m.getClassName()==='PBRMaterial'&&m.bumpTexture&&m.metallicTexture,name+': missing PBR maps');
   assert(m.getActiveTextures().every(t=>t.isReady()),name+': PBR texture failed to load');
 }
 assert(!p.materials.get('banner').backFaceCulling,'Flag must show both faces of one plane');
 // Clear aperture, real leaf collider, and both travel directions for every door.
 for(const d of p.doors){
  const origin=d.root.getAbsolutePosition(),normal=Vector3.TransformNormal(new Vector3(0,0,1),d.root.getWorldMatrix()).normalize();
  const across=Vector3.TransformNormal(new Vector3(.12,0,0),d.root.getWorldMatrix());
  const center=origin.add(new Vector3(0,2,0)).add(across),a=center.subtract(normal.scale(1.6)),ray=new Ray(a,normal,3.2);
  assert(!p.collision.cast(ray),d.id+': an open door still blocks its centre');
  for(const l of d.leaves){l.pivot.rotation.y=0;l.pivot.computeWorldMatrix(true);for(const m of l.pivot.getChildMeshes())m.computeWorldMatrix(true);}
  assert(p.collision.cast(ray),d.id+': closed leaf has no collider');
  for(const l of d.leaves){l.pivot.rotation.y=l.target;l.pivot.computeWorldMatrix(true);for(const m of l.pivot.getChildMeshes())m.computeWorldMatrix(true);}
  results.doors.push(d.id);
 }
 const crossings=[];
 for(const openings of Object.values(PALACE_OPENINGS))for(const o of openings){
  if(o.kind!=='door')continue;
  const [nx,nz]=o.open_normal_xz,at=wp(o.center_xyz[0],o.bottom_y,o.center_xyz[2]),n=new Vector3(-nx,0,-nz);
  const a=at.subtract(n.scale(1.05)),b=at.add(n.scale(1.05));
  // The facade doors open onto a real terrace; interior doors share floor levels.
  crossings.push(walk([a,b],o.id+'cross'),walk([b,a],o.id+'return'));
 }
 results.crossings=crossings;
 return results;
}
export async function performanceCheck(){
 const world=w(),p=world.brisaliaPalace;
 await view('front');const sample=async enabled=>{p.root.setEnabled(enabled);for(let i=0;i<6;i++)world.scene.render();const times=[],draws=[];
  for(let i=0;i<40;i++){await new Promise(requestAnimationFrame);const t=performance.now(),before=world.engine._drawCalls.current;world.scene.render();times.push(performance.now()-t);draws.push(world.engine._drawCalls.current-before);}
  times.sort((a,b)=>a-b);return {cpuRenderMedianMs:times[20],cpuRenderP95Ms:times[38],drawCalls:Math.round(draws.reduce((a,b)=>a+b,0)/draws.length)};};
 const visible=await sample(true),hidden=await sample(false);p.root.setEnabled(true);
 p.update(1,new Vector3(world.geographicWorld.town.x,0,world.geographicWorld.town.z),0);assert(!p.root.isEnabled(),'Palace still renders from the village');
 return {visible,hidden,hiddenFromVillage:!p.root.isEnabled(),triangles:p.stats.triangles,batches:p.stats.batches};
}
export async function roofProbe(){
 await view('front');const world=w(),camera=world.scene.activeCamera,root=world.brisaliaPalace.root,inv=root.getWorldMatrix().clone().invert();
 return [[570,262],[875,262],[720,270]].map(([x,y])=>{
  const ray=world.scene.createPickingRay(x,y,Matrix.Identity(),camera);
  return {x,y,hits:world.scene.multiPickWithRay(ray,m=>m.isVisible&&m.isEnabled()&&m.name.startsWith('palace:')).sort((a,b)=>a.distance-b.distance).slice(0,3).map(h=>({name:h.pickedMesh.name,local:Vector3.TransformCoordinates(h.pickedPoint,inv).asArray(),normal:h.getNormal(true)?.asArray(),dot:h.getNormal(true)?.dot(ray.direction)}))};
 });
}
export function roofContinuity(){
 const world=w(),p=world.brisaliaPalace,samples=[[-15.75,30],[15.75,30],[3,18.25],[3,39.75]],hits=[];
 const cast=(a,b,material,label)=>{
  const delta=b.subtract(a),ray=new Ray(a,delta.normalize(),Vector3.Distance(a,b));
  const hit=world.scene.pickWithRay(ray,m=>m.isVisible&&m.isEnabled()&&m.name.startsWith('palace:'));
  assert(hit?.hit&&hit.pickedMesh.name.startsWith('palace:'+material+':'),label+': missing '+material+' face');
  assert(hit.getNormal(true).dot(ray.direction)<-.05,label+': face points away from the viewer');
  hits.push(label);
 };
 for(const height of [0,4.8,6,10]){
  world.player.position.copyFrom(wp(0,height,29));p.update(1,world.player.position,0);
  for(const [i,[x,z]] of samples.entries()){
   cast(wp(x,16,z),wp(x,9.1,z),'roof',height+':top'+i);
   cast(wp(x,8.6,z),wp(x,9.1,z),'oak',height+':soffit'+i);
   cast(wp(0,9.05,29),wp(x,9.05,z),'oak',height+':fascia'+i);
  }
 }
 return {surfaceChecks:hits.length,playerHeights:4,courtyardSides:4};
}
export async function surfaceProbe(){
 await view('stair-top');const world=w(),p=world.brisaliaPalace,inv=p.root.getWorldMatrix().clone().invert();
 const {buildPalaceModel}=await import('/src/world/palace/PalaceModel.ts');
 const {palaceFurnishing}=await import('/src/world/palace/PalaceFurnishing.ts');
 const {expandGeometry}=await import('/src/world/palace/PalaceExpansion.ts');
 const {parts,doors}=buildPalaceModel();palaceFurnishing(parts,doors);
 const source=parts.filter(p=>p.material!=='hidden').map(p=>({...p,data:p.expanded?p.data:expandGeometry(p.data,p.rigid,p.material==='banner')}));
 return [[1035,445],[1040,490],[1025,540],[980,610],[700,445],[1030,390]].map(([x,y])=>{
  const ray=world.scene.createPickingRay(x,y,Matrix.Identity(),world.scene.activeCamera),local=Ray.Transform(ray,inv),hits=[];
  for(const part of source){const g=part.data;let nearest=Infinity;
   for(let i=0;i<g.indices.length;i+=3){const ps=g.indices.slice(i,i+3).map(n=>Vector3.FromArray(g.positions,n*3)),h=local.intersectsTriangle(...ps);if(h&&h.distance>0)nearest=Math.min(nearest,h.distance);}
   if(Number.isFinite(nearest))hits.push({id:part.id,material:part.material,distance:nearest});
  }
  return {x,y,hits:hits.sort((a,b)=>a.distance-b.distance).slice(0,5)};
 });
}

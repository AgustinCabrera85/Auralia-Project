import {Vector3,Ray} from '@babylonjs/core';
import {CharacterTraversalController} from '/src/game/CharacterTraversalController.ts';
import {CASTLE_ENTRIES,castleEntryHeight} from '/src/world/CastleEntryGeometry.ts';
import {groundRoads} from '/src/world/mountainTrails.ts';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
export function checkArrival(){
 const {world}=window.__auraliaGame,building=world.village.buildings.get('B28');
 assert(building,'Castle did not load');
 const results=[];
 const input=(dx,dz)=>({moveX:dx,moveZ:dz,forwardX:dx,forwardZ:dz,horizontal:0,vertical:1,run:false,sprint:false,jumpPressed:false});
 for(const [kind,c] of Object.entries(CASTLE_ENTRIES)){
  const mesh=building.meshes.find(m=>m.metadata?.castleEntry===kind);
  assert(mesh,`${kind}: missing unified entry`);
  const matrix=mesh.getWorldMatrix();
  assert(!building.meshes.some(m=>m.metadata?.sourceNames?.some(n=>n===`R5_${kind.toUpperCase()}_continuous_vault`||n===`R5_${kind.toUpperCase()}_threshold_landing`)),`${kind}: old overlapping meshes remain`);
  for(const x of [-1.8,0,1.8]){
   const probes=Array.from({length:c.steps},(_,i)=>c.front+(i+.43)*c.tread);
   probes.push(c.back-.1);
   for(const z of probes){
    const y=castleEntryHeight(kind,x,z),p=Vector3.TransformCoordinates(new Vector3(x,y,z),matrix);
    const hit=new Ray(p.add(new Vector3(0,2,0)),Vector3.Down(),4).intersectsMesh(mesh);
    assert(hit.hit&&Math.abs(hit.pickedPoint.y-p.y)<.002,`${kind}: missing/displaced tread at ${x},${z}`);
    assert(world.village.headroom(p.x,p.y+.02,p.z,3.8),`${kind}: hidden floor/triangle blocks headroom`);
   }
   // Walk inside the open door leaves; the wider tread edges were ray-tested above.
   const walkingX=x*.4;
   for(const direction of [1,-1]){
    const exit=kind==='gate'?-23.12:c.back;
    const controller=new CharacterTraversalController(),startZ=direction===1?c.front-.6:exit+.35;
    const start=Vector3.TransformCoordinates(new Vector3(walkingX,direction===1?c.base:c.top,startZ),matrix);
    // Only X/Z define the arrival; Y is resolved by production collision queries.
    const target=Vector3.TransformCoordinates(new Vector3(walkingX,0,direction===1?exit+.25:c.front-.4),matrix);
    const delta=target.subtract(start);delta.y=0;delta.normalize();
    controller.teleport(start.x,start.y,start.z);
    let frames=0;const trace=[];
    for(;frames<600;frames++){
     const p=controller.position;if(Math.hypot(p.x-target.x,p.z-target.z)<.35)break;
     const traversal=world.traversalWorld(world.zones.get('brisalia'),p.y,true);
     if(frames<120&&frames%10===0)trace.push({frame:frames,...p,mode:controller.mode,ground:traversal.ground(p.x,p.z,p.y+.6,1.5,0)});
     controller.step(1/60,input(delta.x,delta.z),traversal);
    }
    if(frames>=600){const p=controller.position,t=world.traversalWorld(world.zones.get('brisalia'),p.y,true);
      throw Error(JSON.stringify({kind,x,direction,position:p,mode:controller.mode,target:target.asArray(),trace,
        hallFloor:building.meshes.filter(m=>m.metadata?.sourceNames?.includes('AUR034_KEEP60_hall_flagstone_floor')).map(m=>({min:m.getBoundingInfo().boundingBox.minimumWorld.asArray(),max:m.getBoundingInfo().boundingBox.maximumWorld.asArray()})),
        ground:t.ground(p.x,p.z,p.y+1,3,0),nextGround:t.ground(p.x+delta.x*.18,p.z+delta.z*.18,p.y+1,3,0),
        headroom:t.headroom(p.x,p.y+.05,p.z,3.7),wall:t.wall(p.x,p.y+.7,p.z,delta.x,delta.z,.8),
        canMove:t.canMove(p.x+delta.x*.18,p.z+delta.z*.18,p.x,p.z,p.y),recovery:world.village.entryRecoveryAt(p.x,p.y,p.z)}));}
    results.push({kind,x,direction,frames});
   }
  }
  const stuck=Vector3.TransformCoordinates(new Vector3(0,c.base,c.back-.2),matrix);
  assert(world.village.entryRecoveryAt(stuck.x,stuck.y,stuck.z)!==null,`${kind}: old embedded save cannot recover`);
 }
 const trails=world.mountainPasses.trails;
 assert(!world.scene.meshes.some(m=>m.name.startsWith('senda-')||m.name.startsWith('contencion-')),'Elevated ground roads remain');
 assert(world.mainland.material.metadata.paintedRoads?.count>0,'Terrain road paint is missing');
 assert(!world.scene.meshes.some(m=>m.name.includes('arco-minero')||m.name==='descanso-entrada'),'Prototype portals remain');
 assert(world.mountainPasses.portals.size===0,'Removed portal has a visual');
 assert(world.scene.getMaterialByName('puentes-tablones-madera')?.alpha===1,'Wood bridge floor is not opaque');
 assert(world.mountainPasses.bridges.length===3,'A bridge was removed');
 assert(world.scene.meshes.some(m=>m.material?.name==='puentes-hierro-envejecido'),'Finished bridge railings are missing');
 assert(world.scene.blockMaterialDirtyMechanism===false,'Startup left material updates disabled');
 const overlaps=[];
 for(const [kind,c] of Object.entries(CASTLE_ENTRIES)){
  const entry=building.meshes.find(m=>m.metadata?.castleEntry===kind);
  for(const z of [c.back-.7,c.front+(c.steps-.5)*c.tread,...(kind==='gate'?[-29.5,-27,-24.5,-23.5]:[])]){
   const p=Vector3.TransformCoordinates(new Vector3(.4,c.top,z),entry.getWorldMatrix());
   const ray=new Ray(p.add(new Vector3(0,.1,0)),Vector3.Down(),.2);
   overlaps.push({kind,z,hits:world.scene.meshes.flatMap(m=>{if(!m.isEnabled()||m.metadata?.buildingId!=='B28')return [];const h=ray.intersectsMesh(m);
    return h.hit?[{name:m.name,y:h.pickedPoint.y,sources:m.metadata?.sourceNames,material:m.material?.name}]:[];})});
  }
 }
 assert(overlaps.every(o=>o.hits.length===1),'Coplanar castle floor faces remain: '+JSON.stringify(overlaps));
 const gate=building.meshes.find(m=>m.metadata?.castleEntry==='gate'),terrainOverlaps=[];
 for(const x of [-3,-1.5,0,1.5,3])for(const z of [-28.8,-27.5,-26,-24.1]){
  const p=Vector3.TransformCoordinates(new Vector3(x,1.35,z),gate.getWorldMatrix()),ray=new Ray(p.add(new Vector3(0,.1,0)),Vector3.Down(),.2);
  const hits=world.scene.meshes.flatMap(m=>{if(!m.isEnabled()||!m.isVisible||m.getTotalVertices()===0)return [];const h=ray.intersectsMesh(m);
   return h.hit?[{name:m.name,y:h.pickedPoint.y,building:m.metadata?.buildingId}]:[];});
  if(hits.length>1)terrainOverlaps.push({x,z,hits});
 }
 assert(terrainOverlaps.length===0,'Gatehouse floor overlaps existing wall sills: '+JSON.stringify(terrainOverlaps));
 return {stairs:results,paths:trails.length,bridges:world.mountainPasses.bridges.length,overlaps,terrainOverlaps};
}

export function viewEntry(kind='hall',exterior=false){
 const w=window.__auraliaGame.world,b=w.village.buildings.get('B28'),c=CASTLE_ENTRIES[kind];
 const p=Vector3.TransformCoordinates(new Vector3(0,c.top,c.back-.4),b.meshes.find(m=>m.metadata?.castleEntry===kind).getWorldMatrix());
 w.climate.setElapsedHours(10);w.player.position.copyFrom(p);w.traversal.teleport(p.x,p.y,p.z);
 w.camera.setTarget(p.add(new Vector3(0,2,0)));w.camera.alpha=-Math.PI/2+.6;w.camera.beta=1;w.camera.radius=15;
 if(exterior){w.camera.alpha+=Math.PI;w.camera.radius=25;w.camera.beta=1.15;}
}

export function viewBridge(){
 const w=window.__auraliaGame.world,route=w.mountainPasses.bridges[0],p=route.points[Math.floor(route.points.length/2)];
 w.climate.setElapsedHours(10);w.player.position.set(p.x,p.y,p.z);w.traversal.teleport(p.x,p.y,p.z);
 w.camera.setTarget(new Vector3(p.x,p.y+2,p.z));w.camera.alpha=-Math.PI/2+.5;w.camera.beta=1.15;w.camera.radius=22;
}

export async function viewRoad(){
 const w=window.__auraliaGame.world,roads=groundRoads(w.mountainPasses.trails);
 const candidates=roads.flatMap(t=>t.points.slice(3,-3));
 const p=candidates.filter(p=>w.mainland.coverageAt(p.x,p.z)).sort((a,b)=>Math.hypot(a.x-w.player.position.x,a.z-w.player.position.z)-Math.hypot(b.x-w.player.position.x,b.z-w.player.position.z))[0];
 assert(p,'No resident painted road to inspect');
 const y=w.geographicWorld.surface.heightAt(p.x,p.z);
 w.climate.setElapsedHours(10);w.player.position.set(p.x,y,p.z);w.traversal.teleport(p.x,y,p.z);
 w.camera.setTarget(new Vector3(p.x,y+2,p.z));w.camera.alpha=-Math.PI/2+.6;w.camera.beta=.75;w.camera.radius=22;
 const material=w.mainland.material,texture=material.getActiveTextures().find(t=>t.name==='terrain-road-mask'),bounds=material._vectors4.roadBounds.asArray();
 const pixels=await texture.readPixels(),size=texture.getSize(),x=Math.floor((p.x-bounds[0])/bounds[2]*size.width),z=Math.floor((p.z-bounds[1])/bounds[3]*size.height);
 const alpha=pixels[(z*size.width+x)*4+3];assert(alpha>200,'Road mask does not cover the actual dry road');
 return {point:p,bounds,size,alpha};
}

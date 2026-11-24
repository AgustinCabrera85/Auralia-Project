import {ArcRotateCamera,Vector3} from '@babylonjs/core';
import {NACAR_PALACE,inNacarPalaceFootprint} from '/src/world/geography/NacarPalace.ts';
import {CASTLE_BUILDING,BRISALIA_SCALE} from '/src/world/brisaliaLayout.ts';
import {checkArrival,viewEntry} from './arrival.browser.mjs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function visitPalace(){
  const w=window.__auraliaGame.world,place=w.geographicWorld.destination('palacio-nacar');
  await w.travelGeographic(place.x,place.z,place.name,place);
  for(let i=0;i<240&&!w.geographicStatus.ready;i++)await sleep(250);
  assert(w.geographicStatus.ready,'Nácar terrain streaming did not settle');
  assert(Math.hypot(w.player.position.x-NACAR_PALACE.x,w.player.position.z-NACAR_PALACE.z)<130,'Map travel did not arrive on island');
  assert(!inNacarPalaceFootprint(w.player.position.x,w.player.position.z,1.5),'Arrival intersects palace');
  w.climate.setElapsedHours(10);
  w.camera.alpha=Math.PI/2+.35;w.camera.beta=1.12;w.camera.radius=38;
  return {position:w.player.position.asArray(),status:w.geographicStatus};
}

export function checkPalace(){
  const w=window.__auraliaGame.world,b=w.village.buildings.get('B28'),p=b.root.position;
  assert(p.x===NACAR_PALACE.x&&p.z===NACAR_PALACE.z,'Palace stayed in Brisalia');
  assert(b.root.metadata.region==='nacar'&&b.root.scaling.x===BRISALIA_SCALE,'Scale/region changed');
  assert(w.village.buildings.size===28&&w.village.errors.length===0,'Settlement assets missing/duplicated');
  const old={x:w.geographicWorld.town.x+CASTLE_BUILDING.x,z:w.geographicWorld.town.z+CASTLE_BUILDING.z};
  for(const m of b.meshes){const c=m.getBoundingInfo().boundingBox.centerWorld;
    assert(Math.hypot(c.x-NACAR_PALACE.x,c.z-NACAR_PALACE.z)<180,'A castle mesh did not follow root');}
  assert(w.village.rainHeight(old.x,old.z)===null,'Old castle collider remains');
  assert(w.village.rainHeight(p.x,p.z)!==null,'New castle roof collider is missing');
  assert(!w.vegetationExclusions.some(e=>e.buildingId==='B28'&&Math.hypot(e.x-old.x,e.z-old.z)<200),'Old vegetation exclusion remains');
  return {position:p.asArray(),sourceMeshes:b.sourceMeshes,entries:checkArrival()};
}

export function viewPalaceOverview(){
  const w=window.__auraliaGame.world,b=w.village.buildings.get('B28');
  viewEntry('gate',true);
  // Isolated review page only: freeze follow while capturing the complete island.
  w.engine.stopRenderLoop();
  const review=new ArcRotateCamera('nacar-review',Math.PI/2+.5,.85,380,
    b.root.position.add(new Vector3(0,22,0)),w.scene);
  review.minZ=.5;review.maxZ=6000;w.scene.activeCamera=review;w.scene.render();
}

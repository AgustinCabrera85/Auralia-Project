import { LAGOON_CHANNELS,GROTTO_PORTALS,lagoonWaterAt } from '../src/world/lagoonData.ts';
import { HEADWATER_LAKE } from '../src/world/watershedHeadwaters.ts';
const check=(condition,message)=>{if(!condition)throw new Error(message);};
export async function verifyPilotWatershed(world){
  world.engine.stopRenderLoop();world.scene.activeCamera=world.camera;
  if(world.lagoon.inside)world.lagoon.leave('laguna-sumergida');
  const l=HEADWATER_LAKE;window.review.place(l.x,l.z);
  for(let i=0;i<1500;i++){
    world.update(1/60);
    if(i%80===0){world.scene.render();await new Promise(r=>setTimeout(r,2));}
  }
  check(!world.lagoon.riverBuild,'watershed geometry build finishes');
  for(let n=0;n<LAGOON_CHANNELS.length;n++){
    const mesh=world.scene.getMeshByName('vertientes-río-'+n);
    check(mesh,'every drainage reach has a visible river mesh');
    const p=mesh.getVerticesData('position');
    check(p.every(Number.isFinite),'all water vertices are finite');
    check(mesh.getTotalVertices()<15000,'each stream stays within the geometry budget');
  }
  const pool=world.scene.getMeshByName('laguna-alta-gemelas');
  check(pool&&pool.getTotalVertices()<2000,'upland lake reuses a small static mesh');
  const positions=pool.getVerticesData('position');
  for(let i=1;i<positions.length;i+=3)check(Math.abs(positions[i]-l.level-.045)<.001,'lake surface is level');
  for(const p of GROTTO_PORTALS.filter(p=>!p.submerged)){
    const water=lagoonWaterAt(p.x,p.z);
    check(!water||world.lagoon.heightAt(p.x,p.z)>water.level+1,'dry cave exits remain above water');
  }
  const counts=()=>({meshes:world.scene.meshes.length,materials:world.scene.materials.length,
    textures:world.scene.textures.length,geometries:world.scene.geometries.length,
    colliders:world.lagoon.rockColliders.activeColliderCount});
  const before=counts();
  for(let visit=0;visit<3;visit++){
    world.lagoon.update(0,1500,0,1000);
    check(world.lagoon.rockColliders.activeColliderCount===0,'unload releases rock proxies');
    world.lagoon.update(0,l.x,l.level,l.z);
    for(let i=0;i<3000&&world.lagoon.riverBuild;i++)world.lagoon.update(0,l.x,l.level,l.z);
    check(!world.lagoon.riverBuild,'revisit completes the incremental build');
    check(JSON.stringify(counts())===JSON.stringify(before),'revisits retain no extra meshes, textures or geometry');
  }
  window.review.overview(l.x+75,l.z+100,world.lagoon.heightAt(l.x+75,l.z+100)+120,l.x,l.z,l.level);
  for(let i=0;i<12;i++){world.scene.render();await new Promise(r=>setTimeout(r,100));}
  check(pool.material.getEffect()?.isReady(),'water shader compiles');
  return {channels:LAGOON_CHANNELS.length,counts:counts(),revisits:3,resourcesStable:true,dryCaveExits:true};
}

// Isolated visual fixture. Never reads or writes the player's saved game.
import { WorldView } from '../src/game/WorldView.ts';
import { GameStore } from '../src/domain/GameStore.ts';
import { newGame } from '../src/domain/types.ts';
import { setWorldDocument } from '../src/world/editor/WorldEditState.ts';
import { loadFoliageForestAssets } from '../src/world/foliageForestData.ts';
import { sampleMainlandHeight } from '../src/world/terrainData.ts';
import { FreeCamera, Vector3 } from '@babylonjs/core';
import { verifyMountainRoutes } from './mountain-routes.browser.mjs';
setWorldDocument(await(await fetch('/world/auralia-world.json')).json());
await loadFoliageForestAssets();
const store=new GameStore({load:newGame,save:()=>{},clear:()=>{}});
const noop=()=>{};
const world=new WorldView(document.querySelector('canvas'),store,{
  notify:noop,dialogue:noop,openCraft:noop,hint:noop,onTravel:noop,onBuild:noop,
  onStructureSelected:noop,onExplore:noop,onClimate:noop
},()=>false);
world.climate.clockScale=0;world.climate.forcedWeather='clear';world.climate.setElapsedHours(14);
window.review={world,store,height:sampleMainlandHeight,verifyRoutes:()=>verifyMountainRoutes(world),
  place(x,z,alpha=0,beta=1.15,radius=16){
    const y=world.walkHeightAt(x,z);
    world.traversal.teleport(x,y,z);world.player.position.set(x,y,z);
    world.camera.alpha=alpha;world.camera.beta=beta;
    world.cameraPreferredRadius=radius;world.cameraAppliedRadius=radius;
    world.camera.setTarget(new Vector3(x,y+2.05,z));world.camera.radius=radius;
    document.querySelector('#label').textContent=`Revisión · X ${x} · Z ${z}`;
  },
  overview(x,z,y,tx,tz,ty){
    if(world.scene.activeCamera!==world.camera)world.scene.activeCamera?.dispose();
    const camera=new FreeCamera('review-overview',new Vector3(x,y,z),world.scene);
    camera.minZ=.2;camera.maxZ=2300;camera.setTarget(new Vector3(tx,ty,tz));
    world.scene.activeCamera=camera;
  }
};
window.review.place(1,10,.42);

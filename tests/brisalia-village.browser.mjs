import { BRISALIA_BUILDINGS, BRISALIA_SCALE, BRISALIA_ROADS, brisaliaPlatformWeight } from '../src/world/brisaliaLayout.ts';
import { CharacterTraversalController } from '../src/game/CharacterTraversalController.ts';

/** Runs against the actual playable world, including imported geometry. */
export async function auditVillage(world){
  await world.village.ready;
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  check(world.village.errors.length===0,'Every prefab loads');
  check(world.village.buildings.size===28,'Exactly 28 unique building IDs');
  check(!world.zones.get('brisalia').root.getDescendants().some(n=>n.name==='casa-pueblo'),'Old placeholder houses removed');
  const buildings=[];
  for(const b of BRISALIA_BUILDINGS){
    const placed=world.village.buildings.get(b.id);
    check(!!placed,`${b.id} exists`);
    check(placed.root.metadata.revision===b.revision,`${b.id} loads the intended revision`);
    check(world.scene.transformNodes.filter(n=>n.name===`brisalia:${b.id}`).length===1,`${b.id} unique root`);
    check(Math.abs(placed.root.scaling.x-BRISALIA_SCALE)<1e-8,`${b.id} uses the 1.40 m Santi reference`);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const m of placed.meshes){
      m.computeWorldMatrix(true);const bounds=m.getBoundingInfo().boundingBox;
      bounds.minimumWorld.asArray().forEach((v,i)=>min[i]=Math.min(min[i],v));
      bounds.maximumWorld.asArray().forEach((v,i)=>max[i]=Math.max(max[i],v));
    }
    check(Math.abs(max[0]-min[0]-b.width)<.05,`${b.id} correct X extent`);
    check(Math.abs(max[2]-min[2]-b.depth)<.05,`${b.id} correct Z extent`);
    check(Math.abs(max[1]-min[1]-b.height)<.05,`${b.id} upright`);
    check(brisaliaPlatformWeight(b.x-b.width/2,b.z-b.depth/2)>.999,`${b.id} supported terrace`);
    buildings.push({id:b.id,boundsMin:min,boundsMax:max,batches:placed.meshes.length});
  }
  for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++){
    const a=buildings[i],b=buildings[j];
    check(a.boundsMax[0]+1<b.boundsMin[0]||b.boundsMax[0]+1<a.boundsMin[0]||
      a.boundsMax[2]+1<b.boundsMin[2]||b.boundsMax[2]+1<a.boundsMin[2],`${a.id}/${b.id} separated`);
  }
  const o=world.geographicWorld.town,S=BRISALIA_SCALE,x=o.x+135*S;
  const castle=world.village.buildings.get('B28');
  // Babylon splits multi-primitive GLB meshes into individual render objects.
  check(castle.root.metadata.revision===5&&castle.sourceMeshes>=2062,'Rev5 replaces the old castle');
  const castleMaterials=castle.meshes.flatMap(m=>m.material?.subMaterials??[m.material]);
  check(castleMaterials.some(m=>m?.bumpTexture&&m?.metallicTexture),'Rev5 PBR normal and roughness maps retained');
  // Walk the real capsule through source steps and the opened gate into the yard.
  const startZ=o.z-66*S,endZ=o.z-85*S,controller=new CharacterTraversalController();
  world.traversal.teleport(x,world.walkHeightAt(x,startZ),startZ);
  world.player.position.set(x,world.walkHeightAt(x,startZ),startZ);
  world.streamMainland(x,startZ,true);
  for(let i=0;i<120&&world.mainland.coverageAt(x,endZ)!=='near';i++)
    await new Promise(r=>setTimeout(r,100));
  controller.teleport(x,world.walkHeightAt(x,startZ),startZ);
  let frames=0;
  for(;frames<1400&&controller.position.z>endZ;frames++){
    const physics=world.traversalWorld(world.zones.get('brisalia'),controller.position.y);
    controller.step(1/60,{moveX:0,moveZ:-1,forwardX:0,forwardZ:-1,horizontal:0,vertical:1,
      run:false,sprint:false,jumpPressed:false},physics);
  }
  check(controller.position.z<=endZ,`Castle entrance walk: ${JSON.stringify(controller.position)}, target Z ${endZ}`);
  const yardZ=o.z-88*S,ground=world.geographicWorld.surface.heightAt(x,yardZ);
  const yardMesh=world.village.ground(x,yardZ,ground+.15,.3);
  check(yardMesh===null,'Courtyard has no building floor over the map terrain');
  const roadMesh=world.scene.getMeshByName('brisalia:connected-streets');
  check(roadMesh.getVerticesData('normal')[1]>.99,'Road normals face up');
  return {count:buildings.length,sourceMetersToWorldUnits:S,buildings,castleWalkFrames:frames,
    courtyardGround:ground,courtyardUsesMapTerrain:true,connectedRoads:BRISALIA_ROADS.length};
}

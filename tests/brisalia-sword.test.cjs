const assert=require('node:assert/strict');
const fs=require('node:fs');
const {FreeCamera,NullEngine,Scene,TransformNode,Vector3,ImportMeshAsync,
  LoadAssetContainerAsync}=require('@babylonjs/core');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const {BRISALIA_SWORD_OBJECTIVES,nextBrisaliaSwordObjective}=
  require('../.test-build/domain/brisaliaSword.js');
const {BrisaliaSwordVisual,BRISALIA_SWORD_MODELS,
  BRISALIA_SWORD_DEFAULT_POSITION_CM,BRISALIA_SWORD_DEFAULT_ROTATION_DEG}=
  require('../.test-build/game/BrisaliaSwordVisual.js');

class MemoryRepository{
  current=newGame();
  load(){return structuredClone(this.current);}
  save(state){this.current=structuredClone(state);}
  clear(){this.current=newGame();}
}

(async()=>{
  const repository=new MemoryRepository(),store=new GameStore(repository);
  assert.equal(store.swordLevel,0);
  assert.match(nextBrisaliaSwordObjective(store.state),/Fabricá/);
  store.collect('wood',2);store.collect('stone',1);store.collect('copper',5);
  assert.equal(store.craft('sword').ok,true);
  assert.equal(store.swordLevel,1);
  assert.equal(store.equip('sword').ok,true);
  for(const [index,objective] of BRISALIA_SWORD_OBJECTIVES.entries()){
    assert.match(nextBrisaliaSwordObjective(store.state),new RegExp(objective.description.split(' ')[0]));
    store.discoverPlace(objective.id);
    assert.equal(store.swordLevel,index+2);
  }
  assert.equal(store.swordLevel,4);
  assert.equal(nextBrisaliaSwordObjective(store.state),'Nivel máximo alcanzado.');
  store.discoverPlace(BRISALIA_SWORD_OBJECTIVES[2].id);
  assert.equal(store.swordLevel,4,'repeating an objective cannot exceed level four');
  assert.equal(new GameStore(repository).swordLevel,4,'the evolution survives reloading');
  const oldSave=newGame();oldSave.inventory.sword=1;delete oldSave.discoveredPlaces;
  repository.current=oldSave;
  assert.equal(new GameStore(repository).swordLevel,1,'older saves with a sword retain its first version');

  const engine=new NullEngine(),scene=new Scene(engine),hand=new TransformNode('right-hand',scene);
  scene.activeCamera=new FreeCamera('test-camera',new Vector3(0,2,-8),scene);
  hand.position.set(1,2,3);
  // The real Mixamo hand inherits a 1/100 scale below Santi's fitted root.
  hand.scaling.setAll(3.8*.01);
  const fingerBase=new TransformNode('mixamorig:RightHandMiddle1',scene);
  fingerBase.parent=hand;fingerBase.position.set(.558,5.714,-.006);
  const imports=[];
  const importer=async(path,target)=>{
    imports.push(path);
    return ImportMeshAsync(new Uint8Array(fs.readFileSync('public'+path)),target,{pluginExtension:'.glb'});
  };
  const visual=new BrisaliaSwordVisual(scene,hand,importer);
  assert.deepEqual(BRISALIA_SWORD_DEFAULT_POSITION_CM,[-15.5,-1,-10]);
  assert.deepEqual(BRISALIA_SWORD_DEFAULT_ROTATION_DEG,[38,-1,10]);
  visual.setOffsetMeters(0,0,0);visual.setRotationDegrees(0,0,0);
  let firstLength=0,lastLength=0;
  for(let level=1;level<=4;level++){
    visual.setLevel(level);await visual.whenReady();
    assert.equal(visual.level,level);
    const swords=scene.meshes.filter(mesh=>mesh.metadata?.brisaliaSword&&mesh.getTotalVertices()>0&&!mesh.isDisposed());
    assert.equal(swords.length,1,'the sword changes variant instead of stacking meshes');
    const mesh=swords[0];mesh.computeWorldMatrix(true);
    const box=mesh.getBoundingInfo().boundingBox;
    const length=box.maximumWorld.subtract(box.minimumWorld).length();
    if(level===1)firstLength=length;
    if(level===4)lastLength=length;
    assert.equal(mesh.metadata.swordLevel,level);
    assert.equal(mesh.isPickable,false);
    assert.ok(mesh.material?.albedoTexture&&mesh.material?.emissiveTexture);
    const gripRoot=scene.meshes.find(candidate=>candidate.name==='__root__'&&
      candidate.metadata?.swordLevel===level);
    gripRoot.computeWorldMatrix(true);hand.computeWorldMatrix(true);
    const palmSurface=Vector3.TransformCoordinates(
      fingerBase.position.scale(.75).add(new Vector3(0,0,3.7)),hand.getWorldMatrix());
    const handleCenter=Vector3.TransformCoordinates(new Vector3(0,-.07,0),
      gripRoot.getWorldMatrix());
    assert.ok(Vector3.Distance(handleCenter,palmSurface)<.001,
      'the middle of the handle rests against the inner palm surface');
  }
  assert.ok(firstLength>.8&&firstLength<1.6);
  assert.ok(lastLength>1.5&&lastLength<2.7,'the fourth blade remains proportional to Santi');
  assert.deepEqual(imports,BRISALIA_SWORD_MODELS);
  visual.setLevel(0);assert.equal(visual.level,0);
  visual.setLevel(4);assert.equal(visual.level,4,'re-equipping reuses the current model');
  assert.equal(imports.length,4);
  visual.dispose();assert.equal(scene.meshes.filter(mesh=>mesh.metadata?.brisaliaSword&&!mesh.isDisposed()).length,0);

  // The actual rig rotates the hand and changes its pose while walking.
  const santiBytes=fs.readFileSync('public/assets/characters/santi/Santi_NLA_SK_Opt.glb');
  const rig=await LoadAssetContainerAsync(
    'data:application/octet-stream;base64,'+santiBytes.toString('base64'),scene);
  rig.addAllToScene();
  const body=rig.meshes.find(mesh=>mesh.name==='Santi_Mesh_primitive0');
  body.computeWorldMatrix(true);
  const bodyBox=body.getBoundingInfo().boundingBox;
  rig.meshes.find(mesh=>mesh.name==='__root__').scaling.scaleInPlace(
    3.8/(bodyBox.maximumWorld.y-bodyBox.minimumWorld.y));
  const realHand=rig.transformNodes.find(node=>node.name==='mixamorig:RightHand');
  const realSword=new BrisaliaSwordVisual(scene,realHand,importer);
  const idle=rig.animationGroups.find(group=>group.name==='Idle (1)');
  const walk=rig.animationGroups.find(group=>group.name==='Walking (6)');
  const middleBones=[1,2,3,4].map(index=>rig.transformNodes.find(node=>
    node.name===`mixamorig:RightHandMiddle${index}`));
  for(const level of [3,4]){
    realSword.setLevel(level);await realSword.whenReady();
    assert.equal(realSword.level,level);
    const blade=scene.meshes.find(mesh=>mesh.metadata?.brisaliaSword&&
      mesh.metadata.swordLevel===level&&mesh.getTotalVertices()>0);
    idle.start(true);scene.render();
    const gripRoot=scene.meshes.find(mesh=>mesh.name==='__root__'&&
      mesh.metadata?.swordLevel===level);
    gripRoot.computeWorldMatrix(true);
    realHand.computeWorldMatrix(true);
    const bladeAxis=Vector3.TransformNormal(Vector3.Up(),gripRoot.getWorldMatrix()).normalize();
    const handAxis=Vector3.TransformNormal(Vector3.Right(),realHand.getWorldMatrix()).normalize();
    assert.ok(Vector3.Dot(bladeAxis,handAxis)>.98,
      `level ${level} turns ninety degrees through the hand`);
    if(level===3){
      realHand.computeWorldMatrix(true);
      for(const bone of middleBones)bone.computeWorldMatrix(true);
      const palm=Vector3.TransformCoordinates(middleBones[0].position.scale(.75),
        realHand.getWorldMatrix());
      const openDistance=Vector3.Distance(middleBones[3].getWorldMatrix().getTranslation(),palm);
      realSword.applyGrip();
      for(const bone of middleBones)bone.computeWorldMatrix(true);
      const closedDistance=Vector3.Distance(middleBones[3].getWorldMatrix().getTranslation(),palm);
      assert.ok(closedDistance<openDistance*.5,
        `Santi closes his fingers around the handle: ${openDistance} -> ${closedDistance}; `+
        `${realSword.gripJoints.length} joints`);
    }
    idle.stop();
    walk.start(false);
    let clearance=Infinity;
    for(let frame=0;frame<=20;frame++){
      walk.goToFrame(walk.from+(walk.to-walk.from)*frame/20);scene.render();
      body.computeWorldMatrix(true);blade.computeWorldMatrix(true);
      clearance=Math.min(clearance,blade.getBoundingInfo().boundingBox.minimumWorld.y-
        body.getBoundingInfo().boundingBox.minimumWorld.y);
    }
    walk.stop();
    assert.ok(clearance>.2,`level ${level} clears the ground during Santi's walk: ${clearance}`);
  }
  realSword.dispose();rig.dispose();
  scene.dispose();engine.dispose();
  console.log('✓ Espada de Brisalia: cuatro niveles, objetivos persistentes y mallas en la mano');
})().catch(error=>{console.error(error);process.exitCode=1;});

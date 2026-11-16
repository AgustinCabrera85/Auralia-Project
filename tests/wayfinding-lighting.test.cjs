const assert=require('node:assert/strict');
const {DirectionalLight,HemisphericLight,Light,MeshBuilder,NullEngine,PBRMaterial,PointLight,Scene,
  StandardMaterial,TransformNode,Vector3}=require('@babylonjs/core');
const {WayfindingSystem}=require('../.test-build/world/WayfindingSystem.js');
const {sampleClimate}=require('../.test-build/world/climate/ClimateModel.js');

(async()=>{
  const engine=new NullEngine(),scene=new Scene(engine),parent=new TransformNode('town',scene);
  // A translated town catches accidental mixing of lamp-local and world positions.
  parent.position.x=1000;
  const ambient=new HemisphericLight('ambient',Vector3.Up(),scene);
  const sun=new DirectionalLight('sun',Vector3.Down(),scene),moon=new DirectionalLight('moon',Vector3.Down(),scene);
  const system=new WayfindingSystem(scene,parent,[],()=>0);
  await system.ready;
  const actor=new TransformNode('Santi',scene),npc=new TransformNode('NPC',scene);
  system.addCharacter(actor);system.addCharacter(npc);
  const body=MeshBuilder.CreateBox('Santi-body',{},scene);body.parent=actor;body.material=new PBRMaterial('skin',scene);
  const npcBody=MeshBuilder.CreateBox('NPC-body',{},scene);npcBody.parent=npc;npcBody.material=new StandardMaterial('fabric',scene);
  const terrain=MeshBuilder.CreateGround('terrain',{},scene);
  terrain.material=new StandardMaterial('terrain-material',scene);
  const wood=new PBRMaterial('Roble envejecido',scene);
  // Use a tiny mesh fixture; all light creation/filtering is the production path.
  for(const x of [0,40,100])system.place({id:`lamp-${x}`,asset:'wayfindingLamp',at:[x,0],yaw:0,routes:[],region:'Brisalia',location:'Road'},
    {materials:[wood],instantiateModelsToScene:()=>{
      const mesh=MeshBuilder.CreateBox('lamp-fixture',{},scene);mesh.material=wood;return {rootNodes:[mesh]};
    }});
  await system.load();
  const focus={x:1000,z:0};
  const active=()=>system.lamps.filter(l=>l.light.isEnabled());
  const characterLights=mesh=>mesh.lightSources.filter(l=>l instanceof PointLight);
  system.update(sampleClimate(12,'clear').night,focus);
  assert.equal(active().length,0,'No lamp contribution in daylight');
  assert.equal(characterLights(body).length,0,'Disabled lamps do not consume daytime shader slots');
  const dusk=sampleClimate(18,'clear').night;
  assert.ok(dusk>0&&dusk<1,'Use the actual twilight transition');
  system.update(dusk,focus);
  assert.equal(active().length,2,'Two closest lamps turn on at dusk');
  assert.ok(active().every(l=>l.light.intensity>0&&l.light.intensity<60),'Gradual dusk intensity');
  assert.ok(active().every(l=>l.characterLight.intensity>0&&l.characterLight.intensity<1.5),'NPC dusk intensity is calibrated for linear falloff');
  for(const mesh of [body,npcBody]){
    assert.equal(characterLights(mesh).length,2,'Late-loaded characters receive both nearby lamps');
    assert.ok([ambient,sun,moon].every(l=>mesh.lightSources.includes(l)),'Environmental lights remain available');
    assert.ok(mesh.material.maxSimultaneousLights>=mesh.lightSources.length,'Material has room for all active lights');
  }
  assert.ok(active().every(l=>l.light.canAffectMesh(body)&&!l.characterLight.canAffectMesh(body)),'PBR receives physical intensity only');
  assert.ok(active().every(l=>!l.light.canAffectMesh(npcBody)&&l.characterLight.canAffectMesh(npcBody)),'NPC receives linear intensity only');
  assert.ok(active().every(l=>l.light.falloffType===Light.FALLOFF_GLTF),'Physical light fades to zero at its range');
  assert.equal(characterLights(terrain).length,0,'Local lights stay off unrelated terrain');
  assert.equal(terrain.material.maxSimultaneousLights,4,'Terrain shader budget is unchanged');
  system.update(sampleClimate(0,'clear').night,focus);
  assert.ok(active().every(l=>l.light.intensity===60&&l.characterLight.intensity===1.5),'Full night intensity');
  const equipment=MeshBuilder.CreateBox('late-equipment',{},scene);equipment.parent=actor;equipment.material=new PBRMaterial('metal',scene);
  system.update(1,focus,.5);
  assert.equal(characterLights(equipment).length,2,'Equipment loaded later receives local light');
  system.update(sampleClimate(12,'clear').night,focus);
  assert.equal(characterLights(body).length,0,'Returning to daylight releases PBR light slots');
  assert.equal(characterLights(npcBody).length,0,'Returning to daylight releases NPC light slots');
  system.update(1,{x:1100,z:0});
  assert.deepEqual(active().map(l=>l.root.name).sort(),['wayfinding:lamp-100','wayfinding:lamp-40'],'Moving selects the nearest lamps in world coordinates');
  npc.dispose();system.update(1,focus);
  assert.ok(system.lamps.every(l=>!l.characterLight.isEnabled()),'An empty receiver list must never illuminate the whole scene');
  assert.equal(characterLights(terrain).length,0);
  parent.setEnabled(false);system.update(1,focus);
  assert.equal(active().length,0,'Hidden zones do not illuminate characters');
  parent.setEnabled(true);system.update(1,{x:1500,z:0});
  assert.equal(active().length,0,'Distant lamps are disabled');
  system.dispose();
  assert.deepEqual(scene.lights,[ambient,sun,moon],'Disposal releases all local lights');
  engine.dispose();
  console.log(JSON.stringify({passed:true,lighting:'day, dusk, night, NPC/PBR receivers, late loading, movement, disposal'}));
})().catch(error=>{console.error(error);process.exitCode=1;});

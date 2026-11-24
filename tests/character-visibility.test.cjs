const assert=require('node:assert/strict'),fs=require('node:fs');
const {NullEngine,Scene,FreeCamera,TransformNode,Vector3}=require('@babylonjs/core');
const {SantiCharacter}=require('../.test-build/game/SantiCharacter.js');
(async()=>{
  global.window={location:{search:''},removeEventListener(){}};
  const engine=new NullEngine();engine.getCaps().maxVertexUniformVectors=4096;
  const scene=new Scene(engine),parent=new TransformNode('player',scene);
  const camera=new FreeCamera('orbit',new Vector3(0,2,-4),scene);camera.setTarget(new Vector3(0,2,-20));
  const model='data:application/octet-stream;base64,'+fs.readFileSync('public/assets/characters/santi/Santi_NLA_SK_Opt.glb').toString('base64');
  const santi=new SantiCharacter(scene,parent,model);
  try{
    await santi.load();
    for(const clip of ['Idle (1)','Walking (6)','Swimming (3)','Two Hand Sword Combo']){
      santi.playAction(clip,1,true);
      for(const group of scene.animationGroups)if(group.isStarted)group.goToFrame((group.from+group.to)/2);
      scene.render();
      const meshes=santi.renderMeshes.filter(m=>m.getTotalVertices()>0&&m.isVisible&&m.isEnabled());
      assert.ok(meshes.length>=8);
      for(const mesh of meshes)assert.ok(scene.getActiveMeshes().contains(mesh),`${clip}: ${mesh.name} must not vanish due to bind-pose culling`);
    }
    parent.setEnabled(false);scene.render();
    assert.ok(santi.renderMeshes.every(m=>!scene.getActiveMeshes().contains(m)),'explicit hiding still works');
    console.log('Character visibility: idle, walking, swimming, sword pose and explicit hiding passed.');
  }finally{santi.dispose();scene.dispose();engine.dispose();delete global.window;}
})().catch(e=>{console.error(e);process.exitCode=1});

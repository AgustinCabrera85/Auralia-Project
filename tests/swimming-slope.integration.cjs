const assert=require('node:assert/strict'),fs=require('node:fs');
const {NullEngine,Scene,FreeCamera,TransformNode,Vector3}=require('@babylonjs/core');
const {SantiCharacter}=require('../.test-build/game/SantiCharacter.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const controls={moveX:0,moveZ:0,forwardX:1,forwardZ:0,horizontal:0,vertical:0,
  run:false,sprint:false,jumpPressed:false};

(async()=>{
  const read=name=>JSON.parse(fs.readFileSync('public/auralia-preview/data/'+name+'.json','utf8'));
  const splines=read('splines'),hydrology=read('hidrologia_v3_6');
  const source=new WorldStudioSource(read('manifest'),splines,hydrology,async url=>{
    const b=await fs.promises.readFile('public/'+url.replace(/^\//,''));
    return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  });
  const world=await PlayableWorld.create(source,splines,hydrology);
  const x=2170,z=-2608;await world.prepare([x-90,z-90,x+90,z+90]);
  const water=world.waterAt(x,z);assert.ok(water,'the reported location is wet');
  const traversal={ground:()=>null,solidTop:()=>null,wall:()=>null,
    headroom:()=>true,canMove:()=>true,fallbackHeight:(x,z)=>world.surface.heightAt(x,z),
    waterLevel:(x,z)=>world.waterAt(x,z)?.level??null};
  const c=new CharacterTraversalController();c.teleport(x,water.level-1.8,z);
  for(let i=0;i<180;i++)c.step(1/60,controls,traversal);
  const drop=water.level-world.waterAt(c.position.x,c.position.z).level;
  assert.equal(c.mode,'swimming');
  assert.ok(drop>5,'the real river carries the player downhill without input');
  assert.ok(c.swimPitch>.2,'the real slope produces a downward body inclination');
  assert.ok(c.position.y>=world.surface.heightAt(c.position.x,c.position.z)+.29,
    'the actual river bed remains below the player');
  console.log(`Reported river (2170, -2608): ${drop.toFixed(2)} m downhill in 3 s; pitch ${(c.swimPitch*180/Math.PI).toFixed(1)} degrees.`);

  // Exercise the actual swimming clip and its transform hierarchy, without a
  // browser or unrelated scene systems. The chest pivot must remain stable.
  global.window={location:{search:''},removeEventListener(){}};
  const engine=new NullEngine();engine.getCaps().maxVertexUniformVectors=4096;
  const scene=new Scene(engine),parent=new TransformNode('player',scene);
  new FreeCamera('camera',new Vector3(0,2,-8),scene);
  const data=fs.readFileSync('public/assets/characters/santi/Santi_NLA_SK_Opt.glb');
  const santi=new SantiCharacter(scene,parent,'data:application/octet-stream;base64,'+data.toString('base64'));
  try{
    await santi.load();
    const motion={mode:'swimming',moving:true,movementIntent:false,run:false,sprint:false,
      backward:false,feetY:0,jumpStarted:false,doubleJumpStarted:false,swimPitch:0};
    santi.update(1/60,motion);
    const node=scene.getTransformNodeByName('santi-slope-orientation');
    const pivot=new Vector3(0,1.25,0),expected=pivot.clone();
    const head=scene.getTransformNodeByName('mixamorig:Head');
    const left=scene.getTransformNodeByName('mixamorig:LeftFoot');
    const right=scene.getTransformNodeByName('mixamorig:RightFoot');
    const bodyAxis=()=>{
      const group=santi.active;group.goToFrame((group.from+group.to)/2,true);group.pause();
      scene.render();
      return head.absolutePosition.subtract(left.absolutePosition.add(right.absolutePosition).scale(.5));
    };
    const flatAxis=bodyAxis();
    motion.swimPitch=Math.PI/4;
    santi.update(1/60,motion);
    assert.ok(node.rotation.x>0&&node.rotation.x<.2,'tilt blends instead of snapping to the slope');
    for(let i=0;i<90;i++){
      santi.update(1/60,motion);node.computeWorldMatrix(true);
      assert.ok(Vector3.Distance(Vector3.TransformCoordinates(pivot,node.getWorldMatrix()),expected)<1e-5,
        'inclination keeps the torso in place instead of orbiting around the feet');
    }
    const downhillAxis=bodyAxis();
    assert.ok(downhillAxis.y<flatAxis.y-.5,'the animated head inclines downhill relative to the feet');
    assert.ok(Math.abs(node.rotation.x-Math.PI/4)<.001);
    motion.swimPitch=-Math.PI/6;
    for(let i=0;i<90;i++)santi.update(1/60,motion);
    assert.ok(node.rotation.x<-.5,'upstream travel tilts the body upward');
    motion.mode='grounded';motion.moving=false;motion.swimPitch=0;
    for(let i=0;i<90;i++)santi.update(1/60,motion);
    assert.ok(Math.abs(node.rotation.x)<.001&&node.position.length()<.001,
      'leaving the water restores the ordinary standing pose');
    console.log('Santi swimming clip: smooth downhill/uphill tilt, stable torso pivot and dry-land reset passed.');
  }finally{santi.dispose();scene.dispose();engine.dispose();delete global.window;}
})().catch(e=>{console.error(e);process.exitCode=1;});

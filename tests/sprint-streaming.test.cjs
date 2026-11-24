const assert=require('node:assert/strict');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {TerrainStream}=require('../.test-build/world/TerrainStream.js');
const {GeographicSurface}=require('../.test-build/world/geography/GeographicSource.js');
const {GeographicPrefetch}=require('../.test-build/world/geography/GeographicPrefetch.js');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {geographicTraversal}=require('../.test-build/world/geography/GeographicTraversal.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');

async function main(){
  // Real sector loader, with deliberately unfinished IO: the current region
  // must remain usable while a leading sector is being fetched.
  const manifest=require('../public/auralia-preview/data/manifest.json');
  let hold=false,requests=0;const waiting=[];
  const bytes=new Uint16Array(640*640).fill(2000).buffer;
  const data=new WorldStudioSource(manifest,[],{lakes:[]},()=>{
    requests++;
    return hold?new Promise(resolve=>waiting.push(()=>resolve(bytes))):Promise.resolve(bytes);
  },false);
  await data.prepare([-3850,-657,1350,4543]);
  const before=requests,errors=[],prefetch=new GeographicPrefetch(data,2600,e=>errors.push(e));
  hold=true;prefetch.update(-1250,1943,27,0);
  assert.ok(requests>before,'sprint starts loading the next column before reaching it');
  assert.ok(data.isReady([-1262,1931,-1238,1955]),'loading ahead retains authoritative local ground');
  assert.ok(Number.isFinite(data.heightAt(-1250,1943)));
  assert.equal(data.isReady([-3634,-657,1566,4543]),false,'distant IO is still pending');
  const inFlight=requests;
  for(let i=0;i<60;i++)prefetch.update(-1250+i*.45,1943,27,0);
  assert.equal(requests,inFlight,'frames do not restart or duplicate pending requests');
  for(let i=0;i<8;i++){while(waiting.length)waiting.shift()();await new Promise(setImmediate);}
  assert.ok(data.isReady([-3634,-657,1566,4543]));
  assert.ok(data.stats.residentTiles<=9);assert.deepEqual(errors,[]);
  prefetch.dispose();data.dispose();

  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('sprint',scene);
  const descriptor=Object.getOwnPropertyDescriptor(performance,'now');
  let clock=0,localReady=true;
  // Deterministic work cost, independent of CI speed. Dense terrain in the
  // travel corridor exercises resumable builders and complete LOD switches.
  const source={id:'sprint-fixture',streamed:true,bounds:[-7000,-7000,7000,7000],seaLevel:0,meshSpacing:3,
    heightAt(){clock+=.002;return 5;},weightsAt(){clock+=.002;return [1,0,0,0,0,0];},
    preserveDetail:b=>b[1]<80&&b[3]>-80,
    isReady:b=>localReady&&b[2]-b[0]<3000,prepare:async()=>{}};
  Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
  const stream=new TerrainStream(scene,root,{},source);
  try{
    stream.update(10,10,27,0,0);
    assert.equal(stream.coverageAt(180,10),'mid');
    assert.equal(stream.canTraverse(180,10),true,'coarse visible ground does not impose a movement wall');
    assert.equal(stream.canTraverse(3000,10),false,'missing visual coverage still has a safety guard');
    localReady=false;assert.equal(stream.canTraverse(180,10),false,'unknown collision data remain blocked');localReady=true;
    const player=new CharacterTraversalController();player.teleport(10,5,10);
    let refused=0,travelled=0,coarseSteps=0;
    const world=geographicTraversal(new GeographicSurface(source),(x,z)=>{
      const ready=stream.canTraverse(x,z);if(!ready)refused++;return ready;
    });
    // Exercise the low frame rate reported by the user: only 20 opportunities
    // per second to advance streaming, while sprint still covers 27 m/s.
    for(let frame=0;frame<1200;frame++){
      // Forward sprint, a right-angle turn, then reverse across loaded seams.
      const [dx,dz]=frame<600?[1,0]:frame<800?[0,1]:[-1,0];
      const old={...player.position};
      player.step(1/20,{moveX:dx,moveZ:dz,forwardX:dx,forwardZ:dz,
        horizontal:0,vertical:1,run:true,sprint:true,jumpPressed:false},world);
      const p=player.position;
      travelled+=Math.hypot(p.x-old.x,p.z-old.z);
      if(stream.coverageAt(p.x,p.z)!=='near')coarseSteps++;
      stream.update(p.x,p.z,dx*27,dz*27,3);
      assert.ok(stream.coverageAt(p.x,p.z),`no gap under the player at frame ${frame}`);
      assert.equal(p.y,5,'canonical collision height stays stable through LOD changes');
    }
    assert.equal(refused,0,'sprint never hits a streaming wall, including turns');
    assert.ok(travelled>1500,`sustained sprint covered ${travelled.toFixed(1)} m`);
    console.log(`Sprint streaming: ${travelled.toFixed(1)} m, 0 streaming refusals; ${coarseSteps} frames on coarse coverage. Predictive IO retains local ground and <=9 sectors.`);
  }finally{
    if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;
    stream.dispose();scene.dispose();engine.dispose();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

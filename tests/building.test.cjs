const assert=require('node:assert/strict');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const {anchorFor,slotKey,planBuild,buildingBlocksMove,buildingFloorAt,buildingHeadroom,
  wallReplacementProblem}=
  require('../.test-build/domain/buildingRules.js');
const {LocalStorageSaveRepository}=require('../.test-build/persistence/SaveRepository.js');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {BuildVisuals}=require('../.test-build/world/building/BuildVisuals.js');

class MemoryRepository {
  current=newGame();
  load(){return structuredClone(this.current);}
  save(value){this.current=structuredClone(value);}
  clear(){this.current=newGame();}
}
const repository=new MemoryRepository();
for(const key of ['wood','stone','copper'])repository.current.inventory[key]=100;
repository.current.inventory.hammer=1;
const store=new GameStore(repository);
store.setBuildEnvironment(()=>({heightAt:()=>10,player:{x:-40,z:29,y:10}}));
assert.equal(slotKey(anchorFor('wall',-29,18,1)),slotKey(anchorFor('wall',-25,18,3)),
  'adjacent cells address the same physical edge');
assert.notEqual(slotKey(anchorFor('foundation',-29,18), 'foundation'),
  slotKey(anchorFor('floor',-29,18),'floor'),'foundation and floor use separate slots');
assert.equal(store.build('foundation',-29,18,0).ok,true);
assert.equal(store.build('floor',-29,18,0).ok,true);
assert.equal(store.build('floor',-25,18,0).ok,true);
assert.equal(store.build('floor',-29,22,0).ok,true);
assert.equal(store.build('floor',-25,22,0).ok,true);
assert.equal(store.build('wall',-29,18,1).ok,true);
assert.equal(store.build('stone-wall',-25,18,3).ok,false,'different wall materials conflict on one edge');
const perimeter=[
  [-29,18,0],[-25,18,0],[-29,22,2],[-25,22,2],
  [-29,18,3],[-29,22,3],[-25,18,1],[-25,22,1]
];
for(const [x,z,side] of perimeter){
  const exists=store.state.structures.some(s=>s.anchor?.kind==='edge'&&
    slotKey(s.anchor)===slotKey(anchorFor('wall',x,z,side)));
  if(!exists)assert.equal(store.build('wall',x,z,side).ok,true);
}
const north=store.state.structures.find(s=>s.anchor?.kind==='edge'&&s.x===-29&&s.z===16);
assert.ok(north);
const woodBefore=store.state.inventory.wood;
assert.equal(store.replaceWall(north.id,'door-wall').ok,true);
assert.equal(store.state.inventory.wood,woodBefore-1,'replacement refunds old wall then pays door cost');
const other=store.state.structures.find(s=>s.anchor?.kind==='edge'&&s.x===-25&&s.z===16);
assert.equal(store.replaceWall(other.id,'window-wall').ok,true);
for(const [x,z] of [[-29,18],[-25,18],[-29,22],[-25,22]])
  assert.equal(store.build('roof',x,z,0).ok,true,'supported modular roof section');
assert.match(wallReplacementProblem(store.state.structures.find(s=>s.id===north.id),'wall',
  store.state.structures,{x:-29,z:18,y:10})??'',/encerrado/,
  'replacing the only door cannot trap a player inside');
store.setBuildEnvironment(()=>({heightAt:()=>10,player:{x:-29,z:18,y:10}}));
assert.match(store.replaceWall(north.id,'wall').message,/encerrado/);
store.setBuildEnvironment(()=>({heightAt:()=>10,player:{x:-40,z:29,y:10}}));
assert.equal(buildingBlocksMove(-29,15,-29,17,10,store.state.structures),false,
  'open door allows walking through');
assert.equal(buildingBlocksMove(-25,15,-25,17,10,store.state.structures),true,
  'window wall blocks walking');
assert.equal(buildingFloorAt(-29,18,11,store.state.structures),10.34);
assert.equal(buildingHeadroom(-29,12,18,2,store.state.structures),false,
  'roof blocks upward traversal');
const supportWall=store.state.structures.find(s=>s.anchor?.kind==='edge'&&s.x===-23&&s.z===22);
assert.equal(store.removeStructure(supportWall.id).ok,false,'roof prevents removal of supporting wall');
const roof=store.state.structures.find(s=>s.type==='roof'&&s.x===-25&&s.z===22);
assert.equal(store.removeStructure(roof.id).ok,true);
assert.equal(store.removeStructure(supportWall.id).ok,true);
const beforeRemove=store.state.inventory.wood;
assert.equal(store.removeStructure(north.id).ok,true);
assert.equal(store.state.inventory.wood,beforeRemove+3,'dismantling returns full door cost');
const reloaded=new GameStore(repository);
assert.equal(reloaded.state.structures.some(s=>s.id===other.id&&s.type==='window-wall'),true);
assert.equal(reloaded.state.structures.every(s=>s.anchor&&s.baseY===10),true,
  'save reload retains anchors and shared base height');
const last=store.build('post',-31,16,0);
assert.equal(last.ok,true);
const beforeUndo=store.state.inventory.stone;
assert.equal(store.undoLastBuild().ok,true);
assert.equal(store.state.inventory.stone,beforeUndo+2,'undo refunds last session placement');
assert.equal(store.state.structures.some(s=>s.id===last.structure.id),false);

const slope=planBuild('foundation',-29,18,0,[],{heightAt:(x,z)=>x*.4});
assert.equal(slope.ok,false,'steep terrain is rejected');
const obstacle=planBuild('foundation',-29,18,0,[],{heightAt:()=>10,
  obstacles:[{x:-29,z:18,radius:1,kind:'resource'}]});
assert.equal(obstacle.ok,false,'interactive resources block building');
const trapped=[];
const env={heightAt:()=>10,player:{x:-29,z:18,y:10}};
trapped.push({id:'floor',type:'floor',zone:'brisalia',x:-29,z:18,rotation:0,
  anchor:anchorFor('floor',-29,18),baseY:10});
for(const side of [0,1,2]){
  const plan=planBuild('wall',-29,18,side,trapped,env);
  assert.equal(plan.ok,true);
  trapped.push({id:`wall-${side}`,type:'wall',zone:'brisalia',...plan.plan});
}
assert.match(planBuild('wall',-29,18,3,trapped,env).message,/encerrado/);
assert.equal(planBuild('door-wall',-29,18,3,trapped,env).ok,true);

const storage=new Map();
global.localStorage={getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const local=new LocalStorageSaveRepository();
const oldSave=newGame();oldSave.inventory.wood=9;
oldSave.structures=[{id:'vieja',type:'roof',zone:'brisalia',x:-25,z:18,rotation:2}];
local.save(oldSave);
const migrated=local.load();
assert.equal(migrated.structures[0].legacy,true);
assert.deepEqual([migrated.structures[0].x,migrated.structures[0].z],[-25,18]);
assert.equal(migrated.inventory.wood,9,'migration does not charge old pieces');
local.save(store.state);
const savedNew=local.load();
assert.equal(savedNew.structures.find(s=>s.id===other.id).anchor.kind,'edge');
assert.equal(savedNew.structures.find(s=>s.id===other.id).legacy,undefined);
const engine=new NullEngine();
const scene=new Scene(engine);
const buildRoot=new TransformNode('build-root',scene);
const visuals=new BuildVisuals(scene,buildRoot,()=>10);
visuals.setGridVisible(true);
const door=visuals.fromStructure(store.state.structures.find(s=>s.type==='window-wall'));
assert.ok(door.getChildMeshes().length>=8,'saved modular wall has visible components');
assert.ok(door.getChildMeshes().every(mesh=>mesh.metadata?.structureId===other.id),
  'all wall parts can select their parent structure');
const roofVisual=visuals.fromStructure(store.state.structures.find(s=>s.type==='roof'));
assert.ok(roofVisual.getChildMeshes().some(mesh=>mesh.name==='cumbrera'),
  'gable sections have a ridge instead of a pyramidal cap');
door.dispose();roofVisual.dispose();visuals.dispose();scene.dispose();engine.dispose();
console.log('✓ Construcción: encastres, slots, soporte, costos, puerta, colisiones y guardados legacy');

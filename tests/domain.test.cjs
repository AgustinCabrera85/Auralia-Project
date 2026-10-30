const assert = require('node:assert/strict');
const { GameStore } = require('../.test-build/domain/GameStore.js');
const { hasCost } = require('../.test-build/domain/recipes.js');
const { newGame } = require('../.test-build/domain/types.js');
const { LocalStorageSaveRepository } = require('../.test-build/persistence/SaveRepository.js');

class MemoryRepository {
  current = newGame();
  load() { return structuredClone(this.current); }
  save(game) { this.current = structuredClone(game); }
  clear() { this.current = newGame(); }
}

const repository = new MemoryRepository();
const store = new GameStore(repository);
assert.equal(store.milestone, 'collect');
store.collect('wood', 2);
store.collect('stone', 1);
assert.equal(store.milestone, 'craft');
assert.equal(store.craft('hammer').ok, true);
assert.equal(store.state.inventory.wood, 0);
assert.equal(store.state.inventory.hammer, 1);
assert.equal(store.milestone, 'build');
assert.equal(store.canBuild('floor', 150, 150).ok, false);
store.collect('wood', 7);
store.collect('stone', 1);
store.collect('copper', 1);
assert.equal(hasCost(store.state.inventory, { wood: 2 }), true);
assert.equal(store.build('floor', -29, 18, 0).ok, true);
assert.equal(store.build('floor', -29, 18, 0).ok, false, 'no permite duplicar la misma pieza');
assert.equal(store.build('wall', -29, 18, 1).ok, true);
assert.equal(store.build('wall', -29, 18, 0).ok, true);
assert.equal(store.milestone, 'sail');
store.travel('luciernagas');
assert.equal(store.state.zone, 'luciernagas');
assert.equal(store.milestone, 'light');
store.collect('spark', 2);
store.collect('wood', 1);
assert.equal(store.craft('lantern').ok, true);
assert.equal(store.milestone, 'complete');
const reloaded = new GameStore(repository);
assert.equal(reloaded.state.structures.length, 3);
assert.equal(reloaded.state.inventory.lantern, 1);
reloaded.reset();
assert.equal(reloaded.state.structures.length, 0);
assert.equal(reloaded.milestone, 'collect');
console.log('✓ Dominio: recolección, recetas, construcción, viaje, persistencia y reinicio OK');
// Migración no destructiva: posición opcional agregada sobre SaveGameV1.
const oldSave = newGame();
delete oldSave.playerPosition;
repository.current = structuredClone(oldSave);
const migrated = new GameStore(repository);
assert.equal(migrated.state.playerPosition, undefined, 'un guardado v0.1 sigue cargando');
migrated.setPlayerPosition('brisalia', -350, -285);
assert.deepEqual(migrated.state.playerPosition, {zone:'brisalia',x:-350,z:-285});
migrated.travel('luciernagas');
assert.equal(migrated.state.playerPosition, undefined, 'zona nueva usa su spawn');
console.log('✓ Persistencia v0.1→v0.2: ubicación opcional y cambio de zona OK');
const storage=new Map();
global.localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key)
};
const local=new LocalStorageSaveRepository();
const saved=newGame();
saved.playerPosition={zone:'brisalia',x:-29,z:18};
saved.structures=[{id:'antigua-pieza',type:'floor',zone:'brisalia',x:-29,z:18,rotation:0}];
delete saved.inventory.fireCrystal;
local.save(saved);
assert.equal(local.load().inventory.fireCrystal,0,'old inventory gains the new resource without resetting other items');
assert.equal(local.load().structures[0].legacy,true,'la pieza antigua conserva su lugar como legacy');
assert.equal(local.load().structures[0].x,saved.structures[0].x);
assert.deepEqual(local.load().playerPosition,saved.playerPosition,'posición antigua conservada');
assert.deepEqual(local.load().discoveredPlaces,[],'guardado anterior migra sin perder construcciones');
const discoveredStore=new GameStore(local);
discoveredStore.discoverPlace('cascada-valle');
discoveredStore.discoverPlace('cascada-valle');
assert.deepEqual(new GameStore(local).state.discoveredPlaces,['cascada-valle'],'descubrimiento persistente sin duplicados');
const crystalStore=new GameStore(local);
assert.equal(crystalStore.collectResourceNode('crystal:altapiedra','fireCrystal',1,180000,1000000),true);
assert.equal(crystalStore.collectResourceNode('crystal:altapiedra','fireCrystal',1,180000,1000001),false,'same node cannot be collected before respawn');
assert.equal(new GameStore(local).state.inventory.fireCrystal,1,'fire crystals persist in inventory');
assert.equal(new GameStore(local).resourceReadyAt('crystal:altapiedra'),1180000,'respawn timestamp persists');
assert.equal(new GameStore(local).collectResourceNode('crystal:altapiedra','fireCrystal',1,180000,1180001),true,'node reappears after cooldown');
console.log('✓ localStorage v1: piezas y coordenadas conservadas');

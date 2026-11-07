import assert from 'node:assert/strict';
import { Matrix, Mesh, MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { AuraliaFoliageWind, getAuraliaTreeColors } from '../src/world/AuraliaFoliageWind.ts';
import { getAuraliaWind } from '../src/world/AuraliaWindSystem.ts';
import { GrassWindPlugin } from '../src/world/grass/GrassWindPlugin.ts';

const engine = new NullEngine(), scene = new Scene(engine);
const mesh = name => {
  const result = new Mesh(name, scene);
  result.material = new PBRMaterial(name, scene);
  return result;
};
const wood = mesh('Auralia_V4_wood_0');
const leaves = mesh('Auralia_V4_Leaves_green_mid');
const grass = mesh('Auralia_V4_meadow_mid');
const flower = mesh('Auralia_V4_flower_pink');
const initialWindObservers = scene.onBeforeRenderObservable.observers.length;
const wind = new AuraliaFoliageWind(scene);
wind.register([wood, leaves], 'v4TreeSoftEmerald');
wind.register([grass], 'v4GrassShort');
wind.register([flower], 'v4FlowerPink');
assert.equal(wind.woodMaterialCount, 1);
assert.equal(wind.leafMaterialCount, 1);
assert.equal(wind.groundMaterialCount, 2);
assert.equal(wind.materialCount, 4);
assert.equal(scene.onBeforeRenderObservable.observers.length, initialWindObservers + 1,
  'all foliage materials share one wind update per scene');
const sharedWind = getAuraliaWind(scene);
engine.getDeltaTime = () => 100;
const strengths = [];
for (let frame = 0; frame < 240; frame++) {
  scene.onBeforeRenderObservable.notifyObservers(scene);
  strengths.push(sharedWind.effectiveStrength);
}
assert.ok(Math.max(...strengths) > 1.15,
  'periodic gusts increase tree and grass bending above the resting wind');
assert.ok(strengths.some(value => Math.abs(value - 0.65) < 0.001),
  'the wind returns to its resting intensity between gusts');
assert.ok(strengths.every((value, index) => index === 0 ||
  Math.abs(value - strengths[index - 1]) < 0.15),
  'gusts rise and fall smoothly');
sharedWind.setStrength(1.2);
const proceduralGrass = new GrassWindPlugin(new PBRMaterial('grass-probe', scene), sharedWind);
let proceduralStrength;
proceduralGrass.hardBindForSubMesh(null, scene, engine, { effect: {
  setFloat(name, value) { if (name === 'grassWindStrength') proceduralStrength = value; },
} });
assert.ok(Math.abs(proceduralStrength - sharedWind.effectiveStrength / 0.65) < 0.001,
  'procedural grass receives the same scene wind intensity');
const bark = wood.material.pluginManager.getPlugin('AuraliaLivingFoliageV5');
assert.ok(bark.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_LIGHTS.includes('surfaceAlbedo'),
  'V5 bark tint is injected before PBR lighting');
assert.ok(leaves.material.pluginManager.getPlugin('AuraliaLivingFoliageV5'));
const colors=getAuraliaTreeColors(scene);
const autumn=leaves.material.pluginManager.getPlugin('AuraliaAutumnCanopy');
assert.ok(autumn,'tree leaf materials receive the seasonal palette');
const seasonalDefines={};autumn.collectDefines(seasonalDefines);
assert.equal(seasonalDefines.AURALIA_TREE_AUTUMN.default,true,
  'tree shaders have a distinct cache key from bushes sharing the same leaf shader');
assert.equal(wood.material.pluginManager.getPlugin('AuraliaAutumnCanopy'),null,'bark keeps its colours');
assert.equal(grass.material.pluginManager.getPlugin('AuraliaAutumnCanopy'),null,'grass keeps its colours');
assert.equal(flower.material.pluginManager.getPlugin('AuraliaAutumnCanopy'),null,'ground flowers keep their colours');
colors.update('summer',0);assert.equal(colors.autumnAmount,0);
colors.update('autumn',.1);
assert.ok(colors.autumnAmount>0&&colors.autumnAmount<1,'autumn enters smoothly');
for(let i=0;i<40;i++)colors.update('autumn',.1);
assert.equal(colors.autumnAmount,1);
const uniforms={};
autumn.hardBindForSubMesh(null,scene,engine,{effect:{setFloat:(key,value)=>uniforms[key]=value}});
assert.equal(uniforms.aurTreeAutumn,1);
assert.equal(uniforms.aurTreeGreenOnly,0);
const lateLeaves=mesh('Auralia_V4_Leaves_late_lod');
wind.register([lateLeaves],'v3TreeWillowWeeping');
lateLeaves.material.pluginManager.getPlugin('AuraliaAutumnCanopy')
  .hardBindForSubMesh(null,scene,engine,{effect:{setFloat:(key,value)=>uniforms[key]=value}});
assert.equal(uniforms.aurTreeAutumn,1,'late GLB/LOD imports immediately share the autumn state');
const oldTree=mesh('original-shared-atlas');wind.register([oldTree],'arbolito1');
oldTree.material.pluginManager.getPlugin('AuraliaAutumnCanopy')
  .hardBindForSubMesh(null,scene,engine,{effect:{setFloat:(key,value)=>uniforms[key]=value}});
assert.equal(uniforms.aurTreeGreenOnly,1,'original harvestable trees protect the brown pixels in their atlas');
for(let i=0;i<40;i++)colors.update('spring',.1);
assert.equal(colors.autumnAmount,0,'spring restores the original unmodified material colour');
assert.ok(grass.material.pluginManager.getPlugin('AuraliaGroundWind')
  .getCustomCode('vertex').CUSTOM_VERTEX_UPDATE_WORLDPOS.includes('1.1'),
  'the separate ground plugin keeps grass motion');

const trunk = MeshBuilder.CreateBox('tree-height-probe', { height: 10 }, scene);
trunk.position.y = 5;
trunk.bakeCurrentTransformIntoVertices();
trunk.material = new PBRMaterial('Auralia_V4_wood_height_probe', scene);
wind.register([trunk], 'v4TreeSoftEmerald');
trunk.thinInstanceSetBuffer('matrix', Float32Array.from(Matrix.Translation(0, 100, 0).m), 16, true);
trunk.thinInstanceRefreshBoundingInfo();
assert.ok(trunk.getBoundingInfo().boundingBox.maximum.y > 100);
let modelHeight;
trunk.material.pluginManager.getPlugin('AuraliaLivingFoliageV5')._writeUniforms({
  updateFloat(name, value) { if (name === 'aurModelHeightV5') modelHeight = value; },
  updateFloat2() {},
}, { getMesh: () => trunk });
assert.ok(Math.abs(modelHeight - 10) < 0.001,
  'tree sway uses source geometry height rather than forest-wide thin-instance bounds');

wind.dispose();
scene.dispose();engine.dispose();
console.log('✓ V5 wind and bark coexist with V4 grass and flower motion');

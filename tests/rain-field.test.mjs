import assert from 'node:assert/strict';
import { NullEngine,Scene,ArcRotateCamera,Vector3 } from '@babylonjs/core';
import { RainField } from '../src/world/climate/RainField.ts';
const engine=new NullEngine(),scene=new Scene(engine);
const camera=new ArcRotateCamera('test',0,1,12,Vector3.Zero(),scene);
const before={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,particles:scene.particleSystems.length};
const rain=new RainField(scene,camera),mesh=scene.getMeshByName('auralia-rain-field');
const geometry=mesh.geometry,positions=mesh.getVerticesData('position'),seed=mesh.getVerticesData('rainSeed');
for(let i=0;i<1000;i++){
 camera.target.x=i*.2;
 rain.update({weatherMix:{rain:1,wind:1},dayLight:.6},false,1/60);
 assert.equal(mesh.geometry,geometry);assert.equal(mesh.getVerticesData('position'),positions);
 assert.equal(mesh.getVerticesData('rainSeed'),seed);
}
assert.equal(rain.stats.drawCalls,1);assert.equal(scene.textures.length,before.textures);
assert.equal(scene.particleSystems.length,before.particles);assert.equal(mesh.getTotalVertices(),4096);
assert.equal(mesh.isPickable,false);assert.equal(mesh.checkCollisions,false);
assert.equal(mesh.material.disableDepthWrite,true);assert.notEqual(mesh.material.depthFunction,519,'does not force GL_ALWAYS');
rain.update({weatherMix:{rain:1,wind:1},dayLight:1},true,1/60);assert.equal(rain.stats.active,false);
rain.update({weatherMix:{rain:0,wind:0},dayLight:1},false,1/60);assert.equal(rain.stats.active,false);
rain.dispose();rain.dispose();
assert.equal(scene.meshes.length,before.meshes);assert.equal(scene.materials.length,before.materials);
assert.equal(scene.textures.length,before.textures);scene.dispose();engine.dispose();
console.log('Rain field: 1 draw, 0 particles/textures, immutable buffers, shelter/clear disable, depth testing and disposal OK');

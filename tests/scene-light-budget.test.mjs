import assert from 'node:assert/strict';
import { LoadAssetContainerAsync, NullEngine, Scene, PointLight, Vector3, PBRMaterial, StandardMaterial } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { installSceneLightBudget, setMaterialLightBudget } from '../.test-build/world/SceneLightBudget.js';

const engine=new NullEngine(),scene=new Scene(engine);
installSceneLightBudget(scene);installSceneLightBudget(scene);
const facade=new PBRMaterial('facade',scene),actor=new PBRMaterial('actor',scene),interior=new StandardMaterial('interior',scene);
setMaterialLightBudget(actor,6);setMaterialLightBudget(interior,8);
for(let i=0;i<45;i++)new PointLight(`far-${i}`,Vector3.Zero(),scene).setEnabled(false);
const source='data:'+JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],nodes:[]});
for(let pass=0;pass<3;pass++){
 const assets=await Promise.all([0,1].map(()=>LoadAssetContainerAsync(source,scene,{pluginExtension:'.gltf'})));
 assert.equal(facade.maxSimultaneousLights,4,'unrelated disabled lights must not expand facade shaders');
 assert.equal(actor.maxSimultaneousLights,6,'explicit actor lighting survives concurrent imports');
 assert.equal(interior.maxSimultaneousLights,8,'interior keeps its own local-light budget');
 assets.forEach(a=>a.dispose());
}
const other=new Scene(engine),untouched=new PBRMaterial('other-scene',other);
for(let i=0;i<10;i++)new PointLight('other',Vector3.Zero(),other);
const asset=await LoadAssetContainerAsync(source,other,{pluginExtension:'.gltf'});
assert.equal(untouched.maxSimultaneousLights,10,'policy is scoped to installed scenes');
asset.dispose();other.dispose();scene.dispose();engine.dispose();
console.log('Light budgets: real glTF imports, concurrent loading, explicit receiver budgets and scene isolation OK');

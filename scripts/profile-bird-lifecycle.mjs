// Focused CPU/resource probe using the real bird GLBs. NullEngine does not measure GPU FPS.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {NullEngine,Scene,TransformNode,LoadAssetContainerAsync,FreeCamera,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';

const runtime=resolve('.test-build/bird-lifecycle');mkdirSync(runtime,{recursive:true});
for(const name of ['BirdCatalog','BirdFlightPath','BirdSimulation','BirdHabitat','BirdFlockSystem']){
  const code=ts.transpileModule(readFileSync(`src/world/wildlife/${name}.ts`,'utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    .replace(/from '(\.\/Bird\w+)'/g,"from '$1.mjs'")
    .replace("import { loadGpuAssetContainerAsync } from '../GpuAssets';","import { LoadAssetContainerAsync as loadGpuAssetContainerAsync } from '@babylonjs/core';");
  writeFileSync(resolve(runtime,`${name}.mjs`),code);
}
const {BirdFlockSystem}=await import(pathToFileURL(resolve(runtime,'BirdFlockSystem.mjs')));
const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('world',scene);
scene.activeCamera=new FreeCamera('probe',new Vector3(0,2,-8),scene);
const importer=(url,scene,options)=>LoadAssetContainerAsync(
  'data:application/octet-stream;base64,'+readFileSync('public'+url).toString('base64'),scene,options);
const birds=new BirdFlockSystem(scene,root,{ground:()=>0,water:()=>null,trees:()=>[],foodAllowed:()=>true},false,importer);
await birds.ready;
const counts=()=>({meshes:scene.meshes.length,skeletons:scene.skeletons.length,
  morphManagers:scene.morphTargetManagers.length,animationGroups:scene.animationGroups.length,
  animatables:scene.animatables.length,heapMiB:Math.round(process.memoryUsage().heapUsed/1048576)});
const cycles=[];
for(let cycle=0;cycle<6;cycle++){
  let maxUpdateMs=0;
  for(let i=0;i<40;i++){
    const start=performance.now();birds.update(1/60,{focus:{x:cycle*130,y:0,z:0},threats:[],night:0,rain:0,active:true,paused:false});
    maxUpdateMs=Math.max(maxUpdateMs,performance.now()-start);
    // Advance Babylon too, so stopped animatables get their normal frame cleanup.
    scene.render();
  }
  global.gc?.();cycles.push({cycle,...counts(),maxUpdateMs:+maxUpdateMs.toFixed(2)});
}
birds.dispose();global.gc?.();
const report={engine:'NullEngine; CPU/resource lifecycle only',cycles,afterDispose:counts()};
console.log(JSON.stringify(report,null,2));
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
scene.dispose();engine.dispose();

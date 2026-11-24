import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';

const dir=resolve('.test-build/rainbow-runtime');mkdirSync(dir,{recursive:true});
for(const name of ['ClimateModel','ClimateRainbow']){
  const code=ts.transpileModule(readFileSync(`src/world/climate/${name}.ts`,'utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    .replace("from './RainbowFX.js'","from './RainbowFX.mjs'");
  writeFileSync(resolve(dir,name+'.mjs'),code);
}
writeFileSync(resolve(dir,'RainbowFX.mjs'),readFileSync('src/world/climate/RainbowFX.js','utf8'));
const {sampleClimate}=await import(pathToFileURL(resolve(dir,'ClimateModel.mjs')));
const {ClimateRainbow,rainbowSunVisibility}=await import(pathToFileURL(resolve(dir,'ClimateRainbow.mjs')));
const {RainbowFX}=await import(pathToFileURL(resolve(dir,'RainbowFX.mjs')));
const engine=new NullEngine(),scene=new Scene(engine);
const camera=new FreeCamera('rainbow-test',new Vector3(1200,5,-800),scene);camera.maxZ=3200;camera.getViewMatrix(true);
const baseline={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length};
const fx=new RainbowFX(scene,{skyDistance:2500});
for(let i=0;i<120;i++)fx.update(1/60,camera,{sunDirection:{x:2,y:.6,z:0},sunVisibility:1,isDay:true,rainAmount:.7});
assert.ok(fx.getStats().skyAlpha>.3,'plain public WorldPoint correctly drives the sun direction');
assert.ok(Math.abs(fx._axis.x+2/Math.hypot(2,.6))<1e-6,'arc is opposite the actual sun');
const depth=Vector3.Distance(fx._sky.position,camera.globalPosition);
assert.ok(depth>2000&&depth<camera.maxZ,'transparent sorting follows its real distant position');
assert.ok(depth/Math.cos(42.3*Math.PI/180)<camera.maxZ,'whole primary band fits the far plane');
assert.equal(fx._sky.renderingGroupId,0);assert.equal(fx._mat.disableDepthWrite,true);
assert.ok(fx._mat.depthFunction!==519,'keeps depth testing instead of forcing ALWAYS');
assert.equal(fx.getStats().drawCalls,1);assert.equal(fx.getStats().textures,0);
fx.dispose();

const rainbow=new ClimateRainbow(scene);
let queries=0,roof=0;
rainbow.configureSurface(()=>{queries++;return {height:roof,kind:'ground'};});
const shower={...sampleClimate(8,'rain'),weatherMix:{...sampleClimate(8,'rain').weatherMix,cloud:.55,darken:.1}};
const run=(frame=shower,rain=.5,sheltered=false,paused=false,steps=180)=>{
  for(let i=0;i<steps;i++)rainbow.update(1/60,camera,frame,rain,sheltered,paused);
};
run();assert.ok(rainbow.stats.skyAlpha>.1);assert.equal(rainbow.stats.drawCalls,1);
assert.ok(queries<=13,'exposure sampling is bounded while stationary');
const lit=rainbow.stats.skyAlpha;
run(shower,0,false,false,1);assert.ok(rainbow.stats.skyAlpha>0&&rainbow.stats.skyAlpha<lit,'dry weather fades gradually');
run(shower,0);assert.equal(rainbow.stats.drawCalls,0);
for(const frame of [sampleClimate(22,'rain'),sampleClimate(8,'storm'),sampleClimate(8,'overcast')]){
  assert.equal(rainbowSunVisibility(frame),0);run(frame);assert.equal(rainbow.stats.drawCalls,0);
}
run(sampleClimate(5,'clear'));assert.equal(rainbow.stats.drawCalls,0,'below-horizon sun does not activate it');
run({...shower,sunDirection:[0,1,0],sunHeight:1});assert.equal(rainbow.stats.drawCalls,0,'high sun places the bow below the horizon');
run(shower);const paused=rainbow.stats.skyAlpha;
run(shower,0,false,true);assert.equal(rainbow.stats.skyAlpha,paused,'pause freezes the fade');
run(shower,.5,true);assert.equal(rainbow.stats.drawCalls,0,'underground exposure disables the bow');
run();roof=12;rainbow.invalidateSurface();run();assert.equal(rainbow.stats.drawCalls,0,'existing roof receiver shelters the camera');
roof=0;rainbow.invalidateSurface();run();assert.equal(rainbow.stats.drawCalls,1);
camera.position.x+=500;camera.getViewMatrix(true);run(shower,.5,false,true,1);
assert.equal(rainbow.stats.skyAlpha,0,'teleport clears the old atmosphere even while paused');
const resources={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length};
for(let trip=0;trip<8;trip++){rainbow.reset();run();}
assert.deepEqual({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length},resources,'travel reuses a single mesh/material');
assert.equal(resources.textures,baseline.textures,'no added texture allocations');
let naturalClearing;
for(let hour=0;hour<24*48;hour+=.1){
  const frame=sampleClimate(hour);
  if(frame.weatherMix.rain>.07&&frame.sunHeight>.15&&frame.sunHeight<.6&&rainbowSunVisibility(frame)>.3){naturalClearing=frame;break;}
}
assert.ok(naturalClearing,'the normal weather cycle contains rainy daytime clearings');
rainbow.reset();run(naturalClearing,naturalClearing.weatherMix.rain);
assert.ok(rainbow.stats.skyAlpha>.01,'the real blended weather can activate the bow');
rainbow.dispose();rainbow.dispose();
assert.deepEqual({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length},baseline);
scene.dispose();engine.dispose();
console.log('PASS rainbow: rainy clearings, sun direction, fades, clouds/night/roofs, pause, travel and resource disposal.');

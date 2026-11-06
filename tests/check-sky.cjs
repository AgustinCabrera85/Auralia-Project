const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const file=path.resolve(__dirname,'../src/world/climate/SkyDome.ts');
const source=fs.readFileSync(file,'utf8');
const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
assert.equal(parsed.parseDiagnostics.length,0,'TypeScript syntax');
const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(out.diagnostics?.length??0,0,'TypeScript transpilation');
const fragment=/const FRAGMENT_SHADER=`([\s\S]*?)`;/m.exec(source)?.[1];
assert.ok(fragment,'fragment shader present');
assert.equal((fragment.match(/\{/g)||[]).length,(fragment.match(/\}/g)||[]).length,'balanced GLSL braces');
const shaderExports=[...source.matchAll(/uniform (?:float|vec3|sampler2D) (\w+);/g)].map(m=>m[1]);
assert.ok(shaderExports.includes('uCloudNoise'));
for(const s of ['uSkyTop','uSkyHorizon','uCloudColor','uCloud','uWind','uTime','uNight'])
  assert.ok(shaderExports.includes(s),`${s} available`);
const instructions=['texture2D','skyVisibility','deckStrength','sin(uTime','uCloud>.02',
  'pseudoNormal','veilMask','sunDisc','moonDisc'];
for(const str of instructions) assert.ok(fragment.includes(str),`shader has ${str}`);
class RawTexture {constructor(data,w,h){this.data=data;this.width=w;this.height=h;} }
const sandbox={module:{exports:{}},exports:{},require(id){if(id==='@babylonjs/core')return {
  RawTexture,Engine:{TEXTUREFORMAT_RGBA:5},Texture:{TRILINEAR_SAMPLINGMODE:3,WRAP_ADDRESSMODE:1},Effect:{ShadersStore:{}}
};throw Error(`Unexpected import ${id}`)},console};
vm.runInNewContext(out.outputText+'\nmodule.exports.makeCloudNoiseForTest=makeCloudNoise;',sandbox,{timeout:25000});
const result=sandbox.module.exports.makeCloudNoiseForTest({});
assert.equal(result.data.length,256*256*4);
assert.ok(result.data.every(Number.isFinite));
const sampled=[];for(let i=0;i<result.data.length;i+=4)sampled.push(result.data[i]);
assert.ok(sampled.some(v=>v<35),'sky gaps exist');
assert.ok(sampled.some(v=>v>210),'cloud centers exist');
const average=sampled.reduce((a,b)=>a+b,0)/sampled.length;
assert.ok(average>20&&average<185,`balanced density ${average}`);
console.log('SkyDome TS syntax, GLSL structure and illustrated atlas:', 'OK', 'atlas average',average.toFixed(1));

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
const noiseSource=fs.readFileSync(path.resolve(__dirname,
  '../src/world/climate/NoiseCloudShader.ts'),'utf8');
const noiseFunctions=/NOISE_CLOUD_FUNCTIONS\s*=\s*`([\s\S]*?)`;/m.exec(noiseSource)?.[1];
assert.ok(noiseFunctions,'noise cloud shader module present');
const fragment=/const FRAGMENT_SHADER=`([\s\S]*?)`;/m.exec(source)?.[1]
  .replace('${NOISE_CLOUD_FUNCTIONS}',noiseFunctions);
assert.ok(fragment,'fragment shader present');
assert.equal((fragment.match(/\{/g)||[]).length,(fragment.match(/\}/g)||[]).length,'balanced GLSL braces');
const shaderExports=[...source.matchAll(/uniform (?:float|vec3|sampler2D) (\w+);/g)].map(m=>m[1]);
for(const s of ['uSkyTop','uSkyHorizon','uCloudColor','uCloud','uNight'])
  assert.ok(shaderExports.includes(s),`${s} available`);
const instructions=['weatherHaze','sunDisc','moonDisc','sparkle'];
for(const str of instructions) assert.ok(fragment.includes(str),`shader has ${str}`);
assert.ok(source.includes("this.pieces=this.renderer==='pieces'?new CloudPieces(scene,camera):null"),
  'painted formations are created only when explicitly selected');
assert.ok(source.includes("this.renderer==='noise'&&this.noiseReady?1:0"),
  'the density field is enabled only for the noise renderer');
console.log('Sky dome TS syntax, stars, sun, moon and atmospheric weather:', 'OK');

const root=path.resolve(__dirname,'../public/assets/auralia-clouds');
const loadJson=(name)=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const catalogs={painted:loadJson('painted/painted_segments.json'),
  modular:loadJson('modular/cloud_segments.json')};
const pieceSource=fs.readFileSync(path.resolve(__dirname,
  '../src/world/climate/CloudPieces.ts'),'utf8');
const pieceVertex=/const VERTEX_SHADER=`([\s\S]*?)`;/m.exec(pieceSource)?.[1];
assert.ok(pieceVertex?.includes('vec3 center=cloudCenter*c+cross(axis,cloudCenter)*s'),
  'wind rotates cloud centers');
assert.ok(pieceVertex?.includes('vec3 p=normalize(center+(right*cloudOffset.x+up*cloudOffset.y)*scale)'),
  'cloud vertices follow the sky sphere');
assert.ok(!pieceVertex.includes('uCameraRight')&&!pieceVertex.includes('uCameraUp'),
  'cloud orientation must not follow camera rotation');
assert.ok(!pieceVertex.includes('cross(axis,p)*s'),
  'wind must not rotate the painted quad itself');
const pieceShader=/const FRAGMENT_SHADER=`([\s\S]*?)`;/m.exec(pieceSource)?.[1];
for(const name of ['uColor0','uColor1','uColor2','uMask0','uMask1','uMask2'])
  assert.ok(pieceShader?.includes(name),`${name} participates in formation`);
assert.ok(pieceShader.includes('w0+w1+w2')&&pieceShader.includes('inCell'),
  'atlas components merge inside each cell instead of drawing separate sprites');
assert.equal((pieceShader.match(/\{/g)||[]).length,(pieceShader.match(/\}/g)||[]).length,
  'cloud formation shader braces');
class Vec3 {
  constructor(x,y,z){this.x=x;this.y=y;this.z=z;}
  add(v){return new Vec3(this.x+v.x,this.y+v.y,this.z+v.z);}
  scale(s){return new Vec3(this.x*s,this.y*s,this.z*s);}
}
const pieceExports={};
const pieceCode=ts.transpileModule(pieceSource,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(pieceCode+'\nexports.formationsForTest=FORMATIONS;', {exports:pieceExports,
  require(id){if(id==='@babylonjs/core')return {Vector3:Vec3};
    if(id==='../AuraliaWindSystem')return {};throw Error(`Unexpected import ${id}`);},console});
let sourceParts=0;
for(const family of ['fair','storm'])for(const variant of pieceExports.formationsForTest[family]){
  assert.equal(variant.length,3,'each formation has overlapping support and a core');
  assert.equal(variant.at(-1).source,'painted','painted core closes the silhouette');
  for(const part of variant){
    const catalog=catalogs[part.source],atlas=catalog.atlases[family];
    const entry=catalog.parts.find(p=>p.id===part.id&&p.atlas===family);
    assert.ok(entry,`${family}/${part.source}/${part.id} exists in an atlas`);
    const [x,y,w,h]=entry.rectPx;
    assert.ok(x>=0&&y>=0&&w>8&&h>8&&x+w<=atlas.size[0]&&y+h<=atlas.size[1]);
    assert.ok(part.x>=0&&part.y>=0&&part.x+part.width<=1&&part.y+part.height<=1,
      `${part.id} stays inside its composed cell`);
    for(const name of ['color','data'])
      assert.ok(fs.statSync(path.join(root,part.source,atlas[name])).size>100);
    sourceParts++;
  }
}
assert.equal(sourceParts,24,'eight curated source formations');
assert.ok(!pieceExports.formationsForTest.storm.some(variant=>variant.some(part=>
  part.source==='painted'&&['storm_shelf','storm_base'].includes(part.id))),
  'painted storm scraps stay out of formations');
const makeGeometry=pieceExports.CloudPieces.prototype.makeGeometry;
for(const [quality,expected] of [['low',[12,8]],['standard',[20,12]],['high',[28,16]]]){
  let total=0;
  for(const [index,family] of ['fair','storm'].entries()){
    const geometry=makeGeometry.call({quality},family);
    assert.equal(geometry.count,expected[index]);
    const verticesPerCloud=7*5,indicesPerCloud=6*4*6;
    assert.equal(geometry.indices.length,geometry.count*indicesPerCloud);
    assert.equal(geometry.positions.length/3,geometry.count*verticesPerCloud);
    assert.equal(geometry.offsets.length,geometry.count*verticesPerCloud*2);
    for(let i=0;i<geometry.count;i++){
      const offsets=geometry.offsets.slice(i*verticesPerCloud*2,
        (i+1)*verticesPerCloud*2);
      assert.ok(offsets[0]<0&&offsets[12]>0&&offsets[1]<0&&offsets.at(-1)>0,
        'each formation spans both sky axes');
      assert.equal(offsets[0],offsets[56]);
      assert.equal(offsets[1],offsets[13]);
    }
    assert.ok(geometry.indices.every(i=>i<geometry.positions.length/3));
    assert.ok(geometry.uvs.every(v=>v>=0&&v<=1),'composed atlas UVs stay inside');
    assert.ok(geometry.positions.every(Number.isFinite),'formation vertices are finite');
    total+=geometry.count;
  }
  assert.ok(total<=44,'quality budget stays bounded');
}
console.log('Curated source parts, curved sky patches and 20/32/44 cloud budgets:', 'OK');

// Compile the new GLSL with Babylon's bundled validator. Adapt ES 1 syntax to
// ES 3 only for SPIR-V validation; the game's shader strings stay unchanged.
const glslangFile=path.resolve(__dirname,
  '../node_modules/@babylonjs/core/assets/glslang/glslang.js');
const wasmFile=path.resolve(__dirname,
  '../node_modules/@babylonjs/core/assets/glslang/glslang.wasm');
const glslangModule={exports:{}};
vm.runInNewContext(fs.readFileSync(glslangFile,'utf8'),{
  module:glslangModule,exports:glslangModule.exports,require,console,process,Buffer,
  WebAssembly,setTimeout,clearTimeout,window:{},document:{currentScript:null},
  fetch:async()=>new Response(fs.readFileSync(wasmFile),{
    headers:{'Content-Type':'application/wasm'}})
});
function shaderForValidation(name,stage,input=pieceSource){
  const tick=String.fromCharCode(96);
  let code=input.split(`const ${name}=${tick}`)[1].split(`${tick};`)[0].trimStart()
    .replace('${NOISE_CLOUD_FUNCTIONS}',noiseFunctions);
  const uniforms=[...code.matchAll(/uniform (mat4|float|vec2|vec3) (\w+);/g)]
    .map(match=>`${match[1]} ${match[2]};`).join('\n');
  code=code.replace(/uniform (mat4|float|vec2|vec3) \w+;/g,'');
  let binding=0;
  code=code.replace(/uniform sampler2D (\w+);/g,(_,name)=>
    `layout(set=0,binding=${binding++}) uniform sampler2D ${name};`);
  code=code.replace(/texture2D/g,'texture').replace(/gl_FragColor/g,'outColor');
  let location=0;
  code=code.replace(/attribute (vec2|vec3|vec4) (\w+);/g,(_,type,name)=>
    `layout(location=${location++}) in ${type} ${name};`);
  location=0;
  code=code.replace(/varying (vec2|vec3|float) (\w+);/g,(_,type,name)=>
    `layout(location=${location++}) ${stage==='vertex'?'out':'in'} ${type} ${name};`);
  code=code.replace('precision highp float;',
    'precision highp float;\n'+
    `layout(std140,set=0,binding=15) uniform Params {\n${uniforms}\n};\n`+
    (stage==='fragment'?'layout(location=0) out vec4 outColor;\n':''));
  return `#version 310 es\n${code}`;
}
glslangModule.exports(wasmFile).then(validator=>{
  for(const input of [pieceSource,source])
    for(const [name,stage] of [['VERTEX_SHADER','vertex'],['FRAGMENT_SHADER','fragment']])
      assert.ok(validator.compileGLSL(shaderForValidation(name,stage,input),stage).length>0,
        `${name} compiles`);
  console.log('Painted clouds and noise sky vertex/fragment GLSL:', 'OK');
}).catch(error=>{console.error(error);process.exitCode=1;});

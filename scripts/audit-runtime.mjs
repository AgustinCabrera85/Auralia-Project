import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Authentic authoring modules are also game dependencies. This audit deliberately
// does not create stubs, empty world data, or replacement textures.
const required=[
  ...['WorldEditState','AuthoredAssets','AuthoredWater','AuraliaWaterProfiles',
    'LiveWaterProfiles','WaterJoin','WaterfallSpline'].map(n=>`src/world/editor/${n}.ts`),
  'world-editor.html','src/world-editor/index.ts','src/world-editor/AxisTranslationGizmo.ts',
  'src/world-editor/style.css','public/water-lab-v4.html','public/world/auralia-world.json',
  'public/assets/water/caustics-refractive-1k.png','public/assets/water/waterfall-foam-plates-1k.png',
  'public/assets/terrain/snow_albedo_rough.webp','public/assets/terrain/lava_albedo_rough.webp',
];
const files=required.map(file=>{
  assert.ok(fs.existsSync(file),`Missing genuine runtime dependency: ${file}`);
  const bytes=fs.readFileSync(file);
  return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
});
const temp=path.resolve('.test-build/audit-world-state.mjs');
fs.mkdirSync(path.dirname(temp),{recursive:true});
fs.writeFileSync(temp,ts.transpileModule(fs.readFileSync(required[0],'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText);
try{
  const {parseWorldDocument}=await import(pathToFileURL(temp).href);
  const original=JSON.parse(fs.readFileSync('public/world/auralia-world.json','utf8'));
  const parsed=parseWorldDocument(original),counts={};
  assert.equal(parsed.version,original.version);
  for(const key of ['height','modules','surfaces','grass','grassBakes','assets','models','water']){
    counts[key]=parsed[key].length;
    assert.equal(counts[key],original[key]?.length??0,`${key}: parser dropped authored records`);
  }
  for(const key of ['assets','models','water'])
    assert.deepEqual(parsed[key].map(x=>x.id),original[key]?.map(x=>x.id)??[],`${key}: stable identifiers`);
  assert.deepEqual(parsed.grassBakes,original.grassBakes??[],'baked vegetation matrices preserved');
  console.log(JSON.stringify({schemaVersion:parsed.version,counts,files},null,2));
}finally{fs.unlinkSync(temp);}

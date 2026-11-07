'use strict';
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
const dome=get('src/world/climate/SkyDome.ts');
const shader=get('src/world/climate/NoiseCloudShader.ts');
assert.ok(dome.includes("'cloudRenderer')==='noise'?'noise':'pieces'"),
  'illustrated clouds are the default; noise requires explicit opt-in');
assert.ok(dome.includes('new CloudPieces(scene,camera)'),'legacy atlas renderer retained');
assert.ok(dome.includes('uCloudField'),'new noise sampler declared');
assert.ok(dome.includes('this.wind.effectiveStrength'),'noise follows shared wind');
assert.ok(shader.includes('Worley')&&shader.includes('cloudField('));
assert.ok(shader.includes('uCloudSteps')&&shader.includes('uCloudStorm'));
assert.ok(shader.includes('transmission*=1.0-alpha')&&shader.includes('float contribution'),
  'ordered opacity composition preserves foreground cloud colour');
assert.ok(/atan\(skyDir\.z,\s*skyDir\.x\)/.test(shader),'spherical projection avoids horizon stretching');
assert.ok(shader.includes('for (int i = 0; i < 8; ++i)'),'bounded sampling budget');
const braces=s=>[...s].reduce((v,c)=>v+(c==='{')-(c==='}'),0);
assert.equal(braces(shader.match(/NOISE_CLOUD_FUNCTIONS\s*=\s*`([\s\S]*?)`;/)[1]),0);
const png=fs.readFileSync(path.join(root,'public/assets/auralia-clouds/noise/cloud_field_rgba_512.png'));
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);
assert.equal(png[25],6,'RGBA PNG noise texture');
console.log('Auralia noise cloud: renderer switch, cloud-density shader and RGBA field OK');

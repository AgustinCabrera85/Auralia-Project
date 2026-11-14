const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,Mesh,VertexData,PBRMaterial,TransformNode}=require('@babylonjs/core');
const {generateGrassPatch,generateGrassPatchSteps,grassPatchDensity,GRASS_PATCH,GRASS_HEIGHT}=require('../.test-build/world/grass/GrassPatchData.js');
const {TRAVERSAL}=require('../.test-build/game/traversalRules.js');
const {grassHabitatSampler}=require('../.test-build/world/grass/GrassHabitat.js');
const {GrassSectorSystem}=require('../.test-build/world/grass/GrassSectorSystem.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {BRISALIA_BUILDINGS,BRISALIA_PATHS,BRISALIA_SCALE,brisaliaRoadEdge,inBrisaliaFootprint}=require('../.test-build/world/brisaliaLayout.js');
function loader(scene){const material=new PBRMaterial('test-grass',scene);return Promise.resolve(['short','medium','tall','flower'].map(name=>{
 const mesh=new Mesh('grass_'+name,scene),d=new VertexData();d.positions=[-.1,0,0,.1,0,0,0,1,0];d.normals=[0,0,1,0,0,1,0,0,1];d.indices=[0,1,2];d.colors=[.08,.28,.045,1,.08,.28,.045,1,.29,.61,.14,1];d.applyToMesh(mesh);mesh.material=material;return mesh;
}));}
(async()=>{
 let ready=true,extraLoads=0;
 const world={source:{id:'flat-test',seaLevel:0,bounds:[-7000,-7000,7000,7000],streamed:true,
  heightAt:(x,z)=>12+x*.02+z*.01,weightsAt:()=>[.85,.15,0,0,0,0],isReady:()=>ready,prepare:async()=>extraLoads++},
  biomeWeights:()=>({valle:1,ecos:0,sierras:0,nacar:0,costa:0,cumbres:0}),waterAt:()=>null,
  masks:()=>({lake:0,river:0,road:0,existingRoadClearance:1000})};
 const a=generateGrassPatch(0,0,world);assert.deepEqual(a,generateGrassPatch(0,0,world));assert.ok(a.length>0);
 const sparseSteps=generateGrassPatchSteps(0,0,world,false);let sparse=sparseSteps.next();while(!sparse.done)sparse=sparseSteps.next();
 assert.deepEqual(sparse.value,a.filter(p=>p.distant),'coarse background uses the same roots as the detailed grass');
 for(const p of a){assert.ok(Math.abs(p.matrix[13]-(12+p.x*.02+p.z*.01)+.018)<.00001);assert.ok(p.matrix[5]/TRAVERSAL.playerHeight>=.5&&p.matrix[5]/TRAVERSAL.playerHeight<=.75);}
 const densities=[];for(let x=-500;x<500;x+=30)densities.push(grassPatchDensity(x,40));
 assert.ok(Math.max(...densities)-Math.min(...densities)>.55,'dense runs and clearings');
 for(const weights of [[0,0,0,1,0,0],[0,0,1,0,0,0],[.5,0,.1,.4,0,0]]){
  const bad={...world,source:{...world.source,weightsAt:()=>weights}};assert.equal(generateGrassPatch(0,0,bad).length,0,'no grass on sand/rock/mixed banks');
 }
 assert.equal(generateGrassPatch(0,0,{...world,waterAt:()=>({level:15})}).length,0);
 assert.equal(generateGrassPatch(0,0,{...world,masks:()=>({road:1,existingRoadClearance:0})}).length,0);
 assert.equal(generateGrassPatch(0,0,{...world,source:{...world.source,heightAt:x=>12+x*2}}).length,0);
 setActiveGeography(world);const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('grass',scene);let exclusions=[];
 const system=new GrassSectorSystem(scene,root,()=>exclusions,loader);await system.whenReady;
 for(const mesh of scene.meshes.filter(m=>m.metadata?.grassSource)){
  const y=Array.from(mesh.getVerticesData('position')).filter((_,i)=>i%3===1);
  assert.equal(Math.min(...y),0);assert.equal(Math.max(...y),1,'every source variant has unit height');
 }
 system.setFocus(0,0);ready=false;system.update();assert.ok(system.pendingCount);assert.equal(system.instanceCount,0);
 const settle=()=>{for(let i=0;i<4000&&system.pendingCount;i++)system.update();system.update();assert.equal(system.pendingCount,0);};
 ready=true;settle();assert.equal(extraLoads,0);assert.ok(system.metrics.near>100&&system.metrics.sprites>100);
 assert.ok(system.metrics.near<=GRASS_PATCH.maxNear&&system.metrics.sprites<=GRASS_PATCH.maxSprites);
 const maxPatches=(2*Math.ceil((GRASS_PATCH.farEnd+GRASS_PATCH.prefetch)/GRASS_PATCH.size)+3)**2;
 assert.ok(system.drawCallsEstimate<=8&&system.activeSectorCount<=maxPatches);
 const matrices=()=>Object.fromEntries(scene.meshes.filter(m=>m.metadata?.grassSource||m.metadata?.grassSprite).map(m=>[m.name,Array.from(m.thinInstanceGetWorldMatrices(),p=>Array.from(p.m))]));
 const initial=matrices(),generated=system.metrics.generatedPatches;
 const far=Object.entries(initial).filter(([name])=>name.startsWith('grass-sprite-')).flatMap(([,m])=>m);
 assert.ok(far.some(m=>Math.hypot(m[12],m[14])>GRASS_PATCH.farEnd*.85),'grass already covers the distant background');
 assert.ok(system.metrics.residentPatches>Math.PI*(GRASS_PATCH.farEnd/GRASS_PATCH.size)**2,'resident ring extends beyond the visible range');
 system.setFocus(.1,0);system.update();assert.deepEqual(matrices(),initial,'sub-cell movement only updates shader focus');
 assert.equal(system.metrics.generatedPatches,generated);
 const sample=Object.values(initial).flat()[0],x=sample[12],z=sample[14];
 exclusions=[{x,z,radius:5}];system.refreshExclusions();system.update();
 for(const m of Object.values(matrices()).flat())assert.ok(Math.hypot(m[12]-x,m[14]-z)>=5.49);
 exclusions=[];system.refreshExclusions();system.setFocus(0,0);system.update();
 system.setFocus(600,600);settle();assert.ok(system.activeSectorCount<=maxPatches);system.setFocus(0,0);settle();assert.deepEqual(matrices(),initial,'revisiting restores stable placement and LOD');
 system.deactivate();assert.equal(system.instanceCount,0);assert.equal(system.pendingCount,0);assert.equal(system.activeSectorCount,0);
 system.setFocus(0,0);settle();system.setEnabled(false);assert.equal(system.instanceCount,0);system.setEnabled(true);system.setFocus(0,0);settle();assert.ok(system.instanceCount>0);
 const mat=scene.getMaterialByName('grass-sprite-cutout');assert.ok(mat instanceof PBRMaterial,'same linear lighting as near grass');assert.equal(mat.needAlphaTesting(),true);assert.equal(mat.needAlphaBlending(),false);
 const plugin=mat.pluginManager.getPlugin('AuraliaGrassDistance'),code=plugin.getCustomCode('vertex').CUSTOM_VERTEX_UPDATE_WORLDPOS;
 const uniforms={};plugin.hardBindForSubMesh(null,null,null,{effect:{setFloat2:(name,a,b)=>uniforms[name]=[a,b],setFloat3:(name,a,b,c)=>uniforms[name]=[a,b,c]}});assert.deepEqual(uniforms.grassFocus,[0,0]);
 assert.deepEqual(uniforms.grassCompanion,[0,0,0]);
 system.setCompanionContact(3,4,true);plugin.hardBindForSubMesh(null,null,null,{effect:{setFloat2:()=>{},setFloat3:(name,a,b,c)=>uniforms[name]=[a,b,c]}});
 assert.deepEqual(uniforms.grassCompanion,[3,4,1.5]);
 system.setCompanionContact(3,4,false);plugin.hardBindForSubMesh(null,null,null,{effect:{setFloat2:()=>{},setFloat3:(name,a,b,c)=>uniforms[name]=[a,b,c]}});
 assert.equal(uniforms.grassCompanion[2],0,'inactive companion leaves grass untouched');
 assert.match(code,/grassContact/);assert.match(code,/grassTip \*= grassTip/);assert.doesNotMatch(plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_MAIN_BEGIN,/gl_FragCoord/);
 system.dispose();scene.dispose();engine.dispose();setActiveGeography(null);
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
 const real=await PlayableWorld.create(source,splines,hydrology);await real.prepareAround(-3024,-1153);
 let total=0;
 for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
  const patch=generateGrassPatch(Math.floor(-3024/24)+dx,Math.floor(-1153/24)+dz,real),green=grassHabitatSampler(real);
  for(const p of patch){assert.equal(green(p.x,p.z),true);assert.ok(real.surface.surfaceAt(p.x,p.z).height-p.matrix[13]<.2);total++;}
 }
 assert.ok(total>100,'lagoon grass still has viable green slopes');
 // Test the actual settlement, including the old broad town road mask. Every
 // doorway, courtyard and street must remain clear while verges keep tall grass.
 await real.prepareAround(real.town.x,real.town.z);
 const townGrass=[];
 for(let pz=Math.floor((real.town.z-125*BRISALIA_SCALE)/24);pz<=Math.floor(real.town.z/24);pz++)
  for(let px=Math.floor((real.town.x-118*BRISALIA_SCALE)/24);px<=Math.floor((real.town.x+170*BRISALIA_SCALE)/24);px++){
   const patch=generateGrassPatch(px,pz,real);
   for(const p of patch){
    const x=p.x-real.town.x,z=p.z-real.town.z;
    assert.equal(inBrisaliaFootprint(x,z,.89),false,'no plants in buildings or castle courtyard');
    assert.ok(brisaliaRoadEdge(x,z)>=1.1,'clear streets, plaza and door approaches');
    assert.ok(p.matrix[5]>=GRASS_HEIGHT.min&&p.matrix[5]<=GRASS_HEIGHT.max,'village keeps the original tall grass');
    townGrass.push(p);
   }
  }
 assert.ok(townGrass.length>3000,'settlement verges are planted');
 assert.ok(townGrass.filter(p=>p.variant==='flower').length>townGrass.length*.03,'flower patches among the grass');
 assert.ok(townGrass.some(p=>Math.hypot(p.x-real.town.x,p.z-real.town.z)<145),'old town-wide mask no longer erases verges');
 for(const path of BRISALIA_PATHS)for(const [x,z] of path.points)
  assert.ok(brisaliaRoadEdge(x,z)<0,'all entry connections share the street mask');
 assert.equal(BRISALIA_BUILDINGS.length,28);
 // Inspect the shipped PNG bytes: Canvas serialization used to erase transparent RGB,
 // which brought black outlines back in the GPU's filtered mip levels.
 const png=await fs.readFile('public/assets/grass/grass-sprites.png'),idat=[];
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 assert.deepEqual([width,height],[1024,256]);
 for(let i=8;i<png.length;){const n=png.readUInt32BE(i);if(png.toString('ascii',i+4,i+8)==='IDAT')idat.push(png.subarray(i+8,i+8+n));i+=n+12;}
 const pixels=require('node:zlib').inflateSync(Buffer.concat(idat));let clear=0,solid=0;
 for(let y=0;y<height;y++){
  assert.equal(pixels[y*(width*4+1)],0);
  for(let x=0;x<width;x++){const i=y*(width*4+1)+1+x*4;if(pixels[i+3]===0){clear++;assert.ok(pixels[i]+pixels[i+1]+pixels[i+2]>0,'colored transparent texels prevent black fringes');}if(pixels[i+3]===255)solid++;}
 }
 assert.ok(clear>width*height*.3&&solid>width*height*.1,'visible blades and transparent gaps');
 await fs.mkdir('artifacts/geographic-source/grass',{recursive:true});await fs.writeFile('artifacts/geographic-source/grass/validation.json',JSON.stringify({lagoonGreenPlacements:total,noExtraR16Loads:extraLoads,height:GRASS_HEIGHT,santiHeight:TRAVERSAL.playerHeight,limits:GRASS_PATCH,checks:['determinism','green material only','sand/rock/water/cliff/path exclusion','root height','50–75% of Santi height, normalized variants','budgeted queue','unready sectors retry','obstacles','LOD caps','revisit','deactivate','shader focus/contact','alpha test, no blend, no stipple']},null,2)+'\n');
 console.log('Grass LOD, habitats, streaming and player bending validated:',total,'lagoon placements;',townGrass.length,'village placements');
})().catch(e=>{console.error(e);process.exitCode=1});

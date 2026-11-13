const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {NullEngine,Scene,TransformNode,Effect}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld,regionLocal,regionPoint,MIGRATED_WATERSHED_RIVERS,RIVER_FEATURE_OVERLAYS}=require('../.test-build/world/geography/PlayableWorld.js');
const {inLagoonRegion,LAGOON_CHANNELS}=require('../.test-build/world/lagoonData.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');
const {GeographyStream}=require('../.test-build/world/GeographyStream.js');
const {OceanWater}=require('../.test-build/world/water/OceanWater.js');
(async()=>{
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
 const world=await PlayableWorld.create(source,splines,hydrology);setActiveGeography(world);
 const report={routes:[],migratedRoutes:MIGRATED_WATERSHED_RIVERS,featureOverlays:RIVER_FEATURE_OVERLAYS,nativeRoutes:[],regressions:[],issues:[],minDepth:Infinity,maxLevelJump:0,axisSamples:0,excavationSamples:0,maskBytes:world.oceanExclusion.data.byteLength};
 assert.equal(world.runtimeSplines.length+MIGRATED_WATERSHED_RIVERS.length+Object.keys(RIVER_FEATURE_OVERLAYS).length,splines.filter(s=>s.type==='river').length,'every authored water record has an explicit owner');
 for(const route of world.runtimeSplines){
  const row={id:route.id,samples:0,watershed:0,lake:0,platform:0,minDepth:Infinity,maxDepth:0,maxLevelJump:0};
  for(let i=1;i<route.controlPoints.length;i++){
   const a=route.controlPoints[i-1],b=route.controlPoints[i],len=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(len/20);
   for(let j=0;j<steps;j++){
    const t=(j+.5)/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    if(!world.isReady([x-70,z-70,x+70,z+70]))await world.prepareAround(x,z);
    row.samples++;report.axisSamples++;
    const local=regionLocal(world.lagoon,x,z);if(world.ownsLagoon(x,z)){row.watershed++;continue;}
    assert.ok(Math.hypot((x-world.town.x)/1.2,z-world.town.z+20)>=155,'river must bypass the protected construction platform');
    const field=world.waterFieldAt(x,z);if(field?.kind==='lake'){row.lake++;continue;}
    const r=world.rivers.at(x,z),depth=r.level-world.surface.heightAt(x,z);
    row.minDepth=Math.min(row.minDepth,depth);row.maxDepth=Math.max(row.maxDepth,depth);report.minDepth=Math.min(report.minDepth,depth);
    const seaHandoff=r.level===world.seaLevel&&depth>0&&world.oceanExclusion.valueAt(x,z)<=.5;
    if(!field&&!seaHandoff||depth<2)report.issues.push({id:route.id,x,z,depth,reason:!field?'missing water field':'shallow axis'});
    for(const [dx,dz] of [[1,0],[0,1]]){
     const next=world.rivers.at(x+dx,z+dz);if(next){const jump=Math.abs(r.level-next.level);row.maxLevelJump=Math.max(row.maxLevelJump,jump);report.maxLevelJump=Math.max(report.maxLevelJump,jump);}
    }
    // Check original-height upper bound on grid vertices (not interpolated
    // collider versus bilinear R16, which are different representations).
    for(const d of [-48,-24,0,24,48]){
     const gx=Math.round((x+(b.z-a.z)/len*d)/6)*6,gz=Math.round((z-(b.x-a.x)/len*d)/6)*6;
     const p=regionLocal(world.lagoon,gx,gz);if(inLagoonRegion(p.x,p.z)||world.lakeAt(gx,gz)||Math.hypot((gx-world.town.x)/1.2,gz-world.town.z+20)<155)continue;
     assert.ok(world.heightAt(gx,gz)<=source.heightAt(gx,gz)+1e-6,'river excavation must not raise terrain');report.excavationSamples++;
    }
   }
  }report.routes.push(row);
 }
 for(const [n,route] of LAGOON_CHANNELS.entries()){
  const row={route:n,samples:0,minDepth:Infinity,maxLevelJump:0};let along=0,previous=null;
  for(let i=1;i<route.length;i++){
   const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length*world.lagoon.scale/6);
   for(let j=1;j<=steps;j++){
    const t=j/steps;if(n>=4&&along+length*t<24)continue;
    const p=regionPoint(world.lagoon,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
    if(!world.isReady([p.x-12,p.z-12,p.x+12,p.z+12]))await world.prepareAround(p.x,p.z);
    const water=world.waterAt(p.x,p.z),ground=world.surface.heightAt(p.x,p.z);row.samples++;
    if(!water)report.issues.push({id:'native-'+n,...p,reason:'dry native axis'});
    else{row.minDepth=Math.min(row.minDepth,water.level-ground);if(previous!==null)assert.ok(water.level<=previous+.01,'native downstream cannot rise');previous=water.level;assert.ok(water.level>=world.seaLevel);}
   }along+=length;
  }report.nativeRoutes.push(row);
 }
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('water-integration',scene),water=new GeographyStream(scene,root),ocean=new OceanWater(scene);
 assert.equal(ocean.far.getTotalIndices(),6,'far ocean excludes inland water per fragment, not giant missing triangles');
 assert.equal(ocean.nearMaterial._textures.uInlandMask,ocean.farMaterial._textures.uInlandMask,'one mask for both ocean LODs');
 assert.equal(ocean.inlandMask.getInternalTexture().type,0,'byte mask must not be uploaded as FLOAT');
 assert.match(Effect.ShadersStore[ocean.nearMaterial.shaderPath.fragment+'FragmentShader'],/texture2D\(uInlandMask/);
 for(const [x,z] of [[-1596,1429],[-1501,1584],[-1004,2165],[-931,2282],[-914,2335],[-2309,1706],[-2351,1817]]){
  await world.prepareAround(x,z);const cx=Math.floor(x/72),cz=Math.floor(z/72),meshes=[];
  for(const lod of ['near','far']){
   const build=water.createWater(cx,cz,lod==='near'?3:12,lod);let next;do{next=build.next()}while(!next.done);
   const mesh=next.value;assert.ok(mesh);mesh.computeWorldMatrix(true);meshes.push(mesh);
   const pos=mesh.getVerticesData('position'),idx=mesh.getIndices();let maxWarp=0;
   for(let i=0;i<pos.length;i+=3){const f=world.waterFieldAt(pos[i],pos[i+2]);assert.ok(f,'all emitted vertices have one water owner');maxWarp=Math.max(maxWarp,Math.abs(pos[i+1]-f.level-.035));}
   assert.ok(maxWarp<.002,'water vertices stay on the canonical waterline');
   // Every XZ sample intersects at most one non-degenerate water triangle.
   let samples=0;for(let sz=cz*72+.37;sz<(cz+1)*72;sz+=2.17)for(let sx=cx*72+.29;sx<(cx+1)*72;sx+=2.13){
    let count=0;for(let i=0;i<idx.length;i+=3){const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
     const den=(pos[b+2]-pos[c+2])*(pos[a]-pos[c])+(pos[c]-pos[b])*(pos[a+2]-pos[c+2]);if(Math.abs(den)<1e-9)continue;
     const u=((pos[b+2]-pos[c+2])*(sx-pos[c])+(pos[c]-pos[b])*(sz-pos[c+2]))/den,v=((pos[c+2]-pos[a+2])*(sx-pos[c])+(pos[a]-pos[c])*(sz-pos[c+2]))/den;
     if(u>1e-6&&v>1e-6&&u+v<1-1e-6)count++;
    }assert.ok(count<=1,'no overlapping river ribbons');samples++;
   }
   report.regressions.push({x,z,lod,triangles:idx.length/3,vertices:pos.length/3,maxWarp,overlapChecks:samples});
  }
  assert.deepEqual(Array.from(meshes[0].getVerticesData('position')),Array.from(meshes[1].getVerticesData('position')),'river LOD keeps the same bed/shore contour');for(const m of meshes)m.dispose();
 }
 report.resident=world.stats;await fs.mkdir('artifacts/geographic-source/water-union',{recursive:true});await fs.writeFile('artifacts/geographic-source/water-union/network.json',JSON.stringify(report,null,2));
 ocean.dispose();water.dispose();scene.dispose();engine.dispose();world.dispose();setActiveGeography(null);
 console.log(JSON.stringify({...report,regressions:report.regressions.length,routes:report.routes.length,issues:report.issues.slice(0,12)}));
 assert.equal(report.issues.length,0,`network issues: ${report.issues.length}; inspect network.json`);
})().catch(e=>{console.error(e);process.exitCode=1});

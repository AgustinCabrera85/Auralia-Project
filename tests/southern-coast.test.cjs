const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {southernCoastProfile}=require('../.test-build/world/geography/SouthernCoast.js');
(async()=>{
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(async n=>JSON.parse(await fs.readFile(`public/auralia-preview/data/${n}.json`))));
 const source=new WorldStudioSource(manifest,splines,hydrology,async url=>{const b=await fs.readFile('public'+url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
 const world=await PlayableWorld.create(source,splines,hydrology);await world.prepare([850,3600,2850,4800]);
 const sea=world.seaLevel,step=8,minX=1100,minZ=3840,width=181,height=99;
 const wet=new Uint8Array(width*height),seen=new Uint8Array(wet.length),queue=[];
 let filled=0;
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
   const x=minX+col*step,z=minZ+row*step,h=world.surface.heightAt(x,z),index=row*width+col;
   wet[index]=h<sea?1:0;
   if(source.heightAt(x,z)<sea&&h>sea+.2)filled++;
   if(wet[index]&&(row===0||col===0||row===height-1||col===width-1)){seen[index]=1;queue.push(index);}
 }
 for(let q=0;q<queue.length;q++){
   const index=queue[q],row=Math.floor(index/width),col=index%width;
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
     const nx=col+dx,nz=row+dz,i=nz*width+nx;
     if(nx>=0&&nz>=0&&nx<width&&nz<height&&wet[i]&&!seen[i]){seen[i]=1;queue.push(i);}
   }
 }
 assert.equal(wet.reduce((n,v,i)=>n+(v&&!seen[i]?1:0),0),0,'no isolated coastal water pockets remain');
 assert.ok(filled>1800,'both unintentional lagoons are replaced by dry beach');
 for(const [x,z] of [[1464,4047],[2200,4261],[1704,4134],[2074,4161]]){
   const h=world.surface.heightAt(x,z);assert.ok(h>sea+.5,'reported lagoon/edge is now dry');
   assert.equal(world.oceanLevelAt(x,z),null);assert.equal(world.waterAt(x,z),null);
   if(z>4200||x<1800)assert.ok(world.weightsAt(x,z,h,0)[3]>.85,'continuous sandy beach');
 }
 for(const x of [1300,1500,1700,2100,2300]){
   const shore=4100+southernCoastProfile(x,4100).inland;let previous=-Infinity;
   for(let inland=-80;inland<=200;inland+=8){
     const h=world.surface.heightAt(x,shore-inland);
     assert.ok(h>previous,'beach rises continuously inland, with no retaining sill');previous=h;
   }
 }
 console.log(JSON.stringify({filledSquareMetres:filled*step*step,isolatedWaterPockets:0,wetSamples:queue.length}));world.dispose();
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict');
const {regionalVegetationSampler,VEGETATION_REGIONS}=require('../.test-build/world/geography/RegionalVegetation.js');
const {VegetationCorridors}=require('../.test-build/world/geography/VegetationCorridors.js');
const {vegetationTouchesWater}=require('../.test-build/world/geography/VegetationWater.js');
const {vegetationForChunk,VEGETATION_CONFIG}=require('../.test-build/world/vegetationData.js');
const {setActiveGeography}=require('../.test-build/world/geography/ActiveGeography.js');

const regional=regionalVegetationSampler();
const profiles=Object.fromEntries(VEGETATION_REGIONS.map(r=>[r.id,regional(r.x,r.z)]));
assert.ok(profiles.ECO.trees>profiles.LLA.trees*5&&profiles.SEL.trees>profiles.VAL.trees*3);
assert.ok(profiles.CRI.grass<profiles.LLA.grass*.2);
for(let x=-6000;x<6000;x+=79)for(let z=-5500;z<4000;z+=157){
 const a=regional(x,z),b=regional(x+.01,z+.01);
 assert.ok(Math.abs(a.trees-b.trees)<.0002&&Math.abs(a.grass-b.grass)<.0002,'no density seams at regional borders');
}
const routes=new VegetationCorridors();
routes.add([{width:8,points:[{x:-20,z:-100},{x:140,z:100}]}]);
assert.equal(routes.clearanceAt(60,0),-4,'diagonal bridge deck, including its width');
assert.ok(routes.clearanceAt(1000,1000)>=60);
assert.ok(routes.clearanceAt(-20,-100)<0,'approaches include endpoint caps');
assert.equal(vegetationTouchesWater({waterAt:(x,z)=>Math.abs(x-4)<1?{}:null},0,0,6),true,'river inside crown, away from trunk');

const world={source:{id:'worldstudio-playable-v1',seaLevel:0,heightAt:()=>20,isReady:()=>true},
 town:{x:10000,z:10000},biomeWeights:()=>({valle:.5,ecos:.5,sierras:0,nacar:0,costa:0,cumbres:0}),
 masks:()=>({road:0,lake:0,river:0,existingRoadClearance:1000}),waterAt:()=>null,
 vegetationAt:()=>profiles.ECO};
setActiveGeography(world);
try{
 const collect=()=>{const rows=[];for(let z=-4;z<=4;z++)for(let x=-4;x<=4;x++)rows.push(...vegetationForChunk(x,z).filter(p=>p.obstacleRadius));return rows;};
 const forest=collect();world.vegetationAt=()=>profiles.LLA;const plains=collect();
 assert.ok(forest.length>plains.length*4&&plains.length>0,'actual tree placements follow the regional profile');
 const crossed=forest[0];routes.add([{width:6,points:[{x:crossed.x-90,z:crossed.z-90},{x:crossed.x+90,z:crossed.z+90}]}]);
 world.vegetationAt=()=>profiles.ECO;world.vegetationClearanceAt=(x,z)=>routes.clearanceAt(x,z);
 const clear=collect();assert.ok(clear.length<forest.length&&clear.length>forest.length*.5);
 for(const p of clear)assert.ok(routes.clearanceAt(p.x,p.z)>=VEGETATION_CONFIG.crownRadius[p.kind]*p.scale+1,'crowns clear road and bridge width');
 assert.deepEqual(clear,collect(),'independent of streaming order');
 console.log(`Regional vegetation: ${forest.length} forest trees / ${plains.length} plains trees; routes and river footprints clear.`);
}finally{setActiveGeography(null);}

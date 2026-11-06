const assert=require('node:assert/strict');
const model=require('../.test-build/ClimateModel.js');
const {sampleClimate,getSeason,SEASONS,WEATHERS,getWeatherForTime}=model;

assert.equal(sampleClimate(9).hour,9,'new game starts at 9 AM');
assert.equal(sampleClimate(12).dayLight,1);
assert.equal(sampleClimate(0).dayLight,0);
for(let n=0;n<SEASONS.length;n++){
  assert.equal(getSeason(n*12),SEASONS[n]);
  assert.equal(getSeason(n*12+11),SEASONS[n]);
}
assert.equal(getSeason(48),'spring','season cycle repeats');
for(let hour=0;hour<1152;hour+=2){
  const a=sampleClimate(hour);
  const b=sampleClimate(hour);
  assert.deepEqual(a,b,'weather and palette must be deterministic');
  assert.ok(WEATHERS.includes(a.weather));
  assert.ok(a.weatherMix.cloud>=0 && a.weatherMix.cloud<=1);
  assert.ok(a.weatherMix.rain>=0 && a.weatherMix.rain<=1);
  assert.ok(a.weatherMix.snow>=0 && a.weatherMix.snow<=1);
  assert.ok(Math.abs(Math.hypot(...a.sunDirection)-1)<1e-8);
}
for(const weather of WEATHERS){
  assert.equal(sampleClimate(26,weather).weather,weather,'debug weather override');
}
assert.equal(sampleClimate(24*40,'snow').weatherMix.rain,0);
assert.ok(sampleClimate(24*40,'snow').weatherMix.snow>0);
assert.equal(getWeatherForTime(101),getWeatherForTime(101));
// Seasonal color transitions should not jump visibly at the boundary.
for(const boundary of [12,24,36,48]){
  const a=sampleClimate(boundary*24-.001,'clear');
  const b=sampleClimate(boundary*24+.001,'clear');
  assert.ok(Math.hypot(...a.skyTop.map((c,i)=>c-b.skyTop[i]))<.003,'sky color continuity');
  assert.ok(Math.abs(a.sunHeight-b.sunHeight)<.003,'seasonal sun continuity');
}
console.log('Climate model tests: OK');

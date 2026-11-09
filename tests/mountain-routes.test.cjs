const assert=require('node:assert/strict');
const {REGIONS,regionAt}=require('../.test-build/world/RegionCatalog.js');
const {ASSET_CATALOG}=require('../.test-build/world/assetCatalog.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');
const routes=require('../.test-build/world/mountainRoutes.js');
assert.equal(REGIONS.length,12);assert.equal(new Set(REGIONS.map(r=>r.id)).size,12);
for(const r of REGIONS){
  assert.equal(regionAt(...r.center).id,r.id,'region label stays inside its territory');
  assert.ok(r.polygon.length>=4);assert.ok(r.landforms.length>=3);
  for(const id of r.availableAssets)assert.ok(ASSET_CATALOG[id],`${r.id}: missing asset ${id}`);
  assert.ok(r.neededAssets.length>0,'regional production gaps stay explicit');
}
assert.equal(regionAt(1,10).id,'VAL');
const visited=new Set(['sur']);
for(let pass=0;pass<10;pass++)for(const [a,b] of routes.TUNNEL_LINKS){
  if(visited.has(a))visited.add(b);if(visited.has(b))visited.add(a);
}
assert.equal(visited.size,Object.keys(routes.TUNNEL_NODES).length,'all gallery branches and exits are reachable');
let tunnelLength=0;
for(const [a,b] of routes.TUNNEL_LINKS){
  const start=routes.TUNNEL_NODES[a],end=routes.TUNNEL_NODES[b];
  const length=Math.hypot(end.x-start.x,end.z-start.z);tunnelLength+=length;
  let previous=null;
  for(let d=0;d<=length;d+=.4){
    const t=d/length,x=start.x+(end.x-start.x)*t,z=start.z+(end.z-start.z)*t;
    const surface=routes.tunnelSurfaceAt(x,z,.6);assert.ok(surface,`gap ${a} → ${b}`);
    assert.ok(surface.ceiling-surface.height>7,'room for character and camera');
    if(previous!==null)assert.ok(Math.abs(surface.height-previous)<.12,'no step at a chamber threshold');
    previous=surface.height;
  }
}
const height=(x,z)=>nearTerrainHeightAt(x,z,sampleMainlandHeight);
const bridges=routes.createBridgeRoutes(height);
const {createMountainTrails,mountainTrailSurfaceAt}=require('../.test-build/world/mountainTrails.js');
const {waterSurfaceAt}=require('../.test-build/world/geographicFeatures.js');
const trails=createMountainTrails(height,bridges),connections=new Set(['cueva-antigua','altaluz']);
const links=trails.map(t=>[t.from,t.to]);
for(const b of bridges.slice(0,2))links.push([b.id+':west',b.id+':east']);
for(let pass=0;pass<links.length;pass++)for(const [a,b] of links){
  if(connections.has(a))connections.add(b);if(connections.has(b))connections.add(a);
}
for(const bridge of bridges.slice(0,2))for(const [side,p]of [['west',bridge.points[0]],['east',bridge.points.at(-1)]]){
  assert.ok(connections.has(bridge.id+':'+side),'each bridge exit reaches the regional road network');
  const surface=mountainTrailSurfaceAt(trails,p.x,p.z);
  assert.ok(surface&&Math.abs(surface.height-p.y)<.1,`${bridge.id} ${side}: no step at the trail connection`);
}
for(const trail of trails)for(let i=1;i<trail.points.length;i++){
  const a=trail.points[i-1],b=trail.points[i],len=Math.hypot(b.x-a.x,b.z-a.z);
  assert.ok(Math.abs(b.y-a.y)/len<Math.tan(42*Math.PI/180),`${trail.id}: walkable without sprint or climbing`);
  for(let t=0;t<=1;t+=.25){
    const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
    const hit=mountainTrailSurfaceAt(trails,x,z),water=waterSurfaceAt(x,z);
    assert.ok(hit&&Math.abs(hit.height-y)<.15,`${trail.id}: continuous foot support`);
    assert.ok(y>=height(x,z)-.15,`${trail.id}: path cannot bury the player's feet`);
    const crossing=trail.crossings.some(c=>i>=c.start&&i<=c.end+1);
    assert.ok(!water||height(x,z)>water.level+.3||(crossing&&y>water.level+3),
      `${trail.id}: water crossings need a raised span with an open channel`);
    assert.ok(routes.mountainRouteExcludes(x,z),`${trail.id}: vegetation and rocks leave the path clear`);
  }
}
for(const bridge of bridges){
  const first=bridge.points[0],last=bridge.points.at(-1);
  const routeLength=Math.hypot(last.x-first.x,last.z-first.z);
  const dx=(last.x-first.x)/routeLength,dz=(last.z-first.z)/routeLength;
  assert.ok(bridge.spanEnd-bridge.spanStart>=(bridge.id==='pasarela-desague'?70:180));
  for(const end of [bridge.points[0],bridge.points.at(-1)])
    assert.ok(Math.abs(end.y-height(end.x,end.z))<.35,`${bridge.id}: ramp meets the terrain`);
  for(let i=1;i<bridge.points.length;i++){
    const a=bridge.points[i-1],b=bridge.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    assert.ok(Math.abs(b.y-a.y)/length<=.481,'walkable ramp grade');
    for(let t=0;t<=1;t+=.125){
      const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      const hit=routes.bridgeSurfaceAt(bridges,x,z);assert.ok(hit);
      assert.ok(Math.abs(hit.height-(a.y+(b.y-a.y)*t))<1e-6,'collision follows the visible strip');
      assert.ok(hit.height>=height(x,z)-.25,'bridge cannot intersect the terrain');
      const along=(x-first.x)*dx+(z-first.z)*dz;
      if(along>20&&along<routeLength-20)for(const side of [-.49,.49])
        assert.ok(hit.height>=height(x-dz*bridge.width*side,z+dx*bridge.width*side)-.25,
          `${bridge.id}: whole bridge clears the hillside`);
    }
  }
  assert.equal(routes.bridgeRailBlocks(bridge,first.x-dx,first.z-dz),false,'open approach');
  assert.equal(routes.bridgeRailBlocks(bridge,last.x+dx,last.z+dz),false,'open exit');
  assert.equal(routes.bridgeRailBlocks(bridge,(first.x+last.x)/2-dz*bridge.width,
    (first.z+last.z)/2+dx*bridge.width),true,'lateral rail');
}
console.log('✓ Twelve region briefs, valid assets, connected galleries, continuous floors, bounded ramps and terrain support');
console.log(JSON.stringify({tunnelLength,bridges:bridges.map(b=>({id:b.id,length:b.points.reduce((n,p,i)=>i?n+Math.hypot(p.x-b.points[i-1].x,p.z-b.points[i-1].z):0,0)}))}));

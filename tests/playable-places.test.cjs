const fs=require('node:fs');
const assert=require('node:assert/strict');
const {NullEngine,Scene,TransformNode}=require('@babylonjs/core');
const {WorldStudioSource}=require('../.test-build/world/geography/WorldStudioSource.js');
const {PlayableWorld}=require('../.test-build/world/geography/PlayableWorld.js');
const {findPlaceArrival}=require('../.test-build/world/geography/PlayablePlaces.js');
const {createPlacedPointOfInterestView}=require('../.test-build/world/PointOfInterestView.js');
const {POINTS_OF_INTEREST}=require('../.test-build/world/pointsOfInterest.js');
const {BRIDGE_DEFINITIONS,createBridgeRoutes,bridgeSurfaceAt,MOUNTAIN_PORTALS}=require('../.test-build/world/mountainRoutes.js');
const {inBrisaliaFootprint}=require('../.test-build/world/brisaliaLayout.js');
const {FOLIAGE_FOREST}=require('../.test-build/world/foliageForestConfig.js');
const read=n=>JSON.parse(fs.readFileSync('public/auralia-preview/data/'+n+'.json','utf8'));

(async()=>{
  const splines=read('splines'),hydrology=read('hidrologia_v3_6');
  const source=new WorldStudioSource(read('manifest'),splines,hydrology,async url=>{
    const b=await fs.promises.readFile('public/'+url.replace(/^\//,''));
    return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  });
  const world=await PlayableWorld.create(source,splines,hydrology,read('reinos_v3_7'));
  const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('continent',scene);
  await world.prepareAround(world.town.x,world.town.z);
  const bridges=createBridgeRoutes((x,z)=>world.surface.heightAt(x+world.town.x,z+world.town.z));
  for(const b of bridges)for(const p of b.points){p.x+=world.town.x;p.z+=world.town.z;}
  const support={town:world.town,
    sample:(x,z)=>{
      const b=bridgeSurfaceAt(bridges,x,z);
      return b?{height:b.height,slopeX:Math.sqrt(1/(b.normalY*b.normalY)-1),slopeZ:0}:world.surface.surfaceAt(x,z);
    },waterLevel:(x,z)=>world.waterAt(x,z)?.level??world.oceanLevelAt(x,z)};
  const arrivals=new Map();
  assert.equal(new Set(world.destinations.map(p=>p.id)).size,world.destinations.length);
  for(const place of [...world.destinations,world.destination('caverna-del-crisol')]){
    if(place.floating)continue; // Their loader finds a real triangle on the GLB.
    const p=place.arrival??place,r=(place.arrivalRadius??64)+6;
    await world.prepare([p.x-r,p.z-r,p.x+r,p.z+r]);
    const arrival=findPlaceArrival(place,support);
    assert.ok(arrival,place.id+' has a valid arrival on the current R16 terrain');
    arrivals.set(place.id,arrival);
    if(place.submerged){assert.ok(world.waterAt(arrival.x,arrival.z),'underwater entrance remains intentional');continue;}
    assert.ok(!inBrisaliaFootprint(arrival.x-world.town.x,arrival.z-world.town.z,1.5),place.id+' outside buildings');
    const surface=support.sample(arrival.x,arrival.z),water=support.waterLevel(arrival.x,arrival.z);
    assert.ok(water===null||surface.height>=water+.12,place.id+' arrives above water');
    assert.ok(Math.hypot(surface.slopeX,surface.slopeZ)<=.65,place.id+' arrives on a walkable slope');
  }
  const ruin=world.destination('ruina-caminos');
  assert.ok(inBrisaliaFootprint(-120,-210,2),'reproduces the old arrival inside a house');
  assert.ok(!inBrisaliaFootprint(ruin.x-world.town.x,ruin.z-world.town.z,12),'entire ruin clears the houses');
  await world.prepareAround(ruin.x,ruin.z);
  const ruinView=createPlacedPointOfInterestView(scene,root,POINTS_OF_INTEREST.find(p=>p.id===ruin.id),ruin,
    (x,z)=>world.surface.heightAt(x,z));
  assert.equal(ruinView.position.x,ruin.x);assert.equal(ruinView.position.z,ruin.z);
  assert.equal(ruinView.position.y,world.surface.heightAt(ruin.x,ruin.z));
  assert.ok(ruinView.getChildMeshes().length>0,'relocated ruin has actual geometry');
  assert.ok(Math.hypot(arrivals.get(ruin.id).x-ruin.x,arrivals.get(ruin.id).z-ruin.z)>8,'arrival clears columns and fallen lintel');

  for(const definition of BRIDGE_DEFINITIONS){
    const place=world.destination(definition.id==='pasarela-desague'?'puente-arroyo':definition.id);
    assert.equal(place.x,world.town.x+(definition.a.x+definition.b.x)/2);
    assert.equal(place.z,world.town.z+(definition.a.z+definition.b.z)/2);
    const arrival=arrivals.get(place.id);
    assert.ok(bridgeSurfaceAt(bridges,arrival.x,arrival.z),'bridge arrival stays on the deck');
    const owner=new TransformNode('bridge-owner',scene);owner.parent=root;
    const anchor=createPlacedPointOfInterestView(scene,root,POINTS_OF_INTEREST.find(p=>p.id===place.id),place,
      (x,z)=>support.sample(x,z).height,owner);
    anchor.computeWorldMatrix(true);
    assert.equal(anchor.getAbsolutePosition().x,place.x);
    assert.equal(anchor.getAbsolutePosition().z,place.z);
    assert.equal(owner.position.length(),0,'existing world-space bridge geometry is not translated twice');
  }
  for(const portal of MOUNTAIN_PORTALS)assert.ok(!world.destination(portal.id),'Removed prototype has no map destination');
  assert.equal(world.destination(FOLIAGE_FOREST.id).x,FOLIAGE_FOREST.x,'authored foliage keeps absolute coordinates');
  assert.ok(!world.destination('galeria'),'Removed gallery alias has no invisible destination');
  assert.equal(world.destination('puerto').id,'embarcadero-brisalia');
  assert.equal(world.destination('caverna-del-crisol').hidden,true,'secret cave retains its discovery UI');
  assert.ok(!world.destinations.some(p=>p.id==='caverna-del-crisol'));
  assert.equal(world.locationNameAt(ruin.x,ruin.z),ruin.name);
  assert.equal(world.locationNameAt(-1566,1711),'Brisalia','the photographed houses are no longer labeled as the ruin');
  assert.notEqual(world.locationNameAt(-2308,100),'Puente de la Cordillera','distant lakes do not inherit nearest POI names');
  assert.equal(world.regions.length,12);
  for(const r of world.regions)assert.ok(world.mapMarkup().includes(r.name),r.name+' appears at its current regional anchor');
  assert.ok(world.mapMarkup().includes('data-place="ruina-caminos"'));
  const blocked={...support,clear:()=>false};
  assert.equal(findPlaceArrival({...ruin,arrivalRadius:0},blocked),null,'occupied arrival never silently accepted');
  const start=arrivals.get(ruin.id),withObstacle={...support,clear:(x,y,z)=>Math.hypot(x-start.x,z-start.z)>3};
  const alternate=findPlaceArrival(ruin,withObstacle);
  assert.ok(alternate&&Math.hypot(alternate.x-start.x,alternate.z-start.z)>3,'a new obstacle gets a nearby safe arrival');
  scene.dispose();engine.dispose();world.dispose();
  console.log(`PASS: ${arrivals.size} terrain/bridge arrivals, 12 regions, POI geometry, old links and occupied arrivals`);
})().catch(error=>{console.error(error);process.exitCode=1;});

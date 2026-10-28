const assert=require('node:assert/strict');
const {
  MAINLAND,LANDMARKS,ROAD_RESERVATIONS,LAKE_RESERVATIONS,chunkOf,desiredChunks,chunkKey,hash01,isLand,
  sampleMainlandHeight,biomeAt,islandOutline,geographyMasks,radialPosition
}=require('../.test-build/world/terrainData.js');
const {cameraRelativeMovement}=require('../.test-build/game/movement.js');
const {mapPercent,MAP_VIEW}=require('../.test-build/world/mapProjection.js');
const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`Esperado ${a} ≈ ${b}`);

// Regresión explícita del fallo reportado: con la cámara mirando a +Z, D mueve +X y A mueve -X.
let d=cameraRelativeMovement({x:0,z:1},1,0);
near(d.x,1);near(d.z,0);
d=cameraRelativeMovement({x:0,z:1},-1,0);
near(d.x,-1);near(d.z,0);
d=cameraRelativeMovement({x:0,z:1},0,1);
near(d.x,0);near(d.z,1);
// Aunque se gire 90º la cámara, la derecha debe conservar orientación de pantalla.
d=cameraRelativeMovement({x:1,z:0},1,0);
near(d.x,0);near(d.z,-1);
d=cameraRelativeMovement({x:0,z:1},1,1);
near(Math.hypot(d.x,d.z),1);
near(cameraRelativeMovement({x:0,z:0},1,0).x,0);

assert.equal(MAINLAND.radiusX*2,4000,'envolvente este-oeste de 4 km');
assert.equal(MAINLAND.radiusZ*2,3000,'envolvente norte-sur de 3 km');
assert.ok(MAP_VIEW.minX<-MAINLAND.radiusX&&MAP_VIEW.maxX>MAINLAND.radiusX);
assert.ok(MAP_VIEW.minZ<MAINLAND.centerZ-MAINLAND.radiusZ&&MAP_VIEW.maxZ>MAINLAND.centerZ+MAINLAND.radiusZ);
assert.ok(isLand(0,10),'Brisalia tierra firme');
assert.equal(isLand(0,340),false,'océano al sur');
assert.equal(isLand(335,-255),false,'lago de Nácar');
for(const [x,z] of [[560,-550],[570,-520],[590,-380]])assert.ok(isLand(x,z),'costa antigua transitable para posiciones guardadas');
assert.equal(isLand(-210,420),false,'la Isla de las Luciérnagas queda separada por mar');
assert.equal(isLand(800,-610),false,'cuenca lacustre de los humedales');
assert.ok(isLand(500,-700),'orilla accesible de los humedales');
assert.equal(LAKE_RESERVATIONS.length,2);
assert.equal(ROAD_RESERVATIONS.filter(r=>r.existing).length,11,'caminos originales y accesos nuevos conservados');
assert.ok(geographyMasks(800,-610).lake>.99);
assert.ok(geographyMasks(500,-900).river>.99);
assert.ok(geographyMasks(-950,-850).road>.99);
// Las piezas guardadas usan X/Z, de modo que el suelo de la parcela no debe moverse.
for(const [x,z,height] of [[0,-23,8.405067],[-29,18,7.600909],[33,120,1.410737],[-350,-285,17.351976],[-275,-535,42.667853],[245,-250,5.032358],[200,-660,50.081115]]){
  near(sampleMainlandHeight(x,z),height,.002);
}
for(const land of LANDMARKS){
  assert.ok(isLand(land.x,land.z),`hito en tierra firme: ${land.name}`);
  const p=mapPercent(land.x,land.z);
  assert.ok(p.left>0&&p.left<100&&p.top>0&&p.top<100,`hito dentro del mapa: ${land.name}`);
}
// Muestreo mundial continuo a ambos lados de bordes en regiones antiguas y nuevas.
for(const [cx,cz] of [[3,-4],[-18,-18],[14,-11],[4,-25],[0,3]]){
 const x=cx*MAINLAND.chunkSize,z=cz*MAINLAND.chunkSize;
 for(let k=0;k<=MAINLAND.terrainSubdivisions;k++){
  const p=z+k*MAINLAND.chunkSize/MAINLAND.terrainSubdivisions;
  assert.ok(Number.isFinite(sampleMainlandHeight(x,p)));
  assert.ok(Math.abs(sampleMainlandHeight(x-.001,p)-sampleMainlandHeight(x+.001,p))<.03,`continuidad en ${x},${p}`);
  assert.ok(Math.abs(sampleMainlandHeight(x,p-.001)-sampleMainlandHeight(x,p+.001))<.03,`continuidad en ${x},${p}`);
 }
}
assert.deepEqual(chunkOf(-.01,-72.01),{cx:-1,cz:-2},'floor de coordenadas negativas');
assert.ok(desiredChunks(1,10).length>=50&&desiredChunks(1,10).length<=81);
assert.equal(chunkKey(3,-2),'3:-2');
assert.equal(hash01(6,-9,42),hash01(6,-9,42));
assert.notEqual(hash01(6,-9,42),hash01(6,-9,43));
assert.equal(biomeAt(-350,-285),'ecos');
assert.equal(biomeAt(245,-250),'nacar');
assert.equal(biomeAt(-275,-535),'sierras');
assert.equal(biomeAt(200,-660),'cumbres');
for(const [x,z,biome] of [[0,-23,'valle'],[-1500,-1200,'ecos'],[-400,-700,'sierras'],[500,-700,'nacar'],[-50,250,'costa'],[300,-1700,'cumbres']]){
 assert.ok(isLand(x,z),`${biome} debe tener tierra transitable`);
 assert.equal(biomeAt(x,z),biome);
}
assert.ok(radialPosition(-210,420).radial>radialPosition(-210,420).coast);
assert.ok(desiredChunks(1,10).length<100,'solo un anillo acotado de chunks');
const samples=[[-1300,-1100],[800,-600],[300,-1800],[-50,250]];
const first=samples.map(p=>sampleMainlandHeight(...p));
assert.deepEqual(samples.slice().reverse().map(p=>sampleMainlandHeight(...p)).reverse(),first,'independiente del orden de generación');
assert.equal(islandOutline().length,120);
console.log('✓ Geografía: movimiento A/D, alturas, chunks, biomas y mapas coherentes');

const assert = require('node:assert/strict');
const { MAP_LOCATIONS, LAND_ROUTES, SEA_ROUTES } = require('../.test-build/data/world.js');
const ids = new Set(MAP_LOCATIONS.map(p => p.id));
assert.equal(ids.size, MAP_LOCATIONS.length, 'IDs de mapa únicos');
assert.equal(MAP_LOCATIONS.filter(p=>p.status==='playable').length, 2, 'dos zonas jugables');
assert.equal(MAP_LOCATIONS.filter(p=>p.category==='region').length, 5, 'cinco regiones principales');
for(const p of MAP_LOCATIONS){
 assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100,`coordenadas válidas: ${p.name}`);
 if(p.status==='playable')assert.ok(p.zoneId, `zona jugable definida: ${p.name}`);
}
for(const [from,to] of [...LAND_ROUTES,...SEA_ROUTES])assert.ok(ids.has(from)&&ids.has(to),`ruta conocida: ${from}->${to}`);
console.log('✓ Atlas: 10 ubicaciones, 5 regiones y rutas válidas');

import { BRISALIA_PALACE_SITE, PALACE_ARRIVAL } from '../palace/PalaceSite';
import { BRISALIA_SCALE, inBrisaliaFootprint } from '../brisaliaLayout';
import { POINTS_OF_INTEREST } from '../pointsOfInterest';
import { BRIDGE_DEFINITIONS, MOUNTAIN_PORTALS } from '../mountainRoutes';
import { GROTTO_PORTALS } from '../lagoonData';
import { VOLCANIC_CAVE } from '../volcanicCaveData';
import { FOLIAGE_FOREST } from '../foliageForestConfig';
import { OCASO_DESERT, ocasoDesertAt } from './OcasoDesert';
import { NACAR_PALACE, NACAR_PALACE_ARRIVAL, inNacarPalaceFootprint } from './NacarPalace';

type XZ={x:number;z:number};
export type PlayablePlace=XZ&{
  id:string;name:string;discoverRadius:number;floating?:string;hidden?:boolean;
  /** The landmark stays on the map; arrival can be outside its solid geometry. */
  arrival?:XZ;arrivalRadius?:number;submerged?:boolean;visualId?:string;aliases?:readonly string[];
};
export type PlayableRegion=XZ&{id:string;name:string};
export type RegionalAtlas={kingdoms?:readonly {id:string;region:string;centroRegionalXZ_m:readonly [number,number]}[]};
export function regionsFromAtlas(atlas:RegionalAtlas):PlayableRegion[]{
  return (atlas.kingdoms??[]).filter(r=>r.centroRegionalXZ_m?.length===2&&
    r.centroRegionalXZ_m.every(Number.isFinite)).map(r=>({id:r.id,name:r.region,
      x:r.id===OCASO_DESERT.id?OCASO_DESERT.x:r.centroRegionalXZ_m[0],
      z:r.id===OCASO_DESERT.id?OCASO_DESERT.z:r.centroRegionalXZ_m[1]}));
}

/** Each owner uses its actual coordinate frame. Stable IDs also retain old links. */
export function createPlayablePlaces(town:XZ,lagoon:XZ&{scale:number},dock:XZ):readonly PlayablePlace[]{
  const townPoint=(x:number,z:number)=>({x:x+town.x,z:z+town.z});
  const lagoonPoint=(x:number,z:number)=>({x:lagoon.x+x*lagoon.scale,z:lagoon.z+z*lagoon.scale});
  const places:PlayablePlace[]=[
    {id:'brisalia',name:'Brisalia',...townPoint(1,10),discoverRadius:80},
    {id:'palacio-brisalia',name:'Palacio de los Cerezos',...BRISALIA_PALACE_SITE,arrival:PALACE_ARRIVAL,discoverRadius:150},
    {id:'hogar',name:'Claro del Hogar',...townPoint(-29,18),arrival:townPoint(-29,39),discoverRadius:24},
    {id:'embarcadero-brisalia',name:'Muelle de Brisalia',...dock,discoverRadius:40,aliases:['puerto']},
    {id:'ladera-del-crisol',name:'Volcán Ígneo · ladera del Crisol',x:VOLCANIC_CAVE.entrance.x,z:VOLCANIC_CAVE.entrance.z+35,discoverRadius:180},
    {id:VOLCANIC_CAVE.id,name:VOLCANIC_CAVE.name,...VOLCANIC_CAVE.entrance,hidden:true,
      arrival:{x:VOLCANIC_CAVE.entrance.x,z:VOLCANIC_CAVE.entrance.z+8},discoverRadius:25},
    {id:'laguna-tres-vertientes',name:'Laguna de las Tres Vertientes',...lagoonPoint(-160,-650),discoverRadius:280},
    {id:'nacimiento',name:'Nacimiento de Ferragrís',...lagoonPoint(-714,-1510),
      arrival:lagoonPoint(-695.8,-1506.4),discoverRadius:80},
    {id:'nacar',name:'Orilla del Lago de Nácar',x:-211,z:40,arrival:{x:-211,z:48},discoverRadius:180},
    {id:'isla-nacar',name:'Isla del Lago de Nácar',x:1373,z:-438,arrival:NACAR_PALACE_ARRIVAL,discoverRadius:180},
    {id:'palacio-nacar',name:'Palacio de Nácar',...NACAR_PALACE,arrival:NACAR_PALACE_ARRIVAL,discoverRadius:140},
    {id:'rio-nacar',name:'Río de las Cumbres · desembocadura',x:1710,z:-1340,
      arrival:{x:1764,z:-1464},discoverRadius:260},
    {id:'lindebrumas',name:'Arco del Bosque de los Ecos',...townPoint(-350,-285),arrival:townPoint(-350,-276),discoverRadius:32},
    {id:'altapiedra',name:'Paso de Altapiedra',...townPoint(-275,-535),arrival:townPoint(-275,-525),discoverRadius:40},
    {id:'altaluz',name:'Mirador de Altaluz',...townPoint(200,-660),arrival:townPoint(200,-650),discoverRadius:45},
    {id:'albor',name:'Albor · reino occidental',x:-4750,z:-3500,floating:'albor',discoverRadius:0},
    {id:'umbrael',name:'Umbrael · reino oriental',x:5200,z:-3700,floating:'umbrael',discoverRadius:0}
  ];
  for(const portal of GROTTO_PORTALS){
    const original=POINTS_OF_INTEREST.find(p=>p.id===portal.id);
    places.push({id:portal.submerged?'gruta':portal.id,name:original?.name??'Acceso sumergido a la gruta',
      ...lagoonPoint(portal.x,portal.z),arrival:lagoonPoint(portal.x,portal.z+(portal.submerged?0:5)),
      submerged:portal.submerged,discoverRadius:30});
  }
  for(const p of POINTS_OF_INTEREST){
    if(p.kind==='dock'||p.kind==='waterfall'||p.id.startsWith('gruta-'))continue;
    const bridge=BRIDGE_DEFINITIONS.find(b=>b.id===(p.id==='puente-arroyo'?'pasarela-desague':p.id));
    const portal=MOUNTAIN_PORTALS.find(v=>v.id===p.id);
    if(portal)continue; // Removed prototype entrances are not map destinations.
    // Authored V4 foliage is stored in world coordinates, without the town offset.
    const position=p.id===FOLIAGE_FOREST.id||p.id===FOLIAGE_FOREST.flowerMeadow.id?{x:p.x,z:p.z}:
      p.id==='ruina-caminos'?townPoint(-350,-383):bridge?
      townPoint((bridge.a.x+bridge.b.x)/2,(bridge.a.z+bridge.b.z)/2):
      townPoint(p.x,p.z);
    places.push({id:p.id,name:bridge?.name??p.name,...position,visualId:bridge?.id,
      discoverRadius:bridge?Math.hypot(bridge.a.x-bridge.b.x,bridge.a.z-bridge.b.z)/2+20:p.discoverRadius,
      arrival:bridge?position:{x:position.x,z:position.z+10},
      aliases:p.id==='cueva-antigua'?['galeria']:undefined});
  }
  return places;
}

export function placeNameAt(places:readonly PlayablePlace[],regions:readonly PlayableRegion[],town:XZ,x:number,z:number):string{
  let nearby:PlayablePlace|undefined,best=Infinity;
  for(const p of places){
    if(p.floating||p.discoverRadius<=0)continue;
    const score=Math.hypot(x-p.x,z-p.z)/p.discoverRadius;
    if(score<=1&&score<best){nearby=p;best=score;}
  }
  if(nearby)return nearby.name;
  const tx=(x-town.x)/BRISALIA_SCALE,tz=(z-town.z)/BRISALIA_SCALE;
  if(tx>=-128&&tx<=176&&tz>=-144&&tz<=38)return 'Brisalia';
  if(ocasoDesertAt(x,z)>.5)return OCASO_DESERT.name;
  let region:PlayableRegion|undefined,distance=Infinity;
  for(const r of regions){const d=Math.hypot(x-r.x,z-r.z);if(d<distance){region=r;distance=d;}}
  return region?.name??'Continente de Auralia';
}

export type ArrivalSurface={
  town:XZ;
  sample(x:number,z:number):{height:number;slopeX:number;slopeZ:number};
  waterLevel(x:number,z:number):number|null;
  clear?(x:number,y:number,z:number):boolean;
};
/** Runs on explicit travel only, after height sectors are ready. Never guesses a
 * height from missing tiles or silently accepts an occupied destination. */
export function findPlaceArrival(place:PlayablePlace,world:ArrivalSurface):XZ|null{
  const start=place.arrival??place;
  if(place.submerged)return {...start};
  const safe=(x:number,z:number)=>{
    if(inBrisaliaFootprint(x-world.town.x,z-world.town.z,1.5)||inNacarPalaceFootprint(x,z,1.5))return false;
    const center=world.sample(x,z);
    if(!Number.isFinite(center.height)||Math.hypot(center.slopeX,center.slopeZ)>.65)return false;
    for(const [dx,dz] of [[0,0],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]]){
      const s=world.sample(x+dx,z+dz),level=world.waterLevel(x+dx,z+dz);
      if(!Number.isFinite(s.height)||Math.abs(s.height-center.height)>.65||
        level!==null&&level>s.height-.12)return false;
    }
    return world.clear?.(x,center.height,z)??true;
  };
  if(safe(start.x,start.z))return {x:start.x,z:start.z};
  for(let radius=4;radius<=(place.arrivalRadius??64);radius+=4){
    const count=Math.max(12,Math.ceil(Math.PI*2*radius/4));
    for(let i=0;i<count;i++){
      const angle=i/count*Math.PI*2,x=start.x+Math.sin(angle)*radius,z=start.z+Math.cos(angle)*radius;
      if(safe(x,z))return {x,z};
    }
  }
  return null;
}

/** Stable identifiers and coordinates. Add future places here, not in WorldView. */
import { FOLIAGE_FOREST } from './foliageForestConfig';
export type PointOfInterest={
  id:string;name:string;x:number;z:number;
  kind:'waterfall'|'ruins'|'lookout'|'cave'|'bridge'|'dock';
  discoverRadius:number;description:string;dialogue:string;
};

export const POINTS_OF_INTEREST:readonly PointOfInterest[]=[
  {id:'laguna-tres-vertientes',name:'Laguna de las Tres Vertientes',x:-160,z:-650,kind:'waterfall',discoverRadius:90,
    description:'Tres cascadas, sauces y nenúfares. Nado con WASD; Ctrl para bucear.',
    dialogue:'Las vertientes alimentan una laguna profunda. La boca sumergida está en la orilla oriental: conduce a una gran gruta con dos salidas.'},
  {id:'gruta-mirador',name:'Mirador de la Gruta',x:50,z:-1060,kind:'cave',discoverRadius:25,
    description:'Salida de montaña de la Gruta de las Vertientes.',dialogue:'La senda desciende hacia una cámara con un lago subterráneo.'},
  {id:'gruta-bosque',name:'Sendero del Bosque Húmedo',x:160,z:-720,kind:'cave',discoverRadius:25,
    description:'Acceso oriental a la Gruta de las Vertientes.',dialogue:'Las balizas conectan esta galería con el sifón de la laguna.'},
  {id:FOLIAGE_FOREST.id,name:FOLIAGE_FOREST.name,x:FOLIAGE_FOREST.x,z:FOLIAGE_FOREST.z,
    kind:'lookout',discoverRadius:55,
    description:'Bosque extenso para observar los nuevos árboles, flores y el rendimiento del viento.',
    dialogue:'Las copas ilustradas se mueven con la brisa. El sendero permite recorrer el bosque y comparar sus detalles de cerca y de lejos.'},
  {id:FOLIAGE_FOREST.flowerMeadow.id,name:FOLIAGE_FOREST.flowerMeadow.name,
    x:FOLIAGE_FOREST.flowerMeadow.x,z:FOLIAGE_FOREST.flowerMeadow.z,
    kind:'lookout',discoverRadius:45,
    description:'Claro de flores V4 densas para comparar colores y rendimiento.',
    dialogue:'Las flores forman manchas de color entre las matas de pasto del bosque.'},
  {id:'cascada-valle',name:'Cascada del Valle',x:470,z:-1005,kind:'waterfall',discoverRadius:48,
    description:'Una caída del río principal al borde del valle.',
    dialogue:'El agua desciende de las cumbres por una garganta. Las rocas de esta orilla forman un mirador natural.'},
  {id:'ruina-caminos',name:'Ruina de los Caminos',x:-120,z:-210,kind:'ruins',discoverRadius:38,
    description:'Piedras antiguas donde se bifurcan los senderos.',
    dialogue:'Los grabados marcan rutas hacia Lindebrumas y Altapiedra. Aún nadie sabe quién levantó estas columnas.'},
  {id:'mirador-altapiedra',name:'Mirador de Altapiedra',x:-340,z:-565,kind:'lookout',discoverRadius:42,
    description:'Terraza natural sobre las sierras.',
    dialogue:'Desde aquí se distinguen las crestas, los pasos naturales y el camino que vuelve a Brisalia.'},
  {id:'cueva-antigua',name:'Entrada de Cueva Antigua',x:-300,z:-640,kind:'cave',discoverRadius:38,
    description:'Entrada sur a las Galerías de Ferragrís. E para entrar; tres salidas conectan la sierra.',
    dialogue:'Las balizas de los mineros conducen a una sala central, una cámara de cristales y dos salidas de altura.'},
  {id:'galerias-canon',name:'Galerías · salida al Cañón',x:-520,z:-1040,kind:'cave',discoverRadius:30,
    description:'Acceso a la red subterránea junto al viaducto. Presioná E cerca del umbral.',dialogue:'El viaducto conecta ambas paredes del cañón.'},
  {id:'galerias-cordillera',name:'Galerías · salida a la Cordillera',x:-780,z:-1320,kind:'cave',discoverRadius:30,
    description:'Salida norte de las galerías, cerca del puente alto.',dialogue:'Desde este paso se continúa hacia el Crisol.'},
  {id:'viaducto-canon',name:'Viaducto del Cañón',x:-620,z:-1040,kind:'bridge',discoverRadius:35,
    description:'Puente de piedra con rampas, arcos y barandas sobre el cañón.',dialogue:'Las rampas ascienden hasta el tablero que une las dos laderas.'},
  {id:'puente-cordillera',name:'Puente de la Cordillera',x:-930,z:-1320,kind:'bridge',discoverRadius:35,
    description:'Paso elevado de montaña, conectado a la salida norte de Ferragrís.',dialogue:'Un paso alto sobre las quebradas de la cordillera.'},
  {id:'puente-arroyo',name:'Puente del Arroyo',x:155,z:-133,kind:'bridge',discoverRadius:36,
    description:'Cruce del arroyo en la ruta hacia Nácar.',
    dialogue:'Este puente mantiene transitable el sendero oriental incluso cuando el arroyo crece.'},
  {id:'embarcadero-brisalia',name:'Embarcadero de Brisalia',x:33,z:120,kind:'dock',discoverRadius:32,
    description:'Salida marítima hacia la Isla de las Luciérnagas.',
    dialogue:'Desde este muelle parten los viajes por mar. La Isla de las Luciérnagas ya se puede visitar.'}
];

export function pointOfInterest(id:string):PointOfInterest|undefined{
  return POINTS_OF_INTEREST.find(place=>place.id===id);
}

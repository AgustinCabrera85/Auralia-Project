/** Stable identifiers and coordinates. Add future places here, not in WorldView. */
export type PointOfInterest={
  id:string;name:string;x:number;z:number;
  kind:'waterfall'|'ruins'|'lookout'|'cave'|'bridge'|'dock';
  discoverRadius:number;description:string;dialogue:string;
};

export const POINTS_OF_INTEREST:readonly PointOfInterest[]=[
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
    description:'Una abertura rocosa aún sin interior explorable.',
    dialogue:'La cueva permanece cerrada. Sus galerías podrán abrirse en una futura expedición.'},
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

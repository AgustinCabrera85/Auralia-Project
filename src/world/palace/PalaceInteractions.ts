export type PalaceInteraction={id:string;room:string;position:readonly [number,number,number];verb:string;title:string;kind:'read'|'craft';text?:string};

/** Stations sit on the accessible side of authored furniture. Positions are in
 * the source plan; the runtime applies the same expansion as the room grid. */
export const PALACE_INTERACTIONS:readonly PalaceInteraction[]=[
  {id:'reception',room:'P01',position:[6.5,0,10.15],verb:'Consultar recepción',title:'Recepción del palacio',kind:'read',text:'El vestíbulo comunica con la antesala de la corte al oeste y la administración al este. El patio central conduce a la biblioteca, el taller y las salas de servicio. Las dos escaleras del fondo permiten subir a las galerías y los alojamientos.'},
  {id:'library-map',room:'P06',position:[-30,0,22],verb:'Consultar el plano',title:'Plano del Palacio de Brisalia',kind:'read',text:'La entrada principal está al sur. El patio ocupa el centro; el salón de audiencias se encuentra al norte, entre la sala del consejo y el comedor. La biblioteca y el taller están en el ala oeste; la cocina y la despensa, en el ala este. En la planta alta se encuentran los huéspedes, las salas de lectura y las dependencias reales.'},
  {id:'workshop',room:'P07',position:[-30,0,34],verb:'Usar banco de trabajo',title:'Taller de palacio',kind:'craft'},
  {id:'administration',room:'P04',position:[13.5,0,5],verb:'Consultar directorio',title:'Directorio del palacio',kind:'read',text:'Planta baja: recepción, guardia, espera, administración, biblioteca, taller, cocina, despensa, consejo, audiencias y comedor. Planta alta: habitaciones de huéspedes, galería de arte, lectura, estudio, suites, despacho y archivo privado. Los baños públicos están junto a la torre este.'},
  {id:'archive',room:'S15',position:[13,4.8,52.8],verb:'Leer catálogo del archivo',title:'Archivo privado',kind:'read',text:'El catálogo organiza las dependencias de la planta alta alrededor del patio. Al oeste se encuentran la c?mara real y el despacho; al centro, la sala familiar; al este, el archivo y la c?mara real este. Las galerías conectan estos espacios con las dos escaleras y el balcón ceremonial.'},
];

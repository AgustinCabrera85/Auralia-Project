import type { AssetId } from './assetCatalog';
export type RegionId='VAL'|'OCC'|'ECO'|'SIE'|'CRI'|'ALB'|'DES'|'MAL'|'NAC'|'SEL'|'LLA'|'COS';
export type RegionDefinition={id:RegionId;name:string;realm:string;center:readonly [number,number];
  polygon:readonly (readonly [number,number])[];landforms:readonly string[];
  availableAssets:readonly AssetId[];neededAssets:readonly string[]};
/** Production territories, separate from material masks and legacy save IDs.
 * Missing regional assets are explicit briefs, not generic substitutes. */
export const REGIONS:readonly RegionDefinition[]=[
  {id:'VAL',name:'Valle de los Faroles',realm:'Valdoria',center:[0,-130],
    polygon:[[-320,180],[-480,-200],[-260,-430],[80,-480],[180,-290],[170,100]],
    landforms:['cuenca templada','lomas de cerezos','garganta','meseta de fortaleza'],
    availableAssets:['arbolito1','arbolito2','v3TreeCherryPink','v3TreeCherryWhite','mesetaPasto','packRocas','crisolHerrero'],
    neededAssets:['molino de agua','huertos y colmenas','casas con galerías','Palacio de los Cerezos']},
  {id:'OCC',name:'Valles Occidentales',realm:'Valdemonte',center:[-1240,-450],
    polygon:[[-2000,-150],[-1800,-740],[-1100,-750],[-820,-570],[-480,-200],[-320,180],[-1000,260]],
    landforms:['valles encajados','terrazas agrícolas','promontorios'],
    availableAssets:['arbolito1','arbolito2','mesetaPasto','packRocas'],neededAssets:['castillos en terrazas','viñedos','granjas de piedra']},
  {id:'ECO',name:'Bosque de los Ecos',realm:'Sylvarin',center:[-680,-470],
    polygon:[[-1100,-750],[-900,-950],[-530,-860],[-260,-430],[-480,-200],[-820,-570]],
    landforms:['bosque en barrancos','claros','raíces y cuevas'],
    availableAssets:['arbolito2','arbolito3','tronco1','plantitas1','cristalAzul','formacionRocosa'],
    neededAssets:['árboles monumentales','ruinas con musgo','aldeas forestales']},
  {id:'SIE',name:'Sierras de los Engranajes',realm:'Ferragrís',center:[-650,-1100],
    polygon:[[-1100,-750],[-1250,-1340],[-700,-1520],[-260,-1500],[-100,-1060],[80,-480],[-260,-430],[-530,-860],[-900,-950]],
    landforms:['crestas ramificadas','pasos altos','galerías mineras','viaductos'],
    availableAssets:['escalonRocoso','rocasRectangulares','acantilado2','packRocas','cristalFuego','crisolHerrero'],
    neededAssets:['casas en terrazas','grúas y poleas','vagonetas','fortaleza minera']},
  {id:'CRI',name:'Cordillera del Crisol',realm:'Ignaria',center:[-170,-1840],
    polygon:[[-700,-1520],[-780,-2400],[200,-2630],[570,-2100],[500,-1550],[-260,-1500]],
    landforms:['cono volcánico','caldera','contrafuertes','tubos de lava'],
    availableAssets:['cristalFuego','formacionRocosa','rocasRectangulares'],
    neededAssets:['basalto columnar','fumarolas','costras de lava','arquitectura de obsidiana']},
  {id:'ALB',name:'Cumbres del Primer Amanecer',realm:'Albor',center:[400,-1260],
    polygon:[[-260,-1500],[500,-1550],[900,-1400],[900,-850],[450,-550],[80,-480],[-100,-1060]],
    landforms:['aristas alpinas','circos glaciares','repisas nevadas','puentes de altura'],
    availableAssets:['acantilado2','escalonRocoso','cristalCeleste','islaFlotante'],
    neededAssets:['pinos alpinos','hielo glaciar','piedra clara','ciudadela de Altaluz']},
  {id:'DES',name:'Desierto del Ocaso',realm:'Solhar',center:[-1400,-1800],
    polygon:[[-1800,-740],[-2000,-2000],[-780,-2630],[-780,-2400],[-700,-1520],[-1250,-1340],[-1100,-750]],
    landforms:['mesas de arenisca','cañones','dunas','oasis'],
    availableAssets:['packRocas','rocasRectangulares'],neededAssets:['arenisca estratificada','palmeras','adobe','ruinas semienterradas']},
  {id:'MAL',name:'Tierras Malditas',realm:'Umbrael',center:[1160,-1920],
    polygon:[[570,-2100],[200,-2630],[1800,-2400],[2000,-1480],[900,-1400],[500,-1550]],
    landforms:['mesetas fracturadas','lagunas oscuras','bosques marchitos'],
    availableAssets:['arbolitoSeco','tronco1','cristalAzul','rocasRectangulares'],
    neededAssets:['árboles retorcidos','ruinas del eclipse','aldeas restaurables','niebla localizada']},
  {id:'NAC',name:'Lago de Nácar',realm:'Las Dos Orillas',center:[500,-350],
    polygon:[[180,-290],[80,-480],[450,-550],[900,-850],[1050,-400],[770,-40],[170,100]],
    landforms:['cuenca lacustre','deltas','isletas','riberas'],
    availableAssets:['v3TreeWillowWeeping','v3TreeRiverSarandi','v3WetlandTotoraTall','v3WetlandLilyWhite','cristalCeleste'],
    neededAssets:['casas lacustres','muelles','barcas','mercado de canales']},
  {id:'SEL',name:'Selva de las Mil Cascadas',realm:'Viridara',center:[1420,-660],
    polygon:[[900,-1400],[2000,-1480],[2000,-130],[1370,0],[770,-40],[1050,-400],[900,-850]],
    landforms:['gargantas húmedas','cascadas escalonadas','mesetas selváticas'],
    availableAssets:['arbolito3','plantitas1','v3WetlandFern','acantilado2'],
    neededAssets:['árboles tropicales','lianas','raíces tabulares','templos','puentes de cuerda']},
  {id:'LLA',name:'Llanuras del Sur',realm:'Doravena',center:[-500,280],
    polygon:[[-1000,260],[-320,180],[170,100],[360,290],[-700,370]],
    landforms:['colinas bajas','llanuras cultivables','cursos lentos'],
    availableAssets:['arbolito1','v3TreeCherryWhite','packRocas'],neededAssets:['trigales','graneros','molinos','cercos']},
  {id:'COS',name:'Costas de los Faros',realm:'Thalamar',center:[700,160],
    polygon:[[170,100],[770,-40],[1370,0],[2000,-130],[1450,340],[360,290]],
    landforms:['acantilados marinos','ensenadas','cabos','archipiélagos'],
    availableAssets:['acantilado2','packRocas','v3TreeRiverFork'],neededAssets:['faros','puertos','casas marineras','rocas marinas']}
];
export function insideRegion(x:number,z:number,polygon:RegionDefinition['polygon']):boolean{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function regionAt(x:number,z:number):RegionDefinition{
  return REGIONS.find(r=>insideRegion(x,z,r.polygon))??REGIONS.reduce((a,b)=>
    Math.hypot(x-a.center[0],z-a.center[1])<Math.hypot(x-b.center[0],z-b.center[1])?a:b);
}
export function regionalAssetAllowed(asset:string,x:number,z:number):boolean{
  if(x>-500&&x<600&&z>-720)return true;
  const id=regionAt(x,z).id;
  if(['DES','CRI','ALB'].includes(id)&&['arbolito1','arbolito2','arbolito3','plantitas1','tronco1'].includes(asset))return false;
  if(id==='MAL'&&['arbolito1','arbolito2','arbolito3'].includes(asset))return false;
  return true;
}

/** P1 layout in metres. Provisional pilot geometry, not new persistent place IDs. */
export type ReliefPoint = readonly [x:number,z:number];
export type ReliefProfilePoint = readonly [x:number,z:number,height:number];
export type ReliefEllipse = Readonly<{
  id:string;kind:'basin'|'ridge'|'plateau';x:number;z:number;
  radiusX:number;radiusZ:number;inner:number;outer:number;
  height:number;strength:number;
}>;

export const FAROLES_RELIEF = {
  version:2,
  id:'valle-faroles-pilot-v2',
  bounds:{minX:-480,maxX:240,minZ:-490,maxZ:160,blend:60},
  // The whole inhabited starter rectangle, including triangle support around it.
  protectedCore:{minX:-125,maxX:125,minZ:-125,maxZ:170,margin:12,blend:48},
  features:[
    {id:'cuenca-cerezos',kind:'basin',x:-20,z:-220,radiusX:100,radiusZ:130,
      inner:.2,outer:1.2,height:9.5,strength:.65},
    {id:'loma-molinos',kind:'ridge',x:-38,z:-352,radiusX:160,radiusZ:115,
      inner:0,outer:1.3,height:58,strength:1},
    {id:'cresta-occidental',kind:'ridge',x:-373,z:-130,radiusX:73,radiusZ:176,
      inner:0,outer:1.2,height:46,strength:1},
    {id:'meseta-fortaleza',kind:'plateau',x:-270,z:-95,radiusX:128,radiusZ:112,
      inner:.42,outer:1.24,height:82,strength:1}
  ] as readonly ReliefEllipse[],
  gorge:{id:'garganta-arroyo',minZ:-355,maxZ:-155,endBlend:45,
    innerBank:18,crest:42,outerBank:86,rise:45},
  // Access profiles shape broad shoulders; they do not add roads or POIs to saves.
  approaches:[
    {id:'ascenso-meseta',width:13,blend:26,points:[
      [-142,-92,10.9],[-185,-60,21],[-235,-40,40],[-305,-55,59],
      [-325,-110,76],[-285,-125,82],[-270,-95,82]
    ] as readonly ReliefProfilePoint[]},
    {id:'paso-cerezos',width:16,blend:32,points:[
      [-165,-170,12],[-207,-136,26],[-245,-128,53],[-285,-125,82]
    ] as readonly ReliefProfilePoint[]}
  ],
  protectedSites:[
    {id:'lindebrumas',x:-350,z:-285,radius:40,blend:44},
    {id:'altapiedra',x:-275,z:-535,radius:40,blend:44},
    {id:'nacar',x:245,z:-250,radius:40,blend:44},
    {id:'altaluz',x:200,z:-660,radius:40,blend:44}
  ]
} as const;

/** Reproducible viewpoints for P0/P1; no travel or progression is attached. */
export const FAROLES_REVIEW_POINTS = [
  {id:'brisalia',x:1,z:10,alpha:.42},
  {id:'acceso-occidental',x:-130,z:-80,alpha:.3},
  {id:'cuenca-cerezos',x:-20,z:-215,alpha:1.25},
  {id:'garganta-arroyo',x:90,z:-260,alpha:1.6},
  {id:'mirador-meseta',x:-270,z:-95,alpha:3.6}
] as const;

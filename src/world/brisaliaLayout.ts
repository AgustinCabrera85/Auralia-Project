import { TRAVERSAL } from '../game/traversalRules';
/** Rev4 metre-scale placements relative to PlayableWorld.town. Original parcel
 * corners are converted with manifest bounds before arranging clear streets.
 * Blender XY becomes Babylon XZ; no model is rescaled to fit the old site. */
const METRIC_BUILDINGS = [
  {
    "id": "B01",
    "file": "B01_casa_taller.glb",
    "x": -27,
    "z": -110,
    "yaw": 0,
    "width": 13.55,
    "depth": 10.43,
    "height": 9.23,
    "originalCenter": [
      26.775,
      23.215
    ]
  },
  {
    "id": "B02",
    "file": "B02_posada.glb",
    "x": -56,
    "z": -50,
    "yaw": 0,
    "width": 15.96,
    "depth": 13.225,
    "height": 7.945,
    "originalCenter": [
      15.98,
      54.6125
    ]
  },
  {
    "id": "B03",
    "file": "B03_salon.glb",
    "x": 3,
    "z": -46,
    "yaw": 0,
    "width": 19.04,
    "depth": 13.9296,
    "height": 7.995,
    "originalCenter": [
      82.52,
      61.9648
    ]
  },
  {
    "id": "B04",
    "file": "B04_taller.glb",
    "x": 50,
    "z": -82,
    "yaw": 180,
    "width": 13.96,
    "depth": 11.5138,
    "height": 5.055,
    "originalCenter": [
      85.98,
      29.7569
    ]
  },
  {
    "id": "B05",
    "file": "B05_taller.glb",
    "x": 54,
    "z": -51,
    "yaw": 0,
    "width": 11.96,
    "depth": 10.5152,
    "height": 5.055,
    "originalCenter": [
      99.98,
      49.2576
    ]
  },
  {
    "id": "B06",
    "file": "B06_torre.glb",
    "x": 80,
    "z": -24,
    "yaw": 0,
    "width": 6.3962,
    "depth": 6.3962,
    "height": 13.16,
    "originalCenter": [
      103.1981,
      73.1981
    ]
  },
  {
    "id": "B07",
    "file": "B07_vivienda.glb",
    "x": -46,
    "z": -110,
    "yaw": 180,
    "width": 9.1016,
    "depth": 8.0702,
    "height": 4.71,
    "originalCenter": [
      9.550799999999999,
      27.0351
    ]
  },
  {
    "id": "B08",
    "file": "B08_vivienda.glb",
    "x": -61,
    "z": -80,
    "yaw": 180,
    "width": 8.96,
    "depth": 9.547,
    "height": 9.03,
    "originalCenter": [
      9.48,
      42.7735
    ]
  },
  {
    "id": "B09",
    "file": "B09_vivienda.glb",
    "x": -67,
    "z": -24,
    "yaw": 0,
    "width": 8.96,
    "depth": 10.1282,
    "height": 5.11,
    "originalCenter": [
      11.48,
      66.0641
    ]
  },
  {
    "id": "B10",
    "file": "B10_vivienda.glb",
    "x": -36,
    "z": -24,
    "yaw": 0,
    "width": 9.099,
    "depth": 8.0664,
    "height": 7.45,
    "originalCenter": [
      19.549500000000002,
      79.0332
    ]
  },
  {
    "id": "B11",
    "file": "B11_vivienda.glb",
    "x": -20,
    "z": -24,
    "yaw": 0,
    "width": 7.96,
    "depth": 9.0336,
    "height": 6.29,
    "originalCenter": [
      36.98,
      68.5168
    ]
  },
  {
    "id": "B12",
    "file": "B12_vivienda.glb",
    "x": 17,
    "z": -24,
    "yaw": 0,
    "width": 8.96,
    "depth": 9.291,
    "height": 7.49,
    "originalCenter": [
      49.480000000000004,
      77.6455
    ]
  },
  {
    "id": "B13",
    "file": "B13_vivienda.glb",
    "x": 33,
    "z": -24,
    "yaw": 0,
    "width": 9.1084,
    "depth": 8.0802,
    "height": 5.25,
    "originalCenter": [
      70.5542,
      79.0401
    ]
  },
  {
    "id": "B14",
    "file": "B14_vivienda.glb",
    "x": 48,
    "z": -24,
    "yaw": 0,
    "width": 7.96,
    "depth": 8.0342,
    "height": 5.78,
    "originalCenter": [
      82.98,
      76.0171
    ]
  },
  {
    "id": "B15",
    "file": "B15_vivienda.glb",
    "x": 63,
    "z": -24,
    "yaw": 0,
    "width": 8.96,
    "depth": 9.2891,
    "height": 7.64,
    "originalCenter": [
      93.48,
      77.64455
    ]
  },
  {
    "id": "B16",
    "file": "B16_vivienda.glb",
    "x": -61,
    "z": -110,
    "yaw": 180,
    "width": 9.106,
    "depth": 6.0816,
    "height": 5.1,
    "originalCenter": [
      9.553,
      20.0408
    ]
  },
  {
    "id": "B17",
    "file": "B17_vivienda.glb",
    "x": -8,
    "z": -110,
    "yaw": 180,
    "width": 8.96,
    "depth": 9.543,
    "height": 8.82,
    "originalCenter": [
      41.480000000000004,
      21.7715
    ]
  },
  {
    "id": "B18",
    "file": "B18_vivienda.glb",
    "x": 14,
    "z": -110,
    "yaw": 180,
    "width": 8.96,
    "depth": 8.1358,
    "height": 5.14,
    "originalCenter": [
      79.48,
      21.0679
    ]
  },
  {
    "id": "B19",
    "file": "B19_vivienda.glb",
    "x": 31,
    "z": -110,
    "yaw": 180,
    "width": 9.1096,
    "depth": 7.084,
    "height": 7.78,
    "originalCenter": [
      94.5548,
      20.542
    ]
  },
  {
    "id": "B20",
    "file": "B20_vivienda.glb",
    "x": 0,
    "z": -24,
    "yaw": 0,
    "width": 7.96,
    "depth": 8.031,
    "height": 5.42,
    "originalCenter": [
      51.98,
      61.0155
    ]
  },
  {
    "id": "B21",
    "file": "B21_vivienda.glb",
    "x": -41,
    "z": -80,
    "yaw": 180,
    "width": 8.96,
    "depth": 9.2944,
    "height": 8.18,
    "originalCenter": [
      36.480000000000004,
      42.6472
    ]
  },
  {
    "id": "B22",
    "file": "B22_vivienda.glb",
    "x": 28,
    "z": -82,
    "yaw": 180,
    "width": 9.0976,
    "depth": 8.0642,
    "height": 4.74,
    "originalCenter": [
      73.5488,
      34.0321
    ]
  },
  {
    "id": "B23",
    "file": "B23_vivienda.glb",
    "x": 30,
    "z": -51,
    "yaw": 0,
    "width": 8.96,
    "depth": 8.5492,
    "height": 9.36,
    "originalCenter": [
      75.48,
      48.2746
    ]
  },
  {
    "id": "B24",
    "file": "B24_vivienda.glb",
    "x": 80,
    "z": -51,
    "yaw": 0,
    "width": 8.96,
    "depth": 9.1298,
    "height": 4.78,
    "originalCenter": [
      109.48,
      58.5649
    ]
  },
  {
    "id": "B25",
    "file": "B25_vivienda.glb",
    "x": -52,
    "z": -24,
    "yaw": 0,
    "width": 9.0992,
    "depth": 8.0666,
    "height": 4.53,
    "originalCenter": [
      21.549599999999998,
      65.0333
    ]
  },
  {
    "id": "B26",
    "file": "B26_vivienda.glb",
    "x": 49,
    "z": -110,
    "yaw": 180,
    "width": 8.96,
    "depth": 8.548,
    "height": 8.85,
    "originalCenter": [
      106.48,
      29.274
    ]
  },
  {
    "id": "B27",
    "file": "B27_iglesia_monasterio.glb",
    "x": -110,
    "z": -82,
    "yaw": 180,
    "width": 23.28,
    "depth": 26.2348,
    "height": 14.1,
    "originalCenter": null
  },
  {
    "id": "B28",
    "file": "B28_Castillo_Brisalia_Rev5.glb",
    "assetRoot": "brisalia-castle-rev5",
    "revision": 5,
    "x": 135,
    "z": -104,
    "yaw": 180,
    "width": 71.26,
    "depth": 65.03,
    "height": 31.791,
    "footprintOffsetZ": 0.885,
    "originalCenter": null
  }
] as const;
// Runtime units are calibrated to the existing 3.8-unit player. Source GLBs
// remain metric and byte-identical; scale the whole settlement coherently.
export const BRISALIA_REFERENCE_HEIGHT_M=1.4;
export const BRISALIA_SCALE=TRAVERSAL.playerHeight/BRISALIA_REFERENCE_HEIGHT_M;
export const BRISALIA_BUILDINGS=METRIC_BUILDINGS.map(b=>({revision:4,assetRoot:'brisalia-rev4',...b,
 x:b.x*BRISALIA_SCALE,z:b.z*BRISALIA_SCALE,width:b.width*BRISALIA_SCALE,
 depth:b.depth*BRISALIA_SCALE,height:b.height*BRISALIA_SCALE,
 footprintOffsetZ:('footprintOffsetZ' in b?b.footprintOffsetZ:0)*BRISALIA_SCALE}));
export type BrisaliaBuilding=typeof BRISALIA_BUILDINGS[number];
// Door centres measured in the individual GLBs, before the placement yaw.
// B01's authored facade faces +Z; the other prefabs face -Z.
const ENTRY_X:Record<string,number>={B01:-.745,B02:0,B03:0,B04:-2.73,B05:-2.31,B06:0,
 B11:-1.47,B14:-1.47,B20:-1.47,B27:-3.946};
export function brisaliaApproach(b:BrisaliaBuilding):readonly [number,number]{
 const reversed=b.yaw===180,front=(b.id==='B01'?1:-1)*(reversed?-1:1);
 return [b.x+(ENTRY_X[b.id]??-1.68)*BRISALIA_SCALE*(reversed?-1:1),
  b.z+front*(b.depth/2+.2)];
}
export type VillageRoad={width:number;points:readonly (readonly [number,number])[]};
const METRIC_ROADS:VillageRoad[]=[
 {width:4.5,points:[[-75,-98],[65,-98]]},
 {width:5,points:[[-110,-65],[86,-65],[86,-35],[135,-35],[135,-69]]},
 {width:4,points:[[-75,-35],[86,-35]]},
 {width:4,points:[[-75,-98],[-75,-35]]},
 {width:4,points:[[-29,-98],[-29,-35]]},
 {width:4,points:[[17,-98],[17,-35]]},
 {width:4,points:[[1,10],[1,0],[-10,-10],[-10,-65]]}
];
export const BRISALIA_ROADS=METRIC_ROADS.map(r=>({width:r.width*BRISALIA_SCALE,
 points:r.points.map(([x,z])=>[x*BRISALIA_SCALE,z*BRISALIA_SCALE] as const)}));
// Flat village terraces are carved into the authoritative terrain, not drawn
// as another floor. Outside the settlement, blend back to the existing relief.
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function brisaliaPlatformWeight(x:number,z:number):number{
 x/=BRISALIA_SCALE;z/=BRISALIA_SCALE;
 const d=Math.hypot(Math.max(-128-x,0,x-176),Math.max(-144-z,0,z-38));
 return 1-smooth(0,36,d);
}
export function brisaliaCourtyardHeight(x:number,z:number):number{
 x/=BRISALIA_SCALE;z/=BRISALIA_SCALE;
 const dx=Math.abs(x-135),dz=z+104;
 // Rev5: eight 0.36 m treads rise to 1.35 m, ending at source Y=-30.28.
 // The interior remains map soil and meets the top landing without a drop.
 const t=Math.max(0,Math.min(1,(33.16-dz)/2.88));
 // Keep the terrain below the stone treads, including their first nosings.
 const approach=1.35*t-.08*Math.sin(Math.PI*t);
 return approach*BRISALIA_SCALE*(1-smooth(28,34,dx))*(1-smooth(27,33,-dz));
}
export function distanceToRoad(x:number,z:number,road:VillageRoad):number{
 let best=Infinity;
 for(let i=1;i<road.points.length;i++){
  const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
  best=Math.min(best,Math.hypot(x-ax-t*dx,z-az-t*dz));
 }return best;
}
export function inBrisaliaFootprint(x:number,z:number,pad=0):boolean{
 return BRISALIA_BUILDINGS.some(b=>Math.abs(x-b.x)<b.width/2+pad&&Math.abs(z-b.z-b.footprintOffsetZ)<b.depth/2+pad);
}
// Share the door approaches and shoulder with the planting mask, so grass never
// needs a separate approximation of the visible street network.
export const BRISALIA_PATHS:readonly VillageRoad[]=[...BRISALIA_ROADS,
 ...BRISALIA_BUILDINGS.filter(b=>b.id!=='B28').map(b=>{
  const start=brisaliaApproach(b),[x,z]=start;
  let target:readonly [number,number]=start,best=Infinity;
  for(const road of BRISALIA_ROADS)for(let i=1;i<road.points.length;i++){
   const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az;
   const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
   const p=[ax+t*dx,az+t*dz] as const,d=Math.hypot(x-p[0],z-p[1]);
   if(d<best){best=d;target=p;}
  }
  return {width:2.4*BRISALIA_SCALE,points:[start,target]};
 })];
/** Signed distance from the irregular dirt shoulder, in local runtime units. */
export function brisaliaRoadEdge(x:number,z:number):number{
 let d=Math.max(Math.abs(x)-12*BRISALIA_SCALE,Math.abs(z+65*BRISALIA_SCALE)-9*BRISALIA_SCALE);
 for(const road of BRISALIA_PATHS)d=Math.min(d,distanceToRoad(x,z,road)-road.width/2);
 const variation=(a:number,b:number)=>Math.sin(a*.29+Math.sin(b*.17))*Math.cos(b*.31+a*.09);
 return d+variation(x,z)*.7+variation(x*2.7+31,z*2.7)*.25;
}

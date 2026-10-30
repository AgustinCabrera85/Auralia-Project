import type { Biome } from './terrainData';

export type GeologyKind='cliff'|'plateau'|'coastalCliff'|'canyon';
export type GeologyFormation=Readonly<{
  id:string;name:string;kind:GeologyKind;biome:Biome;
  x:number;z:number;axisX:number;axisZ:number;highX:number;highZ:number;
  length:number;depth:number;endRamp:number;targetHeight:number;seed:number;
}>;

/** World-space landmarks, independent of chunk order and of Babylon.js. */
export const GEOLOGY_FORMATIONS:readonly GeologyFormation[]=[
  {id:'altapiedra-cliff',name:'Acantilado de Altapiedra',kind:'cliff',biome:'sierras',
    x:-445,z:-565,axisX:0,axisZ:1,highX:-1,highZ:0,
    length:220,depth:150,endRamp:75,targetHeight:68,seed:37011},
  {id:'sierra-plateau',name:'Meseta de las Sierras',kind:'plateau',biome:'sierras',
    x:-175,z:-700,axisX:0,axisZ:1,highX:1,highZ:0,
    length:170,depth:125,endRamp:58,targetHeight:52,seed:37029},
  {id:'auralia-coastal-cliff',name:'Acantilado de la Costa de Auralia',kind:'coastalCliff',biome:'costa',
    x:2018,z:-720,axisX:0,axisZ:1,highX:-1,highZ:0,
    length:240,depth:145,endRamp:76,targetHeight:34,seed:37047},
  {id:'sierra-canyon',name:'Cañón de las Sierras',kind:'canyon',biome:'sierras',
    x:-420,z:-1040,axisX:0,axisZ:1,highX:1,highZ:0,
    length:240,depth:130,endRamp:38,targetHeight:60,seed:37063}
] as const;

export function geologyFormationId(pieceId:string):string|null{
  if(!pieceId.startsWith('geo:'))return null;
  const end=pieceId.indexOf(':',4);
  return end<0?null:pieceId.slice(4,end);
}

export function sameGeologyFormation(a:string,b:string):boolean{
  const id=geologyFormationId(a);
  return id!==null&&id===geologyFormationId(b);
}

const clamp=(n:number,a:number,b:number):number=>Math.max(a,Math.min(b,n));
const smooth=(a:number,b:number,n:number):number=>{
  const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);
};

export function geologyLocal(f:GeologyFormation,x:number,z:number):{along:number;across:number}{
  const dx=x-f.x,dz=z-f.z;
  return {along:dx*f.axisX+dz*f.axisZ,across:dx*f.highX+dz*f.highZ};
}

export function geologyPoint(f:GeologyFormation,along:number,across:number):{x:number;z:number}{
  return {x:f.x+f.axisX*along+f.highX*across,
    z:f.z+f.axisZ*along+f.highZ*across};
}

/** The face is steep, the crest is level and both ends and rear have walkable runouts. */
export function geologyInfluence(f:GeologyFormation,x:number,z:number):number{
  const {along,across}=geologyLocal(f,x,z);
  if(f.kind==='canyon'){
    if(Math.abs(along)>f.length*.5+20||Math.abs(across)>f.depth*.5+60)return 0;
    const end=1-smooth(f.length*.5-f.endRamp,f.length*.5+20,Math.abs(along));
    const banks=1-smooth(f.depth*.5-10,f.depth*.5+60,Math.abs(across));
    return end*banks;
  }
  if(Math.abs(along)>f.length*.5+12||across< -12||across>f.depth+18)return 0;
  const end=1-smooth(f.length*.5-f.endRamp,f.length*.5+12,Math.abs(along));
  const face=smooth(-12,14,across);
  const rear=1-smooth(f.depth-(f.kind==='plateau'?90:110),f.depth+18,across);
  return end*face*rear;
}

/** Applied after the existing relief, so the canonical sampler also drives maps and saves. */
export function applyGeologyRelief(x:number,z:number,base:number,roadMask=0):number{
  let height=base;
  for(const formation of GEOLOGY_FORMATIONS){
    const influence=geologyInfluence(formation,x,z)*(1-roadMask);
    if(influence<=0)continue;
    const target=formation.kind==='canyon'
      ?formation.targetHeight-33*(1-smooth(22,50,Math.abs(geologyLocal(formation,x,z).across)))
      :formation.targetHeight;
    height+=(target-height)*influence;
  }
  return height;
}

/** Keep trees and random stone out of the structural face and its seams. */
export function geologyFaceExcludes(x:number,z:number):boolean{
  return GEOLOGY_FORMATIONS.some(f=>{
    const {along,across}=geologyLocal(f,x,z);
    if(f.kind==='canyon')return Math.abs(along)<f.length*.5+10&&
      Math.abs(across)>21&&Math.abs(across)<60;
    return Math.abs(along)<f.length*.5+10&&across> -34&&across<30;
  });
}

export function geologyIntersectsChunk(f:GeologyFormation,cx:number,cz:number,size:number):boolean{
  const halfLength=f.length*.5+20;
  const low=f.kind==='canyon'?-f.depth*.5-60:-38;
  const high=f.kind==='canyon'?f.depth*.5+60:f.depth+24;
  const corners=[geologyPoint(f,-halfLength,low),geologyPoint(f,-halfLength,high),
    geologyPoint(f,halfLength,low),geologyPoint(f,halfLength,high)];
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
  const minZ=Math.min(...corners.map(p=>p.z)),maxZ=Math.max(...corners.map(p=>p.z));
  return maxX>=cx*size&&minX<=(cx+1)*size&&maxZ>=cz*size&&minZ<=(cz+1)*size;
}

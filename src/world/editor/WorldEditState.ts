/** Shared authoring data consumed by the game and the editor.
 * No Babylon dependency: height, materials and vegetation can query synchronously. */
export const WORLD_EDIT_VERSION = 1 as const;
export type SurfaceId = 'grass'|'soil'|'rock'|'sand'|'snow'|'lava';
export type HeightMode = 'raise'|'lower'|'flatten'|'smooth';
export type WaterKind = 'ocean'|'river'|'pool'|'fall';
export type TerrainModuleEdit={cx:number;cz:number;offset:number;blend:number};
export type GrassDistributionMode='natural'|'painted';
export type BrushBase = {x:number;z:number;radius:number;strength:number;module?:{cx:number;cz:number}};
export type HeightStroke = BrushBase & {mode:HeightMode;targetHeight?:number};
export type SurfaceStroke = BrushBase & {material:SurfaceId};
export type GrassStroke = BrushBase & {density:number};
export type CustomModel = {id:string;path:string;referenceScale:number};
export type PlacedAsset = {
  id:string;assetId:string;x:number;z:number;yOffset:number;
  yaw:number;scale:number;partIndex?:number;collisionRadius?:number;
};
export type WaterPlacement = {
  id:string;profile:WaterKind;name:string;x:number;y:number;z:number;
  width:number;length:number;rotation:number;
  /** River path is in absolute world X,Z coordinates. */
  points?:[number,number][];
  /** Four cubic Bezier anchors in absolute XYZ: lip, tangent A/B, impact. */
  fallControls?:[number,number,number][];
  /** Waterfall width at the impact (metres), independent of the lip width. */
  fallWidthEnd?:number;
  /** Vincula esta cascada con los dos tramos de río nativos; sin simulación de fluidos. */
  joinToLegacyRiver?:boolean;
  rockEnabled?:boolean;rockX?:number;rockY?:number;rockRadius?:number;
  /** Shader uniform overrides; source defaults come from WATER_PROFILES. */
  params?:Record<string,number|string>;
};
export type WaterPresetOverride = {vertex?:string;fragment?:string;params?:Record<string,number|string>};
export type WorldEditDocument = {
  version:1;
  waterPresets:Partial<Record<WaterKind,WaterPresetOverride>>;
  height:HeightStroke[];
  modules:TerrainModuleEdit[];
  grassMode:GrassDistributionMode;
  grassWind:number;
  surfaces:SurfaceStroke[];
  grass:GrassStroke[];
  grassBakes:GrassBakeRecord[];
  assets:PlacedAsset[];
  models:CustomModel[];
  water:WaterPlacement[];
};

export function emptyWorldDocument():WorldEditDocument {
  return {version:1,height:[],modules:[],grassMode:'painted',grassWind:0,surfaces:[],grass:[],grassBakes:[],assets:[],models:[],water:[],waterPresets:{}};
}
export const TERRAIN_MODULE_SIZE=72;
const CHUNK=TERRAIN_MODULE_SIZE;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const finite=(v:unknown,fallback=0)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
const surfaceIds:readonly SurfaceId[]=['grass','soil','rock','sand','snow','lava'];
const heightModes:readonly HeightMode[]=['raise','lower','flatten','smooth'];
const waterKinds:readonly WaterKind[]=['ocean','river','pool','fall'];
function normalizeBrush(x:BrushBase):BrushBase {
  return {x:clamp(finite(x.x),-20000,20000),z:clamp(finite(x.z),-20000,20000),
    radius:clamp(finite(x.radius,15),1,250),strength:clamp(finite(x.strength,.5),0,1),
    ...(x.module&&Number.isInteger(x.module.cx)&&Number.isInteger(x.module.cz)&&
      Math.abs(x.module.cx)<400&&Math.abs(x.module.cz)<400
      ?{module:{cx:x.module.cx,cz:x.module.cz}}:{})};
}
function validId(v:unknown):string {return typeof v==='string'&&v.length>0&&v.length<=120?v:'';}

/** Defensive validation: an imported world file is project data, never executable code. */
export function parseWorldDocument(data:unknown):WorldEditDocument {
  if(!data||typeof data!=='object'||(data as {version?:unknown}).version!==1)
    throw new Error('Formato de mundo incompatible: se esperaba version 1');
  const raw=data as Record<string,unknown>;
  const items=(key:string):Record<string,unknown>[]=>
    Array.isArray(raw[key])?raw[key].slice(0,50000).filter((v):v is Record<string,unknown>=>
      v!==null&&typeof v==='object'&&!Array.isArray(v)):[];
  const rawPresets=raw.waterPresets&&typeof raw.waterPresets==='object'&&!Array.isArray(raw.waterPresets)
    ?raw.waterPresets as Record<string,unknown>:{};
  const waterPresets:WorldEditDocument['waterPresets']={};
  for(const kind of waterKinds){
    const value=rawPresets[kind];
    if(!value||typeof value!=='object'||Array.isArray(value))continue;
    const p=value as Record<string,unknown>;
    const source=(name:string)=>typeof p[name]==='string'&&p[name].length<50000?p[name] as string:undefined;
    const params=p.params&&typeof p.params==='object'&&!Array.isArray(p.params)
      ?Object.fromEntries(Object.entries(p.params).filter(([k,v])=>/^u[A-Za-z0-9]+$/.test(k)&&
        (typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)))):{};
    waterPresets[kind]={vertex:source('vertex'),fragment:source('fragment'),params};
  }
  return {
    version:1,
    waterPresets,
    grassMode:raw.grassMode==='natural'?'natural':'painted',
    grassWind:clamp(finite(raw.grassWind,0),0,1),
    modules:items('modules').slice(0,4096).filter(v=>Number.isInteger(v.cx)&&Number.isInteger(v.cz)&&
      Math.abs(v.cx as number)<400&&Math.abs(v.cz as number)<400).map(v=>({
      cx:v.cx as number,cz:v.cz as number,
      offset:clamp(finite(v.offset),-250,250),blend:clamp(finite(v.blend,8),2,30)
    })),
    height:items('height').filter(v=>heightModes.includes(v.mode as HeightMode)).map(v=>({
      ...normalizeBrush(v as BrushBase),mode:v.mode as HeightMode,
      targetHeight:finite(v.targetHeight)
    })),
    surfaces:items('surfaces').filter(v=>surfaceIds.includes(v.material as SurfaceId)).map(v=>({
      ...normalizeBrush(v as BrushBase),material:v.material as SurfaceId
    })),
    grass:items('grass').map(v=>({...normalizeBrush(v as BrushBase),density:clamp(finite(v.density,1),0,3)})),
    grassBakes:items('grassBakes').slice(0,4096).filter(v=>
      Number.isInteger(v.px)&&Number.isInteger(v.pz)&&
      Math.abs(v.px as number)<2000&&Math.abs(v.pz as number)<2000&&
      Array.isArray(v.placements)&&v.placements.length<=2000&&
      v.placements.length%10===0&&v.placements.every((n:unknown)=>
        typeof n==='number'&&Number.isFinite(n)))
      .map(v=>({px:v.px as number,pz:v.pz as number,
        placements:Array.from(v.placements as number[])})),
    models:items('models').filter(v=>validId(v.id)&&typeof v.path==='string'&&
      /^\/assets\/[A-Za-z0-9_./-]+\.glb$/i.test(v.path)&&!v.path.includes('..')).map(v=>({
        id:v.id as string,path:v.path as string,referenceScale:clamp(finite(v.referenceScale,1),.01,100)
      })),
    assets:items('assets').filter(v=>validId(v.id)&&validId(v.assetId)).map(v=>({
      id:v.id as string,assetId:v.assetId as string,
      x:clamp(finite(v.x),-20000,20000),z:clamp(finite(v.z),-20000,20000),
      yOffset:clamp(finite(v.yOffset),-500,500),
      yaw:finite(v.yaw),scale:clamp(finite(v.scale,1),.01,100),
      ...(typeof v.partIndex==='number'?{partIndex:Math.max(0,Math.floor(v.partIndex))}:{}),
      ...(typeof v.collisionRadius==='number'?{collisionRadius:clamp(v.collisionRadius,0,100)}:{})
    })),
    water:items('water').filter(v=>validId(v.id)&&waterKinds.includes(v.profile as WaterKind)).map(v=>({
      id:v.id as string,profile:v.profile as WaterKind,
      name:typeof v.name==='string'?v.name.slice(0,120):v.profile as string,
      x:clamp(finite(v.x),-20000,20000),y:clamp(finite(v.y),-500,1500),
      z:clamp(finite(v.z),-20000,20000),width:clamp(finite(v.width,25),1,2000),
      length:clamp(finite(v.length,45),1,5000),rotation:finite(v.rotation),
      ...(Array.isArray(v.points)?{points:v.points.slice(0,128).filter(p=>Array.isArray(p)&&p.length===2)
        .map(p=>[finite(p[0]),finite(p[1])] as [number,number])}:{}),
      ...(Array.isArray(v.fallControls)&&v.fallControls.length===4&&
        v.fallControls.every(p=>Array.isArray(p)&&p.length===3&&p.every(q=>
          typeof q==='number'&&Number.isFinite(q)))
        ?{fallControls:v.fallControls.map(p=>[
          clamp(p[0],-20000,20000),clamp(p[1],-500,1500),clamp(p[2],-20000,20000)
        ] as [number,number,number])}:{}),
      ...(typeof v.fallWidthEnd==='number'&&Number.isFinite(v.fallWidthEnd)
        ?{fallWidthEnd:clamp(v.fallWidthEnd,.2,2000)}:{}),
      ...(v.joinToLegacyRiver===true?{joinToLegacyRiver:true}:{}),
      rockEnabled:v.rockEnabled===true,
      ...(typeof v.rockX==='number'&&Number.isFinite(v.rockX)?{rockX:v.rockX}:{}),
      ...(typeof v.rockY==='number'&&Number.isFinite(v.rockY)?{rockY:v.rockY}:{}),
      ...(typeof v.rockRadius==='number'&&Number.isFinite(v.rockRadius)
        ?{rockRadius:clamp(v.rockRadius,.1,100)}:{}),
      params:Object.fromEntries(Object.entries(
        v.params&&typeof v.params==='object'&&!Array.isArray(v.params)?v.params:{}
      ).filter(([k,val])=>/^u[A-Za-z0-9]+$/.test(k)&&
        ((typeof val==='number'&&Number.isFinite(val))||(typeof val==='string'&&/^#[0-9a-fA-F]{6}$/.test(val))))
        .slice(0,120)) as Record<string,number|string>
    }))
  };
}

let documentState:WorldEditDocument=emptyWorldDocument();
// A module changes the underlying sampled heightfield, never an isolated mesh.
const moduleByKey=new Map<string,TerrainModuleEdit>();
function rebuildModuleIndex():void{
  moduleByKey.clear();
  for(const m of documentState.modules)moduleByKey.set(`${m.cx}:${m.cz}`,m);
}
export function terrainModuleAt(cx:number,cz:number):TerrainModuleEdit|undefined{
  return moduleByKey.get(`${cx}:${cz}`);
}
export function setTerrainModule(cx:number,cz:number,offset:number,blend=8):void{
  invalidateGrassBakesNear((cx+.5)*TERRAIN_MODULE_SIZE,
    (cz+.5)*TERRAIN_MODULE_SIZE,TERRAIN_MODULE_SIZE*.86);
  if(!Number.isInteger(cx)||!Number.isInteger(cz)||Math.abs(cx)>=400||Math.abs(cz)>=400)
    throw new Error('Coordenadas de sector fuera de rango');
  const key=`${cx}:${cz}`;
  const old=moduleByKey.get(key);
  if(old){documentState.modules=documentState.modules.filter(m=>!(m.cx===cx&&m.cz===cz));
    moduleByKey.delete(key);}
  if(Math.abs(offset)>.00001){
    const next={cx,cz,offset:clamp(offset,-250,250),blend:clamp(blend,2,30)};
    documentState.modules.push(next);moduleByKey.set(key,next);
  }
}
function smoothModuleEdge(a:number,b:number,v:number):number{
  const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);
}
/** Overlapping partition of unity on a common 72 m coordinate grid. */
export function moduleHeightOffsetAt(x:number,z:number):number{
  if(moduleByKey.size===0)return 0;
  const bx=Math.floor(x/CHUNK),bz=Math.floor(z/CHUNK);
  let sum=0;
  for(let cz=bz-1;cz<=bz+1;cz++)for(let cx=bx-1;cx<=bx+1;cx++){
    const m=moduleByKey.get(`${cx}:${cz}`);if(!m)continue;
    const dx=Math.abs(x-(cx+.5)*CHUNK),dz=Math.abs(z-(cz+.5)*CHUNK);
    const half=CHUNK*.5,blend=m.blend;
    const wx=1-smoothModuleEdge(half-blend,half+blend,dx);
    const wz=1-smoothModuleEdge(half-blend,half+blend,dz);
    sum+=m.offset*wx*wz;
  }
  return sum;
}
// AURALIA_MODULES_GRASS_V6
// Grass Bake v1.0: immutable positions per world-space 12 m patch.
export type GrassBakeRecord={px:number;pz:number;placements:number[]};
const grassBakeIndex=new Map<string,GrassBakeRecord>();
function rebuildGrassBakeIndex():void{
  grassBakeIndex.clear();
  for(const item of documentState.grassBakes)
    grassBakeIndex.set(`${item.px}:${item.pz}`,item);
}
/** The undefined/[] distinction matters: an empty patch is also permanently baked. */
export function readGrassBake(px:number,pz:number):readonly number[]|undefined{
  return grassBakeIndex.get(`${px}:${pz}`)?.placements;
}
export function saveGrassBake(px:number,pz:number,placements:readonly number[]):void{
  if(!Number.isInteger(px)||!Number.isInteger(pz)||placements.length>2000||
     placements.length%10!==0||!placements.every(Number.isFinite))return;
  const key=`${px}:${pz}`;
  const old=grassBakeIndex.get(key);
  if(old){old.placements=Array.from(placements);return;}
  const record={px,pz,placements:Array.from(placements)};
  documentState.grassBakes.push(record);grassBakeIndex.set(key,record);
}
/** Called only after an edit; NEVER from the render loop. */
export function invalidateGrassBakesNear(x:number,z:number,radius:number):void{
  if(grassBakeIndex.size===0)return;
  const r=Math.max(0,radius)+12;
  const keys=new Set<string>();
  for(const [key,item] of grassBakeIndex){
    if(Math.abs((item.px+.5)*12-x)<=r&&Math.abs((item.pz+.5)*12-z)<=r)
      keys.add(key);
  }
  if(keys.size===0)return;
  documentState.grassBakes=documentState.grassBakes.filter(b=>
    !keys.has(`${b.px}:${b.pz}`));
  for(const key of keys)grassBakeIndex.delete(key);
}
export function invalidateAllGrassBakes():void{
  documentState.grassBakes=[];grassBakeIndex.clear();
}
// AURALIA_GRASS_BAKE_V10

const indices={height:new Map<string,HeightStroke[]>(),surfaces:new Map<string,SurfaceStroke[]>(),
  grass:new Map<string,GrassStroke[]>()};
function index<T extends BrushBase>(strokes:readonly T[],target:Map<string,T[]>):void {
  target.clear();
  for(const stroke of strokes){
    const minX=Math.floor((stroke.x-stroke.radius)/CHUNK),maxX=Math.floor((stroke.x+stroke.radius)/CHUNK);
    const minZ=Math.floor((stroke.z-stroke.radius)/CHUNK),maxZ=Math.floor((stroke.z+stroke.radius)/CHUNK);
    for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++){
      const key=`${cx}:${cz}`;
      const bucket=target.get(key);
      if(bucket)bucket.push(stroke);else target.set(key,[stroke]);
    }
  }
}
function rebuild():void{
  rebuildGrassBakeIndex();
  rebuildModuleIndex();
  index(documentState.height,indices.height);
  index(documentState.surfaces,indices.surfaces);
  index(documentState.grass,indices.grass);
}
export function getWorldDocument():WorldEditDocument{return documentState;}
export function setWorldDocument(doc:unknown):void {
  documentState=parseWorldDocument(doc);
  rebuild();
}
function addIndexed<T extends BrushBase>(stroke:T,array:T[],target:Map<string,T[]>):void{
  array.push(stroke);
  const minX=Math.floor((stroke.x-stroke.radius)/CHUNK),maxX=Math.floor((stroke.x+stroke.radius)/CHUNK);
  const minZ=Math.floor((stroke.z-stroke.radius)/CHUNK),maxZ=Math.floor((stroke.z+stroke.radius)/CHUNK);
  for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++){
    const key=`${cx}:${cz}`;const bucket=target.get(key);
    if(bucket)bucket.push(stroke);else target.set(key,[stroke]);
  }
}
export function appendHeightStroke(stroke:HeightStroke):void {
  addIndexed(stroke,documentState.height,indices.height);
  invalidateGrassBakesNear(stroke.x,stroke.z,stroke.radius);
}
export function appendSurfaceStroke(stroke:SurfaceStroke):void {
  addIndexed(stroke,documentState.surfaces,indices.surfaces);
  invalidateGrassBakesNear(stroke.x,stroke.z,stroke.radius);
}
export function appendGrassStroke(stroke:GrassStroke):void {
  addIndexed(stroke,documentState.grass,indices.grass);
  invalidateGrassBakesNear(stroke.x,stroke.z,stroke.radius);
}
const sampleStrokes=<T extends BrushBase>(target:Map<string,T[]>,x:number,z:number)=>
  target.get(`${Math.floor(x/CHUNK)}:${Math.floor(z/CHUNK)}`)??[];
function influence(stroke:BrushBase,x:number,z:number):number{
  const dist=Math.hypot(x-stroke.x,z-stroke.z);
  if(dist>=stroke.radius)return 0;
  const t=1-dist/stroke.radius;
  let weight=t*t*(3-2*t)*stroke.strength;
  if(stroke.module){
    const cx=stroke.module.cx,cz=stroke.module.cz;
    const lx=x-cx*CHUNK,lz=z-cz*CHUNK;
    if(lx<=0||lz<=0||lx>=CHUNK||lz>=CHUNK)return 0;
    // The brush falls to zero at a locked sector boundary: no tears.
    const edge=3;
    weight*=smoothModuleEdge(0,edge,lx)*smoothModuleEdge(0,edge,CHUNK-lx)*
      smoothModuleEdge(0,edge,lz)*smoothModuleEdge(0,edge,CHUNK-lz);
  }
  return weight;
}
export function applyHeightEdits(x:number,z:number,base:number):number {
  let result=base;
  for(const stroke of sampleStrokes(indices.height,x,z)){
    const t=influence(stroke,x,z);
    if(!t)continue;
    if(stroke.mode==='raise')result+=t*2.5;
    else if(stroke.mode==='lower')result-=t*2.5;
    else result+=(finite(stroke.targetHeight,base)-result)*t;
  }
  return result+moduleHeightOffsetAt(x,z);
}
export function surfaceWeightsAt(x:number,z:number,
  base:readonly number[]):[number,number,number,number,number,number] {
  let w=[base[0]??0,base[1]??0,base[2]??0,base[3]??0,0,0];
  for(const stroke of sampleStrokes(indices.surfaces,x,z)){
    const t=influence(stroke,x,z);
    if(!t)continue;
    const chosen=surfaceIds.indexOf(stroke.material);
    for(let i=0;i<6;i++)w[i]=w[i]*(1-t)+(i===chosen?t:0);
  }
  const sum=Math.max(.00001,w.reduce((a,b)=>a+b,0));
  w=w.map(v=>v/sum);
  return [w[0],w[1],w[2],w[3],w[4],w[5]];
}
export function grassDensityAt(x:number,z:number):number {
  let density=documentState.grassMode==='painted'?0:1;
  for(const stroke of sampleStrokes(indices.grass,x,z)){
    const t=influence(stroke,x,z);
    if(t)density+=(stroke.density-density)*t;
  }
  return clamp(density,0,3);
}
/** Gameplay obstruction is coarse; precise climbable collision is a later feature. */
export function blocksAuthoredMovement(x:number,z:number):boolean{
  for(const asset of documentState.assets){
    const radius=asset.collisionRadius??0;
    if(radius>0&&Math.hypot(x-asset.x,z-asset.z)<radius*asset.scale)return true;
  }
  return false;
}

/** Authored asset exclusions shared by saved grass, vegetation and rocks. */
export function authoredAssetExclusions():{x:number;z:number;radius:number}[]{
  return documentState.assets.filter(p=>(p.collisionRadius??0)>0)
    .map(p=>({x:p.x,z:p.z,radius:(p.collisionRadius??0)*p.scale}));
}

// AURALIA_GRASS_STABILITY_V7: viento fijo por defecto; 0=sin desplazamiento.

// AURALIA_GRASS_WORLD_LOCK_V9: el modo por defecto respeta exclusivamente las zonas pintadas.

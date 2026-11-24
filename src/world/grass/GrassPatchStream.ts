import {Color3,Material,Mesh,PBRMaterial,Scene,Texture,TransformNode,VertexData} from '@babylonjs/core';
import type {ActiveWorldGeography} from '../geography/ActiveGeography';
import type {VegetationExclusion} from '../vegetationData';
import {getAuraliaWind} from '../AuraliaWindSystem';
import {generateGrassPatchSteps,GRASS_PATCH,GRASS_VARIANTS,type GrassPlacement,type GrassVariant} from './GrassPatchData';
import {GrassWindPlugin} from './GrassWindPlugin';
import {GrassDistancePlugin} from './GrassDistancePlugin';
import {makeGrassClump} from './GrassClumpGeometry';
import {updateInstanceBuffer} from '../DynamicInstanceBuffers';
import {GrassPatchCache} from './GrassPatchCache';

/** Geographic streaming backend of GrassSectorSystem. Source GLBs are shared with it. */
export class GrassPatchStream{
 readonly focus={x:0,z:0,companionX:0,companionZ:0,companionRadius:0};
 private readonly patches=new Map<string,GrassPlacement[]>();
 private readonly cache=new GrassPatchCache();
 private readonly patchDetails=new Map<string,boolean>();
 private readonly patchExclusions=new Map<string,readonly VegetationExclusion[]>();
 private readonly sprites=new Map<GrassVariant,Mesh>();
 private readonly texture:Texture;
 private queue:{key:string;px:number;pz:number;distance:number;detail:boolean}[]=[];
 private building:{key:string;px:number;pz:number;detail:boolean;iterator:Generator<void,GrassPlacement[],void>;ms:number}|null=null;
 private selectionX=Infinity;
 private selectionZ=Infinity;
 private active=false;
 private dirty=true;
 private refreshWork:Generator<void,void,void>|null=null;
 private refreshWorkMs=0;
 private nearCount=0;
 private spriteCount=0;
 private triangles=0;
 private draws=0;
 private bufferBytes=0;
 private generated=0;
 private generationTotalMs=0;
 private maxPatchMs=0;
 private refreshMaxMs=0;
 constructor(scene:Scene,parent:TransformNode,
  private readonly sources:ReadonlyMap<GrassVariant,Mesh>,private readonly world:ActiveWorldGeography,
  private readonly exclusions:()=>readonly VegetationExclusion[]){
  this.texture=new Texture('/assets/grass/grass-sprites.png',scene,false,true,Texture.TRILINEAR_SAMPLINGMODE);
  this.texture.hasAlpha=true;this.texture.wrapU=this.texture.wrapV=Texture.CLAMP_ADDRESSMODE;
  // Match the near GLB's linear-light PBR pipeline, including dusk/night lighting.
  // StandardMaterial multiplied the baked sRGB albedo by light in a different space.
  const material=new PBRMaterial('grass-sprite-cutout',scene);
  material.albedoTexture=this.texture;material.useAlphaFromAlbedoTexture=true;
  material.transparencyMode=Material.MATERIAL_ALPHATEST;material.alphaCutOff=.4;
  material.backFaceCulling=false;material.twoSidedLighting=false;
  material.metallic=0;material.roughness=.95;
  material.albedoColor=new Color3(.8,.82,.6);
  new GrassWindPlugin(material,getAuraliaWind(scene));new GrassDistancePlugin(material,this.focus,true);
  const materials=new Set<Material>();
  for(const mesh of sources.values()){
   makeGrassClump(mesh);
   if(mesh.material&&!materials.has(mesh.material)){
    if(mesh.material instanceof PBRMaterial)mesh.material.albedoColor.multiplyInPlace(new Color3(.8,.82,.6));
    new GrassDistancePlugin(mesh.material,this.focus,false);materials.add(mesh.material);
   }
  }
  for(const [index,variant] of GRASS_VARIANTS.entries()){
   const mesh=new Mesh('grass-sprite-'+variant,scene),data=new VertexData();
   const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
   // Two fixed planes preserve a silhouette from either direction; no per-frame billboarding.
   for(let plane=0;plane<2;plane++){
    const start=plane*4;
    for(const [side,y] of [[-.6,0],[.6,0],[.6,1.2],[-.6,1.2]]){
     positions.push(plane===0?side:0,y,plane===1?side:0);normals.push(0,1,0);
     uvs.push((index+(side<0?.002:.998))/4,y===0?.002:.998);
    }
    indices.push(start,start+1,start+2,start,start+2,start+3);
   }
   data.positions=positions;data.normals=normals;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh);
   mesh.material=material;mesh.parent=parent;mesh.isVisible=false;mesh.isPickable=false;mesh.checkCollisions=false;
   mesh.metadata={grassSprite:variant};this.sprites.set(variant,mesh);
  }
 }
 get pendingCount(){return this.queue.length+(this.building?1:0)+(this.active&&(this.refreshWork||this.dirty)?1:0);}
 get instanceCount(){return this.nearCount+this.spriteCount;}
 get triangleCount(){return this.triangles;}
 get drawCallsEstimate(){return this.draws;}
 get activeSectorCount(){return this.patches.size;}
 get metrics(){return {near:this.nearCount,sprites:this.spriteCount,residentPatches:this.patches.size,
  residentPlacements:[...this.patches.values()].reduce((n,p)=>n+p.length,0),bufferBytes:this.bufferBytes,
  atlasBytes:Math.ceil(1024*256*4*4/3),generatedPatches:this.generated,generationTotalMs:this.generationTotalMs,maxPatchMs:this.maxPatchMs,
  refreshMaxMs:this.refreshMaxMs,pending:this.pendingCount,cacheHits:this.cache.hits,
  cachedPatches:this.cache.size,cachedPlacements:this.cache.placementCount,cacheEvictions:this.cache.evictions};}
 setFocus(x:number,z:number){
  this.focus.x=x;this.focus.z=z;this.active=true;
  if(Math.hypot(x-this.selectionX,z-this.selectionZ)<GRASS_PATCH.refreshDistance)return;
  this.selectionX=x;this.selectionZ=z;this.select();
 }
 private patchDistance(px:number,pz:number):number{
  const size=GRASS_PATCH.size;
  return Math.hypot(Math.max(Math.abs((px+.5)*size-this.focus.x)-size/2,0),
   Math.max(Math.abs((pz+.5)*size-this.focus.z)-size/2,0));
 }
 private select(){
  const {size,farEnd,prefetch,detailEnd,nearEnd}=GRASS_PATCH,reach=Math.ceil((farEnd+prefetch)/size);
  const cx=Math.floor(this.focus.x/size),cz=Math.floor(this.focus.z/size),wanted=new Set<string>();
  this.queue=[];
  for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++){
   const px=cx+dx,pz=cz+dz;
   const distance=this.patchDistance(px,pz);
   if(distance>farEnd+prefetch)continue;
   const key=px+':'+pz;wanted.add(key);
   if(!this.patches.has(key)){
    const cached=this.cache.take(key);
    if(cached){this.patches.set(key,cached.placements);this.patchDetails.set(key,cached.detail);}
   }
   if(!this.patches.has(key))this.queue.push({key,px,pz,distance,detail:distance<nearEnd});
   else if(!this.patchDetails.get(key)&&distance<detailEnd+prefetch)this.queue.push({key,px,pz,distance,detail:true});
  }
  for(const [key,patch] of this.patches)if(!wanted.has(key)){
   this.cache.put(key,patch,this.patchDetails.get(key)??false);
   this.patches.delete(key);this.patchDetails.delete(key);this.patchExclusions.delete(key);
  }
  if(this.building&&!wanted.has(this.building.key))this.building=null;
  if(this.building)this.queue=this.queue.filter(p=>p.key!==this.building!.key);
  // Establish the distant silhouette before filling in the denser middle ring.
  const priority=(p:typeof this.queue[number])=>p.distance+(p.detail&&p.distance>=nearEnd?farEnd+prefetch:0);
  this.queue.sort((a,b)=>priority(a)-priority(b));this.dirty=true;
 }
 update(budgetMs:number=GRASS_PATCH.budgetMs){
  if(!this.active)return;
  const deadline=performance.now()+Math.max(0,budgetMs);let built=0;
  if(this.refreshWork){this.advanceRefresh(deadline);return;}
  while((this.queue.length||this.building)&&performance.now()<deadline){
   if(!this.building){const s=GRASS_PATCH.size;
   // Never request sectors just for grass and never cache an unready sector as empty.
   const index=this.queue.findIndex(p=>this.world.source.isReady([p.px*s-6,p.pz*s-6,(p.px+1)*s+6,(p.pz+1)*s+6]));
   if(index<0)break;
    const next=this.queue.splice(index,1)[0];
    this.building={...next,iterator:generateGrassPatchSteps(next.px,next.pz,this.world,next.detail),ms:0};
   }
   const before=performance.now(),step=this.building.iterator.next(),elapsed=performance.now()-before;
   this.building.ms+=elapsed;this.generationTotalMs+=elapsed;
   if(step.done){
    const {key,px,pz,detail,ms}=this.building;
    this.patches.set(key,step.value);this.patchDetails.set(key,detail);
    this.maxPatchMs=Math.max(this.maxPatchMs,ms);this.building=null;this.generated++;
    const distance=this.patchDistance(px,pz);
    if(distance<GRASS_PATCH.farEnd+GRASS_PATCH.size)built++;
    if(!detail&&distance<GRASS_PATCH.detailEnd+GRASS_PATCH.prefetch)
     this.queue.push({key,px,pz,distance,detail:true});
   }
  }
  if(built)this.dirty=true;
  if(this.dirty){this.refreshWork=this.buildRefresh();this.refreshWorkMs=0;this.advanceRefresh(deadline);}
 }
 refreshExclusions(){this.refreshWork=null;this.patchExclusions.clear();this.dirty=true;}
 refreshTerrain(){this.refreshWork=null;this.cache.clear();this.patches.clear();this.patchDetails.clear();this.patchExclusions.clear();this.queue=[];this.building=null;this.dirty=true;if(this.active)this.select();}
 deactivate(){
  for(const [key,patch] of this.patches)this.cache.put(key,patch,this.patchDetails.get(key)??false);
  this.active=false;this.patches.clear();this.patchDetails.clear();this.patchExclusions.clear();this.queue=[];this.building=null;this.selectionX=this.selectionZ=Infinity;
  this.refresh();
 }
 private refresh(){
  this.refreshWork=null;
  const before=performance.now();for(const _ of this.buildRefresh()){}
  this.refreshMaxMs=Math.max(this.refreshMaxMs,performance.now()-before);
 }
 private advanceRefresh(deadline:number){
  const before=performance.now();
  while(this.refreshWork&&performance.now()<deadline){
   if(this.refreshWork.next().done)this.refreshWork=null;
  }
  this.refreshWorkMs+=performance.now()-before;
  if(!this.refreshWork)this.refreshMaxMs=Math.max(this.refreshMaxMs,this.refreshWorkMs);
 }
 private *buildRefresh():Generator<void,void,void>{
  this.dirty=false;
  const focus={...this.focus};let nearCount=0,spriteCount=0,triangles=0,draws=0,bufferBytes=0,visited=0;
  const lists=new Map<GrassVariant,{near:GrassPlacement[];far:GrassPlacement[]}>();
  for(const v of GRASS_VARIANTS)lists.set(v,{near:[],far:[]});
  let obstacles:readonly VegetationExclusion[]|undefined;
  const {size,refreshDistance}=GRASS_PATCH;
  const ordered=[...this.patches].map(([key,patch])=>{
   const [px,pz]=key.split(':').map(Number);
   return {key,patch,distance:((px+.5)*size-focus.x)**2+((pz+.5)*size-focus.z)**2};
  }).sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key));
  yield;
  if(this.active)for(const {key,patch} of ordered){
   const [px,pz]=key.split(':').map(Number),minX=px*size,minZ=pz*size;
   let local=this.patchExclusions.get(key);
   if(!local){
    obstacles??=this.exclusions();
    local=obstacles.filter(a=>Math.hypot(Math.max(minX-a.x,0,a.x-minX-size),Math.max(minZ-a.z,0,a.z-minZ-size))<a.radius+.5);
    this.patchExclusions.set(key,local);
   }
   for(const p of patch){
    if(visited++%128===0)yield;
    if(local.some(a=>(p.x-a.x)**2+(p.z-a.z)**2<(a.radius+.5)**2))continue;
    const d=Math.hypot(p.x-focus.x,p.z-focus.z),list=lists.get(p.variant)!;
    if(d<GRASS_PATCH.nearEnd+refreshDistance&&nearCount<GRASS_PATCH.maxNear){list.near.push(p);nearCount++;}
    const end=p.distant?GRASS_PATCH.farEnd:GRASS_PATCH.detailEnd;
    if(d>GRASS_PATCH.nearStart-refreshDistance&&d<end+refreshDistance&&spriteCount<GRASS_PATCH.maxSprites){list.far.push(p);spriteCount++;}
   }
  }
  for(const [variant,list] of lists){
   // Prepare both LODs before replacing either, so a plant cannot briefly
   // disappear or draw twice while crossing from a tuft to its sprite.
   const uploads:{mesh:Mesh;matrices:Float32Array;count:number}[]=[];
   for(const [mesh,placements] of [[this.sources.get(variant)!,list.near],[this.sprites.get(variant)!,list.far]] as const){
    const matrices=new Float32Array(placements.length*16);
    for(let i=0;i<placements.length;i++){if(i%256===0)yield;matrices.set(placements[i].matrix,i*16);}
    uploads.push({mesh,matrices,count:placements.length});
   }
   yield;
   for(const {mesh,matrices,count} of uploads){
    bufferBytes+=updateInstanceBuffer(mesh,'matrix',matrices,16);mesh.isVisible=count>0;
    if(count)draws++;triangles+=mesh.getTotalIndices()/3*count;
   }
  }
  this.nearCount=nearCount;this.spriteCount=spriteCount;this.triangles=triangles;this.draws=draws;this.bufferBytes=bufferBytes;
 }
 dispose(){this.deactivate();this.cache.clear();const material=this.sprites.values().next().value?.material;for(const mesh of this.sprites.values())mesh.dispose(false,false);material?.dispose();this.texture.dispose();this.sprites.clear();}
}

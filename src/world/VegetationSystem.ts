import { ImportMeshAsync, Matrix, Mesh, MultiMaterial, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {Texture} from '@babylonjs/core';
import { chunkKey, chunkOf, desiredChunks, hash01, MAINLAND } from './terrainData';
import { VEGETATION_CONFIG, vegetationForChunk, type VegetationExclusion, type VegetationKind, type VegetationPlacement } from './vegetationData';
import { ASSET_CATALOG, BRISALIA_PLANT_ASSETS, DECORATIVE_TREE_ASSETS, HARVESTABLE_TREE_ASSETS, TREE_LOD_PATHS } from './assetCatalog';
import { TreeColliderSystem, type TreeSurface, type TreeWallHit } from './TreeColliderSystem';
import { configureFoliageV4Material, configureVegetationMaterial } from './LandscapeAtmosphere';
import { AuraliaFoliageWind } from './AuraliaFoliageWind';
import { WORLD_FOREST, forestFrontRows, worldForestEnabled } from './geography/WorldForest';
import { activeGeography } from './geography/ActiveGeography';
import { createTreeSprite, treeSpriteView } from './TreeSprite';

type Cell = { cx:number; cz:number };
const kinds:readonly VegetationKind[]=['arbolito1','arbolito2','arbolito3','plantitas1','arbolitoSeco','tronco1',...BRISALIA_PLANT_ASSETS];
type BrisaliaPlantKind=typeof BRISALIA_PLANT_ASSETS[number];
const brisaliaPlantKinds=new Set<VegetationKind>(BRISALIA_PLANT_ASSETS);
const isBrisaliaPlant=(kind:VegetationKind):kind is BrisaliaPlantKind=>brisaliaPlantKinds.has(kind);
/** Distance bands suit the supplied one-metre plants; hysteresis prevents LOD flicker. */
export function brisaliaPlantLod(kind:BrisaliaPlantKind,distance:number,previous:0|1|2=0):0|1|2{
  const shrub=kind==='brisaliaMatorral';
  const nearIn=shrub?8:10,nearOut=shrub?10:12;
  const farIn=shrub?24:31,farOut=shrub?28:36;
  if(previous===0)return distance>farOut?2:distance>nearOut?1:0;
  if(previous===1)return distance<nearIn?0:distance>farOut?2:1;
  return distance<nearIn?0:distance<farIn?1:2;
}

/** Owns shared GLB meshes and thin-instance buffers; the terrain only supplies active cells. */
export class VegetationSystem {
  private readonly sources=new Map<VegetationKind,Mesh>();
  private readonly farSources=new Map<VegetationKind,Mesh>();
  private readonly lowSources=new Map<BrisaliaPlantKind,Mesh>();
  private readonly canopySources=new Map<VegetationKind,Mesh>();
  private readonly placementMatrices=new WeakMap<VegetationPlacement,Float32Array>();
  private readonly plantLods=new WeakMap<VegetationPlacement,0|1|2>();
  private readonly templates=new Map<string,Mesh>();
  private readonly chunks=new Map<string,VegetationPlacement[]>();
  private pending:Cell[]=[];
  private center:Cell={cx:0,cz:0};
  private ready=false;
  private disposed=false;
  private visibleCount=0;
  private visibleFarCount=0;
  private visibleCanopyCount=0;
  private frontTreeCount=0;
  private viewDirection={x:0,z:1};
  private spriteTexture:Texture|null=null;
  private initialized=false;
  private bufferBuildMs=0;
  private placementMs=0;
  private farBatch=0;
  private visualFocus={x:0,z:0};
  private lastBufferFocus={x:Infinity,z:Infinity};
  private readonly treeColliders:TreeColliderSystem;
  private readonly foliageWind:AuraliaFoliageWind;

  get activeChunkCount():number{return this.chunks.size;}
  get instanceCount():number{return this.visibleCount;}
  get farInstanceCount():number{return this.visibleFarCount;}
  get canopyInstanceCount():number{return this.visibleCanopyCount;}
  get stats(){return {chunks:this.chunks.size,pending:this.pending.length,bufferBuildMs:this.bufferBuildMs,placementMs:this.placementMs,
    matrixBytes:this.visibleCount*64,canopyTriangles:[...this.canopySources.values()].reduce((n,m)=>n+m.getTotalIndices()/3,0),
    fullTrees:[...this.sources].filter(([kind])=>kind in DECORATIVE_TREE_ASSETS).reduce((n,[,m])=>n+m.thinInstanceCount,0),
    mediumTrees:this.visibleFarCount,canopyTrees:this.visibleCanopyCount,frontTrees:this.frontTreeCount,
    spriteTextureBytes:this.spriteTexture?Math.ceil(2048*1024*4*4/3):0};}
  get sharedMeshCount():number{return this.sources.size;}

  constructor(
    private readonly scene:Scene,
    private readonly parent:TransformNode,
    private readonly exclusions:()=>readonly VegetationExclusion[],
    private readonly importer:typeof ImportMeshAsync=ImportMeshAsync
  ){
    this.treeColliders=new TreeColliderSystem(scene,kind=>this.sources.get(kind));
    this.foliageWind=new AuraliaFoliageWind(scene);
  }

  /** Bake every GLB part, then merge while retaining its bark/leaf materials. */
  private async importSource(path:string,assetId:string,wind=true):Promise<Mesh|null>{
    const result=await this.importer(path,this.scene);
    if(this.disposed){for(const mesh of result.meshes)mesh.dispose(false,false);return null;}
    const parts=result.meshes.filter((mesh):mesh is Mesh=>
      mesh instanceof Mesh&&mesh.getTotalVertices()>0);
    if(!parts.length)throw new Error('GLB sin geometria: '+path);
    for(const mesh of parts){
      mesh.computeWorldMatrix(true);
      mesh.bakeTransformIntoVertices(mesh.getWorldMatrix().clone());
      mesh.parent=null;mesh.position.setAll(0);mesh.scaling.setAll(1);
      mesh.rotation.setAll(0);mesh.rotationQuaternion=null;
    }
    const source=parts.length===1?parts[0]:
      Mesh.MergeMeshes(parts,true,true,undefined,false,true);
    if(!source)throw new Error('No se pudieron unir las partes de '+path);
    for(const mesh of result.meshes)
      if(mesh!==source&&!mesh.isDisposed())mesh.dispose(false,false);
    source.parent=null;source.isVisible=false;source.isPickable=false;
    source.checkCollisions=false;
    source.refreshBoundingInfo(true);
    const materials=source.material instanceof MultiMaterial
      ?source.material.subMaterials:[source.material];
    for(const material of materials){
      if(assetId.startsWith('v4'))configureFoliageV4Material(material);
      else configureVegetationMaterial(material);
    }
    if(wind)this.foliageWind.register([source],assetId);
    return source;
  }

  /** Default forests use V4; the original three trees are loaded only for wood nodes. */
  async load():Promise<void>{
    await Promise.all(kinds.map(async kind=>{
      const assetId=kind in DECORATIVE_TREE_ASSETS
        ?DECORATIVE_TREE_ASSETS[kind as keyof typeof DECORATIVE_TREE_ASSETS]:kind;
      try{
        const source=await this.importSource(ASSET_CATALOG[assetId].path,assetId);
        if(!source)return;
        source.name='plantilla-'+assetId;
        this.templates.set(assetId,source);
        // Templates live outside zone roots so island instances stay enabled
        // independently of the mainland's streamed batches.
        const batch=source.clone('vegetacion-'+kind,this.parent,true);
        batch.isVisible=false;batch.isPickable=false;
        batch.metadata={decorativeVegetation:true,kind,assetId};
        this.sources.set(kind,batch);
      }catch(error){console.warn('[Auralia] No se pudo cargar '+assetId,error);}
    }));
    if(this.disposed)return;
    await Promise.all(HARVESTABLE_TREE_ASSETS.map(async assetId=>{
      try{
        const source=await this.importSource(ASSET_CATALOG[assetId].path,assetId);
        if(!source)return;
        source.name='plantilla-madera-'+assetId;
        source.metadata={harvestableTree:true,assetId};
        this.templates.set(assetId,source);
      }catch(error){console.warn('[Auralia] No se pudo cargar arbol de madera '+assetId,error);}
    }));
    if(this.disposed)return;
    await Promise.all(Object.entries(TREE_LOD_PATHS).map(async ([key,path])=>{
      const kind=key as keyof typeof DECORATIVE_TREE_ASSETS,source=this.sources.get(kind);
      if(!source||!path)return;
      try{
        const proxy=await this.importSource(path,DECORATIVE_TREE_ASSETS[kind],false);
        if(!proxy)return;
        const nearBox=source.getBoundingInfo().boundingBox;
        const farBox=proxy.getBoundingInfo().boundingBox;
        const nearSize=nearBox.maximum.subtract(nearBox.minimum);
        const farSize=farBox.maximum.subtract(farBox.minimum);
        const scale=new Vector3(nearSize.x/Math.max(.001,farSize.x),
          nearSize.y/Math.max(.001,farSize.y),nearSize.z/Math.max(.001,farSize.z));
        const offset=nearBox.minimum.subtract(farBox.minimum.multiply(scale));
        proxy.bakeTransformIntoVertices(Matrix.Compose(scale,Quaternion.Identity(),offset));
        proxy.refreshBoundingInfo(true);
        // Match by material name so near and far submeshes retain the same
        // bark/leaf shaders even if the GLB material order differs.
        if(source.material instanceof MultiMaterial&&proxy.material instanceof MultiMaterial){
          const near=source.material.subMaterials,far=proxy.material.subMaterials;
          for(const sub of proxy.subMeshes){
            const name=far[sub.materialIndex]?.name;
            const index=near.findIndex(material=>material?.name===name);
            if(index>=0)sub.materialIndex=index;
          }
        }
        proxy.material=source.material;
        proxy.parent=this.parent;
        proxy.name='vegetacion-'+kind+'-far';
        proxy.metadata={farVegetationProxy:true,kind,assetId:DECORATIVE_TREE_ASSETS[kind]};
        this.farSources.set(kind,proxy);
      }catch(error){console.warn('[Auralia] No se pudo cargar '+path,error);}
    }));
    await Promise.all(BRISALIA_PLANT_ASSETS.flatMap(kind=>([
      {path:ASSET_CATALOG[kind].lodPath,lod:1 as const},
      {path:ASSET_CATALOG[kind].lod2Path,lod:2 as const}
    ]).map(async ({path,lod})=>{
      try{
        const proxy=await this.importSource(path,kind,false);
        if(!proxy)return;
        proxy.parent=this.parent;
        proxy.name=`vegetacion-${kind}-${lod===1?'far':'low'}`;
        proxy.metadata={farVegetationProxy:true,kind,assetId:kind,lod};
        if(lod===1)this.farSources.set(kind,proxy);
        else this.lowSources.set(kind,proxy);
      }catch(error){console.warn('[Auralia] No se pudo cargar '+path,error);}
    })));
    if(this.disposed)return;
    if(worldForestEnabled())this.spriteTexture=new Texture('/assets/world/vegetation/impostors/v4-trees.png',this.scene,false,true,Texture.TRILINEAR_SAMPLINGMODE);
    if(this.spriteTexture){this.spriteTexture.hasAlpha=true;this.spriteTexture.wrapU=this.spriteTexture.wrapV=Texture.CLAMP_ADDRESSMODE;}
    if(worldForestEnabled())for(const [kind] of this.sources){
      if(!(kind in DECORATIVE_TREE_ASSETS))continue;
      const proxy=createTreeSprite(kind as keyof typeof DECORATIVE_TREE_ASSETS,this.scene,this.spriteTexture!);
      proxy.parent=this.parent;proxy.name='vegetacion-'+kind+'-canopy';
      proxy.metadata={farVegetationProxy:true,canopyProxy:true,treeSprite:true,kind};this.canopySources.set(kind,proxy);
    }
    this.ready=true;
    this.refreshBuffers();
  }

  /** Individual instances inherit their resource node's harvest/respawn visibility. */
  attachTreeVisual(root:TransformNode,variant:number,height:number,harvestable=false):string|null{
    if(this.disposed||root.isDisposed())return null;
    const ids=harvestable?HARVESTABLE_TREE_ASSETS:Object.values(DECORATIVE_TREE_ASSETS);
    const assetId=ids[Math.abs(Math.floor(variant))%ids.length];
    const source=this.templates.get(assetId);
    if(!source)return null;
    const instance=source.createInstance(root.name+'-'+assetId);
    instance.parent=root;
    instance.scaling.setAll(height/Math.max(.01,source.getBoundingInfo().boundingBox.maximum.y));
    instance.rotation.y=(variant*.61803398875%1)*Math.PI*2;
    instance.isVisible=true;instance.isPickable=false;instance.checkCollisions=false;
    instance.metadata={treeVisual:true,harvestableTree:harvestable,assetId};
    return assetId;
  }

  /** Trees can grow beyond the playable terrain ring because coarse terrain is resident. */
  setActiveChunks(_cells:readonly Cell[],x:number,z:number):void{
    const previousCenter=this.center;
    this.center=chunkOf(x,z);
    this.visualFocus={x,z};
    const forest=worldForestEnabled();
    if(this.initialized&&previousCenter.cx===this.center.cx&&previousCenter.cz===this.center.cz){
      if(this.ready&&Math.hypot(x-this.lastBufferFocus.x,z-this.lastBufferFocus.z)>(forest?12:36))this.refreshBuffers();
      return;
    }
    this.initialized=true;
    const radius=forest?WORLD_FOREST.radiusChunks:VEGETATION_CONFIG.renderRadiusChunks.trees;
    const desired=desiredChunks(x,z,radius).filter(cell=>{
      const dx=cell.cx-this.center.cx,dz=cell.cz-this.center.cz;
      return dx*dx+dz*dz<=(radius+.35)**2;
    });
    const keys=new Set(desired.map(cell=>chunkKey(cell.cx,cell.cz)));
    let changed=false;
    for(const key of this.chunks.keys())if(!keys.has(key)){
      this.chunks.delete(key);
      changed=true;
    }
    this.pending=desired.filter(cell=>!this.chunks.has(chunkKey(cell.cx,cell.cz)));
    this.pending.sort((a,b)=>{
      const da=(a.cx+.5-x/MAINLAND.chunkSize)**2+(a.cz+.5-z/MAINLAND.chunkSize)**2;
      const db=(b.cx+.5-x/MAINLAND.chunkSize)**2+(b.cz+.5-z/MAINLAND.chunkSize)**2;
      return da-db;
    });
    if(this.ready&&(changed||previousCenter.cx!==this.center.cx||previousCenter.cz!==this.center.cz||
      Math.hypot(x-this.lastBufferFocus.x,z-this.lastBufferFocus.z)>36))this.refreshBuffers();
  }

  /** Only heading changes of eight degrees trigger a front-row reassessment. */
  setViewDirection(x:number,z:number):void{
    const length=Math.hypot(x,z);if(length<.001||!worldForestEnabled())return;
    x/=length;z/=length;
    if(x*this.viewDirection.x+z*this.viewDirection.z>Math.cos(Math.PI*8/180))return;
    this.viewDirection={x,z};if(this.ready)this.refreshBuffers();
  }

  /** Up to four cheap placement cells within 2.5ms; idle frames do no uploads. */
  update():void{
    if(!this.ready||this.disposed||!this.pending.length)return;
    const forest=worldForestEnabled(),start=performance.now();let generated=0,close=false;
    do{
      const cell=this.pending[0],size=MAINLAND.chunkSize;
      if(activeGeography()&&!activeGeography()!.source.isReady([cell.cx*size-24,cell.cz*size-24,(cell.cx+1)*size+24,(cell.cz+1)*size+24]))break;
      this.pending.shift();
      this.chunks.set(chunkKey(cell.cx,cell.cz),vegetationForChunk(cell.cx,cell.cz,this.exclusions()));
      close ||= Math.hypot(cell.cx-this.center.cx,cell.cz-this.center.cz)<=4;
      generated++;this.farBatch++;
    }while(forest&&this.pending.length&&generated<4&&performance.now()-start<2.5);
    this.placementMs=performance.now()-start;
    if(generated&&(close||this.farBatch>=(forest?12:4)||!this.pending.length)){
      this.farBatch=0;
      this.refreshBuffers();
    }
  }

  /** Re-evaluate decorative placements after a structure is added or removed. */
  refreshExclusions():void{
    for(const key of this.chunks.keys()){
      const [cx,cz]=key.split(':').map(Number);
      this.chunks.set(key,vegetationForChunk(cx,cz,this.exclusions()));
    }
    this.refreshBuffers();
  }

  private refreshBuffers():void{
    if(!this.ready)return;
    const start=performance.now(),forest=worldForestEnabled();
    this.lastBufferFocus={...this.visualFocus};
    this.visibleCount=0;
    this.visibleFarCount=0;
    this.visibleCanopyCount=0;
    this.frontTreeCount=0;
    const matrices=new Map<VegetationKind,number[]>(kinds.map(kind=>[kind,[]]));
    const farMatrices=new Map<VegetationKind,number[]>(kinds.map(kind=>[kind,[]]));
    const lowMatrices=new Map<VegetationKind,number[]>(kinds.map(kind=>[kind,[]]));
    const canopyMatrices=new Map<VegetationKind,number[]>(kinds.map(kind=>[kind,[]]));
    const spriteViews=new Map<VegetationKind,number[]>(kinds.map(kind=>[kind,[]]));
    const collidable:VegetationPlacement[]=[];
    const visible:{p:VegetationPlacement;distance:number}[]=[];
    for(const [key,placements] of this.chunks){
      const [cx,cz]=key.split(':').map(Number);
      const dx=cx-this.center.cx,dz=cz-this.center.cz;
      const plantsNear=dx*dx+dz*dz<=(VEGETATION_CONFIG.renderRadiusChunks.plants+.35)**2;
      for(const p of placements){
        if(p.kind==='plantitas1'&&!plantsNear)continue;
        if(!this.sources.has(p.kind))continue;
        const distance=Math.hypot(p.x-this.visualFocus.x,p.z-this.visualFocus.z);
        if(isBrisaliaPlant(p.kind)&&distance>120)continue;
        // Each tree has a stable fade-out distance; no hard forest ring or scale jump.
        if(p.obstacleRadius&&distance>(forest?WORLD_FOREST.fadeStart:350)+
          hash01(Math.floor(p.x),Math.floor(p.z),7441)*(forest?WORLD_FOREST.fadeEnd-WORLD_FOREST.fadeStart:510))continue;
        if(forest&&!p.obstacleRadius&&distance>220)continue;
        visible.push({p,distance});
      }
    }
    if(forest)visible.sort((a,b)=>a.distance-b.distance||a.p.x-b.p.x||a.p.z-b.p.z);
    const front=forest?forestFrontRows(visible.filter(({p})=>this.canopySources.has(p.kind)),this.visualFocus,this.viewDirection):new Set<VegetationPlacement>();
    let full=0,medium=0;
    for(const {p,distance} of visible){
        if(p.obstacleRadius&&distance<130)collidable.push(p);
        const jitter=hash01(Math.floor(p.x),Math.floor(p.z),4927);
        let target=matrices;
        if(isBrisaliaPlant(p.kind)){
          const lod=brisaliaPlantLod(p.kind,distance,this.plantLods.get(p));
          this.plantLods.set(p,lod);
          if(lod===1&&this.farSources.has(p.kind))target=farMatrices;
          if(lod===2&&this.lowSources.has(p.kind))target=lowMatrices;
        }else if(p.obstacleRadius&&this.farSources.has(p.kind)){
          if(forest&&this.canopySources.has(p.kind)){
            if(distance<=WORLD_FOREST.fullDistance+jitter*25&&full<WORLD_FOREST.maxFullTrees)full++;
            else if(front.has(p))this.frontTreeCount++;
            else if(distance<=WORLD_FOREST.mediumDistance+jitter*80&&medium<WORLD_FOREST.maxMediumTrees){target=farMatrices;medium++;}
            else target=canopyMatrices;
          }else if(distance>300+jitter*45)target=farMatrices;
        }
        if(target===canopyMatrices){
          const dx=this.visualFocus.x-p.x,dz=this.visualFocus.z-p.z;
          const length=Math.max(.001,Math.hypot(dx,dz)),c=-dz/length*p.scale,s=-dx/length*p.scale;
          target.get(p.kind)!.push(c,0,-s,0,0,p.scale,0,0,s,0,c,0,p.x,p.y,p.z,1);
          spriteViews.get(p.kind)!.push(treeSpriteView(p.yaw,dx,dz));
        }else{
          let matrix=this.placementMatrices.get(p);
          if(!matrix){matrix=new Float32Array(Matrix.Compose(new Vector3(p.scale,p.scale,p.scale),Quaternion.RotationAxis(Vector3.Up(),p.yaw),new Vector3(p.x,p.y,p.z)).m);this.placementMatrices.set(p,matrix);}
          target.get(p.kind)!.push(...matrix);
        }
        if(target===farMatrices&&p.obstacleRadius)this.visibleFarCount++;
        if(target===canopyMatrices)this.visibleCanopyCount++;
        this.visibleCount++;
    }
    for(const kind of kinds){
      const source=this.sources.get(kind);
      const farSource=this.farSources.get(kind);
      const lowSource=this.lowSources.get(kind as BrisaliaPlantKind);
      for(const [mesh,data] of [[source,matrices.get(kind)!],[farSource,farMatrices.get(kind)!],
        [lowSource,lowMatrices.get(kind)!],[this.canopySources.get(kind),canopyMatrices.get(kind)!]] as const){
        if(!mesh)continue;
        mesh.isVisible=data.length>0;
        mesh.thinInstanceSetBuffer('matrix',new Float32Array(data),16,true);
        if(mesh.metadata?.treeSprite)mesh.thinInstanceSetBuffer('treeView',new Float32Array(spriteViews.get(kind)!),1,true);
        if(data.length)mesh.thinInstanceRefreshBoundingInfo();
      }
    }
    this.treeColliders.sync(collidable,this.treeFocus.x,this.treeFocus.z);
    this.bufferBuildMs=performance.now()-start;
  }

  private treeFocus={x:0,z:0};

  setColliderFocus(x:number,z:number):void{
    if(Math.hypot(x-this.treeFocus.x,z-this.treeFocus.z)<1)return;
    this.treeFocus={x,z};
    this.syncTreeColliders();
  }

  private syncTreeColliders():void{
    const placements:VegetationPlacement[]=[];
    const cell=chunkOf(this.treeFocus.x,this.treeFocus.z);
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)
      for(const p of this.chunks.get(chunkKey(cell.cx+dx,cell.cz+dz))??[])if(p.obstacleRadius)placements.push(p);
    this.treeColliders.sync(placements,this.treeFocus.x,this.treeFocus.z);
  }

  queryTreeGround(x:number,z:number,originY:number,maxDistance:number):TreeSurface|null{
    return this.treeColliders.queryGround(x,z,originY,maxDistance);
  }

  queryTreeWall(x:number,y:number,z:number,dx:number,dz:number,reach:number):TreeWallHit|null{
    return this.treeColliders.queryWall(x,y,z,dx,dz,reach);
  }

  dispose():void{
    this.disposed=true;
    this.pending=[];
    this.chunks.clear();
    this.treeColliders.dispose();
    this.foliageWind.dispose();
    for(const source of this.sources.values())source.dispose(false,false);
    this.sources.clear();
    for(const source of this.farSources.values()){
      source.dispose(false,false);
    }
    this.farSources.clear();
    for(const source of this.lowSources.values())source.dispose(false,false);
    this.lowSources.clear();
    for(const source of this.canopySources.values()){source.material?.dispose(false,false);source.dispose(false,false);}
    this.canopySources.clear();
    this.spriteTexture?.dispose();this.spriteTexture=null;
    for(const source of this.templates.values())source.dispose(false,false);
    this.templates.clear();
  }
}

import { ImportMeshAsync, Matrix, Mesh, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { chunkKey, chunkOf, desiredChunks, hash01, MAINLAND } from './terrainData';
import { VEGETATION_CONFIG, vegetationForChunk, type VegetationExclusion, type VegetationKind, type VegetationPlacement } from './vegetationData';
import { ASSET_CATALOG, TREE_LOD_PATHS } from './assetCatalog';
import { TreeColliderSystem, type TreeSurface, type TreeWallHit } from './TreeColliderSystem';
import { configureVegetationMaterial } from './LandscapeAtmosphere';

type Cell = { cx:number; cz:number };
const kinds:readonly VegetationKind[]=['arbolito1','arbolito2','arbolito3','plantitas1','arbolitoSeco','tronco1'];

/** Owns shared GLB meshes and thin-instance buffers; the terrain only supplies active cells. */
export class VegetationSystem {
  private readonly sources=new Map<VegetationKind,Mesh>();
  private readonly farSources=new Map<VegetationKind,Mesh>();
  private readonly chunks=new Map<string,VegetationPlacement[]>();
  private pending:Cell[]=[];
  private center:Cell={cx:0,cz:0};
  private ready=false;
  private disposed=false;
  private visibleCount=0;
  private visibleFarCount=0;
  private farBatch=0;
  private visualFocus={x:0,z:0};
  private lastBufferFocus={x:Infinity,z:Infinity};
  private readonly treeColliders:TreeColliderSystem;

  get activeChunkCount():number{return this.chunks.size;}
  get instanceCount():number{return this.visibleCount;}
  get farInstanceCount():number{return this.visibleFarCount;}
  get sharedMeshCount():number{return this.sources.size;}

  constructor(
    private readonly scene:Scene,
    private readonly parent:TransformNode,
    private readonly exclusions:()=>readonly VegetationExclusion[],
    private readonly importer:typeof ImportMeshAsync=ImportMeshAsync
  ){
    this.treeColliders=new TreeColliderSystem(scene,kind=>this.sources.get(kind));
  }

  /** Each file is imported exactly once. A failed file leaves other species usable. */
  async load():Promise<void>{
    await Promise.all(kinds.map(async kind=>{
      try {
        const result=await this.importer(ASSET_CATALOG[kind].path,this.scene);
        if(this.disposed){for(const mesh of result.meshes)mesh.dispose(false,false);return;}
        const source=result.meshes.find(mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0) as Mesh|undefined;
        if(!source)throw new Error(`GLB sin geometría: ${ASSET_CATALOG[kind].path}`);
        // The glTF root converts handedness. Bake it once so instance matrices use world X/Y/Z.
        source.bakeCurrentTransformIntoVertices();
        source.parent=null;
        source.position.setAll(0);
        source.scaling.setAll(1);
        source.rotation.setAll(0);
        source.rotationQuaternion=null;
        source.parent=this.parent;
        source.name=`vegetacion-${kind}`;
        source.isPickable=false;
        source.isVisible=false;
        source.metadata={decorativeVegetation:true,kind};
        configureVegetationMaterial(source.material);
        for(const mesh of result.meshes)if(mesh!==source)mesh.dispose(false,false);
        this.sources.set(kind,source);
      } catch(error){
        console.warn(`[Auralia] No se pudo cargar ${ASSET_CATALOG[kind].path}`,error);
      }
    }));
    if(this.disposed)return;
    await Promise.all(Object.entries(TREE_LOD_PATHS).map(async ([key,path])=>{
      const kind=key as VegetationKind,source=this.sources.get(kind);
      if(!source)return;
      try{
        const imported=await this.importer(path,this.scene);
        if(this.disposed){for(const mesh of imported.meshes)mesh.dispose(false,false);return;}
        const proxy=imported.meshes.find(mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0) as Mesh|undefined;
        if(!proxy)throw new Error(`LOD sin geometría: ${path}`);
        proxy.bakeCurrentTransformIntoVertices();
        proxy.parent=null;
        proxy.position.setAll(0);proxy.scaling.setAll(1);proxy.rotation.setAll(0);
        proxy.rotationQuaternion=null;
        proxy.parent=this.parent;
        proxy.name=`vegetacion-${kind}-far`;
        proxy.material=source.material;
        proxy.isPickable=false;proxy.isVisible=false;
        proxy.metadata={farVegetationProxy:true,kind};
        for(const mesh of imported.meshes)if(mesh!==proxy)mesh.dispose(false,false);
        this.farSources.set(kind,proxy);
      }catch(error){console.warn(`[Auralia] No se pudo cargar ${path}`,error);}
    }));
    this.ready=true;
    this.refreshBuffers();
  }

  /** Trees can grow beyond the playable terrain ring because coarse terrain is resident. */
  setActiveChunks(_cells:readonly Cell[],x:number,z:number):void{
    const previousCenter=this.center;
    this.center=chunkOf(x,z);
    this.visualFocus={x,z};
    const radius=VEGETATION_CONFIG.renderRadiusChunks.trees;
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

  /** One placement batch per frame at most; idle frames do no sampling or buffer upload. */
  update():void{
    if(!this.ready||this.disposed||!this.pending.length)return;
    const cell=this.pending.shift()!;
    this.chunks.set(chunkKey(cell.cx,cell.cz),vegetationForChunk(cell.cx,cell.cz,this.exclusions()));
    const distance=Math.hypot(cell.cx-this.center.cx,cell.cz-this.center.cz);
    if(distance<=4||++this.farBatch>=4||!this.pending.length){
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
    this.lastBufferFocus={...this.visualFocus};
    this.visibleCount=0;
    this.visibleFarCount=0;
    const matrices=new Map<VegetationKind,number[]>(kinds.map(kind=>[kind,[]]));
    const farMatrices=new Map<VegetationKind,number[]>(kinds.map(kind=>[kind,[]]));
    const collidable:VegetationPlacement[]=[];
    for(const [key,placements] of this.chunks){
      const [cx,cz]=key.split(':').map(Number);
      const dx=cx-this.center.cx,dz=cz-this.center.cz;
      const plantsNear=dx*dx+dz*dz<=(VEGETATION_CONFIG.renderRadiusChunks.plants+.35)**2;
      for(const p of placements){
        if(p.kind==='plantitas1'&&!plantsNear)continue;
        if(!this.sources.has(p.kind))continue;
        const distance=Math.hypot(p.x-this.visualFocus.x,p.z-this.visualFocus.z);
        // Each tree has a stable fade-out distance; no hard forest ring or scale jump.
        if(p.obstacleRadius&&distance>350+
          hash01(Math.floor(p.x),Math.floor(p.z),7441)*510)continue;
        if(p.obstacleRadius&&distance<130)collidable.push(p);
        const matrix=Matrix.Compose(new Vector3(p.scale,p.scale,p.scale),Quaternion.RotationAxis(Vector3.Up(),p.yaw),new Vector3(p.x,p.y,p.z));
        const switchDistance=300+hash01(Math.floor(p.x),Math.floor(p.z),4927)*45;
        const target=p.obstacleRadius&&distance>switchDistance&&this.farSources.has(p.kind)
          ?farMatrices:matrices;
        target.get(p.kind)!.push(...matrix.m);
        if(target===farMatrices)this.visibleFarCount++;
        this.visibleCount++;
      }
    }
    for(const kind of kinds){
      const source=this.sources.get(kind);
      const farSource=this.farSources.get(kind);
      for(const [mesh,data] of [[source,matrices.get(kind)!],[farSource,farMatrices.get(kind)!]] as const){
        if(!mesh)continue;
        mesh.isVisible=data.length>0;
        mesh.thinInstanceSetBuffer('matrix',new Float32Array(data),16,true);
        if(data.length)mesh.thinInstanceRefreshBoundingInfo();
      }
    }
    this.treeColliders.sync(collidable,this.treeFocus.x,this.treeFocus.z);
  }

  private treeFocus={x:0,z:0};

  setColliderFocus(x:number,z:number):void{
    if(Math.hypot(x-this.treeFocus.x,z-this.treeFocus.z)<1)return;
    this.treeFocus={x,z};
    this.syncTreeColliders();
  }

  private syncTreeColliders():void{
    const placements:VegetationPlacement[]=[];
    for(const chunk of this.chunks.values())for(const p of chunk)if(p.obstacleRadius)placements.push(p);
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
    for(const source of this.sources.values())source.dispose(false,false);
    this.sources.clear();
    for(const source of this.farSources.values()){
      source.dispose(false,false);
    }
    this.farSources.clear();
  }
}

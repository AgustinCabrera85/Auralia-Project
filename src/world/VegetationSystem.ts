import { ImportMeshAsync, Matrix, Mesh, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { chunkKey, chunkOf, MAINLAND } from './terrainData';
import { VEGETATION_CONFIG, vegetationForChunk, type VegetationExclusion, type VegetationKind, type VegetationPlacement } from './vegetationData';
import { ASSET_CATALOG } from './assetCatalog';

type Cell = { cx:number; cz:number };
const kinds:readonly VegetationKind[]=['arbolito1','arbolito2','arbolito3','plantitas1','arbolitoSeco','tronco1'];

/** Owns shared GLB meshes and thin-instance buffers; the terrain only supplies active cells. */
export class VegetationSystem {
  private readonly sources=new Map<VegetationKind,Mesh>();
  private readonly chunks=new Map<string,VegetationPlacement[]>();
  private pending:Cell[]=[];
  private center:Cell={cx:0,cz:0};
  private ready=false;
  private disposed=false;
  private visibleCount=0;

  get activeChunkCount():number{return this.chunks.size;}
  get instanceCount():number{return this.visibleCount;}
  get sharedMeshCount():number{return this.sources.size;}

  constructor(
    private readonly scene:Scene,
    private readonly parent:TransformNode,
    private readonly exclusions:()=>readonly VegetationExclusion[],
    private readonly importer:typeof ImportMeshAsync=ImportMeshAsync
  ){}

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
        for(const mesh of result.meshes)if(mesh!==source)mesh.dispose(false,false);
        this.sources.set(kind,source);
      } catch(error){
        console.warn(`[Auralia] No se pudo cargar ${ASSET_CATALOG[kind].path}`,error);
      }
    }));
    if(this.disposed)return;
    this.ready=true;
    this.refreshBuffers();
  }

  /** Called only when the terrain stream changes its active cells. */
  setActiveChunks(cells:readonly Cell[],x:number,z:number):void{
    const previousCenter=this.center;
    this.center=chunkOf(x,z);
    const radius=VEGETATION_CONFIG.renderRadiusChunks.trees;
    const desired=cells.filter(cell=>{
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
    if(this.ready&&(changed||previousCenter.cx!==this.center.cx||previousCenter.cz!==this.center.cz))this.refreshBuffers();
  }

  /** One placement batch per frame at most; idle frames do no sampling or buffer upload. */
  update():void{
    if(!this.ready||this.disposed||!this.pending.length)return;
    const cell=this.pending.shift()!;
    this.chunks.set(chunkKey(cell.cx,cell.cz),vegetationForChunk(cell.cx,cell.cz,this.exclusions()));
    this.refreshBuffers();
  }

  private refreshBuffers():void{
    if(!this.ready)return;
    this.visibleCount=0;
    const matrices=new Map<VegetationKind,number[]>(kinds.map(kind=>[kind,[]]));
    for(const [key,placements] of this.chunks){
      const [cx,cz]=key.split(':').map(Number);
      const dx=cx-this.center.cx,dz=cz-this.center.cz;
      const plantsNear=dx*dx+dz*dz<=(VEGETATION_CONFIG.renderRadiusChunks.plants+.35)**2;
      for(const p of placements){
        if(p.kind==='plantitas1'&&!plantsNear)continue;
        if(!this.sources.has(p.kind))continue;
        const matrix=Matrix.Compose(new Vector3(p.scale,p.scale,p.scale),Quaternion.RotationAxis(Vector3.Up(),p.yaw),new Vector3(p.x,p.y,p.z));
        matrices.get(p.kind)!.push(...matrix.m);
        this.visibleCount++;
      }
    }
    for(const kind of kinds){
      const source=this.sources.get(kind);
      if(!source)continue;
      const data=matrices.get(kind)!;
      source.isVisible=data.length>0;
      source.thinInstanceSetBuffer('matrix',new Float32Array(data),16,true);
      if(data.length)source.thinInstanceRefreshBoundingInfo();
    }
  }

  /** Lightweight circular trunk collision, with an escape path for a saved position inside one. */
  blocksMovement(nextX:number,nextZ:number,fromX:number,fromZ:number):boolean{
    const {cx,cz}=chunkOf(nextX,nextZ);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const placements=this.chunks.get(chunkKey(cx+dx,cz+dz));
      if(!placements)continue;
      for(const p of placements){
        if(!p.obstacleRadius||!this.sources.has(p.kind))continue;
        const distance=Math.hypot(nextX-p.x,nextZ-p.z);
        if(distance<p.obstacleRadius&&distance<Math.hypot(fromX-p.x,fromZ-p.z))return true;
      }
    }
    return false;
  }

  dispose():void{
    this.disposed=true;
    this.pending=[];
    this.chunks.clear();
    for(const source of this.sources.values())source.dispose(false,false);
    this.sources.clear();
  }
}

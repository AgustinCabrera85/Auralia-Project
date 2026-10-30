import { BoundingInfo, Mesh, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { chunkKey, MAINLAND } from '../terrainData';
import type { VegetationExclusion } from '../vegetationData';
import { createGrassPrototype, type GrassPrototype } from './GrassGeometry';
import { createGrassMaterials } from './GrassMaterial';
import { grassForPatch, grassRegionHasPotential, grassRockObstacles, GRASS_CONFIG, type GrassConfig,
  type GrassLod, type GrassObstacle, type GrassVariant } from './grassData';

type Cell={cx:number;cz:number};
type Request={px:number;pz:number;cx:number;cz:number;lod:GrassLod;distance:number;key:string};
type Patch={mesh:Mesh|null;count:number;triangles:number;cx:number;cz:number};
const variants:readonly GrassVariant[]=['short','medium','tall'];

/** Small independently culled patches, driven by TerrainStream's active cells. */
export class GrassFieldSystem {
  private readonly prototypes=new Map<string,GrassPrototype>();
  private readonly patches=new Map<string,Patch>();
  private readonly rockCache=new Map<string,GrassObstacle[]>();
  private readonly regionMask=new Map<string,boolean>();
  private readonly regionCells=new Set<string>();
  private readonly materials:ReturnType<typeof createGrassMaterials>;
  private cells:Cell[]=[];
  private pending:Request[]=[];
  private dirty=true;
  private enabled=true;
  private disposed=false;
  readonly config:GrassConfig;

  get activePatchCount():number{return [...this.patches.values()].filter(p=>p.mesh?.isVisible).length;}
  get instanceCount():number{return [...this.patches.values()].reduce((n,p)=>n+(p.mesh?.isVisible?p.count:0),0);}
  get triangleCount():number{return [...this.patches.values()].reduce((n,p)=>n+(p.mesh?.isVisible?p.triangles:0),0);}
  get pendingPatchCount():number{return this.pending.length;}
  get drawCallsEstimate():number{return this.activePatchCount;}

  constructor(scene:Scene,private readonly parent:TransformNode,
    private readonly exclusions:()=>readonly VegetationExclusion[],
    config:Partial<GrassConfig>={}){
    this.config={...GRASS_CONFIG,...config};
    if(MAINLAND.chunkSize%this.config.patchSize!==0)
      throw new Error('El tamaño del parche de césped debe dividir el chunk de 72 m');
    this.materials=createGrassMaterials(scene,this.config);
    for(const lod of ['near','medium'] as const)for(const variant of variants){
      const source=createGrassPrototype(scene,lod,variant);
      source.mesh.material=this.materials.materials[lod];
      this.prototypes.set(`${lod}:${variant}`,source);
    }
  }

  setEnabled(enabled:boolean):void{
    if(this.enabled===enabled)return;
    this.enabled=enabled;
    if(!enabled){this.clearPatches();this.rockCache.clear();}
    this.dirty=true;
  }

  setActiveChunks(cells:readonly Cell[],_x:number,_z:number):void{
    const perChunk=MAINLAND.chunkSize/this.config.patchSize;
    const activeKeys=new Set(cells.map(cell=>chunkKey(cell.cx,cell.cz)));
    for(const key of this.regionCells)if(!activeKeys.has(key)){
      const [cx,cz]=key.split(':').map(Number);
      for(let iz=0;iz<perChunk;iz++)for(let ix=0;ix<perChunk;ix++)
        this.regionMask.delete(`${cx*perChunk+ix}:${cz*perChunk+iz}`);
      this.regionCells.delete(key);
    }
    for(const cell of cells){
      const key=chunkKey(cell.cx,cell.cz);
      if(this.regionCells.has(key))continue;
      for(let iz=0;iz<perChunk;iz++)for(let ix=0;ix<perChunk;ix++){
        const px=cell.cx*perChunk+ix,pz=cell.cz*perChunk+iz;
        this.regionMask.set(`${px}:${pz}`,grassRegionHasPotential(px,pz,this.config));
      }
      this.regionCells.add(key);
    }
    const centerX=Math.floor(_x/MAINLAND.chunkSize),centerZ=Math.floor(_z/MAINLAND.chunkSize);
    // Keep a fixed 3x3 chunk window. Its outer edge is beyond the visible
    // grass radius, so walking within a chunk never replaces nearby patches.
    this.cells=cells.filter(cell=>Math.abs(cell.cx-centerX)<=1&&
      Math.abs(cell.cz-centerZ)<=1);
    this.dirty=true;
    if(!this.cells.length){this.clearPatches();this.rockCache.clear();}
  }

  /** Buildings and save reloads invalidate only this grass distribution. */
  refreshExclusions():void{
    this.clearPatches();
    this.rockCache.clear();
    this.dirty=true;
  }

  update(x:number,z:number):void{
    if(!this.enabled||this.disposed||!this.cells.length)return;
    this.materials.setFocus(x,z);
    if(this.dirty)this.reconcile(x,z);
    for(let i=0;i<this.config.patchesPerFrame&&this.pending.length;i++)
      this.createPatch(this.pending.shift()!);
    this.updateVisibility(x,z);
  }

  private reconcile(x:number,z:number):void{
    this.dirty=false;
    const requests:Request[]=[];
    const perChunk=MAINLAND.chunkSize/this.config.patchSize;
    for(const cell of this.cells)for(let iz=0;iz<perChunk;iz++)for(let ix=0;ix<perChunk;ix++){
      const px=cell.cx*perChunk+ix,pz=cell.cz*perChunk+iz;
      if(!this.regionMask.get(`${px}:${pz}`))continue;
      const centerX=(px+.5)*this.config.patchSize,centerZ=(pz+.5)*this.config.patchSize;
      const distance=Math.hypot(centerX-x,centerZ-z);
      requests.push({px,pz,cx:cell.cx,cz:cell.cz,lod:'near',distance,
        key:`${px}:${pz}:near`});
      requests.push({px,pz,cx:cell.cx,cz:cell.cz,lod:'medium',distance,
        key:`${px}:${pz}:medium`});
    }
    // Distance only affects preparation order, never which regions exist.
    requests.sort((a,b)=>a.distance-b.distance||
      (a.lod==='near'?0:1)-(b.lod==='near'?0:1)||a.px-b.px||a.pz-b.pz);
    const activeCellKeys=new Set(this.cells.map(cell=>chunkKey(cell.cx,cell.cz)));
    for(const [key,patch] of this.patches)if(!activeCellKeys.has(chunkKey(patch.cx,patch.cz))){
      patch.mesh?.dispose(false,false);
      this.patches.delete(key);
    }
    this.pending=requests.filter(request=>!this.patches.has(request.key));
    for(const key of this.rockCache.keys())if(!activeCellKeys.has(key))this.rockCache.delete(key);
  }

  private updateVisibility(x:number,z:number):void{
    const margin=this.config.patchSize*.72;
    for(const patch of this.patches.values()){
      const mesh=patch.mesh;
      if(!mesh)continue;
      const {px,pz,lod}=mesh.metadata as {px:number;pz:number;lod:GrassLod};
      const distance=Math.hypot((px+.5)*this.config.patchSize-x,
        (pz+.5)*this.config.patchSize-z);
      mesh.isVisible=lod==='near'
        ?distance<this.config.nearDistance+margin
        :distance>this.config.nearDistance-this.config.transitionDistance&&
          distance<this.config.farDistance+margin;
    }
  }

  private createPatch(request:Request):void{
    const cellKey=chunkKey(request.cx,request.cz);
    let rocks=this.rockCache.get(cellKey);
    if(!rocks){
      rocks=grassRockObstacles(request.cx,request.cz,this.exclusions());
      this.rockCache.set(cellKey,rocks);
    }
    const placements=grassForPatch(request.px,request.pz,request.lod,
      this.exclusions(),rocks,this.config);
    if(!placements.length){this.patches.set(request.key,
      {mesh:null,count:0,triangles:0,cx:request.cx,cz:request.cz});return;}
    const variant=variants[Math.floor(
      ((request.px*37+request.pz*53)%997+997)%997/997*variants.length)];
    const prototype=this.prototypes.get(`${request.lod}:${variant}`)!;
    const mesh=prototype.mesh.clone(`grass-patch-${request.key}`,null,false)!;
    mesh.parent=this.parent;
    mesh.isVisible=true;
    mesh.isPickable=false;
    mesh.checkCollisions=false;
    mesh.metadata={grassPatch:true,px:request.px,pz:request.pz,lod:request.lod};
    const matrices=new Float32Array(placements.length*16);
    const tints=new Float32Array(placements.length*4);
    for(const [i,p] of placements.entries()){
      const c=Math.cos(p.yaw),s=Math.sin(p.yaw),m=i*16;
      matrices.set([p.width*c,0,-p.width*s,0,
        0,p.height,0,0,
        p.width*s,0,p.width*c,0,
        p.x,p.y,p.z,1],m);
      tints.set([p.tint[0],p.tint[1],p.tint[2],p.flower?1:0],i*4);
    }
    mesh.thinInstanceSetBuffer('matrix',matrices,16,true);
    mesh.thinInstanceSetBuffer('color',tints,4,true);
    mesh.thinInstanceRefreshBoundingInfo();
    const box=mesh.getBoundingInfo().boundingBox;
    const padding=this.config.windStrength*1.55+.25;
    mesh.setBoundingInfo(new BoundingInfo(
      box.minimum.subtract(new Vector3(padding,.1,padding)),
      box.maximum.add(new Vector3(padding,.1,padding))));
    this.patches.set(request.key,{mesh,count:placements.length,
      triangles:placements.length*prototype.triangles,cx:request.cx,cz:request.cz});
  }

  private clearPatches():void{
    for(const patch of this.patches.values())patch.mesh?.dispose(false,false);
    this.patches.clear();this.pending=[];
  }

  dispose():void{
    if(this.disposed)return;
    this.disposed=true;
    this.clearPatches();this.rockCache.clear();this.cells=[];
    this.regionMask.clear();this.regionCells.clear();
    for(const prototype of this.prototypes.values())prototype.mesh.dispose(false,false);
    this.prototypes.clear();
    this.materials.dispose();
  }
}

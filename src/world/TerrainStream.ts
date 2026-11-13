import { Mesh, Scene, ShaderMaterial, TransformNode, VertexData } from '@babylonjs/core';
import { surfaceWeightsAt } from './editor/WorldEditState';
import { MAINLAND } from './terrainData';
import { legacyGeography, type GeographicSource } from './geography/GeographicSource';
import { terrainMaterialWeightsAt, TERRAIN_MATERIAL_CONFIG,
  type TerrainMaterialConfig } from './materials/TerrainMaterial';
import { createTerrainMaterial } from './materials/TerrainBiomeMaterial';
import { featureTerrainTopology, terrainTileTopology } from './terrainTileTopology';
import { cellAt, childrenOf, lodKey, parentOf, selectGroups, tileDistance,
  TERRAIN_LOD_CONFIG, type TerrainCell, type TerrainLod } from './terrainLod';

type Tile={cell:TerrainCell;mesh:Mesh};
type Job={lod:TerrainLod;cell:TerrainCell};
const sameSet=(a:Set<string>,b:Set<string>):boolean=>
  a.size===b.size&&[...a].every(key=>b.has(key));

/** A resident coarse mainland guarantees coverage while complete tile groups refine. */
export class TerrainStream {
  private readonly near=new Map<string,Tile>();
  private readonly mid=new Map<string,Tile>();
  private readonly far=new Map<string,Tile>();
  private readonly pending=new Map<string,Job>();
  private activeBuild:{key:string;work:Generator<void,Mesh,void>}|null=null;
  private readonly desiredNear=new Set<string>();
  private readonly desiredMid=new Set<string>();
  private readonly desiredFar=new Set<string>();
  private readonly heightCache=new Map<string,number>();
  private readonly material:ShaderMaterial;
  private readonly disposeMaterial:()=>void;
  private readonly materialConfig:TerrainMaterialConfig;
  private visibleNear=new Set<string>();
  private visibleMid=0;
  private visibleFar=0;
  private readonly readyMid=new Set<string>();
  private lodVisibilityDirty=true;
  private centerKey='';
  private lastX=Infinity;
  private lastZ=Infinity;
  private lastGenerationMs=0;
  private debugLayer:TerrainLod|'all'='all';

  get activeCount():number{return this.visibleNear.size;}
  get activeMidCount():number{return this.visibleMid;}
  get activeFarCount():number{return this.visibleFar;}
  get residentFarCount():number{return this.far.size;}
  get pendingCount():number{return this.pending.size;}
  get generationMs():number{return this.lastGenerationMs;}
  get visibleLayer():TerrainLod|'all'{return this.debugLayer;}
  get activeCells():TerrainCell[]{return [...this.visibleNear].map(key=>this.near.get(key)!.cell);}
  get statistics(){
    return Object.fromEntries(([['near',this.near],['mid',this.mid],['far',this.far]] as const).map(([lod,group])=>[
      lod,{resident:group.size,enabled:[...group.values()].filter(t=>t.mesh.isEnabled()).length,
        vertices:[...group.values()].reduce((n,t)=>n+t.mesh.getTotalVertices(),0),
        triangles:[...group.values()].reduce((n,t)=>n+t.mesh.getTotalIndices()/3,0)}]));
  }
  coverageAt(x:number,z:number):TerrainLod|null{
    const near=this.near.get(lodKey(cellAt(x,z,TERRAIN_LOD_CONFIG.nearSize)))?.mesh;
    if(near?.isEnabled())return 'near';
    const mid=this.mid.get(lodKey(cellAt(x,z,TERRAIN_LOD_CONFIG.midSize)))?.mesh;
    if(mid?.isEnabled())return 'mid';
    const far=this.far.get(lodKey(cellAt(x,z,TERRAIN_LOD_CONFIG.farSize)))?.mesh;
    return far?.isEnabled()?'far':null;
  }
  get approxGeometryBytes():number{
    let bytes=0;
    for(const group of [this.near,this.mid,this.far])for(const {mesh} of group.values())
      bytes+=mesh.getTotalVertices()*40+mesh.getTotalIndices()*4;
    return bytes;
  }

  constructor(private readonly scene:Scene,private readonly parent:TransformNode,
    materialOptions:Partial<TerrainMaterialConfig>={},readonly source:GeographicSource=legacyGeography){
    this.materialConfig={...TERRAIN_MATERIAL_CONFIG,...materialOptions};
    const terrain=createTerrainMaterial(scene,this.materialConfig,!source.streamed);
    this.material=terrain.material;
    this.disposeMaterial=terrain.dispose;
    if(!source.streamed)this.createResidentCoverage();
    this.heightCache.clear();
  }

  private height(x:number,z:number):number{
    const key=`${x}:${z}`;
    let value=this.heightCache.get(key);
    if(value===undefined){value=this.source.heightAt(x,z);this.heightCache.set(key,value);}
    return value;
  }

  private createResidentCoverage():void{
    const size=TERRAIN_LOD_CONFIG.farSize,m=TERRAIN_LOD_CONFIG.farBoundsMargin;
    const minX=Math.floor((MAINLAND.centerX-MAINLAND.radiusX-m)/size);
    const maxX=Math.floor((MAINLAND.centerX+MAINLAND.radiusX+m)/size);
    const minZ=Math.floor((MAINLAND.centerZ-MAINLAND.radiusZ-m)/size);
    const maxZ=Math.floor((MAINLAND.centerZ+MAINLAND.radiusZ+m)/size);
    for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++){
      const cell={cx,cz},mesh=this.createTile('far',cell);
      mesh.setEnabled(false);
      this.far.set(lodKey(cell),{cell,mesh});
    }
  }

  private createTile(lod:TerrainLod,cell:TerrainCell):Mesh{
    const work=this.buildTile(lod,cell);
    let result;do{result=work.next();}while(!result.done);
    return result.value;
  }

  private *buildTile(lod:TerrainLod,cell:TerrainCell):Generator<void,Mesh,void>{
    const tileSize=TERRAIN_LOD_CONFIG[`${lod}Size`],preserve=this.source.preserveDetail;
    const spacing=this.source.meshSpacing??TERRAIN_LOD_CONFIG.nearSize/TERRAIN_LOD_CONFIG.nearSubdivisions;
    const {size,offsets,indices}=preserve?featureTerrainTopology(lod,(x,z,s)=>
      preserve.call(this.source,[cell.cx*tileSize+x,cell.cz*tileSize+z,cell.cx*tileSize+x+s,cell.cz*tileSize+z+s]),spacing):terrainTileTopology(lod,spacing);
    const centerX=(cell.cx+.5)*size,centerZ=(cell.cz+.5)*size;
    // Half a canonical cell also reuses derivative samples along fine edges.
    const eps=spacing/2;
    const positions:number[]=[],normals:number[]=[],colors:number[]=[],extras:number[]=[];
    let sampled=0;
    for(const [dx,dz] of offsets){
      // Refined river tiles can be much denser than ordinary far tiles. Yield
      // before another batch; publish the mesh only when all buffers are ready.
      if(sampled++%16===0)yield;
      const x=cell.cx*size+dx,z=cell.cz*size+dz;
      // A shared point must have identical slope, lighting and biome weights
      // in all three LODs, independently of the interior triangle spacing.
      const h=this.height(x,z);
      const nx=this.height(x-eps,z)-this.height(x+eps,z);
      const nz=this.height(x,z-eps)-this.height(x,z+eps);
      const length=Math.hypot(nx,2*eps,nz);
      positions.push(x-centerX,h,z-centerZ);
      normals.push(nx/length,2*eps/length,nz/length);
      const slope=Math.hypot(nx,nz)/(2*eps);
      const weights=this.source.weightsAt?.(x,z,h,slope)??surfaceWeightsAt(x,z,
        terrainMaterialWeightsAt(x,z,h,slope,this.materialConfig));
      colors.push(...weights.slice(0,4));
      extras.push(weights[4],weights[5]);
    }
    const mesh=new Mesh(`terreno-${lod}-${cell.cx}-${cell.cz}`,this.scene);
    const data=new VertexData();
    data.positions=positions;data.normals=normals;data.colors=colors;data.uvs=extras;data.indices=indices;
    data.applyToMesh(mesh);
    mesh.parent=this.parent;
    mesh.position.set(centerX,0,centerZ);
    mesh.material=this.material;
    mesh.receiveShadows=true;
    mesh.useVertexColors=true;
    mesh.isPickable=lod==='near';
    mesh.checkCollisions=false; // The canonical height sampler drives player collision.
    mesh.metadata={terrainChunk:lod==='near',terrainLod:lod,cx:cell.cx,cz:cell.cz,geographicSource:this.source.id};
    mesh.freezeWorldMatrix();
    return mesh;
  }

  private preloadAt(x:number,z:number):void{
    const farCell=cellAt(x,z,TERRAIN_LOD_CONFIG.farSize);
    if(this.source.streamed&&!this.far.has(lodKey(farCell))&&this.validCell('far',farCell))
      this.far.set(lodKey(farCell),{cell:farCell,mesh:this.createTile('far',farCell)});
    for(const cell of childrenOf(farCell)){
      if(!this.validCell('mid',cell))continue;
      const key=lodKey(cell);
      if(!this.mid.has(key))this.mid.set(key,{cell,mesh:this.createTile('mid',cell)});
    }
    const midCell=cellAt(x,z,TERRAIN_LOD_CONFIG.midSize);
    for(const cell of childrenOf(midCell)){
      if(!this.validCell('near',cell))continue;
      const key=lodKey(cell);
      if(!this.near.has(key))this.near.set(key,{cell,mesh:this.createTile('near',cell)});
    }
  }

  private validCell(lod:TerrainLod,cell:TerrainCell):boolean{
    if(!this.source.streamed)return true;
    const size=terrainTileTopology(lod).size,b=this.source.bounds;
    return cell.cx*size>=b[0]&&cell.cz*size>=b[1]&&(cell.cx+1)*size<=b[2]&&(cell.cz+1)*size<=b[3];
  }

  private refreshTargets(x:number,z:number):void{
    this.lodVisibilityDirty=true;
    this.desiredMid.clear();this.desiredNear.clear();
    for(const parent of selectGroups(x,z,TERRAIN_LOD_CONFIG.midRadius,
      TERRAIN_LOD_CONFIG.farSize))
      for(const cell of childrenOf(parent))if(this.validCell('mid',cell))this.desiredMid.add(lodKey(cell));
    for(const parent of selectGroups(x,z,TERRAIN_LOD_CONFIG.nearRadius,
      TERRAIN_LOD_CONFIG.midSize))
      for(const cell of childrenOf(parent))if(this.validCell('near',cell))this.desiredNear.add(lodKey(cell));
    if(this.source.streamed){
      this.desiredFar.clear();
      for(const cell of selectGroups(x,z,TERRAIN_LOD_CONFIG.farRadius,TERRAIN_LOD_CONFIG.farSize))
        if(this.validCell('far',cell))this.desiredFar.add(lodKey(cell));
      for(const [key,tile] of this.far)if(!this.desiredFar.has(key)){
        tile.mesh.dispose(false,false);this.far.delete(key);
      }
      for(const key of this.desiredFar)if(!this.far.has(key)){
        const [cx,cz]=key.split(':').map(Number);this.pending.set(`far:${key}`,{lod:'far',cell:{cx,cz}});
      }
    }
    for(const [key,tile] of this.near)if(!this.desiredNear.has(key)){
      tile.mesh.dispose(false,false);this.near.delete(key);
    }
    for(const [key,tile] of this.mid)if(!this.desiredMid.has(key)){
      tile.mesh.dispose(false,false);this.mid.delete(key);
    }
    for(const [key,job] of this.pending)if(!(job.lod==='near'?this.desiredNear:job.lod==='mid'?this.desiredMid:this.desiredFar)
      .has(lodKey(job.cell)))this.pending.delete(key);
    for(const key of this.desiredMid)if(!this.mid.has(key)){
      const [cx,cz]=key.split(':').map(Number);
      this.pending.set(`mid:${key}`,{lod:'mid',cell:{cx,cz}});
    }
    for(const key of this.desiredNear)if(!this.near.has(key)){
      const [cx,cz]=key.split(':').map(Number);
      this.pending.set(`near:${key}`,{lod:'near',cell:{cx,cz}});
    }
    if(this.activeBuild&&!this.pending.has(this.activeBuild.key))this.cancelBuild();
  }

  private cancelBuild():void{
    this.activeBuild?.work.return(undefined as never);
    this.activeBuild=null;
  }

  private jobScore(job:Job,x:number,z:number,forwardX:number,forwardZ:number):number{
    if(job.lod==='far')return 400+tileDistance(job.cell,TERRAIN_LOD_CONFIG.farSize,x,z);
    const size=job.lod==='near'?TERRAIN_LOD_CONFIG.nearSize:TERRAIN_LOD_CONFIG.midSize;
    const mx=(job.cell.cx+.5)*size-x,mz=(job.cell.cz+.5)*size-z;
    const distance=Math.hypot(mx,mz);
    const directionLength=Math.hypot(forwardX,forwardZ);
    const toward=directionLength>0&&distance>0?
      (mx*forwardX+mz*forwardZ)/(distance*directionLength):0;
    const adjusted=distance*(1-TERRAIN_LOD_CONFIG.forwardPriority*Math.max(-1,toward));
    const centerMid=cellAt(x,z,TERRAIN_LOD_CONFIG.midSize);
    const centerFar=cellAt(x,z,TERRAIN_LOD_CONFIG.farSize);
    if(job.lod==='mid'&&lodKey(parentOf(job.cell))===lodKey(centerFar))return adjusted;
    if(job.lod==='near'&&lodKey(parentOf(job.cell))===lodKey(centerMid))return 50+adjusted;
    if(job.lod==='mid'&&distance<TERRAIN_LOD_CONFIG.nearRadius+TERRAIN_LOD_CONFIG.farSize)
      return 250+adjusted;
    return (job.lod==='near'?500:1100)+adjusted;
  }

  update(x:number,z:number,forwardX=0,forwardZ=0):boolean{
    // The caller prepares a bounded geographic window before moving the player.
    // Never substitute legacy/zero heights when an R16 sector is unavailable.
    if(this.source.streamed){
      const r=TERRAIN_LOD_CONFIG.farRadius+TERRAIN_LOD_CONFIG.farSize+6;
      if(!this.source.isReady([x-r,z-r,x+r,z+r]))return false;
    }
    // Visibility depends on position and completed tiles, not camera heading.
    // Keep idle frames from rebuilding hundreds of temporary LOD groups/sets.
    // Pending refinement must still advance while the player stands still.
    if(x===this.lastX&&z===this.lastZ&&this.pending.size===0){
      this.lastGenerationMs=0;
      return false;
    }
    const start=performance.now();
    const center=cellAt(x,z,TERRAIN_LOD_CONFIG.nearSize);
    const nextCenter=lodKey(center);
    if(this.centerKey===''||Math.hypot(x-this.lastX,z-this.lastZ)>TERRAIN_LOD_CONFIG.farSize)
      this.preloadAt(x,z);
    if(this.centerKey!==nextCenter){
      this.centerKey=nextCenter;
      this.refreshTargets(x,z);
    }
    this.lastX=x;this.lastZ=z;
    let generated=0;
    while(this.pending.size&&generated<TERRAIN_LOD_CONFIG.maxGeneratedPerFrame&&
      (generated===0||performance.now()-start<TERRAIN_LOD_CONFIG.generationBudgetMs)){
      const job=this.activeBuild?this.pending.get(this.activeBuild.key)!:[...this.pending.values()].sort((a,b)=>
        this.jobScore(a,x,z,forwardX,forwardZ)-this.jobScore(b,x,z,forwardX,forwardZ))[0];
      const jobKey=`${job.lod}:${lodKey(job.cell)}`;
      const target=job.lod==='near'?this.near:job.lod==='mid'?this.mid:this.far;
      const key=lodKey(job.cell);
      if(!target.has(key)){
        if(this.source.preserveDetail){
          this.activeBuild??={key:jobKey,work:this.buildTile(job.lod,job.cell)};
          let result;
          do{result=this.activeBuild.work.next();}
          while(!result.done&&performance.now()-start<TERRAIN_LOD_CONFIG.generationBudgetMs);
          if(!result.done)break;
          target.set(key,{cell:job.cell,mesh:result.value});this.activeBuild=null;
        }else target.set(key,{cell:job.cell,mesh:this.createTile(job.lod,job.cell)});
      }else this.cancelBuild();
      this.pending.delete(jobKey);
      generated++;
      this.lodVisibilityDirty=true;
    }
    this.lastGenerationMs=performance.now()-start;
    this.heightCache.clear();
    return this.refreshVisibility(x,z);
  }

  private refreshVisibility(x:number,z:number):boolean{
    let changed=false;
    // Group completeness changes only when a tile is added/removed. Movement
    // within a cell only affects the far distance cutoff below.
    if(this.lodVisibilityDirty){
      this.lodVisibilityDirty=false;
      changed=this.refreshLodVisibility();
    }
    this.visibleFar=0;
    for(const [key,{cell,mesh}] of this.far){
      const visible=tileDistance(cell,TERRAIN_LOD_CONFIG.farSize,x,z)<=
        TERRAIN_LOD_CONFIG.farRadius&&!this.readyMid.has(key);
      if(mesh.isEnabled()!==visible)mesh.setEnabled(visible);
      mesh.isVisible=this.debugLayer==='all'||this.debugLayer==='far';
      if(visible)this.visibleFar++;
    }
    return changed;
  }

  private refreshLodVisibility():boolean{
    const nearReady=(cell:TerrainCell)=>childrenOf(cell).every(child=>
      this.desiredNear.has(lodKey(child))&&this.near.has(lodKey(child)));
    this.readyMid.clear();
    // Authored extensions can lie beyond the original resident far grid.
    // Readiness depends on four loaded, desired children, not on a far mesh
    // existing for their parent. Otherwise valid outer mid/near tiles vanish.
    const loadedChildren=new Map<string,number>();
    for(const [key,{cell}] of this.mid)if(this.desiredMid.has(key)){
      const parent=lodKey(parentOf(cell));
      loadedChildren.set(parent,(loadedChildren.get(parent)??0)+1);
    }
    for(const [key,count] of loadedChildren)if(count===4)this.readyMid.add(key);
    this.visibleMid=0;
    const nearKeys=new Set<string>();
    for(const {cell,mesh} of this.mid.values()){
      const visible=this.readyMid.has(lodKey(parentOf(cell)))&&!nearReady(cell);
      if(mesh.isEnabled()!==visible)mesh.setEnabled(visible);
      mesh.isVisible=this.debugLayer==='all'||this.debugLayer==='mid';
      if(visible)this.visibleMid++;
    }
    for(const [key,{cell,mesh}] of this.near){
      const visible=this.readyMid.has(lodKey(parentOf(parentOf(cell))))&&nearReady(parentOf(cell));
      if(mesh.isEnabled()!==visible)mesh.setEnabled(visible);
      mesh.isVisible=this.debugLayer==='all'||this.debugLayer==='near';
      if(visible)nearKeys.add(key);
    }
    const changed=!sameSet(this.visibleNear,nearKeys);
    this.visibleNear=nearKeys;
    return changed;
  }

  /** Updates only edited patches at every LOD, including the permanent far coverage. */
  invalidateRegion(x:number,z:number,radius:number):void {
    this.cancelBuild();
    this.heightCache.clear();
    for(const [lod,group] of [
      ['near',this.near],['mid',this.mid],['far',this.far]
    ] as const){
      const size=lod==='near'?TERRAIN_LOD_CONFIG.nearSize:
        lod==='mid'?TERRAIN_LOD_CONFIG.midSize:TERRAIN_LOD_CONFIG.farSize;
      for(const [key,tile] of group){
        const cx=(tile.cell.cx+.5)*size,cz=(tile.cell.cz+.5)*size;
        if(Math.abs(cx-x)>size*.5+radius||Math.abs(cz-z)>size*.5+radius)continue;
        const enabled=tile.mesh.isEnabled(),visible=tile.mesh.isVisible;
        tile.mesh.dispose(false,false);
        const mesh=this.createTile(lod,tile.cell);
        mesh.setEnabled(enabled);mesh.isVisible=visible;
        group.set(key,{cell:tile.cell,mesh});
      }
    }
    this.heightCache.clear();
  }

  /** Called after importing a complete world file or performing undo/redo. */
  reloadEdits():void {
    this.cancelBuild();
    this.heightCache.clear();
    for(const [lod,group] of [
      ['near',this.near],['mid',this.mid],['far',this.far]
    ] as const){
      for(const [key,tile] of group){
        const enabled=tile.mesh.isEnabled(),visible=tile.mesh.isVisible;
        tile.mesh.dispose(false,false);
        const mesh=this.createTile(lod,tile.cell);
        mesh.setEnabled(enabled);mesh.isVisible=visible;
        group.set(key,{cell:tile.cell,mesh});
      }
    }
    this.heightCache.clear();
  }

  setDebugLayer(layer:TerrainLod|'all'):void{
    this.debugLayer=layer;
    this.lodVisibilityDirty=true;
    if(Number.isFinite(this.lastX))this.refreshVisibility(this.lastX,this.lastZ);
  }

  dispose():void{
    this.cancelBuild();
    this.pending.clear();this.heightCache.clear();
    for(const group of [this.near,this.mid,this.far]){
      for(const tile of group.values())tile.mesh.dispose(false,false);
      group.clear();
    }
    this.visibleNear.clear();
    this.readyMid.clear();
    this.disposeMaterial();
  }
}

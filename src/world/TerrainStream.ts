import { Mesh, Scene, ShaderMaterial, TransformNode, VertexData } from '@babylonjs/core';
import { surfaceWeightsAt } from './editor/WorldEditState';
import { MAINLAND } from './terrainData';
import { legacyGeography, type GeographicSource } from './geography/GeographicSource';
import { terrainMaterialWeightsAt, TERRAIN_MATERIAL_CONFIG,
  type TerrainMaterialConfig } from './materials/TerrainMaterial';
import { createTerrainMaterial } from './materials/TerrainBiomeMaterial';
import { featureTerrainTopology, terrainTileTopology } from './terrainTileTopology';
import { TerrainHeightCache } from './TerrainHeightCache';
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
  private readonly landmarkFar=new Set<string>();
  private readonly fallbackMid=new Set<string>();
  private coverageEpoch=0;
  private disposed=false;
  private readonly heightCache:TerrainHeightCache;
  private readonly retired=new Map<string,{lod:TerrainLod;tile:Tile;bytes:number}>();
  private retiredBytes=0;
  private tileReuses=0;
  private readonly retiredBudget=32*1024*1024;
  readonly material:ShaderMaterial;
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
  get cacheStatistics(){return {heightHits:this.heightCache.hits,heightMisses:this.heightCache.misses,
    heightBytes:this.heightCache.bytes,tileReuses:this.tileReuses,retainedTiles:this.retired.size,
    retainedBytes:this.retiredBytes,retainedBudget:this.retiredBudget};}
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
  canTraverse(x:number,z:number):boolean{
    return this.source.isReady([x-12,z-12,x+12,z+12])&&this.coverageAt(x,z)!==null;
  }
  /** A destination is revealed only after its complete, exact far surface is
   * resident. This is independent of heading and of optional near refinement. */
  hasHorizonAt(x:number,z:number):boolean{
    return !this.source.streamed||this.horizonCells(x,z).every(cell=>this.far.has(lodKey(cell)));
  }
  private horizonCells(x:number,z:number):TerrainCell[]{
    const cells=selectGroups(x,z,TERRAIN_LOD_CONFIG.farRadius+TERRAIN_LOD_CONFIG.farPrefetchMargin,
      TERRAIN_LOD_CONFIG.farSize).filter(cell=>this.validCell('far',cell));
    const keys=new Set(cells.map(lodKey));
    for(const cell of this.landmarkCells(x,z))if(!keys.has(lodKey(cell))){cells.push(cell);keys.add(lodKey(cell));}
    return cells;
  }
  private landmarkCells(x:number,z:number):TerrainCell[]{
    const result:TerrainCell[]=[],size=TERRAIN_LOD_CONFIG.farSize;
    for(const b of this.source.horizonLandmarksAt?.(x,z)??[]){
      const cells:TerrainCell[]=[];
      for(let cz=Math.floor(b[1]/size);cz<=Math.floor(b[3]/size);cz++)
        for(let cx=Math.floor(b[0]/size);cx<=Math.floor(b[2]/size);cx++)cells.push({cx,cz});
      // Publish a complete silhouette only when all source tiles are resident.
      // Reuse the existing far meshes, LOD transitions and generation budget.
      if(cells.every(cell=>this.validCell('far',cell)&&this.jobReady({lod:'far',cell})))result.push(...cells);
    }
    return result;
  }
  /** Prepare a destination without removing or hiding the current view. Use the
   * same builder/material as normal streaming; no approximate second terrain.
   * The caller keeps the previous frame until the complete destination is ready. */
  async prepareHorizon(x:number,z:number,yieldFrame:()=>Promise<void>=
    ()=>new Promise(resolve=>setTimeout(resolve,0)),onProgress?:(completed:number,total:number)=>void):Promise<void>{
    if(!this.source.streamed)return;
    const epoch=++this.coverageEpoch;
    this.cancelBuild();
    const staged=new Map<string,Tile>();
    let committed=false;
    let deadline=performance.now()+8;
    try{
      const cells=this.horizonCells(x,z);let completed=0;
      onProgress?.(0,cells.length);
      for(const cell of cells){
        if(this.disposed||epoch!==this.coverageEpoch)throw new Error('Horizon preparation cancelled');
        const key=lodKey(cell);
        if(this.far.has(key)||this.restoreTile('far',key,staged)){onProgress?.(++completed,cells.length);continue;}
        if(!this.jobReady({lod:'far',cell}))throw new Error(`Horizon data not ready: ${key}`);
        const work=this.buildTile('far',cell);
        try{
          let result=work.next();
          while(!result.done){
            if(performance.now()>=deadline){
              await yieldFrame();
              if(this.disposed||epoch!==this.coverageEpoch)throw new Error('Horizon preparation cancelled');
              deadline=performance.now()+8;
            }
            result=work.next();
          }
          result.value.setEnabled(false);
          staged.set(key,{cell,mesh:result.value});
        }finally{work.return(undefined as never);}
        onProgress?.(++completed,cells.length);
      }
      for(const [key,tile] of staged){
        this.far.set(key,tile);
        this.pending.delete(`far:${key}`);
      }
      committed=true;this.lodVisibilityDirty=true;
    }finally{
      if(!committed)for(const {mesh} of staged.values())mesh.dispose(false,false);
    }
  }
  get approxGeometryBytes():number{
    let bytes=0;
    for(const group of [this.near,this.mid,this.far])for(const {mesh} of group.values())
      bytes+=mesh.getTotalVertices()*40+mesh.getTotalIndices()*4;
    return bytes;
  }

  constructor(private readonly scene:Scene,private readonly parent:TransformNode,
    materialOptions:Partial<TerrainMaterialConfig>={},readonly source:GeographicSource=legacyGeography){
    this.heightCache=new TerrainHeightCache((source.meshSpacing??
      TERRAIN_LOD_CONFIG.nearSize/TERRAIN_LOD_CONFIG.nearSubdivisions)/2,(x,z)=>source.heightAt(x,z));
    this.materialConfig={...TERRAIN_MATERIAL_CONFIG,...materialOptions};
    const terrain=createTerrainMaterial(scene,this.materialConfig,!source.streamed);
    this.material=terrain.material;
    this.disposeMaterial=terrain.dispose;
    if(!source.streamed)this.createResidentCoverage();
  }

  private height(x:number,z:number):number{
    return this.heightCache.at(x,z);
  }

  private retainTile(lod:TerrainLod,key:string,tile:Tile):void{
    tile.mesh.setEnabled(false);
    // Count CPU and GPU copies conservatively; retained meshes share materials.
    const indices=tile.mesh.getIndices();
    const indexBytes=ArrayBuffer.isView(indices)?indices.byteLength:tile.mesh.getTotalIndices()*8;
    const bytes=tile.mesh.getTotalVertices()*48*2+indexBytes+tile.mesh.getTotalIndices()*4+4096;
    if(bytes>this.retiredBudget){tile.mesh.dispose(false,false);return;}
    this.retired.set(`${lod}:${key}`,{lod,tile,bytes});this.retiredBytes+=bytes;
    while(this.retiredBytes>this.retiredBudget){
      const oldest=this.retired.keys().next().value!;this.dropRetained(oldest);
    }
  }
  private dropRetained(key:string):void{
    const entry=this.retired.get(key);if(!entry)return;
    this.retired.delete(key);this.retiredBytes-=entry.bytes;entry.tile.mesh.dispose(false,false);
  }
  private restoreTile(lod:TerrainLod,key:string,target:Map<string,Tile>):boolean{
    const cacheKey=`${lod}:${key}`,entry=this.retired.get(cacheKey);if(!entry)return false;
    this.retired.delete(cacheKey);this.retiredBytes-=entry.bytes;this.tileReuses++;
    target.set(key,entry.tile);return true;
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
    // Write directly into the final buffers: no boxed JS arrays, per-vertex
    // slices, or full-buffer copy when a streamed mesh is published.
    const positions=new Float32Array(offsets.length*3),normals=new Float32Array(offsets.length*3);
    const colors=new Float32Array(offsets.length*4),extras=new Float32Array(offsets.length*2);
    let sampled=0;
    for(const [dx,dz] of offsets){
      // Refined river tiles can be much denser than ordinary far tiles. Yield
      // before another batch; publish the mesh only when all buffers are ready.
      const index=sampled++;
      if(index%16===0)yield;
      const x=cell.cx*size+dx,z=cell.cz*size+dz;
      // A shared point must have identical slope, lighting and biome weights
      // in all three LODs, independently of the interior triangle spacing.
      const h=this.height(x,z);
      const nx=this.height(x-eps,z)-this.height(x+eps,z);
      const nz=this.height(x,z-eps)-this.height(x,z+eps);
      const length=Math.hypot(nx,2*eps,nz);
      const p=index*3;
      positions[p]=x-centerX;positions[p+1]=h;positions[p+2]=z-centerZ;
      normals[p]=nx/length;normals[p+1]=2*eps/length;normals[p+2]=nz/length;
      const slope=Math.hypot(nx,nz)/(2*eps);
      const weights=this.source.weightsAt?.(x,z,h,slope)??surfaceWeightsAt(x,z,
        terrainMaterialWeightsAt(x,z,h,slope,this.materialConfig));
      const c=index*4;
      colors[c]=weights[0];colors[c+1]=weights[1];colors[c+2]=weights[2];colors[c+3]=weights[3];
      extras[index*2]=weights[4];extras[index*2+1]=weights[5];
    }
    const mesh=new Mesh(`terreno-${lod}-${cell.cx}-${cell.cz}`,this.scene);
    const data=new VertexData();
    // Match the GPU's existing float32 representation instead of retaining
    // boxed/double JS arrays per streamed tile. Topology indices remain shared.
    data.positions=positions;data.normals=normals;
    data.colors=colors;data.uvs=extras;data.indices=indices;
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
    if(this.source.streamed&&!this.far.has(lodKey(farCell))&&this.validCell('far',farCell)&&
      !this.restoreTile('far',lodKey(farCell),this.far))
      this.far.set(lodKey(farCell),{cell:farCell,mesh:this.createTile('far',farCell)});
    for(const cell of childrenOf(farCell)){
      if(!this.validCell('mid',cell))continue;
      const key=lodKey(cell);
      if(!this.mid.has(key)&&!this.restoreTile('mid',key,this.mid))this.mid.set(key,{cell,mesh:this.createTile('mid',cell)});
    }
    const midCell=cellAt(x,z,TERRAIN_LOD_CONFIG.midSize);
    for(const cell of childrenOf(midCell)){
      if(!this.validCell('near',cell))continue;
      const key=lodKey(cell);
      if(!this.near.has(key)&&!this.restoreTile('near',key,this.near))this.near.set(key,{cell,mesh:this.createTile('near',cell)});
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
      this.landmarkFar.clear();
      for(const cell of this.landmarkCells(x,z))this.landmarkFar.add(lodKey(cell));
      for(const cell of this.horizonCells(x,z))this.desiredFar.add(lodKey(cell));
      for(const [key,tile] of this.far)if(!this.desiredFar.has(key)){
        this.retainTile('far',key,tile);this.far.delete(key);
      }
      for(const key of this.desiredFar)if(!this.far.has(key)&&!this.restoreTile('far',key,this.far)){
        const [cx,cz]=key.split(':').map(Number);this.pending.set(`far:${key}`,{lod:'far',cell:{cx,cz}});
      }
    }
    for(const [key,tile] of this.near)if(!this.desiredNear.has(key)){
      this.retainTile('near',key,tile);this.near.delete(key);
    }
    // A former detailed group remains a valid fallback until its far parent
    // exists. Retiring it first exposes the ocean underneath for several frames.
    this.fallbackMid.clear();
    for(const {cell} of this.mid.values()){
      const parent=parentOf(cell),key=lodKey(parent);
      if(this.desiredFar.has(key)&&!this.far.has(key)&&
        childrenOf(parent).every(child=>this.mid.has(lodKey(child))))
        for(const child of childrenOf(parent))this.fallbackMid.add(lodKey(child));
    }
    for(const [key,tile] of this.mid)if(!this.desiredMid.has(key)&&!this.fallbackMid.has(key)){
      this.retainTile('mid',key,tile);this.mid.delete(key);
    }
    for(const [key,job] of this.pending)if(!(job.lod==='near'?this.desiredNear:job.lod==='mid'?this.desiredMid:this.desiredFar)
      .has(lodKey(job.cell)))this.pending.delete(key);
    for(const key of this.desiredMid)if(!this.mid.has(key)&&!this.restoreTile('mid',key,this.mid)){
      const [cx,cz]=key.split(':').map(Number);
      this.pending.set(`mid:${key}`,{lod:'mid',cell:{cx,cz}});
    }
    for(const key of this.desiredNear)if(!this.near.has(key)&&!this.restoreTile('near',key,this.near)){
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
    // Complete coverage and LOD families along the actual movement corridor
    // before scenery behind the camera. Every sibling must be ready for the
    // existing crack-free parent/children switch to publish a finer surface.
    const speed=Math.hypot(forwardX,forwardZ),reach=Math.min(216,speed*8);
    const group=job.lod==='far'?job.cell:parentOf(job.cell);
    const groupSize=job.lod==='near'?TERRAIN_LOD_CONFIG.midSize:TERRAIN_LOD_CONFIG.farSize;
    for(let ahead=0;ahead<=reach;ahead+=36){
      const px=x+(speed?forwardX/speed*ahead:0),pz=z+(speed?forwardZ/speed*ahead:0);
      if(tileDistance(group,groupSize,px,pz)===0)
        return -4000+ahead*6+(job.lod==='far'?0:job.lod==='mid'?100:200);
    }
    if(job.lod==='far'){
      const distance=tileDistance(job.cell,TERRAIN_LOD_CONFIG.farSize,x,z);
      // Fill visible holes before optional refinement. The off-screen ring is
      // then completed before spending time on finer scenery away from travel.
      return distance<=TERRAIN_LOD_CONFIG.farRadius?-1800+distance*.25:
        -800+(distance-TERRAIN_LOD_CONFIG.farRadius)*.25;
    }
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

  update(x:number,z:number,forwardX=0,forwardZ=0,budgetMs:number=TERRAIN_LOD_CONFIG.generationBudgetMs):boolean{
    // Bootstrap needs only local source data. A missing distant R16 sector must
    // not stall all ready terrain jobs; each build checks its own footprint.
    if(this.source.streamed){
      const cell=cellAt(x,z,TERRAIN_LOD_CONFIG.farSize),s=TERRAIN_LOD_CONFIG.farSize;
      if(!this.source.isReady([cell.cx*s-12,cell.cz*s-12,(cell.cx+1)*s+12,(cell.cz+1)*s+12]))return false;
    }
    // Visibility depends on position and completed tiles, not camera heading.
    // Keep idle frames from rebuilding hundreds of temporary LOD groups/sets.
    // Pending refinement must still advance while the player stands still.
    if(x===this.lastX&&z===this.lastZ&&this.pending.size===0){
      this.lastGenerationMs=0;
      return false;
    }
    const start=performance.now();
    const deadline=start+Math.max(0,budgetMs);
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
    while(this.pending.size&&generated<TERRAIN_LOD_CONFIG.maxGeneratedPerFrame&&performance.now()<deadline){
      // Only the best pending job is needed. Sorting the entire queue repeatedly
      // evaluated the same distance/heading scores O(n log n) times.
      let job=this.activeBuild?this.pending.get(this.activeBuild.key)!:undefined;
      if(!job){
        let best=Infinity;
        for(const candidate of this.pending.values()){
          const score=this.jobScore(candidate,x,z,forwardX,forwardZ);
          if(score<best&&this.jobReady(candidate)){best=score;job=candidate;}
        }
      }
      if(!job)break;
      const jobKey=`${job.lod}:${lodKey(job.cell)}`;
      const target=job.lod==='near'?this.near:job.lod==='mid'?this.mid:this.far;
      const key=lodKey(job.cell);
      if(!target.has(key)){
        if(this.source.preserveDetail){
          this.activeBuild??={key:jobKey,work:this.buildTile(job.lod,job.cell)};
          let result;
          do{result=this.activeBuild.work.next();}
          while(!result.done&&performance.now()<deadline);
          if(!result.done)break;
          target.set(key,{cell:job.cell,mesh:result.value});this.activeBuild=null;
        }else target.set(key,{cell:job.cell,mesh:this.createTile(job.lod,job.cell)});
      }else this.cancelBuild();
      this.pending.delete(jobKey);
      if(job.lod==='far')this.releaseMidFallback(job.cell);
      generated++;
      this.lodVisibilityDirty=true;
    }
    this.lastGenerationMs=performance.now()-start;
    return this.refreshVisibility(x,z);
  }

  private jobReady(job:Job):boolean{
    if(!this.source.streamed)return true;
    const s=TERRAIN_LOD_CONFIG[`${job.lod}Size`],{cx,cz}=job.cell;
    return this.source.isReady([cx*s-12,cz*s-12,(cx+1)*s+12,(cz+1)*s+12]);
  }

  private releaseMidFallback(parent:TerrainCell):void{
    for(const child of childrenOf(parent)){
      const key=lodKey(child);
      if(!this.fallbackMid.delete(key)||this.desiredMid.has(key))continue;
      const tile=this.mid.get(key);
      if(tile){this.retainTile('mid',key,tile);this.mid.delete(key);}
    }
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
      const visible=(tileDistance(cell,TERRAIN_LOD_CONFIG.farSize,x,z)<=
        TERRAIN_LOD_CONFIG.farRadius||this.landmarkFar.has(key))&&!this.readyMid.has(key);
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
    for(const [key,{cell}] of this.mid)if(this.desiredMid.has(key)||this.fallbackMid.has(key)){
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
    for(const [key,{lod,tile}] of this.retired){
      const size=TERRAIN_LOD_CONFIG[`${lod}Size`];
      if(Math.abs((tile.cell.cx+.5)*size-x)<=size*.5+radius&&
        Math.abs((tile.cell.cz+.5)*size-z)<=size*.5+radius)this.dropRetained(key);
    }
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
  }

  /** Called after importing a complete world file or performing undo/redo. */
  reloadEdits():void {
    this.cancelBuild();
    this.heightCache.clear();
    for(const key of this.retired.keys())this.dropRetained(key);
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
  }

  setDebugLayer(layer:TerrainLod|'all'):void{
    this.debugLayer=layer;
    this.lodVisibilityDirty=true;
    if(Number.isFinite(this.lastX))this.refreshVisibility(this.lastX,this.lastZ);
  }

  dispose():void{
    this.disposed=true;this.coverageEpoch++;
    this.cancelBuild();
    this.pending.clear();this.heightCache.clear();
    for(const key of this.retired.keys())this.dropRetained(key);
    for(const group of [this.near,this.mid,this.far]){
      for(const tile of group.values())tile.mesh.dispose(false,false);
      group.clear();
    }
    this.visibleNear.clear();
    this.readyMid.clear();
    this.fallbackMid.clear();
    this.disposeMaterial();
  }
}

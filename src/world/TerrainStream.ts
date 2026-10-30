import { Mesh, Scene, ShaderMaterial, TransformNode, VertexData } from '@babylonjs/core';
import { MAINLAND, sampleMainlandHeight } from './terrainData';
import { createTerrainMaterial, terrainMaterialWeightsAt, TERRAIN_MATERIAL_CONFIG,
  type TerrainMaterialConfig } from './materials/TerrainMaterial';
import { cellAt, childrenOf, lodKey, parentOf, selectGroups, tileDistance,
  TERRAIN_LOD_CONFIG, type TerrainCell, type TerrainLod } from './terrainLod';

type Tile={cell:TerrainCell;mesh:Mesh};
type Job={lod:'near'|'mid';cell:TerrainCell};
const sameSet=(a:Set<string>,b:Set<string>):boolean=>
  a.size===b.size&&[...a].every(key=>b.has(key));

/** A resident coarse mainland guarantees coverage while complete tile groups refine. */
export class TerrainStream {
  private readonly near=new Map<string,Tile>();
  private readonly mid=new Map<string,Tile>();
  private readonly far=new Map<string,Tile>();
  private readonly pending=new Map<string,Job>();
  private readonly desiredNear=new Set<string>();
  private readonly desiredMid=new Set<string>();
  private readonly heightCache=new Map<string,number>();
  private readonly material:ShaderMaterial;
  private readonly disposeMaterial:()=>void;
  private readonly materialConfig:TerrainMaterialConfig;
  private visibleNear=new Set<string>();
  private visibleMid=0;
  private visibleFar=0;
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
    materialOptions:Partial<TerrainMaterialConfig>={}){
    this.materialConfig={...TERRAIN_MATERIAL_CONFIG,...materialOptions};
    const terrain=createTerrainMaterial(scene,this.materialConfig);
    this.material=terrain.material;
    this.disposeMaterial=terrain.dispose;
    this.createResidentCoverage();
    this.heightCache.clear();
  }

  private height(x:number,z:number):number{
    const key=`${x}:${z}`;
    let value=this.heightCache.get(key);
    if(value===undefined){value=sampleMainlandHeight(x,z);this.heightCache.set(key,value);}
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
    const {nearSize,midSize,farSize,nearSubdivisions,midSubdivisions,
      farSubdivisions,skirtDepth}=TERRAIN_LOD_CONFIG;
    const size=lod==='near'?nearSize:lod==='mid'?midSize:farSize;
    const subdiv=lod==='near'?nearSubdivisions:lod==='mid'?midSubdivisions:farSubdivisions;
    const step=size/subdiv,centerX=(cell.cx+.5)*size,centerZ=(cell.cz+.5)*size;
    const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];
    for(let iz=0;iz<=subdiv;iz++)for(let ix=0;ix<=subdiv;ix++){
      const x=cell.cx*size+ix*step,z=cell.cz*size+iz*step;
      const h=this.height(x,z),eps=lod==='near'?.7:step;
      const nx=this.height(x-eps,z)-this.height(x+eps,z);
      const nz=this.height(x,z-eps)-this.height(x,z+eps);
      const length=Math.hypot(nx,2*eps,nz);
      positions.push(x-centerX,h,z-centerZ);
      normals.push(nx/length,2*eps/length,nz/length);
      colors.push(...terrainMaterialWeightsAt(x,z,h,Math.hypot(nx,nz)/(2*eps),
        this.materialConfig));
    }
    const stride=subdiv+1;
    for(let iz=0;iz<subdiv;iz++)for(let ix=0;ix<subdiv;ix++){
      const a=iz*stride+ix,b=a+1,c=a+stride,d=c+1;
      // Babylon's left-handed ground winding keeps the upper surface front-facing.
      indices.push(a,b,c,b,d,c);
    }
    if(lod!=='near'){
      // Coarse edges extend below the canonical surface to cover T-junctions.
      const edges=[
        Array.from({length:stride},(_,i)=>i),
        Array.from({length:stride},(_,i)=>subdiv*stride+i),
        Array.from({length:stride},(_,i)=>i*stride),
        Array.from({length:stride},(_,i)=>i*stride+subdiv)
      ];
      for(const edge of edges){
        const bottoms:number[]=[];
        for(const top of edge){
          const index=positions.length/3;
          positions.push(positions[top*3],positions[top*3+1]-skirtDepth,positions[top*3+2]);
          normals.push(...normals.slice(top*3,top*3+3));
          colors.push(...colors.slice(top*4,top*4+4));
          bottoms.push(index);
        }
        for(let i=0;i<edge.length-1;i++)indices.push(
          edge[i],bottoms[i],edge[i+1],edge[i+1],bottoms[i],bottoms[i+1]);
      }
    }
    const mesh=new Mesh(`terreno-${lod}-${cell.cx}-${cell.cz}`,this.scene);
    const data=new VertexData();
    data.positions=positions;data.normals=normals;data.colors=colors;data.indices=indices;
    data.applyToMesh(mesh);
    mesh.parent=this.parent;
    mesh.position.set(centerX,0,centerZ);
    mesh.material=this.material;
    mesh.useVertexColors=true;
    mesh.isPickable=lod==='near';
    mesh.checkCollisions=false; // The canonical height sampler drives player collision.
    mesh.metadata={terrainChunk:lod==='near',terrainLod:lod,cx:cell.cx,cz:cell.cz};
    mesh.freezeWorldMatrix();
    return mesh;
  }

  private preloadAt(x:number,z:number):void{
    const farCell=cellAt(x,z,TERRAIN_LOD_CONFIG.farSize);
    for(const cell of childrenOf(farCell)){
      const key=lodKey(cell);
      if(!this.mid.has(key))this.mid.set(key,{cell,mesh:this.createTile('mid',cell)});
    }
    const midCell=cellAt(x,z,TERRAIN_LOD_CONFIG.midSize);
    for(const cell of childrenOf(midCell)){
      const key=lodKey(cell);
      if(!this.near.has(key))this.near.set(key,{cell,mesh:this.createTile('near',cell)});
    }
  }

  private refreshTargets(x:number,z:number):void{
    this.desiredMid.clear();this.desiredNear.clear();
    for(const parent of selectGroups(x,z,TERRAIN_LOD_CONFIG.midRadius,
      TERRAIN_LOD_CONFIG.farSize))
      for(const cell of childrenOf(parent))this.desiredMid.add(lodKey(cell));
    for(const parent of selectGroups(x,z,TERRAIN_LOD_CONFIG.nearRadius,
      TERRAIN_LOD_CONFIG.midSize))
      for(const cell of childrenOf(parent))this.desiredNear.add(lodKey(cell));
    for(const [key,tile] of this.near)if(!this.desiredNear.has(key)){
      tile.mesh.dispose(false,false);this.near.delete(key);
    }
    for(const [key,tile] of this.mid)if(!this.desiredMid.has(key)){
      tile.mesh.dispose(false,false);this.mid.delete(key);
    }
    for(const [key,job] of this.pending)if(!(job.lod==='near'?this.desiredNear:this.desiredMid)
      .has(lodKey(job.cell)))this.pending.delete(key);
    for(const key of this.desiredMid)if(!this.mid.has(key)){
      const [cx,cz]=key.split(':').map(Number);
      this.pending.set(`mid:${key}`,{lod:'mid',cell:{cx,cz}});
    }
    for(const key of this.desiredNear)if(!this.near.has(key)){
      const [cx,cz]=key.split(':').map(Number);
      this.pending.set(`near:${key}`,{lod:'near',cell:{cx,cz}});
    }
  }

  private jobScore(job:Job,x:number,z:number,forwardX:number,forwardZ:number):number{
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
      const job=[...this.pending.values()].sort((a,b)=>
        this.jobScore(a,x,z,forwardX,forwardZ)-this.jobScore(b,x,z,forwardX,forwardZ))[0];
      this.pending.delete(`${job.lod}:${lodKey(job.cell)}`);
      const target=job.lod==='near'?this.near:this.mid;
      const key=lodKey(job.cell);
      if(!target.has(key))target.set(key,{cell:job.cell,mesh:this.createTile(job.lod,job.cell)});
      generated++;
    }
    this.lastGenerationMs=performance.now()-start;
    this.heightCache.clear();
    return this.refreshVisibility(x,z);
  }

  private refreshVisibility(x:number,z:number):boolean{
    const midReady=(cell:TerrainCell)=>childrenOf(cell).every(child=>
      this.desiredMid.has(lodKey(child))&&this.mid.has(lodKey(child)));
    const nearReady=(cell:TerrainCell)=>childrenOf(cell).every(child=>
      this.desiredNear.has(lodKey(child))&&this.near.has(lodKey(child)));
    this.visibleFar=0;this.visibleMid=0;
    const nearKeys=new Set<string>();
    for(const {cell,mesh} of this.far.values()){
      const visible=tileDistance(cell,TERRAIN_LOD_CONFIG.farSize,x,z)<=
        TERRAIN_LOD_CONFIG.farRadius&&!midReady(cell);
      if(mesh.isEnabled()!==visible)mesh.setEnabled(visible);
      mesh.isVisible=this.debugLayer==='all'||this.debugLayer==='far';
      if(visible)this.visibleFar++;
    }
    for(const {cell,mesh} of this.mid.values()){
      const visible=midReady(parentOf(cell))&&!nearReady(cell);
      if(mesh.isEnabled()!==visible)mesh.setEnabled(visible);
      mesh.isVisible=this.debugLayer==='all'||this.debugLayer==='mid';
      if(visible)this.visibleMid++;
    }
    for(const [key,{cell,mesh}] of this.near){
      const visible=midReady(parentOf(parentOf(cell)))&&nearReady(parentOf(cell));
      if(mesh.isEnabled()!==visible)mesh.setEnabled(visible);
      mesh.isVisible=this.debugLayer==='all'||this.debugLayer==='near';
      if(visible)nearKeys.add(key);
    }
    const changed=!sameSet(this.visibleNear,nearKeys);
    this.visibleNear=nearKeys;
    return changed;
  }

  setDebugLayer(layer:TerrainLod|'all'):void{
    this.debugLayer=layer;
    if(Number.isFinite(this.lastX))this.refreshVisibility(this.lastX,this.lastZ);
  }

  dispose():void{
    this.pending.clear();this.heightCache.clear();
    for(const group of [this.near,this.mid,this.far]){
      for(const tile of group.values())tile.mesh.dispose(false,false);
      group.clear();
    }
    this.visibleNear.clear();
    this.disposeMaterial();
  }
}

import { AbstractMesh, ImportMeshAsync, Matrix, Mesh, Quaternion, Scene, TransformNode,
  Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { getWorldDocument } from '../editor/WorldEditState';
import { MAINLAND, sampleMainlandHeight } from '../terrainData';
import { nearTerrainHeightAt, nearTerrainSurfaceAt } from '../terrainLod';
import type { VegetationExclusion } from '../vegetationData';
import { GrassWindPlugin } from './GrassWindPlugin';
import { insideFoliageForest } from '../foliageForestConfig';
import { getAuraliaWind } from '../AuraliaWindSystem';

export const GRASS_GLB='/assets/grass/grass_tufts.glb';
const SECTOR_SIZE=MAINLAND.chunkSize;
const SECTOR_REACH=2;
const PACKED_STRIDE=10;
const VARIANTS=['short','medium','tall','flower'] as const;
type Variant=typeof VARIANTS[number];
type Instance={x:number;z:number;matrix:Float32Array};
type SourceLoader=(scene:Scene)=>Promise<readonly AbstractMesh[]>;

const sectorKey=(cx:number,cz:number)=>`${cx}:${cz}`;
const grassVariant=(px:number,pz:number,index:number,flower:number):Variant=>{
  if(flower>.5)return 'flower';
  const hash=(Math.imul(px,73856093)^Math.imul(pz,19349663)^
    Math.imul(index,83492791))>>>0;
  return VARIANTS[hash%3];
};

/** Immutable world-space grass placements batched by sector and GLB mesh. */
export class GrassSectorSystem {
  private readonly sources=new Map<Variant,Mesh>();
  private readonly bases=new Map<Variant,readonly [number,number][]>();
  private readonly sectors=new Map<string,Map<Variant,Instance[]>>();
  private readonly loading:Promise<void>;
  private activeKeys=new Set<string>();
  private centerKey='';
  private enabled=true;
  private dirty=true;
  private disposed=false;
  private drawn=0;
  private triangles=0;
  private draws=0;

  get instanceCount():number{return this.drawn;}
  get triangleCount():number{return this.triangles;}
  get drawCallsEstimate():number{return this.draws;}
  get activeSectorCount():number{
    return [...this.activeKeys].filter(key=>this.sectors.has(key)).length;
  }
  get whenReady():Promise<void>{return this.loading;}

  constructor(private readonly scene:Scene,private readonly parent:TransformNode,
    private readonly exclusions:()=>readonly VegetationExclusion[],
    loader:SourceLoader=async scene=>(await ImportMeshAsync(GRASS_GLB,scene)).meshes){
    this.loading=this.load(loader);
  }

  private async load(loader:SourceLoader):Promise<void>{
    try{
      const imported=await loader(this.scene);
      if(this.disposed){for(const object of imported)object.dispose(false,false);return;}
      const selected=new Set<Mesh>();
      const windMaterials=new Set<object>();
      const wind=getAuraliaWind(this.scene);
      for(const object of imported){
        if(!(object instanceof Mesh)||object.getTotalVertices()===0)continue;
        const match=/grass_(short|medium|tall|flower)/i.exec(object.name);
        if(!match)continue;
        const variant=match[1].toLowerCase() as Variant;
        if(this.sources.has(variant))throw new Error(`Variante GLB duplicada: ${variant}`);
        object.computeWorldMatrix(true);
        object.bakeTransformIntoVertices(object.getWorldMatrix().clone());
        object.parent=null;
        object.position.setAll(0);object.rotation.setAll(0);
        object.rotationQuaternion=null;object.scaling.setAll(1);
        object.parent=this.parent;
        object.isVisible=false;object.isPickable=false;object.checkCollisions=false;
        object.metadata={grassSource:variant};
        if(object.material&&!windMaterials.has(object.material)){
          new GrassWindPlugin(object.material,wind);
          windMaterials.add(object.material);
        }
        this.sources.set(variant,object);selected.add(object);
        const positions=object.getVerticesData('position')??[];
        let bottom=Infinity;
        for(let i=1;i<positions.length;i+=3)bottom=Math.min(bottom,positions[i]);
        const bases:[number,number][]=[];
        for(let i=0;i<positions.length;i+=3)
          if(positions[i+1]<=bottom+.001)bases.push([positions[i],positions[i+2]]);
        this.bases.set(variant,bases.length?bases:[[0,0]]);
      }
      for(const object of imported)if(!selected.has(object as Mesh))object.dispose(false,false);
      for(const variant of VARIANTS)if(!this.sources.has(variant))
        throw new Error(`Falta grass_${variant} en ${GRASS_GLB}`);
      this.rebuildSectors();
      this.dirty=true;
    }catch(error){
      console.warn('[Auralia] No se pudo cargar el pasto GLB:',error);
      for(const mesh of this.sources.values())mesh.dispose(false,false);
      this.sources.clear();this.bases.clear();
    }
  }

  /** World data gives immutable X/Z/yaw/scale. Terrain supplies current height. */
  private rebuildSectors():void{
    this.sectors.clear();
    const grid=new Map<string,number>();
    const heightAtGrid=(x:number,z:number):number=>{
      const key=`${x}:${z}`;
      let height=grid.get(key);
      if(height===undefined){height=sampleMainlandHeight(x,z);grid.set(key,height);}
      return height;
    };
    for(const bake of getWorldDocument().grassBakes){
      const packed=bake.placements;
      for(let offset=0;offset+PACKED_STRIDE<=packed.length;offset+=PACKED_STRIDE){
        const x=packed[offset],z=packed[offset+2],yaw=packed[offset+3];
        const width=packed[offset+4],height=packed[offset+5];
        if(!Number.isFinite(x+z+yaw+width+height)||width<=0||height<=0||
          insideFoliageForest(x,z))continue;
        const variant=grassVariant(bake.px,bake.pz,offset/PACKED_STRIDE,packed[offset+9]);
        const surface=nearTerrainSurfaceAt(x,z,heightAtGrid);
        const matrix=Matrix.Compose(new Vector3(width,height,width),
          Quaternion.RotationAxis(Vector3.Up(),yaw),new Vector3(x,surface.height,z));
        const transform=Float32Array.from(matrix.m);
        transform[1]=surface.slopeX*transform[0]+surface.slopeZ*transform[2];
        transform[9]=surface.slopeX*transform[8]+surface.slopeZ*transform[10];
        let maxGap=0;
        for(const [bx,bz] of this.bases.get(variant)??[]){
          const dx=transform[0]*bx+transform[8]*bz;
          const dz=transform[2]*bx+transform[10]*bz;
          const plane=surface.height+surface.slopeX*dx+surface.slopeZ*dz;
          maxGap=Math.max(maxGap,plane-nearTerrainHeightAt(x+dx,z+dz,heightAtGrid));
        }
        transform[13]=surface.height-maxGap-.005;
        const key=sectorKey(Math.floor(x/SECTOR_SIZE),Math.floor(z/SECTOR_SIZE));
        let sector=this.sectors.get(key);
        if(!sector){sector=new Map();this.sectors.set(key,sector);}
        let list=sector.get(variant);
        if(!list){list=[];sector.set(variant,list);}
        list.push({x,z,matrix:transform});
      }
    }
  }

  /** Player sector changes only the GPU buffers, never a placement's matrix. */
  setFocus(x:number,z:number):void{
    const cx=Math.floor(x/SECTOR_SIZE),cz=Math.floor(z/SECTOR_SIZE);
    const center=sectorKey(cx,cz);
    if(center===this.centerKey)return;
    this.centerKey=center;
    this.activeKeys=new Set<string>();
    for(let dz=-SECTOR_REACH;dz<=SECTOR_REACH;dz++)
      for(let dx=-SECTOR_REACH;dx<=SECTOR_REACH;dx++)
        this.activeKeys.add(sectorKey(cx+dx,cz+dz));
    this.dirty=true;
  }

  update():void{if(this.dirty&&this.sources.size===VARIANTS.length)this.refreshBuffers();}
  refreshExclusions():void{this.dirty=true;}
  refreshBakedGrass():void{
    if(this.sources.size===VARIANTS.length)this.rebuildSectors();
    this.dirty=true;
  }
  setEnabled(enabled:boolean):void{
    if(this.enabled===enabled)return;
    this.enabled=enabled;this.dirty=true;
    if(!enabled)this.refreshBuffers();
  }
  deactivate():void{
    this.activeKeys.clear();this.centerKey='';this.dirty=true;
    if(this.sources.size===VARIANTS.length)this.refreshBuffers();
  }

  private refreshBuffers():void{
    this.dirty=false;this.drawn=0;this.triangles=0;this.draws=0;
    const exclusions=this.exclusions();
    for(const variant of VARIANTS){
      const source=this.sources.get(variant);
      if(!source)continue;
      const matrices:number[]=[];
      if(this.enabled)for(const key of this.activeKeys)
        for(const instance of this.sectors.get(key)?.get(variant)??[]){
          if(exclusions.some(area=>Math.hypot(instance.x-area.x,instance.z-area.z)<
            area.radius+.25))continue;
          matrices.push(...instance.matrix);
        }
      const count=matrices.length/16;
      source.thinInstanceSetBuffer('matrix',count?new Float32Array(matrices):null,16,true);
      source.isVisible=count>0;
      if(count){source.thinInstanceRefreshBoundingInfo();this.draws++;}
      this.drawn+=count;
      this.triangles+=count*source.getTotalIndices()/3;
    }
  }

  dispose():void{
    this.disposed=true;
    for(const source of this.sources.values())source.dispose(false,false);
    this.sources.clear();this.bases.clear();this.sectors.clear();this.activeKeys.clear();
    this.drawn=0;this.triangles=0;this.draws=0;
  }
}

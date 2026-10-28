import { Color3, ImportMeshAsync, Matrix, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { type MaterialId } from '../domain/types';
import { GameStore } from '../domain/GameStore';
import { ASSET_CATALOG, type AssetId } from './assetCatalog';
import { chunkKey, chunkOf, MAINLAND, sampleMainlandHeight } from './terrainData';
import { type VegetationExclusion } from './vegetationData';
import { CRYSTAL_KINDS, PROP_CONFIG, PROP_KINDS, propsForChunk, SPECIAL_ASSETS, type PropKind, type PropPlacement } from './worldPropsData';

type Cell={cx:number;cz:number};
type CrystalKind='cristalAzul'|'cristalCeleste'|'cristalFuego';
type ResourceVisual={placement:PropPlacement;root:TransformNode;glow:Mesh;phase:number};
export type NearbyCrystal={id:string;label:string;resource:MaterialId;amount:number;x:number;z:number;visual:TransformNode};
const crystalInfo:Record<CrystalKind,{label:string;resource:MaterialId;amount:number;color:string}>={
  cristalAzul:{label:'Cristal azul',resource:'spark',amount:1,color:'#8bb9ff'},
  cristalCeleste:{label:'Cristal celeste',resource:'spark',amount:2,color:'#a4edfa'},
  cristalFuego:{label:'Cristal ígneo',resource:'fireCrystal',amount:1,color:'#ff9a59'}
};
const isCrystal=(kind:PropKind):kind is CrystalKind=>CRYSTAL_KINDS.includes(kind);

/** Shared GLBs, streamed decoration and individually identified collectible crystals. */
export class WorldPropSystem {
  private readonly sources=new Map<AssetId,Mesh[]>();
  private readonly chunks=new Map<string,PropPlacement[]>();
  private readonly resources=new Map<string,ResourceVisual>();
  private readonly specialRoots:TransformNode[]=[];
  private readonly glowMaterials=new Map<CrystalKind,StandardMaterial>();
  private pending:Cell[]=[];
  private center:Cell={cx:0,cz:0};
  private ready=false;
  private disposed=false;
  private clock=0;
  private respawnCheck=0;
  get activeChunkCount():number{return this.chunks.size;}
  get visibleDecorationCount():number{return [...this.chunks.values()].flat().filter(p=>!isCrystal(p.kind)&&this.sources.has(p.kind)).length;}
  get activeCrystalCount():number{return this.resources.size;}
  get sharedAssetCount():number{return this.sources.size;}

  constructor(private readonly scene:Scene,private readonly parent:TransformNode,private readonly store:GameStore,
    private readonly exclusions:()=>readonly VegetationExclusion[],private readonly importer:typeof ImportMeshAsync=ImportMeshAsync){}

  /** Every GLB is fetched once. Multi-mesh packs retain all of their primitives and materials. */
  async load():Promise<void>{
    const ids:AssetId[]=[...PROP_KINDS,'crisolHerrero','islaFlotante'];
    await Promise.all(ids.map(async id=>{
      try{
        const imported=await this.importer(ASSET_CATALOG[id].path,this.scene);
        if(this.disposed){for(const mesh of imported.meshes)mesh.dispose(false,false);return;}
        const parts=imported.meshes.filter((mesh):mesh is Mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0);
        if(!parts.length)throw new Error(`GLB sin geometría: ${ASSET_CATALOG[id].path}`);
        for(const [index,mesh] of parts.entries()){
          mesh.computeWorldMatrix(true);
          mesh.bakeTransformIntoVertices(mesh.getWorldMatrix().clone());
          mesh.parent=null;
          mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotation.setAll(0);mesh.rotationQuaternion=null;
          mesh.parent=this.parent;mesh.name=`asset-${id}-${index}`;
          mesh.isVisible=false;mesh.isPickable=false;mesh.checkCollisions=false;
          mesh.metadata={sharedWorldAsset:id};
        }
        for(const mesh of imported.meshes)if(!parts.includes(mesh as Mesh))mesh.dispose(false,false);
        this.sources.set(id,parts);
      }catch(error){console.warn(`[Auralia] No se pudo cargar ${ASSET_CATALOG[id].path}`,error);}
    }));
    if(this.disposed)return;
    this.ready=true;
    for(const special of SPECIAL_ASSETS)this.createSpecial(special);
    this.refreshDecoration();
  }

  private cloneModel(id:AssetId,name:string,root:TransformNode,scale:number):void{
    for(const [index,source] of (this.sources.get(id)??[]).entries()){
      const clone=source.clone(`${name}-${index}`,root,false);
      if(!clone)continue;
      clone.parent=root;clone.position.setAll(0);clone.scaling.setAll(scale);
      clone.rotation.setAll(0);clone.rotationQuaternion=null;
      clone.isVisible=true;clone.isPickable=false;clone.checkCollisions=false;
    }
  }

  private createSpecial(special:typeof SPECIAL_ASSETS[number]):void{
    if(!this.sources.has(special.kind))return;
    const root=new TransformNode(special.id,this.scene);
    root.parent=this.parent;
    root.position.set(special.x,sampleMainlandHeight(special.x,special.z)+special.yOffset,special.z);
    this.cloneModel(special.kind,special.id,root,ASSET_CATALOG[special.kind].referenceScale);
    this.specialRoots.push(root);
  }

  setActiveChunks(cells:readonly Cell[],x:number,z:number):void{
    this.center=chunkOf(x,z);
    const radius=PROP_CONFIG.renderRadiusChunks;
    const desired=cells.filter(cell=>{
      const dx=cell.cx-this.center.cx,dz=cell.cz-this.center.cz;
      return dx*dx+dz*dz<=(radius+.35)**2;
    });
    const keys=new Set(desired.map(cell=>chunkKey(cell.cx,cell.cz)));
    let changed=false;
    for(const [key,placements] of this.chunks)if(!keys.has(key)){
      for(const p of placements){
        const visual=this.resources.get(p.id);
        if(visual){visual.root.dispose(false,false);this.resources.delete(p.id);}
      }
      this.chunks.delete(key);changed=true;
    }
    this.pending=desired.filter(cell=>!this.chunks.has(chunkKey(cell.cx,cell.cz)));
    this.pending.sort((a,b)=>{
      const da=(a.cx+.5-x/MAINLAND.chunkSize)**2+(a.cz+.5-z/MAINLAND.chunkSize)**2;
      const db=(b.cx+.5-x/MAINLAND.chunkSize)**2+(b.cz+.5-z/MAINLAND.chunkSize)**2;
      return da-db;
    });
    if(changed&&this.ready)this.refreshDecoration();
  }

  /** One deterministic placement batch per frame, only while new terrain cells arrive. */
  update(dt:number):void{
    if(!this.ready||this.disposed)return;
    if(this.pending.length){
      const cell=this.pending.shift()!;
      const placements=propsForChunk(cell.cx,cell.cz,this.exclusions());
      this.chunks.set(chunkKey(cell.cx,cell.cz),placements);
      for(const p of placements)if(isCrystal(p.kind))this.createResource(p);
      this.refreshDecoration();
    }
    this.clock+=dt;this.respawnCheck+=dt;
    const check=this.respawnCheck>=1;
    if(check)this.respawnCheck=0;
    for(const visual of this.resources.values()){
      const p=visual.placement;
      visual.root.position.y=p.y+1.15+Math.sin(this.clock*1.6+visual.phase)*.28;
      visual.root.rotation.y=p.yaw+this.clock*.27;
      if(check)visual.root.setEnabled(this.store.resourceReadyAt(p.id)<=Date.now());
    }
  }

  private refreshDecoration():void{
    if(!this.ready)return;
    const matrices=new Map<PropKind,number[]>(PROP_KINDS.map(kind=>[kind,[]]));
    for(const placements of this.chunks.values())for(const p of placements){
      if(isCrystal(p.kind)||!this.sources.has(p.kind))continue;
      const transform=Matrix.Compose(new Vector3(p.scale,p.scale,p.scale),
        Quaternion.RotationAxis(Vector3.Up(),p.yaw),new Vector3(p.x,p.y,p.z));
      matrices.get(p.kind)!.push(...transform.m);
    }
    for(const kind of PROP_KINDS){
      const data=matrices.get(kind)!;
      for(const source of this.sources.get(kind)??[]){
        source.isVisible=data.length>0;
        source.thinInstanceSetBuffer('matrix',new Float32Array(data),16,true);
        if(data.length)source.thinInstanceRefreshBoundingInfo();
      }
    }
  }

  private createResource(p:PropPlacement):void{
    if(!isCrystal(p.kind)||!this.sources.has(p.kind))return;
    const root=new TransformNode(p.id,this.scene);
    root.parent=this.parent;root.position.set(p.x,p.y+1.15,p.z);
    this.cloneModel(p.kind,p.id,root,p.scale);
    let mat=this.glowMaterials.get(p.kind);
    if(!mat){
      mat=new StandardMaterial(`resplandor-${p.kind}`,this.scene);
      mat.diffuseColor=Color3.FromHexString(crystalInfo[p.kind].color);
      mat.emissiveColor=mat.diffuseColor.scale(.45);mat.alpha=.07;
      this.glowMaterials.set(p.kind,mat);
    }
    const glow=MeshBuilder.CreateSphere(`halo-${p.id}`,{diameter:p.scale*.68,segments:8},this.scene);
    glow.parent=root;glow.position.y=p.scale*.42;glow.material=mat;glow.isPickable=false;glow.checkCollisions=false;
    root.setEnabled(this.store.resourceReadyAt(p.id)<=Date.now());
    this.resources.set(p.id,{placement:p,root,glow,phase:(p.x+p.z)*.03});
  }

  nearestResource(x:number,z:number,radius=6.4):NearbyCrystal|null{
    let nearest:NearbyCrystal|null=null,best=radius;
    const now=Date.now();
    for(const visual of this.resources.values()){
      const p=visual.placement;
      if(!isCrystal(p.kind)||this.store.resourceReadyAt(p.id)>now)continue;
      const d=Math.hypot(x-p.x,z-p.z);
      if(d>=best)continue;
      const info=crystalInfo[p.kind];best=d;
      nearest={id:p.id,label:info.label,resource:info.resource,amount:info.amount,x:p.x,z:p.z,visual:visual.root};
    }
    return nearest;
  }

  /** Broad, circular obstacles only for large rocks; saved positions may move out. */
  blocksMovement(nextX:number,nextZ:number,fromX:number,fromZ:number):boolean{
    const {cx,cz}=chunkOf(nextX,nextZ);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const placements=this.chunks.get(chunkKey(cx+dx,cz+dz));
      if(!placements)continue;
      for(const p of placements){
        if(isCrystal(p.kind)||!this.sources.has(p.kind))continue;
        const radius=p.scale*(p.kind==='acantilado2'?.3:p.kind==='mesetaPasto'?.22:.18);
        const d=Math.hypot(nextX-p.x,nextZ-p.z);
        if(d<radius&&d<Math.hypot(fromX-p.x,fromZ-p.z))return true;
      }
    }
    const forge=Math.hypot(nextX-23,nextZ+8);
    return this.sources.has('crisolHerrero')&&forge<2.2&&forge<Math.hypot(fromX-23,fromZ+8);
  }

  collect(id:string):NearbyCrystal|null{
    const visual=this.resources.get(id);
    if(!visual)return null;
    const p=visual.placement;
    if(!isCrystal(p.kind))return null;
    const info=crystalInfo[p.kind];
    if(!this.store.collectResourceNode(id,info.resource,info.amount,PROP_CONFIG.respawnMs))return null;
    visual.root.setEnabled(false);
    const flash=MeshBuilder.CreateSphere(`destello-${id}`,{diameter:1.8,segments:8},this.scene);
    flash.parent=this.parent;flash.position.set(p.x,p.y+2.4,p.z);
    flash.material=this.glowMaterials.get(p.kind)!;flash.isPickable=false;
    setTimeout(()=>flash.dispose(false,false),500);
    return {id,label:info.label,resource:info.resource,amount:info.amount,x:p.x,z:p.z,visual:visual.root};
  }

  refreshFromSave():void{
    for(const [id,visual] of this.resources)visual.root.setEnabled(this.store.resourceReadyAt(id)<=Date.now());
  }

  dispose():void{
    this.disposed=true;this.pending=[];this.chunks.clear();
    for(const visual of this.resources.values())visual.root.dispose(false,false);
    this.resources.clear();
    for(const root of this.specialRoots)root.dispose(false,false);
    for(const parts of this.sources.values())for(const mesh of parts)mesh.dispose(false,false);
    this.sources.clear();
    for(const mat of this.glowMaterials.values())mat.dispose();
  }
}

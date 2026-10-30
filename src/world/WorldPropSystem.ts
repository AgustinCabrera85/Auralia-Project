import { Color3, ImportMeshAsync, Matrix, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { type MaterialId } from '../domain/types';
import { GameStore } from '../domain/GameStore';
import { ASSET_CATALOG, type AssetId } from './assetCatalog';
import { ROCK_PART_COUNT, ROCK_PART_FOOTPRINTS, rockScaleForDiameter } from './rockPackData';
import { RECT_ROCK_PARTS, RECT_ROCK_PART_COUNT } from './rectRockData';
import { RockColliderSystem, type RockSurface, type RockWallHit } from './RockColliderSystem';
import { geologyIntersectsChunk, sameGeologyFormation } from './geologyData';
import { GEOLOGY_COMPOSITIONS, type GeologyComposition } from './geologyPresets';
import { chunkKey, chunkOf, MAINLAND, sampleMainlandHeight } from './terrainData';
import { type VegetationExclusion } from './vegetationData';
import { CRYSTAL_KINDS, GEOLOGY_ASSET_KINDS, PROP_CONFIG, PROP_KINDS, propsForChunk,
  SPECIAL_ASSETS, type PropKind, type PropPlacement } from './worldPropsData';

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
  private readonly formations=new Map<string,GeologyComposition>();
  private readonly resources=new Map<string,ResourceVisual>();
  private readonly specialRoots:TransformNode[]=[];
  private readonly glowMaterials=new Map<CrystalKind,StandardMaterial>();
  private readonly rockColliders:RockColliderSystem;
  private copperMaterial:StandardMaterial|null=null;
  private pending:Cell[]=[];
  private center:Cell={cx:0,cz:0};
  private lastCells:readonly Cell[]=[];
  private focus={x:0,z:0};
  private colliderFocus={x:Infinity,z:Infinity};
  private protectedRockId:string|null=null;
  private ready=false;
  private disposed=false;
  private clock=0;
  private respawnCheck=0;
  get activeChunkCount():number{return this.chunks.size;}
  get visibleDecorationCount():number{return this.allPlacements().filter(p=>!isCrystal(p.kind)&&this.sources.has(p.kind)).length;}
  get activeFormationCount():number{return this.formations.size;}
  get activeFormationIds():string[]{return [...this.formations.keys()];}
  get activeCrystalCount():number{return this.resources.size;}
  get sharedAssetCount():number{return this.sources.size;}
  get activeRockColliderCount():number{return this.rockColliders.activeColliderCount;}

  constructor(private readonly scene:Scene,private readonly parent:TransformNode,private readonly store:GameStore,
    private readonly exclusions:()=>readonly VegetationExclusion[],private readonly importer:typeof ImportMeshAsync=ImportMeshAsync){
    this.rockColliders=new RockColliderSystem(kind=>this.sources.get(kind));
  }

  /** Every GLB is fetched once. Multi-mesh packs retain all of their primitives and materials. */
  async load():Promise<void>{
    const ids:AssetId[]=[...PROP_KINDS,...GEOLOGY_ASSET_KINDS,'crisolHerrero','islaFlotante'];
    await Promise.all(ids.map(async id=>{
      try{
        const imported=await this.importer(ASSET_CATALOG[id].path,this.scene);
        if(this.disposed){for(const mesh of imported.meshes)mesh.dispose(false,false);return;}
        const parts=imported.meshes.filter((mesh):mesh is Mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0);
        if(!parts.length)throw new Error(`GLB sin geometría: ${ASSET_CATALOG[id].path}`);
        if(id==='packRocas'){
          const indexFromName=(mesh:Mesh)=>Number(mesh.name.match(/^tripo_part_(\d+)$/)?.[1]??9999);
          parts.sort((a,b)=>indexFromName(a)-indexFromName(b));
          if(parts.length!==ROCK_PART_COUNT||parts.some((mesh,index)=>indexFromName(mesh)!==index))
            throw new Error(`Rock pack: se esperaban las piezas tripo_part_0 a tripo_part_${ROCK_PART_COUNT-1}`);
        }
        if(id==='rocasRectangulares'){
          parts.sort((a,b)=>RECT_ROCK_PARTS.findIndex(part=>part.name===a.name)-
            RECT_ROCK_PARTS.findIndex(part=>part.name===b.name));
          if(parts.length!==RECT_ROCK_PART_COUNT||parts.some((mesh,index)=>mesh.name!==RECT_ROCK_PARTS[index].name))
            throw new Error(`Rocas rectangulares: se esperaban ${RECT_ROCK_PART_COUNT} piezas catalogadas`);
        }
        for(const [index,mesh] of parts.entries()){
          const collisionOnly=id==='acantilado2'&&mesh.name==='cliff_collision';
          mesh.computeWorldMatrix(true);
          mesh.bakeTransformIntoVertices(mesh.getWorldMatrix().clone());
          if(id==='packRocas'||id==='rocasRectangulares'){
            // The original GLB shows a laid-out collection. Remove that presentation
            // translation and center/ground each rock independently.
            mesh.refreshBoundingInfo(true);
            const bounds=mesh.getBoundingInfo().boundingBox;
            const min=bounds.minimum,max=bounds.maximum;
            mesh.bakeTransformIntoVertices(Matrix.Translation(-(min.x+max.x)*.5,-min.y,-(min.z+max.z)*.5));
            mesh.refreshBoundingInfo(true);
            const centered=mesh.getBoundingInfo().boundingBox;
            const width=Math.max(centered.maximum.x-centered.minimum.x,centered.maximum.z-centered.minimum.z);
            const expected=id==='packRocas'?ROCK_PART_FOOTPRINTS[index]:RECT_ROCK_PARTS[index].footprint;
            if(Math.abs(width-expected)>.001)
              throw new Error(`Rock pack ${id}: la huella de la pieza ${index} cambió (${width})`);
            if(id==='rocasRectangulares'){
              const height=centered.maximum.y-centered.minimum.y;
              if(Math.abs(height-RECT_ROCK_PARTS[index].sourceHeight)>.001)
                throw new Error(`Rocas rectangulares: la altura de la pieza ${index} cambió (${height})`);
            }
          }
          mesh.parent=null;
          mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotation.setAll(0);mesh.rotationQuaternion=null;
          mesh.parent=this.parent;mesh.name=`asset-${id}-${index}`;
          mesh.isVisible=false;mesh.isPickable=false;mesh.checkCollisions=false;
          mesh.metadata={sharedWorldAsset:id,collisionOnly};
        }
        for(const mesh of imported.meshes)if(!parts.includes(mesh as Mesh))mesh.dispose(false,false);
        this.sources.set(id,parts);
      }catch(error){console.warn(`[Auralia] No se pudo cargar ${ASSET_CATALOG[id].path}`,error);}
    }));
    if(this.disposed)return;
    this.ready=true;
    for(const special of SPECIAL_ASSETS)this.createSpecial(special);
    this.refreshDecoration();
    this.syncRockColliders();
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
    this.lastCells=cells;
    this.focus={x,z};
    this.center=chunkOf(x,z);
    const radius=PROP_CONFIG.renderRadiusChunks;
    const desired=cells.filter(cell=>{
      const dx=cell.cx-this.center.cx,dz=cell.cz-this.center.cz;
      return dx*dx+dz*dz<=(radius+.35)**2;
    });
    const keys=new Set(desired.map(cell=>chunkKey(cell.cx,cell.cz)));
    let changed=false;
    for(const [key,placements] of this.chunks)if(!keys.has(key)){
      if(placements.some(p=>p.id===this.protectedRockId))continue;
      for(const p of placements){
        const visual=this.resources.get(p.id);
        if(visual){visual.root.dispose(false,false);this.resources.delete(p.id);}
      }
      this.chunks.delete(key);changed=true;
    }
    for(const composition of GEOLOGY_COMPOSITIONS){
      const active=desired.some(cell=>geologyIntersectsChunk(composition.formation,
        cell.cx,cell.cz,MAINLAND.chunkSize));
      const supported=composition.pieces.some(p=>p.id===this.protectedRockId);
      if(active||supported){
        if(!this.formations.has(composition.formation.id)){
          this.formations.set(composition.formation.id,composition);changed=true;
        }
      }else if(this.formations.delete(composition.formation.id))changed=true;
    }
    this.pending=desired.filter(cell=>!this.chunks.has(chunkKey(cell.cx,cell.cz)));
    this.pending.sort((a,b)=>{
      const da=(a.cx+.5-x/MAINLAND.chunkSize)**2+(a.cz+.5-z/MAINLAND.chunkSize)**2;
      const db=(b.cx+.5-x/MAINLAND.chunkSize)**2+(b.cz+.5-z/MAINLAND.chunkSize)**2;
      return da-db;
    });
    if(changed&&this.ready)this.refreshDecoration();
    this.syncRockColliders();
  }

  /** Rebuild collider instances only after meaningful movement or a support change. */
  setColliderFocus(x:number,z:number,protectedRockId:string|null=null):void{
    const supportChanged=protectedRockId!==this.protectedRockId&&
      !(protectedRockId&&this.protectedRockId&&
        sameGeologyFormation(protectedRockId,this.protectedRockId));
    this.focus={x,z};
    this.protectedRockId=protectedRockId;
    if(supportChanged){
      this.setActiveChunks(this.lastCells,x,z);
      return;
    }
    if(Math.hypot(x-this.colliderFocus.x,z-this.colliderFocus.z)>8)this.syncRockColliders();
  }

  private syncRockColliders():void{
    if(!this.ready)return;
    const protectedIds=new Set<string>();
    if(this.protectedRockId)protectedIds.add(this.protectedRockId);
    for(const composition of this.formations.values())if(composition.pieces.some(p=>p.id===this.protectedRockId))
      for(const piece of composition.pieces)protectedIds.add(piece.id);
    this.rockColliders.sync(this.allPlacements(),this.focus.x,this.focus.z,protectedIds);
    this.colliderFocus={...this.focus};
  }

  private allPlacements():PropPlacement[]{
    return [...this.chunks.values()].flat().concat(
      [...this.formations.values()].flatMap(composition=>composition.pieces));
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
      this.syncRockColliders();
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
    const renderKinds:PropKind[]=[...PROP_KINDS,...GEOLOGY_ASSET_KINDS];
    const matrices=new Map<PropKind,number[]>(renderKinds.map(kind=>[kind,[]]));
    const rockMatrices:number[][]=Array.from({length:ROCK_PART_COUNT},()=>[]);
    const rectMatrices:number[][]=Array.from({length:RECT_ROCK_PART_COUNT},()=>[]);
    for(const p of this.allPlacements()){
      if(isCrystal(p.kind)||!this.sources.has(p.kind))continue;
      const transform=Matrix.Compose(new Vector3(p.scaleXZ??p.scale,p.scaleY??p.scale,p.scaleXZ??p.scale),
        Quaternion.RotationAxis(Vector3.Up(),p.yaw),new Vector3(p.x,p.y,p.z));
      if(p.kind==='packRocas')rockMatrices[p.partIndex??0]?.push(...transform.m);
      else if(p.kind==='rocasRectangulares')rectMatrices[p.pieceIndex??0]?.push(...transform.m);
      else matrices.get(p.kind)!.push(...transform.m);
    }
    for(const kind of renderKinds){
      for(const [index,source] of (this.sources.get(kind)??[]).entries()){
        if(source.metadata?.collisionOnly===true)continue;
        // Exactly ONE part per procedural placement, not all 17 parts.
        const data=kind==='packRocas'?(rockMatrices[index]??[]):
          kind==='rocasRectangulares'?(rectMatrices[index]??[]):matrices.get(kind)!;
        if(!data.length){
          if(source.thinInstanceCount){
            source.thinInstanceSetBuffer('matrix',null,16,true);
            source.refreshBoundingInfo(true);
          }
          source.isVisible=false;
          continue;
        }
        source.thinInstanceSetBuffer('matrix',new Float32Array(data),16,true);
        source.thinInstanceRefreshBoundingInfo();
        source.isVisible=true;
      }
    }
  }

  /** Reuse the rock pack for existing town/island stone and copper nodes. */
  attachRockVisual(root:TransformNode,partIndex:number,diameter:number,copper=false):boolean{
    const source=this.sources.get('packRocas')?.[partIndex];
    if(!source)return false;
    const clone=source.clone(`roca-${partIndex}-${root.name}`,root,false);
    if(!clone)return false;
    clone.parent=root;clone.position.setAll(0);clone.rotation.setAll(0);
    clone.rotationQuaternion=null;clone.scaling.setAll(rockScaleForDiameter(partIndex,diameter));
    clone.isVisible=true;clone.isPickable=false;clone.checkCollisions=false;
    if(copper){
      if(!this.copperMaterial){
        this.copperMaterial=new StandardMaterial('veta-cobre-roca',this.scene);
        this.copperMaterial.diffuseColor=Color3.FromHexString('#cc8651');
        this.copperMaterial.emissiveColor=Color3.FromHexString('#4b2314');
      }
      // Low-poly warm vein distinguishes copper without reintroducing a sphere.
      const vein=MeshBuilder.CreatePolyhedron(`veta-${root.name}`,{type:1,size:Math.max(.16,diameter*.18)},this.scene);
      vein.parent=root;vein.position.set(diameter*.14,diameter*.52,0);
      vein.rotation.z=.3;vein.material=this.copperMaterial;vein.isPickable=false;
    }
    return true;
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

  queryRockGround(x:number,z:number,originY:number,maxDistance:number,footRadius=0):RockSurface|null{
    return this.rockColliders.queryGround(x,z,originY,maxDistance,footRadius);
  }

  queryRockSolidTop(x:number,z:number,originY:number,maxDistance:number,rockId?:string):RockSurface|null{
    return this.rockColliders.querySolidTop(x,z,originY,maxDistance,rockId);
  }

  queryCameraObstruction(from:Vector3,to:Vector3):number|null{
    return this.rockColliders.queryCameraObstruction(from,to);
  }

  queryRockWall(x:number,y:number,z:number,dirX:number,dirZ:number,maxDistance:number):RockWallHit|null{
    return this.rockColliders.queryWall(x,y,z,dirX,dirZ,maxDistance);
  }

  hasRockHeadroom(x:number,y:number,z:number,height:number,ignoreRockId?:string):boolean{
    return this.rockColliders.hasOverheadClearance(x,y,z,height,ignoreRockId);
  }

  /** Remaining simple props and the forge; rock faces use their real triangles. */
  blocksMovement(nextX:number,nextZ:number,fromX:number,fromZ:number,includeRockWalls=true):boolean{
    if(includeRockWalls){
      const dx=nextX-fromX,dz=nextZ-fromZ,distance=Math.hypot(dx,dz);
      if(distance>0){
        const wall=this.queryRockWall(fromX,sampleMainlandHeight(fromX,fromZ)+1.2,fromZ,dx,dz,distance+.6);
        if(wall&&wall.distance<=distance+.6)return true;
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
    this.disposed=true;this.pending=[];this.chunks.clear();this.formations.clear();
    this.rockColliders.dispose();
    for(const visual of this.resources.values())visual.root.dispose(false,false);
    this.resources.clear();
    for(const root of this.specialRoots)root.dispose(false,false);
    for(const parts of this.sources.values())for(const mesh of parts)mesh.dispose(false,false);
    this.sources.clear();
    for(const mat of this.glowMaterials.values())mat.dispose();
    this.copperMaterial?.dispose();
  }
}

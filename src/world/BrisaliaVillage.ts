import { LoadAssetContainerAsync, Material, Matrix, Mesh, Quaternion, Ray, Scene,
  TransformNode, Vector3, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';
import { BRISALIA_BUILDINGS, CASTLE_BUILDING, BRISALIA_SCALE, brisaliaRoadEdge, inBrisaliaFootprint,
  type BrisaliaBuilding } from './brisaliaLayout';
import { createVillageRoadMaterial } from './materials/VillageRoadMaterial';
import { BrisaliaCastleIvy } from './BrisaliaCastleIvy';
import { brisaliaRev3ResourceUrl } from './BrisaliaAssetUrls';
import { BrisaliaEntranceLanterns, entranceLampMount } from './BrisaliaEntranceLanterns';
import { shareTextureSourceBuffers } from './SharedTextureBuffers';
import { gpuAssetUrl, gpuBuildingResourceUrl } from './GpuAssets';
import { repairWoodSolids } from './RepairWoodSolids';
import { BrisaliaFountain } from './BrisaliaFountain';
import { StaticVerticalIndex } from './StaticVerticalIndex';
import { CASTLE_ENTRIES, castleEntryGeometry, castleEntryHeight, type CastleEntry } from './CastleEntryGeometry';
import type { PalacePlacement } from './geography/NacarPalace';

/** The playable settlement, with one independent prefab per building ID. */
export class BrisaliaVillage {
  readonly buildings=new Map<string,{root:TransformNode;meshes:Mesh[];sourceMeshes:number}>();
  readonly errors:string[]=[];
  surfaceRevision=0;
  readonly ready:Promise<void>;
  readonly lanterns:BrisaliaEntranceLanterns;
  readonly fountain:BrisaliaFountain;
  private disposed=false;
  private roads:Mesh|null=null;
  private castleIvy:BrisaliaCastleIvy|null=null;
  private readonly buildingHeights=new Map<string,number>();
  private readonly rainCells=new Map<string,Mesh[]>();
  private readonly solids:Mesh[]=[];
  private readonly verticalIndices=new Map<Mesh,StaticVerticalIndex>();
  private readonly entryFloors:{kind:CastleEntry;mesh:Mesh;inverse:Matrix}[]=[];
  constructor(private scene:Scene,private parent:TransformNode,
    readonly origin:{x:number;z:number},private heightAt:(x:number,z:number)=>number,
    private palace?:PalacePlacement){
    this.lanterns=new BrisaliaEntranceLanterns(scene);
    const fountainX=origin.x,fountainZ=origin.z-65*BRISALIA_SCALE;
    this.fountain=new BrisaliaFountain(scene,parent,new Vector3(fountainX,heightAt(fountainX,fountainZ),fountainZ));
    this.createRoads();
    // These terrain tiles can be evicted while the asynchronous GLBs load.
    for(const b of BRISALIA_BUILDINGS)this.buildingHeights.set(b.id,heightAt(origin.x+b.x,origin.z+b.z));
    this.ready=Promise.all([this.load(),this.fountain.ready.then(()=>{
      if(this.disposed)return;
      if(this.fountain.error)this.errors.push(`fountain: ${this.fountain.error}`);
      else this.registerSolids(this.fountain.meshes);
    })]).then(()=>{});
  }
  private async load():Promise<void>{
    const queue=[...BRISALIA_BUILDINGS,...(this.palace?[CASTLE_BUILDING]:[])];
    // Shared glTF image URLs reuse Babylon's internal GPU texture cache.
    // Bound simultaneous decoding/upload; the castle loads once, last.
    await Promise.all([0,1].map(async()=>{
      while(queue.length&&!this.disposed){
        const b=queue.shift()!;
        try{await this.loadBuilding(b);}catch(error){
          this.errors.push(`${b.id}: ${String(error)}`);console.error('[Brisalia]',b.id,error);
        }
      }
    }));
  }
  private async loadBuilding(b:BrisaliaBuilding):Promise<void>{
    const originalUrl=`/assets/buildings/${b.assetRoot}/${b.file}`;
    const url=gpuAssetUrl(originalUrl,this.scene);
    const asset=await LoadAssetContainerAsync(url,this.scene,
      b.revision===3||url!==originalUrl?{pluginOptions:{gltf:{preprocessUrlAsync:async resource=>
        url!==originalUrl?gpuBuildingResourceUrl(resource,location.href):
          brisaliaRev3ResourceUrl(resource,location.href)}}}:undefined);
    if(this.disposed){asset.dispose();return;}
    shareTextureSourceBuffers(asset.textures);
    const axes=new TransformNode(`${b.id}:axis-conversion`,this.scene);
    let placedRoot:TransformNode|undefined;
    try{
    asset.addAllToScene();
    // Babylon's glTF LH root flips X. This cancels that half-turn so Blender
    // (X,Y,Z) maps to game (X,Z,Y), retaining the source UVs and metre scale.
    axes.rotation.y=Math.PI;
    for(const root of asset.rootNodes)root.parent=axes;
    for(const node of asset.transformNodes){
      if(!node.name.includes('hinged_leaf_'))continue;
      const side=node.name.endsWith('_-1')?-1:1;
      node.rotationQuaternion=(node.rotationQuaternion??Quaternion.Identity()).multiply(
        Quaternion.RotationAxis(Vector3.Up(),-side*100*Math.PI/180));
    }
    const parts=asset.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
    if(b.revision===3)for(const mesh of parts){
      if(!/oak/i.test(mesh.material?.name??''))continue;
      const positions=mesh.getVerticesData('position'),normals=mesh.getVerticesData('normal'),indices=mesh.getIndices();
      if(!positions||!normals||!indices)continue;
      const repair=repairWoodSolids(positions,normals,indices);if(!repair)continue;
      mesh.makeGeometryUnique();mesh.setIndices(repair.indices);mesh.setVerticesData('normal',repair.normals);
      const tangents=mesh.getVerticesData('tangent');
      if(tangents){const fixed=new Float32Array(tangents);for(const v of repair.flippedVertices)fixed[v*4+3]*=-1;mesh.setVerticesData('tangent',fixed);}
      mesh.metadata={...mesh.metadata,repairedWoodComponents:repair.components};
    }
    const entryMaterials=new Map<CastleEntry,{material:Material;transform:Matrix;bounds:{min:number[];max:number[]}}>();
    if(b.id==='B28'&&b.revision===5)for(const kind of ['gate','hall'] as const){
      const name=`R5_${kind.toUpperCase()}`;
      const source=parts.find(m=>m.name===`${name}_continuous_vault`);
      if(source?.material){
        source.computeWorldMatrix(true);
        const bounds=source.getBoundingInfo().boundingBox;
        entryMaterials.set(kind,{material:source.material,
          transform:Matrix.Scaling(1,1,-1).multiply(source.getWorldMatrix()),
          bounds:{min:bounds.minimumWorld.asArray(),max:bounds.maximumWorld.asArray()}});
        for(let i=parts.length-1;i>=0;i--)if([`${name}_continuous_vault`,`${name}_threshold_landing`].includes(parts[i].name)||
          parts[i].name.startsWith(`${name}_parapet_pier_`)||parts[i].name.startsWith(`${name}_rising_parapet_`))parts.splice(i,1);
      }
    }
    if(b.id==='B28'&&b.revision===5)for(const mesh of parts){
      if(!/^AUR034_WING60_floor_-?1_0$/.test(mesh.name))continue;
      // The authored ground-floor slabs stop 17 cm short of the inner wall.
      // Extend their horizontal edges into the masonry before batching, so
      // lowering the soil cannot expose grass through a perimeter gap. These
      // two meshes are centered on local X/Z; keep floor and stair heights.
      const half=mesh.getBoundingInfo().boundingBox.extendSize;
      mesh.scaling.x*=(half.x+.25)/half.x;
      mesh.scaling.z*=(half.z+.25)/half.z;
    }
    const palace=b.id==='B28'?this.palace:undefined;
    const root=new TransformNode(`${palace?'nacar':'brisalia'}:${b.id}`,this.scene);
    placedRoot=root;
    root.parent=this.parent;
    root.position.set(palace?.x??this.origin.x+b.x,palace?.groundHeight??this.buildingHeights.get(b.id)!,
      palace?.z??this.origin.z+b.z);
    root.scaling.setAll(BRISALIA_SCALE);
    root.rotation.y=(palace?.yaw??b.yaw)*Math.PI/180;
    root.metadata={buildingId:b.id,revision:b.revision,sourceAsset:`${b.assetRoot}/${b.file}`,
      sourceMetersToWorldUnits:BRISALIA_SCALE,region:palace?'nacar':'brisalia'};
    if(b.id==='B28'){
      axes.setEnabled(false);root.setEnabled(false);
      const ivy=new BrisaliaCastleIvy(this.scene,parts,root);this.castleIvy=ivy;
      await ivy.volume.ready;
      if(this.disposed){axes.dispose(false,false);root.dispose(false,false);return;}
    }
    const groups=new Map<string,Mesh[]>();
    const anchors:{name:string;min:number[];max:number[]}[]=[];
    for(const mesh of parts){
      mesh.computeWorldMatrix(true);
      const bounds=mesh.getBoundingInfo().boundingBox,center=bounds.centerWorld;
      if(b.revision===3&&/entry_leaf|arched_leaf|PUERTA_Puerta_principal|west_portal_leaf|daisies|herbs|herb_volume|window/i.test(mesh.name))
        anchors.push({name:mesh.name,min:bounds.minimumWorld.asArray(),max:bounds.maximumWorld.asArray()});
      // Spatial batches keep castle culling and triangle collision local.
      const cell=b.id==='B28'?`${Math.floor(center.x/12)}:${Math.floor(center.z/12)}`:'all';
      // Baked wear and crossed foliage are visual layers, not physical walls.
      const decorative=b.revision===3&&/corner_wear|joint_wear|foundation_weathering|stone_joint_moss|herbs|herb_volume|daisies/i.test(mesh.name);
      const attributes=mesh.getVerticesDataKinds().sort().join(',');
      const key=`${mesh.material?.uniqueId}:${cell}:${attributes}:${decorative?'visual':'solid'}`;
      const list=groups.get(key)??[];list.push(mesh);groups.set(key,list);
    }
    if(b.revision===3)root.metadata.authoredAnchors=anchors;
    const lampMount=b.revision===3?entranceLampMount(b.id,parts):null;
    const meshes:Mesh[]=[];
    for(const [key,group] of groups){
      const mesh=Mesh.MergeMeshes(group,false,true,undefined,false,true);
      if(!mesh)throw new Error(`Cannot batch ${b.id}/${key}`);
      mesh.name=`${b.id}:batch:${key}`;mesh.parent=root;
      mesh.isPickable=true;mesh.checkCollisions=false;
      mesh.metadata={buildingId:b.id,buildingCollision:!key.endsWith(':visual'),
        sourceNames:group.map(part=>part.name),repairedWoodComponents:group.reduce((n,part)=>n+(part.metadata?.repairedWoodComponents??0),0)};
      mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();meshes.push(mesh);
    }
    for(const [kind,{material,transform,bounds}] of entryMaterials){
      const mesh=new Mesh(`B28:${kind}-continuous-entry`,this.scene),data=new VertexData();
      Object.assign(data,castleEntryGeometry(kind));data.applyToMesh(mesh);
      mesh.material=material;mesh.parent=root;mesh.isPickable=true;mesh.checkCollisions=false;
      mesh.rotationQuaternion=Quaternion.Identity();
      transform.decompose(mesh.scaling,mesh.rotationQuaternion,mesh.position);
      mesh.metadata={buildingId:b.id,castleEntry:kind,buildingCollision:true,sourceEntryBounds:bounds};
      mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();meshes.push(mesh);
      this.entryFloors.push({kind,mesh,inverse:Matrix.Invert(mesh.getWorldMatrix())});
    }
    // Materials/textures are still referenced by the batches; only the original
    // draw objects and transform hierarchy are discarded.
    axes.dispose(false,false);
    root.setEnabled(true);
    if(lampMount)this.lanterns.add(b.id,root,meshes,lampMount);
    this.buildings.set(b.id,{root,meshes,sourceMeshes:parts.length+entryMaterials.size});
    this.registerSolids(meshes);
    }catch(error){
      placedRoot?.dispose(false,false);axes.dispose(false,false);asset.dispose();throw error;
    }
  }
  private registerSolids(meshes:readonly Mesh[]):void{
    this.surfaceRevision++;
    for(const mesh of meshes){
      if(mesh.metadata?.buildingCollision===false)continue;
      this.solids.push(mesh);
      this.verticalIndices.set(mesh,new StaticVerticalIndex(mesh));
      const box=mesh.getBoundingInfo().boundingBox;
      for(let x=Math.floor(box.minimumWorld.x/16);x<=Math.floor(box.maximumWorld.x/16);x++)
        for(let z=Math.floor(box.minimumWorld.z/16);z<=Math.floor(box.maximumWorld.z/16);z++){
          const key=`${x}:${z}`,cell=this.rainCells.get(key)??[];cell.push(mesh);this.rainCells.set(key,cell);
        }
    }
  }
  private createRoads():void{
    // Signed union with a feathered, irregular shoulder. It is baked once,
    // so turning the camera never changes the path and adds no per-frame work.
    const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
    const variation=(x:number,z:number)=>Math.sin(x*.29+Math.sin(z*.17))*Math.cos(z*.31+x*.09);
    const field=brisaliaRoadEdge;
    const positions:number[]=[],indices:number[]=[],uvs:number[]=[],colors:number[]=[];
    const vertices=new Map<string,number>();
    const vertex=(x:number,z:number)=>{
      const key=`${x}:${z}`,existing=vertices.get(key);if(existing!==undefined)return existing;
      const n=positions.length/3,wx=this.origin.x+x,wz=this.origin.z+z,d=field(x,z);
      positions.push(wx,this.heightAt(wx,wz)+.045,wz);uvs.push(x/12,z/12);
      // Green is the inlay envelope; alpha still preserves the original dirt shoulder.
      colors.push(.94+variation(x*.22,z*.22)*.15,1-smooth(-4,-1.4,d),.27+smooth(-4,0,d)*.45,1-smooth(-1.1,1.3,d));
      vertices.set(key,n);return n;
    };
    for(let z=Math.floor(-140*BRISALIA_SCALE);z<14*BRISALIA_SCALE;z++)for(let x=Math.floor(-128*BRISALIA_SCALE);x<178*BRISALIA_SCALE;x++){
      const cx=x+.5,cz=z+.5;
      if(inBrisaliaFootprint(cx,cz,.05))continue;
      if(field(cx,cz)>2)continue;
      const a=vertex(x,z),b=vertex(x+1,z),c=vertex(x,z+1),d=vertex(x+1,z+1);
      indices.push(a,b,c,b,d,c);
    }
    const mesh=new Mesh('brisalia:connected-streets',this.scene),data=new VertexData();
    data.positions=new Float32Array(positions);data.indices=new Uint32Array(indices);
    data.uvs=new Float32Array(uvs);data.colors=new Float32Array(colors);
    const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);data.normals=new Float32Array(normals);data.applyToMesh(mesh);
    mesh.material=createVillageRoadMaterial(this.scene,BRISALIA_SCALE);mesh.parent=this.parent;mesh.isPickable=false;
    mesh.hasVertexAlpha=true;mesh.freezeWorldMatrix();
    this.roads=mesh;
  }
  private cast(ray:Ray){
    let nearest:ReturnType<Ray['intersectsMesh']>|null=null;
    const end=ray.origin.add(ray.direction.scale(ray.length));
    const lo=Vector3.Minimize(ray.origin,end),hi=Vector3.Maximize(ray.origin,end);
    // Reuse the existing spatial buckets for camera/ground rays as well as
    // rain. Immediate orbit checks need not visit every building in town.
    const candidates=new Set<Mesh>();
    for(let x=Math.floor(lo.x/16);x<=Math.floor(hi.x/16);x++)
      for(let z=Math.floor(lo.z/16);z<=Math.floor(hi.z/16);z++)
        for(const mesh of this.rainCells.get(`${x}:${z}`)??[])candidates.add(mesh);
    for(const mesh of candidates){
      if(mesh.isDisposed()||!mesh.isEnabled())continue;
      if(mesh.metadata?.buildingCollision===false)continue;
      const bounds=mesh.getBoundingInfo().boundingBox;
      const a=bounds.minimumWorld,b=bounds.maximumWorld;
      if(b.x<lo.x||a.x>hi.x||b.y<lo.y||a.y>hi.y||b.z<lo.z||a.z>hi.z)continue;
      if(!ray.intersectsBoxMinMax(bounds.minimumWorld,bounds.maximumWorld))continue;
      const hit=ray.intersectsMesh(mesh,false);
      if(hit.hit&&hit.distance<=ray.length&&(!nearest||hit.distance<nearest.distance))nearest=hit;
    }
    return nearest;
  }
  ground(x:number,z:number,origin:number,distance:number){
    const hit=this.vertical(x,z,origin,distance);
    return hit&&hit.normalY>.55?{height:hit.height,normalY:hit.normalY,rockId:`building:${hit.mesh.metadata?.buildingId}`}:null;
  }
  /** Rescue old saved positions/deep penetrations inside the repaired entries,
   * without pulling a normally stepping or jumping player onto the landing. */
  entryStepHeightAt(x:number,z:number):number|null{
    for(const {kind,mesh,inverse} of this.entryFloors){
      if(!mesh.isEnabled())continue;
      const local=Vector3.TransformCoordinates(new Vector3(x,0,z),inverse),c=CASTLE_ENTRIES[kind];
      if(Math.abs(local.x)<=c.width/2+.4&&local.z>=c.front-1&&local.z<=c.back+.5)
        return .22*BRISALIA_SCALE;
    }
    return null;
  }
  entryRecoveryAt(x:number,y:number,z:number):number|null{
    for(const {kind,mesh,inverse} of this.entryFloors){
      if(mesh.isDisposed()||!mesh.isEnabled())continue;
      const local=Vector3.TransformCoordinates(new Vector3(x,y,z),inverse);
      const top=castleEntryHeight(kind,local.x,local.z),c=CASTLE_ENTRIES[kind];
      if(top===null||Math.abs(local.x)>c.width/2-.1||local.y>=top-.26||local.y<c.base-.3)continue;
      return Vector3.TransformCoordinates(new Vector3(local.x,top,local.z),mesh.getWorldMatrix()).y;
    }
    return null;
  }
  private vertical(x:number,z:number,origin:number,distance:number,up=false){
    let nearest:({height:number;normalY:number;distance:number;mesh:Mesh})|null=null;
    for(const mesh of this.rainCells.get(`${Math.floor(x/16)}:${Math.floor(z/16)}`)??[]){
      if(mesh.isDisposed()||!mesh.isEnabled()||mesh.metadata?.buildingCollision===false)continue;
      const hit=this.verticalIndices.get(mesh)?.hit(x,z,origin,distance,up);
      if(hit&&(!nearest||hit.distance<nearest.distance))nearest={...hit,mesh};
    }
    return nearest;
  }
  /** Top exposed geometry; broad phase stores references, without copying triangles. */
  rainHeight(x:number,z:number):number|null{
    return this.vertical(x,z,768,1024)?.height??null;
  }
  wall(x:number,y:number,z:number,dx:number,dz:number,reach:number){
    const direction=new Vector3(dx,0,dz).normalize();
    const hit=this.cast(new Ray(new Vector3(x,y,z),direction,reach));
    if(!hit?.pickedPoint)return null;
    const n=hit.getNormal(true);if(!n||Math.abs(n.y)>.75)return null;
    return {pointX:hit.pickedPoint.x,pointY:hit.pickedPoint.y,pointZ:hit.pickedPoint.z,
      distance:hit.distance,normalX:n.x,normalY:n.y,normalZ:n.z,climbable:false,rockId:`building:${hit.pickedMesh?.metadata?.buildingId}`};
  }
  headroom(x:number,y:number,z:number,height:number):boolean{
    return !this.vertical(x,z,y+.15,height-.15,true);
  }
  cameraObstruction(from:Vector3,to:Vector3):number|null{
    const d=to.subtract(from),length=d.length();
    return length>0?this.cast(new Ray(from,d.scale(1/length),length))?.distance??null:null;
  }
  dispose():void{
    this.entryFloors.length=0;
    this.verticalIndices.clear();
    this.rainCells.clear();
    this.disposed=true;
    this.solids.length=0;this.fountain.dispose();
    this.lanterns.dispose();
    this.castleIvy?.dispose();this.castleIvy=null;
    const materials=new Set<Material>();
    for(const b of this.buildings.values()){
      for(const m of b.meshes)if(m.material)materials.add(m.material);
      b.root.dispose(false,false);
    }
    for(const m of materials)m.dispose(false,true);
    // The road samples the shared sunlight map; only its own textures belong to it.
    this.roads?.material?.dispose();this.roads?.dispose(false,false);this.buildings.clear();
  }
}

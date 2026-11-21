import { LoadAssetContainerAsync, Material, Mesh, Quaternion, Ray, Scene,
  TransformNode, Vector3, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';
import { BRISALIA_BUILDINGS, BRISALIA_SCALE, brisaliaRoadEdge, inBrisaliaFootprint,
  type BrisaliaBuilding } from './brisaliaLayout';
import { createVillageRoadMaterial } from './materials/VillageRoadMaterial';
import { BrisaliaCastleIvy } from './BrisaliaCastleIvy';
import { brisaliaRev3ResourceUrl } from './BrisaliaAssetUrls';
import { BrisaliaEntranceLanterns, entranceLampMount } from './BrisaliaEntranceLanterns';
import { shareTextureSourceBuffers } from './SharedTextureBuffers';
import { gpuAssetUrl, gpuBuildingResourceUrl } from './GpuAssets';
import { repairWoodSolids } from './RepairWoodSolids';

/** The playable settlement, with one independent prefab per building ID. */
export class BrisaliaVillage {
  readonly buildings=new Map<string,{root:TransformNode;meshes:Mesh[];sourceMeshes:number}>();
  readonly errors:string[]=[];
  readonly ready:Promise<void>;
  readonly lanterns:BrisaliaEntranceLanterns;
  private disposed=false;
  private roads:Mesh|null=null;
  private castleIvy:BrisaliaCastleIvy|null=null;
  private readonly buildingHeights=new Map<string,number>();
  constructor(private scene:Scene,private parent:TransformNode,
    readonly origin:{x:number;z:number},private heightAt:(x:number,z:number)=>number){
    this.lanterns=new BrisaliaEntranceLanterns(scene);
    this.createRoads();
    // These terrain tiles can be evicted while the asynchronous GLBs load.
    for(const b of BRISALIA_BUILDINGS)this.buildingHeights.set(b.id,heightAt(origin.x+b.x,origin.z+b.z));
    this.ready=this.load();
  }
  private async load():Promise<void>{
    const queue=[...BRISALIA_BUILDINGS];
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
    const gateLanding=b.id==='B28'&&b.revision===5?parts.find(m=>m.name==='R5_GATE_threshold_landing'):undefined;
    if(gateLanding)parts.splice(parts.indexOf(gateLanding),1);
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
    const root=new TransformNode(`brisalia:${b.id}`,this.scene);
    placedRoot=root;
    root.parent=this.parent;
    root.position.set(this.origin.x+b.x,this.buildingHeights.get(b.id)!-
      (b.id==='B28'?1.35*BRISALIA_SCALE:0),this.origin.z+b.z);
    root.scaling.setAll(BRISALIA_SCALE);
    root.rotation.y=b.yaw*Math.PI/180;
    root.metadata={buildingId:b.id,revision:b.revision,sourceAsset:`${b.assetRoot}/${b.file}`,
      sourceMetersToWorldUnits:BRISALIA_SCALE};
    if(b.id==='B28'){
      axes.setEnabled(false);root.setEnabled(false);
      const ivy=new BrisaliaCastleIvy(this.scene,parts,root);this.castleIvy=ivy;
      await ivy.volume.ready;
      if(this.disposed){axes.dispose(false,false);root.dispose(false,false);return;}
    }
    // Replace the short landing with a watertight slab through the gatehouse.
    // Build in castle coordinates, alongside the converted source meshes, so
    // the new box has its own indices and no imported/interleaved buffers.
    let passage:Mesh|undefined;
    if(gateLanding){
      passage=new Mesh('B28:gate-passage-floor',this.scene);
      // Seat each side 10 cm inside the 7.10 m opening instead of leaving seams.
      const data=VertexData.CreateBox({width:7.3,height:.115,depth:7.3});
      for(let i=0;i<data.positions!.length;i+=3){
        const x=data.positions![i],y=data.positions![i+1],z=data.positions![i+2];
        const top=Math.abs(data.normals![i+1])>.5;
        data.uvs![i/3*2]=(top||Math.abs(data.normals![i+2])>.5?x:z)/1.3;
        data.uvs![i/3*2+1]=top?1+(26.65-z)/1.3:y/1.3;
      }
      data.applyToMesh(passage);
      passage.position.set(0,1.3175,-26.65);
      passage.material=gateLanding.material;
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
    if(passage){
      // Keep its native Babylon winding separate from the imported glTF batches.
      passage.parent=root;passage.isPickable=true;passage.checkCollisions=false;
      passage.metadata={buildingId:b.id};
      passage.computeWorldMatrix(true);passage.freezeWorldMatrix();meshes.push(passage);
    }
    // Materials/textures are still referenced by the batches; only the original
    // draw objects and transform hierarchy are discarded.
    axes.dispose(false,false);
    root.setEnabled(true);
    if(lampMount)this.lanterns.add(b.id,root,meshes,lampMount);
    this.buildings.set(b.id,{root,meshes,sourceMeshes:parts.length+(gateLanding?1:0)});
    }catch(error){
      placedRoot?.dispose(false,false);axes.dispose(false,false);asset.dispose();throw error;
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
      colors.push(.94+variation(x*.22,z*.22)*.15,0,.27+smooth(-4,0,d)*.45,1-smooth(-1.1,1.3,d));
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
    mesh.material=createVillageRoadMaterial(this.scene);mesh.parent=this.parent;mesh.isPickable=false;
    mesh.hasVertexAlpha=true;mesh.freezeWorldMatrix();
    this.roads=mesh;
  }
  private cast(ray:Ray){
    let nearest:ReturnType<Ray['intersectsMesh']>|null=null;
    const end=ray.origin.add(ray.direction.scale(ray.length));
    const lo=Vector3.Minimize(ray.origin,end),hi=Vector3.Maximize(ray.origin,end);
    for(const {meshes} of this.buildings.values())for(const mesh of meshes){
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
    const hit=this.cast(new Ray(new Vector3(x,origin,z),new Vector3(0,-1,0),distance));
    if(!hit?.pickedPoint)return null;
    const normal=hit.getNormal(true);
    return normal&&Math.abs(normal.y)>.55?{height:hit.pickedPoint.y,normalY:Math.abs(normal.y),rockId:`building:${hit.pickedMesh?.metadata?.buildingId}`}:null;
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
    return !this.cast(new Ray(new Vector3(x,y+.15,z),Vector3.Up(),height-.15));
  }
  cameraObstruction(from:Vector3,to:Vector3):number|null{
    const d=to.subtract(from),length=d.length();
    return length>0?this.cast(new Ray(from,d.scale(1/length),length))?.distance??null:null;
  }
  dispose():void{
    this.disposed=true;
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

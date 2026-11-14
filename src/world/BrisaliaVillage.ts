import { LoadAssetContainerAsync, Material, Mesh, Quaternion, Ray, Scene,
  TransformNode, Vector3, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { BRISALIA_BUILDINGS, BRISALIA_SCALE, brisaliaRoadEdge, inBrisaliaFootprint,
  type BrisaliaBuilding } from './brisaliaLayout';
import { createVillageRoadMaterial } from './materials/VillageRoadMaterial';

/** The playable settlement, with one independent prefab per building ID. */
export class BrisaliaVillage {
  readonly buildings=new Map<string,{root:TransformNode;meshes:Mesh[];sourceMeshes:number}>();
  readonly errors:string[]=[];
  readonly ready:Promise<void>;
  private disposed=false;
  private roads:Mesh|null=null;
  constructor(private scene:Scene,private parent:TransformNode,
    readonly origin:{x:number;z:number},private heightAt:(x:number,z:number)=>number){
    this.createRoads();
    this.ready=this.load();
  }
  private async load():Promise<void>{
    const queue=[...BRISALIA_BUILDINGS];
    // Bound simultaneous GLB decoding/upload; the castle loads once, last.
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
    const asset=await LoadAssetContainerAsync(`/assets/buildings/${b.assetRoot}/${b.file}`,this.scene);
    if(this.disposed){asset.dispose();return;}
    asset.addAllToScene();
    const axes=new TransformNode(`${b.id}:axis-conversion`,this.scene);
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
    const groups=new Map<string,Mesh[]>();
    for(const mesh of parts){
      mesh.computeWorldMatrix(true);
      const center=mesh.getBoundingInfo().boundingBox.centerWorld;
      // Spatial batches keep castle culling and triangle collision local.
      const cell=b.id==='B28'?`${Math.floor(center.x/12)}:${Math.floor(center.z/12)}`:'all';
      const key=`${mesh.material?.uniqueId}:${cell}`;
      const list=groups.get(key)??[];list.push(mesh);groups.set(key,list);
    }
    const root=new TransformNode(`brisalia:${b.id}`,this.scene);
    root.parent=this.parent;
    root.position.set(this.origin.x+b.x,this.heightAt(this.origin.x+b.x,this.origin.z+b.z)-
      (b.id==='B28'?1.35*BRISALIA_SCALE:0),this.origin.z+b.z);
    root.scaling.setAll(BRISALIA_SCALE);
    root.rotation.y=b.yaw*Math.PI/180;
    root.metadata={buildingId:b.id,revision:b.revision,sourceMetersToWorldUnits:BRISALIA_SCALE};
    const meshes:Mesh[]=[];
    for(const [key,group] of groups){
      const mesh=Mesh.MergeMeshes(group,false,true,undefined,false,true);
      if(!mesh)throw new Error(`Cannot batch ${b.id}/${key}`);
      mesh.name=`${b.id}:batch:${key}`;mesh.parent=root;
      mesh.isPickable=true;mesh.checkCollisions=false;
      mesh.metadata={buildingId:b.id};
      mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();meshes.push(mesh);
    }
    // Materials/textures are still referenced by the batches; only the original
    // draw objects and transform hierarchy are discarded.
    axes.dispose(false,false);
    this.buildings.set(b.id,{root,meshes,sourceMeshes:parts.length});
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
    data.positions=positions;data.indices=indices;data.uvs=uvs;data.colors=colors;
    const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(mesh);
    mesh.material=createVillageRoadMaterial(this.scene);mesh.parent=this.parent;mesh.isPickable=false;
    mesh.hasVertexAlpha=true;mesh.freezeWorldMatrix();
    this.roads=mesh;
  }
  private cast(ray:Ray){
    let nearest:ReturnType<Ray['intersectsMesh']>|null=null;
    const end=ray.origin.add(ray.direction.scale(ray.length));
    const lo=Vector3.Minimize(ray.origin,end),hi=Vector3.Maximize(ray.origin,end);
    for(const {meshes} of this.buildings.values())for(const mesh of meshes){
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
    return normal&&Math.abs(normal.y)>.55?{height:hit.pickedPoint.y,normalY:Math.abs(normal.y)}:null;
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

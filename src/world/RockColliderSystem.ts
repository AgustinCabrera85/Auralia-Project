import { InstancedMesh, Mesh, Ray, Vector3, VertexBuffer } from '@babylonjs/core';
import { isWalkableRockFace } from './rectRockData';
import { sameGeologyFormation } from './geologyData';
import type { PropKind, PropPlacement } from './worldPropsData';
import { MAX_WATER_CONTACTS, rockWaterContact, type WaterContact } from './water/WaterContacts';

const COLLIDABLE_ROCKS:readonly PropKind[]=[
  'rocasRectangulares','formacionRocosa','escalonRocoso','mesetaPasto','acantilado2','packRocas'
];
export const hasRockSurface=(kind:PropKind):boolean=>COLLIDABLE_ROCKS.includes(kind);

export type RockSurface={
  height:number;normal:Vector3;rockId:string;kind:PropKind;pieceIndex?:number;
  climbable:boolean;worldHeight:number;worldRadius:number;centerX:number;centerZ:number;
};
export type RockWallHit=Omit<RockSurface,'height'>&{point:Vector3;distance:number};
type Collider={placement:PropPlacement;radius:number;height:number;instances:(Mesh|InstancedMesh)[];generated?:boolean;
  water?:{level:number;slopeX:number;slopeZ:number;contact:WaterContact|null}};

/** Invisible, pickable instances share the visible GLB geometry and material. */
export class RockColliderSystem {
  private readonly colliders=new Map<string,Collider>();
  private readonly sourceRadius=new Map<number,number>();
  private readonly sourceHeight=new Map<number,number>();
  private readonly colliderSources=new Map<number,Mesh>();
  private readonly focusRadius=125;
  get activeColliderCount():number{
    let total=0;
    for(const entry of this.colliders.values())total+=entry.instances.length;
    return total;
  }

  constructor(private readonly sourceFor:(kind:PropKind)=>readonly Mesh[]|undefined){ }

  /** Keep the exact procedural shell before the visible meshes are merged.
   * Geometry/material are shared; the hidden proxy follows its streamed parent. */
  registerGeneratedMesh(source:Mesh):void{
    const id=`generated-rock:${source.uniqueId}`;
    if(this.colliders.has(id))return;
    const proxy=source.clone(`collider-${source.name}`,source.parent,true);
    proxy.isVisible=false;proxy.isPickable=true;proxy.checkCollisions=false;
    proxy.computeWorldMatrix(true);
    const bounds=proxy.getBoundingInfo().boundingBox;
    const min=bounds.minimumWorld,max=bounds.maximumWorld;
    const radius=Math.hypot(max.x-min.x,max.z-min.z)*.5,height=max.y-min.y;
    const placement:PropPlacement={id,kind:'formacionRocosa',x:(min.x+max.x)*.5,
      y:min.y,z:(min.z+max.z)*.5,scale:1,yaw:0,climbable:true};
    proxy.metadata={rockCollider:true,rockId:id};
    proxy.freezeWorldMatrix();
    const entry:Collider={placement,radius,height,instances:[proxy],generated:true};
    this.colliders.set(id,entry);
    proxy.onDisposeObservable.addOnce(()=>{
      if(this.colliders.get(id)===entry)this.colliders.delete(id);
    });
  }

  private dimensions(mesh:Mesh):{radius:number;height:number}{
    const cachedRadius=this.sourceRadius.get(mesh.uniqueId);
    if(cachedRadius!==undefined)return {radius:cachedRadius,height:this.sourceHeight.get(mesh.uniqueId)!};
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind)??[];
    let radius=0,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<positions.length;i+=3){
      radius=Math.max(radius,Math.hypot(positions[i],positions[i+2]));
      minY=Math.min(minY,positions[i+1]);maxY=Math.max(maxY,positions[i+1]);
    }
    const height=Math.max(0,maxY-minY);
    this.sourceRadius.set(mesh.uniqueId,radius);this.sourceHeight.set(mesh.uniqueId,height);
    return {radius,height};
  }

  private size(p:PropPlacement,parts:readonly Mesh[]):{radius:number;height:number}{
    if(p.kind==='rocasRectangulares'&&p.worldRadius!==undefined&&p.worldHeight!==undefined)
      return {radius:p.worldRadius,height:p.worldHeight};
    const scaleXZ=p.scaleXZ??p.scale,scaleY=p.scaleY??p.scale;
    let radius=0,height=0;
    for(const part of parts){
      const dimensions=this.dimensions(part);
      radius=Math.max(radius,dimensions.radius*scaleXZ);
      height=Math.max(height,dimensions.height*scaleY);
    }
    return {radius,height};
  }

  private colliderSource(source:Mesh):Mesh{
    const existing=this.colliderSources.get(source.uniqueId);
    if(existing)return existing;
    // Decoration updates expand the source bounds to all thin instances. A separate
    // mesh keeps local geometry bounds for precise picking while sharing geometry.
    const clone=source.clone(`collision-source-${source.name}`,source.parent,false);
    if(!clone)throw new Error(`No se pudo crear collider para ${source.name}`);
    clone.thinInstanceSetBuffer('matrix',null,16,true);
    clone.refreshBoundingInfo(true);
    clone.isVisible=false;clone.isPickable=false;clone.checkCollisions=false;
    clone.metadata={rockColliderSource:true};
    this.colliderSources.set(source.uniqueId,clone);
    return clone;
  }

  sync(placements:readonly PropPlacement[],x:number,z:number,protectedRockIds:ReadonlySet<string>):void{
    const desired=new Map<string,{placement:PropPlacement;parts:readonly Mesh[];radius:number;height:number}>();
    for(const placement of placements){
      if(!hasRockSurface(placement.kind))continue;
      const allParts=this.sourceFor(placement.kind);
      if(!allParts?.length)continue;
      const parts=placement.kind==='rocasRectangulares'
        ? [allParts[placement.pieceIndex??-1]].filter((part):part is Mesh=>!!part)
        :placement.kind==='packRocas'
          ? [allParts[placement.partIndex??-1]].filter((part):part is Mesh=>!!part)
          :placement.kind==='acantilado2'
            ?allParts.filter(part=>part.metadata?.collisionOnly===true)
            :allParts;
      if(!parts.length)continue;
      const {radius,height}=this.size(placement,parts);
      if(!protectedRockIds.has(placement.id)&&Math.hypot(placement.x-x,placement.z-z)>this.focusRadius+radius)continue;
      desired.set(placement.id,{placement,parts,radius,height});
    }
    for(const [id,entry] of this.colliders){
      if(entry.generated||desired.has(id)||protectedRockIds.has(id))continue;
      for(const instance of entry.instances)instance.dispose(false,false);
      this.colliders.delete(id);
    }
    for(const [id,{placement,parts,radius,height}] of desired){
      if(this.colliders.has(id))continue;
      const instances=parts.map((source,index)=>{
        const colliderSource=this.colliderSource(source);
        const instance=colliderSource.createInstance(`collider-${id}-${index}`);
        instance.parent=colliderSource.parent;
        instance.position.set(placement.x,placement.y,placement.z);
        instance.rotationQuaternion=null;instance.rotation.y=placement.yaw;
        instance.scaling.set(placement.scaleXZ??placement.scale,placement.scaleY??placement.scale,
          placement.scaleXZ??placement.scale);
        instance.isVisible=false;instance.isPickable=true;instance.checkCollisions=false;
        instance.metadata={rockCollider:true,rockId:id,pieceIndex:placement.pieceIndex,
          climbable:placement.climbable===true,worldHeight:height,worldRadius:radius,
          };
        return instance;
      });
      this.colliders.set(id,{placement,radius,height,instances});
    }
  }

  private nearby(x:number,z:number,reach=0,rockId?:string):Set<Mesh|InstancedMesh>{
    const candidates=new Set<Mesh|InstancedMesh>();
    for(const entry of this.colliders.values()){
      if(rockId&&entry.placement.id!==rockId)continue;
      if(Math.hypot(entry.placement.x-x,entry.placement.z-z)>entry.radius+reach+1)continue;
      for(const instance of entry.instances)
        if(!instance.isDisposed()&&instance.isEnabled())candidates.add(instance);
    }
    return candidates;
  }

  /** Reuse streamed rock geometry, including thin-instance transforms. Results
   * disappear with their colliders; dry or fully submerged rocks produce none. */
  waterContacts(x:number,z:number,waterAt:(x:number,z:number)=>number|null):WaterContact[]{
    const candidates=[...this.colliders.values()].filter(c=>
      Math.hypot(c.placement.x-x,c.placement.z-z)<100&&c.radius<25);
    candidates.sort((a,b)=>Math.hypot(a.placement.x-x,a.placement.z-z)-
      Math.hypot(b.placement.x-x,b.placement.z-z));
    const result:WaterContact[]=[];let built=0;
    for(const c of candidates){
      const p=c.placement,level=waterAt(p.x,p.z);
      if(level===null||p.y>level+1||p.y+c.height<level-.1)continue;
      const slopeX=((waterAt(p.x+.5,p.z)??level)-(waterAt(p.x-.5,p.z)??level));
      const slopeZ=((waterAt(p.x,p.z+.5)??level)-(waterAt(p.x,p.z-.5)??level));
      if(!c.water||Math.abs(c.water.level-level)>.01||Math.abs(c.water.slopeX-slopeX)>.001||Math.abs(c.water.slopeZ-slopeZ)>.001){
        // Spread first-time sections over refreshes after a teleport/stream load.
        if(built>=2)continue;
        c.water={level,slopeX,slopeZ,contact:rockWaterContact(c.instances,level,p.x,p.z,p.yaw,slopeX,slopeZ)};
        built++;
      }
      if(!c.water.contact)continue;
      const contact=c.water.contact,distance=Math.hypot(contact.x-x,contact.z-z);
      result.push({...contact,strength:Math.max(0,Math.min(1,(100-distance)/30))});
      if(result.length===MAX_WATER_CONTACTS)break;
    }
    return result;
  }

  private hits(ray:Ray,candidates:Set<Mesh|InstancedMesh>){
    const meshes=[...candidates];
    for(const mesh of meshes)mesh.computeWorldMatrix();
    return ray.intersectsMeshes(meshes,false);
  }

  private topAt(x:number,z:number,originY:number,maxDistance:number,rockId?:string):RockSurface|null{
    const candidates=this.nearby(x,z,0,rockId);
    if(!candidates.size)return null;
    const ray=new Ray(new Vector3(x,originY,z),Vector3.Down(),maxDistance);
    for(const hit of this.hits(ray,candidates)){
      const point=hit.pickedPoint,mesh=hit.pickedMesh;
      const normal=hit.getNormal(true);
      if(!point||!mesh||!normal)continue;
      const entry=this.colliders.get(mesh.metadata?.rockId);
      if(!entry||rockId&&entry.placement.id!==rockId)continue;
      return {height:point.y,normal,rockId:entry.placement.id,kind:entry.placement.kind,
        pieceIndex:entry.placement.pieceIndex,climbable:entry.placement.climbable===true,
        worldHeight:entry.height,worldRadius:entry.radius,
        centerX:entry.placement.x,centerZ:entry.placement.z};
    }
    return null;
  }

  /** Upper shell at a point, including steep faces; used to keep feet out of solid rock. */
  querySolidTop(x:number,z:number,originY:number,maxDistance:number,rockId?:string):RockSurface|null{
    return this.topAt(x,z,originY,maxDistance,rockId);
  }

  /** Smooth only across the character's footprint; all samples still hit the real shell. */
  queryGround(x:number,z:number,originY:number,maxDistance:number,footRadius=0):RockSurface|null{
    const center=this.topAt(x,z,originY,maxDistance);
    if(footRadius<=0)return center&&isWalkableRockFace(center.normal.y)?center:null;
    const raw=[this.topAt(x+footRadius,z,originY,maxDistance),
      this.topAt(x-footRadius,z,originY,maxDistance),
      this.topAt(x,z+footRadius,originY,maxDistance),
      this.topAt(x,z-footRadius,originY,maxDistance)];
    const reference=center??raw.find(hit=>hit!==null);
    const compatible=(hit:RockSurface|null):hit is RockSurface=>!!reference&&!!hit&&
      (hit.rockId===reference.rockId||sameGeologyFormation(hit.rockId,reference.rockId))&&
      Math.abs(hit.height-reference.height)<=.55;
    const [right,left,front,back]=raw.map(hit=>compatible(hit)?hit:null);
    // A narrow mesh seam is supported when the real shell continues on both
    // sides of the foot. Do not bridge an exposed ledge or a broad empty gap.
    const spansFoot=!!(right&&left)||!!(front&&back);
    let precise:RockSurface|null=null;
    if(spansFoot||center&&isWalkableRockFace(center.normal.y)&&
      (right||left||front||back)){
      const samples=[center,right,left,front,back].filter(compatible);
      const dx=right&&left?(right.height-left.height)/(2*footRadius):0;
      const dz=front&&back?(front.height-back.height)/(2*footRadius):0;
      const normal=spansFoot?new Vector3(-dx,1,-dz).normalize():center!.normal;
      if(isWalkableRockFace(normal.y))
        precise={...reference!,height:samples.reduce((sum,hit)=>sum+hit.height,0)/samples.length,normal};
    }
    if(precise&&(maxDistance>2.5||originY-precise.height<=.95))return precise;
    // Open GLB seams sometimes expose a lower underside at the foot center.
    // Sample the capsule rim only after the precise surface test fails. Two
    // nearby walkable hits on the same rock make a small gap a stable foothold;
    // a lone edge hit still lets the player fall off the model.
    const radius=footRadius*1.7,diagonal=radius*Math.SQRT1_2;
    const offsets=[[radius,0],[-radius,0],[0,radius],[0,-radius],
      [diagonal,diagonal],[diagonal,-diagonal],[-diagonal,diagonal],[-diagonal,-diagonal]];
    const rim=offsets.map(([dx,dz])=>this.topAt(x+dx,z+dz,originY,maxDistance))
      .filter((hit):hit is RockSurface=>!!hit&&hit.normal.y>.35);
    let best:RockSurface[]=[];
    for(const anchor of rim){
      const cluster=rim.filter(hit=>(hit.rockId===anchor.rockId||
        sameGeologyFormation(hit.rockId,anchor.rockId))&&
        Math.abs(hit.height-anchor.height)<=.55);
      if(cluster.length<2||!cluster.some(hit=>isWalkableRockFace(hit.normal.y))&&
        !(maxDistance<=2.5&&(!center||center.height<anchor.height-.4)&&
          cluster.every(hit=>hit.normal.y>.4)))continue;
      if(!best.length||Math.max(...cluster.map(hit=>hit.height))>
        Math.max(...best.map(hit=>hit.height)))best=cluster;
    }
    if(best.length<2)return precise;
    const height=Math.max(...best.map(hit=>hit.height));
    return !precise||height>precise.height+.3
      ?{...best[0],height,normal:Vector3.Up()}:precise;
  }

  /** Exact triangle hit on a nearby rock face; never infers a wall from its box. */
  queryWall(x:number,y:number,z:number,dirX:number,dirZ:number,maxDistance:number):RockWallHit|null{
    const length=Math.hypot(dirX,dirZ);
    if(length<1e-8||maxDistance<=0)return null;
    const nx=dirX/length,nz=dirZ/length;
    const candidates=this.nearby(x,z,maxDistance);
    if(!candidates.size)return null;
    const ray=new Ray(new Vector3(x,y,z),new Vector3(nx,0,nz),maxDistance);
    const hits=this.hits(ray,candidates);
    for(const hit of hits){
      const point=hit.pickedPoint,mesh=hit.pickedMesh;
      if(!point||!mesh)continue;
      const normal=hit.getNormal(true);
      if(!normal||normal.y>=.75)continue;
      const entry=this.colliders.get(mesh.metadata?.rockId);
      if(!entry)continue;
      if(normal.x*nx+normal.z*nz>0)normal.scaleInPlace(-1);
      return {point,distance:hit.distance,normal,rockId:entry.placement.id,
        kind:entry.placement.kind,pieceIndex:entry.placement.pieceIndex,
        climbable:entry.placement.climbable===true,worldHeight:entry.height,worldRadius:entry.radius,
        centerX:entry.placement.x,centerZ:entry.placement.z};
    }
    return null;
  }

  hasOverheadClearance(x:number,y:number,z:number,height:number,ignoreRockId?:string):boolean{
    const candidates=this.nearby(x,z);
    if(!candidates.size)return true;
    const ray=new Ray(new Vector3(x,y+.05,z),Vector3.Up(),height);
    for(const mesh of candidates){
      const id=mesh.metadata?.rockId as string|undefined;
      if(ignoreRockId&&id&&(id===ignoreRockId||sameGeologyFormation(id,ignoreRockId)))
        continue;
      mesh.computeWorldMatrix();
      if(ray.intersectsMesh(mesh,true).hit)return false;
    }
    return true;
  }

  /** First closed rock shell between the player and the desired camera position. */
  queryCameraObstruction(from:Vector3,to:Vector3,clearance=0):number|null{
    const direction=to.subtract(from),distance=direction.length();
    if(distance<.1)return null;
    const candidates=this.nearby(from.x,from.z,distance+clearance);
    if(!candidates.size)return null;
    direction.scaleInPlace(1/distance);
    const origins=[from];
    if(clearance>0){
      const right=Vector3.Cross(direction,Math.abs(direction.y)<.99?Vector3.Up():Vector3.Right()).normalize();
      const up=Vector3.Cross(right,direction).normalize();
      for(const axis of [right,up])for(const sign of [-1,1])origins.push(from.add(axis.scale(clearance*sign)));
    }
    let nearest:number|null=null;
    for(const origin of origins){
      const hit=this.hits(new Ray(origin,direction,distance),candidates)[0];
      if(hit?.hit&&(nearest===null||hit.distance<nearest))nearest=hit.distance;
    }
    return nearest;
  }

  dispose():void{
    for(const entry of this.colliders.values())for(const instance of entry.instances)instance.dispose(false,false);
    this.colliders.clear();
    for(const source of this.colliderSources.values())source.dispose(false,false);
    this.colliderSources.clear();
  }
}

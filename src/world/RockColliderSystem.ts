import { InstancedMesh, Mesh, Ray, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { isWalkableRockFace } from './rectRockData';
import type { PropKind, PropPlacement } from './worldPropsData';

const COLLIDABLE_ROCKS:readonly PropKind[]=[
  'rocasRectangulares','formacionRocosa','escalonRocoso','mesetaPasto','acantilado2','packRocas'
];
export const hasRockSurface=(kind:PropKind):boolean=>COLLIDABLE_ROCKS.includes(kind);

export type RockSurface={
  height:number;normal:Vector3;rockId:string;kind:PropKind;pieceIndex?:number;
  climbable:boolean;worldHeight:number;worldRadius:number;centerX:number;centerZ:number;
};
export type RockWallHit=Omit<RockSurface,'height'>&{point:Vector3;distance:number};
type Collider={placement:PropPlacement;radius:number;height:number;instances:InstancedMesh[]};

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

  constructor(private readonly scene:Scene,
    private readonly sourceFor:(kind:PropKind)=>readonly Mesh[]|undefined){ }

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
    const scale=p.scale;
    let radius=0,height=0;
    for(const part of parts){
      const dimensions=this.dimensions(part);
      radius=Math.max(radius,dimensions.radius*scale);
      height=Math.max(height,dimensions.height*scale);
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

  sync(placements:readonly PropPlacement[],x:number,z:number,protectedRockId:string|null):void{
    const desired=new Map<string,{placement:PropPlacement;parts:readonly Mesh[];radius:number;height:number}>();
    for(const placement of placements){
      if(!hasRockSurface(placement.kind))continue;
      const allParts=this.sourceFor(placement.kind);
      if(!allParts?.length)continue;
      const parts=placement.kind==='rocasRectangulares'
        ? [allParts[placement.pieceIndex??-1]].filter((part):part is Mesh=>!!part)
        :placement.kind==='packRocas'
          ? [allParts[placement.partIndex??-1]].filter((part):part is Mesh=>!!part)
          :allParts;
      if(!parts.length)continue;
      const {radius,height}=this.size(placement,parts);
      if(placement.id!==protectedRockId&&Math.hypot(placement.x-x,placement.z-z)>this.focusRadius+radius)continue;
      desired.set(placement.id,{placement,parts,radius,height});
    }
    for(const [id,entry] of this.colliders){
      if(desired.has(id)||id===protectedRockId)continue;
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
          climbable:placement.climbable===true,worldHeight:height,worldRadius:radius};
        return instance;
      });
      this.colliders.set(id,{placement,radius,height,instances});
    }
  }

  private nearby(x:number,z:number,reach=0,rockId?:string):Set<InstancedMesh>{
    const candidates=new Set<InstancedMesh>();
    for(const entry of this.colliders.values()){
      if(rockId&&entry.placement.id!==rockId)continue;
      if(Math.hypot(entry.placement.x-x,entry.placement.z-z)>entry.radius+reach+1)continue;
      for(const instance of entry.instances)candidates.add(instance);
    }
    return candidates;
  }

  private topAt(x:number,z:number,originY:number,maxDistance:number,rockId?:string):RockSurface|null{
    const candidates=this.nearby(x,z,0,rockId);
    if(!candidates.size)return null;
    const ray=new Ray(new Vector3(x,originY,z),Vector3.Down(),maxDistance);
    const hits=this.scene.multiPickWithRay(ray,mesh=>candidates.has(mesh as InstancedMesh))??[];
    for(const hit of hits.sort((a,b)=>a.distance-b.distance)){
      const point=hit.pickedPoint,mesh=hit.pickedMesh as InstancedMesh|null;
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
    if(!center)return null;
    if(footRadius<=0)return isWalkableRockFace(center.normal.y)?center:null;
    const right=this.topAt(x+footRadius,z,originY,maxDistance,center.rockId);
    const left=this.topAt(x-footRadius,z,originY,maxDistance,center.rockId);
    const front=this.topAt(x,z+footRadius,originY,maxDistance,center.rockId);
    const back=this.topAt(x,z-footRadius,originY,maxDistance,center.rockId);
    if(!right||!left||!front||!back)return null;
    const heights=[center.height,right.height,left.height,front.height,back.height];
    if(Math.max(...heights)-Math.min(...heights)>.55)return null;
    const dx=(right.height-left.height)/(2*footRadius);
    const dz=(front.height-back.height)/(2*footRadius);
    const normal=new Vector3(-dx,1,-dz).normalize();
    if(!isWalkableRockFace(normal.y))return null;
    return {...center,height:Math.max(center.height,heights.reduce((a,b)=>a+b,0)/5),normal};
  }

  /** Exact triangle hit on a nearby rock face; never infers a wall from its box. */
  queryWall(x:number,y:number,z:number,dirX:number,dirZ:number,maxDistance:number):RockWallHit|null{
    const length=Math.hypot(dirX,dirZ);
    if(length<1e-8||maxDistance<=0)return null;
    const nx=dirX/length,nz=dirZ/length;
    const candidates=this.nearby(x,z,maxDistance);
    if(!candidates.size)return null;
    const ray=new Ray(new Vector3(x,y,z),new Vector3(nx,0,nz),maxDistance);
    const hits=this.scene.multiPickWithRay(ray,mesh=>candidates.has(mesh as InstancedMesh))??[];
    for(const hit of hits.sort((a,b)=>a.distance-b.distance)){
      const point=hit.pickedPoint,mesh=hit.pickedMesh as InstancedMesh|null;
      const normal=hit.getNormal(true);
      if(!point||!mesh||!normal||normal.y>=.75)continue;
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

  hasOverheadClearance(x:number,y:number,z:number,height:number):boolean{
    const candidates=this.nearby(x,z);
    if(!candidates.size)return true;
    const ray=new Ray(new Vector3(x,y+.05,z),Vector3.Up(),height);
    return !(this.scene.pickWithRay(ray,mesh=>candidates.has(mesh as InstancedMesh))?.hit);
  }

  dispose():void{
    for(const entry of this.colliders.values())for(const instance of entry.instances)instance.dispose(false,false);
    this.colliders.clear();
    for(const source of this.colliderSources.values())source.dispose(false,false);
    this.colliderSources.clear();
  }
}

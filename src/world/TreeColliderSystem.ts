import { InstancedMesh, Mesh, Ray, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import type { VegetationKind, VegetationPlacement } from './vegetationData';

const TREE_KINDS:readonly VegetationKind[]=['arbolito1','arbolito2','arbolito3','arbolitoSeco'];
const ROOT_MAX_HEIGHT=1.15;
const ROOT_WALL_CLEARANCE=1.25;

export type TreeSurface={height:number;normalY:number};
export type TreeWallHit={point:Vector3;distance:number;normal:Vector3;id:string};
type TreeCollider={placement:VegetationPlacement;instance:InstancedMesh;radius:number;trunkRadius:number};

/** Local collision copies share the visible trees' geometry but have no thin instances. */
export class TreeColliderSystem {
  private readonly sources=new Map<VegetationKind,Mesh>();
  private readonly colliders=new Map<string,TreeCollider>();
  private readonly focusRadius=34;

  constructor(private readonly scene:Scene,
    private readonly sourceFor:(kind:VegetationKind)=>Mesh|undefined){}

  private key(p:VegetationPlacement):string{return `${p.kind}:${p.x}:${p.z}`;}

  private source(kind:VegetationKind):Mesh|null{
    const existing=this.sources.get(kind);
    if(existing)return existing;
    const visible=this.sourceFor(kind);
    if(!visible)return null;
    const clone=visible.clone(`collision-source-tree-${kind}`,visible.parent,false);
    if(!clone)return null;
    clone.thinInstanceSetBuffer('matrix',null,16,true);
    clone.refreshBoundingInfo(true);
    clone.isVisible=false;clone.isPickable=false;clone.checkCollisions=false;
    this.sources.set(kind,clone);
    return clone;
  }

  private dimensions(source:Mesh,scale:number):{radius:number;trunkRadius:number}{
    const positions=source.getVerticesData(VertexBuffer.PositionKind)??[];
    let radius=0,trunkRadius=0;
    for(let i=0;i<positions.length;i+=3){
      const y=positions[i+1]*scale;
      const distance=Math.hypot(positions[i],positions[i+2])*scale;
      if(y<=4.2)radius=Math.max(radius,distance);
      if(y>=1.4&&y<=2.4)trunkRadius=Math.max(trunkRadius,distance);
    }
    return {radius:radius+.6,trunkRadius:trunkRadius+.6};
  }

  sync(placements:readonly VegetationPlacement[],x:number,z:number):void{
    const desired=new Set<string>();
    for(const p of placements){
      if(!TREE_KINDS.includes(p.kind))continue;
      if(Math.hypot(p.x-x,p.z-z)>this.focusRadius+10)continue;
      const source=this.source(p.kind);
      if(!source)continue;
      const id=this.key(p);
      desired.add(id);
      if(this.colliders.has(id))continue;
      const {radius,trunkRadius}=this.dimensions(source,p.scale);
      const instance=source.createInstance(`collision-tree-${id}`);
      instance.parent=source.parent;
      instance.position.set(p.x,p.y,p.z);
      instance.rotationQuaternion=null;instance.rotation.y=p.yaw;
      instance.scaling.setAll(p.scale);
      instance.isVisible=false;instance.isPickable=true;instance.checkCollisions=false;
      this.colliders.set(id,{placement:p,instance,radius,trunkRadius});
    }
    for(const [id,entry] of this.colliders){
      if(desired.has(id))continue;
      entry.instance.dispose(false,false);
      this.colliders.delete(id);
    }
  }

  private nearby(x:number,z:number,reach=0):Map<InstancedMesh,TreeCollider>{
    const result=new Map<InstancedMesh,TreeCollider>();
    for(const entry of this.colliders.values()){
      if(Math.hypot(entry.placement.x-x,entry.placement.z-z)>entry.radius+reach)continue;
      result.set(entry.instance,entry);
    }
    return result;
  }

  /** Only the low, upward-facing root shell can support feet. */
  queryGround(x:number,z:number,originY:number,maxDistance:number):TreeSurface|null{
    const candidates=this.nearby(x,z);
    if(!candidates.size)return null;
    const ray=new Ray(new Vector3(x,originY,z),Vector3.Down(),maxDistance);
    const hits=this.scene.multiPickWithRay(ray,mesh=>candidates.has(mesh as InstancedMesh))??[];
    for(const hit of hits.sort((a,b)=>a.distance-b.distance)){
      const entry=candidates.get(hit.pickedMesh as InstancedMesh);
      const point=hit.pickedPoint,normal=hit.getNormal(true);
      if(!entry||!point||!normal)continue;
      if(point.y>entry.placement.y+ROOT_MAX_HEIGHT||normal.y<.75)continue;
      return {height:point.y,normalY:normal.y};
    }
    return null;
  }

  /** Horizontal mesh contact at torso height; shallow roots are left for stepping. */
  queryWall(x:number,y:number,z:number,dirX:number,dirZ:number,maxDistance:number):TreeWallHit|null{
    const length=Math.hypot(dirX,dirZ);
    if(length<1e-8||maxDistance<=0)return null;
    const nx=dirX/length,nz=dirZ/length;
    const candidates=this.nearby(x,z,maxDistance);
    if(!candidates.size)return null;
    const ray=new Ray(new Vector3(x,y,z),new Vector3(nx,0,nz),maxDistance);
    const hits=this.scene.multiPickWithRay(ray,mesh=>candidates.has(mesh as InstancedMesh))??[];
    for(const hit of hits.sort((a,b)=>a.distance-b.distance)){
      const entry=candidates.get(hit.pickedMesh as InstancedMesh);
      const point=hit.pickedPoint,normal=hit.getNormal(true);
      if(!entry||!point||!normal||y<entry.placement.y+ROOT_WALL_CLEARANCE||normal.y>=.75)continue;
      const fromRadius=Math.hypot(x-entry.placement.x,z-entry.placement.z);
      const outward=(x-entry.placement.x)*nx+(z-entry.placement.z)*nz;
      if(fromRadius<entry.trunkRadius&&outward>0)continue;
      if(normal.x*nx+normal.z*nz>0)normal.scaleInPlace(-1);
      return {point,distance:hit.distance,normal,id:this.key(entry.placement)};
    }
    return null;
  }

  dispose():void{
    for(const entry of this.colliders.values())entry.instance.dispose(false,false);
    this.colliders.clear();
    for(const source of this.sources.values())source.dispose(false,false);
    this.sources.clear();
  }
}

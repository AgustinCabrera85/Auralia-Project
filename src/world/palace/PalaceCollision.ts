import {Mesh,Ray,Vector3} from '@babylonjs/core';
import {StaticVerticalIndex} from '../StaticVerticalIndex';
/** Decor/LOD visibility is independent of collision residency. */
export class PalaceCollision{
  private cells=new Map<string,Mesh[]>();
  private verticals=new Map<Mesh,StaticVerticalIndex>();
  private min=new Vector3(Infinity,Infinity,Infinity);
  private max=new Vector3(-Infinity,-Infinity,-Infinity);
  readonly doors:Mesh[]=[];
  add(mesh:Mesh){
    mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;
    this.min=Vector3.Minimize(this.min,b.minimumWorld);this.max=Vector3.Maximize(this.max,b.maximumWorld);
    this.verticals.set(mesh,new StaticVerticalIndex(mesh));
    for(let x=Math.floor(b.minimumWorld.x/16);x<=Math.floor(b.maximumWorld.x/16);x++)for(let z=Math.floor(b.minimumWorld.z/16);z<=Math.floor(b.maximumWorld.z/16);z++){
      const key=x+':'+z,list=this.cells.get(key)??[];list.push(mesh);this.cells.set(key,list);
    }
  }
  private vertical(x:number,z:number,y:number,reach:number,up=false){
    let nearest:ReturnType<StaticVerticalIndex['hit']>=null;
    for(const m of this.cells.get(Math.floor(x/16)+':'+Math.floor(z/16))??[]){
      const hit=this.verticals.get(m)!.hit(x,z,y,reach,up);if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;
    }return nearest;
  }
  cast(ray:Ray){
    if(!this.verticals.size||!ray.intersectsBoxMinMax(this.min,this.max))return null;
    const end=ray.origin.add(ray.direction.scale(ray.length)),lo=Vector3.Minimize(ray.origin,end),hi=Vector3.Maximize(ray.origin,end),candidates=new Set<Mesh>(this.doors);
    for(let x=Math.floor(lo.x/16);x<=Math.floor(hi.x/16);x++)for(let z=Math.floor(lo.z/16);z<=Math.floor(hi.z/16);z++)for(const m of this.cells.get(x+':'+z)??[])candidates.add(m);
    let nearest:ReturnType<Ray['intersectsMesh']>|null=null;
    for(const m of candidates){
      m.computeWorldMatrix();const b=m.getBoundingInfo().boundingBox;
      if(!ray.intersectsBoxMinMax(b.minimumWorld,b.maximumWorld))continue;
      const hit=ray.intersectsMesh(m,false);if(hit.hit&&hit.distance<=ray.length&&(!nearest||hit.distance<nearest.distance))nearest=hit;
    }return nearest;
  }
  ground(x:number,z:number,y:number,reach:number){const h=this.vertical(x,z,y,reach);return h&&h.normalY>.55?{height:h.height,normalY:h.normalY,rockId:'palace:brisalia'}:null;}
  headroom(x:number,y:number,z:number,h:number){return !this.vertical(x,z,y+.15,h-.15,true);}
  rainHeight(x:number,z:number){return this.vertical(x,z,768,1024)?.height??null;}
  wall(x:number,y:number,z:number,dx:number,dz:number,reach:number){
    const hit=this.cast(new Ray(new Vector3(x,y,z),new Vector3(dx,0,dz).normalize(),reach));
    if(!hit?.pickedPoint)return null;const n=hit.getNormal(true);if(!n||Math.abs(n.y)>.75)return null;
    return {pointX:hit.pickedPoint.x,pointY:hit.pickedPoint.y,pointZ:hit.pickedPoint.z,distance:hit.distance,normalX:n.x,normalY:n.y,normalZ:n.z,climbable:false,rockId:'palace:brisalia'};
  }
  cameraObstruction(a:Vector3,b:Vector3){const d=b.subtract(a),len=d.length();return len?this.cast(new Ray(a,d.scale(1/len),len))?.distance??null:null;}
  clear(){this.cells.clear();this.verticals.clear();this.doors.length=0;}
}

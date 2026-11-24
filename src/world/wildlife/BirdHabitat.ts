import { Ray, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import type { BirdHabitat, BirdObstacle, BirdPoint, BirdSite } from './BirdSimulation';

export type BirdTree={id:string;perches:BirdPoint[];obstacle:BirdObstacle;canopy?:boolean};
export type BirdWorld={ground:(x:number,z:number)=>number;water:(x:number,z:number)=>number|null;
  /** Canonical terrain triangle spacing, when the provider has a fixed grid. */
  groundSpacing?:number;
  trees:(x:number,z:number,radius:number)=>BirdTree[];
  /** Regional eligibility applies to every resource and canopy, not just food. */
  habitatAllowed?:(x:number,z:number)=>boolean;
  /** Reject interiors, foundations and player constructions as food patches. */
  foodAllowed:(x:number,z:number)=>boolean};

/** Actual upward surfaces, sampled once in template coordinates (thin-instance bounds are unsuitable). */
export function treePerchGeometry(mesh:Mesh):{points:BirdPoint[];radius:number;top:number}{
  const p=mesh.getVerticesData('position'),indices=mesh.getIndices();
  if(!p||!indices)return {points:[],radius:0,top:0};
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,top=-Infinity,bottom=Infinity;
  for(let i=0;i<p.length;i+=3){minX=Math.min(minX,p[i]);maxX=Math.max(maxX,p[i]);minZ=Math.min(minZ,p[i+2]);maxZ=Math.max(maxZ,p[i+2]);top=Math.max(top,p[i+1]);bottom=Math.min(bottom,p[i+1]);}
  const points:BirdPoint[]=[];
  for(const [u,v] of [[.5,.5],[.32,.42],[.68,.58],[.42,.68],[.58,.32]]){
    const x=minX+(maxX-minX)*u,z=minZ+(maxZ-minZ)*v;let y=-Infinity;
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const den=(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2]);
      if(Math.abs(den)<1e-8)continue;
      const w1=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/den;
      const w2=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/den;
      if(w1<0||w2<0||w1+w2>1)continue;
      const ax=p[b]-p[a],ay=p[b+1]-p[a+1],az=p[b+2]-p[a+2];
      const bx=p[c]-p[a],by=p[c+1]-p[a+1],bz=p[c+2]-p[a+2];
      const ny=az*bx-ax*bz;
      if(Math.abs(ny)/Math.hypot(ay*bz-az*by,ny,ax*by-ay*bx)<.55)continue;
      y=Math.max(y,w1*p[a+1]+w2*p[b+1]+(1-w1-w2)*p[c+1]);
    }
    if(y>bottom+(top-bottom)*.6)points.push({x,y,z});
  }
  return {points,radius:Math.max(maxX-minX,maxZ-minZ)*.5,top};
}

/** Habitat discovery is amortized over frames; flight never raycasts the full scene. */
export class BirdHabitatScanner implements BirdHabitat {
  sites:BirdSite[]=[];
  obstacles:BirdObstacle[]=[];
  revision=0;
  readonly ground:(x:number,z:number)=>number;
  readonly water:(x:number,z:number)=>number|null;
  private pending:BirdPoint[]=[];
  private staged:BirdSite[]=[];
  private stagedObstacles:BirdObstacle[]=[];
  private focus:BirdPoint={x:Infinity,y:0,z:Infinity};
  private timer=0;
  private scanning=false;
  private individualTrees=new WeakMap<object,ReturnType<typeof treePerchGeometry>>();
  private groundCache=new Map<string,number>();
  private waterCache=new Map<string,number|null>();
  constructor(private scene:Scene,private world:BirdWorld){
    // Cache canonical vertices, then interpolate the SAME terrain triangle.
    // Rounding arbitrary flight coordinates into cells created height steps;
    // near touchdown those steps drove the smooth path's lift arbitrarily high.
    const spacing=world.groundSpacing;
    const vertex=(x:number,z:number)=>{
      const key=`${x}:${z}`;let value=this.groundCache.get(key);
      if(value===undefined){value=world.ground(x,z);if(this.groundCache.size>12000)this.groundCache.clear();this.groundCache.set(key,value);}
      return value;
    };
    this.ground=(x,z)=>{
      if(!spacing)return vertex(x,z);
      const x0=Math.floor(x/spacing)*spacing,z0=Math.floor(z/spacing)*spacing;
      const u=(x-x0)/spacing,v=(z-z0)/spacing;
      if(u+v<=1){const a=vertex(x0,z0);return a+u*(vertex(x0+spacing,z0)-a)+v*(vertex(x0,z0+spacing)-a);}
      const d=vertex(x0+spacing,z0+spacing);
      return d+(1-v)*(vertex(x0+spacing,z0)-d)+(1-u)*(vertex(x0,z0+spacing)-d);
    };
    this.water=(x,z)=>{
      const key=`${Math.round(x*4)}:${Math.round(z*4)}`;
      if(this.waterCache.has(key))return this.waterCache.get(key)!;
      const value=world.water(x,z);if(this.waterCache.size>12000)this.waterCache.clear();this.waterCache.set(key,value);return value;
    };
  }
  allowed(x:number,z:number):boolean{return this.world.habitatAllowed?.(x,z)??true;}
  reset():void{this.sites=[];this.obstacles=[];this.pending=[];this.staged=[];this.stagedObstacles=[];this.scanning=false;this.focus.x=Infinity;this.timer=0;this.groundCache.clear();this.waterCache.clear();this.revision++;}

  update(dt:number,focus:BirdPoint):void{
    const start=performance.now();
    this.timer-=dt;
    if(!this.pending.length&&(this.timer<=0||Math.hypot(focus.x-this.focus.x,focus.z-this.focus.z)>18))this.begin(focus);
    for(let i=0;i<18&&this.pending.length;i++){
      this.sample(this.pending.shift()!);
      if(performance.now()-start>=2)break;
    }
    if(!this.pending.length&&this.scanning){this.sites=this.staged;this.obstacles=this.stagedObstacles;this.staged=[];this.scanning=false;this.revision++;}
  }

  private begin(focus:BirdPoint):void{
    this.focus={...focus};this.timer=5;this.staged=[];this.stagedObstacles=[];this.scanning=true;
    this.groundCache.clear();this.waterCache.clear();
    for(const tree of this.world.trees(focus.x,focus.z,100)){
      this.stagedObstacles.push(tree.obstacle);
      tree.perches.forEach((p,i)=>{if(this.allowed(p.x,p.z))
        this.staged.push({...p,id:`${tree.id}:${i}`,kind:'tree',canopy:tree.canopy!==false});});
    }
    // Harvestable trees are ordinary instances and inherit their resource node's visibility.
    for(const mesh of this.scene.meshes){
      if(!mesh.metadata?.treeVisual||!mesh.isEnabled()||!mesh.isVisible)continue;
      mesh.computeWorldMatrix();const center=mesh.getBoundingInfo().boundingBox.centerWorld;
      if(Math.hypot(center.x-focus.x,center.z-focus.z)>100)continue;
      const source=('sourceMesh' in mesh?mesh.sourceMesh:mesh) as Mesh;
      let geometry=this.individualTrees.get(source);
      if(!geometry){geometry=treePerchGeometry(source);this.individualTrees.set(source,geometry);}
      const transform=mesh.getWorldMatrix(),box=mesh.getBoundingInfo().boundingBox;
      const id=`tree-instance:${mesh.uniqueId}`;
      this.stagedObstacles.push({id,minX:box.minimumWorld.x,maxX:box.maximumWorld.x,
        minZ:box.minimumWorld.z,maxZ:box.maximumWorld.z,top:box.maximumWorld.y});
      geometry.points.forEach((p,i)=>{const q=Vector3.TransformCoordinates(new Vector3(p.x,p.y,p.z),transform);
        if(this.allowed(q.x,q.z))this.staged.push({id:`${id}:${i}`,kind:'tree',x:q.x,y:q.y,z:q.z,
          canopy:!/Seco|Dead|Stump/i.test(mesh.metadata.assetId??'')});});
    }
    // Authored roofs, fences and construction geometry. Excludes vegetation/grass templates and actors.
    const solids=this.scene.meshes.filter(m=>m.isEnabled()&&m.isVisible&&m.getTotalVertices()>0&&
      !m.hasThinInstances&&(m.metadata?.buildingId&&m.metadata?.buildingCollision!==false||m.metadata?.structureId));
    for(const mesh of solids){
      mesh.computeWorldMatrix();const box=mesh.getBoundingInfo().boundingBox,a=box.minimumWorld,b=box.maximumWorld;
      const x=(a.x+b.x)*.5,z=(a.z+b.z)*.5;
      if(Math.hypot(x-focus.x,z-focus.z)>110||b.y<focus.y-30)continue;
      this.stagedObstacles.push({id:`solid:${mesh.uniqueId}`,minX:a.x,maxX:b.x,minZ:a.z,maxZ:b.z,top:b.y});
      if(this.staged.filter(s=>s.kind==='perch').length>=24)continue;
      const hit=new Ray(new Vector3(x,b.y+.2,z),Vector3.Down(),b.y-a.y+.4).intersectsMesh(mesh,false);
      if(this.allowed(x,z)&&hit.pickedPoint&&Math.abs(hit.getNormal(true)?.y??0)>.65&&hit.pickedPoint.y>this.ground(x,z)+.8)
        this.staged.push({id:`solid:${mesh.uniqueId}`,kind:'perch',x,y:hit.pickedPoint.y,z});
    }
    // A world-anchored grid keeps IDs stable as the player and streaming window move.
    const cx=Math.round(focus.x/8)*8,cz=Math.round(focus.z/8)*8;
    for(let dz=-80;dz<=80;dz+=8)for(let dx=-80;dx<=80;dx+=8){
      if(dx*dx+dz*dz<=80*80)this.pending.push({x:cx+dx,y:0,z:cz+dz});
    }
    this.pending.sort((a,b)=>Math.hypot(a.x-focus.x,a.z-focus.z)-Math.hypot(b.x-focus.x,b.z-focus.z));
  }

  private blocked(x:number,z:number,y:number):boolean{
    return this.stagedObstacles.some(o=>x>o.minX-.5&&x<o.maxX+.5&&z>o.minZ-.5&&z<o.maxZ+.5&&o.top>y+.5);
  }
  private sample(p:BirdPoint):void{
    if(!this.allowed(p.x,p.z))return;
    const {x,z}=p,y=this.ground(x,z),water=this.water(x,z);
    if(!Number.isFinite(y)||y<-100||this.blocked(x,z,y))return;
    if(water!==null&&water>y+.08){
      // Enough open runway to finish a drinking pass without entering a bank.
      for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1]]){
        const endX=x+dx*8,endZ=z+dz*8,w=this.water(endX,endZ);
        if(this.allowed(endX,endZ)&&w!==null&&this.ground(endX,endZ)<w-.12){
          this.staged.push({id:`water:${x}:${z}`,kind:'water',x,y:water+.18,z,heading:Math.atan2(dx,dz)});break;
        }
      }
      // Search and bisect actual shorelines; never give a canary a deep-water target.
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        let lo=0,hi=12;const endY=this.ground(x+dx*hi,z+dz*hi),endW=this.water(x+dx*hi,z+dz*hi);
        if(endW!==null&&endY<endW)continue;
        for(let i=0;i<8;i++){const m=(lo+hi)*.5,mx=x+dx*m,mz=z+dz*m,mw=this.world.water(mx,mz);if(mw!==null&&this.world.ground(mx,mz)<mw)lo=m;else hi=m;}
        const sx=x+dx*(hi+.12),sz=z+dz*(hi+.12),sy=this.world.ground(sx,sz),near=this.world.water(x+dx*lo,z+dz*lo);
        if(!this.allowed(sx,sz)||near===null||Math.abs(sy-near)>.35||this.blocked(sx,sz,sy))continue;
        this.staged.push({id:`shore:${x}:${z}:${dx}:${dz}`,kind:'shore',x:sx,y:sy,z:sz,heading:Math.atan2(-dx,-dz)});
      }
      return;
    }
    if(!this.world.foodAllowed(x,z)||Math.abs(this.ground(x+1,z)-this.ground(x-1,z))>.65||
      Math.abs(this.ground(x,z+1)-this.ground(x,z-1))>.65)return;
    for(const [dx,dz] of [[0,0],[.8,0],[0,.8]]){
      const px=x+dx,pz=z+dz,py=this.world.ground(px,pz),pw=this.world.water(px,pz);
      if(!this.allowed(px,pz)||pw!==null&&pw>=py-.03||!this.world.foodAllowed(px,pz))continue;
      this.staged.push({id:`food:${px}:${pz}`,kind:'food',x:px,y:py,z:pz});
    }
  }
}

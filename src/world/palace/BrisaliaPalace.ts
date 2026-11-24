import {Color3,Mesh,PointLight,Scene,TransformNode,Vector3,VertexData,type PBRMaterial,type ShadowGenerator} from '@babylonjs/core';
import {PALACE_SCALE,BRISALIA_PALACE_SITE,palaceLocal} from './PalaceSite';
import {PalaceCollision} from './PalaceCollision';
import {palaceMaterials} from './PalaceMaterials';
import {boxGeometry,face,geometry,unionBoxes,type Box} from './PalaceGeometry';
import type {Anchor,DoorSpec,Part} from './PalaceModel';
import type {compilePalace} from './PalaceWorker';
import {BrisaliaFountain,FOUNTAIN} from '../BrisaliaFountain';
import {expandX,expandZ} from './PalaceExpansion';

type Door={id:string;center:Vector3;root:TransformNode;leaves:{pivot:TransformNode;target:number}[];open:boolean;progress:number;width:number};
const yieldFrame=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
/** The town startup never awaits this building. Geometry is compiled off-thread;
 * GPU objects are uploaded in small batches, then collision becomes resident. */
export class BrisaliaPalace{
  readonly root:TransformNode;
  readonly collision=new PalaceCollision();
  readonly doors:Door[]=[];
  anchors:Anchor[]=[];
  loaded=false;error:string|null=null;
  private pending:Promise<void>|null=null;
  private worker:Worker|null=null;
  private disposed=false;
  private parts:{mesh:Mesh;detail:boolean;hidden:boolean}[]=[];
  private materials=new Map<string,PBRMaterial>();
  private lamps:Vector3[]=[];
  private lights:PointLight[]=[];
  private fountain:BrisaliaFountain|null=null;
  private shadowCandidates:Mesh[]=[];
  private shadowCasters=new Set<Mesh>();
  private tick=0;
  readonly stats={buildMs:0,batches:0,triangles:0,visibleBatches:0,doors:0};
  constructor(private scene:Scene,parent:TransformNode,readonly floorHeight:number,private shadows?:ShadowGenerator){
    this.root=new TransformNode('brisalia:palace-astra-v1',scene);this.root.parent=parent;
    this.root.position.set(BRISALIA_PALACE_SITE.x,floorHeight,BRISALIA_PALACE_SITE.z);
    this.root.rotation.y=BRISALIA_PALACE_SITE.yaw;this.root.scaling.setAll(PALACE_SCALE);
    this.root.metadata={source:'Brisalia_Palacio_Exacto_v1.json',sourceMetersToWorldUnits:PALACE_SCALE,region:'brisalia',revision:1};
  }
  ensureNear(x:number,z:number):Promise<void>{
    if(Math.hypot(x-BRISALIA_PALACE_SITE.x,z-BRISALIA_PALACE_SITE.z)>520||this.loaded||this.disposed)return Promise.resolve();
    if(!this.pending)this.pending=this.load().catch(error=>{this.error=String(error);console.error('[Palacio de Brisalia]',error);throw error;});
    return this.pending;
  }
  private async load(){
    const start=performance.now(),worker=this.worker=new Worker(new URL('./PalaceWorker.ts',import.meta.url),{type:'module'});
    const result=await new Promise<ReturnType<typeof compilePalace>>((resolve,reject)=>{
      worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.result);
      worker.onerror=e=>reject(new Error(e.message));worker.postMessage({build:true});
    });worker.terminate();this.worker=null;if(this.disposed)return;
    this.materials=await palaceMaterials(this.scene);if(this.disposed){this.materials.forEach(m=>m.dispose(false,true));return;}this.root.setEnabled(false);
    let deadline=performance.now()+5;
    for(const p of result.batches){
      const mesh=this.mesh(p.id,p.data,p.material);mesh.isVisible=p.material!=='hidden';
      this.parts.push({mesh,detail:p.detail,hidden:p.material==='hidden'});
      if(p.solid)this.collision.add(mesh);
      this.stats.triangles+=p.data.indices.length/3;
      if(performance.now()>deadline){await yieldFrame();if(this.disposed)return;deadline=performance.now()+5;}
    }
    for(const d of result.doors){this.makeDoor(d);if(performance.now()>deadline){await yieldFrame();if(this.disposed)return;deadline=performance.now()+5;}}
    this.anchors=result.anchors;this.lamps=result.lamps.map(p=>Vector3.TransformCoordinates(Vector3.FromArray(p),this.root.computeWorldMatrix(true)));
    for(let i=0;i<2;i++){const light=new PointLight('palace:local-lantern'+i,Vector3.Zero(),this.scene);light.diffuse=new Color3(1,.69,.32);light.intensity=0;light.range=25;this.lights.push(light);}
    this.fountain=new BrisaliaFountain(this.scene,this.root,new Vector3(0,-.6,-16));
    this.fountain.root.scaling.setAll(6.4/FOUNTAIN.sourceWidth);
    await this.fountain.ready;if(this.disposed)return;
    let minY=Infinity,maxY=-Infinity;
    for(const m of this.fountain.meshes){m.unfreezeWorldMatrix();m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;minY=Math.min(minY,b.minimumWorld.y);maxY=Math.max(maxY,b.maximumWorld.y);}
    if(maxY>minY)this.fountain.root.scaling.y*=2.5*PALACE_SCALE/(maxY-minY);
    this.fountain.root.metadata={...this.fountain.root.metadata,planDiameter:6.4,planHeight:2.5};
    this.fountain.root.computeWorldMatrix(true);for(const m of this.fountain.meshes){m.unfreezeWorldMatrix();m.computeWorldMatrix(true);this.collision.add(m);}
    this.loaded=true;this.root.setEnabled(true);this.stats.batches=this.parts.length;this.stats.doors=this.doors.length;this.stats.buildMs=performance.now()-start;
  }
  private mesh(name:string,g:Part['data'],material:string,parent=this.root){
    const m=new Mesh('palace:'+name,this.scene),v=new VertexData();Object.assign(v,g);v.applyToMesh(m);m.parent=parent;m.material=this.materials.get(material)!;
    m.isPickable=material!=='hidden';m.visibility=material==='hidden'?0:1;m.checkCollisions=false;m.metadata={palace:true,collisionOnly:material==='hidden'};m.receiveShadows=material!=='hidden';m.computeWorldMatrix(true);
    if(!['hidden','glass','light','banner'].includes(material))this.shadowCandidates.push(m);return m;
  }
  private makeDoor({opening:o}:DoorSpec){
    const root=new TransformNode('palace:door:'+o.id,this.scene);root.parent=this.root;
    root.position.set(o.center_xyz[0],o.bottom_y,o.center_xyz[2]);root.rotation.y=o.span_axis==='X'?0:-Math.PI/2;
    const normal=o.open_normal_xz??[0,1],dir=o.span_axis==='X'?-normal[1]:normal[0],width=o.width/(o.leaf_count??1),leaves:Door['leaves']=[];
    for(let i=0;i<(o.leaf_count??1);i++){
      const side=i===0?1:-1,pivot=new TransformNode(o.id+':hinge'+i,this.scene);pivot.parent=root;pivot.position.x=i===0?-o.width/2:o.width/2;
      const a=i===0?0:-width,b=i===0?width:0,t=o.leaf_thickness??.06;
      const g=o.id==='PB-D001'?this.archLeaf(a,b,i===0?-o.width/2:o.width/2,t,o.width/4):boxGeometry([a+.015,b-.015,0,o.height-.025,-t/2,t/2],geometry(),true);
      const leaf=this.mesh(o.id+':leaf'+i,g,'oak',pivot);this.collision.doors.push(leaf);
      const mouldings:Box[]=[],hardware:Box[]=[],top=o.id==='PB-D001'?2.9:o.height-.13;
      for(const s of [-1,1]){
        const za=s<0?-t/2-.035:t/2,zb=za+.035;
        for(const x of [a+.07,b-.14])mouldings.push([x,x+.07,.12,top,za,zb]);
        for(const y of [.12,.8,1.7,top-.07])mouldings.push([a+.14,b-.14,y,y+.07,za,zb]);
        const handle=i===0?b-.22:a+.22,base=s*(t/2+.035);
        hardware.push([handle-.025,handle+.025,1.02,1.28,Math.min(base,base+s*.09),Math.max(base,base+s*.09)]);
      }
      this.mesh(o.id+':panels'+i,unionBoxes(mouldings,geometry(),true),'oak',pivot);
      this.mesh(o.id+':handle'+i,unionBoxes(hardware),'brass',pivot);
      const target=dir*side*(o.angle_deg??100)*Math.PI/180;pivot.rotation.y=target;leaves.push({pivot,target});
    }
    this.doors.push({id:o.id,center:Vector3.TransformCoordinates(new Vector3(o.center_xyz[0],o.bottom_y+1,o.center_xyz[2]),this.root.computeWorldMatrix(true)),root,leaves,open:true,progress:1,width:o.width*PALACE_SCALE});
  }
  private archLeaf(a:number,b:number,offset:number,t:number,horizontalScale=1){
    const g=geometry(),radius=3.6333333333;
    for(let i=0;i<16;i++){
      const x=a+(b-a)*i/16,xx=a+(b-a)*(i+1)/16,y=-.0333333333+Math.sqrt(radius*radius-((x+offset)/horizontalScale)**2)-.025,yy=-.0333333333+Math.sqrt(radius*radius-((xx+offset)/horizontalScale)**2)-.025;
      for(const s of [-1,1])face(g,[[x,0,s*t/2],[xx,0,s*t/2],[xx,yy,s*t/2],[x,y,s*t/2]],[0,0,s]);
      face(g,[[x,y,-t/2],[xx,yy,-t/2],[xx,yy,t/2],[x,y,t/2]],[0,1,0]);
    }face(g,[[a,0,-t/2],[b,0,-t/2],[b,0,t/2],[a,0,t/2]],[0,-1,0]);
    for(const [x,n] of [[a,-1],[b,1]]){const y=-.0333333333+Math.sqrt(radius*radius-((x+offset)/horizontalScale)**2)-.025;face(g,[[x,0,-t/2],[x,y,-t/2],[x,y,t/2],[x,0,t/2]],[n,0,0]);}
    for(let i=0;i<g.positions.length/3;i++){g.uvs[i*2]=g.positions[i*3]/.35;g.uvs[i*2+1]=g.positions[i*3+1]/2;}return g;
  }
  nearestDoor(p:Vector3){let best:Door|null=null,dist=3.9;for(const d of this.doors){const n=Vector3.Distance(d.center,p.add(new Vector3(0,2,0)));if(n<dist){dist=n;best=d;}}return best;}
  toggleDoor(p:Vector3){const d=this.nearestDoor(p);if(!d)return false;
    // Do not sweep a leaf through the player when closing it.
    if(d.open){for(const l of d.leaves){const hinge=l.pivot.getAbsolutePosition();if(Math.hypot(p.x-hinge.x,p.z-hinge.z)<d.width/d.leaves.length+.7)return false;}}
    d.open=!d.open;return true;
  }
  update(dt:number,p:Vector3,night:number){
    const distance=Math.hypot(p.x-BRISALIA_PALACE_SITE.x,p.z-BRISALIA_PALACE_SITE.z);
    if(!this.loaded){if(!this.pending&&distance<520)void this.ensureNear(p.x,p.z).catch(()=>{});return;}
    if(distance>=750){this.root.setEnabled(false);for(const light of this.lights)light.intensity=0;this.syncShadows(p,false);return;}
    for(const d of this.doors){const target=d.open?1:0;if(Math.abs(d.progress-target)>.001){d.progress+=Math.sign(target-d.progress)*Math.min(Math.abs(target-d.progress),dt*1.5);for(const l of d.leaves)l.pivot.rotation.y=l.target*(d.progress*d.progress*(3-2*d.progress));}}
    this.tick+=dt;if(this.tick<.2)return;this.tick=0;
    this.root.setEnabled(distance<750);let visible=0;const lp=palaceLocal(p.x,p.z),localY=(p.y-this.floorHeight)/PALACE_SCALE;
    for(const part of this.parts){const center=part.mesh.getBoundingInfo().boundingBox.center;
      part.mesh.isVisible=!part.hidden&&(!part.detail||distance<250&&Math.hypot(expandX(lp.x)-center.x,expandZ(lp.z)-center.z)<32&&Math.abs(localY-center.y)<5);
      if(part.mesh.isVisible&&distance<750)visible++;}
    this.stats.visibleBatches=visible;
    for(const door of this.doors)door.root.setEnabled(Vector3.DistanceSquared(p,door.center)<80*80);
    this.syncShadows(p,true);
    const lamps=[...this.lamps].sort((a,b)=>Vector3.DistanceSquared(a,p)-Vector3.DistanceSquared(b,p));
    this.lights.forEach((light,i)=>{light.position.copyFrom(lamps[i]??Vector3.Zero());light.intensity=distance<170?Math.max(.2,night)*.8:0;});
    this.fountain?.update(.2,p,1-night,distance<170);
  }
  private syncShadows(p:Vector3,enabled:boolean){
    if(!this.shadows)return;
    const wanted=new Set(enabled?this.shadowCandidates.filter(m=>m.isVisible&&m.isEnabled()).map(m=>{
      const b=m.getBoundingInfo().boundingBox,x=Math.max(b.minimumWorld.x,Math.min(b.maximumWorld.x,p.x)),z=Math.max(b.minimumWorld.z,Math.min(b.maximumWorld.z,p.z));
      return {m,d:(x-p.x)**2+(z-p.z)**2};
    }).filter(v=>v.d<55*55).sort((a,b)=>a.d-b.d).slice(0,48).map(v=>v.m):[]);
    for(const m of this.shadowCasters)if(!wanted.has(m))this.shadows.removeShadowCaster(m,false);
    for(const m of wanted)if(!this.shadowCasters.has(m))this.shadows.addShadowCaster(m,false);
    this.shadowCasters=wanted;
  }
  dispose(){this.disposed=true;this.syncShadows(Vector3.Zero(),false);this.worker?.terminate();this.collision.clear();this.fountain?.dispose();this.lights.forEach(l=>l.dispose());this.root.dispose(false,false);this.materials.forEach(m=>m.dispose(false,true));}
}



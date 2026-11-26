import {Color3,DirectionalLight,HemisphericLight,Mesh,PointLight,Scene,ShadowGenerator,TransformNode,Vector3,VertexData,type PBRMaterial} from '@babylonjs/core';
import {PALACE_SCALE,BRISALIA_PALACE_SITE,palaceLocal} from './PalaceSite';
import {PalaceCollision} from './PalaceCollision';
import {palaceMaterials} from './PalaceMaterials';
import {boxGeometry,face,geometry,unionBoxes,type Box} from './PalaceGeometry';
import type {Anchor,DoorSpec,Part} from './PalaceModel';
import type {compilePalace} from './PalaceWorker';
import {PalaceFountain} from './PalaceFountain';
import {PalaceVegetation} from './PalaceVegetation';
import {PalaceContactShadows} from './PalaceContactShadows';
import {expandX,expandZ} from './PalaceExpansion';
import {PALACE_INTERACTIONS} from './PalaceInteractions';

type Door={id:string;center:Vector3;root:TransformNode;leaves:{pivot:TransformNode;target:number}[];open:boolean;progress:number;width:number;exterior:boolean};
const PALACE_LIGHT_LAYER=0x10000000;
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
  private fountain:PalaceFountain|null=null;
  private vegetation:PalaceVegetation|null=null;
  private contactShadows:PalaceContactShadows|null=null;
  private shadowCandidates:Mesh[]=[];
  private shadowCasters=new Set<Mesh>();
  private palaceSun:DirectionalLight|null=null;
  private palaceShadows:ShadowGenerator|null=null;
  private palaceAmbient:HemisphericLight|null=null;
  private ambientSource:HemisphericLight|null=null;
  private sourceSunMask=0;
  private sourceAmbientMask=0;
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
    this.materials=await palaceMaterials(this.scene,this.floorHeight);if(this.disposed){this.materials.forEach(m=>m.dispose(false,true));return;}this.root.setEnabled(false);
    const sun=this.shadows?.getLight();
    if(sun instanceof DirectionalLight){
      this.palaceSun=new DirectionalLight('palace:sun',sun.direction.clone(),this.scene);
      this.palaceSun.includeOnlyWithLayerMask=PALACE_LIGHT_LAYER;
      this.sourceSunMask=sun.excludeWithLayerMask;sun.excludeWithLayerMask|=PALACE_LIGHT_LAYER;
      this.palaceSun.renderPriority=20;this.palaceSun.intensity=sun.intensity;this.palaceSun.diffuse.copyFrom(sun.diffuse);
      this.palaceSun.shadowFrustumSize=240;this.palaceSun.shadowMinZ=1;this.palaceSun.shadowMaxZ=600;
      this.palaceShadows=new ShadowGenerator(2048,this.palaceSun);
      // This map covers the full palace footprint. A smaller bias creates
      // self-shadow bands across the large, nearly horizontal garden slabs.
      this.palaceShadows.usePoissonSampling=true;this.palaceShadows.bias=.001;this.palaceShadows.normalBias=.08;this.palaceShadows.darkness=.12;
      this.palaceShadows.getShadowMap()!.refreshRate=6;
    }
    const ambient=this.scene.getLightByName('ambiente');
    if(ambient instanceof HemisphericLight){
      this.ambientSource=ambient;this.sourceAmbientMask=ambient.excludeWithLayerMask;ambient.excludeWithLayerMask|=PALACE_LIGHT_LAYER;
      this.palaceAmbient=new HemisphericLight('palace:ambient',new Vector3(0,1,0),this.scene);
      this.palaceAmbient.includeOnlyWithLayerMask=PALACE_LIGHT_LAYER;this.palaceAmbient.renderPriority=18;
    }
    for(let i=0;i<2;i++){const light=new PointLight('palace:local-lantern'+i,Vector3.Zero(),this.scene);light.diffuse=new Color3(1,.69,.32);light.renderPriority=19;light.intensity=0;light.range=19;light.includeOnlyWithLayerMask=PALACE_LIGHT_LAYER;this.lights.push(light);}
    let deadline=performance.now()+5;
    for(const p of result.batches){
      const mesh=this.mesh(p.id,p.data,p.material);mesh.isVisible=p.material!=='hidden';
      this.parts.push({mesh,detail:p.detail,hidden:p.material==='hidden'});
      if(p.solid)this.collision.add(mesh);mesh.freezeWorldMatrix();
      this.stats.triangles+=p.data.indices.length/3;
      if(performance.now()>deadline){await yieldFrame();if(this.disposed)return;deadline=performance.now()+5;}
    }
    for(const d of result.doors){this.makeDoor(d);if(performance.now()>deadline){await yieldFrame();if(this.disposed)return;deadline=performance.now()+5;}}
    this.anchors=result.anchors;this.lamps=result.lamps.map(p=>Vector3.TransformCoordinates(Vector3.FromArray(p),this.root.computeWorldMatrix(true)));

    this.fountain=new PalaceFountain(this.scene,this.root,new Vector3(0,-1.2,-16),this.materials,this.palaceSun??undefined);
    for(const m of this.fountain.meshes){this.parts.push({mesh:m,detail:false,hidden:false});this.stats.triangles+=m.getTotalIndices()/3;}
    for(const m of this.fountain.colliders)this.collision.add(m);
    this.vegetation=new PalaceVegetation(this.scene,this.root);await this.vegetation.load(result.plants);if(this.disposed)return;
    for(const m of this.vegetation.meshes){this.parts.push({mesh:m,detail:false,hidden:false});this.stats.triangles+=m.getTotalIndices()/3*m.thinInstanceCount;}
    this.contactShadows=new PalaceContactShadows(this.scene);
    this.loaded=true;this.root.setEnabled(true);this.stats.batches=this.parts.length;this.stats.doors=this.doors.length;this.stats.buildMs=performance.now()-start;
  }
  private mesh(name:string,g:Part['data'],material:string,parent=this.root){
    const m=new Mesh('palace:'+name,this.scene),v=new VertexData();Object.assign(v,g);v.applyToMesh(m);m.parent=parent;m.material=this.materials.get(material)!;
    m.layerMask|=PALACE_LIGHT_LAYER;
    m.isPickable=material!=='hidden';m.visibility=material==='hidden'?0:1;m.checkCollisions=false;m.metadata={palace:true,collisionOnly:material==='hidden'};m.receiveShadows=material!=='hidden';m.computeWorldMatrix(true);
    if(!['hidden','glass','light','banner','roofTile','roofHoney','roofRusset'].includes(material))this.shadowCandidates.push(m);return m;
  }
  private makeDoor({opening:o}:DoorSpec){
    const root=new TransformNode('palace:door:'+o.id,this.scene);root.parent=this.root;
    root.position.set(o.center_xyz[0],o.bottom_y,o.center_xyz[2]);root.rotation.y=o.span_axis==='X'?0:-Math.PI/2;
    const normal=o.open_normal_xz??[0,1],dir=o.span_axis==='X'?-normal[1]:normal[0],width=o.width/(o.leaf_count??1),leaves:Door['leaves']=[];
    for(let i=0;i<(o.leaf_count??1);i++){
      const side=i===0?1:-1,pivot=new TransformNode(o.id+':hinge'+i,this.scene);pivot.parent=root;pivot.position.x=i===0?-o.width/2:o.width/2;
      const a=i===0?0:-width,b=i===0?width:0,t=o.leaf_thickness??.06;
      const g=o.id==='PB-D001'?this.archLeaf(a,b,i===0?-o.width/2:o.width/2,t,o.width/4):boxGeometry([a+.015,b-.015,0,o.height-.025,-t/2,t/2],geometry(),true);
      const mouldings:Box[]=[],hardware:Box[]=[],top=o.id==='PB-D001'?2.9:o.height-.13;
      for(const s of [-1,1]){
        const za=s<0?-t/2-.035:t/2,zb=za+.035;
        for(const x of [a+.07,b-.14])mouldings.push([x,x+.07,.12,top,za,zb]);
        for(const y of [.12,.8,1.7,top-.07])mouldings.push([a+.14,b-.14,y,y+.07,za,zb]);
        const handle=i===0?b-.22:a+.22,base=s*(t/2+.035);
        hardware.push([handle-.025,handle+.025,1.02,1.28,Math.min(base,base+s*.09),Math.max(base,base+s*.09)]);
      }
      const panels=unionBoxes(mouldings,geometry(),true),offset=g.positions.length/3;
      g.positions.push(...panels.positions);g.normals.push(...panels.normals);g.uvs.push(...panels.uvs);g.indices.push(...panels.indices.map(n=>n+offset));
      const leaf=this.mesh(o.id+':leaf'+i,g,'oak',pivot);this.collision.doors.push(leaf);
      this.mesh(o.id+':handle'+i,unionBoxes(hardware),'brass',pivot);
      if(o.id==='PB-D001'){const straps:Box[]=[];for(const sign of [-1,1])for(const y of [.46,1.48,2.5])straps.push([a+.05,b-.05,y,y+.075,sign<0?-t/2-.055:t/2+.035,sign<0?-t/2-.035:t/2+.055]);this.mesh(o.id+':ironwork'+i,unionBoxes(straps),'iron',pivot);}
      const target=dir*side*(o.angle_deg??100)*Math.PI/180;pivot.rotation.y=target;leaves.push({pivot,target});
    }
    this.doors.push({id:o.id,center:Vector3.TransformCoordinates(new Vector3(o.center_xyz[0],o.bottom_y+1,o.center_xyz[2]),this.root.computeWorldMatrix(true)),root,leaves,open:true,progress:1,width:o.width*PALACE_SCALE,exterior:Math.abs(o.center_xyz[0])>=39.9||o.center_xyz[2]<.25||o.center_xyz[2]>69.75});
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
  roomAt(p:Vector3){
    if(!this.loaded)return null;
    const x=(BRISALIA_PALACE_SITE.x-p.x)/PALACE_SCALE,z=(BRISALIA_PALACE_SITE.z-p.z)/PALACE_SCALE,y=(p.y-this.floorHeight)/PALACE_SCALE;
    if(y>=4.4&&y<16.7){
      const tower=this.anchors.find(a=>['S02','S07'].includes(a.id)&&x>a.bounds[0]&&x<a.bounds[1]&&z>a.bounds[2]&&z<a.bounds[3]);
      if(tower)return y>=14.6?{...tower,name:tower.id==='S02'?'Adarve de la torre oeste':'Adarve de la torre este'}:tower;
    }
    if(y<-.2||y>8.9)return null;
    return this.anchors.find(a=>a.level===(y<4.4?'PB':'PA')&&x>a.bounds[0]&&x<a.bounds[1]&&z>a.bounds[2]&&z<a.bounds[3])??null;
  }
  nearestInteraction(p:Vector3){
    const room=this.roomAt(p);if(!room)return null;
    for(const action of PALACE_INTERACTIONS){
      if(action.room!==room.id)continue;
      const [x,y,z]=action.position,at=Vector3.TransformCoordinates(new Vector3(expandX(x),y,expandZ(z)),this.root.getWorldMatrix());
      if(Math.abs(p.y-at.y)<1.5&&Vector3.DistanceSquared(p,at)<4*4)return action;
    }return null;
  }
  nearestDoor(p:Vector3){let best:Door|null=null,dist=3.9;for(const d of this.doors){const n=Vector3.Distance(d.center,p.add(new Vector3(0,2,0)));if(n<dist){dist=n;best=d;}}return best;}
  toggleDoor(p:Vector3){const d=this.nearestDoor(p);if(!d)return false;
    // Do not sweep a leaf through the player when closing it.
    if(d.open){for(const l of d.leaves){const hinge=l.pivot.getAbsolutePosition();if(Math.hypot(p.x-hinge.x,p.z-hinge.z)<d.width/d.leaves.length+.7)return false;}}
    d.open=!d.open;return true;
  }
  update(dt:number,p:Vector3,night:number){
    const distance=Math.hypot(p.x-BRISALIA_PALACE_SITE.x,p.z-BRISALIA_PALACE_SITE.z);
    this.contactShadows?.setEnabled(distance<360);
    if(!this.loaded){if(!this.pending&&distance<520)void this.ensureNear(p.x,p.z).catch(()=>{});return;}
    if(distance>=750){this.root.setEnabled(false);for(const light of this.lights)light.intensity=0;this.syncShadows(p,false);return;}
    for(const d of this.doors){const target=d.open?1:0;if(Math.abs(d.progress-target)>.001){d.progress+=Math.sign(target-d.progress)*Math.min(Math.abs(target-d.progress),dt*1.5);for(const l of d.leaves)l.pivot.rotation.y=l.target*(d.progress*d.progress*(3-2*d.progress));}}
    this.tick+=dt;if(this.tick<.2)return;this.tick=0;
    this.root.setEnabled(distance<750);let visible=0;const lp=palaceLocal(p.x,p.z),localY=(p.y-this.floorHeight)/PALACE_SCALE;
    for(const part of this.parts){const center=part.mesh.getBoundingInfo().boundingBox.center;
      part.mesh.isVisible=!part.hidden&&(!part.detail||distance<250&&Math.hypot(expandX(lp.x)-center.x,expandZ(lp.z)-center.z)<32&&Math.abs(localY-center.y)<5);
      if(part.mesh.isVisible&&distance<750)visible++;}
    this.stats.visibleBatches=visible;
    for(const door of this.doors)door.root.setEnabled(Vector3.DistanceSquared(p,door.center)<(door.exterior?220:120)**2);
    this.syncShadows(p,true);
    const lamps=[...this.lamps].sort((a,b)=>Vector3.DistanceSquared(a,p)-Vector3.DistanceSquared(b,p));
    this.lights.forEach((light,i)=>{
      const at=lamps[i],near=at?Math.max(0,1-Vector3.Distance(at,p)/30):0;
      light.position.copyFrom(at??Vector3.Zero());light.intensity=near*(.06+night*1.7);
    });
    this.materials.get('light')?.emissiveColor.set(.4+night*.6,.24+night*.39,.07+night*.13);
    this.fountain?.update(.2,p,1-night,distance<170);
  }
  private syncShadows(p:Vector3,enabled:boolean){
    if(this.palaceAmbient&&this.ambientSource){const a=this.palaceAmbient,b=this.ambientSource;a.intensity=enabled?b.intensity*.58:0;a.diffuse.copyFrom(b.diffuse);a.groundColor.copyFrom(b.groundColor);}
    if(this.palaceSun&&this.palaceShadows){
      const source=this.shadows!.getLight() as DirectionalLight,sun=this.palaceSun;
      sun.direction.copyFrom(source.direction);sun.diffuse.copyFrom(source.diffuse);sun.intensity=enabled?source.intensity:0;
      sun.shadowEnabled=enabled&&sun.direction.y<-.08&&sun.intensity>.08;
      sun.position.set(BRISALIA_PALACE_SITE.x,this.floorHeight+12,BRISALIA_PALACE_SITE.z-30*PALACE_SCALE).subtractInPlace(sun.direction.normalizeToNew().scale(260));
      // The sealed roof deck casts the building shadow. Millimetric tile skins
      // already have physical curvature; casting them again creates aliasing.
      const wanted=new Set(enabled?this.parts.filter(q=>!q.hidden&&!q.detail&&!['glass','light','banner','sage','rose','linen','roofTile','roofHoney','roofRusset'].includes(q.mesh.material!.name.slice(7))).map(q=>q.mesh):[]);
      for(const m of this.shadowCasters)if(!wanted.has(m))this.palaceShadows.removeShadowCaster(m,false);
      for(const m of wanted)if(!this.shadowCasters.has(m))this.palaceShadows.addShadowCaster(m,false);
      this.shadowCasters=wanted;return;
    }
    if(!this.shadows)return;
    const wanted=new Set(enabled?this.shadowCandidates.filter(m=>m.isVisible&&m.isEnabled()).map(m=>{
      const b=m.getBoundingInfo().boundingBox,x=Math.max(b.minimumWorld.x,Math.min(b.maximumWorld.x,p.x)),z=Math.max(b.minimumWorld.z,Math.min(b.maximumWorld.z,p.z));
      return {m,d:(x-p.x)**2+(z-p.z)**2};
    }).filter(v=>v.d<55*55).sort((a,b)=>a.d-b.d).slice(0,48).map(v=>v.m):[]);
    for(const m of this.shadowCasters)if(!wanted.has(m))this.shadows.removeShadowCaster(m,false);
    for(const m of wanted)if(!this.shadowCasters.has(m))this.shadows.addShadowCaster(m,false);
    this.shadowCasters=wanted;
  }
  dispose(){this.disposed=true;this.contactShadows?.dispose();this.syncShadows(Vector3.Zero(),false);this.worker?.terminate();this.collision.clear();this.fountain?.dispose();this.vegetation?.dispose();this.lights.forEach(l=>l.dispose());
    if(this.palaceSun){const source=this.shadows!.getLight();source.excludeWithLayerMask=(source.excludeWithLayerMask&~PALACE_LIGHT_LAYER)|(this.sourceSunMask&PALACE_LIGHT_LAYER);}
    if(this.ambientSource)this.ambientSource.excludeWithLayerMask=(this.ambientSource.excludeWithLayerMask&~PALACE_LIGHT_LAYER)|(this.sourceAmbientMask&PALACE_LIGHT_LAYER);
    this.palaceShadows?.dispose();this.palaceSun?.dispose();this.palaceAmbient?.dispose();this.root.dispose(false,false);this.materials.forEach(m=>m.dispose(false,true));}
}



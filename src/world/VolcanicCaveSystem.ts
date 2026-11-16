import { Color3, HemisphericLight, Light, Mesh, MeshBuilder, PBRMaterial, PointLight,
  Scene, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type AbstractMesh } from '@babylonjs/core';
import type { TraversalWorld } from '../game/CharacterTraversalController';
import { RockColliderSystem } from './RockColliderSystem';
import { buildCaveMouth } from './cavePortalGeometry';
import { buildCaveRoute, buildCaveShell, caveTriangle, emptyCaveGeometry, CAVE_LIGHTS, CAVE_NODES, CAVE_ROUTES, caveField,
  caveWorldPoint, VOLCANIC_CAVE, type CaveGeometry } from './volcanicCaveData';

/** Authored, streamed interior. Rendering and movement share the same triangles. */
export class VolcanicCaveSystem {
  readonly colliders=new RockColliderSystem(()=>undefined);
  private readonly groundColliders=new RockColliderSystem(()=>undefined);
  private readonly entranceColliders=new RockColliderSystem(()=>undefined);
  private readonly renderCandidates:{data:AbstractMesh[];length:number}={data:[],length:0};
  private exteriorCandidates:Scene['getActiveMeshCandidates']|null=null;
  private readonly interiorCandidates=()=>this.renderCandidates;
  readonly entrance:{x:number;z:number};
  private exterior:TransformNode|null=null;
  private interior:TransformNode|null=null;
  private active=false;
  occludesExterior=false;
  private entranceY=0;
  private exitY=0;
  private entranceYaw=0;
  private readonly stone:StandardMaterial;
  private readonly trail:StandardMaterial;
  private readonly amber:StandardMaterial;
  private readonly cyan:StandardMaterial;
  private readonly dark:StandardMaterial;
  private readonly exitGlow:StandardMaterial;
  private readonly lights:Light[]=[];
  private readonly pairs:{standard:PointLight;physical:PointLight;index:number}[]=[];
  private readonly exteriorLights=new Map<Light,boolean>();
  private atmosphere:{color:Color3;density:number;mode:number}|null=null;
  private reward:TransformNode|null=null;
  private secret:TransformNode|null=null;
  private refresh=0;
  private time=0;
  private checkpoint=new Vector3(0,VOLCANIC_CAVE.baseY,65);
  constructor(private readonly scene:Scene,private readonly heightAt:(x:number,z:number)=>number,
    geographic=true,textures=true){
    this.entrance=geographic?VOLCANIC_CAVE.entrance:VOLCANIC_CAVE.legacyEntrance;
    this.entranceYaw=geographic?VOLCANIC_CAVE.entranceYaw:0;
    const material=(name:string,color:Color3)=>{
      const m=new StandardMaterial(name,scene);m.diffuseColor=color;m.specularColor=new Color3(.035,.04,.045);
      m.backFaceCulling=true;m.maxSimultaneousLights=4;return m;
    };
    this.stone=material('crisol-basalto',new Color3(.81,.87,.94));
    this.stone.emissiveColor=new Color3(.055,.065,.075);
    this.trail=material('crisol-roca-erosionada',new Color3(.88,.89,.83));
    this.trail.emissiveColor=new Color3(.04,.045,.04);
    if(textures){
      const rock=new Texture('/assets/terrain/biomes/textures/albedo/biome_volcanico_basalto_albedo_1k.webp',scene);
      rock.wrapU=rock.wrapV=Texture.WRAP_ADDRESSMODE;rock.anisotropicFilteringLevel=8;
      this.stone.diffuseTexture=rock;this.trail.diffuseTexture=rock;
    }
    this.amber=material('crisol-cristal-ambar',new Color3(.72,.35,.12));this.amber.emissiveColor=new Color3(.35,.12,.035);
    this.amber.specularColor=new Color3(.5,.4,.25);this.amber.specularPower=48;
    this.cyan=material('crisol-mineral-azulado',new Color3(.14,.47,.5));this.cyan.emissiveColor=new Color3(.06,.27,.3);
    this.dark=material('crisol-fondo-en-sombra',new Color3(.12,.15,.17));
    this.dark.diffuseTexture=this.stone.diffuseTexture;this.dark.emissiveColor=new Color3(.008,.011,.014);
    this.exitGlow=material('crisol-luz-de-salida',Color3.White());this.exitGlow.disableLighting=true;this.exitGlow.emissiveColor=Color3.White();
  }
  get inside(){return this.active;}
  get loaded(){return this.interior!==null;}
  get ready(){return !!this.exterior;}
  get status(){return {inside:this.inside,entrance:{...this.entrance,y:this.entranceY},
    meshes:this.interior?.getChildMeshes(false).length??0,colliders:this.colliders.activeColliderCount,
    triangles:this.interior?.getChildMeshes(false).filter(m=>m.isVisible).reduce((n,m)=>n+m.getTotalIndices()/3,0)??0};}
  private mesh(name:string,g:CaveGeometry,root:TransformNode,mat:StandardMaterial,collision=true):Mesh{
    const m=new Mesh(name,this.scene),v=new VertexData(),normals:number[]=[];
    VertexData.ComputeNormals(g.positions,g.indices,normals);
    Object.assign(v,{...g,normals});v.applyToMesh(m);m.material=mat;m.parent=root;m.isPickable=false;
    // Only the hidden collision proxy is partitioned. Rendering stays one batch.
    if(collision)this.colliders.registerGeneratedMesh(m,true);
    m.freezeWorldMatrix();return m;
  }
  /** Lazy exterior construction avoids asking an unloaded terrain tile for height. */
  syncExterior(x:number,z:number,active=true):void{
    const distance=Math.hypot(x-this.entrance.x,z-this.entrance.z),near=(active||this.inside)&&distance<480;
    if(near&&!this.exterior){
      this.entranceY=this.heightAt(this.entrance.x,this.entrance.z);
      this.exitY=this.heightAt(this.entrance.x,this.entrance.z);
      this.buildEntrance();
    }
    this.exterior?.setEnabled(near&&!this.inside);

  }
  private buildEntrance():void{
    const root=new TransformNode('crisol-boca-exterior',this.scene);this.exterior=root;
    root.position.set(this.entrance.x,this.entranceY,this.entrance.z);root.rotation.y=this.entranceYaw;
    const sin=Math.sin(this.entranceYaw),cos=Math.cos(this.entranceYaw);
    const ground=(x:number,z:number)=>this.heightAt(this.entrance.x+x*cos+z*sin,this.entrance.z-x*sin+z*cos)-this.entranceY;
    const mouth=buildCaveMouth(ground);
    this.mesh('crisol-afloramiento-unido',mouth.rock,root,this.stone,false);
    this.mesh('crisol-fondo-en-sombra',mouth.back,root,this.dark,false);
    root.computeWorldMatrix(true);
    for(const mesh of root.getChildMeshes(false))if(mesh instanceof Mesh&&mesh.name!=='crisol-cristal')this.entranceColliders.registerGeneratedMesh(mesh,true);
  }
  canMoveOutside(x:number,z:number,fromX:number,fromZ:number,y:number):boolean{
    if(!this.exterior?.isEnabled()||Math.hypot(x-this.entrance.x,z-this.entrance.z)>35)return true;
    const dx=x-fromX,dz=z-fromZ,d=Math.hypot(dx,dz);
    return ![.5,1.8,3.4].some(h=>this.entranceColliders.queryWall(fromX,y+h,fromZ,dx,dz,d+.6));
  }
  exteriorHeadroom(x:number,y:number,z:number,height:number):boolean{
    return !this.exterior?.isEnabled()||this.entranceColliders.queryCeiling(x,y+.05,z,height)===null;
  }
  exteriorCameraObstruction(from:Vector3,to:Vector3):number|null{
    return this.exterior?.isEnabled()?this.entranceColliders.queryCameraObstruction(from,to,.45):null;
  }
  private crystalCluster(root:TransformNode,p:Vector3,material:StandardMaterial,count:number,scale=1):TransformNode{
    const group=new TransformNode('crisol-veta',this.scene);group.parent=root;group.position.copyFrom(p);
    for(let i=0;i<count;i++){
      const h=(1.6+(i%3)*.8)*scale,angle=i*2.399;
      const m=new Mesh('crisol-cristal',this.scene),data=new VertexData(),positions:number[]=[],indices:number[]=[],normals:number[]=[];
      for(const [y,radius] of [[0,.3],[h*.13,.45],[h*.7,.32],[h,0]])for(let k=0;k<6;k++){
        const a=k*Math.PI/3;positions.push(Math.cos(a)*radius*scale,y,Math.sin(a)*radius*scale);
      }
      for(let ring=0;ring<3;ring++)for(let k=0;k<6;k++){
        const a=ring*6+k,b=ring*6+(k+1)%6;indices.push(a,b,a+6,b,b+6,a+6);
      }
      VertexData.ComputeNormals(positions,indices,normals);Object.assign(data,{positions,indices,normals});data.applyToMesh(m);m.convertToFlatShadedMesh();
      m.position.set(Math.cos(angle)*i*.24*scale,-.05,Math.sin(angle)*i*.24*scale);
      m.rotation.z=Math.sin(angle)*.19;m.rotation.x=Math.cos(angle)*.14;m.parent=group;m.material=material;m.isPickable=false;
    }return group;
  }
  enter(claimed=false,secretClaimed=false):Vector3{
    if(!this.interior)this.buildInterior();
    this.active=true;this.interior!.setEnabled(true);this.occludesExterior=true;this.exterior?.setEnabled(false);
    if(!this.exteriorCandidates){
      this.exteriorCandidates=this.scene.getActiveMeshCandidates;
      this.scene.getActiveMeshCandidates=this.interiorCandidates;
    }
    this.refresh=0;
    this.reward?.setEnabled(!claimed);this.secret?.setEnabled(!secretClaimed);
    for(const light of this.scene.lights)if(!this.lights.includes(light)&&!this.exteriorLights.has(light)){
      this.exteriorLights.set(light,light.isEnabled());light.setEnabled(false);
    }
    this.checkpoint.set(CAVE_NODES.entry.x,VOLCANIC_CAVE.baseY+CAVE_NODES.entry.y+.1,CAVE_NODES.entry.z-3);
    return this.checkpoint.clone();
  }
  leave():Vector3{
    this.restoreAtmosphere();
    this.active=false;this.occludesExterior=false;
    if(this.exteriorCandidates){
      if(this.scene.getActiveMeshCandidates===this.interiorCandidates)this.scene.getActiveMeshCandidates=this.exteriorCandidates;
      this.exteriorCandidates=null;
    }
    this.renderCandidates.data=[];this.renderCandidates.length=0;
    for(const [light,state] of this.exteriorLights)if(!light.isDisposed()){
      if(light.isEnabled()!==state)light.setEnabled(state);
    }
    this.exteriorLights.clear();
    {
      for(const light of this.lights)light.dispose();this.lights.length=0;this.pairs.length=0;
      this.colliders.dispose();this.groundColliders.dispose();this.interior?.dispose(false,false);this.interior=null;this.reward=null;this.secret=null;
    }
    this.refresh=0;
    this.exterior?.setEnabled(true);
    return new Vector3(this.entrance.x,this.exitY,this.entrance.z);
  }
  private buildInterior():void{
    const root=new TransformNode('caverna-del-crisol',this.scene);this.interior=root;
    this.mesh('crisol-cavidad-continua',buildCaveShell(),root,this.stone);
    // A recessed daylight cue identifies the E exit. It belongs to this separate
    // interior and never replaces, cuts or displays the exterior mountain.
    const backdrop=emptyCaveGeometry();
    for(const [a,b,c] of [[[-9,-1,72],[-9,13,72],[9,13,72]],[[-9,-1,72],[9,13,72],[9,-1,72]]] as const)
      caveTriangle(backdrop,a,b,c,[0,0,-1]);
    for(let i=0;i<backdrop.positions.length/3;i++){
      const t=Math.max(0,Math.min(1,(backdrop.positions[i*3+1]-VOLCANIC_CAVE.baseY)/13));
      backdrop.colors.splice(i*4,4,.68-.3*t,.77-.23*t,.83-.13*t,1);
    }
    this.mesh('crisol-salida-luz',backdrop,root,this.exitGlow);
    CAVE_ROUTES.forEach((route,i)=>this.groundColliders.registerGeneratedMesh(this.mesh('crisol-cornisa-'+i,buildCaveRoute(route),root,this.trail),true));
    for(const [i,id] of ['west','bridgeEast','lowerEast','lowerWest','shortcut'].entries()){
      const p=caveWorldPoint(CAVE_NODES[id]);
      this.crystalCluster(root,new Vector3(p.x+3,p.y+.08,p.z+2),i%2?this.cyan:this.amber,4,.65);
    }
    const vault=caveWorldPoint(CAVE_NODES.vault),secret=caveWorldPoint(CAVE_NODES.secret);
    this.reward=this.crystalCluster(root,new Vector3(vault.x,vault.y+.08,vault.z),this.amber,7,1.5);
    this.secret=this.crystalCluster(root,new Vector3(secret.x,secret.y+.08,secret.z),this.cyan,6,1.1);
    // Columns grow from the ravine and stop at the underside of solid shelves.
    for(const [i,id] of ['west','east','north','lowerWest'].entries()){
      const p=CAVE_NODES[id],height=p.y+23-(p.y>=0?2.7:6.2);
      const column=MeshBuilder.CreateCylinder('crisol-columna-lava',{height,diameterTop:6.8,diameterBottom:11,tessellation:7},this.scene);
      column.position.set(p.x+2,VOLCANIC_CAVE.baseY-23+height/2,p.z+2);column.rotation.y=i*.8;
      column.parent=root;column.material=this.stone;column.isPickable=false;this.colliders.registerGeneratedMesh(column);
    }
    const ambient=new HemisphericLight('crisol-luz-difusa',new Vector3(.2,1,.4),this.scene);
    ambient.diffuse=new Color3(.65,.72,.8);ambient.groundColor=new Color3(.31,.28,.24);ambient.intensity=.85;this.lights.push(ambient);
    ambient.includedOnlyMeshes=root.getChildMeshes(false).filter(m=>m.isVisible);
    CAVE_LIGHTS.forEach((f,index)=>{
      const p=new Vector3(f.x,f.y+VOLCANIC_CAVE.baseY,f.z);
      const standard=new PointLight('crisol-resplandor-'+index,p,this.scene),physical=new PointLight('crisol-personajes-'+index,p.clone(),this.scene);
      for(const light of [standard,physical]){light.diffuse=Color3.FromArray([...f.color]);light.range=f.range;light.setEnabled(false);this.lights.push(light);}
      physical.falloffType=Light.FALLOFF_GLTF;
      this.pairs.push({standard,physical,index});
    });this.refresh=0;
  }
  nearestAction(p:Vector3):'enter'|'exit'|'reward'|'secret'|null{
    if(!this.inside){
      const dx=p.x-this.entrance.x,dz=p.z-this.entrance.z,s=Math.sin(this.entranceYaw),c=Math.cos(this.entranceYaw);
      const x=dx*c-dz*s,z=dx*s+dz*c;
      return this.exterior?.isEnabled()&&Math.abs(x)<3.4&&z<1&&z>-5.5&&Math.abs(p.y-this.entranceY)<1.3?'enter':null;
    }
    if(p.z>60)return 'exit';
    for(const [action,id,visual] of [['reward','vault',this.reward],['secret','secret',this.secret]] as const){
      const n=caveWorldPoint(CAVE_NODES[id]);if(visual?.isEnabled()&&Math.hypot(p.x-n.x,p.z-n.z)<5&&Math.abs(p.y-n.y)<3)return action;
    }return null;
  }
  claimed(secret=false):void{(secret?this.secret:this.reward)?.setEnabled(false);}
  restoreAtmosphere():void{if(this.atmosphere){this.scene.fogColor.copyFrom(this.atmosphere.color);this.scene.fogDensity=this.atmosphere.density;this.scene.fogMode=this.atmosphere.mode;this.atmosphere=null;}}
  update(dt:number,p:Vector3,characters:readonly TransformNode[],grounded:boolean,daylight=1):Vector3|null{
    if(!this.interior)return null;
    this.time+=dt;this.refresh-=dt;
    this.exitGlow.emissiveColor.setAll(.18+.82*daylight);
    const local=p;
    this.occludesExterior=this.inside;
    // Climate keeps advancing outdoors; its lights cannot leak into this interior.
    if(this.occludesExterior){
      this.atmosphere={color:this.scene.fogColor.clone(),density:this.scene.fogDensity,mode:this.scene.fogMode};
      this.scene.fogMode=Scene.FOGMODE_EXP2;this.scene.fogColor.set(.035,.045,.052);this.scene.fogDensity=.011;
      this.scene.clearColor.set(.035,.045,.052,1);
    }
    if(this.refresh<=0){
      this.refresh=.4;
      const actors=this.inside?characters.flatMap(c=>c.getChildMeshes(false)):[],physical=actors.filter(m=>m.material instanceof PBRMaterial);
      const rocks=this.interior!.getChildMeshes(false).filter(m=>m.isVisible);
      // Continue normal culling/animation for the interior and actors without
      // evaluating thousands of hidden continent meshes each rendered frame.
      this.renderCandidates.data=[...rocks,...actors];
      this.renderCandidates.length=this.renderCandidates.data.length;
      const standard:AbstractMesh[]=[...rocks,...actors.filter(m=>!(m.material instanceof PBRMaterial))];
      const nearest=[...this.pairs].sort((a,b)=>Vector3.DistanceSquared(p,a.standard.position)-Vector3.DistanceSquared(p,b.standard.position)).slice(0,3);
      const receivers=(light:PointLight,meshes:AbstractMesh[])=>{
        if(light.includedOnlyMeshes.length!==meshes.length||meshes.some((m,i)=>light.includedOnlyMeshes[i]!==m))
          // Babylon scans every scene mesh when the receiver list changes.
          light.includedOnlyMeshes=meshes;
      };
      const ambient=this.lights[0],interiorReceivers=[...rocks,...actors];
      if(ambient.includedOnlyMeshes.length!==interiorReceivers.length||interiorReceivers.some((m,i)=>ambient.includedOnlyMeshes[i]!==m))
        ambient.includedOnlyMeshes=interiorReceivers;
      for(const pair of this.pairs){
        receivers(pair.standard,standard);receivers(pair.physical,physical);
        const enabled=nearest.includes(pair),actorsEnabled=enabled&&physical.length>0;
        if(pair.standard.isEnabled()!==enabled)pair.standard.setEnabled(enabled);
        if(pair.physical.isEnabled()!==actorsEnabled)pair.physical.setEnabled(actorsEnabled);
      }
      for(const actor of actors)if(actor.material instanceof PBRMaterial||actor.material instanceof StandardMaterial)actor.material.maxSimultaneousLights=Math.max(actor.material.maxSimultaneousLights,4);
    }
    for(const pair of this.pairs){const f=CAVE_LIGHTS[pair.index],pulse=1+.025*Math.sin(this.time*1.1+pair.index);
      const exteriorFill=pair.index===0?.35+.65*daylight:1;
      pair.standard.intensity=f.power*pulse*exteriorFill;pair.physical.intensity=f.power*95*pulse*exteriorFill;}
    if(this.inside&&grounded&&local.y>VOLCANIC_CAVE.recoveryY)for(const n of Object.values(CAVE_NODES)){
      if(Math.hypot(local.x-n.x,local.z-n.z)<4&&Math.abs(local.y-n.y-VOLCANIC_CAVE.baseY)<1){this.checkpoint.copyFrom(p);break;}
    }
    return this.inside&&local.y<VOLCANIC_CAVE.recoveryY?this.checkpoint.clone():null;
  }
  traversalWorld():TraversalWorld{
    const c=this.colliders;
    return {
      ground:(x,z,y,max,radius)=>{
        const h=this.groundColliders.queryGround(x,z,y,max,radius);
        return h?{height:h.height,normalY:h.normal.y,rockId:h.rockId}:null;
      },
      wall:(x,y,z,dx,dz,reach)=>{const h=c.queryWall(x,y,z,dx,dz,reach);return h?{pointX:h.point.x,pointY:h.point.y,pointZ:h.point.z,distance:h.distance,normalX:h.normal.x,normalY:h.normal.y,normalZ:h.normal.z,rockId:h.rockId,climbable:false}:null;},
      solidTop:()=>null,
      // Do not ignore the supporting mesh: a bridge may be overhead on that same route.
      headroom:(x,y,z,h)=>this.upwardHit(new Vector3(x,y+.05,z),h)===null,
      canMove:(x,z,_fx,_fz,y)=>caveField(x,y-VOLCANIC_CAVE.baseY+1,z)<-.45,
      fallbackHeight:()=>VOLCANIC_CAVE.baseY-40
    };
  }
  ceilingAt(p:Vector3):number|null{
    return this.upwardHit(p.add(new Vector3(0,.2,0)),40);
  }
  private upwardHit(p:Vector3,distance:number):number|null{
    return this.colliders.queryCeiling(p.x,p.y,p.z,distance);
  }
  dispose():void{
    this.leave();this.entranceColliders.dispose();this.exterior?.dispose(false,false);this.exterior=null;
    this.stone.diffuseTexture?.dispose();
    for(const material of [this.stone,this.trail,this.amber,this.cyan,this.dark,this.exitGlow])material.dispose();
  }
}

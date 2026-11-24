import { Color3, Color4, ImageProcessingConfiguration, Light, Mesh, Scene, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type AbstractMesh } from '@babylonjs/core';
import { RockColliderSystem } from './RockColliderSystem';
import { buildCaveMouth } from './cavePortalGeometry';
import { VOLCANIC_CAVE, type CaveGeometry } from './volcanicCaveData';
import { IgneousRealm, type IgneousLoader } from './IgneousRealm';

/** Volcano portal and reversible exterior isolation around the imported realm. */
export class VolcanicCaveSystem {
  readonly colliders=new RockColliderSystem(()=>undefined);
  readonly realm:IgneousRealm;
  private readonly entranceColliders=new RockColliderSystem(()=>undefined);
  private readonly renderCandidates:{data:AbstractMesh[];length:number}={data:[],length:0};
  private effectMeshes:readonly AbstractMesh[]=[];
  setEffectMeshes(meshes:readonly AbstractMesh[]):void{this.effectMeshes=meshes;}
  private exteriorCandidates:Scene['getActiveMeshCandidates']|null=null;
  private readonly interiorCandidates=()=>this.renderCandidates;
  readonly entrance:{x:number;z:number};
  private exterior:TransformNode|null=null;
  private active=false;
  occludesExterior=false;
  private entranceY=0;
  private exitY=0;
  private entranceYaw=0;
  private readonly stone:StandardMaterial;
  private readonly dark:StandardMaterial;
  private readonly exteriorLights=new Map<Light,boolean>();
  private atmosphere:{color:Color3;clear:Color4;density:number;mode:number}|null=null;
  private exteriorRendering:{exposure:number;toneMappingEnabled:boolean;toneMappingType:number;environment:Scene['environmentTexture']}|null=null;
  constructor(private readonly scene:Scene,private readonly heightAt:(x:number,z:number)=>number,
    geographic=true,textures=true,loader?:IgneousLoader){
    this.entrance=geographic?VOLCANIC_CAVE.entrance:VOLCANIC_CAVE.legacyEntrance;
    this.entranceYaw=geographic?VOLCANIC_CAVE.entranceYaw:0;
    this.stone=new StandardMaterial('crisol-basalto-exterior',scene);
    this.stone.diffuseColor=new Color3(.81,.87,.94);this.stone.specularColor.set(.035,.04,.045);
    if(textures)this.stone.diffuseTexture=new Texture('/assets/terrain/biomes/textures/albedo/biome_volcanico_basalto_albedo_1k.webp',scene);
    this.dark=new StandardMaterial('crisol-fondo-en-sombra',scene);this.dark.diffuseColor.set(.12,.15,.17);
    this.dark.diffuseTexture=this.stone.diffuseTexture;
    this.realm=new IgneousRealm(scene,this.colliders,loader);
  }
  get inside(){return this.active;}
  get loaded(){return this.realm.loaded;}
  get ready(){return !!this.exterior;}
  get status(){return {inside:this.inside,loaded:this.loaded,entrance:{...this.entrance,y:this.entranceY},
    checkpoint:this.realm.checkpointId,loadMilliseconds:this.realm.loadMilliseconds,
    meshes:this.realm.meshes.length,colliders:this.colliders.activeColliderCount,
    triangles:this.realm.meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0)};}
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
  async enter(found:readonly string[]=[],checkpoint='A0'):Promise<Vector3>{
    await this.realm.load();
    this.realm.setFlags(found);this.realm.setActive(true);
    let spawn:Vector3;
    try{spawn=this.realm.spawn(checkpoint);}catch(error){this.realm.setActive(false);throw error;}
    this.realm.checkpointId=checkpoint;this.realm.checkpoint.copyFrom(spawn);
    this.active=true;this.occludesExterior=true;this.exterior?.setEnabled(false);
    const image=this.scene.imageProcessingConfiguration;
    this.exteriorRendering??={exposure:image.exposure,toneMappingEnabled:image.toneMappingEnabled,
      toneMappingType:image.toneMappingType,environment:this.scene.environmentTexture};
    this.scene.environmentTexture=null;
    // Match the approved preview's transfer curve; without ACES the dark basalt
    // is lifted to flat grey. Set once per transition, never in the frame loop.
    image.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
    image.toneMappingEnabled=true;
    if(image.exposure!==this.realm.meta.iluminacion.exposicion)image.exposure=this.realm.meta.iluminacion.exposicion;
    this.exteriorCandidates??=this.scene.getActiveMeshCandidates;
    this.scene.getActiveMeshCandidates=this.interiorCandidates;
    this.renderCandidates.data=[...this.realm.meshes,...this.effectMeshes];this.renderCandidates.length=this.renderCandidates.data.length;
    this.excludeExteriorLights();return spawn;
  }
  private excludeExteriorLights():void{
    for(const light of this.scene.lights)if(!this.realm.lights.includes(light)){
      if(!this.exteriorLights.has(light))this.exteriorLights.set(light,light.isEnabled());
      if(light.isEnabled())light.setEnabled(false);
    }
  }
  leave():Vector3{
    this.restoreAtmosphere();this.active=false;this.occludesExterior=false;this.realm.setActive(false);
    if(this.exteriorRendering){
      this.scene.environmentTexture=this.exteriorRendering.environment;
      if(this.scene.imageProcessingConfiguration.exposure!==this.exteriorRendering.exposure)
        this.scene.imageProcessingConfiguration.exposure=this.exteriorRendering.exposure;
      this.scene.imageProcessingConfiguration.toneMappingType=this.exteriorRendering.toneMappingType;
      this.scene.imageProcessingConfiguration.toneMappingEnabled=this.exteriorRendering.toneMappingEnabled;
      this.exteriorRendering=null;
    }
    if(this.exteriorCandidates){this.scene.getActiveMeshCandidates=this.exteriorCandidates;this.exteriorCandidates=null;}
    this.renderCandidates.data=[];this.renderCandidates.length=0;
    for(const [light,state] of this.exteriorLights)if(!light.isDisposed())light.setEnabled(state);
    this.exteriorLights.clear();this.exterior?.setEnabled(true);
    return new Vector3(this.entrance.x,this.exitY,this.entrance.z);
  }
  nearestAction(p:Vector3):string|null{
    if(this.inside)return this.realm.action(p);
    const dx=p.x-this.entrance.x,dz=p.z-this.entrance.z,s=Math.sin(this.entranceYaw),c=Math.cos(this.entranceYaw);
    const x=dx*c-dz*s,z=dx*s+dz*c;
    return this.exterior?.isEnabled()&&Math.abs(x)<3.4&&z<1&&z>-5.5&&Math.abs(p.y-this.entranceY)<1.3?'enter':null;
  }
  actionLabel(action:string):string{
    if(action==='enter')return 'Entrar en el Reino Ígneo';
    if(action==='exit')return 'Salir a la ladera del volcán';
    if(action==='reja_abierta')return 'Accionar el contrapeso de la reja';
    if(action==='salida_abierta')return 'Accionar el torno del Bastión';
    if(action==='cristal')return 'Despertar el poder del Cristal Ígneo';
    return 'Investigar: '+(this.realm.meta?.discoveries.find(d=>d.lugar===action)?.pista??action);
  }
  restoreAtmosphere():void{
    const a=this.atmosphere;if(!a)return;
    this.scene.fogColor.copyFrom(a.color);this.scene.clearColor.copyFrom(a.clear);this.scene.fogDensity=a.density;
    this.scene.fogMode=a.mode;this.atmosphere=null;
  }
  update(dt:number,p:Vector3,characters:readonly TransformNode[],grounded:boolean,_daylight=1):Vector3|null{
    if(!this.inside)return null;
    this.excludeExteriorLights();
    this.atmosphere??={color:this.scene.fogColor.clone(),clear:this.scene.clearColor.clone(),density:this.scene.fogDensity,
      mode:this.scene.fogMode};
    this.scene.fogMode=Scene.FOGMODE_EXP2;this.scene.fogColor.set(.012,.010,.014);this.scene.clearColor.set(.009,.007,.010,1);
    this.scene.fogDensity=this.realm.meta.iluminacion.densidad/this.realm.root.scaling.x;
    const actors=[...characters.flatMap(c=>c.getChildMeshes(false)),...this.effectMeshes];
    if(this.renderCandidates.length!==this.realm.meshes.length+actors.length||actors.some(m=>!this.renderCandidates.data.includes(m))){
      this.renderCandidates.data=[...this.realm.meshes,...actors];this.renderCandidates.length=this.renderCandidates.data.length;
    }
    return this.realm.update(dt,p,characters,grounded,this.effectMeshes);
  }
  traversalWorld(){return this.realm.traversalWorld();}
  ceilingAt(p:Vector3):number|null{return this.colliders.queryCeiling(p.x,p.y+.2,p.z,TRAVERSAL_HEIGHT);}
  cameraObstruction(from:Vector3,to:Vector3){return this.realm.cameraObstruction(from,to);}
  dispose():void{
    this.leave();this.realm.dispose();this.entranceColliders.dispose();this.exterior?.dispose();
    this.stone.diffuseTexture?.dispose();this.stone.dispose();this.dark.dispose();
  }
}
const TRAVERSAL_HEIGHT=3.8;

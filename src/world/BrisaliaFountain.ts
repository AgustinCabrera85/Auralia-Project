import { AssetContainer, BoundingInfo, Color3, Effect, Matrix, Mesh, MeshBuilder, Quaternion,
  Scene, ShaderMaterial, StandardMaterial, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { loadGpuAssetContainerAsync } from './GpuAssets';

/** Measurements in the original, Y-up GLB. Keep the four outlets attached to the asset. */
export const FOUNTAIN = Object.freeze({url:'/assets/props/Fuente_Brisalia.glb',diameter:16.2,
  sourceWidth:.9995117783546448,outletRadius:.187,outletY:.3523,waterY:.105,impactRadius:.34});
export function fountainJetPoint(side:number,t:number):Vector3{
  const a=side*Math.PI/2,r=FOUNTAIN.outletRadius+(FOUNTAIN.impactRadius-FOUNTAIN.outletRadius)*t;
  return new Vector3(Math.cos(a)*r,FOUNTAIN.outletY-(FOUNTAIN.outletY-FOUNTAIN.waterY)*t*t,Math.sin(a)*r);
}

const vertex=`precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
uniform mat4 world; uniform mat4 worldViewProjection;
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUV;
void main(){vLocal=position;vWorld=(world*vec4(position,1.)).xyz;
vNormal=normalize(mat3(world)*normal);vUV=uv;gl_Position=worldViewProjection*vec4(position,1.);}`;
const fragment=`precision highp float;
uniform float time; uniform float kind; uniform float daylight; uniform vec3 eye;
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUV;
float ripple(vec2 center){float d=length(vLocal.xz-center);
return sin(d*260.-time*10.)*exp(-d*15.);}
void main(){vec3 n=normalize(vNormal);float light=.35+.65*daylight;
float fresnel=pow(1.-abs(dot(n,normalize(eye-vWorld))),3.);
if(kind<.5){
float wave=sin(vLocal.x*78.+time*1.4)*sin(vLocal.z*71.-time*1.1);
float rings=ripple(vec2(.34,0.))+ripple(vec2(-.34,0.))+ripple(vec2(0.,.34))+ripple(vec2(0.,-.34));
float foam=exp(-pow(length(vLocal.xz-vec2(.34,0.))/.022,2.))+
exp(-pow(length(vLocal.xz-vec2(-.34,0.))/.022,2.))+
exp(-pow(length(vLocal.xz-vec2(0.,.34))/.022,2.))+
exp(-pow(length(vLocal.xz-vec2(0.,-.34))/.022,2.));
vec3 color=mix(vec3(.075,.28,.32),vec3(.34,.62,.65),.35+fresnel*.4+wave*.08);
color+=vec3(.22,.29,.28)*max(0.,rings)*.6+vec3(.55,.65,.64)*foam*(.55+.12*sin(time*15.));
gl_FragColor=vec4(color*light,1.);
}else{
float streak=.5+.5*sin(vUV.y*110.-time*20.+sin(vUV.x*19.)*1.4);
vec3 color=mix(vec3(.28,.58,.66),vec3(.8,.94,.96),streak*.35+fresnel*.45);
gl_FragColor=vec4(color*light,.72+fresnel*.22);}}`;

/** Authored fountain plus bounded, local water effects; no global reflection render target. */
export class BrisaliaFountain {
  readonly root:TransformNode;
  readonly meshes:Mesh[]=[];
  readonly ready:Promise<void>;
  error:string|null=null;
  private asset:AssetContainer|null=null;
  private effects:TransformNode;
  private water:ShaderMaterial;
  private flow:ShaderMaterial;
  private splashMaterial:StandardMaterial;
  private droplets:Mesh;
  private matrices=new Float32Array(32*16);
  private matrix=Matrix.Identity();
  private scale=Vector3.One();
  private position=Vector3.Zero();
  private rotation=Quaternion.Identity();
  private clock=0;
  private disposed=false;

  constructor(private scene:Scene,parent:TransformNode,position:Vector3,
    importer:typeof loadGpuAssetContainerAsync=loadGpuAssetContainerAsync){
    this.root=new TransformNode('brisalia:fountain',scene);this.root.parent=parent;
    this.root.position.copyFrom(position);this.root.scaling.setAll(FOUNTAIN.diameter/FOUNTAIN.sourceWidth);
    this.root.metadata={sourceAsset:FOUNTAIN.url,diameter:FOUNTAIN.diameter};
    this.effects=new TransformNode('fountain:water-effects',scene);this.effects.parent=this.root;
    this.effects.setEnabled(false);
    Effect.ShadersStore.brisaliaFountainVertexShader=vertex;Effect.ShadersStore.brisaliaFountainFragmentShader=fragment;
    const material=(name:string,kind:number)=>{
      const mat=new ShaderMaterial(name,scene,'brisaliaFountain',{
        attributes:['position','normal','uv'],uniforms:['world','worldViewProjection','time','kind','daylight','eye'],
        needAlphaBlending:kind===1});
      mat.setFloat('kind',kind);mat.setFloat('time',0);mat.setFloat('daylight',1);mat.setVector3('eye',Vector3.Zero());
      mat.backFaceCulling=false;return mat;
    };
    this.water=material('fountain:basin-water',0);this.flow=material('fountain:flowing-water',1);
    this.makeBasin();this.makeJets();
    this.splashMaterial=new StandardMaterial('fountain:splash',scene);
    this.splashMaterial.diffuseColor=new Color3(.65,.86,.91);this.splashMaterial.specularColor=Color3.White();
    this.splashMaterial.alpha=.65;
    this.droplets=MeshBuilder.CreateSphere('fountain:droplets',{diameter:1,segments:4},scene);
    this.droplets.parent=this.effects;this.droplets.material=this.splashMaterial;this.droplets.isPickable=false;
    this.droplets.thinInstanceSetBuffer('matrix',this.matrices,16,false);
    this.updateDroplets();
    this.droplets.setBoundingInfo(new BoundingInfo(new Vector3(-.42,.1,-.42),new Vector3(.42,.18,.42)));
    this.ready=this.load(importer);
  }
  private async load(importer:typeof loadGpuAssetContainerAsync):Promise<void>{
    try{
      const asset=await importer(FOUNTAIN.url,this.scene);
      if(this.disposed){asset.dispose();return;}
      this.asset=asset;asset.addAllToScene();
      for(const root of asset.rootNodes)root.parent=this.root;
      for(const mesh of asset.meshes)if(mesh instanceof Mesh&&mesh.getTotalVertices()>0){
        mesh.name='brisalia:fountain:stone';mesh.isPickable=true;
        mesh.metadata={...mesh.metadata,buildingId:'fountain',buildingCollision:true,sourceAsset:FOUNTAIN.url};
        mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();this.meshes.push(mesh);
      }
      if(!this.meshes.length)throw new Error('Fountain asset has no geometry');
      this.effects.setEnabled(true);
    }catch(error){this.error=String(error);this.effects.setEnabled(false);}
  }
  private makeBasin():void{
    const positions:number[]=[],indices:number[]=[],normals:number[]=[],uvs:number[]=[];
    // An octagonal annulus fills the reservoir; the masonry hides its inner edge.
    for(let i=0;i<=8;i++)for(const radius of [.11,.475]){
      const a=Math.PI/8+i*Math.PI/4,x=Math.cos(a)*radius,z=Math.sin(a)*radius;
      positions.push(x,FOUNTAIN.waterY,z);normals.push(0,1,0);uvs.push(x,z);
    }
    for(let i=0;i<8;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    const mesh=new Mesh('fountain:reservoir',this.scene),data=new VertexData();
    Object.assign(data,{positions,indices,normals,uvs});data.applyToMesh(mesh);
    mesh.parent=this.effects;mesh.material=this.water;mesh.isPickable=false;
  }
  private makeJets():void{
    const jets:Mesh[]=[];
    for(let side=0;side<4;side++){
      const path=Array.from({length:29},(_,i)=>fountainJetPoint(side,i/28));
      const jet=MeshBuilder.CreateTube(`fountain:jet:${side}`,{path,tessellation:8,
        radiusFunction:(i)=>.006*(1-.32*i/28),cap:Mesh.NO_CAP},this.scene);
      jets.push(jet);
    }
    const mesh=Mesh.MergeMeshes(jets,true,true)!;
    mesh.name='fountain:four-streams';mesh.parent=this.effects;mesh.material=this.flow;mesh.isPickable=false;
  }
  private updateDroplets():void{
    for(let i=0;i<32;i++){
      const side=i>>3,index=i%8,a=side*Math.PI/2,phase=(this.clock*2.4+index/8+side*.19)%1;
      const spread=.025*phase,angle=index*2.399+side;
      this.position.set(Math.cos(a)*FOUNTAIN.impactRadius+Math.cos(angle)*spread,
        FOUNTAIN.waterY+.002+.17*phase*(1-phase),Math.sin(a)*FOUNTAIN.impactRadius+Math.sin(angle)*spread);
      const size=.006*(1-phase)*Math.min(1,phase*12);
      this.scale.set(size,size*1.6,size);
      Matrix.ComposeToRef(this.scale,this.rotation,this.position,this.matrix);this.matrix.copyToArray(this.matrices,i*16);
    }
    this.droplets.thinInstanceBufferUpdated('matrix');
  }
  update(dt:number,focus:{x:number;y:number;z:number},daylight=1,active=true,paused=false):void{
    if(this.disposed||!this.meshes.length)return;
    const p=this.root.getAbsolutePosition(),visible=active&&Math.hypot(focus.x-p.x,focus.y-p.y,focus.z-p.z)<110;
    this.effects.setEnabled(visible);if(!visible)return;
    if(!paused&&Number.isFinite(dt)&&dt>0){this.clock+=Math.min(dt,.1);this.updateDroplets();}
    for(const mat of [this.water,this.flow]){
      mat.setFloat('time',this.clock);mat.setFloat('daylight',Math.max(.08,Math.min(1,daylight)));
      mat.setVector3('eye',this.scene.activeCamera?.globalPosition??Vector3.Zero());
    }
  }
  /** Saves contain X/Z only: restoring onto terrain inside the basin traps the capsule. */
  safeSavedPosition(x:number,z:number,clearance:number):{x:number;z:number}{
    const dx=x-this.root.position.x,dz=z-this.root.position.z,distance=Math.hypot(dx,dz);
    const radius=FOUNTAIN.diameter*.55+clearance;
    if(distance>=radius)return {x,z};
    const ux=distance>1e-5?dx/distance:1,uz=distance>1e-5?dz/distance:0;
    return {x:this.root.position.x+ux*(radius+.25),z:this.root.position.z+uz*(radius+.25)};
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    this.asset?.dispose();this.asset=null;this.meshes.length=0;
    this.root.dispose(false,false);this.water.dispose();this.flow.dispose();this.splashMaterial.dispose();
  }
}

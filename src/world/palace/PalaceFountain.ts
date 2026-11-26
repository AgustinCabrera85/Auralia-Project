import {DirectionalLight,Effect,Mesh,Scene,ShaderMaterial,ShadowGenerator,TransformNode,Vector3,VertexData,type Observer,type PBRMaterial} from '@babylonjs/core';
import {PALACE_FOUNTAIN,palaceFountainGeometry,palaceOverflowGeometry,palaceReservoirGeometry} from './PalaceFountainGeometry';

const vertex=`precision highp float;
attribute vec3 position;attribute vec3 normal;attribute vec2 uv;
uniform mat4 world;uniform mat4 worldViewProjection;uniform float time;uniform float flow;
varying vec3 local;varying vec3 point;varying vec3 n;varying vec2 tex;
void main(){vec3 p=position;
if(flow>.5){float envelope=smoothstep(.2,.48,uv.y)*sin(uv.y*3.14159265);
float wrinkle=.012*sin(uv.x*19.+uv.y*15.-time*3.)+.006*sin(uv.x*37.-uv.y*23.+time*4.);
p.xz+=normalize(p.xz)*wrinkle*envelope;}
local=p;point=(world*vec4(p,1.)).xyz;n=normalize(mat3(world)*normal);tex=uv;gl_Position=worldViewProjection*vec4(p,1.);}`;
const fragment=`precision highp float;
uniform float time;uniform float flow;uniform float daylight;uniform vec3 eye;
varying vec3 local;varying vec3 point;varying vec3 n;varying vec2 tex;
float lanes(float a){return .52+.23*sin(a*17.+.7*sin(a*3.))+.17*sin(a*29.+1.3)+.08*sin(a*43.);}
void main(){
  vec3 normal=normalize(n);vec3 view=normalize(eye-point);
  float foam=0.;float coverage=1.;float ripple=0.;
  if(flow>.5){
    float a=tex.x,t=tex.y;
    // Continuous at the lip, increasingly uneven below it. Angular frequencies
    // are integral so the film has no visible seam at the back of the fountain.
    float travel=sin(t*48.-time*9.+sin(a*13.));
    float breakup=lanes(a)+.14*sin(a*7.+t*8.-time*1.4)+travel*.08;
    coverage=mix(1.,smoothstep(.4,.65,breakup),smoothstep(.15,.55,t));
    vec3 tangent=vec3(-sin(a),0.,cos(a));
    normal=normalize(normal+tangent*(.13*sin(a*57.+travel)+.07*sin(a*93.-t*13.))
      +vec3(0.,.075*travel,0.));
    foam=.2*pow(max(0.,sin(a*71.+t*27.-time*6.)),8.)*smoothstep(.55,1.,t);
  }else{
    float r=length(local.xz),a=atan(local.z,local.x),d=abs(r-tex.x);
    float impact=step(.1,tex.x)*exp(-d*5.);
    ripple=impact*cos(d*43.-time*4.5+.18*sin(a*9.));
    vec2 slope=vec2(.035*cos(local.x*9.+local.z*6.+time*.85),.04*cos(local.z*11.-local.x*4.-time*.7));
    slope+=local.xz/max(r,.01)*ripple*.055;
    normal=normalize(vec3(slope.x,1.,slope.y));
    foam=step(.1,tex.x)*exp(-pow(d/.065,2.))*smoothstep(.27,.65,lanes(a))
      *(.22+.4*pow(max(0.,sin(a*83.+r*71.-time*3.)),4.));
  }
  float fresnel=.025+.975*pow(1.-abs(dot(normal,view)),5.);
  vec3 reflected=reflect(-view,normal);
  float skyHeight=smoothstep(-.1,.8,reflected.y);
  vec3 daySky=mix(vec3(.28,.34,.31),vec3(.59,.7,.76),skyHeight);
  vec3 nightSky=mix(vec3(.10,.17,.26),vec3(.21,.32,.46),skyHeight);
  vec3 sky=mix(nightSky,daySky,daylight);
  float sparkle=pow(max(0.,dot(normal,normalize(view+normalize(vec3(-.4,.85,-.3))))),100.)*.22*daylight;
  vec3 tint=flow>.5?vec3(.44,.53,.49):vec3(.09,.23,.23);
  // Transmission darkens after sunset; the cool sky reflection remains.
  // Multiplying both by one night scalar made water look like grey stone.
  vec3 color=mix(tint*(.26+.74*daylight),sky,.3+fresnel*.7)+sparkle;
  color=mix(color,mix(vec3(.3,.42,.55),vec3(.78,.83,.77),daylight),foam);
  float alpha=flow>.5?(.17+fresnel*.38+foam)*coverage:.58+fresnel*.27+foam;
  gl_FragColor=vec4(color,clamp(alpha,0.,.88));
}`;

/** Palace-only sculpted stone fountain. The village keeps its authored asset. */
export class PalaceFountain{
  readonly root:TransformNode;
  readonly meshes:Mesh[]=[];
  readonly colliders:Mesh[]=[];
  readonly ready=Promise.resolve();
  readonly error=null;
  private effects:TransformNode;
  private water:ShaderMaterial;
  private flow:ShaderMaterial;
  private clock=0;
  private lastFrame=performance.now();
  private renderObserver:Observer<Scene>;
  private detailSun:DirectionalLight|null=null;
  private detailShadows:ShadowGenerator|null=null;
  private disposed=false;
  constructor(private scene:Scene,parent:TransformNode,position:Vector3,materials:Map<string,PBRMaterial>,private sourceSun?:DirectionalLight){
    this.root=new TransformNode('palace:fountain',scene);this.root.parent=parent;this.root.position.copyFrom(position);
    this.root.metadata={design:'round-stone-fountain-with-golden-canary',planDiameter:PALACE_FOUNTAIN.diameter,planHeight:PALACE_FOUNTAIN.height};
    for(const part of palaceFountainGeometry()){
      const m=new Mesh('palace:fountain:'+part.id,scene),v=new VertexData();Object.assign(v,part.data);v.applyToMesh(m);
      m.material=materials.get(part.material)!;m.parent=this.root;m.receiveShadows=true;m.isPickable=true;m.metadata={palace:true};
      m.layerMask|=0x10000000;m.computeWorldMatrix(true);m.freezeWorldMatrix();this.meshes.push(m);if(part.solid)this.colliders.push(m);
    }
    if(sourceSun){
      // The palace map spans 240 world metres: too coarse for the narrow rims.
      // Replace its light only on this sculpture with the same sun and a tight
      // shadow projection. Keep real self-shadowing and the palace occluders.
      const sun=this.detailSun=new DirectionalLight('palace:fountain:sun',sourceSun.direction.clone(),scene);
      sun.includedOnlyMeshes=[...this.meshes];sun.renderPriority=sourceSun.renderPriority;
      sourceSun.excludedMeshes.push(...this.meshes);
      sun.shadowFrustumSize=PALACE_FOUNTAIN.diameter*this.root.absoluteScaling.x*1.4;sun.shadowMinZ=1;sun.shadowMaxZ=280;
      const shadows=this.detailShadows=new ShadowGenerator(1024,sun);
      shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
      shadows.bias=.0001;shadows.normalBias=.018;shadows.darkness=.12;shadows.getShadowMap()!.refreshRate=6;
    }
    this.effects=new TransformNode('palace:fountain-water',scene);this.effects.parent=this.root;
    Effect.ShadersStore.palaceFountainVertexShader=vertex;Effect.ShadersStore.palaceFountainFragmentShader=fragment;
    const material=(name:string,flow:number)=>{
      const m=new ShaderMaterial(name,scene,'palaceFountain',{attributes:['position','normal','uv'],uniforms:['world','worldViewProjection','time','flow','daylight','eye'],needAlphaBlending:true});
      m.setFloat('flow',flow);m.setFloat('time',0);m.setFloat('daylight',1);m.setVector3('eye',Vector3.Zero());
      // Water must not write an opaque depth silhouette into the contact-AO
      // pass. Depth testing still clips it behind the stone basin and pedestal.
      m.disableDepthWrite=true;m.backFaceCulling=false;m.separateCullingPass=true;return m;
    };
    this.water=material('palace:fountain:water',0);this.flow=material('palace:fountain:cascades',1);
    for(const [name,data,mat,order] of [
      ['reservoirs',palaceReservoirGeometry(),this.water,0],
      ['overflow-lower',palaceOverflowGeometry(),this.flow,1],
      ['overflow-upper',palaceOverflowGeometry(true),this.flow,2],
    ] as const){
      const m=new Mesh('palace:fountain:'+name,scene),v=new VertexData();Object.assign(v,data);v.applyToMesh(m);
      m.material=mat;m.parent=this.effects;m.isPickable=false;m.alphaIndex=order;m.layerMask|=0x10000000;
    }
    // Palace visibility/light updates run at 5 Hz; flowing water needs the
    // render clock, including while the player stands still beside the basin.
    this.renderObserver=scene.onBeforeRenderObservable.add(()=>{
      const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-this.lastFrame)/1000));this.lastFrame=now;
      const enabled=this.effects.isEnabled();this.detailSun?.setEnabled(enabled);
      if(!enabled)return;this.clock+=dt;
      for(const m of [this.water,this.flow]){m.setFloat('time',this.clock);m.setVector3('eye',scene.activeCamera?.globalPosition??Vector3.Zero());}
    });
  }
  update(_dt:number,focus:{x:number;y:number;z:number},daylight=1,active=true){
    if(this.disposed)return;
    const p=this.root.getAbsolutePosition(),visible=active&&Math.hypot(focus.x-p.x,focus.y-p.y,focus.z-p.z)<110;
    this.effects.setEnabled(visible);
    if(this.detailSun&&this.detailShadows&&this.sourceSun){
      const sun=this.detailSun,source=this.sourceSun;sun.setEnabled(visible);sun.direction.copyFrom(source.direction);
      sun.diffuse.copyFrom(source.diffuse);sun.intensity=source.intensity;sun.shadowEnabled=visible&&source.shadowEnabled;
      sun.position.copyFrom(p).addInPlaceFromFloats(0,this.root.absoluteScaling.y,0).subtractInPlace(sun.direction.normalizeToNew().scale(120));
      this.detailShadows.getShadowMap()!.renderList=source.getShadowGenerator()?.getShadowMap()?.renderList??this.meshes;
    }
    if(!visible)return;
    for(const m of [this.water,this.flow])m.setFloat('daylight',Math.max(0,Math.min(1,daylight)));
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.scene.onBeforeRenderObservable.remove(this.renderObserver);
    if(this.sourceSun)this.sourceSun.excludedMeshes=this.sourceSun.excludedMeshes.filter(m=>!this.meshes.includes(m as Mesh));
    this.detailShadows?.dispose();this.detailSun?.dispose();this.root.dispose(false,false);this.meshes.length=0;this.colliders.length=0;this.water.dispose();this.flow.dispose();}
}

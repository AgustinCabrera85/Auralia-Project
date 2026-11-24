/** Auralia FlameJetFX v1 — Babylon.js/WebGL. Visual only; world units: metres. */
import { Color3, Constants, Material, Mesh, MeshBuilder, PointLight, RawTexture, ShaderMaterial, Texture, Vector3, VertexData } from '@babylonjs/core';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,d)=>Number.isFinite(v)?v:d;
const valid3=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
export const FLAME_QUALITY=Object.freeze({
  low:Object.freeze({steps:16,sparks:64,impactSparks:48}),
  medium:Object.freeze({steps:24,sparks:128,impactSparks:80}),
  high:Object.freeze({steps:36,sparks:192,impactSparks:128}),
});

const VOLUME_VERTEX=`
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform vec3 origin,axis,side,lift;
uniform float jetLength,boundRadius;
varying vec3 vWorld;
void main(){
  vWorld=origin+axis*((position.z+0.5)*jetLength)+side*(position.x*2.0*boundRadius)+lift*(position.y*2.0*boundRadius);
  gl_Position=viewProjection*vec4(vWorld,1.0);
}`;

const VOLUME_FRAGMENT=`
precision highp float;
uniform sampler2D noiseTex;
uniform vec3 origin,axis,side,lift,cameraPos;
uniform float clock,jetLength,boundRadius,jetWidth,energy,power,hasImpact;
varying vec3 vWorld;
float noise3(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  vec2 uv=i.xy+vec2(37.0,17.0)*i.z+f.xy;
  float a=texture2D(noiseTex,(uv+0.5)/128.0).r;
  float b=texture2D(noiseTex,(uv+vec2(37.0,17.0)+0.5)/128.0).r;
  return mix(a,b,f.z);
}
vec3 localPoint(vec3 p){vec3 v=p-origin;return vec3(dot(v,side),dot(v,lift),dot(v,axis));}
float densityAt(vec3 p,out float heat){
  float s=p.z/max(jetLength,0.01);
  if(s<0.0||s>1.0){heat=0.0;return 0.0;}
  float radius=0.065+jetWidth*pow(s,0.66);
  vec2 bend=vec2(sin(s*10.5-clock*5.5)*0.12,0.22*s*s+sin(s*13.0-clock*4.3)*0.07)*jetWidth;
  vec2 q=(p.xy-bend)/radius;
  float radial=length(q);
  if(radial>1.5){heat=0.0;return 0.0;}
  vec3 flow=vec3(p.xy*5.2,p.z*2.8-clock*6.0);
  float n=noise3(flow)*0.65+noise3(flow*2.07+vec3(9.0,clock*0.35,3.0))*0.35;
  float surface=1.0-radial+(n-0.45)*0.85;
  float body=smoothstep(0.02,0.52,surface);
  float breakup=mix(1.0,smoothstep(0.2,0.57,n),smoothstep(0.22,0.98,s));
  float endFade=mix(1.0-smoothstep(0.65,1.0,s),1.0-smoothstep(0.955,1.0,s),hasImpact);
  float startFade=smoothstep(0.0,0.035,p.z);
  heat=clamp(body*0.78+(1.0-s)*0.28+n*0.22,0.0,1.0);
  return body*breakup*endFade*startFade;
}
void main(){
  vec3 ro=localPoint(cameraPos),target=localPoint(vWorld),rd=normalize(target-ro);
  vec3 lo=vec3(-boundRadius,-boundRadius,0.0),hi=vec3(boundRadius,boundRadius,jetLength);
  bool inside=all(greaterThanEqual(ro,lo))&&all(lessThanEqual(ro,hi));
  if((!inside&&!gl_FrontFacing)||(inside&&gl_FrontFacing))discard;
  vec3 inv=1.0/(rd+vec3(0.000001));
  vec3 ta=(lo-ro)*inv,tb=(hi-ro)*inv;
  vec3 tn=min(ta,tb),tf=max(ta,tb);
  float nearT=max(0.0,max(max(tn.x,tn.y),tn.z)),farT=min(min(tf.x,tf.y),tf.z);
  if(farT<=nearT)discard;
  float stepSize=(farT-nearT)/float(FIRE_STEPS);
  float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  vec3 rgb=vec3(0.0);float opacity=0.0;
  for(int i=0;i<FIRE_STEPS;i++){
    vec3 p=ro+rd*(nearT+(float(i)+0.35+jitter*0.3)*stepSize);
    float heat;float d=densityAt(p,heat);
    float a=1.0-exp(-d*stepSize*(5.5+power*2.5));
    vec3 col=mix(vec3(1.0,0.065,0.004),vec3(1.0,0.40,0.018),smoothstep(0.18,0.56,heat));
    col=mix(col,vec3(1.0,0.88,0.40),smoothstep(0.55,0.92,heat));
    col=mix(col,vec3(1.0,0.98,0.84),smoothstep(0.88,1.0,heat)*0.55);
    rgb+=(1.0-opacity)*a*col*(1.15+power*0.20);
    opacity+=(1.0-opacity)*a;
    if(opacity>0.975)break;
  }
  float alpha=opacity*energy;
  if(alpha<0.004)discard;
  gl_FragColor=vec4(rgb/max(opacity,0.001),alpha);
}`;

const SPARK_VERTEX=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 aSeed;
uniform mat4 viewProjection;
uniform vec3 origin,axis,side,lift,cameraRight,cameraUp,hitPoint,hitNormal;
uniform float clock,jetLength,jetWidth,energy,mode;
varying vec2 vUV;
varying float vLife,vEnergy;
void main(){
  float life=fract(clock*(0.7+aSeed.w*0.8)+aSeed.z);
  float angle=aSeed.x*6.2831853+life*0.7;
  vec3 center;
  if(mode<0.5){
    float s=life;
    float radius=(0.03+jetWidth*pow(s,0.72))*sqrt(aSeed.y)*1.2;
    center=origin+axis*(s*jetLength)+side*(cos(angle)*radius)+lift*(sin(angle)*radius+s*s*0.3);
  }else{
    vec3 tangent=normalize(cross(abs(hitNormal.y)<0.9?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0),hitNormal));
    vec3 bitangent=cross(hitNormal,tangent);
    float t=life*0.75;
    vec3 velocity=hitNormal*(0.5+aSeed.y*1.8)+(tangent*cos(angle)+bitangent*sin(angle))*(0.4+aSeed.w*1.4)+vec3(0.0,0.7,0.0);
    center=hitPoint+hitNormal*0.035+velocity*t+vec3(0.0,-1.7*t*t,0.0);
  }
  float size=(0.012+aSeed.w*0.025)*(1.0-life*0.6);
  vec3 p=center+cameraRight*position.x*size+cameraUp*position.y*size*(1.4+aSeed.y*2.8);
  vUV=uv;vLife=life;vEnergy=energy;
  gl_Position=viewProjection*vec4(p,1.0);
}`;
const SPARK_FRAGMENT=`
precision highp float;
varying vec2 vUV;
varying float vLife,vEnergy;
void main(){
  vec2 p=vUV*2.0-1.0;
  float a=exp(-dot(p,p)*4.0)*(1.0-vLife)*(1.0-vLife)*vEnergy;
  if(a<0.012)discard;
  vec3 col=mix(vec3(1.0,0.78,0.2),vec3(1.0,0.13,0.01),vLife);
  gl_FragColor=vec4(col*1.7,a);
}`;

function seeded(seed){let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
function makeSparks(scene,count,name){
  const positions=[],uvs=[],indices=[],seeds=[],random=seeded(count+22112026);
  for(let i=0;i<count;i++){
    const offset=i*4,a=[random(),random(),random(),random()];
    positions.push(-1,-1,0,1,-1,0,1,1,0,-1,1,0);uvs.push(0,0,1,0,1,1,0,1);
    indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
    for(let j=0;j<4;j++)seeds.push(...a);
  }
  const mesh=new Mesh(name,scene),data=new VertexData();
  data.positions=positions;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh);
  mesh.setVerticesData('aSeed',seeds,false,4);
  mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.checkCollisions=false;mesh.setEnabled(false);
  return mesh;
}

export class FlameJetFX {
  constructor(scene,options={}){
    if(!scene||scene.isDisposed)throw new Error('FlameJetFX necesita una escena activa.');
    this.scene=scene;this.disposed=false;this.paused=false;this.clock=0;
    this.quality=FLAME_QUALITY[options.quality]?options.quality:'medium';
    this.config=FLAME_QUALITY[this.quality];
    this.origin=new Vector3(0,1,0);this.direction=new Vector3(0,0,1);
    this._side=new Vector3(1,0,0);this._up=new Vector3(0,1,0);
    this._right=new Vector3(1,0,0);this._cameraUp=new Vector3(0,1,0);
    this._cameraPos=new Vector3();this._hitPoint=new Vector3();this._hitNormal=new Vector3(0,0,-1);
    this.length=clamp(finite(options.length,5.8),0.5,12);
    this.width=clamp(finite(options.width,0.62),0.12,1.5);
    this.intensity=clamp(finite(options.intensity,1),0,1.6);
    this.active=false;this.energy=0;this._front=0;this._impactEnergy=0;
    this._queryAge=Infinity;this._queryCount=0;this._hitDistance=this.length;this._hasHit=false;this._lastError=null;
    this.hitHz=clamp(finite(options.hitHz,20),1,60);
    this.resolveHit=typeof options.resolveHit==='function'?options.resolveHit:null;
    this._random=seeded(1159821);
    const noise=new Uint8Array(128*128*4);
    for(let p=0;p<noise.length;p+=4){const v=Math.floor(this._random()*256);noise[p]=noise[p+1]=noise[p+2]=v;noise[p+3]=255;}
    this._noise=RawTexture.CreateRGBATexture(noise,128,128,scene,false,false,Texture.BILINEAR_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this._noise.name='auralia-flame-noise-128';this._noise.gammaSpace=false;this._noise.wrapU=this._noise.wrapV=Texture.WRAP_ADDRESSMODE;
    this._volume=MeshBuilder.CreateBox('auralia-flame-volume',{size:1},scene);
    this._volume.isPickable=false;this._volume.checkCollisions=false;this._volume.alwaysSelectAsActiveMesh=true;this._volume.setEnabled(false);
    this._jetSparks=makeSparks(scene,this.config.sparks,'auralia-flame-embers');
    this._impactSparks=makeSparks(scene,this.config.impactSparks,'auralia-flame-impact');
    this._volumeMaterial=new ShaderMaterial('auralia-flame-volume-material',scene,{vertexSource:VOLUME_VERTEX,fragmentSource:VOLUME_FRAGMENT},{
      attributes:['position'],uniforms:['viewProjection','origin','axis','side','lift','cameraPos','clock','jetLength','boundRadius','jetWidth','energy','power','hasImpact'],
      samplers:['noiseTex'],defines:[`#define FIRE_STEPS ${this.config.steps}`],needAlphaBlending:true,
    });
    this._volumeMaterial.setTexture('noiseTex',this._noise);
    this._volumeMaterial.backFaceCulling=false;this._volumeMaterial.disableDepthWrite=true;
    this._volumeMaterial.alphaMode=Constants.ALPHA_COMBINE;
    this._volumeMaterial.sideOrientation=Material.CounterClockWiseSideOrientation;
    this._volume.material=this._volumeMaterial;
    this._jetMaterial=this._makeSparkMaterial('auralia-flame-embers-material',0);
    this._impactMaterial=this._makeSparkMaterial('auralia-flame-impact-material',1);
    this._jetSparks.material=this._jetMaterial;this._impactSparks.material=this._impactMaterial;
    this._meshes=[this._volume,this._jetSparks,this._impactSparks];
    this._materials=[this._volumeMaterial,this._jetMaterial,this._impactMaterial];
    this.muzzleLight=null;this.impactLight=null;
    if(options.createLights){
      this.muzzleLight=new PointLight('auralia-flame-muzzle-light',this.origin.clone(),scene);
      this.impactLight=new PointLight('auralia-flame-impact-light',this.origin.clone(),scene);
      for(const light of [this.muzzleLight,this.impactLight]){light.diffuse=new Color3(1,0.24,0.025);light.specular=new Color3(1,0.45,0.12);light.range=4;light.intensity=0;}
    }
    this._disposeObserver=scene.onDisposeObservable.add(()=>this.dispose());
  }
  _makeSparkMaterial(name,mode){
    const mat=new ShaderMaterial(name,this.scene,{vertexSource:SPARK_VERTEX,fragmentSource:SPARK_FRAGMENT},{attributes:['position','uv','aSeed'],uniforms:['viewProjection','origin','axis','side','lift','cameraRight','cameraUp','hitPoint','hitNormal','clock','jetLength','jetWidth','energy','mode'],needAlphaBlending:true});
    mat.setFloat('mode',mode);mat.disableDepthWrite=true;mat.backFaceCulling=false;mat.alphaMode=Constants.ALPHA_ADD;return mat;
  }
  prepare(){return Promise.all(this._meshes.map(mesh=>mesh.material.forceCompilationAsync(mesh))).then(()=>{});}
  setEmitter(position,direction){
    if(this.disposed||!valid3(position)||!valid3(direction))return;
    const len=Math.hypot(direction.x,direction.y,direction.z);if(len<0.00001)return;
    if(Math.hypot(this.origin.x-position.x,this.origin.y-position.y,this.origin.z-position.z)>2){this._front=0;this._queryAge=Infinity;}
    this.origin.copyFromFloats(position.x,position.y,position.z);this.direction.copyFromFloats(direction.x/len,direction.y/len,direction.z/len);
    if(Math.abs(this.direction.y)>0.97)Vector3.CrossToRef(new Vector3(1,0,0),this.direction,this._side);
    else Vector3.CrossToRef(Vector3.UpReadOnly,this.direction,this._side);
    this._side.normalize();Vector3.CrossToRef(this.direction,this._side,this._up);this._up.normalize();
  }
  setActive(value){if(this.disposed)return;value=!!value;if(value&&!this.active){this._front=0;this._queryAge=Infinity;}this.active=value;}
  setParameters(options={}){
    if(this.disposed)return;
    this.length=clamp(finite(options.length,this.length),0.5,12);
    this.width=clamp(finite(options.width,this.width),0.12,1.5);
    this.intensity=clamp(finite(options.intensity,this.intensity),0,1.6);
    this._queryAge=Infinity;
  }
  setPaused(value){this.paused=!!value;}
  reset(){
    if(this.disposed)return;this.active=false;this.energy=0;this.clock=0;this._front=0;this._impactEnergy=0;this._hasHit=false;this._queryAge=Infinity;this._lastError=null;
    this._hide();
  }
  _hide(){for(const mesh of this._meshes)mesh.setEnabled(false);if(this.muzzleLight)this.muzzleLight.intensity=0;if(this.impactLight)this.impactLight.intensity=0;}
  _query(){
    this._queryAge=0;this._hasHit=false;this._hitDistance=this.length;
    if(!this.resolveHit)return;
    try{
      this._queryCount++;
      const hit=this.resolveHit(this.origin,this.direction,this.length);
      this._lastError=null;
      if(hit&&Number.isFinite(hit.distance)&&hit.distance>=0&&hit.distance<=this.length){
        this._hasHit=true;this._hitDistance=hit.distance;
        this.origin.addToRef(this.direction.scale(hit.distance),this._hitPoint);
        if(valid3(hit.normal)&&Math.hypot(hit.normal.x,hit.normal.y,hit.normal.z)>0.00001)this._hitNormal.copyFromFloats(hit.normal.x,hit.normal.y,hit.normal.z).normalize();
        else this._hitNormal.copyFrom(this.direction).negateInPlace();
      }
    }catch(error){this._lastError=String(error?.message||error);this._hasHit=false;this._hitDistance=0;}
  }
  update(deltaSeconds,camera=this.scene.activeCamera){
    if(this.disposed||!camera)return;
    const dt=this.paused?0:clamp(finite(deltaSeconds,0),0,0.1),request=this.active&&this.intensity>0;
    if(dt>0){
      const k=1-Math.exp(-dt/(request?0.075:0.12));
      this.energy+=(Number(request)-this.energy)*k;
      if(!request&&this.energy<0.003)this.energy=0;
      if(request)this._front=Math.min(this.length,this._front+dt*15);
      if(this.energy>0||request)this.clock+=dt;
      this._queryAge+=dt;
      if(request&&this._queryAge>=1/this.hitHz)this._query();
    }
    // Between 20 Hz queries, retain the world contact plane as the hand moves.
    // Reusing an old distance from a different emitter can put fire through walls.
    if(this._hasHit){
      const denominator=Vector3.Dot(this.direction,this._hitNormal);
      if(Math.abs(denominator)>0.001){
        const distance=((this._hitPoint.x-this.origin.x)*this._hitNormal.x+
          (this._hitPoint.y-this.origin.y)*this._hitNormal.y+(this._hitPoint.z-this.origin.z)*this._hitNormal.z)/denominator;
        this._hitDistance=clamp(distance,0,this.length);
        this._hitPoint.copyFromFloats(this.origin.x+this.direction.x*this._hitDistance,
          this.origin.y+this.direction.y*this._hitDistance,this.origin.z+this.direction.z*this._hitDistance);
      }
    }
    const visible=this.energy>0.003&&this._front>0.02;
    const range=Math.max(0.01,Math.min(this._front,this._hitDistance,this.length));
    const hitActive=visible&&this._hasHit&&this._front>=this._hitDistance-0.08&&this._hitDistance>0.05;
    if(dt>0)this._impactEnergy+=(Number(hitActive)*this.energy-this._impactEnergy)*(1-Math.exp(-dt*15));
    if(!visible&&this._impactEnergy<0.003){this._impactEnergy=0;this._hide();return;}
    this._volume.setEnabled(visible&&range>0.05);this._jetSparks.setEnabled(visible&&range>0.05);this._impactSparks.setEnabled(this._impactEnergy>0.005);
    // Geometry is positioned in the vertex shader; CPU transparent sorting
    // must still use the actual emitter/impact, not the world's origin.
    this._volume.position.copyFrom(this.origin).addInPlaceFromFloats(this.direction.x*range*.5,this.direction.y*range*.5,this.direction.z*range*.5);
    this._jetSparks.position.copyFrom(this._volume.position);this._impactSparks.position.copyFrom(this._hitPoint);
    const view=camera.getViewMatrix(),eye=camera.globalPosition||camera.position;
    this._cameraPos.copyFrom(eye);this._right.set(view.m[0],view.m[4],view.m[8]).normalize();this._cameraUp.set(view.m[1],view.m[5],view.m[9]).normalize();
    for(const mat of this._materials){
      mat.setVector3('origin',this.origin);mat.setVector3('axis',this.direction);mat.setVector3('side',this._side);mat.setVector3('lift',this._up);
      mat.setFloat('clock',this.clock);mat.setFloat('jetLength',range);mat.setFloat('jetWidth',this.width);
    }
    this._volumeMaterial.setVector3('cameraPos',this._cameraPos);this._volumeMaterial.setFloat('boundRadius',this.width*1.55+0.2);
    this._volumeMaterial.setFloat('energy',this.energy);this._volumeMaterial.setFloat('power',this.intensity);this._volumeMaterial.setFloat('hasImpact',Number(hitActive));
    for(const mat of [this._jetMaterial,this._impactMaterial]){
      mat.setVector3('cameraRight',this._right);mat.setVector3('cameraUp',this._cameraUp);mat.setVector3('hitPoint',this._hitPoint);mat.setVector3('hitNormal',this._hitNormal);
    }
    this._jetMaterial.setFloat('energy',this.energy*this.intensity);this._impactMaterial.setFloat('energy',this._impactEnergy*this.intensity);
    if(this.muzzleLight){this.muzzleLight.position.copyFrom(this.origin);this.muzzleLight.intensity=this.energy*this.intensity*(3.0+Math.sin(this.clock*27)*0.3);}
    if(this.impactLight){this.impactLight.position.copyFrom(this._hitPoint).addInPlace(this._hitNormal.scale(0.12));this.impactLight.intensity=this._impactEnergy*this.intensity*(4.0+Math.sin(this.clock*23)*0.4);}
  }
  getState(){
    return {phase:this.disposed?'disposed':this.energy<=0.003?'off':!this.active?'cooling':this.energy<0.85?'ignition':'flow',active:this.active,energy:this.energy,clock:this.clock,quality:this.quality,length:this.length,visibleLength:Math.min(this._front,this._hitDistance,this.length),width:this.width,intensity:this.intensity,hit:this._hasHit,hitDistance:this._hasHit?this._hitDistance:null,queries:this._queryCount,error:this._lastError,enabledMeshes:this.disposed?0:this._meshes.filter(m=>m.isEnabled()).length,disposed:this.disposed};
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.active=false;
    if(this._disposeObserver)this.scene.onDisposeObservable.remove(this._disposeObserver);
    for(const mesh of this._meshes)mesh.dispose(false,false);
    for(const mat of this._materials)mat.dispose(false,false);
    this._noise.dispose();this.muzzleLight?.dispose();this.impactLight?.dispose();
  }
}

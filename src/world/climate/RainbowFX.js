/** Auralia RainbowFX v1 — Babylon.js 9.32.0 / WebGL. No external textures. */
import { Constants, Mesh, ShaderMaterial, Vector3, VertexData } from '@babylonjs/core';

const cap=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
const point=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const smooth=(a,b,x)=>{const t=cap((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const UP=new Vector3(0,1,0);
const VERTEX=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 viewProjection;
uniform vec3 cameraPos;
uniform vec3 axis;
uniform vec3 right;
uniform vec3 vertical;
uniform vec3 emitter;
uniform float depth;
uniform float width;
uniform float height;
uniform float localMode;
varying vec2 vUV;
varying vec3 vWorld;
void main(){
  vUV=uv;
  vec3 sky=cameraPos+depth*(axis+right*position.x+vertical*position.y);
  vec3 local=emitter+right*position.x*width+vec3(0.0,(position.y+0.5)*height,0.0);
  vWorld=mix(sky,local,localMode);
  gl_Position=viewProjection*vec4(vWorld,1.0);
}
`;
const FRAGMENT=`
precision highp float;
uniform vec3 cameraPos;
uniform vec3 axis;
uniform float opacity;
uniform float saturation;
uniform float secondary;
uniform float localMode;
uniform float clipHorizon;
uniform float clock;
varying vec2 vUV;
varying vec3 vWorld;
vec3 spectrum(float t){
  vec3 c=mix(vec3(0.53,0.28,0.90),vec3(0.22,0.44,1.0),smoothstep(0.0,0.19,t));
  c=mix(c,vec3(0.24,0.79,0.92),smoothstep(0.16,0.37,t));
  c=mix(c,vec3(0.37,0.84,0.42),smoothstep(0.33,0.54,t));
  c=mix(c,vec3(1.0,0.86,0.27),smoothstep(0.50,0.71,t));
  c=mix(c,vec3(1.0,0.48,0.19),smoothstep(0.67,0.86,t));
  c=mix(c,vec3(0.98,0.24,0.20),smoothstep(0.82,1.0,t));
  return mix(vec3(dot(c,vec3(0.299,0.587,0.114))),c,saturation);
}
void main(){
  vec3 dir=normalize(vWorld-cameraPos);
  float angle=acos(clamp(dot(dir,axis),-1.0,1.0))*57.2957795;
  float isSecondary=step(0.5,vUV.y);
  float t=(angle-mix(40.0,50.5,isSecondary))/mix(2.0,2.5,isSecondary);
  float mask=smoothstep(-0.10,0.10,t)*(1.0-smoothstep(0.90,1.10,t));
  float alpha=opacity*mask*mix(0.20,secondary*0.20,isSecondary);
  float horizon=mix(1.0,smoothstep(-0.008,0.025,dir.y),clipHorizon);
  alpha*=horizon;
  if(localMode>0.5){
    vec2 q=vec2((vUV.x-0.5)*2.0,vUV.y);
    float r=length(q);
    t=(r-0.78)/0.20;
    mask=smoothstep(-0.09,0.12,t)*(1.0-smoothstep(0.88,1.10,t));
    float mist=0.84+0.09*sin(vWorld.x*1.7+vWorld.y*2.1+clock*0.31)+0.07*sin(vWorld.y*3.6-vWorld.z*1.2-clock*0.23);
    alpha=opacity*mask*smoothstep(0.015,0.20,vUV.y)*mist;
    isSecondary=0.0;
  }
  if(alpha<0.002)discard;
  vec3 color=spectrum(mix(t,1.0-t,isSecondary));
  gl_FragColor=vec4(color,alpha);
}
`;

function material(scene,name,local){
  const m=new ShaderMaterial(name,scene,{vertexSource:VERTEX,fragmentSource:FRAGMENT},{
    attributes:['position','uv'],
    uniforms:['viewProjection','cameraPos','axis','right','vertical','emitter','depth','width','height','localMode','opacity','saturation','secondary','clipHorizon','clock'],
    needAlphaBlending:true
  });
  m.backFaceCulling=false;m.disableDepthWrite=true;m.alphaMode=Constants.ALPHA_COMBINE;
  m.setFloat('localMode',local?1:0);m.setFloat('width',1);m.setFloat('height',1);m.setFloat('depth',1);
  m.setFloat('clipHorizon',local?0:1);m.setFloat('secondary',0);m.setFloat('saturation',0.82);
  m.setVector3('emitter',Vector3.Zero());m.setVector3('vertical',UP);
  return m;
}
function makeMesh(scene,name,data,mat){
  const mesh=new Mesh(name,scene);data.applyToMesh(mesh);mesh.material=mat;
  mesh.isPickable=false;mesh.checkCollisions=false;mesh.alwaysSelectAsActiveMesh=true;
  mesh.renderingGroupId=0;mesh.setEnabled(false);return mesh;
}
function skyData(segments){
  const d=new VertexData(),positions=[],uvs=[],indices=[];
  for(let band=0;band<2;band++){
    const inner=(band?50.15:39.7)*Math.PI/180,outer=(band?53.35:42.3)*Math.PI/180;
    const start=positions.length/3;
    for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2;
      for(const radius of [Math.tan(inner),Math.tan(outer)]){
        positions.push(Math.cos(a)*radius,Math.sin(a)*radius,0);uvs.push(i/segments,band);
      }
      if(i<segments){const v=start+i*2;indices.push(v,v+1,v+2,v+1,v+3,v+2);}
    }
  }
  d.positions=new Float32Array(positions);d.uvs=new Float32Array(uvs);d.indices=new Uint16Array(indices);return d;
}
function quadData(){
  const d=new VertexData();d.positions=new Float32Array([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0]);d.uvs=new Float32Array([0,0,1,0,1,1,0,1]);d.indices=new Uint16Array([0,1,2,0,2,3]);return d;
}
class WaterfallBow {
  constructor(owner,o){
    if(!point(o.position))throw new TypeError('La cascada necesita una posición mundial finita.');
    this.owner=owner;this.position=new Vector3(o.position.x,o.position.y,o.position.z);
    this.width=cap(finite(o.width,10),.5,200);this.height=cap(finite(o.height,5),.3,100);
    this.intensity=cap(finite(o.intensity,1),0,1);this.opacity=cap(finite(o.opacity,.30),0,1);
    this.maxDistance=cap(finite(o.maxDistance,110),5,2000);this.enabled=o.enabled!==false;this.disposed=false;this.alpha=0;
    this._material=material(owner.scene,'auralia-waterfall-bow',true);
    this._mesh=makeMesh(owner.scene,'auralia-waterfall-bow',quadData(),this._material);
    this._right=new Vector3(1,0,0);
  }
  setPosition(p){if(!point(p))throw new TypeError('Posición mundial inválida.');this.position.set(p.x,p.y,p.z);}
  setIntensity(v){this.intensity=cap(finite(v,0),0,1);}
  setEnabled(v){this.enabled=!!v;}
  dispose(){if(this.disposed)return;this.disposed=true;this._mesh.dispose();this._material.dispose();this.owner._waterfalls.delete(this);}
}

export class RainbowFX {
  constructor(scene,options={}){
    if(!scene?.getEngine)throw new TypeError('RainbowFX necesita una escena Babylon.js.');
    this.scene=scene;this.disposed=false;this.enabled=options.enabled!==false;this.paused=false;this.clock=0;
    this.skyOpacity=cap(finite(options.skyOpacity,.32),0,1);this.saturation=cap(finite(options.saturation,.82),0,1);
    this.skyDistance=cap(finite(options.skyDistance,1000),30,10000);this.fadeSeconds=cap(finite(options.fadeSeconds,1.2),.01,10);
    this.secondary=!!options.secondary;this.clipHorizon=options.clipHorizon!==false;
    this.maxWaterfalls=cap(Math.round(finite(options.maxWaterfalls,8)),1,32);
    this.segments=cap(Math.round(finite(options.segments,128)),48,256);
    this._alpha=0;this._waterfalls=new Set();this._axis=new Vector3(0,-.25,1);this._sun=new Vector3(0,.25,-1).normalize();
    this._right=new Vector3(1,0,0);this._vertical=new Vector3(0,1,0);this._delta=new Vector3();
    this._mat=material(scene,'auralia-rain-bow',false);
    const data=skyData(this.segments);this._sky=makeMesh(scene,'auralia-rain-bow',data,this._mat);
    this._geometryBytes=data.positions.byteLength+data.uvs.byteLength+data.indices.byteLength;
    this._observer=scene.onDisposeObservable.add(()=>this.dispose());
  }
  addWaterfall(options={}){
    if(this.disposed)throw new Error('RainbowFX ya fue liberado.');
    if(this._waterfalls.size>=this.maxWaterfalls)throw new Error('Se alcanzó maxWaterfalls; liberar los emisores descargados.');
    const handle=new WaterfallBow(this,options);this._waterfalls.add(handle);return handle;
  }
  setEnabled(v){this.enabled=!!v;}
  setPaused(v){this.paused=!!v;}
  reset(){
    if(this.disposed)return;this.clock=0;this._alpha=0;this._sky.setEnabled(false);
    for(const bow of this._waterfalls){bow.alpha=0;bow._mesh.setEnabled(false);}
  }
  /** sunDirection points FROM the observer TOWARDS the sun, in world coordinates. */
  update(dt,camera=this.scene.activeCamera,state={}){
    if(this.disposed||!camera)return;
    const eye=camera.globalPosition||camera.position;if(!point(eye))return;
    dt=cap(finite(dt,0),0,.25);const frameDt=this.paused?0:dt;this.clock+=frameDt;
    // The public state accepts plain {x,y,z}; Babylon vector helpers read private fields.
    if(point(state.sunDirection)&&Math.hypot(state.sunDirection.x,state.sunDirection.y,state.sunDirection.z)>.001)
      this._sun.copyFromFloats(state.sunDirection.x,state.sunDirection.y,state.sunDirection.z).normalize();
    const day=state.isDay===false?0:1;
    const sunVisibility=cap(finite(state.sunVisibility,1),0,1);
    const sunlight=day*sunVisibility*smooth(-.02,.10,this._sun.y)*(this.enabled?1:0);
    const rain=cap(finite(state.rainAmount,0),0,1);
    this._axis.copyFrom(this._sun).scaleInPlace(-1);
    Vector3.CrossToRef(UP,this._axis,this._right);
    if(this._right.lengthSquared()<.00001)this._right.set(1,0,0);else this._right.normalize();
    Vector3.CrossToRef(this._axis,this._right,this._vertical).normalize();
    const blend=1-Math.exp(-frameDt*4/this.fadeSeconds);
    const elevation=Math.asin(cap(this._sun.y,-1,1))*180/Math.PI;
    const horizonLimit=this.clipHorizon?1-smooth(39.5,42.4,elevation):1;
    const target=this.skyOpacity*sunlight*smooth(.015,.40,rain)*horizonLimit;
    this._alpha+=(target-this._alpha)*blend;
    this._sky.setEnabled(this._alpha>.001);
    if(this._alpha>.001){
      this._apply(this._mat,eye,this._right,this._alpha);
      this._mat.setVector3('vertical',this._vertical);this._mat.setFloat('clipHorizon',this.clipHorizon?1:0);
      const depth=Math.min(this.skyDistance,finite(camera.maxZ,2000)*(this.secondary?.54:.70));
      this._mat.setFloat('depth',depth);
      // The vertex shader places the band in world space. Keep its CPU sorting
      // center there too, so near transparent clouds/water draw over the far bow.
      this._sky.position.copyFromFloats(eye.x+this._axis.x*depth,eye.y+this._axis.y*depth,eye.z+this._axis.z*depth);
      this._mat.setFloat('secondary',this.secondary?1:0);
    }
    for(const bow of this._waterfalls){
      this._delta.copyFrom(bow.position).subtractInPlace(eye);const distance=this._delta.length();
      const unit=distance>.01?this._delta.scale(1/distance):this._axis;
      const facing=smooth(-.10,.50,Vector3.Dot(unit,this._axis));
      const range=1-smooth(bow.maxDistance*.65,bow.maxDistance,distance);
      const targetBow=bow.enabled&&distance>.75?bow.opacity*bow.intensity*sunlight*facing*range:0;
      bow.alpha+=(targetBow-bow.alpha)*blend;
      // Hard range culling: an emitter outside its loaded/visible range costs no draw.
      bow._mesh.setEnabled(bow.alpha>.001&&distance<bow.maxDistance);
      if(!bow._mesh.isEnabled())continue;
      bow._right.set(unit.z,0,-unit.x);if(bow._right.lengthSquared()<.0001)bow._right.set(1,0,0);else bow._right.normalize();
      this._apply(bow._material,eye,bow._right,bow.alpha);
      bow._material.setVector3('emitter',bow.position);bow._material.setFloat('width',bow.width);bow._material.setFloat('height',bow.height);
    }
  }
  _apply(mat,eye,right,alpha){
    mat.setVector3('cameraPos',eye);mat.setVector3('axis',this._axis);mat.setVector3('right',right);
    mat.setFloat('opacity',alpha);mat.setFloat('clock',this.clock);mat.setFloat('saturation',this.saturation);
  }
  getStats(){
    let visible=0;for(const b of this._waterfalls)if(!b.disposed&&b._mesh.isEnabled())visible++;
    return {drawCalls:this.disposed?0:(this._sky.isEnabled()?1:0)+visible,waterfalls:this._waterfalls.size,visibleWaterfalls:visible,skyAlpha:this._alpha,geometryBytes:this._geometryBytes+this._waterfalls.size*92,textures:0,disposed:this.disposed};
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.scene.onDisposeObservable.remove(this._observer);
    for(const bow of [...this._waterfalls])bow.dispose();this._sky.dispose();this._mat.dispose();
  }
}
// Entrega 00000012


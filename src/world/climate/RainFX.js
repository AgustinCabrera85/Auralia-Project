/** Auralia RainFX v1. Babylon.js 9.32.0, WebGL2. World units: metres. */
import { Color3, Constants, Mesh, RawTexture, ShaderMaterial, Texture, Vector2, Vector3, VertexData } from '@babylonjs/core';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const number=(n,d)=>Number.isFinite(n)?n:d;
export const RAIN_QUALITY=Object.freeze({
  low:Object.freeze({drops:2400,splashes:360,grid:49}),
  medium:Object.freeze({drops:5200,splashes:800,grid:65}),
  high:Object.freeze({drops:9000,splashes:1400,grid:97})
});
const SURFACE_GLSL=`
uniform sampler2D surfaceMap;
uniform vec2 mapOrigin;
uniform float mapSpan;
uniform float gridSize;
uniform float mapReady;
vec3 surfaceAt(vec2 p){
  vec2 uv=(p-mapOrigin)/mapSpan;
  float inside=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
  vec2 texel=(floor(clamp(uv,0.0,1.0)*(gridSize-1.0)+0.5)+0.5)/gridSize;
  vec4 s=texture2D(surfaceMap,texel);
  return vec3(-256.0+(s.r*65280.0+s.g*255.0)/65535.0*1024.0,s.b,inside*s.a*mapReady);
}
`;
const RAIN_VERTEX=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 aSeed;
uniform mat4 viewProjection;
uniform vec3 cameraPos;
uniform vec2 wind;
uniform vec2 windOffset;
uniform float clock;
uniform float span;
uniform float columnHeight;
uniform float speed;
uniform float intensity;
uniform float brightness;
uniform float opacity;
varying vec2 vUV;
varying float vAlpha;
varying float vY;
varying float vFloor;
${SURFACE_GLSL}
void main(){
  vec2 xz=aSeed.xy*span+windOffset;
  xz=cameraPos.xz+mod(xz-cameraPos.xz+span*0.5,span)-span*0.5;
  float localSpeed=speed*(0.82+aSeed.w*0.36);
  float y=cameraPos.y+columnHeight*0.62-mod(clock*localSpeed+aSeed.z*columnHeight,columnHeight);
  vec3 p=vec3(xz.x,y,xz.y);
  vec3 axis=normalize(vec3(-wind.x,localSpeed,-wind.y));
  vec3 side=cross(normalize(cameraPos-p+vec3(0.001,0.0,0.001)),axis);
  side=normalize(side+vec3(0.0001,0.0,0.0));
  float width=0.018+aSeed.w*0.017;
  float length=(0.28+aSeed.z*0.50)*(0.75+speed/24.0);
  p+=side*position.x*width+axis*position.y*length;
  vec3 surface=surfaceAt(xz);
  float distanceFade=1.0-smoothstep(span*0.30,span*0.49,distance(xz,cameraPos.xz));
  float nearFade=smoothstep(0.65,1.8,distance(p,cameraPos));
  float selected=step(aSeed.w,intensity);
  vAlpha=selected*distanceFade*nearFade*surface.z*opacity*brightness;
  vFloor=surface.x;
  vY=p.y;
  vUV=uv;
  gl_Position=viewProjection*vec4(p,1.0);
}
`;
const RAIN_FRAGMENT=`
precision highp float;
varying vec2 vUV;
varying float vAlpha;
varying float vY;
varying float vFloor;
uniform vec3 tint;
void main(){
  float across=exp(-pow((vUV.x-0.5)*4.0,2.0));
  float ends=sin(vUV.y*3.14159265);
  float alpha=across*ends*vAlpha*smoothstep(vFloor+0.015,vFloor+0.08,vY);
  if(alpha<0.008)discard;
  gl_FragColor=vec4(tint,alpha);
}
`;
const SPLASH_VERTEX=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 aSeed;
uniform mat4 viewProjection;
uniform vec3 cameraPos;
uniform vec3 cameraRight;
uniform float clock;
uniform float span;
uniform float intensity;
uniform float brightness;
uniform float opacity;
varying vec2 vUV;
varying float vAge;
varying float vAlpha;
varying float vWater;
varying float vType;
${SURFACE_GLSL}
void main(){
  // Static world positions; the enclosing volume wraps as the camera travels.
  vec2 xz=aSeed.xy*span;
  xz=cameraPos.xz+mod(xz-cameraPos.xz+span*0.5,span)-span*0.5;
  vec3 s=surfaceAt(xz);
  float water=step(0.4,s.y);
  float age=fract(clock*(0.72+aSeed.z*0.75)+aSeed.w*9.0);
  float type=step(0.59,aSeed.z)*(1.0-water);
  float ringSize=mix(0.22,0.70,water)*(0.15+age);
  vec3 p=vec3(xz.x,s.x+0.035,xz.y);
  if(type<0.5){
    p+=vec3(position.x*ringSize,0.0,position.y*ringSize);
  }else{
    float a=aSeed.w*6.2831853;
    float hop=4.0*age*(1.0-age)*(0.08+aSeed.z*0.11);
    p+=vec3(cos(a)*age*0.21,hop,sin(a)*age*0.21);
    p+=cameraRight*position.x*0.023+vec3(0.0,position.y*0.055,0.0);
  }
  float fade=1.0-smoothstep(span*0.23,span*0.47,distance(xz,cameraPos.xz));
  vAlpha=s.z*step(aSeed.w,intensity)*fade*opacity*brightness;
  vAge=age;vUV=uv;vWater=water;vType=type;
  gl_Position=viewProjection*vec4(p,1.0);
}
`;
const SPLASH_FRAGMENT=`
precision highp float;
varying vec2 vUV;
varying float vAge;
varying float vAlpha;
varying float vWater;
varying float vType;
uniform vec3 tint;
void main(){
  float d=length(vUV-0.5)*2.0;
  float ring=exp(-pow((d-0.76)*25.0,2.0));
  float second=exp(-pow((d-0.46)*32.0,2.0))*vWater*0.28;
  float dotMask=exp(-dot((vUV-0.5)*4.0,(vUV-0.5)*4.0));
  float shape=mix(ring+second,dotMask,vType);
  float alpha=shape*pow(1.0-vAge,1.7)*smoothstep(0.0,0.07,vAge)*vAlpha;
  if(alpha<0.008)discard;
  gl_FragColor=vec4(tint,alpha);
}
`;

function seeded(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function makeMesh(scene,name,count,seed){
  const positions=new Float32Array(count*12),uvs=new Float32Array(count*8);
  const seeds=new Float32Array(count*16),indices=new Uint16Array(count*6),rand=seeded(seed);
  const corners=[[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5]];
  for(let i=0;i<count;i++){
    const s=[rand(),rand(),rand(),(i+0.5)/count];
    // Shuffle the density threshold so light rain stays spatially distributed.
    s[3]=rand();
    for(let j=0;j<4;j++){
      positions.set([corners[j][0],corners[j][1],0],i*12+j*3);
      uvs.set([corners[j][0]+0.5,corners[j][1]+0.5],i*8+j*2);
      seeds.set(s,i*16+j*4);
    }
    indices.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);
  }
  const mesh=new Mesh(name,scene),data=new VertexData();
  data.positions=positions;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh);
  mesh.setVerticesData('aSeed',seeds,false,4);
  mesh.isPickable=false;mesh.checkCollisions=false;mesh.alwaysSelectAsActiveMesh=true;
  // Preserve opaque depth: never assign a separate rendering group which clears it.
  mesh.renderingGroupId=0;mesh.receiveShadows=false;
  return mesh;
}

/** GPU rain plus cached world surface heights. One instance per loaded scene. */
export class RainFX {
  constructor(scene,options={}){
    if(!scene?.getEngine)throw new TypeError('RainFX necesita una escena Babylon.js.');
    if(scene.getEngine().getCaps().maxVertexTextureImageUnits<1)throw new Error('RainFX necesita texturas en vertex shaders (WebGL2 recomendado).');
    this.scene=scene;this.disposed=false;this.paused=false;this.clock=0;
    this.quality=RAIN_QUALITY[options.quality]?options.quality:'medium';
    this._config=RAIN_QUALITY[this.quality];
    this.span=clamp(number(options.span,52),16,120);
    this.columnHeight=clamp(number(options.columnHeight,24),8,80);
    this.speed=clamp(number(options.speed,14),3,32);
    this.opacity=clamp(number(options.opacity,0.35),0,1);
    this.brightness=clamp(number(options.brightness,1),0,2);
    this.intensity=clamp(number(options.intensity,0.6),0,1);this.targetIntensity=this.intensity;
    this._duration=0;this._elapsed=0;this._from=this.intensity;
    this.wind={x:clamp(number(options.wind?.x,0.8),-14,14),z:clamp(number(options.wind?.z,0.3),-14,14)};
    this._windOffset={x:0,z:0};
    this._windVector=new Vector2();this._offsetVector=new Vector2();this._originVector=new Vector2();
    this.tint=Color3.FromHexString(options.color||'#c3dbe5');
    this._sample=typeof options.getSurfaceAt==='function'?options.getSurfaceAt:()=>({height:number(options.groundY,0),kind:'ground'});
    this.surfaceBudget=clamp(Math.floor(number(options.surfaceBudget,256)),1,4096);
    this.surfaceTimeBudgetMs=clamp(number(options.surfaceTimeBudgetMs,0.75),0.1,4);
    this._ready=false;this._frontOrigin={x:0,z:0};this._pending=null;this._dirty=true;
    this._grid=this._config.grid;this._mapSpan=this.span+12;
    this._bytes=new Uint8Array(this._grid*this._grid*4);
    this._scratch=new Uint8Array(this._bytes.length);
    this._known=new Uint8Array(this._grid*this._grid);
    this._knownScratch=new Uint8Array(this._known.length);
    const half=(this._grid-1)/2;
    this._order=Uint32Array.from(Array.from({length:this._known.length},(_,i)=>i).sort((a,b)=>
      Math.hypot(a%this._grid-half,Math.floor(a/this._grid)-half)-Math.hypot(b%this._grid-half,Math.floor(b/this._grid)-half)));
    this._surfaceQueries=0;this._surfaceLastQueries=0;this._surfaceMs=0;this._uploads=0;this._retryAt=0;
    this._texture=RawTexture.CreateRGBATexture(this._bytes,this._grid,this._grid,scene,false,false,Texture.NEAREST_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this._texture.name='auralia-rain-surface-cache';this._texture.wrapU=this._texture.wrapV=Texture.CLAMP_ADDRESSMODE;
    this._rain=makeMesh(scene,'auralia-rain-drops',this._config.drops,20261121);
    this._splash=makeMesh(scene,'auralia-rain-splashes',this._config.splashes,20261122);
    this._materials=[this._material('auraliaRainDrops',RAIN_VERTEX,RAIN_FRAGMENT),this._material('auraliaRainSplashes',SPLASH_VERTEX,SPLASH_FRAGMENT)];
    this._rain.material=this._materials[0];this._splash.material=this._materials[1];
    this._rain.setEnabled(false);this._splash.setEnabled(false);
    this._right=new Vector3(1,0,0);this._lastPosition=null;
    this._sceneObserver=scene.onDisposeObservable.add(()=>this.dispose());
  }
  _material(name,vertexSource,fragmentSource){
    const mat=new ShaderMaterial(name,this.scene,{vertexSource,fragmentSource},{
      attributes:['position','uv','aSeed'],
      uniforms:['viewProjection','cameraPos','cameraRight','clock','wind','windOffset','span','columnHeight','speed','intensity','brightness','opacity','tint','mapOrigin','mapSpan','gridSize','mapReady'],
      samplers:['surfaceMap'],needAlphaBlending:true
    });
    mat.backFaceCulling=false;mat.disableDepthWrite=true;mat.alphaMode=Constants.ALPHA_COMBINE;
    mat.setTexture('surfaceMap',this._texture);return mat;
  }
  setIntensity(value,seconds=1.5){
    if(this.disposed)return;
    this.targetIntensity=clamp(number(value,this.targetIntensity),0,1);
    this._from=this.intensity;this._elapsed=0;this._duration=Math.max(0,number(seconds,1.5));
    if(!this._duration)this.intensity=this.targetIntensity;
  }
  setWind(x,z){if(this.disposed)return;this.wind.x=clamp(number(x,0),-14,14);this.wind.z=clamp(number(z,0),-14,14);}
  setBrightness(value){this.brightness=clamp(number(value,1),0,2);}
  setPaused(value){this.paused=!!value;}
  invalidateSurfaces(){this._dirty=true;this._pending=null;this._ready=false;this._rain.setEnabled(false);this._splash.setEnabled(false);}
  reset(){if(this.disposed)return;this.clock=0;this._windOffset.x=0;this._windOffset.z=0;this._ready=false;this._dirty=true;this._pending=null;this._lastPosition=null;this._retryAt=0;this._rain.setEnabled(false);this._splash.setEnabled(false);}
  _updateSurfaceCache(pos){
    const started=performance.now();let changed=false;
    const step=this._mapSpan/(this._grid-1),half=(this._grid-1)/2;
    const gx=Math.round(pos.x/step)-half,gz=Math.round(pos.z/step)-half;
    const centerX=this._frontOrigin.x+this._mapSpan/2,centerZ=this._frontOrigin.z+this._mapSpan/2;
    if(this._dirty||Math.abs(pos.x-centerX)>3||Math.abs(pos.z-centerZ)>3){
      // Fixed WORLD lattice: a camera move reuses the overlapping rows/columns.
      // Keep valid coverage visible while new edge cells are sampled progressively.
      this._scratch.fill(0);this._knownScratch.fill(0);
      const dx=gx-Math.round(this._frontOrigin.x/step),dz=gz-Math.round(this._frontOrigin.z/step);
      if(!this._dirty&&Math.abs(dx)<this._grid&&Math.abs(dz)<this._grid){
        const x0=Math.max(0,-dx),x1=Math.min(this._grid,this._grid-dx);
        for(let z=Math.max(0,-dz);z<Math.min(this._grid,this._grid-dz);z++){
          const a=(z+dz)*this._grid+x0+dx,b=z*this._grid+x0;
          this._scratch.set(this._bytes.subarray(a*4,(a+x1-x0)*4),b*4);
          this._knownScratch.set(this._known.subarray(a,a+x1-x0),b);
        }
      }
      [this._bytes,this._scratch]=[this._scratch,this._bytes];
      [this._known,this._knownScratch]=[this._knownScratch,this._known];
      this._frontOrigin.x=gx*step;this._frontOrigin.z=gz*step;
      this._pending={index:0};changed=true;
      this._dirty=false;
    }
    if(!this._pending&&this.clock>=this._retryAt){
      // Only unloaded/invalid cells retry. Streaming completion never throws
      // away every known roof and terrain sample in the surrounding 64 metres.
      this._retryAt=this.clock+1;
      for(let i=0;i<this._known.length;i++)if(!this._bytes[i*4+3])this._known[i]=0;
      if(this._known.includes(0))this._pending={index:0};
    }
    const p=this._pending,total=this._known.length;
    while(p&&p.index<total){
      if(this._surfaceLastQueries>=this.surfaceBudget||performance.now()-started>=this.surfaceTimeBudgetMs)break;
      const i=this._order[p.index++];if(this._known[i])continue;
      const x=this._frontOrigin.x+(i%this._grid)*step,z=this._frontOrigin.z+Math.floor(i/this._grid)*step;
      const surface=this._sample(x,z);
      this._surfaceLastQueries++;this._surfaceQueries++;this._known[i]=1;changed=true;
      const height=typeof surface==='number'?surface:surface?.height;
      const valid=Number.isFinite(height)&&height>=-256&&height<=768&&surface?.kind!=='none';
      const encoded=valid?Math.round(clamp((height+256)/1024,0,1)*65535):0;
      this._bytes[i*4]=encoded>>8;this._bytes[i*4+1]=encoded&255;
      this._bytes[i*4+2]=surface?.kind==='water'?255:0;this._bytes[i*4+3]=valid?255:0;
    }
    if(p?.index===total)this._pending=null;
    if(changed){this._texture.update(this._bytes);this._uploads++;this._ready=true;}
    this._surfaceMs=performance.now()-started;
  }
  /** dt in seconds. Call once per rendered frame, after the active camera is updated. */
  update(dt,camera=this.scene.activeCamera){
    if(this.disposed||this.paused||!camera)return;
    dt=clamp(number(dt,0),0,0.1);
    this._surfaceLastQueries=0;this._surfaceMs=0;
    if(this.intensity<=0.0001&&this.targetIntensity<=0.0001){
      this.intensity=0;this._rain.setEnabled(false);this._splash.setEnabled(false);return;
    }
    const pos=camera.globalPosition||camera.position;
    if(!pos||![pos.x,pos.y,pos.z].every(Number.isFinite))return;
    if(this._lastPosition&&Vector3.DistanceSquared(pos,this._lastPosition)>this.span*this.span*0.25)this.reset();
    if(!this._lastPosition)this._lastPosition=pos.clone();else this._lastPosition.copyFrom(pos);
    if(this.intensity!==this.targetIntensity){
      this._elapsed+=dt;const t=this._duration?clamp(this._elapsed/this._duration,0,1):1;
      this.intensity=this._from+(this.targetIntensity-this._from)*(t*t*(3-2*t));
    }
    const enabled=this.intensity>0.0001;
    if(enabled)this._updateSurfaceCache(pos);
    this._rain.setEnabled(enabled&&this._ready);this._splash.setEnabled(enabled&&this._ready);
    if(!enabled)return;
    this.clock+=dt;
    this._windOffset.x+=this.wind.x*dt;this._windOffset.z+=this.wind.z*dt;
    const view=camera.getViewMatrix();this._right.set(view.m[0],view.m[4],view.m[8]).normalize();
    this._windVector.set(this.wind.x,this.wind.z);this._offsetVector.set(this._windOffset.x,this._windOffset.z);this._originVector.set(this._frontOrigin.x,this._frontOrigin.z);
    for(const m of this._materials){
      m.setVector3('cameraPos',pos);m.setVector3('cameraRight',this._right);
      m.setFloat('clock',this.clock);m.setFloat('span',this.span);m.setFloat('columnHeight',this.columnHeight);
      m.setVector2('wind',this._windVector);m.setVector2('windOffset',this._offsetVector);m.setFloat('speed',this.speed);m.setFloat('intensity',this.intensity);
      m.setFloat('opacity',this.opacity);m.setFloat('brightness',this.brightness);m.setColor3('tint',this.tint);
      m.setVector2('mapOrigin',this._originVector);m.setFloat('mapSpan',this._mapSpan);
      m.setFloat('gridSize',this._grid);m.setFloat('mapReady',this._ready?1:0);
    }
  }
  getStats(){return {quality:this.quality,drops:this._config.drops,splashes:this._config.splashes,drawCalls:!this.disposed&&this._rain.isEnabled()?2:0,surfaceReady:this._ready,surfaceProgress:this._pending?this._pending.index/(this._grid*this._grid):1,surfaceBudget:this.surfaceBudget,surfaceTimeBudgetMs:this.surfaceTimeBudgetMs,surfaceQueries:this._surfaceQueries,surfaceLastQueries:this._surfaceLastQueries,surfaceMs:this._surfaceMs,surfaceUploads:this._uploads,intensity:this.intensity,disposed:this.disposed};}
  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.scene.onDisposeObservable.remove(this._sceneObserver);
    this._rain.dispose();this._splash.dispose();this._materials.forEach(m=>m.dispose());this._texture.dispose();
    this._pending=null;this._bytes=null;this._scratch=null;this._known=null;this._knownScratch=null;this._order=null;
  }
}

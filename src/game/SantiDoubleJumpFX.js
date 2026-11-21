/**
 * Auralia — SantiDoubleJumpFX v2.1.
 * Impulso de aire: ondas concentricas, remolinos cortos y motas.
 * Babylon.js 9.32.0. trigger() recibe la posicion mundial de los pies.
 */
import {
  Color3, Color4, DynamicTexture, Effect, Mesh, MeshBuilder,
  ParticleSystem, ShaderMaterial, Texture, Vector3, VertexBuffer, VertexData
} from "@babylonjs/core";

const SHADER="auraliaDoubleJumpAirV21Waves";
const CACHE=new WeakMap();
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const ease=x=>1-(1-clamp(x,0,1))**3;

const VERTEX=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(){
  vUV=uv;
  gl_Position=worldViewProjection*vec4(position,1.0);
}`;
const FRAGMENT=`
precision highp float;
varying vec2 vUV;
uniform float kind;
uniform float clock;
uniform float phase;
uniform float opacity;
uniform vec3 tint;
float airHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float airNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(airHash(i),airHash(i+vec2(1.0,0.0)),f.x),
    mix(airHash(i+vec2(0.0,1.0)),airHash(i+vec2(1.0)),f.x),f.y);
}
vec2 airWave(float r,float delay,float strength){
  float age=clock-delay;
  float progress=clamp(age/0.38,0.0,1.0);
  float radius=0.045+0.86*(1.0-(1.0-progress)*(1.0-progress));
  float width=0.013+0.008*progress;
  float dist=r-radius;
  float crest=exp(-(dist*dist)/(width*width));
  float trailDistance=(dist+0.022)/(0.045+0.018*progress);
  float trail=exp(-trailDistance*trailDistance)*0.18;
  float envelope=smoothstep(0.0,0.025,age)*(1.0-smoothstep(0.14,0.38,age));
  return vec2((crest+trail)*envelope,crest*envelope)*strength;
}
void main(){
  float alpha=0.0;
  float pearl=0.0;
  if(kind<0.5){
    float r=length(vUV*2.0-1.0);
    vec2 waves=airWave(r,0.0,1.0)
      +airWave(r,0.055,0.80)+airWave(r,0.11,0.60);
    alpha=waves.x*opacity;
    pearl=waves.y*0.70;
  }else{
    float side=smoothstep(0.0,0.32,vUV.y)*(1.0-smoothstep(0.68,1.0,vUV.y));
    float taper=smoothstep(0.0,0.11,vUV.x)*(1.0-smoothstep(0.72,1.0,vUV.x));
    float grain=airNoise(vec2(vUV.x*8.0+phase-clock*2.6,vUV.y*3.0+clock));
    float split=0.42+0.58*smoothstep(0.15,0.78,grain);
    alpha=side*taper*split*opacity;
    pearl=side*(0.18+grain*0.24);
  }
  alpha=clamp(alpha,0.0,0.85);
  if(alpha<0.005)discard;
  vec3 color=mix(tint,vec3(0.96,1.0,0.98),clamp(pearl,0.0,0.75));
  gl_FragColor=vec4(color,alpha);
}`;

function registerShader(){
  Effect.ShadersStore[SHADER+"VertexShader"]=VERTEX;
  Effect.ShadersStore[SHADER+"FragmentShader"]=FRAGMENT;
}
function acquire(scene){
  let record=CACHE.get(scene);
  if(!record){
    const texture=new DynamicTexture("double-jump-motes-1k",{width:1024,height:1024},scene,true);
    const c=texture.getContext();
    c.clearRect(0,0,1024,1024);
    const g=c.createRadialGradient(512,512,0,512,512,490);
    g.addColorStop(0,"rgba(255,255,255,1)");
    g.addColorStop(.09,"rgba(255,255,255,.88)");
    g.addColorStop(.26,"rgba(255,255,255,.26)");
    g.addColorStop(.65,"rgba(255,255,255,0)");
    g.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=g;c.fillRect(0,0,1024,1024);
    texture.hasAlpha=true;
    texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;
    texture.update(false);
    record={texture,users:0};CACHE.set(scene,record);
  }
  record.users++;
  return record;
}

export class SantiDoubleJumpFX {
  constructor(scene,options={}){
    this.scene=scene;
    this.options={
      intensity:.9,scale:1,duration:.66,poolSize:3,segments:32,particles:22,
      color:[.63,.96,.84],...options
    };
    const o=this.options;
    o.intensity=clamp(Number(o.intensity)||0,0,1.5);
    o.scale=clamp(Number(o.scale)||1,.2,4);
    o.duration=clamp(Number(o.duration)||.66,.45,.95);
    o.poolSize=clamp(Math.floor(Number(o.poolSize)||3),1,3);
    o.segments=clamp(Math.floor(Number(o.segments)||32),16,40);
    o.particles=clamp(Math.floor(Number(o.particles)||22),8,24);
    if(!Array.isArray(o.color)||o.color.length!==3||!o.color.every(Number.isFinite))
      throw new Error("color debe ser un arreglo RGB de tres numeros.");
    o.color=o.color.map(x=>clamp(x,0,1));
    this._disposed=false;
    this._timeScale=1;
    this._serial=0;
    this._shared=acquire(scene);
    registerShader();
    this._slots=Array.from({length:o.poolSize},(_,i)=>this._createSlot(i));
    this._observer=scene.onDisposeObservable.addOnce(()=>this.dispose());
  }

  _material(name,kind,phase){
    const m=new ShaderMaterial(name,this.scene,{vertex:SHADER,fragment:SHADER},{
      attributes:["position","uv"],
      uniforms:["worldViewProjection","kind","clock","phase","opacity","tint"],
      needAlphaBlending:true
    });
    m.backFaceCulling=false;
    m.disableDepthWrite=true;
    m.setFloat("kind",kind);m.setFloat("clock",0);
    m.setFloat("phase",phase);m.setFloat("opacity",0);
    m.setColor3("tint",new Color3(...this.options.color));
    return m;
  }

  _createSlot(index){
    const phase=index*1.73;
    const ring=MeshBuilder.CreatePlane("double-jump-ring-"+index,{size:2},this.scene);
    ring.rotation.x=Math.PI/2;
    ring.isPickable=false;ring.alwaysSelectAsActiveMesh=true;
    const ringMaterial=this._material("double-jump-ring-material-"+index,0,phase);
    ring.material=ringMaterial;ring.setEnabled(false);

    const wind=new Mesh("double-jump-wind-"+index,this.scene);
    wind.isPickable=false;wind.alwaysSelectAsActiveMesh=true;
    const n=this.options.segments, vertices=(n+1)*2*3;
    const positions=new Float32Array(vertices*3);
    const uv=new Float32Array(vertices*2);
    const indices=[];
    for(let ribbon=0;ribbon<3;ribbon++){
      for(let i=0;i<=n;i++){
        const b=ribbon*(n+1)*2+i*2;
        uv[b*2]=i/n;uv[b*2+1]=0;
        uv[(b+1)*2]=i/n;uv[(b+1)*2+1]=1;
        if(i<n)indices.push(b,b+2,b+1,b+1,b+2,b+3);
      }
    }
    const data=new VertexData();
    data.positions=positions;data.uvs=uv;data.indices=indices;
    data.applyToMesh(wind,true);
    const windMaterial=this._material("double-jump-wind-material-"+index,1,phase);
    wind.material=windMaterial;wind.setEnabled(false);

    const slot={index,age:0,serial:0,active:false,origin:new Vector3(),dx:0,dz:1,
      ring,wind,ringMaterial,windMaterial,positions,phase,particles:null};
    const ps=new ParticleSystem("double-jump-motes-"+index,24,this.scene);
    ps.particleTexture=this._shared.texture;
    ps.emitter=slot.origin;
    ps.isLocal=false;
    ps.emitRate=0;ps.manualEmitCount=0;ps.disposeOnStop=false;
    ps.updateSpeed=1/60;
    ps.minLifeTime=.24*this.options.duration/.66;
    ps.maxLifeTime=.52*this.options.duration/.66;
    ps.minSize=.025*this.options.scale;ps.maxSize=.070*this.options.scale;
    ps.minScaleX=.6;ps.maxScaleX=1;
    ps.minScaleY=1;ps.maxScaleY=1.7;
    ps.minEmitPower=ps.maxEmitPower=1;
    ps.minAngularSpeed=-1.3;ps.maxAngularSpeed=1.3;
    ps.minInitialRotation=0;ps.maxInitialRotation=TAU;
    ps.gravity=new Vector3(0,-.32*this.options.scale,0);
    ps.blendMode=ParticleSystem.BLENDMODE_ADD;
    ps.renderingGroupId=0;
    ps.startPositionFunction=(_m,out)=>{
      const a=Math.random()*TAU,r=(.08+Math.random()*.15)*this.options.scale;
      out.copyFromFloats(slot.origin.x+Math.cos(a)*r,
        slot.origin.y-.025+Math.random()*.10,slot.origin.z+Math.sin(a)*r);
    };
    ps.startDirectionFunction=(_m,out)=>{
      const a=Math.random()*TAU,v=(.25+Math.random()*.75)*this.options.scale;
      out.copyFromFloats(Math.cos(a)*v-slot.dx*.12,
        (-.15-Math.random()*.35)*this.options.scale,Math.sin(a)*v-slot.dz*.12);
    };
    slot.particles=ps;
    return slot;
  }

  /** Compilar durante la carga evita compilar los dos shaders en el primer salto. */
  async prepare(){
    if(this._disposed)return;
    await Promise.all(this._slots.flatMap(s=>[
      s.ringMaterial.forceCompilationAsync(s.ring),
      s.windMaterial.forceCompilationAsync(s.wind)
    ]));
  }

  /** Llamar una vez por evento doubleJumpStarted, no mientras Espacio este sostenido. */
  trigger(feetWorld,direction){
    if(this._disposed||this.options.intensity<=0||
      !feetWorld||!Number.isFinite(feetWorld.x+feetWorld.y+feetWorld.z))return false;
    let slot=this._slots.find(s=>!s.active);
    if(!slot)slot=this._slots.reduce((old,s)=>s.serial<old.serial?s:old);
    this._stopSlot(slot);
    slot.origin.copyFrom(feetWorld);
    const dx=Number(direction?.x)||0,dz=Number(direction?.z)||0,length=Math.hypot(dx,dz);
    slot.dx=length>1e-5?dx/length:0;slot.dz=length>1e-5?dz/length:1;
    slot.age=0;slot.phase=this._serial*.91+slot.index*.73;
    slot.serial=++this._serial;slot.active=true;
    slot.ring.position.copyFromFloats(feetWorld.x,feetWorld.y-.055,feetWorld.z);
    slot.wind.position.copyFrom(slot.origin);
    slot.ringMaterial.setFloat("phase",slot.phase);
    slot.windMaterial.setFloat("phase",slot.phase);
    slot.ring.setEnabled(true);slot.wind.setEnabled(true);
    const c=this.options.color,alpha=clamp(.48*this.options.intensity,0,.65);
    slot.particles.color1=new Color4(.90,.99,.95,alpha);
    slot.particles.color2=new Color4(c[0],c[1],c[2],alpha*.65);
    slot.particles.colorDead=new Color4(c[0],c[1],c[2],0);
    slot.particles.start();
    slot.particles.manualEmitCount=Math.round(this.options.particles*
      (.72+.28*clamp(this.options.intensity,0,1)));
    this._animate(slot);
    return true;
  }

  _animate(slot){
    const o=this.options,life=clamp(slot.age/o.duration,0,1),t=life*.66;
    const radius=1.70*o.scale;
    slot.ring.scaling.copyFromFloats(radius,radius,1);
    slot.ringMaterial.setFloat("clock",t);
    slot.ringMaterial.setFloat("opacity",.74*o.intensity);
    slot.windMaterial.setFloat("clock",t);
    slot.windMaterial.setFloat("opacity",.48*o.intensity*smooth(0,.045,t)*(1-smooth(.17,.54,t)));
    const n=o.segments,positions=slot.positions;
    for(let ribbon=0;ribbon<3;ribbon++){
      for(let i=0;i<=n;i++){
        const u=i/n,taper=Math.sin(Math.PI*u);
        const angle=slot.phase+ribbon*TAU/3+u*TAU*.74+life*3.1;
        const rr=(.17+.52*ease(life))*(.72+.28*taper)+.10*u;
        const height=-.075+u*(.72-.13*life)+.12*Math.sin(Math.PI*life)-.18*life;
        const width=(.011+.043*Math.pow(Math.max(0,taper),1.2))*(1-.32*life);
        const x=Math.cos(angle)*rr-slot.dx*life*.26;
        const z=Math.sin(angle)*rr-slot.dz*life*.26;
        for(let side=0;side<2;side++){
          const sign=side===0?-1:1;
          const base=(ribbon*(n+1)*2+i*2+side)*3;
          positions[base]=(x+Math.cos(angle)*width*sign*.7)*o.scale;
          positions[base+1]=(height+width*sign*.58)*o.scale;
          positions[base+2]=(z+Math.sin(angle)*width*sign*.7)*o.scale;
        }
      }
    }
    slot.wind.updateVerticesData(VertexBuffer.PositionKind,positions,false,false);
    if(t>.50)slot.ring.setEnabled(false);
    if(t>.55)slot.wind.setEnabled(false);
  }

  /** dt en segundos. El renderer de Babylon actualiza las motas por su cuenta. */
  update(dt){
    if(this._disposed)return;
    const step=clamp(Number(dt)||0,0,.12)*this._timeScale;
    for(const slot of this._slots)if(slot.active){
      slot.age+=step;
      if(slot.age>=this.options.duration)this._stopSlot(slot);
      else this._animate(slot);
    }
  }

  _stopSlot(slot){
    slot.active=false;
    slot.ring.setEnabled(false);slot.wind.setEnabled(false);
    slot.particles.manualEmitCount=0;slot.particles.stop();slot.particles.reset();
  }

  setIntensity(value){this.options.intensity=clamp(Number(value)||0,0,1.5);}
  setTimeScale(value){
    this._timeScale=clamp(Number(value)||0,0,2);
    for(const slot of this._slots)slot.particles.updateSpeed=this._timeScale/60;
  }
  reset(){if(!this._disposed)for(const slot of this._slots)this._stopSlot(slot);}
  getStats(){
    return {
      activeBursts:this._disposed?0:this._slots.filter(s=>s.active).length,
      particles:this._disposed?0:this._slots.reduce((n,s)=>n+s.particles.getActiveCount(),0),
      maxParticles:this.options.poolSize*24,
      maxDrawCalls:this.options.poolSize*3
    };
  }
  exportMaskDataURL(){
    if(this._disposed)throw new Error("El FX ya fue liberado.");
    return this._shared.texture.getContext().canvas.toDataURL("image/png");
  }
  dispose(){
    if(this._disposed)return;
    this.reset();this._disposed=true;
    this.scene.onDisposeObservable.remove(this._observer);
    for(const s of this._slots){
      s.particles.dispose(false);s.ring.dispose();s.wind.dispose();
      s.ringMaterial.dispose();s.windMaterial.dispose();
    }
    this._shared.users--;
    if(this._shared.users===0){this._shared.texture.dispose();CACHE.delete(this.scene);}
  }
}

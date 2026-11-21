/**
 * Auralia — SantiSprintDust v1.
 * Babylon.js 9.32.0. Un atlas procedural de 1K, dos emisores y 72 particulas.
 * position es la posicion MUNDIAL de los pies; dt se expresa en segundos.
 */
import { ParticleSystem, DynamicTexture, Texture, Color4, Vector3 } from "@babylonjs/core";

const SHARED_TEXTURES = new WeakMap();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t*t*(3-2*t); };
const SURFACES = Object.freeze({
  dirt:  { amount: 1,    alpha: 1,    color: [.69,.59,.46] },
  soil:  { amount: 1,    alpha: 1,    color: [.69,.59,.46] },
  grass: { amount: .45,  alpha: .62,  color: [.63,.58,.43] },
  sand:  { amount: 1.15, alpha: 1.05, color: [.82,.75,.60] },
  stone: { amount: .14,  alpha: .40,  color: [.65,.63,.56] },
  rock:  { amount: .14,  alpha: .40,  color: [.65,.63,.56] },
  water: { amount: 0, alpha: 0, color: [0,0,0] },
  wood:  { amount: 0, alpha: 0, color: [0,0,0] },
  paved: { amount: 0, alpha: 0, color: [0,0,0] },
  snow:  { amount: 0, alpha: 0, color: [0,0,0] },
  metal: { amount: 0, alpha: 0, color: [0,0,0] },
  lava:  { amount: 0, alpha: 0, color: [0,0,0] }
});

function buildMask(scene) {
  const texture = new DynamicTexture("santi-sprint-dust-1k", {width:1024,height:1024}, scene, true);
  texture.hasAlpha = true;
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const small = document.createElement("canvas");
  small.width = small.height = 256;
  const ctx = small.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear la textura de polvo.");
  const data = ctx.createImageData(256,256);
  const hash = (x,y) => { const v=Math.sin(x*127.1+y*311.7+53.21)*43758.5453; return v-Math.floor(v); };
  const noise = (x,y) => {
    const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
    const sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
    return (hash(ix,iy)*(1-sx)+hash(ix+1,iy)*sx)*(1-sy)
      +(hash(ix,iy+1)*(1-sx)+hash(ix+1,iy+1)*sx)*sy;
  };
  for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
    const u=(x+.5)/128-1, v=(y+.5)/128-1;
    const n=.57*noise(u*3.1+15,v*3.1+15)+.28*noise(u*6.4+7,v*6.4+7)+.15*noise(u*13.7+21,v*13.7+21);
    const warpedU=u+.11*(noise(u*4+33,v*4+33)-.5);
    const warpedV=v+.10*(noise(u*4+51,v*4+51)-.5);
    const radius=Math.hypot(warpedU/.94,warpedV/.81);
    const edge=1-smooth(.40,.98,radius);
    const density=clamp((n-.19)/.66,0,1)*edge*edge;
    const i=(y*256+x)*4;
    data.data[i]=data.data[i+1]=data.data[i+2]=255;
    data.data[i+3]=Math.round(215*density);
  }
  ctx.putImageData(data,0,0);
  const target=texture.getContext();
  target.clearRect(0,0,1024,1024);
  target.imageSmoothingEnabled=true;
  target.drawImage(small,0,0,1024,1024);
  texture.update(false);
  return texture;
}

function acquireTexture(scene) {
  let record=SHARED_TEXTURES.get(scene);
  if (!record) { record={texture:buildMask(scene),users:0}; SHARED_TEXTURES.set(scene,record); }
  record.users++;
  return record;
}

/** Polvo de sprint. No modifica el avatar, la animacion ni el movimiento. */
export class SantiSprintDust {
  constructor(scene, options={}) {
    this.scene=scene;
    this.options={
      minSpeed:22, stopSpeed:20.5, stride:3.1, maxBurstsPerSecond:9,
      intensity:1, scale:1, footHalfWidth:.16, groundOffset:.08,
      maxGroundGap:.40, capacity:72, sampleGround:null, ...options
    };
    if (!Number.isFinite(this.options.minSpeed) || this.options.minSpeed<=0)
      throw new Error("minSpeed debe ser mayor que cero.");
    this.options.stopSpeed=clamp(this.options.stopSpeed,0,this.options.minSpeed);
    this.options.stride=Math.max(.1,this.options.stride);
    this.options.maxBurstsPerSecond=clamp(this.options.maxBurstsPerSecond,1,12);
    this.options.intensity=clamp(this.options.intensity,0,3);
    this.options.scale=clamp(this.options.scale,.1,5);
    this.options.capacity=clamp(Math.floor(this.options.capacity/2)*2,16,128);
    this._shared=acquireTexture(scene);
    this._previous=new Vector3();
    this._havePrevious=false;
    this._active=false;
    this._distance=0;
    this._sinceBurst=1;
    this._idle=0;
    this._side=0;
    this._carry=0;
    this._disposed=false;
    this._slots=[this._makeSlot(0),this._makeSlot(1)];
    this._sceneObserver=scene.onDisposeObservable.addOnce(()=>this.dispose());
  }

  _makeSlot(index) {
    const scale=this.options.scale;
    const slot={point:new Vector3(),dx:0,dz:1,started:false,system:null};
    const ps=new ParticleSystem("santi-sprint-dust-"+index,this.options.capacity/2,this.scene);
    slot.system=ps;
    ps.particleTexture=this._shared.texture;
    ps.emitter=slot.point;
    ps.isLocal=false;
    ps.emitRate=0;
    ps.manualEmitCount=0;
    ps.updateSpeed=1/60;
    ps.minLifeTime=.28;
    ps.maxLifeTime=.55;
    ps.minSize=.20*scale;
    ps.maxSize=.34*scale;
    ps.minScaleX=.95; ps.maxScaleX=1.35;
    ps.minScaleY=.60; ps.maxScaleY=.90;
    ps.minEmitPower=ps.maxEmitPower=1;
    ps.minAngularSpeed=-.55; ps.maxAngularSpeed=.55;
    ps.minInitialRotation=0; ps.maxInitialRotation=Math.PI*2;
    ps.gravity=new Vector3(0,-.10*scale,0);
    ps.blendMode=ParticleSystem.BLENDMODE_STANDARD;
    ps.billboardMode=ParticleSystem.BILLBOARDMODE_ALL;
    ps.forceDepthWrite=false;
    ps.renderingGroupId=0;
    ps.addSizeGradient(0,.35);
    ps.addSizeGradient(.38,1.35);
    ps.addSizeGradient(1,2);
    ps.startPositionFunction=(_matrix,out)=>{
      out.copyFromFloats(
        slot.point.x+(Math.random()-.5)*.12*scale,
        slot.point.y+Math.random()*.025*scale,
        slot.point.z+(Math.random()-.5)*.12*scale
      );
    };
    ps.startDirectionFunction=(_matrix,out)=>{
      const backward=.25+Math.random()*.32;
      out.copyFromFloats(
        (-slot.dx*backward+(Math.random()-.5)*.45)*scale,
        (.18+Math.random()*.25)*scale,
        (-slot.dz*backward+(Math.random()-.5)*.45)*scale
      );
    };
    return slot;
  }

  /**
   * Devuelve la cantidad de particulas solicitadas este frame.
   * No llama a scene.render(). Llamar una sola vez por frame, tras mover a Santi.
   */
  update(frame) {
    if (this._disposed) return 0;
    const p=frame.position;
    const rawDt=Number(frame.dt);
    if (!p || !Number.isFinite(p.x+p.y+p.z) || !Number.isFinite(rawDt) || rawDt<=0)
      return 0;
    if (!this._havePrevious) {
      this._previous.copyFromFloats(p.x,p.y,p.z); this._havePrevious=true; return 0;
    }
    const dx=p.x-this._previous.x, dz=p.z-this._previous.z;
    const distance=Math.hypot(dx,dz);
    this._previous.copyFromFloats(p.x,p.y,p.z);
    if (rawDt>.25 || distance>6) { this.reset(false); return 0; }
    const dt=Math.min(rawDt,.1);
    this._sinceBurst+=dt;
    this._idle+=dt;
    const speed=distance/rawDt;
    const threshold=this._active?this.options.stopSpeed:this.options.minSpeed;
    const allowed=frame.grounded===true && frame.sprinting!==false &&
      frame.enabled!==false && this.options.intensity>0 &&
      distance>.0001 && speed>=threshold;
    if (!allowed) {
      this._active=false; this._distance=0; this._carry=0;
      if (this._idle>.55) this._stopEmptySystems();
      return 0;
    }
    const justActivated=!this._active;
    this._active=true;
    this._distance+=distance;
    if (justActivated) this._distance=this.options.stride;
    if (this._distance<this.options.stride ||
        this._sinceBurst<1/this.options.maxBurstsPerSecond) return 0;
    // No se recuperan pasos perdidos en frames lentos: evita grandes bocanadas.
    this._distance%=this.options.stride;
    this._sinceBurst%=1/this.options.maxBurstsPerSecond;
    const emitted=this._burst(p,dx/distance,dz/distance,speed,frame);
    if (emitted>0) this._idle=0;
    else if (this._idle>.55) this._stopEmptySystems();
    return emitted;
  }

  _burst(p,dx,dz,speed,frame) {
    const slot=this._slots[this._side];
    const sign=this._side===0?-1:1;
    this._side=1-this._side;
    const scale=this.options.scale;
    const x=p.x+dz*sign*this.options.footHalfWidth*scale-dx*.12*scale;
    const z=p.z-dx*sign*this.options.footHalfWidth*scale-dz*.12*scale;
    const contact=this.options.sampleGround
      ?this.options.sampleGround(x,z,p.y)
      :{height:p.y,surface:frame.surface??"dirt",wetness:frame.wetness??0};
    if (!contact || !Number.isFinite(contact.height) ||
      Math.abs(contact.height-p.y)>this.options.maxGroundGap*scale ||
      (contact.normalY!==undefined && contact.normalY<.42)) return 0;
    const surface=SURFACES[String(contact.surface??frame.surface??"dirt").toLowerCase()];
    if (!surface || surface.amount===0) { this._carry=0; return 0; }
    const wetness=clamp(Math.max(Number(contact.wetness)||0,Number(frame.wetness)||0),0,1);
    if (wetness>=.7) { this._carry=0; return 0; }
    const amount=surface.amount*(1-wetness)*(1-wetness)*this.options.intensity;
    const speedFactor=clamp((speed-this.options.stopSpeed)/9,0,1);
    this._carry+=(3+speedFactor*2)*amount;
    const count=Math.min(10,Math.floor(this._carry));
    if (count<1) return 0;
    this._carry-=count;
    slot.point.copyFromFloats(x,contact.height+this.options.groundOffset*scale,z);
    slot.dx=dx;slot.dz=dz;
    const rgb=surface.color;
    const alpha=clamp(.32*surface.alpha*(1-wetness)*this.options.intensity,.01,.68);
    const ps=slot.system;
    ps.color1=new Color4(rgb[0],rgb[1],rgb[2],alpha);
    ps.color2=new Color4(rgb[0]*.88,rgb[1]*.88,rgb[2]*.88,alpha*.7);
    ps.colorDead=new Color4(rgb[0],rgb[1],rgb[2],0);
    if (!slot.started) { ps.start(); slot.started=true; }
    ps.manualEmitCount=Math.min(this.options.capacity/2,
      Math.max(0,ps.manualEmitCount)+count);
    return count;
  }

  _stopEmptySystems() {
    for (const slot of this._slots) if (slot.started) {
      slot.system.manualEmitCount=0;
      slot.system.stop();
      slot.started=false;
    }
  }

  /** Llamar al teletransportar, cambiar de zona o pausar. No emite al reiniciar. */
  reset(forgetPosition=true) {
    if (this._disposed) return;
    for (const slot of this._slots) {
      slot.system.manualEmitCount=0;
      slot.system.stop();
      slot.system.reset();
      slot.started=false;
    }
    this._active=false;this._distance=0;this._sinceBurst=1;this._idle=0;this._carry=0;
    if (forgetPosition) this._havePrevious=false;
  }

  setIntensity(value) { this.options.intensity=clamp(Number(value)||0,0,3); }

  getActiveCount() {
    return this._disposed?0:this._slots.reduce((n,s)=>n+s.system.getActiveCount(),0);
  }

  /** Exporta la mascara de 1K si se prefiere servir un PNG precomputado. */
  exportMaskDataURL() {
    if (this._disposed) throw new Error("El FX ya fue liberado.");
    return this._shared.texture.getContext().canvas.toDataURL("image/png");
  }

  dispose() {
    if (this._disposed) return;
    this._disposed=true;
    this.scene.onDisposeObservable.remove(this._sceneObserver);
    for (const slot of this._slots) slot.system.dispose(false);
    this._shared.users--;
    if (this._shared.users===0) {
      this._shared.texture.dispose();
      SHARED_TEXTURES.delete(this.scene);
    }
  }
}

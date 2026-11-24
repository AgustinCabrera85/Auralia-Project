/**
 * Auralia — GroundSlamFX v1.
 * Onda de presion terrestre, polvo y terrones reutilizables.
 * Babylon.js 9.32.0. Posicion de impacto en coordenadas mundiales.
 */
import {
  Color3, DynamicTexture, Effect, Mesh, ShaderMaterial, StandardMaterial,
  Texture, Vector3, VertexBuffer, VertexData
} from "@babylonjs/core";

const PREFIX="auraliaGroundSlamV1";
const CACHE=new WeakMap();
const TAU=Math.PI*2;
const LIFE=1.85;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const ease=v=>1-(1-clamp(v,0,1))**3;
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
function rgb(value,fallback){
  if(!Array.isArray(value)||value.length!==3||!value.every(Number.isFinite))return fallback.slice();
  return value.map(v=>clamp(v,0,1));
}
function random(s){let n=s.seed;n^=n<<13;n^=n>>>17;n^=n<<5;s.seed=n>>>0;return s.seed/4294967296;}

const RING_VERTEX=String.raw`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}
`;
const RING_FRAGMENT=String.raw`
precision highp float;
varying vec2 vUV;
uniform vec3 tint;
uniform float opacity;
uniform float clock;
void main(){
  float a=vUV.x*6.2831853;
  float breakup=0.76+0.14*sin(a*9.0+clock*2.0)+0.10*sin(a*17.0-1.7);
  float d=(vUV.y-0.74)/0.16;
  float crest=exp(-d*d)*0.50;
  float tail=smoothstep(0.0,0.22,vUV.y)*(1.0-smoothstep(0.45,0.86,vUV.y))*0.16;
  float alpha=clamp((crest+tail)*breakup*opacity,0.0,0.60);
  if(alpha<0.004)discard;
  gl_FragColor=vec4(tint,alpha);
}
`;
const DUST_VERTEX=String.raw`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 worldViewProjection;
varying vec2 vUV;
varying vec4 vColor;
void main(){vUV=uv;vColor=color;gl_Position=worldViewProjection*vec4(position,1.0);}
`;
const DUST_FRAGMENT=String.raw`
precision highp float;
varying vec2 vUV;
varying vec4 vColor;
uniform sampler2D dustMask;
void main(){
  float mask=texture2D(dustMask,vUV).a;
  float detail=texture2D(dustMask,vUV*0.78+vec2(0.08,0.12)).a;
  float alpha=mask*(0.70+detail*0.30)*vColor.a;
  if(alpha<0.004)discard;
  vec3 shade=vColor.rgb*mix(0.72,1.08,vUV.y);
  gl_FragColor=vec4(shade,alpha);
}
`;

function acquire(scene){
  let record=CACHE.get(scene);
  if(!record){
    const mask=new DynamicTexture("ground-slam-dust-1k",{width:1024,height:1024},scene,true);
    const c=mask.getContext();c.clearRect(0,0,1024,1024);
    const blob=(x,y,r,a)=>{
      const g=c.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,"rgba(255,255,255,"+a+")");
      g.addColorStop(.38,"rgba(255,255,255,"+(a*.74)+")");
      g.addColorStop(.76,"rgba(255,255,255,"+(a*.15)+")");
      g.addColorStop(1,"rgba(255,255,255,0)");
      c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
    };
    blob(512,514,350,.66);
    for(let i=0;i<19;i++){
      const a=i*2.399963,r=95+80*(.5+.5*Math.sin(i*7.1));
      const reach=120+105*(.5+.5*Math.cos(i*3.9));
      blob(512+Math.cos(a)*reach,510+Math.sin(a)*reach*.77,r,.38);
    }
    mask.hasAlpha=true;mask.wrapU=mask.wrapV=Texture.CLAMP_ADDRESSMODE;mask.update(false);
    const dirt=new StandardMaterial("ground-slam-earth",scene);
    dirt.diffuseColor=new Color3(1,1,1);dirt.specularColor=new Color3(0,0,0);
    record={mask,dirt,users:0};CACHE.set(scene,record);
  }
  record.users++;return record;
}
function meshData(name,scene,vertices,indices,withUV,withColor,withNormals){
  const mesh=new Mesh(name,scene),positions=new Float32Array(vertices*3);
  const uv=withUV?new Float32Array(vertices*2):null;
  const colors=withColor?new Float32Array(vertices*4):null;
  const normals=withNormals?new Float32Array(vertices*3):null;
  const data=new VertexData();data.positions=positions;data.indices=indices;
  if(uv)data.uvs=uv;if(colors)data.colors=colors;if(normals)data.normals=normals;
  data.applyToMesh(mesh,true);
  mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
  return {mesh,positions,uv,colors,normals};
}
function clodBase(){
  const p=[[0,.80,0],[0,-.60,0],[.80,.05,0],[-.65,.08,.05],[0,.05,.70],[.05,-.05,-.80]];
  const faces=[[0,4,2],[0,3,4],[0,5,3],[0,2,5],[1,2,4],[1,4,3],[1,3,5],[1,5,2]];
  const positions=[],normals=[],tones=[];
  for(let f=0;f<faces.length;f++){
    const [a,b,c]=faces[f].map(i=>p[i]);
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
    const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,L=Math.hypot(nx,ny,nz);
    for(const v of [a,b,c]){positions.push(...v);normals.push(nx/L,ny/L,nz/L);tones.push(.85+(f%3)*.10);}
  }
  return {positions,normals,tones};
}
const CLOD=clodBase();

export class GroundSlamFX{
  constructor(scene,options={}){
    this.scene=scene;
    this.options={
      intensity:clamp(finite(options.intensity,1),0,2),
      radius:clamp(finite(options.radius,3.4),.6,7),
      poolSize:clamp(Math.floor(finite(options.poolSize,2)),1,3),
      dustCount:clamp(Math.floor(finite(options.dustCount,48)),8,64),
      debrisCount:clamp(Math.floor(finite(options.debrisCount,22)),0,32),
      segments:clamp(Math.floor(finite(options.segments,64)),32,80),
      dustColor:rgb(options.dustColor,[.52,.43,.32]),
      earthColor:rgb(options.earthColor,[.34,.24,.15]),
      sampleHeight:typeof options.sampleHeight==="function"?options.sampleHeight:null
    };
    this._shared=acquire(scene);this._serial=0;this._disposed=false;this._timeScale=1;
    this._tmp=new Vector3();this._right=new Vector3();
    this._dustSort=(a,b)=>b.depth-a.depth;
    Effect.ShadersStore[PREFIX+"RingVertexShader"]=RING_VERTEX;
    Effect.ShadersStore[PREFIX+"RingFragmentShader"]=RING_FRAGMENT;
    Effect.ShadersStore[PREFIX+"DustVertexShader"]=DUST_VERTEX;
    Effect.ShadersStore[PREFIX+"DustFragmentShader"]=DUST_FRAGMENT;
    this._slots=Array.from({length:this.options.poolSize},(_,i)=>this._createSlot(i));
    this.meshes=this._slots.flatMap(s=>[s.ring.mesh,s.dust.mesh,s.debris.mesh]);
    this._observer=scene.onDisposeObservable.addOnce(()=>this.dispose());
  }
  _createSlot(index){
    const o=this.options,N=o.segments,rows=5,ringIndices=[];
    for(let i=0;i<N;i++)for(let j=0;j<rows-1;j++){
      const a=i*rows+j,b=(i+1)*rows+j;ringIndices.push(a,b,a+1,a+1,b,b+1);
    }
    const ring=meshData("ground-slam-wave-"+index,this.scene,(N+1)*rows,ringIndices,true,false,false);
    for(let i=0;i<=N;i++)for(let j=0;j<rows;j++){
      const v=i*rows+j;ring.uv[v*2]=i/N;ring.uv[v*2+1]=j/(rows-1);
    }
    ring.mesh.updateVerticesData(VertexBuffer.UVKind,ring.uv,false,false);
    const ringMaterial=new ShaderMaterial("ground-slam-wave-mat-"+index,this.scene,
      {vertex:PREFIX+"Ring",fragment:PREFIX+"Ring"},{
        attributes:["position","uv"],uniforms:["worldViewProjection","tint","opacity","clock"],needAlphaBlending:true
      });
    ringMaterial.backFaceCulling=false;ringMaterial.disableDepthWrite=true;
    ringMaterial.setFloat("opacity",0);ringMaterial.setFloat("clock",0);
    ringMaterial.setColor3("tint",new Color3(.65,.57,.45));ring.mesh.material=ringMaterial;

    const quadIndices=[];
    for(let i=0;i<o.dustCount;i++){const b=i*4;quadIndices.push(b,b+1,b+2,b,b+2,b+3);}
    const dust=meshData("ground-slam-dust-"+index,this.scene,o.dustCount*4,quadIndices,true,true,false);
    for(let i=0;i<o.dustCount;i++)dust.uv.set([0,0,1,0,1,1,0,1],i*8);
    dust.mesh.updateVerticesData(VertexBuffer.UVKind,dust.uv,false,false);
    const dustMaterial=new ShaderMaterial("ground-slam-dust-mat-"+index,this.scene,
      {vertex:PREFIX+"Dust",fragment:PREFIX+"Dust"},{
        attributes:["position","uv","color"],uniforms:["worldViewProjection"],samplers:["dustMask"],needAlphaBlending:true
      });
    dustMaterial.backFaceCulling=false;dustMaterial.disableDepthWrite=true;
    dustMaterial.setTexture("dustMask",this._shared.mask);dust.mesh.material=dustMaterial;
    dust.mesh.hasVertexAlpha=true;

    const dirtIndices=Array.from({length:o.debrisCount*24},(_,i)=>i);
    const debris=meshData("ground-slam-debris-"+index,this.scene,o.debrisCount*24,dirtIndices,false,true,true);
    debris.mesh.material=this._shared.dirt;debris.mesh.useVertexColors=true;
    const puffs=Array.from({length:o.dustCount},(_,i)=>({
      index:i,center:new Vector3(),angle:0,birth:0,life:0,size:0,alpha:0,
      radius:0,rise:0,drift:0,spin:0,depth:0,width:0,height:0,visible:false,tone:1
    }));
    const clods=Array.from({length:o.debrisCount},()=>({
      x:0,z:0,h:0,vx:0,vz:0,vy:0,size:0,spin:0,phase:0,bounces:0,rest:false,tone:1
    }));
    return {
      index,serial:0,seed:1,active:false,age:0,gain:1,radius:o.radius,
      origin:new Vector3(),normal:new Vector3(0,1,0),u:new Vector3(1,0,0),v:new Vector3(0,0,1),
      dustColor:o.dustColor.slice(),earthColor:o.earthColor.slice(),
      ring,ringMaterial,dust,dustMaterial,debris,puffs,order:puffs.slice(),clods,
      puffCount:0,clodCount:0
    };
  }
  async prepare(){
    if(this._disposed)return;
    const work=[];
    for(const s of this._slots){
      work.push(s.ringMaterial.forceCompilationAsync(s.ring.mesh),s.dustMaterial.forceCompilationAsync(s.dust.mesh));
      if(this.options.debrisCount)work.push(this._shared.dirt.forceCompilationAsync(s.debris.mesh));
    }
    await Promise.all(work);
  }
  /** Disparar una vez al tocar el suelo con el arma, punio o pie. */
  trigger(worldPoint,normal={x:0,y:1,z:0},options={}){
    if(this._disposed||!validPoint(worldPoint)||!validPoint(normal))return false;
    const L=Math.hypot(normal.x,normal.y,normal.z);if(L<1e-5)return false;
    const gain=clamp(finite(options.intensity,this.options.intensity),0,2);if(gain<=0)return false;
    let s=this._slots.find(v=>!v.active);
    if(!s)s=this._slots.reduce((a,b)=>a.serial<b.serial?a:b);
    this._stop(s);s.active=true;s.age=0;s.serial=++this._serial;
    s.seed=((this._serial*2654435761)^0x59a719bf)>>>0;
    // Public API accepts plain {x,y,z}; Babylon copyFrom expects Vector3 internals.
    s.origin.copyFromFloats(worldPoint.x,worldPoint.y,worldPoint.z);s.normal.copyFromFloats(normal.x/L,normal.y/L,normal.z/L);
    if(s.normal.y<0)s.normal.scaleInPlace(-1);
    if(Math.abs(s.normal.y)<.05){this._stop(s);return false;}
    s.u.copyFromFloats(s.normal.y,-s.normal.x,0).normalize();
    s.v.copyFromFloats(-s.u.z*s.normal.y+s.u.y*s.normal.z,
      s.u.z*s.normal.x-s.u.x*s.normal.z,s.u.x*s.normal.y-s.u.y*s.normal.x).normalize();
    s.gain=gain;s.radius=clamp(finite(options.radius,this.options.radius),.6,7);
    s.sampleHeight=typeof options.sampleHeight==="function"?options.sampleHeight:this.options.sampleHeight;
    const brightness=clamp(finite(options.brightness,1),.15,1);
    const dustColor=rgb(options.dustColor,this.options.dustColor);
    s.dustColor=dustColor.map(c=>c*brightness);s.earthColor=rgb(options.earthColor,this.options.earthColor);
    s.puffCount=Math.min(this.options.dustCount,Math.round(this.options.dustCount*(.62+.38*Math.min(gain,1))));
    s.clodCount=Math.min(this.options.debrisCount,Math.round(this.options.debrisCount*(.55+.45*Math.min(gain,1))));
    const power=Math.sqrt(gain),front=Math.floor(s.puffCount*.76);
    for(let i=0;i<s.puffs.length;i++){
      const p=s.puffs[i],outer=i<front;
      p.angle=i/Math.max(1,front)*TAU+(random(s)-.5)*.18;
      p.birth=random(s)*.11;p.life=.98+random(s)*.56;
      p.radius=outer?s.radius*(.84+random(s)*.16):s.radius*(.08+random(s)*.30);
      p.size=(outer?.40:.62)+random(s)*.34;p.size*=.78+.22*power;
      p.rise=outer?.12+random(s)*.22:.28+random(s)*.45;
      p.alpha=(outer?.31:.24)*(0.82+random(s)*.33)*Math.min(gain,1.5);
      p.drift=(random(s)-.5)*.22;p.spin=random(s)*TAU;p.tone=.88+random(s)*.24;p.visible=false;
    }
    for(const p of s.clods){
      const angle=random(s)*TAU,speed=(1.5+random(s)*2.1)*power*Math.sqrt(s.radius/3.4);
      p.x=Math.cos(angle)*.13;p.z=Math.sin(angle)*.13;p.h=.015;
      p.vx=Math.cos(angle)*speed;p.vz=Math.sin(angle)*speed;
      p.vy=(2.2+random(s)*2.4)*power;p.size=.045+random(s)*.075;
      p.spin=(random(s)-.5)*16;p.phase=random(s)*TAU;p.bounces=0;p.rest=false;p.tone=.75+random(s)*.40;
    }
    for(let i=0;i<this.options.debrisCount;i++)for(let j=0;j<24;j++){
      const b=(i*24+j)*4,t=s.clods[i].tone*CLOD.tones[j];
      s.debris.colors[b]=s.earthColor[0]*t;s.debris.colors[b+1]=s.earthColor[1]*t;
      s.debris.colors[b+2]=s.earthColor[2]*t;s.debris.colors[b+3]=1;
    }
    s.debris.mesh.updateVerticesData(VertexBuffer.ColorKind,s.debris.colors,false,false);
    s.ringMaterial.setColor3("tint",new Color3(...dustColor.map(c=>clamp(c*.62+.30,0,1)*brightness)));
    s.ring.mesh.setEnabled(true);s.dust.mesh.setEnabled(true);s.debris.mesh.setEnabled(s.clodCount>0);
    this._draw(s);return true;
  }
  _ground(s,x,z,out,offset=0){
    const n=s.normal;
    out.copyFromFloats(s.origin.x+s.u.x*x+s.v.x*z,
      s.origin.y+s.u.y*x+s.v.y*z,s.origin.z+s.u.z*x+s.v.z*z);
    const sample=s.sampleHeight;
    if(sample){const y=sample(out.x,out.z);if(Number.isFinite(y))out.y=y;}
    out.x+=n.x*offset;out.y+=n.y*offset;out.z+=n.z*offset;
    return out;
  }
  _physics(s,dt){
    const steps=Math.max(1,Math.ceil(dt/(1/90))),step=dt/steps,n=s.normal;
    for(let k=0;k<steps;k++)for(let i=0;i<s.clodCount;i++){
      const p=s.clods[i];
      p.x+=p.vx*step;p.z+=p.vz*step;
      // Keep fragments on the support footprint checked by the game at impact.
      const reach=Math.hypot(p.x,p.z),limit=s.radius*.9;
      if(reach>limit){p.x*=limit/reach;p.z*=limit/reach;p.vx=0;p.vz=0;}
      if(!p.rest){p.h+=p.vy*step-4.905*step*step;p.vy-=9.81*step;}
      let floor=0;
      if(s.sampleHeight){
        this._ground(s,p.x,p.z,this._tmp);
        const baseY=s.origin.y+s.u.y*p.x+s.v.y*p.z;
        floor=(this._tmp.y-baseY)/n.y;
      }
      if(p.rest){p.h=floor;p.vx*=Math.exp(-8*step);p.vz*=Math.exp(-8*step);}
      else if(p.h<floor&&p.vy<0){
        p.h=floor;p.bounces++;p.vx*=.57;p.vz*=.57;
        if(p.bounces>=2||Math.abs(p.vy)<.65){p.vy=0;p.rest=true;}
        else p.vy=-p.vy*.23;
      }
    }
  }
  _draw(s){
    const t=s.age,n=s.normal,N=this.options.segments,rows=5;
    const ringT=clamp(t/.55,0,1),radius=.10+(s.radius-.10)*(1-(1-ringT)**2);
    const width=Math.min(s.radius*.25,.12+t*.30);
    if(t<.56){
      for(let i=0;i<=N;i++){
        const a=i/N*TAU;
        for(let j=0;j<rows;j++){
          const r=Math.max(.015,radius-width*(1-j/(rows-1)));
          this._ground(s,Math.cos(a)*r,Math.sin(a)*r,this._tmp,.022);
          const b=(i*rows+j)*3;s.ring.positions[b]=this._tmp.x;
          s.ring.positions[b+1]=this._tmp.y;s.ring.positions[b+2]=this._tmp.z;
        }
      }
      s.ring.mesh.updateVerticesData(VertexBuffer.PositionKind,s.ring.positions,false,false);
      s.ringMaterial.setFloat("clock",t);
      s.ringMaterial.setFloat("opacity",.72*Math.min(s.gain,1.6)*smooth(0,.025,t)*(1-smooth(.23,.55,t)));
    }else s.ring.mesh.setEnabled(false);

    const cam=this.scene.activeCamera;
    const eye=cam&&(cam.globalPosition||cam.position);
    const ex=eye?eye.x:s.origin.x,ey=eye?eye.y:s.origin.y+3,ez=eye?eye.z:s.origin.z-6;
    const vx=ex-s.origin.x,vy=ey-s.origin.y,vz=ez-s.origin.z;
    this._right.copyFromFloats(n.y*vz-n.z*vy,n.z*vx-n.x*vz,n.x*vy-n.y*vx);
    if(this._right.lengthSquared()<1e-8)this._right.copyFrom(s.u);else this._right.normalize();
    for(let i=0;i<s.puffs.length;i++){
      const p=s.puffs[i],a=t-p.birth,life=a/p.life;
      p.visible=i<s.puffCount&&a>0&&life<1;
      const r=.12+p.radius*ease(a/.82),angle=p.angle+p.drift*life;
      this._ground(s,Math.cos(angle)*r,Math.sin(angle)*r,p.center);
      p.width=p.size*(.48+ease(life)*1.45);p.height=p.width*.74;
      const h=p.height*.50+.025+p.rise*ease(life);
      p.center.x+=n.x*h;p.center.y+=n.y*h;p.center.z+=n.z*h;
      p.depth=(p.center.x-ex)**2+(p.center.y-ey)**2+(p.center.z-ez)**2;
      p.opacity=p.visible?p.alpha*smooth(0,.07,a)*(1-smooth(.32,1,life)):0;
    }
    s.order.sort(this._dustSort);
    for(let k=0;k<s.order.length;k++){
      const p=s.order[k],w=p.width*.5,h=p.height*.5;
      for(let j=0;j<4;j++){
        const xx=(j===0||j===3?-1:1)*w,yy=(j<2?-1:1)*h;
        const v=k*4+j,b=v*3,c=v*4;
        s.dust.positions[b]=p.center.x+this._right.x*xx+n.x*yy;
        s.dust.positions[b+1]=p.center.y+this._right.y*xx+n.y*yy;
        s.dust.positions[b+2]=p.center.z+this._right.z*xx+n.z*yy;
        s.dust.colors[c]=s.dustColor[0]*p.tone;s.dust.colors[c+1]=s.dustColor[1]*p.tone;
        s.dust.colors[c+2]=s.dustColor[2]*p.tone;s.dust.colors[c+3]=p.opacity;
      }
    }
    s.dust.mesh.updateVerticesData(VertexBuffer.PositionKind,s.dust.positions,false,false);
    s.dust.mesh.updateVerticesData(VertexBuffer.ColorKind,s.dust.colors,false,false);
    if(t>1.68)s.dust.mesh.setEnabled(false);

    const shrink=1-smooth(1.04,1.76,t);
    for(let i=0;i<s.clods.length;i++){
      const p=s.clods[i],size=i<s.clodCount?p.size*shrink:0;
      const ax=p.phase+p.spin*Math.min(t,.95),ay=p.phase*.63+p.spin*Math.min(t,.95)*.73;
      const cx=Math.cos(ax),sx=Math.sin(ax),cy=Math.cos(ay),sy=Math.sin(ay);
      const floorX=s.origin.x+s.u.x*p.x+s.v.x*p.z;
      const floorY=s.origin.y+s.u.y*p.x+s.v.y*p.z;
      const floorZ=s.origin.z+s.u.z*p.x+s.v.z*p.z;
      const height=p.h+size*.83;
      for(let j=0;j<24;j++){
        const b=(i*24+j)*3,k=j*3;
        const bx=CLOD.positions[k],by=CLOD.positions[k+1],bz=CLOD.positions[k+2];
        const y=by*cx-bz*sx,z=by*sx+bz*cx,x2=bx*cy+z*sy,z2=-bx*sy+z*cy;
        s.debris.positions[b]=floorX+n.x*height+size*(s.u.x*x2+n.x*y+s.v.x*z2);
        s.debris.positions[b+1]=floorY+n.y*height+size*(s.u.y*x2+n.y*y+s.v.y*z2);
        s.debris.positions[b+2]=floorZ+n.z*height+size*(s.u.z*x2+n.z*y+s.v.z*z2);
        const nx=CLOD.normals[k],ny=CLOD.normals[k+1],nz=CLOD.normals[k+2];
        const ry=ny*cx-nz*sx,rz=ny*sx+nz*cx,rx2=nx*cy+rz*sy,rz2=-nx*sy+rz*cy;
        s.debris.normals[b]=s.u.x*rx2+n.x*ry+s.v.x*rz2;
        s.debris.normals[b+1]=s.u.y*rx2+n.y*ry+s.v.y*rz2;
        s.debris.normals[b+2]=s.u.z*rx2+n.z*ry+s.v.z*rz2;
      }
    }
    if(this.options.debrisCount){
      s.debris.mesh.updateVerticesData(VertexBuffer.PositionKind,s.debris.positions,false,false);
      s.debris.mesh.updateVerticesData(VertexBuffer.NormalKind,s.debris.normals,false,false);
    }
    if(t>1.77)s.debris.mesh.setEnabled(false);
  }
  update(dt){
    if(this._disposed)return;
    const delta=clamp(finite(dt,0),0,.10)*this._timeScale;
    if(delta<=0){for(const s of this._slots)if(s.active)this._draw(s);return;}
    for(const s of this._slots)if(s.active){
      const step=Math.min(delta,LIFE-s.age);this._physics(s,step);s.age+=step;
      if(s.age>=LIFE-1e-8)this._stop(s);else this._draw(s);
    }
  }
  _stop(s){s.active=false;s.sampleHeight=null;s.ring.mesh.setEnabled(false);s.dust.mesh.setEnabled(false);s.debris.mesh.setEnabled(false);}
  setIntensity(value){this.options.intensity=clamp(finite(value,1),0,2);}
  setTimeScale(value){this._timeScale=clamp(finite(value,1),0,2);}
  reset(){if(!this._disposed)for(const s of this._slots)this._stop(s);}
  getStats(){
    let active=0,puffs=0,clods=0;
    if(!this._disposed)for(const s of this._slots)if(s.active){
      active++;for(const p of s.puffs)if(p.visible)puffs++;
      if(s.debris.mesh.isEnabled())clods+=s.clodCount;
    }
    return {activeBursts:active,dustPuffs:puffs,debris:clods,
      maxDrawCalls:this.options.poolSize*3,maxDustPuffs:this.options.poolSize*this.options.dustCount,
      maxDebris:this.options.poolSize*this.options.debrisCount};
  }
  exportMaskDataURL(){
    if(this._disposed)throw new Error("El FX ya fue liberado.");
    return this._shared.mask.getContext().canvas.toDataURL("image/png");
  }
  dispose(){
    if(this._disposed)return;this.reset();this._disposed=true;
    this.scene.onDisposeObservable.remove(this._observer);
    for(const s of this._slots){
      s.ring.mesh.dispose();s.dust.mesh.dispose();s.debris.mesh.dispose();
      s.ringMaterial.dispose();s.dustMaterial.dispose();
    }
    if(--this._shared.users===0){
      this._shared.mask.dispose();this._shared.dirt.dispose();CACHE.delete(this.scene);
    }
  }
}

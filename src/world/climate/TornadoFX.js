/** Auralia TornadoFX 7.0. Curved 3D funnel, optical cloud and stable camera-relative compositing. */
import { Mesh, ShaderMaterial, Texture, Vector2, Vector3, Vector4, VertexData } from '@babylonjs/core';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),num=(v,d)=>Number.isFinite(v)?v:d;
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export const TORNADO_TYPES=Object.freeze({
 rope:Object.freeze({name:'Cuerda',base:.012,neck:.018,shoulder:.13,power:3.6,bend:.105,cloud:1.60,ground:.18}),
 cone:Object.freeze({name:'Cono',base:.034,neck:.050,shoulder:.19,power:2.3,bend:.060,cloud:1.75,ground:.25}),
 wedge:Object.freeze({name:'Cuña',base:.155,neck:.185,shoulder:.24,power:1.5,bend:.024,cloud:2.0,ground:.40})
});
const CACHE=new WeakMap();
function acquire(scene,url){
 let map=CACHE.get(scene);if(!map){map=new Map();CACHE.set(scene,map);}
 let r=map.get(url);
 if(!r){
  r={refs:0,texture:null,ready:null};
  r.ready=new Promise((resolve,reject)=>{
   r.texture=new Texture(url,scene,false,true,Texture.TRILINEAR_SAMPLINGMODE,()=>resolve(r.texture),m=>reject(new Error('No se pudo cargar el WebP: '+m)));
   r.texture.hasAlpha=true;r.texture.wrapU=r.texture.wrapV=Texture.CLAMP_ADDRESSMODE;r.texture.anisotropicFilteringLevel=1;
  });r.ready.catch(()=>{});map.set(url,r);
 }
 r.refs++;return {r,release(){if(--r.refs===0){r.texture.dispose();map.delete(url);}}};
}
const BODY_VS="\nprecision highp float;\nattribute vec3 position;\nattribute vec2 uv;\nuniform mat4 viewProjection;\nvarying vec2 vUV;\nvarying vec3 vWorld;\nvarying vec3 vNormal;\n\nuniform float height;\nuniform float cloudRadius;\nuniform vec4 profile;\nuniform float bend;\nuniform float clock;\nuniform float speed;\nuniform float seed;\nuniform float rotationSpeed;\nuniform float twist;\nuniform vec3 anchor;\nvec3 surface(float angle,float h){\n float t=clock*speed,k=clamp(h,0.0,1.0);\n angle+=h*twist*4.0+t*rotationSpeed*.65+.12*twist*sin(h*10.0-t*rotationSpeed*1.2);\n float r=mix(profile.x,profile.y,smoothstep(.025,.24,k));\n r+=profile.z*pow(k,profile.w);\n r+=.020*exp(-h*22.0);\n r*=1.0+.035*sin(angle*3.0+h*18.0-t*rotationSpeed*1.8)+.025*sin(angle*5.0-h*11.0+t*rotationSpeed*1.25);\n r*=height;\n // The explicit storm cloud owns the wide canopy; keep a tapered 3D neck here.\n float y=h<.96?h:.96+.10*(1.0-exp(-(h-.96)*9.0));\n float drift=smoothstep(.025,.82,h);\n vec2 center=height*bend*drift*vec2(sin(h*2.6+seed),.64*sin(h*3.1+seed*1.7));\n center+=height*.012*drift*vec2(sin(h*6.0-t*.42+seed),cos(h*4.0-t*.36+seed));\n return anchor+vec3(center.x+r*cos(angle),height*y,center.y+r*sin(angle));\n}\nvoid main(){\n float a=uv.x*6.28318530718,h=uv.y;\n vec3 p=surface(a,h);\n vec3 along=surface(a,h+.0015)-surface(a,h-.0015);\n vec3 around=surface(a+.003,h)-surface(a-.003,h);\n vNormal=normalize(cross(along,around));\n vWorld=p;vUV=uv;gl_Position=viewProjection*vec4(p,1.0);\n}";
const BODY_FS="\nprecision highp float;\nuniform sampler2D atlasSampler;\nuniform float clock;\nuniform float speed;\nuniform float seed;\nuniform float rotationSpeed;\nuniform float twist;\nuniform float gain;\nuniform float formation;\nuniform float detailMix;\nuniform float brightness;\nuniform float cloudOpacity;\nuniform float funnelOpacity;\nuniform vec3 lightDirection;\nvarying vec2 vUV;\nvarying vec3 vWorld;\nvarying vec3 vNormal;\n\nuniform vec3 cameraPos;\nuniform float fogMode;\nuniform float fogDensity;\nuniform float fogStart;\nuniform float fogEnd;\nfloat visibleFog(vec3 p){\n float d=distance(cameraPos,p);\n if(fogMode<.5)return 1.0;\n if(fogMode<1.5)return exp(-d*fogDensity);\n if(fogMode<2.5)return exp(-d*d*fogDensity*fogDensity);\n return 1.0-clamp((d-fogStart)/max(.001,fogEnd-fogStart),0.0,1.0);\n}\nfloat cloudNoise(vec2 q){\n // Inner cloud tile only: no atlas edges or baked funnel silhouette.\n vec4 s=texture2D(atlasSampler,(vec2(520.0,520.0)+q*496.0)/1024.0);\n return clamp(dot(s.rgb,vec3(.299,.587,.114))*1.9,0.0,1.0);\n}\nvoid main(){\n float h=vUV.y,t=clock*speed,a=vUV.x*6.28318530718;\n float join=smoothstep(.76,1.03,h),spin=mix(2.20,.22,join);\n float angle=a+h*twist*13.0-t*rotationSpeed*spin+seed,lift=h*27.0-t*3.1;\n vec2 q=vec2(.5)+.25*vec2(cos(angle),sin(angle))+.055*vec2(sin(lift),cos(lift*.73));\n float broad=cloudNoise(q),fine=broad;\n if(detailMix>.01){\n  float b=a*3.0-h*twist*29.0+t*rotationSpeed*3.7+seed*2.0;\n  vec2 q2=vec2(.5)+(.21+.035*sin(lift*.8))*vec2(cos(b),sin(b));\n  fine=mix(broad,cloudNoise(q2),.50*detailMix);\n }\n float spiral=.5+.5*sin(a*7.0-h*twist*43.0+t*rotationSpeed*6.0+fine*3.0);\n float density=clamp(.60*broad+.40*fine,0.0,1.0);\n vec3 n=normalize(vNormal),eye=normalize(cameraPos-vWorld);\n float rim=pow(clamp(abs(dot(n,eye)),0.0,1.0),.36);\n float lambert=max(0.0,dot(n,normalize(lightDirection)));\n float directional=.48+.70*lambert,bands=mix(1.0,.81+.25*spiral,(1.0-join)*.55);\n float shade=(.48+.60*density)*directional*bands;\n vec3 color=vec3(.49,.505,.50)*shade;\n color=mix(color,color*vec3(.90,.82,.70),1.0-smoothstep(.02,.18,h));\n color=mix(color,color*.70,join*.55);\n float alpha=mix(.71,.96,smoothstep(.15,.85,density))*rim;\n alpha*=mix(funnelOpacity,cloudOpacity,join);\n alpha*=1.0-smoothstep(.86,1.07,h);\n alpha*=smoothstep(-.012,.015,h);\n float front=(1.0-formation)*1.02;\n alpha*=smoothstep(front-.045,front+.045,h);\n alpha*=gain*visibleFog(vWorld);\n if(alpha<.004)discard;\n gl_FragColor=vec4(color*brightness,min(.98,alpha));\n}";
const GROUND_VS="\nprecision highp float;\nattribute vec3 position;\nattribute vec2 uv;\nuniform mat4 viewProjection;\nuniform vec3 anchor;\nuniform vec2 groundSlope;\nuniform float groundRadius;\nvarying vec2 vUV;\nvarying vec3 vWorld;\nvoid main(){\n vec2 xz=(uv-.5)*groundRadius*2.0;\n vWorld=anchor+vec3(xz.x,.07+groundSlope.x*xz.x+groundSlope.y*xz.y,xz.y);\n vUV=uv;gl_Position=viewProjection*vec4(vWorld,1.0);\n}";
const GROUND_FS="\nprecision highp float;\nuniform sampler2D atlasSampler;\nuniform float clock;\nuniform float speed;\nuniform float rotationSpeed;\nuniform float gain;\nuniform float groundGain;\nuniform float groundOpacity;\nuniform float brightness;\nvarying vec2 vUV;\nvarying vec3 vWorld;\n\nuniform vec3 cameraPos;\nuniform float fogMode;\nuniform float fogDensity;\nuniform float fogStart;\nuniform float fogEnd;\nfloat visibleFog(vec3 p){\n float d=distance(cameraPos,p);\n if(fogMode<.5)return 1.0;\n if(fogMode<1.5)return exp(-d*fogDensity);\n if(fogMode<2.5)return exp(-d*d*fogDensity*fogDensity);\n return 1.0-clamp((d-fogStart)/max(.001,fogEnd-fogStart),0.0,1.0);\n}\nvoid main(){\n vec2 p=(vUV-.5)*2.0;\n float r=length(p),a=-clock*speed*rotationSpeed*.48,c=cos(a),s=sin(a);\n vec2 q=clamp(vec2(c*p.x-s*p.y,s*p.x+c*p.y)*.5+.5,.002,.998);\n vec4 tex=texture2D(atlasSampler,(vec2(520.0,8.0)+q*496.0)/1024.0);\n float contact=1.0-smoothstep(.04,.73,r),rim=1.0-smoothstep(.60,.99,r);\n vec3 color=mix(vec3(.023,.020,.014),tex.rgb*.65,.65)*brightness;\n float alpha=(tex.a*.60+contact*.23)*rim*groundGain*groundOpacity*gain*visibleFog(vWorld);\n if(alpha<.004)discard;\n gl_FragColor=vec4(color,min(.90,alpha));\n}";
const DUST_VS="precision highp float;\nattribute vec3 position;attribute vec2 uv;attribute float aLayer;attribute vec4 aSeed;\nuniform mat4 viewProjection;uniform vec3 anchor,cardRight,cardUp,cameraPos;uniform vec2 groundSlope;\nuniform float height,groundRadius,groundGain,clock,speed,rotationSpeed,twist,dustAmount,particleAmount,passSide;\nvarying vec2 vUV;varying float vLayer;varying vec3 vWorld;varying vec4 vParticle;\nvoid main(){vUV=uv;vLayer=aLayer;float t=clock*speed;vec3 p;\n  bool dust=aLayer<3.5;\n  float rate=dust?mix(.19,.29,aSeed.y):mix(.32,.56,aSeed.y);\n  float life=fract(t*rate+aSeed.x);\n  float turn=aSeed.z*6.2831853+t*rotationSpeed*mix(1.9,3.1,aSeed.y);\n  float radius,lift,scale;\n  if(dust){\n   radius=groundRadius*mix(.46+.39*aSeed.y,.06+.16*aSeed.z,life);\n   turn+=life*twist*1.7;\n   lift=height*(.008+pow(life,1.22)*mix(.095,.18,aSeed.w));\n   scale=groundRadius*(.17+.24*life)*mix(.70,1.22,aSeed.w);\n  }else{\n   float thrown=step(.78,aSeed.w);\n   radius=groundRadius*mix(mix(.32+.49*aSeed.y,.07+.14*aSeed.z,life),.23+life*(.80+.40*aSeed.y),thrown);\n   turn+=life*twist*2.4;\n   lift=height*(.004+mix(pow(life,.85)*(.10+.12*aSeed.z),4.0*life*(1.0-life)*(.035+.06*aSeed.z),thrown));\n   scale=groundRadius*mix(.009,.024,aSeed.w);\n  }\n  vec2 xz=vec2(cos(turn),sin(turn))*radius;\n  vec3 center=anchor+vec3(xz.x,lift+dot(groundSlope,xz),xz.y);\n  vec2 q=uv-.5;\n  float spin=aSeed.z*6.2831853+t*(dust?.14:3.5),c=cos(spin),s=sin(spin);\n  q=vec2(q.x*c-q.y*s,q.x*s+q.y*c)*scale*2.0;\n  p=center+cardRight*q.x+cardUp*q.y;\n  vParticle=vec4(life,aSeed.w,aSeed.z,scale);\n vWorld=p;\n float side=dot(center.xz-anchor.xz,cameraPos.xz-anchor.xz);bool front=side>=0.0;\n bool hidden=groundGain<.001||(passSide>0.0?!front:front)||(aLayer<3.5&&dustAmount<.001)||(aLayer>3.5&&particleAmount<.001);\n if(hidden){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}\n gl_Position=viewProjection*vec4(p,1.0);\n}";
const DUST_FS="\nprecision highp float;\nuniform sampler2D atlasSampler;\nuniform float clock,speed,gain,formation,farMix,groundGain;\nuniform float funnelOpacity,cloudOpacity,groundOpacity,brightness;\nuniform float rotationSpeed,twist,dustAmount,particleAmount,height,footU;\nuniform vec3 anchor,cameraPos;\nuniform vec2 groundSlope;\nuniform float fogMode,fogDensity,fogStart,fogEnd;\nvarying vec2 vUV;\nvarying float vLayer;\nvarying vec3 vWorld;\nvarying vec4 vParticle;\nvec4 sprite(vec2 uv,vec4 rect){\n float inside=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);\n vec4 s=texture2D(atlasSampler,rect.xy+clamp(uv,.001,.999)*rect.zw);s.a*=inside;return s;\n}\nvec2 rotateUV(vec2 p,float a){p-=.5;float c=cos(a),s=sin(a);return vec2(p.x*c-p.y*s,p.x*s+p.y*c)+.5;}\nfloat hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat noise2d(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}\nfloat fogAmount(float d){\n if(fogMode<.5)return 0.0;if(fogMode<1.5)return 1.0-exp(-d*fogDensity);\n if(fogMode<2.5)return 1.0-exp(-d*d*fogDensity*fogDensity);\n return clamp((d-fogStart)/max(fogEnd-fogStart,.001),0.0,1.0);\n}\nvoid main(){\n float t=clock*speed;vec4 tex;float alpha;vec3 color;\n if(vLayer<3.5){  vec2 q=rotateUV(vUV,(vParticle.z-.5)*2.4);tex=sprite((q-.5)*.86+.5,vec4(520.0,8.0,496.0,496.0)/1024.0);\n  float edge=1.0-smoothstep(.28,.98,length((vUV-.5)*2.0)),life=vParticle.x;\n  float fade=smoothstep(0.0,.16,life)*(1.0-smoothstep(.62,1.0,life));\n  float turbulence=.62+.38*noise2d(q*7.0+vec2(t*.3,-t*.2));\n  color=mix(tex.rgb*vec3(.64,.53,.40),vec3(.39,.32,.23),.24)*brightness;\n  alpha=tex.a*edge*fade*turbulence*.28*dustAmount*groundOpacity*gain*groundGain*smoothstep(.74,.96,formation);\n}else{  vec2 p=vUV*2.0-1.0;float edge=max(abs(p.x)*.82+abs(p.y)*.33,abs(p.y)*.84+abs(p.x)*.26),life=vParticle.x;\n  float fade=smoothstep(0.0,.08,life)*(1.0-smoothstep(.72,1.0,life));\n  color=mix(vec3(.095,.067,.034),vec3(.38,.29,.15),vParticle.y)*(.72+.28*vUV.y)*brightness;\n  alpha=(1.0-smoothstep(.73,.94,edge))*fade*.82*particleAmount*groundOpacity*gain*groundGain*smoothstep(.78,.98,formation);\n}\n float terrainY=anchor.y+dot(groundSlope,vWorld.xz-anchor.xz);alpha*=smoothstep(.015,max(height*.006,.08),vWorld.y-terrainY);\n alpha*=1.0-fogAmount(distance(cameraPos,vWorld));if(alpha<.004)discard;gl_FragColor=vec4(color,min(alpha,.98));\n}";
const DUST_COUNT=36,GRAIN_COUNT=64,DUST_CARDS=DUST_COUNT+GRAIN_COUNT;
const fract=x=>x-Math.floor(x);
function createDust(scene){
 const mesh=new Mesh('auralia-tornado-dust-back',scene),positions=[],uv=[],layers=[],seeds=[],indices=new Uint16Array(DUST_CARDS*6),cards=[];
 for(let i=0;i<DUST_CARDS;i++){
  const seed=[fract((i+3)*.61803398875+.13),fract((i+3)*.754877666+.37),fract((i+3)*.569840291+.71),fract((i+3)*.438579021+.23)],layer=i<DUST_COUNT?3:4;
  cards.push({i,seed,layer,depth:0});positions.push(-.5,0,0,.5,0,0,.5,1,0,-.5,1,0);uv.push(0,0,1,0,1,1,0,1);
  for(let j=0;j<4;j++){layers.push(layer);seeds.push(...seed);}const b=i*4;indices.set([b,b+1,b+2,b,b+2,b+3],i*6);
 }
 const data=new VertexData();data.positions=positions;data.uvs=uv;data.indices=indices;data.applyToMesh(mesh,true);
 mesh.setVerticesData('aLayer',new Float32Array(layers),false,1);mesh.setVerticesData('aSeed',new Float32Array(seeds),false,4);
 mesh.isPickable=false;mesh.checkCollisions=false;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
 return {mesh,cards,indices};
}
function createContact(scene){
 const mesh=new Mesh('auralia-tornado-ground',scene),data=new VertexData();data.positions=[-1,0,-1,1,0,-1,1,0,1,-1,0,1];data.uvs=[0,0,1,0,1,1,0,1];data.indices=[0,1,2,0,2,3];data.applyToMesh(mesh,false);
 mesh.isPickable=false;mesh.checkCollisions=false;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);return mesh;
}
const CLOUD_VS="precision highp float;\nattribute vec3 position;attribute vec2 uv;uniform mat4 viewProjection;\nuniform vec3 anchor;uniform float height,cloudRadius,bend,seed,clock,speed,rotationSpeed;\nvarying vec2 vUV;varying vec3 vWorld;varying vec3 vNormal;varying vec3 vCenter;\nvoid main(){\n float t=clock*speed,a=uv.x*6.28318530718,lat=(uv.y-.5)*3.14159265359,c=cos(lat),s=sin(lat);\n vec2 center=height*bend*vec2(sin(2.6+seed),.64*sin(3.1+seed*1.7));\n center+=height*.012*vec2(sin(6.0-t*.42+seed),cos(4.0-t*.36+seed));\n vCenter=anchor+vec3(center.x,height*1.06,center.y);\n vec3 radii=vec3(cloudRadius,height*.17,cloudRadius);\n vec3 sphere=vec3(c*cos(a),s,c*sin(a));vWorld=vCenter+sphere*radii;\n vNormal=normalize(sphere/radii);vUV=uv;gl_Position=viewProjection*vec4(vWorld,1.0);\n}";
const CLOUD_FS="precision highp float;\nuniform sampler2D atlasSampler;uniform float clock,speed,rotationSpeed,seed,gain,brightness,cloudOpacity,detailMix,height,cloudRadius;\nuniform vec3 lightDirection,cameraPos;uniform float fogMode,fogDensity,fogStart,fogEnd;\nvarying vec2 vUV;varying vec3 vWorld;varying vec3 vNormal;varying vec3 vCenter;\nfloat fogVisibility(float d){if(fogMode<.5)return 1.0;if(fogMode<1.5)return exp(-d*fogDensity);if(fogMode<2.5)return exp(-d*d*fogDensity*fogDensity);return 1.0-clamp((d-fogStart)/max(.001,fogEnd-fogStart),0.0,1.0);}\nfloat detail(vec2 q){vec3 c=texture2D(atlasSampler,(vec2(520.0,520.0)+clamp(q,.04,.96)*496.0)/1024.0).rgb;return clamp(dot(c,vec3(.299,.587,.114))*1.9,0.0,1.0);}\nvoid main(){\n vec3 radii=vec3(max(cloudRadius,1.0),max(height*.17,1.0),max(cloudRadius,1.0));\n vec3 delta=vWorld-cameraPos,dir=delta/max(length(delta),.0001),ro=(cameraPos-vCenter)/radii,rd=dir/radii;\n float aa=dot(rd,rd),bb=dot(ro,rd),cc=dot(ro,ro)-1.0,disc=bb*bb-aa*cc;\n if(disc<=0.0||aa<.000000001)discard;\n // One boundary per ray. Rendering both shells would incorrectly double alpha.\n bool inside=cc<0.0;float facing=dot(normalize(vNormal),-dir);\n if((!inside&&facing<=0.0)||(inside&&facing>=0.0))discard;\n float root=sqrt(disc),entry=max(0.0,(-bb-root)/aa),exit=(-bb+root)/aa;\n float thickness=max(0.0,exit-entry);if(thickness<=.0001)discard;\n float closest=clamp(-bb/aa,entry,exit);vec3 impact=ro+rd*closest;\n float edge=smoothstep(.005,.26,1.0-dot(impact,impact));\n vec3 samplePoint=ro+rd*((entry+exit)*.5);\n float t=clock*speed,spin=-t*rotationSpeed*.10+seed,c=cos(spin),s=sin(spin);\n vec2 p=vec2(samplePoint.x*c-samplePoint.z*s,samplePoint.x*s+samplePoint.z*c);\n vec2 q=.5+.235*vec2(sin(p.x*4.0+p.y*1.2),sin(p.y*4.0-p.x*.8));\n q+=.025*vec2(sin(samplePoint.y*5.0-t*.19),cos(samplePoint.y*4.0-t*.14));\n float broad=detail(q),density=broad;\n if(detailMix>.01){vec2 fineUV=.5+.23*vec2(sin(p.x*9.0+p.y*2.0-t*.13),sin(p.y*9.0-p.x*2.0+t*.11));density=mix(broad,detail(fineUV),detailMix*.38);}\n vec3 hit=ro+rd*(inside?exit:entry),n=normalize(hit/radii);\n float lit=max(0.0,dot(n,normalize(lightDirection)));\n vec3 color=mix(vec3(.20,.22,.215),vec3(.54,.56,.54),density)*(.57+.62*lit)*brightness;\n float opticalDepth=thickness/max(height*.34,1.0)*(.65+1.15*density);\n float alpha=(1.0-exp(-opticalDepth))*edge*cloudOpacity*gain*fogVisibility(entry+thickness*.20);\n if(alpha<.004)discard;gl_FragColor=vec4(color,min(.98,alpha));\n}";
function cloudGeometry(scene,name,steps,sides){
 const mesh=new Mesh(name,scene),positions=[],uvs=[],indices=[];
 for(let row=0;row<=steps;row++){const v=row/steps,lat=(v-.5)*Math.PI;for(let col=0;col<=sides;col++){const u=col/sides,a=u*Math.PI*2;positions.push(Math.cos(lat)*Math.cos(a),Math.sin(lat),Math.cos(lat)*Math.sin(a));uvs.push(u,v);}}
 for(let row=0;row<steps;row++)for(let col=0;col<sides;col++){const a=row*(sides+1)+col,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
 const data=new VertexData();data.positions=positions;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh,false);mesh.isPickable=false;mesh.checkCollisions=false;mesh.alwaysSelectAsActiveMesh=true;mesh.alphaIndex=9;mesh.setEnabled(false);return mesh;
}
const SHARED_UNIFORMS=['viewProjection','anchor','clock','speed','gain','brightness','cameraPos','fogMode','fogDensity','fogStart','fogEnd'];
const CLOUD_UNIFORMS=[...SHARED_UNIFORMS,'height','cloudRadius','bend','seed','rotationSpeed','cloudOpacity','lightDirection','detailMix'];
const BODY_UNIFORMS=[...SHARED_UNIFORMS,'rotationSpeed','twist','height','cloudRadius','profile','bend','seed','formation','detailMix','cloudOpacity','funnelOpacity','lightDirection'];
function geometry(scene,name,steps,sides){
 const mesh=new Mesh(name,scene),positions=[],uv=[],indices=[];
 for(let row=0;row<=steps;row++){
  const f=row/steps,h=f<.68?f/.68*.80:.80+(f-.68)/.32*.32;
  for(let col=0;col<=sides;col++){positions.push(0,h,0);uv.push(col/sides,h);}
 }
 for(let row=0;row<steps;row++)for(let col=0;col<sides;col++){
  const a=row*(sides+1)+col,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);
 }
 const data=new VertexData();data.positions=positions;data.uvs=uv;data.indices=indices;data.applyToMesh(mesh,false);
 mesh.isPickable=false;mesh.checkCollisions=false;mesh.alwaysSelectAsActiveMesh=true;mesh.renderingGroupId=0;mesh.setEnabled(false);return mesh;
}
export class TornadoFX {
 constructor(scene,options={}){
  if(!scene?.getEngine)throw new TypeError('TornadoFX necesita una escena Babylon.js.');
  this.scene=scene;this.disposed=false;this.paused=false;this.position=new Vector3();
  this.height=clamp(num(options.height,75),12,250);
  this.rotationSpeed=clamp(num(options.rotationSpeed,1),0,3);this.twist=clamp(num(options.twist,1.1),0,2.5);
  this.dustAmount=clamp(num(options.dustAmount,.85),0,1);this.particleAmount=clamp(num(options.particleAmount,.8),0,1);
  this.speed=clamp(num(options.speed,1),.1,3);this.intensity=clamp(num(options.intensity,1),0,1);
  this.brightness=clamp(num(options.brightness,1),.03,2);
  this.cloudOpacity=clamp(num(options.cloudOpacity,.84),0,1);
  this.funnelOpacity=clamp(num(options.funnelOpacity,1),0,1);this.groundOpacity=clamp(num(options.groundOpacity,.85),0,1);
  this.seed=num(options.seed,1.31);this.duration=Math.max(0,num(options.duration,0));
  this.fadeIn=Math.max(.1,num(options.fadeIn,2));this.fadeOut=Math.max(.1,num(options.fadeOut,2));
  this.nearDistance=Math.max(30,num(options.nearDistance,170));this.farDistance=Math.max(this.nearDistance+10,num(options.farDistance,320));
  this.maxDistance=Math.max(this.farDistance+100,num(options.maxDistance,2500));
  this._cloudInFront=null;
  this.lod='auto';this._clock=0;this._elapsed=0;this._envelope=0;this._target=0;this._active=false;this._ready=false;this._far=false;
  this._slope=new Vector2();this._profile=new Vector4();this._light=new Vector3(-.60,.44,-.65);
  this._atlas=acquire(scene,options.atlasUrl||'textures/tornado_atlas_1k.webp');
  this._material=new ShaderMaterial('auralia-tornado-surface',scene,{vertexSource:BODY_VS,fragmentSource:BODY_FS},{attributes:['position','uv'],uniforms:BODY_UNIFORMS,samplers:['atlasSampler'],needAlphaBlending:true});
  this._material.setTexture('atlasSampler',this._atlas.r.texture);this._material.backFaceCulling=true;this._material.disableDepthWrite=true;
  this._near=geometry(scene,'auralia-tornado-near',36,24);this._farMesh=geometry(scene,'auralia-tornado-far',18,12);
  this._near.material=this._farMesh.material=this._material;
  this._cloudNear=cloudGeometry(scene,'auralia-tornado-cloud-near',20,40);this._cloudFar=cloudGeometry(scene,'auralia-tornado-cloud-far',12,24);
  this._cloudMat=new ShaderMaterial('auralia-tornado-storm-cloud',scene,{vertexSource:CLOUD_VS,fragmentSource:CLOUD_FS},{attributes:['position','uv'],uniforms:CLOUD_UNIFORMS,samplers:['atlasSampler'],needAlphaBlending:true});
  this._cloudMat.setTexture('atlasSampler',this._atlas.r.texture);this._cloudMat.backFaceCulling=false;this._cloudMat.disableDepthWrite=true;this._cloudNear.material=this._cloudFar.material=this._cloudMat;
  this._ground=createContact(scene);
  this._groundMat=new ShaderMaterial('auralia-tornado-contact',scene,{vertexSource:GROUND_VS,fragmentSource:GROUND_FS},{attributes:['position','uv'],uniforms:[...SHARED_UNIFORMS,'rotationSpeed','groundRadius','groundSlope','groundGain','groundOpacity'],samplers:['atlasSampler'],needAlphaBlending:true});
  this._groundMat.setTexture('atlasSampler',this._atlas.r.texture);this._groundMat.backFaceCulling=false;this._groundMat.disableDepthWrite=true;this._ground.material=this._groundMat;
  this._ground.alphaIndex=8;this._near.alphaIndex=this._farMesh.alphaIndex=11;
  const dust=createDust(scene);this._dustBack=dust.mesh;this._dustCards=dust.cards;this._dustIndices=dust.indices;this._dustOrder='';
  this._dustFront=this._dustBack.clone('auralia-tornado-dust-front');this._dustFront.setEnabled(false);this._dustBack.alphaIndex=10;this._dustFront.alphaIndex=12;
  this._right=new Vector3(1,0,0);this._up=new Vector3(0,1,0);this._look=new Vector3();
  this._dustMaterials=[-1,1].map((side,i)=>{
   const m=new ShaderMaterial('auralia-tornado-dust-'+i,scene,{vertexSource:DUST_VS,fragmentSource:DUST_FS},{attributes:['position','uv','aLayer','aSeed'],uniforms:[...SHARED_UNIFORMS,'height','groundRadius','groundGain','groundSlope','groundOpacity','cardRight','cardUp','rotationSpeed','twist','dustAmount','particleAmount','formation','passSide'],samplers:['atlasSampler'],needAlphaBlending:true});
   m.backFaceCulling=false;m.disableDepthWrite=true;m.setTexture('atlasSampler',this._atlas.r.texture);m.setFloat('passSide',side);return m;
  });
  this._dustBack.material=this._dustMaterials[0];this._dustFront.material=this._dustMaterials[1];
  this.setType(options.type||'cone');
  if(Number.isFinite(options.cloudRadius))this.cloudRadius=clamp(options.cloudRadius,12,700);
  if(Number.isFinite(options.groundRadius))this.groundRadius=clamp(options.groundRadius,2,100);
  this._observer=scene.onDisposeObservable.add(()=>this.dispose());
 }
 async prepare(){await this._atlas.r.ready;if(!this.disposed)this._ready=true;return this;}
 setType(type){
  const p=TORNADO_TYPES[type];if(!p)throw new TypeError('Tipo válido: rope, cone o wedge.');
  this.type=type;this._profile.set(p.base,p.neck,p.shoulder,p.power);this.bend=p.bend;this.cloudRadius=this.height*p.cloud;this.groundRadius=this.height*p.ground;return this;
 }
 setSize(size={}){
  const h=clamp(num(size.height,this.height),12,250),k=h/this.height;
  this.cloudRadius=clamp(num(size.cloudRadius,this.cloudRadius*k),12,700);this.groundRadius=clamp(num(size.groundRadius,this.groundRadius*k),2,100);this.height=h;return this;
 }
 setPosition(p){if(!valid(p))throw new TypeError('Posición mundial inválida.');this.position.set(p.x,p.y,p.z);return this;}
 setGroundNormal(n){if(!valid(n)||n.y<.2)throw new TypeError('Normal con Y >= .2 requerida.');this._slope.set(clamp(-n.x/n.y,-1.5,1.5),clamp(-n.z/n.y,-1.5,1.5));return this;}
 setLighting(brightness,direction){this.brightness=clamp(num(brightness,1),.03,2);if(direction){if(!valid(direction)||Math.hypot(direction.x,direction.y,direction.z)<.001)throw new TypeError('Dirección de luz inválida.');this._light.set(direction.x,direction.y,direction.z).normalize();}return this;}
 setIntensity(v){this.intensity=clamp(num(v,0),0,1);return this;}
 setSwirl(o={}){this.rotationSpeed=clamp(num(o.rotationSpeed,this.rotationSpeed),0,3);this.twist=clamp(num(o.twist,this.twist),0,2.5);return this;}
 setDust(o={}){this.dustAmount=clamp(num(o.dustAmount,this.dustAmount),0,1);this.particleAmount=clamp(num(o.particleAmount,this.particleAmount),0,1);return this;}
 setLOD(mode){if(!['auto','near','far'].includes(mode))throw new TypeError('LOD válido: auto, near o far.');this.lod=mode;return this;}
 setPaused(v){this.paused=!!v;return this;}
 play(options={}){
  if(this.disposed)return false;
  if(options.type)this.setType(options.type);if(options.height!==undefined)this.setSize({height:options.height});
  if(options.position)this.setPosition(options.position);if(options.normal)this.setGroundNormal(options.normal);
  if(options.intensity!==undefined)this.setIntensity(options.intensity);
  this.duration=Math.max(0,num(options.duration,this.duration));this._cloudInFront=null;this._clock=0;this._elapsed=0;this._envelope=0;this._target=1;this._active=true;return true;
 }
 _hide(){this._near.setEnabled(false);this._farMesh.setEnabled(false);this._ground.setEnabled(false);this._dustBack.setEnabled(false);this._dustFront.setEnabled(false);this._cloudNear.setEnabled(false);this._cloudFar.setEnabled(false);}
 stop(immediate=false){this._target=0;if(immediate){this._active=false;this._envelope=0;this._hide();}return this;}
 reset(){if(this.disposed)return;this.stop(true);this._clock=this._elapsed=0;this._cloudInFront=null;}
 _sortDust(eye){
  const t=this._clock*this.speed;
  for(const c of this._dustCards){const s=c.seed,dust=c.layer===3,life=fract(t*(dust?.19+.10*s[1]:.32+.24*s[1])+s[0]);let turn=s[2]*Math.PI*2+t*this.rotationSpeed*(1.9+1.2*s[1]),radius,lift;
   if(dust){radius=this.groundRadius*((.46+.39*s[1])*(1-life)+(.06+.16*s[2])*life);turn+=life*this.twist*1.7;lift=this.height*(.008+life**1.22*(.095+.085*s[3]));}
   else{const thrown=s[3]>=.78;radius=this.groundRadius*(thrown?.23+life*(.80+.40*s[1]):(.32+.49*s[1])*(1-life)+(.07+.14*s[2])*life);turn+=life*this.twist*2.4;lift=this.height*(.004+(thrown?4*life*(1-life)*(.035+.06*s[2]):life**.85*(.10+.12*s[2])));}
   const x=Math.cos(turn)*radius,z=Math.sin(turn)*radius,y=lift+this._slope.x*x+this._slope.y*z;c.depth=(this.position.x+x-eye.x)**2+(this.position.y+y-eye.y)**2+(this.position.z+z-eye.z)**2;
  }
  this._dustCards.sort((a,b)=>b.depth-a.depth);const order=this._dustCards.map(c=>c.i).join(',');if(order===this._dustOrder)return;
  for(let i=0;i<DUST_CARDS;i++){const b=this._dustCards[i].i*4;this._dustIndices.set([b,b+1,b+2,b,b+2,b+3],i*6);}this._dustBack.updateIndices(this._dustIndices);this._dustOrder=order;
 }
 _updateCloudOrder(eye){
  const centerY=this.position.y+this.height*1.06,margin=this.height*.04;
  if(this._cloudInFront===null)this._cloudInFront=eye.y>centerY+margin;
  else if(this._cloudInFront){if(eye.y<=centerY)this._cloudInFront=false;}
  else if(eye.y>centerY+margin)this._cloudInFront=true;
  // Independent priorities prevent centre-distance sorting from covering the funnel below.
  const order=this._cloudInFront?13:9;
  this._cloudNear.alphaIndex=this._cloudFar.alphaIndex=order;
 }
 update(dt,camera=this.scene.activeCamera){
  if(this.disposed)return;
  if(!this._active||!this._ready){this._hide();return;}
  dt=clamp(num(dt,0),0,.25);
  if(!this.paused){
   this._clock+=dt;this._elapsed+=dt;if(this.duration>0&&this._elapsed>=this.duration)this._target=0;
   this._envelope+=(this._target-this._envelope)*(1-Math.exp(-dt*4/(this._target?this.fadeIn:this.fadeOut)));
   if(!this._target&&this._envelope<.003){this._active=false;this._envelope=0;this._hide();return;}
  }
  const eye=camera&&(camera.globalPosition||camera.position);if(!valid(eye)){this._hide();return;}
  const d=Math.hypot(eye.x-this.position.x,eye.y-this.position.y,eye.z-this.position.z);
  if(d>=this.maxDistance||this.intensity<.001||this._envelope<.003){this._hide();return;}
  const farMix=this.lod==='far'?1:this.lod==='near'?0:smooth(this.nearDistance,this.farDistance,d);
  if(this.lod==='far')this._far=true;else if(this.lod==='near')this._far=false;else if(d>this.farDistance+20)this._far=true;else if(d<this.farDistance-20)this._far=false;
  this._updateCloudOrder(eye);
  this._near.setEnabled(!this._far);this._farMesh.setEnabled(this._far);
  this._cloudNear.setEnabled(!this._far&&this.cloudOpacity>.001);this._cloudFar.setEnabled(this._far&&this.cloudOpacity>.001);
  const groundGain=(1-farMix)*smooth(.68,.95,this._envelope);this._ground.setEnabled(groundGain>.003&&this.groundOpacity>.001);
  const dustVisible=groundGain>.003&&this.groundOpacity>.001&&(this.dustAmount>.001||this.particleAmount>.001);
  this._dustBack.setEnabled(dustVisible);this._dustFront.setEnabled(dustVisible);
  if(dustVisible){
   this._right.set(-(eye.z-this.position.z),0,eye.x-this.position.x);if(this._right.lengthSquared()<.001)this._right.set(1,0,0);else this._right.normalize();
   this._look.set(eye.x-this.position.x,eye.y-this.position.y-this.height*.055,eye.z-this.position.z);if(this._look.lengthSquared()<.001)this._look.set(0,0,-1);else this._look.normalize();Vector3.CrossToRef(this._right,this._look,this._up);this._up.normalize();this._sortDust(eye);
  }
  const gain=this._envelope*this.intensity*(1-smooth(this.maxDistance*.85,this.maxDistance,d)),body=this._far?this._farMesh:this._near;
  body.position.set(this.position.x,this.position.y+this.height*.5,this.position.z);this._ground.position.copyFrom(this.position);
  const cm=this._cloudMat;
  cm.setFloat('height',this.height);cm.setFloat('cloudRadius',this.cloudRadius);cm.setFloat('bend',this.bend);cm.setFloat('seed',this.seed);cm.setFloat('rotationSpeed',this.rotationSpeed);cm.setFloat('cloudOpacity',this.cloudOpacity);cm.setFloat('detailMix',1-farMix*.75);cm.setVector3('lightDirection',this._light);
  const cloudTime=this._clock*this.speed;
  const cloudX=this.height*this.bend*Math.sin(2.6+this.seed)+this.height*.012*Math.sin(6-cloudTime*.42+this.seed),cloudZ=this.height*this.bend*.64*Math.sin(3.1+this.seed*1.7)+this.height*.012*Math.cos(4-cloudTime*.36+this.seed);
  this._cloudNear.position.set(this.position.x+cloudX,this.position.y+this.height*1.06,this.position.z+cloudZ);this._cloudFar.position.copyFrom(this._cloudNear.position);
  const m=this._material;
  m.setFloat('rotationSpeed',this.rotationSpeed);m.setFloat('twist',this.twist);m.setFloat('height',this.height);m.setFloat('cloudRadius',this.cloudRadius);m.setVector4('profile',this._profile);m.setFloat('bend',this.bend);m.setFloat('seed',this.seed);
  m.setFloat('formation',smooth(0,.96,this._envelope));m.setFloat('detailMix',1-farMix*.75);m.setFloat('cloudOpacity',this.cloudOpacity);m.setFloat('funnelOpacity',this.funnelOpacity);m.setVector3('lightDirection',this._light);
  this._groundMat.setVector2('groundSlope',this._slope);this._groundMat.setFloat('groundRadius',this.groundRadius);this._groundMat.setFloat('groundGain',groundGain);this._groundMat.setFloat('groundOpacity',this.groundOpacity);
  this._groundMat.setFloat('rotationSpeed',this.rotationSpeed);
  for(const mat of this._dustMaterials){
   mat.setVector3('cardRight',this._right);mat.setVector3('cardUp',this._up);mat.setVector2('groundSlope',this._slope);
   for(const [name,value] of Object.entries({height:this.height,groundRadius:this.groundRadius,groundGain,groundOpacity:this.groundOpacity,rotationSpeed:this.rotationSpeed,twist:this.twist,dustAmount:this.dustAmount,particleAmount:this.particleAmount,formation:smooth(0,.96,this._envelope)}))mat.setFloat(name,value);
  }
  this._dustBack.position.copyFrom(this.position);this._dustFront.position.copyFrom(this.position);
  for(const mat of [m,this._groundMat,cm,...this._dustMaterials]){
   mat.setVector3('anchor',this.position);mat.setVector3('cameraPos',eye);
   mat.setFloat('clock',this._clock);mat.setFloat('speed',this.speed);mat.setFloat('gain',gain);mat.setFloat('brightness',this.brightness);
   mat.setFloat('fogMode',num(this.scene.fogMode,0));mat.setFloat('fogDensity',num(this.scene.fogDensity,0));mat.setFloat('fogStart',num(this.scene.fogStart,0));mat.setFloat('fogEnd',num(this.scene.fogEnd,1000));
  }
 }
 getStats(){
  const visible=!this.disposed&&(this._near.isEnabled()||this._farMesh.isEnabled()),ground=visible&&this._ground.isEnabled(),dust=visible&&this._dustBack.isEnabled(),cloud=visible&&(this._cloudNear.isEnabled()||this._cloudFar.isEnabled());
  return {active:this._active,ready:this._ready,type:this.type,lod:visible?(this._far?'far':'near'):'hidden',drawCalls:visible?1+(ground?1:0)+(dust?2:0)+(cloud?1:0):0,triangles:visible?(this._far?432:1728)+(ground?2:0)+(dust?400:0)+(cloud?(this._far?576:1600):0):0,dustSprites:dust&&this.dustAmount>.001?DUST_COUNT:0,debrisParticles:dust&&this.particleAmount>.001?GRAIN_COUNT:0,particles3D:dust?DUST_CARDS:0,textures:1,textureResolution:1024,textureBytes:271110,gpuTextureBytesWithMipmapsApprox:5592405,animation:'continuous 360-degree curved funnel + helical flow + spiral dust',continuousCloud:true,cloudVisible:cloud,funnelRepresentation:'curved surface mesh'};
 }
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;this.scene.onDisposeObservable.remove(this._observer);this._near.dispose();this._farMesh.dispose();this._ground.dispose();this._cloudNear.dispose();this._cloudFar.dispose();this._cloudMat.dispose(false,false);this._dustBack.dispose();this._dustFront.dispose();for(const m of this._dustMaterials)m.dispose(false,false);this._material.dispose(false,false);this._groundMat.dispose(false,false);this._atlas.release();}
}


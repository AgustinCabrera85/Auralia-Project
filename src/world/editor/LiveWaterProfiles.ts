import { Color3, Scene, ShaderMaterial, Vector3 } from '@babylonjs/core';
import {
  createAuraliaWater, updateAuraliaWater, WATER_PROFILES,
  type WaterConfig, type WaterProfile, type WaterRuntime,
} from './AuraliaWaterProfiles';
import { getWorldDocument } from './WorldEditState';
import { WATERFALL_CUT } from '../water/WaterfallGeometry';
import { MAX_WATER_CONTACTS, WaterContactUniforms, type WaterContact } from '../water/WaterContacts';

type WaterMasks = Parameters<typeof createAuraliaWater>[2];
const contactsByScene=new WeakMap<Scene,WaterContactUniforms>();
const emptyContacts=new WaterContactUniforms();
export function setWorldWaterContacts(scene:Scene,contacts:readonly WaterContact[]){
  let buffer=contactsByScene.get(scene);
  if(!buffer){buffer=new WaterContactUniforms();contactsByScene.set(scene,buffer);}
  buffer.set(contacts);
}

function replaceOnce(source:string,search:string,replacement:string):string {
  if(source.split(search).length!==2)
    throw new Error(`Water Lab v4 shader anchor changed: ${search.slice(0,48)}`);
  return source.replace(search,replacement);
}

/** Keep the laboratory lighting and motion while respecting the existing world masks. */
function worldShader(profile:WaterProfile,localFallUV=false,clearWater=false,excludeInland=false):{vertex:string;fragment:string} {
  const original=WATER_PROFILES[profile];
  const ocean=profile==='ocean',fall=profile==='fall';
  let vertex=replaceOnce(original.vertex,'attribute vec2 uv;',
    'attribute vec2 uv;\nattribute vec4 color;\nvarying vec4 vWorldWaterInfo;');
  if(profile==='river')vertex=vertex.replace('attribute vec4 color;',
    'attribute vec4 color; attribute vec2 uv2; varying vec2 vFlowDirection;');
  if(fall&&localFallUV){
    vertex=replaceOnce(vertex,'pos.z += waves(vec2(wp.x, wp.y * 1.35), uTime * 1.7) * 0.22;',
      `float anchored=smoothstep(0.0,.12,color.b)*(1.0-smoothstep(.85,1.0,color.b));
    pos.z += waves(vec2(wp.x, wp.y * 1.35), uTime * 1.7) * .22 * anchored;
    if(color.g>1.5) pos.y+=sin(wp.x*2.1+uTime*3.4)*.055*anchored;`);
  }
  if(ocean){
    vertex=replaceOnce(vertex,'uniform float uChop;',
      'uniform float uChop;\nuniform vec2 uPatchCenter;\nuniform float uPatchRadius;\nuniform float uNearPatch;');
  }
  const wave='pos.y += mix(w, sign(w) * w * w / max(uWaveAmp, .03), uChop * .65);';
  if(ocean){
    vertex=replaceOnce(vertex,wave,
      `float patchFade = 1.0-smoothstep(uPatchRadius*.72,uPatchRadius*.985,
        length(wp.xz-uPatchCenter));
    ${wave.slice(0,-1)} * patchFade * uNearPatch * (1.0-color.g);`);
  }else{
    vertex=replaceOnce(vertex,wave,
      `${wave.slice(0,-1)} * (1.0-color.r) * .2;`);
  }
  vertex=replaceOnce(vertex,'vUV = uv;',fall&&!localFallUV
    ? `vUV = vec2(clamp((vWorldPos.x-${WATERFALL_CUT.minX.toFixed(1)})/
        ${(WATERFALL_CUT.maxX-WATERFALL_CUT.minX).toFixed(1)},0.0,1.0),
        clamp((vWorldPos.z-${WATERFALL_CUT.minZ.toFixed(1)})/
        ${(WATERFALL_CUT.maxZ-WATERFALL_CUT.minZ).toFixed(1)},0.0,1.0));
  vWorldWaterInfo = color;`
    :'vUV = uv;\n  vWorldWaterInfo = color;');
  if(profile==='river')vertex=vertex.replace('vWorldWaterInfo = color;',
    'vWorldWaterInfo = color; vFlowDirection=uv2;');

  const oceanUniforms=ocean?`
uniform vec2 uPatchCenter;
uniform float uPatchRadius;
uniform float uNearPatch;`:'';
  let fragment=replaceOnce(original.fragment,'precision highp float;',
    `precision highp float;
varying vec4 vWorldWaterInfo;
uniform vec3 uFogColor;
uniform float uFogDensity;${oceanUniforms}`);
  if(ocean&&excludeInland)fragment=fragment.replace('uniform float uNearPatch;',
    'uniform float uNearPatch; uniform sampler2D uInlandMask; uniform vec4 uInlandBounds;');
  if(fall||clearWater){
    // Light the actual rounded lip/curtain/apron, not a single fixed +Z plane.
    fragment=replaceOnce(fragment,'vec3 V = normalize(uCameraPos - vWorldPos);',`
  vec3 face=normalize(cross(dFdx(vWorldPos),dFdy(vWorldPos)));
  ${fall?'if(dot(face,uCameraPos-vWorldPos)<0.0)face=-face;':'if(face.y<0.0)face=-face;'}
  N=normalize(face+${profile==='pool'?'vec3(-slope.x-(nA-.5)*.12,0.0,-slope.y-(nB-.5)*.12)*uNormalStrength*.45':'vec3(slope.x,0.0,slope.y)*.16'});
  vec3 V = normalize(uCameraPos - vWorldPos);`);
  }
  if(profile==='river'){
    fragment=fragment.replace('uniform float uFogDensity;','uniform float uFogDensity; varying vec2 vFlowDirection;');
    fragment=replaceOnce(fragment,'if (river) flowUV += vec2(sin(world.y*.18)*.2, -t * uFlowSpeed * .18);',
      'if (river) flowUV -= vFlowDirection * t * uFlowSpeed * .18;');
  }
  if(profile==='pool'){
    fragment=fragment.replace('uniform vec4 uImpactB;','uniform vec4 uImpactB; uniform vec4 uImpactC;');
    fragment=fragment.replace('waterfallImpact(world,uImpactB,t)*.78);',
      'max(waterfallImpact(world,uImpactB,t)*.78,waterfallImpact(world,uImpactC,t)));');
  }
  if(profile==='river'||profile==='pool'){
    fragment=replaceOnce(fragment,'void main(void) {',`
uniform vec4 uWaterContacts[${MAX_WATER_CONTACTS}]; // center XZ and section radii
uniform vec4 uWaterContactInfo[${MAX_WATER_CONTACTS}]; // cos/sin yaw, water Y, strength
float rockContact(vec2 p,vec4 shape,vec4 info,vec2 flow,float breakup,float t){
  if(info.w<=0.0) return 0.0;
  vec2 rel=p-shape.xy;
  float radius=max(shape.z,shape.w),reach=radius+5.0;
  if(abs(rel.x)>reach||abs(rel.y)>reach||abs(vWorldPos.y-info.z)>max(.6,radius*.55)) return 0.0;
  vec2 local=vec2(rel.x*info.x-rel.y*info.y,rel.x*info.y+rel.y*info.x);
  float sdf=(length(local/max(shape.zw,vec2(.06)))-1.0)*min(shape.z,shape.w);
  float width=clamp(uFoamWidth,.35,.85);
  float moving=sin(sdf*9.0-t*2.5+breakup*4.0);
  float rim=1.0-smoothstep(.02,width,abs(sdf+(breakup-.5)*.16));
  float ripples=pow(max(0.0,moving),5.0)*(1.0-smoothstep(.3,2.0,sdf))*smoothstep(.1,.3,sdf);
  float flowLen=length(flow),wake=0.0,upstream=0.0;
  if(flowLen>.1){
    vec2 dir=flow/flowLen;
    float along=dot(rel,dir),across=dot(rel,vec2(-dir.y,dir.x));
    upstream=clamp(-along/max(radius,.1),0.0,1.0);
    float downstream=along-radius*.6;
    float wakeWidth=radius*.7+max(0.0,downstream)*.17;
    float curl=sin(downstream*3.2-t*uFlowSpeed*3.0+across*2.0+breakup*3.0);
    wake=(1.0-smoothstep(wakeWidth*.35,wakeWidth,abs(across)))
      *smoothstep(0.0,.8,downstream)*(1.0-smoothstep(1.5,4.5,downstream))
      *smoothstep(-.1,.7,curl)*smoothstep(.05,.45,sdf);
  }
  float torn=smoothstep(.2,.72,breakup+sin(t*1.3+rel.x*2.4+rel.y*1.8)*.12);
  return clamp((rim*(.65+upstream*.35)*(.28+torn*.72)+ripples*.22+wake*.42)*info.w,0.0,1.0);
}
void main(void) {`);
    fragment=replaceOnce(fragment,'  contacts *= uContactFoam;',`
  contacts *= uContactFoam;
  float rockFoam=0.0;
  for(int i=0;i<${MAX_WATER_CONTACTS};i++)
    rockFoam=max(rockFoam,rockContact(world,uWaterContacts[i],uWaterContactInfo[i],
      ${profile==='river'?'vFlowDirection':'vec2(0.0)'},breakN,t));`);
    fragment=replaceOnce(fragment,'  foam *= smoothstep(.13, .8, nB + .16 + .35*shoreFoam);',
      `  foam *= smoothstep(.13, .8, nB + .16 + .35*shoreFoam);
  foam=max(foam,rockFoam*uContactFoam);`);
  }
  fragment=replaceOnce(fragment,'  float t = uTime;',ocean
    ?`  ${excludeInland?'if(texture2D(uInlandMask,(vWorldPos.xz-uInlandBounds.xy)/uInlandBounds.zw).r>.5) discard;':''}
  if(uNearPatch<.5 && length(vWorldPos.xz-uPatchCenter)<uPatchRadius*.975) discard;
  float t = uTime;`
    :`  if(vWorldWaterInfo.r>.96) discard;
  float t = uTime;`);
  if(ocean){
    fragment=replaceOnce(fragment,
      `float edge = uShoreX + 2.6 * sin(world.y*.105) + .9 * sin(world.y*.29);
    edgeDist = abs(edge - world.x);
    depth = clamp((edge - world.x) / 28.0, 0.0, 1.0);`,
      `edgeDist = (1.0-clamp(vWorldWaterInfo.r,0.0,1.0))*uFoamWidth*4.0;
    depth = clamp(1.0-vWorldWaterInfo.r*.7,0.0,1.0);`);
  }else{
    fragment=replaceOnce(fragment,
      `edgeDist = min(vUV.x, 1.0-vUV.x) * 13.0;
    depth = smoothstep(.05, 5.2, edgeDist) * .75;`,
      `edgeDist = (1.0-clamp(vWorldWaterInfo.r,0.0,1.0))*5.2;
    depth = clamp(vWorldWaterInfo.a,0.0,1.0);`);
    fragment=replaceOnce(fragment,
      `float radius = length(world-uPoolCenter);
    edgeDist = abs(uPoolRadius - radius);
    depth = clamp((uPoolRadius - radius) / max(5.0, uPoolRadius) * 1.5, 0.0, 1.0);`,
      `edgeDist = (1.0-clamp(vWorldWaterInfo.r,0.0,1.0))*5.2;
    depth = clamp(vWorldWaterInfo.a,0.0,1.0);`);
  }
  fragment=replaceOnce(fragment,'gl_FragColor = vec4(col,alpha);',
    `float fog = 1.0-exp(-pow(uFogDensity*distance(uCameraPos,vWorldPos),2.0));
  col = mix(col,uFogColor,clamp(fog,0.0,.97));
  ${fall?`
  // Preserve the laboratory's holes and coverage instead of forcing alpha=1.
  float lateral=min(vUV.x,1.0-vUV.x);
  float torn=fbm(vec2(vUV.x*23.0,(1.0-vUV.y)*11.0-uTime*uFlowSpeed*.7));
  float edgeCoverage=smoothstep(.003,.04+(torn-.5)*.025,lateral);
  ${localFallUV?`
  if(vWorldWaterInfo.g>1.5){
    vec2 footprint=vec2((vUV.x-.5)*2.0,(vUV.y-.5)*2.0);
    float coverage=1.0-smoothstep(.45,1.0,length(footprint));
    float froth=smoothstep(.46,.77,torn+foam*.16);
    // Only broken froth is visible here. A solid white apron reads as another
    // rectangular sheet laid on top of the pool, especially from below.
    alpha=froth*.64*coverage*edgeCoverage;
    col=mix(uShallowColor,uFoamColor,.55+froth*.35);
  }else{
    float foot=1.0-smoothstep(.985,1.025,vWorldWaterInfo.b);
    alpha*=edgeCoverage*foot;
  }`:'alpha*=edgeCoverage;'}
  if(alpha<.015)discard;
  gl_FragColor=vec4(col,alpha);` : clearWater?`// The two sides have different optical behaviour.
  float viewAngle=abs(dot(N,V));
  float surfaceAlpha=mix(.24,.54,depth)+pow(1.0-viewAngle,3.0)*.18;
  surfaceAlpha=mix(surfaceAlpha,.88,foam*.65);
  // Compare against the actual surface normal. A height-only comparison cuts
  // a sloping river into two colours exactly at the camera's horizontal plane.
  if(dot(face,V)<0.0) {
    float transmission=smoothstep(.64,.72,viewAngle);
    // Volume absorption comes from the depth-aware view effect. A second dark
    // veil on the underside makes rivers look like blue-roofed tunnels.
    // Keep only moving highlights here, never another opaque coloured ceiling.
    col=mix(vec3(.23,.43,.43),uFoamColor,foam*.25);
    surfaceAlpha=(.035+.13*pow(nB,2.0))*(1.0-transmission*.65);
  }
  gl_FragColor=vec4(col,surfaceAlpha);`:'gl_FragColor = vec4(col,1.0);'}`);
  return {vertex,fragment};
}

export function createWorldWaterMaterial(scene:Scene,profile:WaterProfile,masks:WaterMasks,
    config:WaterConfig={}):ShaderMaterial {
  const preset=getWorldDocument().waterPresets[profile];
  const clearWater=config.uClearWater===1;
  const source=worldShader(profile,config.uLocalFallUV===1,clearWater,config.uExcludeInland===1);
  return createAuraliaWater(scene,profile,masks,undefined,{...preset?.params,...config},
    source,
    {attributes:['position','uv','color',...(profile==='river'?['uv2']:[])],
      uniforms:['uFogColor','uFogDensity',...(['river','pool'].includes(profile)?['uWaterContacts','uWaterContactInfo']:[]),...(profile==='pool'?['uImpactC']:[]),...(profile==='ocean'
        ?['uPatchCenter','uPatchRadius','uNearPatch','uInlandBounds']:[])],
      needAlphaBlending:clearWater||profile==='fall'});
}

export function updateWorldWaterMaterial(material:ShaderMaterial,profile:WaterProfile,
    scene:Scene,time:number,extra:Partial<WaterRuntime>={}):void {
  const camera=scene.activeCamera?.globalPosition??new Vector3(0,10,0);
  const mode={ocean:0,river:1,pool:3,fall:2}[profile];
  updateAuraliaWater(material,profile,mode,{
    time,camera,sunDirection:new Vector3(.35,.88,-.32).normalize(),...extra,
  });
  if(profile==='river'||profile==='pool'){
    const contacts=contactsByScene.get(scene)??emptyContacts;
    material.setArray4('uWaterContacts',contacts.shapes);
    material.setArray4('uWaterContactInfo',contacts.info);
  }
  material.setColor3('uFogColor',scene.fogMode===Scene.FOGMODE_NONE
    ?new Color3(.62,.78,.87):scene.fogColor);
  material.setFloat('uFogDensity',scene.fogMode===Scene.FOGMODE_NONE?0:scene.fogDensity);
}

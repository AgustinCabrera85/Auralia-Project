import {Material,MaterialPluginBase,type ShaderLanguage,type SubMesh,type UniformBuffer,type Scene,type AbstractEngine} from '@babylonjs/core';
import {GRASS_PATCH} from './GrassPatchData';

export type GrassFocus={x:number;z:number;companionX?:number;companionZ?:number;companionRadius?:number};
/** Staggered whole-clump LOD. No pixel stipple, blending or rectangular fade masks. */
export class GrassDistancePlugin extends MaterialPluginBase{
 constructor(material:Material,private readonly focus:GrassFocus,private readonly sprite:boolean){
  super(material,'AuraliaGrassDistance',210,undefined,true,false);this.registerForExtraEvents=true;this._enable(true);
 }
 override getUniforms(){return {externalUniforms:['grassFocus','grassCompanion']};}
 override getCustomCode(type:string,_language?:ShaderLanguage):Record<string,string>|null{
  if(type==='vertex')return {CUSTOM_VERTEX_DEFINITIONS:'varying vec2 grassRoot; uniform vec2 grassFocus; uniform vec3 grassCompanion;',CUSTOM_VERTEX_UPDATE_WORLDPOS:`
   grassRoot = finalWorld[3].xz;
   vec2 grassAway = grassRoot - grassFocus;
   float grassContactDistance = length(grassAway);
   float grassContact = 1.0 - smoothstep(0.35, 2.2, grassContactDistance);
   float grassTip = clamp(position.y / 1.0, 0.0, 1.0);
   grassTip *= grassTip;
   worldPos.xz += grassAway / max(grassContactDistance, 0.05) * grassContact * grassTip * 1.25;
   worldPos.y -= grassContact * grassTip * 0.32;
   vec2 dogAway = grassRoot - grassCompanion.xy;
   float dogDistance = length(dogAway);
   float dogContact = (1.0 - smoothstep(0.2, max(0.21, grassCompanion.z), dogDistance)) * step(0.01, grassCompanion.z);
   worldPos.xz += dogAway / max(dogDistance, 0.05) * dogContact * grassTip * 0.9;
   worldPos.y -= dogContact * grassTip * 0.55;
   vec2 grassCell = floor(grassRoot / ${GRASS_PATCH.spacing});
   bool grassDistant = mod(grassCell.x, 2.0) == 0.0 && mod(grassCell.y, 2.0) == 0.0;
   float grassFadeStart = grassDistant ? ${GRASS_PATCH.fadeStart}.0 : ${GRASS_PATCH.detailFadeStart}.0;
   float grassFadeEnd = grassDistant ? ${GRASS_PATCH.farEnd}.0 : ${GRASS_PATCH.detailEnd}.0;
   float grassShrink = 1.0 - smoothstep(grassFadeStart, grassFadeEnd, distance(grassRoot, grassFocus));
   worldPos.y = mix(finalWorld[3].y, worldPos.y, grassShrink); vPositionW = worldPos.xyz;
  `};
  if(type==='fragment')return {
   CUSTOM_FRAGMENT_DEFINITIONS:'varying vec2 grassRoot; uniform vec2 grassFocus;',
   CUSTOM_FRAGMENT_MAIN_BEGIN:`
    float grassDistance = distance(grassRoot, grassFocus);
    float grassChoice = fract(sin(dot(grassRoot, vec2(12.9898, 78.233))) * 43758.5453);
    float grassLod = mix(${GRASS_PATCH.nearStart}.0, ${GRASS_PATCH.nearEnd}.0, grassChoice);
    ${this.sprite?'if (grassDistance < grassLod) discard;':'if (grassDistance >= grassLod) discard;'}
    if (grassDistance >= ${GRASS_PATCH.farEnd}.0) discard;
   `};
  return null;
 }
 override hardBindForSubMesh(_u:UniformBuffer,_s:Scene,_e:AbstractEngine,subMesh:SubMesh):void{
  subMesh.effect?.setFloat2('grassFocus',this.focus.x,this.focus.z);
  subMesh.effect?.setFloat3('grassCompanion',this.focus.companionX??0,this.focus.companionZ??0,this.focus.companionRadius??0);
 }
}

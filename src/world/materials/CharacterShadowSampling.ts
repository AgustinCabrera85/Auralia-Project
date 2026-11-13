import { DirectionalLight, Scene, ShaderMaterial, Vector4 } from '@babylonjs/core';

// ShaderMaterial does not implement receiveShadows automatically. Sample the
// same map as the PBR characters/props, including RGBA-packed WebGL1 fallback.
export const CHARACTER_SHADOW_UNIFORMS=['characterShadowMatrix','characterShadowParams'];
export const CHARACTER_SHADOW_GLSL=`
uniform sampler2D characterShadowMap;
uniform mat4 characterShadowMatrix;
uniform vec4 characterShadowParams;
float characterShadowDepth(vec2 uv){
  vec4 sampleDepth=texture2D(characterShadowMap,uv);
  return characterShadowParams.z>.5?dot(sampleDepth,vec4(1.0/16581375.0,1.0/65025.0,1.0/255.0,1.0)):sampleDepth.r;
}
float characterSunVisibility(vec3 position){
  if(characterShadowParams.x<.5)return 1.0;
  vec4 clip=characterShadowMatrix*vec4(position,1.0);
  vec3 p=clip.xyz/clip.w*.5+.5;
  if(any(lessThan(p,vec3(0.0)))||any(greaterThan(p,vec3(1.0))))return 1.0;
  float texel=characterShadowParams.y;
  float depth=p.z-.00015;
  float visible=step(depth,characterShadowDepth(p.xy+vec2(-.94,-.40)*texel));
  visible+=step(depth,characterShadowDepth(p.xy+vec2(.95,-.77)*texel));
  visible+=step(depth,characterShadowDepth(p.xy+vec2(-.09,.93)*texel));
  visible+=step(depth,characterShadowDepth(p.xy+vec2(.34,.29)*texel));
  return mix(characterShadowParams.w,1.0,visible*.25);
}`;

export function bindCharacterShadow(material:ShaderMaterial,scene:Scene):void{
  const sun=scene.lights.find(l=>l instanceof DirectionalLight) as DirectionalLight|undefined;
  const generator=sun?.getShadowGenerator(),map=generator?.getShadowMap();
  if(!generator||!map){material.setVector4('characterShadowParams',new Vector4(0,0,0,1));return;}
  material.setTexture('characterShadowMap',map);
  material.setMatrix('characterShadowMatrix',generator.getTransformMatrix());
  material.setVector4('characterShadowParams',new Vector4(sun!.shadowEnabled?1:0,1/map.getSize().width,
    map.textureType===0?1:0,.18));
}

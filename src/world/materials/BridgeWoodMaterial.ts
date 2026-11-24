import {Color3,MaterialPluginBase,Scene,ShaderLanguage,StandardMaterial,Texture} from '@babylonjs/core';

class PlankJoints extends MaterialPluginBase{
  constructor(material:StandardMaterial){super(material,'BridgePlankJoints',210,{},true,false);this._enable(true);}
  override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
  override getCustomCode(type:string):Record<string,string>|null{
    return type==='fragment'?{CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
      #ifdef DIFFUSE
        // Half-metre boards across the deck; joints stay opaque and filtered.
        float board=vDiffuseUV.x*4.0;
        float edge=min(fract(board),1.0-fract(board));
        float aa=max(fwidth(board),.001);
        float seam=1.0-smoothstep(.008,.008+aa,edge);
        float variation=fract(sin(floor(board)*127.1)*43758.5453);
        baseColor.rgb*=mix(.90,1.04,variation)*mix(1.0,.36,seam);
      #endif`}:null;
  }
}
export function createBridgeWoodMaterial(scene:Scene):StandardMaterial{
  const material=new StandardMaterial('puentes-tablones-madera',scene);
  material.diffuseTexture=new Texture('/assets/wayfinding/wood-v2-color.png',scene);
  material.bumpTexture=new Texture('/assets/wayfinding/wood-v2-normal.png',scene);material.bumpTexture.level=.4;
  material.diffuseColor=new Color3(.68,.70,.65);material.specularColor=new Color3(.06,.055,.04);
  material.backFaceCulling=false;material.twoSidedLighting=true;new PlankJoints(material);
  return material;
}

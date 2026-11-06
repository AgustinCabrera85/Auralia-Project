import { Material, MaterialPluginBase, type ShaderLanguage, type SubMesh,
  type UniformBuffer, type Scene, type AbstractEngine } from '@babylonjs/core';
import type { AuraliaWindState } from '../AuraliaWindSystem';

/** Bends only GLB vertices above their roots; thin-instance matrices stay fixed. */
export class GrassWindPlugin extends MaterialPluginBase {
  constructor(material:Material,private readonly wind:AuraliaWindState){
    super(material,'AuraliaGrassWind',200,undefined,true,false);
    this.registerForExtraEvents=true;
    this._enable(true);
  }

  override getUniforms(){return {externalUniforms:['grassWindTime','grassWindStrength']};}

  override getCustomCode(shaderType:string,_shaderLanguage?:ShaderLanguage):Record<string,string>|null{
    if(shaderType!=='vertex')return null;
    return {
      CUSTOM_VERTEX_DEFINITIONS:'uniform float grassWindTime; uniform float grassWindStrength;',
      CUSTOM_VERTEX_UPDATE_WORLDPOS:`
        float grassBend = clamp(position.y / 1.4, 0.0, 1.0);
        grassBend *= grassBend;
        float grassPhase = finalWorld[3].x * 0.17 + finalWorld[3].z * 0.13;
        float grassWave = sin(grassWindTime * 1.45 + grassPhase) * 0.7
          + sin(grassWindTime * 2.23 + grassPhase * 1.63) * 0.3;
        worldPos.x += grassBend * 0.34 * grassWave * grassWindStrength;
        worldPos.z += grassBend * 0.17 * grassWave * grassWindStrength;
        vPositionW = worldPos.xyz;
      `
    };
  }

  override hardBindForSubMesh(_uniformBuffer:UniformBuffer,_scene:Scene,
    _engine:AbstractEngine,subMesh:SubMesh):void{
    subMesh.effect?.setFloat('grassWindTime',this.wind.time);
    subMesh.effect?.setFloat('grassWindStrength',this.wind.effectiveStrength/.65);
  }
}

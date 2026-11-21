import { PBRMaterial, StandardMaterial, type Material, type Scene } from '@babylonjs/core';
import { registerGLTFExtension } from '@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js';
import { shareTextureSourceBuffers } from './SharedTextureBuffers';

const scenes=new WeakSet<Scene>();
const budgets=new WeakMap<Material,number>();
type LitMaterial=PBRMaterial|StandardMaterial;
const lit=(material:Material):material is LitMaterial=>
  material instanceof PBRMaterial||material instanceof StandardMaterial;

/** Declare the lights a surface can receive, independently of total scene lights. */
export function setMaterialLightBudget(material:Material,lights:number):void {
  if(!lit(material))return;
  const budget=Math.max(1,Math.floor(lights));
  budgets.set(material,budget);
  if(material.maxSimultaneousLights!==budget)material.maxSimultaneousLights=budget;
}

/** Babylon 9.32's glTF loader raises EVERY scene material's light limit to
 * scene.lights.length at the end of each import, even for disabled/scoped lights.
 * Restore our budgets synchronously in onReady, before the next render compiles
 * another variant. Do not patch the loader or clear live shader caches.
 */
registerGLTFExtension('AURALIA_scene_light_budget',false,loader=>({
  name:'AURALIA_scene_light_budget',enabled:true,
  onReady(){
    const scene=loader.babylonScene;
    if(!scenes.has(scene))return;
    shareTextureSourceBuffers(scene.textures);
    for(const material of scene.materials)if(lit(material)){
      const budget=budgets.get(material)??4;
      if(material.maxSimultaneousLights!==budget)material.maxSimultaneousLights=budget;
    }
  },
  dispose(){}
}));

export function installSceneLightBudget(scene:Scene):void {
  if(scenes.has(scene))return;
  scenes.add(scene);
  scene.onDisposeObservable.addOnce(()=>scenes.delete(scene));
}

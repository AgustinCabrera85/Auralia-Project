import { materialContinuoDeCaverna } from './caverna.mjs';
import { LavaRocosa } from './lava.mjs';
import { acabadoDeOro } from './oro.mjs';
import { sconceBounces } from './apliques.mjs';

/** Apply only to this AssetContainer, after positioning its parent. Never changes scene handedness. */
export function aplicarMaterialesReino(B,scene,container,meta,mapPoint=p=>B.Vector3.FromArray(p),
  mapDirection=p=>B.Vector3.FromArray(p),worldScale=1) {
  const vector=p=>mapPoint(p).asArray();
  const field={...meta.caverna,worldScale,origen:vector(meta.caverna.origen),
    transversal:mapDirection(meta.caverna.transversal).normalize().asArray(),
    longitudinal:mapDirection(meta.caverna.longitudinal).normalize().asArray()};
  const bounces=meta.reboteApliques.map(([p,n])=>[vector(p),mapDirection(n).normalize().asArray()]);
  const Bounce=sconceBounces(B,bounces,worldScale),animations=[];
  const basalt=container.materials.find(m=>m.name.includes('Macizo continuo de basalto')&&m.name.includes('Reino'));
  const rockTexture=basalt?.albedoTexture;
  for(const m of container.materials){
    if(!(m instanceof B.PBRMaterial)||m.metadata?.reinoApplied)continue;
    m.maxSimultaneousLights=9;m.environmentIntensity=0;
    if(meta.caverna.materiales.includes(m.name))materialContinuoDeCaverna(B,m,
      {...field,mezclarPie:!meta.caverna.sinMezclaDePiso.includes(m.name)});
    if(meta.lavaAnimada.materiales.includes(m.name))animations.push(LavaRocosa.apply(B,scene,m,
      {...meta.lavaAnimada,width:m.name.includes('estrechas')?4:12,...meta.lavaAnimada.perMaterial?.[m.name],
        rockTexture,worldScale,worldOriginY:vector([0,0,0])[1],falling:!m.name.includes('Pool'),
        ...(!m.name.includes('Pool')?{speed:1.1,length:24}:{} )}));
    if(/Palacio ceremonial · ((Relieve|Sello) de la Caldera|Talla de (baranda|pilastra))/.test(m.name)){
      m.useParallax=m.useParallaxOcclusion=true;m.parallaxScaleBias=.028;m.bumpTexture.hasAlpha=true;
      if(!m.name.includes('Talla de'))m.zOffset=-1;
    }
    if(m.name==='Palacio ceremonial · Losa de la procesión'&&m.bumpTexture){
      m.bumpTexture.hasAlpha=true;m.useParallax=m.useParallaxOcclusion=true;m.parallaxScaleBias=.008;
    }
    if(/Palacio ceremonial · (Estandarte bordado|Tapiz de la procesión|Paño granate|Terciopelo del trono)/.test(m.name)){
      m.sheen.isEnabled=true;m.sheen.intensity=.24;m.sheen.roughness=.76;m.sheen.color.set(.78,.68,.58);
    }
    if(m.name.startsWith('Palacio ceremonial · ')&&!m.name.includes(' · Reino'))new Bounce(m);
    m.metadata={...m.metadata,reinoApplied:true};
  }
  const gold=acabadoDeOro(B,scene,container.meshes,vector(meta.iluminacion.reflejoOro));
  return {animations,gold,setActive(active){animations.forEach(a=>a.pause(!active));},
    dispose(){animations.forEach(a=>a.pause());gold.dispose?.();}};
}

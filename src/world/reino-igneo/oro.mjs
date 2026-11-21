"use strict";

function acabadoDeOro(B, scene, meshes, position) {
  class GoldInlay extends B.MaterialPluginBase {
    constructor(material) { super(material,"Oro de las incrustaciones",145,{},true,true); }
    getClassName() { return "CalderaGoldInlay"; }
    getCustomCode(type) {
      if (type !== "fragment") return null;
      return {CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
        #if defined(METALLICWORKFLOW) && defined(REFLECTIVITY)
          float calderaGilt = smoothstep(0.025, 0.15, surfaceMetallicOrReflectivityColorMap.b);
          float calderaWear = clamp(max(max(surfaceAlbedo.r, surfaceAlbedo.g), surfaceAlbedo.b) * 4.0, 0.45, 1.0);
          surfaceAlbedo = mix(surfaceAlbedo, vec3(0.90, 0.65, 0.13) * calderaWear, calderaGilt);
          metallicRoughness.r = mix(metallicRoughness.r, 0.97, calderaGilt);
          metallicRoughness.g = mix(metallicRoughness.g, 0.25 + 0.10 * (1.0 - calderaWear), calderaGilt);
        #endif`};
    }
  }
  const materials=[...new Set(meshes.map(mesh=>mesh.material).filter(Boolean))].filter(material=>material instanceof B.PBRMaterial &&
    /Palacio ceremonial · (Aleación dorada|(Relieve|Sello) de la Caldera|Talla de (baranda|pilastra))/.test(material.name));
  const probe=new B.ReflectionProbe("Reflejos fijos del salón",128,scene,true,true);
  probe.position.copyFrom(B.Vector3.FromArray(position));
  probe.renderList=meshes.filter(mesh=>mesh.getTotalVertices()>0 && !materials.includes(mesh.material));
  probe.refreshRate=B.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  for (const material of materials) {
    if (material.metallicTexture) new GoldInlay(material);
    material.reflectionTexture=probe.cubeTexture;
    material.realTimeFiltering=true;
    material.realTimeFilteringQuality=B.Constants.TEXTURE_FILTERING_QUALITY_LOW;
    material.environmentIntensity=1.25;
    material.specularIntensity=1.0;
    material.metadata={...material.metadata,oro:true};
  }
  return {materials:materials.length,resolution:128,refresh:"once",dispose:()=>probe.dispose()};
}

export { acabadoDeOro };

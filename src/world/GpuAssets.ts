import { ImportMeshAsync, LoadAssetContainerAsync, type Scene } from '@babylonjs/core';
import { KhronosTextureContainer2 } from '@babylonjs/core/Misc/khronosTextureContainer2.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_basisu.js';
import { GPU_ASSET_URLS } from './gpuAssetManifest';

const enabled=new WeakSet<Scene>();

/** Local UASTC transcoders; unsupported GPUs retain the authored PNG/WebP assets. */
export function installGpuAssets(scene:Scene):void {
  const caps=scene.getEngine().getCaps();
  // Require high-quality block compression for normal/roughness maps too.
  if(!caps.bptc&&!caps.astc)return;
  const base=new URL('/assets/ktx2/',location.href).href;
  Object.assign(KhronosTextureContainer2.URLConfig,{
    jsDecoderModule:base+'babylon.ktx2Decoder.js',
    wasmUASTCToASTC:base+'uastc_astc.wasm',wasmUASTCToBC7:base+'uastc_bc7.wasm',
    wasmUASTCToRGBA_UNORM:base+'uastc_rgba8_unorm_v2.wasm',wasmUASTCToRGBA_SRGB:base+'uastc_rgba8_srgb_v2.wasm',
    wasmUASTCToR8_UNORM:base+'uastc_r8_unorm.wasm',wasmUASTCToRG8_UNORM:base+'uastc_rg8_unorm.wasm',
    jsMSCTranscoder:base+'msc_basis_transcoder.js',wasmMSCTranscoder:base+'msc_basis_transcoder.wasm',
    wasmZSTDDecoder:base+'zstddec.wasm'
  });
  KhronosTextureContainer2.DefaultNumWorkers=2;
  enabled.add(scene);scene.onDisposeObservable.addOnce(()=>enabled.delete(scene));
}

export function gpuAssetUrl(url:string,scene:Scene):string {
  return enabled.has(scene)?GPU_ASSET_URLS[url]??url:url;
}

function gpuOptions(options:Parameters<typeof ImportMeshAsync>[2]){
  return {...options,pluginOptions:{...options?.pluginOptions,gltf:{...options?.pluginOptions?.gltf,
    preprocessUrlAsync:async(url:string)=>gpuBuildingResourceUrl(url,location.href)}}};
}
export const importGpuMeshAsync:typeof ImportMeshAsync=(source,scene,options)=>{
  const resolved=typeof source==='string'?gpuAssetUrl(source,scene):source;
  return ImportMeshAsync(resolved,scene,resolved!==source?gpuOptions(options):options);
};
export const loadGpuAssetContainerAsync:typeof LoadAssetContainerAsync=(source,scene,options)=>{
  const resolved=typeof source==='string'?gpuAssetUrl(source,scene):source;
  return LoadAssetContainerAsync(resolved,scene,resolved!==source?gpuOptions(options):options);
};

/** Derived models may reference only their shared pool and original Rev3 bins. */
export function gpuBuildingResourceUrl(url:string,pageUrl:string):string {
  const resolved=new URL(url,pageUrl),page=new URL(pageUrl);
  if(resolved.origin!==page.origin||!/^\/assets\/(gpu\/(models\/[a-f0-9]+\.bin|textures\/[a-f0-9]+\.ktx2)|buildings\/brisalia-rev3-final\/shared_gltf\/[^/]+\.bin)$/.test(resolved.pathname))
    throw new Error(`GPU building resource outside its package: ${url}`);
  return resolved.href;
}

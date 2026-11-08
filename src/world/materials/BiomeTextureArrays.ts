import { RawTexture2DArray, Scene, Texture } from '@babylonjs/core';
import { BIOME_MATERIALS, BIOME_TEXTURE_SIZE } from './BiomeMaterialCatalog';

/** Two shared GPU textures instead of 34 independently bound maps per chunk. */
export function createBiomeTextureArrays(scene:Scene):{
  albedo:RawTexture2DArray;normal:RawTexture2DArray;ready:Promise<void>;dispose:()=>void
}{
  const size=BIOME_TEXTURE_SIZE,depth=BIOME_MATERIALS.length,stride=size*size*4;
  const colors=new Uint8Array(stride*depth),normals=new Uint8Array(stride*depth);
  for(let i=0;i<colors.length;i+=4){
    colors[i]=102;colors[i+1]=120;colors[i+2]=77;colors[i+3]=255;
    normals[i]=128;normals[i+1]=128;normals[i+2]=255;normals[i+3]=255;
  }
  const albedo=RawTexture2DArray.CreateRGBATexture(colors,size,size,depth,scene);
  const normal=RawTexture2DArray.CreateRGBATexture(normals,size,size,depth,scene);
  albedo.name='biome-albedos-shared';normal.name='biome-normals-shared';
  albedo.gammaSpace=true;normal.gammaSpace=false;
  for(const texture of [albedo,normal]){
    texture.wrapU=Texture.WRAP_ADDRESSMODE;texture.wrapV=Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel=4;
  }
  const controller=new AbortController();let disposed=false;
  const ready=(async()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    try {
      // Decode one image at a time, release its bitmap immediately. No source
      // textures, large atlases, per-chunk copies or persistent Image elements.
      for(let layer=0;layer<depth;layer++)for(const channel of ['albedo','normal'] as const){
        const response=await fetch(BIOME_MATERIALS[layer][channel],{signal:controller.signal});
        if(!response.ok)throw new Error(`${response.status}: ${BIOME_MATERIALS[layer][channel]}`);
        const bitmap=await createImageBitmap(await response.blob(),{
          resizeWidth:size,resizeHeight:size,resizeQuality:'high',colorSpaceConversion:'none'});
        try {
          if(disposed)return;
          ctx.clearRect(0,0,size,size);ctx.drawImage(bitmap,0,0,size,size);
          (channel==='albedo'?colors:normals).set(ctx.getImageData(0,0,size,size).data,layer*stride);
        } finally {bitmap.close();}
      }
      if(!disposed){albedo.update(colors);normal.update(normals);}
    } finally {canvas.width=canvas.height=1;}
  })();
  return {albedo,normal,ready,dispose:()=>{
    disposed=true;controller.abort();albedo.dispose();normal.dispose();
  }};
}

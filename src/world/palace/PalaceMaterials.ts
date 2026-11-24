import {Color3,DynamicTexture,PBRMaterial,RawTexture,Scene,Texture} from '@babylonjs/core';
import type {PalaceSurface} from './PalaceSurfaceMaps';
import type {PreparedSurface} from './PalaceSurfaceWorker';
const SHARED='/assets/buildings/brisalia-rev3-final/shared_textures/';
async function surfaceDetail(file:string){
  const image=new Image();image.src=SHARED+file;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(image,0,0,1024,1024);
  return context.getImageData(0,0,1024,1024).data;
}
export async function palaceMaterials(scene:Scene){
  const [stoneDetail,clayDetail]=await Promise.all([surfaceDetail('0040a7db35e55792.jpg'),surfaceDetail('18c7fb962f5ea055.webp')]);
  const surfaces=await new Promise<Record<PalaceSurface,PreparedSurface>>((resolve,reject)=>{
    const worker=new Worker(new URL('./PalaceSurfaceWorker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{worker.terminate();data.error?reject(new Error(data.error)):resolve(data.surfaces);};
    worker.onerror=e=>{worker.terminate();reject(new Error(e.message));};
    worker.postMessage({stone:stoneDetail,clay:clayDetail},[stoneDetail.buffer,clayDetail.buffer]);
  });
  const result=new Map<string,PBRMaterial>();
  const make=(name:string,color:string,surface?:PalaceSurface)=>{
    const m=new PBRMaterial('palace:'+name,scene);m.albedoColor=Color3.FromHexString(color);m.metallic=0;m.roughness=.82;m.environmentIntensity=.65;
    if(surface){
      const maps=surfaces[surface],texture=(name:string,bytes:Uint8Array,gamma:boolean)=>{
        const t=RawTexture.CreateRGBATexture(bytes,maps.size,maps.size,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);t.name='palace:'+surface+':'+name;t.gammaSpace=gamma;t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;return t;
      };
      m.albedoTexture=texture('albedo',maps.albedo,true);m.bumpTexture=texture('normal-height',maps.normalHeight,false);m.metallicTexture=texture('occlusion-roughness-metallic',maps.orm,false);
      m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=true;m.useAmbientOcclusionFromMetallicTextureRed=true;m.roughness=1;
      m.useParallax=false;m.useParallaxOcclusion=false;
      m.metadata={surface,normalMap:'height derivatives',bumpMap:'normal texture alpha',maps:['albedo','normal','height','roughness','occlusion'],resolution:maps.size};
    }
    result.set(name,m);return m;
  };
  make('plaster','#ffffff');make('stone','#ffffff','limestone');make('oak','#ffffff');make('roof','#ffffff','terracotta');make('paving','#ffffff','marble');
  make('trim','#ffffff','cutstone');make('column','#ffffff','whiteMarble');
  const photographic=(name:string,color:string,normal:string,orm:string,sx:number,sy:number,bump:number)=>{
    const m=result.get(name)!;
    for(const [property,file,gamma] of [['albedoTexture',color,true],['bumpTexture',normal,false],['metallicTexture',orm,false]] as const){
      const t=new Texture(SHARED+file,scene);t.gammaSpace=gamma;t.uScale=sx;t.vScale=sy;t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;m[property]=t;
    }
    m.bumpTexture!.level=bump;m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=true;m.roughness=1;
    m.metadata={maps:['albedo','normal','roughness'],source:SHARED,color,normal,orm};
  };
  photographic('plaster','a9220690d19deace.webp','e91ab1e504b229b7.webp','3e57033da8fca235.webp',.55,.55,.45);
  photographic('oak','eb32264c64539bb8.webp','b783872ed6817d52.webp','d2df8faea144fb55.webp',.33,.5,.25);
  for(const name of ['stone','paving'])for(const t of result.get(name)!.getActiveTextures()){
    if(t instanceof Texture){t.uScale=name==='stone'?.5:1/2.4;t.vScale=name==='stone'?2/3:1/2.4;}
  }
  // Reuse the authored oak grain and its matching normal map. Both maps use
  // the same longitudinal UVs; a solid beam never inherits world-axis mapping.
  const oak=result.get('oak')!;
  oak.albedoColor.set(.9,.84,.76);oak.useParallax=false;
  oak.metadata={...oak.metadata,grainAxis:'local V / timber length'};
  make('garden','#58713b','stucco');
  make('iron','#343936').metallic=.6;make('brass','#c89c4c').metallic=.28;make('gold','#d3a544').metallic=.35;
  make('linen','#f4e4c1');make('rose','#d68598');make('sage','#648878');make('ceramic','#e8e6d6');make('hidden','#ffffff');
  const glass=make('glass','#b9dedc');glass.alpha=.26;glass.roughness=.18;glass.backFaceCulling=false;
  const glow=make('light','#ffe4a1');glow.emissiveColor.set(1,.63,.2);
  const banner=make('banner','#ffffff','cloth'),texture=new DynamicTexture('palace:lantern-banner',{width:256,height:512},scene,false),ctx=texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle='#8e3d4b';ctx.fillRect(0,0,256,512);ctx.strokeStyle='#d6b564';ctx.lineWidth=5;ctx.strokeRect(12,12,232,488);
  ctx.strokeStyle='#d6b564';ctx.fillStyle='#e6c675';ctx.lineWidth=5;
  ctx.beginPath();ctx.ellipse(127,222,34,53,.65,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(159,173,23,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(177,164);ctx.lineTo(202,174);ctx.lineTo(177,180);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(105,240);ctx.lineTo(63,288);ctx.lineTo(119,260);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(124,258);ctx.lineTo(121,286);ctx.lineTo(105,286);ctx.moveTo(139,253);ctx.lineTo(144,283);ctx.lineTo(158,283);ctx.stroke();
  ctx.fillStyle='#7b3442';ctx.beginPath();ctx.arc(166,169,3,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(128,400);ctx.bezierCurveTo(67,361,45,322,55,281);ctx.moveTo(128,400);ctx.bezierCurveTo(189,361,211,322,201,281);ctx.stroke();
  for(const [x,y] of [[61,312],[80,347],[103,374],[195,312],[176,347],[153,374]])for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;ctx.fillStyle=i%2?'#f6bbc0':'#f5d4ce';ctx.beginPath();ctx.arc(x+Math.cos(a)*8,y+Math.sin(a)*8,7,0,Math.PI*2);ctx.fill();}
  texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;texture.update();banner.albedoTexture?.dispose();banner.albedoTexture=texture;banner.backFaceCulling=false;
  return result;
}




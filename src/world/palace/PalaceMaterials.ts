import {Color3,DynamicTexture,PBRMaterial,RawTexture,Scene,Texture} from '@babylonjs/core';
import {setMaterialLightBudget} from '../SceneLightBudget';
import type {PalaceSurface} from './PalaceSurfaceMaps';
import type {PreparedSurface} from './PalaceSurfaceWorker';
import {PalaceWeathering} from './PalaceWeathering';
const SHARED='/assets/buildings/brisalia-rev3-final/shared_textures/';
async function surfaceDetail(file:string){
  const image=new Image();image.src=SHARED+file;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(image,0,0,1024,1024);
  return context.getImageData(0,0,1024,1024).data;
}
export async function palaceMaterials(scene:Scene,floorHeight=0){
  const [stoneDetail,clayDetail]=await Promise.all([surfaceDetail('0040a7db35e55792.jpg'),surfaceDetail('18c7fb962f5ea055.webp')]);
  const surfaces=await new Promise<Record<PalaceSurface,PreparedSurface>>((resolve,reject)=>{
    const worker=new Worker(new URL('./PalaceSurfaceWorker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{worker.terminate();data.error?reject(new Error(data.error)):resolve(data.surfaces);};
    worker.onerror=e=>{worker.terminate();reject(new Error(e.message));};
    worker.postMessage({stone:stoneDetail,clay:clayDetail},[stoneDetail.buffer,clayDetail.buffer]);
  });
  const result=new Map<string,PBRMaterial>();
  const make=(name:string,color:string,surface?:PalaceSurface)=>{
    const m=new PBRMaterial('palace:'+name,scene);m.albedoColor=Color3.FromHexString(color);m.metallic=0;m.roughness=.82;m.environmentIntensity=.46;
    if(surface){
      const maps=surfaces[surface],texture=(name:string,bytes:Uint8Array,gamma:boolean)=>{
        const t=RawTexture.CreateRGBATexture(bytes,maps.size,maps.size,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);t.name='palace:'+surface+':'+name;t.gammaSpace=gamma;t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;return t;
      };
      m.albedoTexture=texture('albedo',maps.albedo,true);m.bumpTexture=texture('normal-height',maps.normalHeight,false);m.metallicTexture=texture('occlusion-roughness-metallic',maps.orm,false);
      m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=true;m.useAmbientOcclusionFromMetallicTextureRed=true;m.roughness=1;
      const dressed=['limestone','cutstone','flagstone','masonry'].includes(surface);
      // RGB perturbs the lighting normal; alpha drives a second, view-dependent
      // height lookup. Keep it shallow so stone edges do not swim at grazing angles.
      m.useParallax=dressed;m.useParallaxOcclusion=dressed;m.parallaxScaleBias=surface==='masonry'?.018:surface==='flagstone'?.012:surface==='limestone'?.009:.006;
      m.bumpTexture.level=dressed?.8:1;
      m.metadata={surface,normalMap:'height derivatives',bumpMap:'normal texture alpha',heightRelief:dressed?'parallax occlusion':'normal only',maps:['albedo','normal','height','roughness','occlusion'],resolution:maps.size};
    }
    setMaterialLightBudget(m,5);result.set(name,m);return m;
  };
  make('floorOak','#ffffff','floorboards');make('plaster','#ffffff');make('stone','#d9c9aa','limestone');make('oak','#ffffff');make('roof','#ffffff','clay');make('paving','#ffffff','flagstone');make('masonry','#ffffff','masonry');make('stairStone','#d5c4a5','cutstone');
  for(const [name,color] of [['roofTile','#ffffff'],['roofHoney','#ffdfb2'],['roofRusset','#d9a48b']]){
    const m=result.get('roof')!.clone('palace:'+name)!;m.albedoColor=Color3.FromHexString(color);setMaterialLightBudget(m,5);result.set(name,m);
  }
  make('trim','#cdbb9c','cutstone');make('column','#d2c2a5','cutstone');
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
  for(const [name,metres] of [['stone',2.4],['paving',3.8],['masonry',3]] as const)for(const t of result.get(name)!.getActiveTextures()){
    if(t instanceof Texture){t.uScale=t.vScale=1/metres;}
  }
  // Reuse the authored oak grain and its matching normal map. Both maps use
  // the same longitudinal UVs; a solid beam never inherits world-axis mapping.
  const oak=result.get('oak')!;
  oak.albedoColor.set(.93,.78,.59);oak.useParallax=false;
  oak.metadata={...oak.metadata,grainAxis:'local V / timber length'};
  make('garden','#ffffff','earth');
  for(const name of ['stone','trim','column','plaster','oak','paving','garden','masonry','stairStone'])new PalaceWeathering(result.get(name)!,floorHeight,name==='garden');
  for(const [name,color] of [['leaf','#45612a'],['flowerPink','#e679a1'],['flowerCream','#fff1d9'],['flowerBlue','#9986cc'],['pollen','#d9a836']]){
    const m=make(name,color);m.roughness=.92;m.backFaceCulling=false;m.environmentIntensity=.25;
  }
  make('iron','#343936').metallic=.6;make('brass','#c89c4c').metallic=.28;make('gold','#d3a544').metallic=.35;
  make('velvet','#803d42','cloth');make('linen','#f4e4c1','cloth');make('rose','#e99ab0','cloth');make('sage','#4b692f');make('ceramic','#e8e6d6');make('pottery','#a77b51');make('hidden','#ffffff');
  const glass=make('glass','#b9dedc');glass.alpha=.26;glass.roughness=.18;glass.backFaceCulling=false;
  const glow=make('light','#ffe4a1');glow.emissiveColor.set(1,.63,.2);
  const banner=make('banner','#ffffff','cloth'),texture=new DynamicTexture('palace:lantern-banner',{width:256,height:512},scene,false),ctx=texture.getContext() as unknown as CanvasRenderingContext2D;
  const cloth=ctx.createLinearGradient(0,0,256,0);cloth.addColorStop(0,'#c99838');cloth.addColorStop(.2,'#f2cd68');cloth.addColorStop(.5,'#edc05a');cloth.addColorStop(.8,'#ffe093');cloth.addColorStop(1,'#c99838');
  ctx.fillStyle=cloth;ctx.fillRect(0,0,256,512);ctx.strokeStyle='#925021';ctx.lineWidth=4;ctx.strokeRect(13,13,230,486);
  ctx.strokeStyle='#873d2d';ctx.fillStyle='#873d2d';ctx.lineWidth=8;ctx.lineJoin='round';
  // The palace device is a lantern, with a clear cap, frame and warm flame.
  ctx.beginPath();ctx.moveTo(128,103);ctx.lineTo(91,154);ctx.lineTo(165,154);ctx.closePath();ctx.fill();
  ctx.fillRect(83,157,90,10);ctx.fillRect(93,272,70,10);
  ctx.beginPath();ctx.moveTo(92,172);ctx.lineTo(103,270);ctx.lineTo(153,270);ctx.lineTo(164,172);ctx.closePath();ctx.stroke();
  ctx.beginPath();ctx.moveTo(128,167);ctx.lineTo(128,276);ctx.moveTo(104,284);ctx.lineTo(152,284);ctx.moveTo(128,285);ctx.lineTo(128,308);ctx.stroke();
  ctx.beginPath();ctx.arc(128,93,10,0,Math.PI*2);ctx.stroke();
  ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(128,400);ctx.bezierCurveTo(67,361,45,322,55,281);ctx.moveTo(128,400);ctx.bezierCurveTo(189,361,211,322,201,281);ctx.stroke();
  for(const [x,y] of [[61,312],[80,347],[103,374],[195,312],[176,347],[153,374]])for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;ctx.fillStyle=i%2?'#f6bbc0':'#f5d4ce';ctx.beginPath();ctx.arc(x+Math.cos(a)*8,y+Math.sin(a)*8,7,0,Math.PI*2);ctx.fill();}
  texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;texture.update();banner.albedoTexture?.dispose();banner.albedoTexture=texture;banner.backFaceCulling=false;
  return result;
}




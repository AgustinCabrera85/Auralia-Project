export const RENDER_QUALITIES=[
  {id:'balanced',label:'Equilibrada',detail:'Buen detalle con menor consumo. Hasta 1920 × 1080.',longSide:1920,shortSide:1080},
  {id:'performance',label:'Rendimiento',detail:'Más liviana para pantallas grandes. Hasta 1600 × 900.',longSide:1600,shortSide:900},
  {id:'native',label:'Nativa',detail:'Máxima nitidez 3D a la resolución de tu pantalla. Mayor consumo.',longSide:Infinity,shortSide:Infinity}
] as const;
export type RenderQuality=typeof RENDER_QUALITIES[number]['id'];
const STORAGE_KEY='auralia-render-quality-v1';

export function readRenderQuality():RenderQuality{
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    return RENDER_QUALITIES.find(profile=>profile.id===saved)?.id??'balanced';
  }catch{return 'balanced';}
}

export function saveRenderQuality(quality:RenderQuality):void{
  try{localStorage.setItem(STORAGE_KEY,quality);}catch{/* Still apply it for this session. */}
}

/** Cap physical render pixels independently of the CSS size of the HUD/canvas. */
export function renderResolution(cssWidth:number,cssHeight:number,deviceRatio:number,
  quality:RenderQuality):{width:number;height:number;hardwareScalingLevel:number}{
  const width=Number.isFinite(cssWidth)&&cssWidth>0?cssWidth:1;
  const height=Number.isFinite(cssHeight)&&cssHeight>0?cssHeight:1;
  const ratio=Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1;
  const profile=RENDER_QUALITIES.find(p=>p.id===quality)??RENDER_QUALITIES[0];
  const hardwareScalingLevel=Math.max(1/ratio,
    Math.max(width,height)/profile.longSide,Math.min(width,height)/profile.shortSide);
  return {width:Math.max(1,Math.floor(width/hardwareScalingLevel)),
    height:Math.max(1,Math.floor(height/hardwareScalingLevel)),hardwareScalingLevel};
}

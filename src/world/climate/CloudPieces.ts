
import {
  Color3, Effect, Engine, Mesh, RawTexture, Scene, ShaderMaterial, Texture,
  Vector2, Vector3, VertexBuffer, type ArcRotateCamera
} from '@babylonjs/core';
import type { ClimateFrame } from './ClimateModel';
import { getAuraliaWind, type AuraliaWindState } from '../AuraliaWindSystem';

type Family='fair'|'storm';
type Source='painted'|'modular';
type AtlasPart={id:string;atlas:Family;rectPx:[number,number,number,number]};
type AtlasInfo={size:[number,number];color:string;data:string};
type AtlasCatalog={atlases:Record<Family,AtlasInfo>;parts:AtlasPart[]};
type PartLayout={source:Source;id:string;x:number;y:number;width:number;height:number;opacity:number};
type SourceAtlas={color:HTMLCanvasElement;data:HTMLCanvasElement;
  catalog:AtlasCatalog;family:Family;trims:Map<string,[number,number,number,number]>};
type CloudGroup={mesh:Mesh;material:ShaderMaterial;colors:RawTexture[];
  masks:RawTexture[];family:Family};

const ASSET_ROOT='/assets/auralia-clouds/';
const CELL=256;
const VARIANTS=4;
const ATLAS_WIDTH=CELL*VARIANTS;
const RADIUS=1460;
const CLOUD_COLUMNS=6;
const CLOUD_ROWS=4;
const QUALITY_SLOTS={low:{fair:12,storm:8},standard:{fair:20,storm:12},
  high:{fair:28,storm:16}} as const;

// Every support overlaps the main painted mass. A painted core is drawn last
// so different source pieces read as one cloud rather than detached sprites.
const FORMATIONS:Record<Family,PartLayout[][]>={
  fair:[
    [
      {source:'modular',id:'flat_base',x:.10,y:.53,width:.80,height:.27,opacity:.52},
      {source:'modular',id:'crown_tall',x:.30,y:.16,width:.36,height:.46,opacity:.48},
      {source:'painted',id:'crown_round',x:.08,y:.27,width:.84,height:.51,opacity:1}
    ],
    [
      {source:'modular',id:'wide_base',x:.07,y:.55,width:.86,height:.26,opacity:.44},
      {source:'modular',id:'twin_puff',x:.12,y:.20,width:.39,height:.39,opacity:.50},
      {source:'painted',id:'twin_puff',x:.10,y:.29,width:.81,height:.49,opacity:1}
    ],
    [
      {source:'modular',id:'flat_base',x:.12,y:.55,width:.78,height:.26,opacity:.52},
      {source:'modular',id:'tower',x:.27,y:.13,width:.38,height:.48,opacity:.47},
      {source:'painted',id:'triple_puff',x:.08,y:.30,width:.85,height:.48,opacity:1}
    ],
    [
      {source:'modular',id:'wide_base',x:.10,y:.55,width:.82,height:.25,opacity:.48},
      {source:'modular',id:'stack',x:.52,y:.19,width:.36,height:.43,opacity:.46},
      {source:'painted',id:'small_puff',x:.09,y:.29,width:.82,height:.50,opacity:1}
    ]
  ],
  storm:[
    [
      {source:'modular',id:'storm_base',x:.06,y:.55,width:.88,height:.30,opacity:.74},
      {source:'modular',id:'storm_anvil',x:.27,y:.16,width:.53,height:.45,opacity:.58},
      {source:'painted',id:'storm_tower',x:.08,y:.27,width:.84,height:.54,opacity:1}
    ],
    [
      {source:'modular',id:'storm_rolling',x:.06,y:.55,width:.90,height:.29,opacity:.72},
      {source:'modular',id:'storm_tower',x:.18,y:.13,width:.47,height:.51,opacity:.56},
      {source:'painted',id:'storm_column',x:.10,y:.28,width:.82,height:.52,opacity:1}
    ],
    [
      {source:'modular',id:'storm_base',x:.06,y:.55,width:.88,height:.30,opacity:.76},
      {source:'modular',id:'storm_anvil',x:.16,y:.15,width:.59,height:.46,opacity:.57},
      {source:'painted',id:'storm_column',x:.09,y:.28,width:.84,height:.53,opacity:1}
    ],
    [
      {source:'modular',id:'storm_surge',x:.05,y:.55,width:.90,height:.30,opacity:.72},
      {source:'modular',id:'storm_column',x:.45,y:.12,width:.40,height:.53,opacity:.54},
      {source:'painted',id:'storm_tower',x:.08,y:.27,width:.84,height:.54,opacity:1}
    ]
  ]
};

const VERTEX_SHADER=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec3 cloudCenter;
attribute vec2 cloudOffset;
attribute vec3 cloudMeta;
uniform mat4 worldViewProjection;
uniform float uTime;
uniform float uTravel;
uniform float uCoverage;
uniform float uWindStrength;
uniform vec2 uWindDirection;
varying vec2 vUV;
varying float vLife;
varying float vSeed;
void main(void){
  // A formation grows as one mass; its parts never move independently.
  float activation=smoothstep(cloudMeta.x-.07,cloudMeta.x+.08,uCoverage);
  float breath=1.0+.018*sin(uTime*.018+cloudMeta.y);
  vLife=activation;
  vSeed=cloudMeta.y;
  // Move the center with the wind, then map the painted formation onto the
  // sky sphere. Its shape stays fixed in the sky when the camera turns.
  vec3 axis=normalize(vec3(uWindDirection.y,0.0,-uWindDirection.x));
  float angle=uTravel*.0011*cloudMeta.z;
  float c=cos(angle),s=sin(angle);
  vec3 center=cloudCenter*c+cross(axis,cloudCenter)*s+
    axis*dot(axis,cloudCenter)*(1.0-c);
  vec3 radial=normalize(center);
  float horizontal=length(center.xz);
  vec3 right=horizontal>.001
    ?vec3(center.z,0.0,-center.x)/horizontal:vec3(1.0,0.0,0.0);
  vec3 up=normalize(cross(radial,right));
  float scale=mix(.88,1.0,activation)*breath;
  vec3 p=normalize(center+(right*cloudOffset.x+up*cloudOffset.y)*scale)*
    length(center);
  p.y+=sin(uTime*.010+cloudMeta.y)*3.0*cloudMeta.z*
    (.5+uWindStrength);
  vUV=uv;
  gl_Position=worldViewProjection*vec4(p,1.0);
}`;

const FRAGMENT_SHADER=`
precision highp float;
varying vec2 vUV;
varying float vLife;
varying float vSeed;
uniform sampler2D uColor0;
uniform sampler2D uColor1;
uniform sampler2D uColor2;
uniform sampler2D uMask0;
uniform sampler2D uMask1;
uniform sampler2D uMask2;
uniform vec2 uTexel;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform float uDayLight;
uniform float uNight;
uniform float uTime;
uniform float uFamilyWeight;
uniform float uStorm;
uniform float uStage;
vec2 inCell(vec2 uv){
  float left=floor(vUV.x*4.0)*.25+4.0*uTexel.x;
  return clamp(uv,vec2(left,4.0*uTexel.y),
    vec2(left+.25-8.0*uTexel.x,1.0-4.0*uTexel.y));
}
void main(void){
  // Each atlas component flows within one cell. A shared low-frequency warp
  // bends the formation while independent phases change its internal outline.
  float phase=uTime*.080+vSeed;
  vec2 warp=vec2(sin(vUV.y*21.0+phase),cos(vUV.x*32.0-phase*.7))
    *uTexel*3.5;
  vec2 uv0=inCell(vUV+warp+vec2(sin(phase*.57),cos(phase*.48))*uTexel*5.0);
  vec2 uv1=inCell(vUV+warp+vec2(sin(phase*.83+1.4),
    cos(phase*.69+2.1))*uTexel*12.0);
  vec2 uv2=inCell(vUV+warp*1.35+
    vec2(sin(phase*.41),cos(phase*.37))*uTexel*5.0);
  vec4 base=texture2D(uColor0,uv0);
  vec4 lobe=texture2D(uColor1,uv1);
  vec4 core=texture2D(uColor2,uv2);
  vec3 mask0=texture2D(uMask0,uv0).rgb;
  vec3 mask1=texture2D(uMask1,uv1).rgb;
  vec3 mask2=texture2D(uMask2,uv2).rgb;
  // A lobe forms, erodes and joins the stable core. Premultiplied weights
  // make the three atlas components one continuous transparent cloud.
  float swell=.5+.5*sin(phase*.69);
  float formation=smoothstep(.14,.72,swell);
  float a0=base.a*(.48+.45*formation);
  float a1=lobe.a*formation;
  float a2=core.a*(.72+.26*(.5+.5*sin(phase*.33)));
  float w2=a2,w1=a1*(1.0-a2),w0=a0*(1.0-a1)*(1.0-a2);
  float coverage=w0+w1+w2;
  float thickness=(mask0.g*w0+mask1.g*w1+mask2.g*w2)/
    max(coverage,.001);
  // Formations periodically dissolve and reform at different phases;
  // their components keep moving while the climate clock is paused.
  float renewal=smoothstep(.03,.22,
    .5+.5*sin(uTime*.045+vSeed*.91));
  float alpha=coverage*vLife*uFamilyWeight*renewal;
  if(alpha<.003)discard;
  vec3 paint=(base.rgb*w0+lobe.rgb*w1+core.rgb*w2)/
    max(coverage,.001);
  if(uStage<5.5){gl_FragColor=vec4(paint,alpha);return;}
  // The merged thickness controls one light response across all components.
  float gx=texture2D(uMask2,inCell(uv2+vec2(uTexel.x*2.0,0.0))).g;
  float gy=texture2D(uMask2,inCell(uv2+vec2(0.0,uTexel.y*2.0))).g;
  vec3 normal=normalize(vec3((mask2.g-gx)*2.3,.80,
    (mask2.g-gy)*2.3));
  vec3 lightDir=normalize((1.0-uNight)*uSunDir+uNight*uMoonDir+
    vec3(0.0,.19,0.0));
  float lit=max(dot(normal,lightDir),0.0);
  float underside=1.0-smoothstep(.20,.58,vUV.y);
  float shade=(.80+.17*lit-.12*underside-.08*thickness*(1.0-lit))
    *(1.0-uStorm*.18);
  float pale=dot(paint,vec3(.30,.59,.11));
  vec3 nightPaint=vec3(pale)*vec3(.30,.38,.52);
  vec3 color=mix(nightPaint,paint,uDayLight)*shade;
  color=mix(color,color*uCloudColor, .30);
  // Brighten the dark painted contour and let the soft alpha carry the edge.
  float border=min(mask2.r,min(
    texture2D(uMask2,inCell(uv2+vec2(uTexel.x*2.0,0.0))).r,
    min(texture2D(uMask2,inCell(uv2-vec2(uTexel.x*2.0,0.0))).r,
    min(texture2D(uMask2,inCell(uv2+vec2(0.0,uTexel.y*2.0))).r,
    texture2D(uMask2,inCell(uv2-vec2(0.0,uTexel.y*2.0))).r))));
  float edge=1.0-smoothstep(.03,.75,border);
  color=mix(color,uCloudColor*(.74+.28*uDayLight),edge*.58);
  gl_FragColor=vec4(color,alpha);
}`;

const clamp01=(value:number)=>Math.max(0,Math.min(1,value));
const smooth=(value:number)=>{const t=clamp01(value);return t*t*(3-2*t);};
const canvas=(width:number,height:number):HTMLCanvasElement=>{
  const result=document.createElement('canvas');
  result.width=width;result.height=height;return result;
};
const context=(surface:HTMLCanvasElement):CanvasRenderingContext2D=>{
  const result=surface.getContext('2d',{willReadFrequently:true});
  if(!result)throw new Error('Cloud composition needs Canvas 2D');
  return result;
};

/** Four original atlases become two coherent formation atlases at startup. */
export class CloudPieces {
  private readonly groups:CloudGroup[]=[];
  private readonly wind:AuraliaWindState;
  private readonly quality:keyof typeof QUALITY_SLOTS;
  private readonly windDirection=new Vector2(1,0);
  private readonly sunDirection=new Vector3(0,1,0);
  private readonly moonDirection=new Vector3(0,-1,0);
  private readonly sunColor=new Color3(1,1,1);
  private readonly cloudColor=new Color3(1,1,1);
  private disposed=false;
  private ready=false;
  private latestTime=0;
  private readyAt=0;
  private previousTime=0;
  private windTravel=0;
  private cloudAmount=.05;
  private stormAmount=0;
  private initializedWeather=false;
  private debugStage=6;
  private debugPanel:HTMLDivElement|null=null;
  visibility=0;

  constructor(private readonly scene:Scene,private readonly camera:ArcRotateCamera){
    this.wind=getAuraliaWind(scene);
    const query=new URLSearchParams(location.search);
    const requested=query.get('cloudQuality');
    this.quality=requested==='low'||requested==='high'?requested:'standard';
    Effect.ShadersStore['auraliaCloudPiecesVertexShader']=VERTEX_SHADER;
    Effect.ShadersStore['auraliaCloudPiecesFragmentShader']=FRAGMENT_SHADER;
    if(query.has('cloudDebug'))this.makeDebugPanel();
    void this.load().catch(error=>{
      if(!this.disposed)console.warn('Cloud atlas composition failed; painted clouds are unavailable.',error);
    });
  }

  private async json<T>(path:string):Promise<T>{
    const response=await fetch(ASSET_ROOT+path);
    if(!response.ok)throw new Error(path+': '+response.status);
    return response.json() as Promise<T>;
  }

  private image(path:string):Promise<HTMLImageElement>{
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error('Could not load '+path));
      image.src=ASSET_ROOT+path;
    });
  }

  private async source(source:Source,family:Family,catalog:AtlasCatalog):Promise<SourceAtlas>{
    const info=catalog.atlases[family];
    const [colorImage,dataImage]=await Promise.all([
      this.image(source+'/'+info.color),this.image(source+'/'+info.data)
    ]);
    const color=canvas(...info.size),data=canvas(...info.size);
    context(color).drawImage(colorImage,0,0);
    const dataContext=context(data);
    dataContext.drawImage(dataImage,0,0);
    // Painted data PNG has opaque A outside the silhouette. Replace it with R
    // once, so Canvas 2D can merge thickness and edge detail by coverage.
    const pixels=dataContext.getImageData(0,0,data.width,data.height);
    for(let i=0;i<pixels.data.length;i+=4)pixels.data[i+3]=pixels.data[i];
    dataContext.putImageData(pixels,0,0);
    return {color,data,catalog,family,trims:new Map()};
  }

  private trim(source:SourceAtlas,part:AtlasPart):[number,number,number,number]{
    const saved=source.trims.get(part.id);
    if(saved)return saved;
    const [left,top,width,height]=part.rectPx;
    const alpha=context(source.color).getImageData(left,top,width,height).data;
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      if(alpha[(y*width+x)*4+3]<=8)continue;
      minX=Math.min(minX,x);minY=Math.min(minY,y);
      maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    if(maxX<0)throw new Error('Empty cloud segment: '+part.id);
    const box:[number,number,number,number]=[
      left+Math.max(0,minX-2),top+Math.max(0,minY-2),
      Math.min(width,maxX+3)-Math.max(0,minX-2),
      Math.min(height,maxY+3)-Math.max(0,minY-2)
    ];
    source.trims.set(part.id,box);
    return box;
  }

  private drawFormation(color:CanvasRenderingContext2D,data:CanvasRenderingContext2D,
    family:Family,variant:number,sources:Record<Source,SourceAtlas>,
    blend:boolean,role?:number):void{
    const layouts=FORMATIONS[family][variant];
    for(const layout of role===undefined?layouts:[layouts[role]]){
      const source=sources[layout.source];
      const part=source.catalog.parts.find(item=>item.id===layout.id&&item.atlas===family);
      if(!part)throw new Error('Missing cloud segment: '+layout.id);
      const [sx,sy,sw,sh]=this.trim(source,part);
      const dx=variant*CELL+layout.x*CELL,dy=layout.y*CELL;
      const dw=layout.width*CELL,dh=layout.height*CELL;
      const opacity=blend?layout.opacity:1;
      color.globalAlpha=opacity;data.globalAlpha=opacity;
      color.drawImage(source.color,sx,sy,sw,sh,dx,dy,dw,dh);
      data.drawImage(source.data,sx,sy,sw,sh,dx,dy,dw,dh);
    }
    color.globalAlpha=1;data.globalAlpha=1;
  }

  private bleedEdges(pixels:Uint8ClampedArray):void{
    // Fill RGB around low-alpha pixels, preserving A. Bilinear filtering and
    // mipmaps then sample cloud color instead of transparent black.
    const distance=new Uint8Array(ATLAS_WIDTH*CELL);
    const queue=new Int32Array(distance.length);
    let tail=0;
    for(let i=0;i<distance.length;i++)if(pixels[i*4+3]>=24){
      distance[i]=1;queue[tail++]=i;
    }
    const visit=(index:number,from:number,depth:number)=>{
      if(distance[index])return;
      const target=index*4,source=from*4;
      pixels[target]=pixels[source];pixels[target+1]=pixels[source+1];
      pixels[target+2]=pixels[source+2];
      distance[index]=depth;queue[tail++]=index;
    };
    for(let head=0;head<tail;head++){
      const index=queue[head],depth=distance[index]+1;
      if(depth>13)continue;
      const x=index%ATLAS_WIDTH,y=Math.floor(index/ATLAS_WIDTH);
      const first=Math.floor(x/CELL)*CELL,last=first+CELL-1;
      if(x>first)visit(index-1,index,depth);
      if(x<last)visit(index+1,index,depth);
      if(y>0)visit(index-ATLAS_WIDTH,index,depth);
      if(y<CELL-1)visit(index+ATLAS_WIDTH,index,depth);
    }
  }

  private softenAlpha(pixels:Uint8ClampedArray):void{
    // Local coverage filtering removes hard atlas cutouts without blurring
    // the painted RGB detail. Cell padding prevents neighboring contamination.
    const before=new Uint8Array(ATLAS_WIDTH*CELL);
    for(let i=0;i<before.length;i++)before[i]=pixels[i*4+3];
    for(let y=0;y<CELL;y++)for(let x=0;x<ATLAS_WIDTH;x++){
      const left=Math.floor(x/CELL)*CELL,right=left+CELL-1;
      let sum=0,samples=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx<left||nx>right||ny<0||ny>=CELL)continue;
        sum+=before[ny*ATLAS_WIDTH+nx];samples++;
      }
      const index=y*ATLAS_WIDTH+x;
      pixels[index*4+3]=Math.round(before[index]*.48+sum/samples*.52);
    }
  }

  private compose(family:Family,sources:Record<Source,SourceAtlas>):{
    colors:RawTexture[];masks:RawTexture[];preview:HTMLCanvasElement}{
    const layers=Array.from({length:3},()=>({
      color:canvas(ATLAS_WIDTH,CELL),mask:canvas(ATLAS_WIDTH,CELL)
    }));
    for(let role=0;role<3;role++)
      for(let variant=0;variant<VARIANTS;variant++)
        this.drawFormation(context(layers[role].color),context(layers[role].mask),
          family,variant,sources,true,role);
    // Supports are allowed to bulge around the painted core, never form a
    // separate grey oval or floating lobe behind it.
    const gate=canvas(ATLAS_WIDTH,CELL),gateContext=context(gate);
    gateContext.filter='blur(12px)';
    gateContext.drawImage(layers[2].color,0,0);
    gateContext.filter='none';
    const gatePixels=gateContext.getImageData(0,0,ATLAS_WIDTH,CELL);
    for(let i=3;i<gatePixels.data.length;i+=4)
      gatePixels.data[i]=Math.round(255*smooth((gatePixels.data[i]/255-.16)/.47));
    gateContext.putImageData(gatePixels,0,0);
    for(let role=0;role<2;role++){
      for(const surface of [layers[role].color,layers[role].mask]){
        const target=context(surface);
        target.globalCompositeOperation='destination-in';
        target.drawImage(gate,0,0);
        target.globalCompositeOperation='source-over';
      }
    }
    const colors:RawTexture[]=[],masks:RawTexture[]=[];
    const preview=canvas(CELL,CELL),previewContext=context(preview);
    for(let role=0;role<3;role++){
      const colorContext=context(layers[role].color);
      const maskContext=context(layers[role].mask);
      const colorPixels=colorContext.getImageData(0,0,ATLAS_WIDTH,CELL);
      const maskPixels=maskContext.getImageData(0,0,ATLAS_WIDTH,CELL);
      this.softenAlpha(colorPixels.data);
      for(let i=0;i<maskPixels.data.length;i+=4){
        maskPixels.data[i]=colorPixels.data[i+3];
        maskPixels.data[i+3]=255;
      }
      this.bleedEdges(colorPixels.data);
      colorContext.putImageData(colorPixels,0,0);
      previewContext.drawImage(layers[role].color,0,0,CELL,CELL,
        0,0,CELL,CELL);
      const color=new RawTexture(new Uint8Array(colorPixels.data),
        ATLAS_WIDTH,CELL,Engine.TEXTUREFORMAT_RGBA,this.scene,true,true,
        Texture.TRILINEAR_SAMPLINGMODE);
      const mask=new RawTexture(new Uint8Array(maskPixels.data),
        ATLAS_WIDTH,CELL,Engine.TEXTUREFORMAT_RGBA,this.scene,true,true,
        Texture.TRILINEAR_SAMPLINGMODE);
      color.wrapU=mask.wrapU=Texture.CLAMP_ADDRESSMODE;
      color.wrapV=mask.wrapV=Texture.CLAMP_ADDRESSMODE;
      color.hasAlpha=true;mask.gammaSpace=false;
      colors.push(color);masks.push(mask);
    }
    return {colors,masks,preview};
  }

  private makeGeometry(family:Family){
    const positions:number[]=[],uvs:number[]=[],centers:number[]=[],offsets:number[]=[],metas:number[]=[],indices:number[]=[];
    const count=QUALITY_SLOTS[this.quality??'standard'][family];
    for(let i=0;i<count;i++){
      const seed=(i*.61803398875)%1;
      const yaw=i*2.3999632297+(family==='storm'?.71:0);
      const elevation=.18+((i*.754877666)%1)*1.08;
      const direction=new Vector3(Math.sin(yaw)*Math.cos(elevation),
        Math.sin(elevation),Math.cos(yaw)*Math.cos(elevation));
      const right=new Vector3(Math.cos(yaw),0,-Math.sin(yaw));
      const up=new Vector3(-Math.sin(yaw)*Math.sin(elevation),
        Math.cos(elevation),-Math.cos(yaw)*Math.sin(elevation));
      const depth=family==='storm'?.90+seed*.11:1.02+seed*.13;
      const center=direction.scale(RADIUS*depth);
      const width=(family==='storm'?760:520)*(.86+seed*.20);
      const aspectSeed=(i*.41421356)%1;
      const halfWidth=width*.5,halfHeight=width*
        (family==='storm'?.31+aspectSeed*.10:.26+aspectSeed*.11);
      const variant=(i+Math.floor(i/VARIANTS))%VARIANTS;
      const flip=i%3===1;
      const u0=(variant*CELL+4)/ATLAS_WIDTH,u1=((variant+1)*CELL-4)/ATLAS_WIDTH;
      const v0=4/CELL,v1=1-4/CELL;
      const start=positions.length/3;
      for(let row=0;row<=CLOUD_ROWS;row++)for(let column=0;column<=CLOUD_COLUMNS;column++){
        const horizontal=column/CLOUD_COLUMNS*2-1;
        const vertical=row/CLOUD_ROWS*2-1;
        const offsetX=horizontal*halfWidth,offsetY=vertical*halfHeight;
        const point=center.add(right.scale(offsetX)).add(up.scale(offsetY));
        const u=flip?u1-(u1-u0)*column/CLOUD_COLUMNS:
          u0+(u1-u0)*column/CLOUD_COLUMNS;
        const v=v0+(v1-v0)*row/CLOUD_ROWS;
        positions.push(point.x,point.y,point.z);
        uvs.push(u,v);
        centers.push(center.x,center.y,center.z);
        offsets.push(offsetX,offsetY);
        const threshold=family==='fair'
          ?i<2?.025:.16+(i-2)*.72/(count-2)
          :.57+i*.40/(count-1);
        metas.push(threshold,i*2.39,depth);
      }
      for(let row=0;row<CLOUD_ROWS;row++)for(let column=0;column<CLOUD_COLUMNS;column++){
        const a=start+row*(CLOUD_COLUMNS+1)+column;
        indices.push(a,a+1,a+CLOUD_COLUMNS+2,a,a+CLOUD_COLUMNS+2,a+CLOUD_COLUMNS+1);
      }
    }
    return {positions,uvs,centers,offsets,metas,indices,count};
  }

  private async load():Promise<void>{
    const [painted,modular]=await Promise.all([
      this.json<AtlasCatalog>('painted/painted_segments.json'),
      this.json<AtlasCatalog>('modular/cloud_segments.json')
    ]);
    if(this.disposed)return;
    const familySources={
      fair:Promise.all([this.source('painted','fair',painted),
        this.source('modular','fair',modular)]),
      storm:Promise.all([this.source('painted','storm',painted),
        this.source('modular','storm',modular)])
    };
    for(const family of ['fair','storm'] as const){
      const [paintedSource,modularSource]=await familySources[family];
      if(this.disposed)return;
      const sources={painted:paintedSource,modular:modularSource};
      if(family==='fair'&&this.debugPanel)this.fillDebugPreviews(sources);
      const atlas=this.compose(family,sources);
      if(family==='fair'&&this.debugPanel){
        const image=this.debugPanel.querySelector('img');
        if(image)image.dataset.stage4=atlas.preview.toDataURL();
      }
      const geometry=this.makeGeometry(family);
      const mesh=new Mesh('auralia-cloud-formations-'+family,this.scene);
      mesh.setVerticesData(VertexBuffer.PositionKind,geometry.positions,false,3);
      mesh.setVerticesData(VertexBuffer.UVKind,geometry.uvs,false,2);
      mesh.setVerticesData('cloudCenter',geometry.centers,false,3);
      mesh.setVerticesData('cloudOffset',geometry.offsets,false,2);
      mesh.setVerticesData('cloudMeta',geometry.metas,false,3);
      mesh.setIndices(geometry.indices);
      const material=new ShaderMaterial('auralia-cloud-formation-mat-'+family,
        this.scene,{vertex:'auraliaCloudPieces',fragment:'auraliaCloudPieces'},
        {attributes:['position','uv','cloudCenter','cloudOffset','cloudMeta'],
          uniforms:['worldViewProjection','uTime','uTravel','uCoverage','uWindStrength',
            'uWindDirection','uTexel','uSunDir','uMoonDir','uSunColor',
            'uCloudColor','uDayLight','uNight','uFamilyWeight','uStorm','uStage'],
          samplers:['uColor0','uColor1','uColor2',
            'uMask0','uMask1','uMask2'],needAlphaBlending:true});
      for(let role=0;role<3;role++){
        material.setTexture('uColor'+role,atlas.colors[role]);
        material.setTexture('uMask'+role,atlas.masks[role]);
      }
      material.setVector2('uTexel',new Vector2(1/ATLAS_WIDTH,1/CELL));
      material.backFaceCulling=false;
      material.disableDepthWrite=true;
      material.fogEnabled=false;
      material.alphaMode=Engine.ALPHA_COMBINE;
      mesh.material=material;
      mesh.isPickable=false;mesh.checkCollisions=false;
      mesh.alwaysSelectAsActiveMesh=true;mesh.applyFog=false;
      mesh.setEnabled(false);
      this.groups.push({mesh,material,colors:atlas.colors,masks:atlas.masks,family});
    }
    this.readyAt=this.latestTime;
    this.ready=true;
  }

  private makeDebugPanel():void{
    const root=document.createElement('div');
    root.style.cssText='position:fixed;left:12px;bottom:72px;z-index:1200;'+
      'background:#102334ed;color:#eef4ff;padding:10px;border-radius:8px;'+
      'font:12px system-ui;max-width:280px';
    const label=document.createElement('div');
    label.textContent='Nubes · diagnóstico A–F';root.appendChild(label);
    const preview=document.createElement('img');
    preview.style.cssText='display:block;width:256px;height:256px;margin:7px 0;'+
      'background:#86b4d3';
    root.appendChild(preview);
    const captions=['A · pieza original','B · canal alfa','C · ensamblado bruto',
      'D · ensamblado fundido','E · movimiento sin luz','F · resultado completo'];
    for(let i=0;i<captions.length;i++){
      const button=document.createElement('button');
      button.textContent=captions[i];
      button.style.cssText='margin:2px;padding:4px;font:11px system-ui';
      button.onclick=()=>{
        this.debugStage=i+1;
        label.textContent=captions[i];
        preview.style.display=i<4?'block':'none';
        preview.src=preview.dataset['stage'+(i+1)]??'';
      };
      root.appendChild(button);
    }
    document.body.appendChild(root);
    this.debugPanel=root;
  }

  private fillDebugPreviews(sources:Record<Source,SourceAtlas>):void{
    const image=this.debugPanel?.querySelector('img');
    if(!image)return;
    const core=sources.painted;
    const part=core.catalog.parts.find(item=>item.id==='crown_round'&&item.atlas==='fair')!;
    const [sx,sy,sw,sh]=part.rectPx;
    const original=canvas(CELL,CELL);
    context(original).drawImage(core.color,sx,sy,sw,sh,0,0,CELL,CELL);
    const alpha=canvas(CELL,CELL),alphaContext=context(alpha);
    const pixels=context(original).getImageData(0,0,CELL,CELL);
    for(let i=0;i<pixels.data.length;i+=4){
      const value=pixels.data[i+3];
      pixels.data[i]=value;pixels.data[i+1]=value;
      pixels.data[i+2]=value;pixels.data[i+3]=255;
    }
    alphaContext.putImageData(pixels,0,0);
    const raw=canvas(CELL,CELL),rawMask=canvas(CELL,CELL);
    this.drawFormation(context(raw),context(rawMask),'fair',0,sources,false);
    const blended=canvas(CELL,CELL),blendMask=canvas(CELL,CELL);
    this.drawFormation(context(blended),context(blendMask),'fair',0,sources,true);
    for(const [index,surface] of [original,alpha,raw,blended].entries())
      image.dataset['stage'+(index+1)]=surface.toDataURL();
    image.src=image.dataset.stage1??'';
  }

  update(frame:ClimateFrame,animationSeconds:number):void{
    this.latestTime=animationSeconds;
    if(!this.ready)return;
    const dt=Math.max(0,Math.min(.1,animationSeconds-this.previousTime));
    this.previousTime=animationSeconds;
    this.windTravel+=dt*this.wind.effectiveStrength;
    const weather=frame.weatherMix;
    const stormTarget=smooth((weather.darken-.10)/.42)*
      smooth((weather.cloud-.52)/.43);
    if(!this.initializedWeather){
      this.cloudAmount=weather.cloud;
      this.stormAmount=stormTarget;
      this.initializedWeather=true;
    }
    const smoothing=Math.min(1,dt*1.8);
    this.cloudAmount+=(weather.cloud-this.cloudAmount)*smoothing;
    this.stormAmount+=(stormTarget-this.stormAmount)*smoothing;
    this.visibility=clamp01((animationSeconds-this.readyAt)/.45);
    this.windDirection.set(...this.wind.direction);
    this.sunDirection.set(...frame.sunDirection);
    this.moonDirection.copyFrom(this.sunDirection).scaleInPlace(-1);
    this.sunColor.set(...frame.sunColor);
    this.cloudColor.set(...frame.cloudColor);
    for(const {mesh,material,family} of this.groups){
      const weight=this.visibility*(family==='fair'
        ?1-this.stormAmount*.78:this.stormAmount);
      mesh.setEnabled(weight>.005&&this.debugStage>=5);
      if(!mesh.isEnabled())continue;
      mesh.position.copyFrom(this.camera.globalPosition);
      material.setFloat('uTime',animationSeconds%86400);
      material.setFloat('uTravel',this.windTravel);
      material.setFloat('uCoverage',this.cloudAmount);
      material.setFloat('uWindStrength',this.wind.effectiveStrength);
      material.setVector2('uWindDirection',this.windDirection);
      material.setVector3('uSunDir',this.sunDirection);
      material.setVector3('uMoonDir',this.moonDirection);
      material.setColor3('uSunColor',this.sunColor);
      material.setColor3('uCloudColor',this.cloudColor);
      material.setFloat('uDayLight',frame.dayLight);
      material.setFloat('uNight',frame.night);
      material.setFloat('uFamilyWeight',weight);
      material.setFloat('uStorm',this.stormAmount);
      material.setFloat('uStage',this.debugStage);
    }
  }

  dispose():void{
    this.disposed=true;
    this.debugPanel?.remove();
    for(const {mesh,material,colors,masks} of this.groups){
      mesh.dispose(false,false);material.dispose(false,false);
      for(const texture of [...colors,...masks])texture.dispose();
    }
  }
}


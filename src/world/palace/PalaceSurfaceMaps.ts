export type PalaceSurface='limestone'|'cutstone'|'whiteMarble'|'stucco'|'oak'|'terracotta'|'cloth'|'marble';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const hash=(x:number,y:number)=>{let v=Math.imul(x+811,374761393)^Math.imul(y+193,668265263);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;};
/** Deterministic seamless PBR maps. Normals and bump/height come from the same
 * relief field; roughness is independent of the colour and contains no lights. */
export function palaceSurfaceMaps(kind:PalaceSurface,size=512,detail?:Uint8ClampedArray){
  const albedo=new Uint8Array(size*size*4),normalHeight=new Uint8Array(size*size*4),orm=new Uint8Array(size*size*4),height=new Float32Array(size*size);
  const frac=(n:number)=>n-Math.floor(n);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,grain=hash(x,y)-.5,i=y*size+x;let h=.5,rough=.85,ao=1,rgb=[235,217,192];
    if(kind==='limestone'||kind==='marble'){
      const cols=4,rows=kind==='marble'?4:6,row=Math.floor(v*rows),col=Math.floor(u*cols+(row%2)*.5),a=frac(u*cols+(row%2)*.5),b=frac(v*rows);
      const edge=Math.min(a*size/cols,(1-a)*size/cols,b*size/rows,(1-b)*size/rows),chip=(hash(Math.floor(x/5),Math.floor(y/5))-.5)*1.1;
      const bevel=clamp((edge-1-chip)/2.8),wear=(1-clamp(edge/13))*(.25+hash(Math.floor(x/12),Math.floor(y/12))*.75),block=hash(col,row);
      h=.17+.61*bevel+grain*.014-wear*.05;ao=.78+.22*bevel;rough=(kind==='marble'?.48:.78)+grain*.06+wear*.14;
      const tint=block*20-10;rgb=(kind==='marble'?[219+tint,207+tint,186+tint]:[230+tint,217+tint,194+tint]).map(c=>c*(.86+.14*bevel)-wear*15+grain*3);
    }else if(kind==='stucco'||kind==='cutstone'||kind==='whiteMarble'){
      const cloud=Math.sin(u*Math.PI*8)*Math.sin(v*Math.PI*6)+Math.sin(u*Math.PI*18+Math.sin(v*Math.PI*4))*.3;
      const vein=Math.pow(Math.max(0,Math.cos(u*Math.PI*6+Math.sin(v*Math.PI*4)*1.7+Math.sin(u*Math.PI*4+v*Math.PI*6)*.6)),24);
      h=.5+grain*.012+cloud*.004;rgb=(kind==='whiteMarble'?[245,242,234]:kind==='cutstone'?[235,225,208]:[239,219,196]).map(c=>c+cloud*1.6+grain*2-(kind==='whiteMarble'?vein*3:0));rough=kind==='whiteMarble'?.38+vein*.04:kind==='cutstone'?.7:.94;
    }else if(kind==='oak'){
      // Grain runs along V: every timber maps V to its own longitudinal axis.
      const warp=.035*Math.sin(v*Math.PI*2)+.012*Math.sin(v*Math.PI*8)+.009*Math.sin(v*Math.PI*14+u*Math.PI*6),fibres=Math.sin((u+warp)*Math.PI*96),fine=Math.sin((u+warp*.6)*Math.PI*238),wide=Math.sin((u+.012*Math.sin(v*Math.PI*4))*Math.PI*12);
      const ku=Math.sin((u-.32)*Math.PI),kv=Math.sin((v-.58)*Math.PI),knot=Math.exp(-ku*ku*95-kv*kv*12),rings=Math.sin(Math.sqrt(ku*ku+kv*kv*.045)*140)*knot;
      h=.5+fibres*.012+fine*.006+grain*.008+rings*.012;const tone=fibres*2+fine*1.5+wide*3+grain*7+rings*11-knot*12;
      rgb=[151+tone,94+tone*.67,47+tone*.43];rough=.68+wide*.035+grain*.05;
    }else if(kind==='terracotta'){
      const col=Math.floor(u*8),row=Math.floor(v*4),a=frac(u*8),b=frac(v*4),edge=clamp(Math.min(a,1-a)*35),lap=clamp(Math.min(b,1-b)*35),round=Math.sin(Math.PI*a);
      h=.12+round*.55*edge+.14*lap+grain*.014;ao=.6+.4*Math.min(edge,lap);const variation=hash(col,row)*24-12;
      rgb=[190+variation,104+variation*.75,65+variation*.5].map(c=>c*(.88+.12*Math.min(edge,lap))+grain*5);rough=.8+grain*.08;
    }else if(kind==='cloth'){
      const thread=Math.sin(x*Math.PI/2)*Math.sin(y*Math.PI/2),fold=Math.sin(u*Math.PI*8+Math.sin(v*Math.PI*2)*.25);
      h=.5+thread*.022+fold*.12;rgb=[255,255,255];rough=.94;
    }
    if(detail){
      const luminance=(detail[i*4]+detail[i*4+1]+detail[i*4+2])/3,variation=(luminance-166)*(kind==='whiteMarble'?.16:kind==='terracotta'?.28:.48);
      rgb=rgb.map(c=>c+variation);h+=(luminance/255-.65)*.035;rough+=variation*.001;
    }
    height[i]=clamp(h);for(let k=0;k<3;k++)albedo[i*4+k]=Math.round(Math.max(0,Math.min(255,rgb[k])));albedo[i*4+3]=255;
    orm[i*4]=Math.round(clamp(ao)*255);orm[i*4+1]=Math.round(clamp(rough)*255);orm[i*4+2]=0;orm[i*4+3]=255;
  }
  const strength=kind==='terracotta'?5:kind==='limestone'?3:kind==='cloth'?2.5:kind==='oak'?1.5:1;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,du=(height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size])*strength,dv=(height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x])*strength,len=Math.hypot(du,dv,1);
    normalHeight[i*4]=Math.round((.5-du/len*.5)*255);normalHeight[i*4+1]=Math.round((.5-dv/len*.5)*255);normalHeight[i*4+2]=Math.round((.5+.5/len)*255);normalHeight[i*4+3]=Math.round(height[i]*255);
  }return {albedo,normalHeight,orm,height,size};
}

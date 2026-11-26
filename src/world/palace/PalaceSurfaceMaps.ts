export type PalaceSurface='limestone'|'cutstone'|'masonry'|'flagstone'|'whiteMarble'|'stucco'|'oak'|'terracotta'|'clay'|'earth'|'cloth'|'marble'|'floorboards';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const hash=(x:number,y:number)=>{let v=Math.imul(x+811,374761393)^Math.imul(y+193,668265263);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;};
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
/** Wrapped mineral variation: colour, pores and relief share the same coordinates. */
const mineral=(u:number,v:number,period:number)=>{
  const x=u*period,y=v*period,ix=Math.floor(x),iy=Math.floor(y),a=smooth(x-ix),b=smooth(y-iy);
  const at=(dx:number,dy:number)=>hash((ix+dx)%period,(iy+dy)%period);
  return (at(0,0)*(1-a)+at(1,0)*a)*(1-b)+(at(0,1)*(1-a)+at(1,1)*a)*b;
};
/** Deterministic seamless PBR maps. Normals and bump/height come from the same
 * relief field; roughness is independent of the colour and contains no lights. */
export function palaceSurfaceMaps(kind:PalaceSurface,size=512,detail?:Uint8ClampedArray){
  const albedo=new Uint8Array(size*size*4),normalHeight=new Uint8Array(size*size*4),orm=new Uint8Array(size*size*4),height=new Float32Array(size*size);
  const frac=(n:number)=>n-Math.floor(n);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,grain=hash(x,y)-.5,i=y*size+x;let h=.5,rough=.85,ao=1,rgb=[235,217,192];
    if(kind==='flagstone'||kind==='masonry'){
      // A six-metre paving repeat / four-metre wall repeat. Unequal courses,
      // unequal stone lengths and chipped boundaries avoid a ceramic grid.
      const rows=[0,.14,.32,.48,.67,.81,1],wave=(mineral(u,v,16)-.5)*.004;
      const vv=frac(v+wave),row=Math.min(5,rows.findIndex((n,j)=>j>0&&vv<n)-1),lo=rows[row],hi=rows[row+1];
      const offset=hash(row,91),uu=frac(u+offset),lengths=Array.from({length:5},(_,j)=>.65+hash(j,row)*.8),total=lengths.reduce((s,n)=>s+n,0);
      let left=0,col=0;while(col<4&&uu>left+lengths[col]/total){left+=lengths[col]/total;col++;}
      const right=left+lengths[col]/total;
      let edge=Math.min(uu-left,right-uu,vv-lo,hi-vv);
      // Some broad flags are divided across the course, breaking long seams.
      if(hash(col,row)>.62)edge=Math.min(edge,Math.abs(vv-(lo+hi)/2));
      const chip=.0007+mineral(u,v,96)*.002,bevel=smooth((edge-chip)/.0035),cloud=mineral(u,v,12)-.5,fine=mineral(u,v,86)-.5;
      const block=hash(col+7,row+23),pore=Math.max(0,.26-mineral(u,v,192));
      const wear=(1-smooth(edge/.025))*(.5+mineral(u,v,42)*.5);
      h=.4+bevel*.25+cloud*.12+fine*.065-pore*.14;rough=.83+wear*.12+fine*.08;ao=.86+.14*bevel;
      const base=kind==='masonry'?[188,169,141]:[180,170,148],tint=(block-.5)*29+cloud*22+fine*7+grain*4;
      rgb=base.map(c=>c+tint-(1-bevel)*10-wear*3);
    }else if(kind==='limestone'||kind==='cutstone'){
      // Cream dressed limestone. The 2.4 m repeat has broad ashlar courses,
      // narrow lime joints and millimetric pores, never a dark brick grid.
      const cloud=mineral(u,v,4)*.65+mineral(u,v,12)*.35-.5,fine=mineral(u,v,64)-.5;
      const pore=Math.pow(clamp((.27-mineral(u,v,192))/.27),2);
      h=.72+cloud*.1+fine*.055-pore*.15+grain*.012;
      rough=.81+cloud*.13+fine*.12+pore*.15;ao=1-pore*.14;
      const tone=cloud*17+fine*5+grain*2.5-pore*14;
      rgb=(kind==='cutstone'?[247,234,214]:[244,230,208]).map(c=>c+tone);
      if(kind==='limestone'){
        const row=Math.floor(v*4),col=Math.floor(u*2+(row%2)*.5),a=frac(u*2+(row%2)*.5),b=frac(v*4);
        const edge=Math.min(a*1.2,(1-a)*1.2,b*.6,(1-b)*.6),bevel=smooth((edge-.003)/.014);
        const block=(hash(col%2,row)-.5)*5;
        h-=.24*(1-bevel);ao*=.94+.06*bevel;rough+=.08*(1-bevel);
        rgb=rgb.map(c=>c+block-5*(1-bevel));
      }
    }else if(kind==='marble'){
      const cols=4,rows=4,row=Math.floor(v*rows),col=Math.floor(u*cols+(row%2)*.5),a=frac(u*cols+(row%2)*.5),b=frac(v*rows);
      const edge=Math.min(a*size/cols,(1-a)*size/cols,b*size/rows,(1-b)*size/rows),chip=(hash(Math.floor(x/5),Math.floor(y/5))-.5)*1.1;
      const bevel=clamp((edge-1-chip)/2.8),wear=(1-clamp(edge/13))*(.25+hash(Math.floor(x/12),Math.floor(y/12))*.75),block=hash(col,row);
      h=.17+.61*bevel+grain*.014-wear*.05;ao=.78+.22*bevel;rough=.48+grain*.06+wear*.14;
      const tint=block*20-10;rgb=[219+tint,207+tint,186+tint].map(c=>c*(.86+.14*bevel)-wear*15+grain*3);
    }else if(kind==='stucco'||kind==='whiteMarble'){
      const cloud=Math.sin(u*Math.PI*8)*Math.sin(v*Math.PI*6)+Math.sin(u*Math.PI*18+Math.sin(v*Math.PI*4))*.3;
      const vein=Math.pow(Math.max(0,Math.cos(u*Math.PI*6+Math.sin(v*Math.PI*4)*1.7+Math.sin(u*Math.PI*4+v*Math.PI*6)*.6)),24);
      h=.5+grain*.012+cloud*.004;rgb=(kind==='whiteMarble'?[245,242,234]:[239,219,196]).map(c=>c+cloud*1.6+grain*2-(kind==='whiteMarble'?vein*3:0));rough=kind==='whiteMarble'?.38+vein*.04:.94;
    }else if(kind==='oak'||kind==='floorboards'){
      // Grain runs along V: every timber maps V to its own longitudinal axis.
      const warp=.035*Math.sin(v*Math.PI*2)+.012*Math.sin(v*Math.PI*8)+.009*Math.sin(v*Math.PI*14+u*Math.PI*6),fibres=Math.sin((u+warp)*Math.PI*96),fine=Math.sin((u+warp*.6)*Math.PI*238),wide=Math.sin((u+.012*Math.sin(v*Math.PI*4))*Math.PI*12);
      const ku=Math.sin((u-.32)*Math.PI),kv=Math.sin((v-.58)*Math.PI),knot=Math.exp(-ku*ku*95-kv*kv*12),rings=Math.sin(Math.sqrt(ku*ku+kv*kv*.045)*140)*knot;
      h=.5+fibres*.012+fine*.006+grain*.008+rings*.012;const tone=fibres*2+fine*1.5+wide*3+grain*7+rings*11-knot*12;
      rgb=[151+tone,94+tone*.67,47+tone*.43];rough=.68+wide*.035+grain*.05;
      if(kind==='floorboards'){const board=Math.floor(u*6),a=frac(u*6),b=frac(v*2+(board%3)/3),edge=Math.min(a,1-a,b*3,(1-b)*3),joint=clamp(edge*70);h-=.12*(1-joint);ao=.65+.35*joint;const tint=hash(board,Math.floor(v*2+(board%3)/3));rgb=[175+tone,126+tone*.67,76+tone*.43].map(c=>c*(.78+.12*tint+.1*joint));}
    }else if(kind==='earth'){
      const moss=mineral(u,v,7),soil=mineral(u,v,21),pebble=mineral(u,v,140);
      h=.4+soil*.12+pebble*.06+grain*.025;rough=.94;ao=.87+pebble*.13;
      rgb=[68+moss*26+soil*13,64+moss*40+soil*8,33+moss*12+soil*7].map(c=>c+grain*15);
    }else if(kind==='clay'){
      const mineralTone=mineral(u,v,8)-.5,firing=mineral(u,v,24)-.5;
      h=.5+mineralTone*.035+grain*.018;rough=.78+mineralTone*.1+grain*.08;
      rgb=[196+mineralTone*12+firing*5,111+mineralTone*9+firing*4,67+mineralTone*6+firing*3];
    }else if(kind==='terracotta'){
      const col=Math.floor(u*8),row=Math.floor(v*4),a=frac(u*8),b=frac(v*4),edge=clamp(Math.min(a,1-a)*35),lap=clamp(Math.min(b,1-b)*35),round=Math.sin(Math.PI*a);
      h=.12+round*.55*edge+.14*lap+grain*.014;ao=.6+.4*Math.min(edge,lap);const variation=hash(col,row)*24-12;
      rgb=[190+variation,104+variation*.75,65+variation*.5].map(c=>c*(.88+.12*Math.min(edge,lap))+grain*5);rough=.8+grain*.08;
    }else if(kind==='cloth'){
      const thread=Math.sin(x*Math.PI/2)*Math.sin(y*Math.PI/2),fold=Math.sin(u*Math.PI*8+Math.sin(v*Math.PI*2)*.25);
      h=.5+thread*.022+fold*.12;rgb=[255,255,255];rough=.94;
    }
    if(detail){
      const dressed=kind==='limestone'||kind==='cutstone',rock=kind==='flagstone'||kind==='masonry';
      const luminance=(detail[i*4]+detail[i*4+1]+detail[i*4+2])/3,variation=(luminance-166)*(dressed?.08:kind==='whiteMarble'?.16:kind==='clay'?.12:kind==='terracotta'?.28:.48);
      // Retain mineral microrelief without copying the photograph's dark stains
      // and baked lighting into the cream facade.
      rgb=rgb.map(c=>c+variation);h+=(luminance/255-.65)*(dressed?.09:rock?.16:.035);rough+=variation*.001;
    }
    height[i]=clamp(h);for(let k=0;k<3;k++)albedo[i*4+k]=Math.round(Math.max(0,Math.min(255,rgb[k])));albedo[i*4+3]=255;
    orm[i*4]=Math.round(clamp(ao)*255);orm[i*4+1]=Math.round(clamp(rough)*255);orm[i*4+2]=0;orm[i*4+3]=255;
  }
  const strength=kind==='terracotta'?5:['limestone','cutstone','flagstone','masonry'].includes(kind)?4*size/1024:kind==='cloth'?2.5:kind==='oak'?1.5:1;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,du=(height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size])*strength,dv=(height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x])*strength,len=Math.hypot(du,dv,1);
    normalHeight[i*4]=Math.round((.5-du/len*.5)*255);normalHeight[i*4+1]=Math.round((.5-dv/len*.5)*255);normalHeight[i*4+2]=Math.round((.5+.5/len)*255);normalHeight[i*4+3]=Math.round(height[i]*255);
  }return {albedo,normalHeight,orm,height,size};
}

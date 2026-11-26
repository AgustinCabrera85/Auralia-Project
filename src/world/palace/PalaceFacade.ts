import {PALACE_PLAN} from './BrisaliaPalacePlan';
import {face,geometry,turnedGeometry,unionBoxes,type Box,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';
import {PALACE_OPENINGS,PALACE_COLUMNS} from './PalaceLayout';
import {palacePlant,palaceGardenDetails} from './PalacePlanting';
import {palaceExterior} from './PalaceExterior';
import {palaceOrnaments} from './PalaceOrnaments';
import {expandX,expandZ} from './PalaceExpansion';

/** Finish from the final reference. All additions lie outside the scheduled
 * clear apertures. PalaceExpansion expands the architectural grid afterwards. */
export function palaceFacade(parts:Part[]){
  const boxes=(id:string,material:string,b:Box[],solid=false,rigid=false)=>parts.push({id,material:material==='stone'?/column|capitals/.test(id)?'column':'trim':material,solid,detail:false,data:unionBoxes(b,geometry(),material==='oak'),rigid});
  const turn=(id:string,material:string,x:number,z:number,p:readonly (readonly [number,number])[],solid=false)=>parts.push({id,material:material==='stone'?/column|shaft/.test(id)?'column':'trim':material,solid,detail:false,data:turnedGeometry(x,z,p,/column|shaft/.test(id)?32:20,/column|shaft/.test(id)),rigid:true});
  const bar=(id:string,mat:string,a:P3,b:P3,width:number,depth:number)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),nx=-dy/l*width/2,ny=dx/l*width/2,g=geometry();
    const q:P3[]=[[a[0]+nx,a[1]+ny,a[2]],[b[0]+nx,b[1]+ny,b[2]],[b[0]-nx,b[1]-ny,b[2]],[a[0]-nx,a[1]-ny,a[2]]];
    face(g,q,[0,0,-1]);face(g,q.map(v=>[v[0],v[1],v[2]+depth]),[0,0,1]);
    for(let i=0;i<4;i++){const p=q[i],r=q[(i+1)%4],xx=r[0]-p[0],yy=r[1]-p[1],n=Math.hypot(xx,yy);face(g,[p,r,[r[0],r[1],r[2]+depth],[p[0],p[1],p[2]+depth]],[yy/n,-xx/n,0]);}
    parts.push({id,material:mat==='stone'?'trim':mat,solid:false,detail:false,data:g});
  };
  // Floral relief on the tympanum. Small convex petals use shared stone/gold.
  const petal=(id:string,x:number,y:number,z:number,r:number,mat='stone')=>{
    const g=turnedGeometry(0,0,[[0,-.035],[r*.75,-.015],[r,.03],[r*.75,.08],[0,.11]],12);
    for(let i=0;i<g.positions.length;i+=3){const a=g.positions[i],b=g.positions[i+1],c=g.positions[i+2];g.positions[i]=x+a;g.positions[i+1]=y+c;g.positions[i+2]=z-b;const n=g.normals[i+1];g.normals[i+1]=g.normals[i+2];g.normals[i+2]=-n;}
    parts.push({id,material:mat==='stone'?'trim':mat,solid:false,detail:false,data:g,rigid:true});
  };
  // Stone surrounds and keystone emphasize the existing four-metre entrance.
  for(const s of [-1,1]){
    const x=s*2.55;
    turn('portal-shaft'+s,'stone',x,-.46,[[.25,0],[.25,.15],[.18,.25],[.17,2.8],[.24,2.92],[.26,3.04]],false);
    boxes('portal-cap'+s,'stone',[[x-.32,x+.32,2.94,3.1,-.755,-.165]],false,true);
  }
  const trim=geometry(),cy=-.0333333333,r=3.6333333333;
  for(let i=0;i<32;i++){
    const a=-2+i/8,b=a+.125,ya=cy+Math.sqrt(r*r-a*a),yb=cy+Math.sqrt(r*r-b*b);
    face(trim,[[a,ya+.31,-.36],[b,yb+.31,-.36],[b,yb+.43,-.36],[a,ya+.43,-.36]],[0,0,-1]);
  }parts.push({id:'portal-outer-moulding',material:'trim',solid:false,detail:false,data:trim});
  boxes('portal-keystone','stone',[[-.18,.18,3.56,4.15,-.49,-.3]]);
  // Corner quoins articulate the tower edges without crossing any opening.
  for(const x of [-36,-28,28,36])for(let row=0;row<14;row++){
    const y=row*.62,w=row%2?.48:.68;
    if(Math.abs(x)===36){
      const s=Math.sign(x),a=s*(36.2-w),b=s*36.28;
      boxes('quoin'+x+row,'stone',[[Math.min(a,b),Math.max(a,b),y+.025,y+.6,-.28,-.195],
        [Math.min(s*36.195,s*36.28),Math.max(s*36.195,s*36.28),y+.025,y+.6,-.195,w]]);
    }else boxes('quoin'+x+row,'stone',[[x-w/2,x+w/2,y+.025,y+.6,-.28,-.195]]);
  }
  for(const o of [...PALACE_OPENINGS.PB,...PALACE_OPENINGS.PA]){
    if(o.kind!=='window'||o.center_xyz[2]!==0)continue;
    const x=o.center_xyz[0],y=o.bottom_y+o.height,w=o.width/2;
    boxes(o.id+':window-crown','stone',[[x-w-.28,x+w+.28,y+.19,y+.3,-.45,-.28],[x-w-.19,x+w+.19,y+.3,y+.39,-.39,-.28]]);
    petal(o.id+':rosette',x,y+.62,-.23,.16);
  }
  // P11's architectural backdrop follows the audience-hall reference. The
  // central bay is reserved for the future throne furniture; exits stay lateral.
  for(const x of [-12,-5,5,12]){
    boxes('P11-pilaster'+x,'stone',[[x-.22,x+.22,.15,4.1,55.64,55.82],
      [x-.3,x+.3,0,.18,55.53,55.82],[x-.29,x+.29,4.08,4.22,55.53,55.82],
      [x-.36,x+.36,4.22,4.4,55.48,55.82]]);
  }
  // Mitred rectangular moldings are one union; no stacked coplanar borders.
  for(const [inset,width,depth] of [[0,.065,.06],[.13,.035,.035]]){
    const a=-4.5+inset,b=4.5-inset,lo=.68+inset,hi=4.02-inset;
    boxes('P11-wall-panel'+inset,'stone',[[a,a+width,lo,hi,55.73-depth,55.82],
      [b-width,b,lo,hi,55.73-depth,55.82],[a,b,lo,lo+width,55.73-depth,55.82],
      [a,b,hi-width,hi,55.73-depth,55.82]]);
  }
  for(const o of PALACE_OPENINGS.PB.filter(o=>o.kind==='window'&&o.center_xyz[2]===56&&Math.abs(o.center_xyz[0])<=16)){
    const x=o.center_xyz[0],top=o.bottom_y+o.height;
    boxes(o.id+':P11-crown','stone',[[x-1.15,x+1.15,top+.18,top+.3,55.55,55.82],
      [x-1.24,x+1.24,top+.3,top+.4,55.5,55.82]]);
  }
  for(const x of [-12,0,12]){
    const top=4.02,bottom=x===0?2:1.45,width=.95,g=geometry(),z=55.48;
    face(g,[[x-width/2,top,z],[x+width/2,top,z],[x+width/2,bottom+.25,z],[x,bottom,z],[x-width/2,bottom+.25,z]],[0,0,-1]);
    for(let i=0;i<g.positions.length/3;i++){g.uvs[i*2]=(g.positions[i*3]-x)/width+.5;g.uvs[i*2+1]=(g.positions[i*3+1]-bottom)/(top-bottom);}
    parts.push({id:'P11-wall-banner'+x,material:'banner',solid:false,detail:false,data:g});
    boxes('P11-banner-rod'+x,'brass',[[x-.6,x+.6,top,top+.05,z-.025,55.75]]);
  }
  for(const s of [-1,1])for(let i=0;i<6;i++){
    const x=s*(1.25+i*.43),y=2.9+Math.sin(i*.7)*.3;
    bar('P11-cherry-branch'+s+i,'brass',[x,y,55.58],[x+s*.44,y+.13,55.58],.025,.055);
    for(let j=0;j<5;j++){const a=j*Math.PI*2/5;petal('P11-cherry-relief'+s+i+j,x+.075*Math.cos(a),y+.15+.075*Math.sin(a),55.55,.055,j%2?'rose':'linen');}
  }
  // Ground-floor arcades frame the entire open courtyard. Their segmental
  // reveals leave at least 3 m of headroom and never cover the courtyard sky.
  for(const c of PALACE_COLUMNS){
    const [x,z]=c.center_xz;
    for(const [a,ceiling] of c.segments_y){
      const b=a===0?3.15:ceiling-.3;
      // Tuscan proportions: plinth, torus, tapered shaft, neck and echinus.
      // The shaft and mouldings are one profile rather than intersecting cubes.
      turn(c.id+':column'+a,'stone',x,z,[[.275,a+.12],[.275,a+.17],[.25,a+.21],[.255,a+.25],[.24,a+.3],[.22,a+.34],[.22,a+.65],[.225,a+.9],[.208,b-1.2],[.19,b-.46],[.19,b-.39],[.215,b-.36],[.215,b-.31],[.2,b-.29],[.22,b-.24],[.27,b-.18],[.28,b-.12]],false);
      boxes(c.id+':column-plinth'+a,'stone',[[x-.3,x+.3,a,a+.12,z-.3,z+.3],[x-.29,x+.29,b-.12,b,z-.29,z+.29]],false,true);
      if(a===0)boxes(c.id+':arcade-impost','stone',[[x-.29,x+.29,3.15,4.105,z-.29,z+.29]],false,true);
    }
  }
  const path=PALACE_PLAN.gallery_beams.path_xz;
  for(let side=1;side<path.length;side++){
    const a=path[side-1],b=path[side],alongX=a[1]===b[1],axis=alongX?0:1,c=a[1-axis];
    const marks=PALACE_COLUMNS.map(v=>v.center_xz).filter(p=>p[1-axis]===c).map(p=>alongX?expandX(p[axis]):expandZ(p[axis])).sort((a,b)=>a-b),cross=alongX?expandZ(c):expandX(c);
    for(let k=1;k<marks.length;k++){
      const lo=marks[k-1]+.285,hi=marks[k]-.285,mid=(lo+hi)/2,half=(hi-lo)/2,rise=.8,r=(half*half+rise*rise)/(2*rise),cy=3.15+rise-r,g=geometry();
      const p=(x:number,y:number,depth:number):P3=>alongX?[x,y,cross+depth]:[cross+depth,y,x];
      for(let i=0;i<16;i++){
        const x=lo+(hi-lo)*i/16,xx=lo+(hi-lo)*(i+1)/16,y=cy+Math.sqrt(r*r-(x-mid)**2),yy=cy+Math.sqrt(r*r-(xx-mid)**2);
        for(const s of [-1,1])face(g,[p(x,y,s*.29),p(xx,yy,s*.29),p(xx,4.105,s*.29),p(x,4.105,s*.29)],alongX?[0,0,s]:[s,0,0]);
        const len=Math.hypot(xx-x,yy-y),n:P3=alongX?[(yy-y)/len,-(xx-x)/len,0]:[0,-(xx-x)/len,(yy-y)/len];
        face(g,[p(x,y,-.29),p(xx,yy,-.29),p(xx,yy,.29),p(x,y,.29)],n);
      }
      face(g,[p(lo,4.105,-.29),p(hi,4.105,-.29),p(hi,4.105,.29),p(lo,4.105,.29)],[0,1,0]);
      for(const [x,s] of [[lo,-1],[hi,1]])face(g,[p(x,3.15,-.29),p(x,4.105,-.29),p(x,4.105,.29),p(x,3.15,.29)],alongX?[s,0,0]:[0,0,s]);
      parts.push({id:'courtyard-arch'+side+':'+k,material:'masonry',solid:true,detail:false,data:g,expanded:true});
    }
  }
  // The front balcony stays open. Planters are narrow, outside its clear route.
  const flowerBox=(id:string,x:number,z:number,y:number,width:number)=>{
    boxes(id+':box','stone',[[x-width/2,x+width/2,y,y+.21,z-.22,z+.22]]);
    for(let i=0;i<Math.ceil(width/.32);i++){
      const xx=x-width/2+.17+i*.32;
      palacePlant(parts,id+':flowers'+i,xx,y+.2,z,.23,.32,6);
    }
  };
  for(const x of [-3.2,-1.05,1.05,3.2])flowerBox('balcony-flowers'+x,x,-3.05,5.9,1.95);
  // Gardens flank the wide arrival; the accessible west ramp remains clear.
  for(const s of [-1,1]){
    const x=s*23,lo=x-7,hi=x+7,z0=-7,z1=-3;
    boxes('front-bed'+s,'stone',[[lo,hi,-1.55,.05,z0,z0+.22],[lo,hi,-1.55,.05,z1-.22,z1],[lo,lo+.22,-1.55,.05,z0+.22,z1-.22],[hi-.22,hi,-1.55,.05,z0+.22,z1-.22]],true);
    boxes('front-bed-soil'+s,'garden',[[lo+.22,hi-.22,-1.55,-.02,z0+.22,z1-.22]],true);
    for(let i=0;i<18;i++){
      const xx=lo+.55+(i%9)*1.6,zz=z0+.8+Math.floor(i/9)*1.7;
      palacePlant(parts,'garden-shrub'+s+i,xx,.02,zz,.72,.75+(i%4)*.16,18);
    }
    // Urns sit on the terrace, clear of the stair and ramp apertures.
    const px=s*15.2;
    turn('terrace-urn'+s,'stone',px,-1,[[0,0],[.3,0],[.3,.15],[.16,.2],[.18,.45],[.42,.65],[.5,.94],[.43,1.03],[.36,.96],[0,.68]],true);
    flowerBox('urn-bouquet'+s,px,-1,.95,.65);
  }
  palaceExterior(parts);
  palaceOrnaments(parts);
  palaceGardenDetails(parts);
}

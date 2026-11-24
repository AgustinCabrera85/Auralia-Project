import {PALACE_PLAN} from './BrisaliaPalacePlan';
import {face,geometry,turnedGeometry,unionBoxes,type Box,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';
import {PALACE_OPENINGS,PALACE_COLUMNS} from './PalaceLayout';

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
  // A layered stone pediment, attached to the central gable, not a floating sign.
  boxes('pediment-entablature','stone',[[-11.1,11.1,8.98,9.22,-.98,-.2],[-10.9,10.9,9.22,9.38,-.94,-.78]]);
  for(const s of [-1,1]){
    bar('pediment-raking'+s,'stone',[s*10.9,9.28,-.95],[0,13.1,-.95],.25,.22);
    bar('pediment-inner'+s,'stone',[s*9.8,9.42,-.98],[0,12.85,-.98],.09,.12);
  }
  // Floral relief on the tympanum. Small convex petals use shared stone/gold.
  const petal=(id:string,x:number,y:number,z:number,r:number,mat='stone')=>{
    const g=turnedGeometry(0,0,[[0,-.035],[r*.75,-.015],[r,.03],[r*.75,.08],[0,.11]],12);
    for(let i=0;i<g.positions.length;i+=3){const a=g.positions[i],b=g.positions[i+1],c=g.positions[i+2];g.positions[i]=x+a;g.positions[i+1]=y+c;g.positions[i+2]=z-b;const n=g.normals[i+1];g.normals[i+1]=g.normals[i+2];g.normals[i+2]=-n;}
    parts.push({id,material:mat==='stone'?'trim':mat,solid:false,detail:false,data:g,rigid:true});
  };
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;petal('crest-petal'+i,Math.sin(a)*.38,11.1+Math.cos(a)*.38,-.83,.32);}
  petal('crest-heart',0,11.1,-.94,.17,'gold');
  for(const s of [-1,1])for(let i=0;i<5;i++){
    const x=s*(.7+i*.42),y=10.6+Math.sin(i*.65)*.21;
    bar('crest-stem'+s+i,'brass',[x,y,-.84],[x+s*.4,y+.13,-.84],.045,.05);
    petal('crest-leaf'+s+i,x+s*.2,y+.19,-.83,.12,i%2?'rose':'stone');
  }
  // Paired columns terminate against their supporting entablatures.
  boxes('portico-balcony-lintel','stone',[[-10.4,10.4,4.3,4.5,-.98,-.2],[-10.46,10.46,4.5,4.66,-1.26,-1.2],[-10.46,-10.4,4.5,4.66,-1.2,0],[10.4,10.46,4.5,4.66,-1.2,0]]);
  for(const x of [-9.55,9.55])for(const [lo,hi] of [[0,4.3],[4.8,8.98]]){
    turn('portico-column'+x+lo,'stone',x,-.58,[[.34,lo],[.34,lo+.16],[.27,lo+.22],[.25,lo+.38],[.2,hi-.4],[.3,hi-.27],[.34,hi-.2],[.34,hi]],false);
    boxes('portico-column-base'+x+lo,'stone',[[x-.4,x+.4,lo,lo+.12,-.98,-.18]],false,true);
  }
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
      const b=ceiling-.3;
      // Tuscan proportions: plinth, torus, tapered shaft, neck and echinus.
      // The shaft and mouldings are one profile rather than intersecting cubes.
      turn(c.id+':column'+a,'stone',x,z,[[.275,a+.12],[.275,a+.17],[.25,a+.21],[.255,a+.25],[.24,a+.3],[.22,a+.34],[.22,a+.65],[.225,a+.9],[.208,b-1.2],[.19,b-.46],[.19,b-.39],[.215,b-.36],[.215,b-.31],[.2,b-.29],[.22,b-.24],[.27,b-.18],[.28,b-.12]],false);
      boxes(c.id+':column-plinth'+a,'stone',[[x-.3,x+.3,a,a+.12,z-.3,z+.3],[x-.29,x+.29,b-.12,b,z-.29,z+.29]],false,true);
    }
  }
  const path=PALACE_PLAN.gallery_beams.path_xz;
  for(let side=1;side<path.length;side++){
    const a=path[side-1],b=path[side],alongX=a[1]===b[1],axis=alongX?0:1,c=a[1-axis];
    const marks=PALACE_COLUMNS.map(v=>v.center_xz).filter(p=>p[1-axis]===c).map(p=>p[axis]).sort((a,b)=>a-b);
    for(let k=1;k<marks.length;k++){
      const lo=marks[k-1]+.2,hi=marks[k]-.2,mid=(lo+hi)/2,half=(hi-lo)/2,rise=.95,r=(half*half+rise*rise)/(2*rise),cy=3+rise-r,g=geometry();
      const p=(x:number,y:number,depth:number):P3=>alongX?[x,y,c+depth]:[c+depth,y,x];
      for(let i=0;i<16;i++){
        const x=lo+(hi-lo)*i/16,xx=lo+(hi-lo)*(i+1)/16,y=cy+Math.sqrt(r*r-(x-mid)**2),yy=cy+Math.sqrt(r*r-(xx-mid)**2);
        for(const s of [-1,1])face(g,[p(x,y,s*.16),p(xx,yy,s*.16),p(xx,4.1,s*.16),p(x,4.1,s*.16)],alongX?[0,0,s]:[s,0,0]);
        const len=Math.hypot(xx-x,yy-y),n:P3=alongX?[(yy-y)/len,-(xx-x)/len,0]:[0,-(xx-x)/len,(yy-y)/len];
        face(g,[p(x,y,-.16),p(xx,yy,-.16),p(xx,yy,.16),p(x,y,.16)],n);
      }parts.push({id:'courtyard-arch'+side+':'+k,material:'trim',solid:true,detail:false,data:g});
    }
  }
  // Discrete corbels beneath the roof overhangs, with no free-standing fake bays.
  for(const [a,b,y] of [[-36,-28,10.2],[-27,-11,9.2],[11,27,9.2],[28,36,10.2]])for(let x=a+.7;x<b;x+=1.7)
    boxes('eave-corbel'+x,'oak',[[x-.1,x+.1,y-.4,y-.1,-.67,-.22],[x-.14,x+.14,y-.13,y,-.78,-.22]]);
  // The front balcony stays open. Planters are narrow, outside its clear route.
  const flowerBox=(id:string,x:number,z:number,y:number,width:number)=>{
    boxes(id+':box','stone',[[x-width/2,x+width/2,y,y+.21,z-.22,z+.22]]);
    for(let i=0;i<Math.ceil(width/.32);i++){
      const xx=x-width/2+.17+i*.32;
      turn(id+':leaves'+i,'sage',xx,z,[[0,y+.2],[.17,y+.29],[.15,y+.4],[0,y+.45]]);
      for(let j=0;j<3;j++)turn(id+':bloom'+i+j,j%2?'rose':'linen',xx+(j-1)*.08,z+.07*Math.sin(i+j),[[0,y+.34],[.075,y+.39],[.08,y+.45],[0,y+.48]]);
    }
  };
  for(const x of [-7,-3.5,0,3.5,7])flowerBox('balcony-flowers'+x,x,-1.1,5.9,2.6);
  // Gardens flank the wide arrival; the accessible west ramp remains clear.
  for(const s of [-1,1]){
    const x=s*23,lo=x-7,hi=x+7,z0=-7,z1=-3;
    boxes('front-bed'+s,'stone',[[lo,hi,-.6,.05,z0,z0+.22],[lo,hi,-.6,.05,z1-.22,z1],[lo,lo+.22,-.6,.05,z0+.22,z1-.22],[hi-.22,hi,-.6,.05,z0+.22,z1-.22]],true);
    boxes('front-bed-soil'+s,'garden',[[lo+.22,hi-.22,-.5,-.02,z0+.22,z1-.22]],true);
    for(let i=0;i<18;i++){
      const xx=lo+.55+(i%9)*1.6,zz=z0+.8+Math.floor(i/9)*1.7,h=.3+(i%4)*.09;
      turn('garden-shrub'+s+i,'sage',xx,zz,[[0,-.02],[.45,.12],[.4,h],[0,h+.16]]);
      for(let j=0;j<4;j++)turn('garden-flower'+s+i+j,['rose','linen','gold'][i%3],xx+Math.cos(j*Math.PI/2)*.28,zz+Math.sin(j*Math.PI/2)*.28,[[0,h-.05],[.12,h+.03],[.12,h+.15],[0,h+.21]]);
    }
    // Urns sit on the terrace, clear of the stair and ramp apertures.
    const px=s*15.2;
    turn('terrace-urn'+s,'stone',px,-1,[[0,0],[.3,0],[.3,.15],[.16,.2],[.18,.45],[.42,.65],[.5,.94],[.43,1.03],[.36,.96],[0,.68]],true);
    flowerBox('urn-bouquet'+s,px,-1,.95,.65);
  }
  // Lanterns on the tower ridges carry the same silhouette as the final image.
  for(const x of [-32,32]){
    turn('tower-lantern-base'+x,'brass',x,5,[[.22,14.2],[.22,14.28],[.1,14.32]]);
    boxes('tower-lantern-light'+x,'light',[[x-.16,x+.16,14.32,14.67,4.84,5.16]]);
    const frame:Box[]=[];for(const dx of [-.2,.16])for(const dz of [-.2,.16])frame.push([x+dx,x+dx+.04,14.3,14.7,5+dz,5+dz+.04]);
    boxes('tower-lantern-frame'+x,'brass',frame);
    turn('tower-lantern-cap'+x,'brass',x,5,[[.29,14.68],[.29,14.73],[.06,14.86],[0,14.9]]);
  }
}

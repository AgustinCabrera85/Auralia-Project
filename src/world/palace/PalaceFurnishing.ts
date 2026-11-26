import {PALACE_PLAN} from './BrisaliaPalacePlan';
import {face,geometry,unionBoxes,type Box,type P3} from './PalaceGeometry';
import {rectBox,type Part,type DoorSpec} from './PalaceModel';
import {palacePlant} from './PalacePlanting';
import {palaceFacade} from './PalaceFacade';
import {PALACE_OPENINGS,PALACE_COLUMNS,PALACE_FURNITURE} from './PalaceLayout';
import {expandX,expandZ} from './PalaceExpansion';
import {palaceRoomProps} from './PalaceRoomProps';
import {medievalWashFurniture} from './PalaceMedieval';
/** Turn the plan's occupancy envelopes into recognizable objects. No geometry
 * or collider extends beyond its authored furniture footprint. */
export function palaceFurnishing(parts:Part[],_doors:DoorSpec[],includeFurniture=true){
  const boxes=(id:string,material:string,boxes:readonly Box[],solid=false,detail=true)=>{
    const valid=boxes.filter(b=>b[1]>b[0]&&b[3]>b[2]&&b[5]>b[4]);if(valid.length)parts.push({id,material:material==='stone'&&/facade-bands|pilaster|capital/.test(id)?'trim':material,solid,detail,data:unionBoxes(valid,geometry(),material==='oak')});
  };
  const single=(id:string,mat:string,b:Box,solid=false,detail=true)=>boxes(id,mat,[b],solid,detail);
  const lathe=(id:string,mat:string,x:number,z:number,profile:readonly (readonly [number,number])[],solid=false,detail=true)=>{
    const g=geometry();for(let j=1;j<profile.length;j++)for(let i=0;i<24;i++){
      const a=i*Math.PI/12,b=(i+1)*Math.PI/12,[r0,y0]=profile[j-1],[r1,y1]=profile[j];
      const n:P3=[Math.cos((a+b)/2)*(y1-y0),r0-r1,Math.sin((a+b)/2)*(y1-y0)],l=Math.hypot(...n);if(l<1e-8)continue;
      face(g,[[x+r0*Math.cos(a),y0,z+r0*Math.sin(a)],[x+r0*Math.cos(b),y0,z+r0*Math.sin(b)],[x+r1*Math.cos(b),y1,z+r1*Math.sin(b)],[x+r1*Math.cos(a),y1,z+r1*Math.sin(a)]],n.map(v=>v/l) as P3);
    }parts.push({id,material:mat,solid,detail,data:g,rigid:true});
  };
  const legs=(r:readonly number[],y:number,h:number):Box[]=>{const [a,b,c,d]=r;return [a+.06,b-.18].flatMap(x=>[c+.06,d-.18].map(z=>[x,x+.12,y,y+h,z,z+.12] as Box));};
  for(const f of includeFurniture?PALACE_FURNITURE:[]){
    const first=parts.length,[a,b,c,d]=f.bounds,cx=(a+b)/2,cz=(c+d)/2;
    const room=PALACE_PLAN.levels[f.level].rooms.find(r=>f.id.startsWith(r.id+'-'));
    const bathrooms:readonly {id:string;bounds_xz:readonly number[]}[]=PALACE_PLAN.levels[f.level].bathrooms;
    const bath=bathrooms.find(q=>f.id.startsWith(q.id+'-'));
    const storage=/estante|estanter|biblioteca|archivo|armario|vitrina/.test(f.name.toLowerCase())||f.id.endsWith('-A')||f.id==='S15-E';
    const support=bath??(storage?room:undefined);
    const wall=support?[a-support.bounds_xz[0],support.bounds_xz[1]-b,c-support.bounds_xz[2],support.bounds_xz[3]-d].map((gap,side)=>({gap,side})).sort((a,b)=>a.gap-b.gap)[0].side:-1;
    const rotate=wall>=0?wall<2:(b-a)<(d-c)&&!['bed','bath'].includes(f.kind)&&!f.id.startsWith('BS')&&!f.id.endsWith('-C');
    const flip=wall===2;
    const direction=wall>=0?(wall===1?-1:1):room&&(room.bounds_xz[0]+room.bounds_xz[1])/2<cx?-1:1;
    const bounds=rotate?[cx-(d-c)/2,cx+(d-c)/2,cz-(b-a)/2,cz+(b-a)/2]:f.bounds;
    const build=()=>{
    const y=f.level==='PB'?0:4.8,[x0,x1,z0,z1]=bounds,w=x1-x0,d=z1-z0,h=f.height,x=(x0+x1)/2,z=(z0+z1)/2,name=f.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    // One simple occupied volume; fine feet, pages and handles have no colliders.
    single(f.id+':collision','hidden',rectBox(bounds,y,y+(f.id.endsWith('-SH')?.63:h)),true);
    if(f.id.startsWith('P05-C')){
      boxes(f.id+':cloak-rack','oak',[[x0+.1,x0+.23,y,y+1.85,z-.12,z+.12],[x1-.23,x1-.1,y,y+1.85,z-.12,z+.12],[x0+.1,x1-.1,y+1.73,y+1.85,z-.1,z+.1],[x0+.05,x0+.3,y,y+.12,z0+.1,z1-.1],[x1-.3,x1-.05,y,y+.12,z0+.1,z1-.1]]);
      for(let i=0;i<3;i++)single(f.id+':cloak'+i,i%2?'sage':'velvet',[x0+.3+i*w*.23,x0+.55+i*w*.23,y+.42,y+1.73,z-.065,z+.065]);
    }else if(f.kind==='bed'||f.id.endsWith('-C')||f.id.startsWith('S11-F')){
      boxes(f.id+':feet','oak',legs(bounds,y,.23));
      single(f.id+':frame','oak',rectBox(bounds,y+.19,y+h*.38));
      single(f.id+':mattress','linen',[x0+.06,x1-.06,y+h*.38,y+h*.66,z0+.08,z1-.08]);
      single(f.id+':cover','rose',[x0+.055,x1-.055,y+h*.66,y+h*.74,z0+d*.32,z1-.07]);
      for(let j=0;j<2;j++)single(f.id+':pillow'+j,'linen',[x0+w*(.1+j*.46),x0+w*(.44+j*.46),y+h*.66,y+h*.86,z0+.1,z0+d*.25]);
      single(f.id+':headboard','oak',[x0,x1,y,y+h,z0,z0+.08]);
    }else if(/inodoro/.test(name)||f.id.endsWith('-WC')){
      medievalWashFurniture(parts,f.id,bounds,y,'stool');
    }else if(/ducha/.test(name)||f.id.endsWith('-SH')){
      medievalWashFurniture(parts,f.id,bounds,y,'tub');
    }else if(/lavabo/.test(name)||f.id.endsWith('-LV')){
      medievalWashFurniture(parts,f.id,bounds,y,'basin');
    }else if((/estante|estanter|biblioteca|archivo|armario|vitrina/.test(name)&&!(h<1&&w>1.5&&d>1.5))||f.id.endsWith('-A')||f.id==='S15-E'){
      if(/armario/.test(name)||f.id.endsWith('-A')){
        single(f.id+':cabinet','oak',[x0,x1,y,y+h,z0+.05,z1]);
        for(const [a,b] of [[x0+.07,x-.035],[x+.035,x1-.07]])boxes(f.id+':door-panel'+a,'oak',[[a,a+.045,y+.12,y+h-.12,z0,z0+.05],[b-.045,b,y+.12,y+h-.12,z0,z0+.05],[a,b,y+.12,y+.17,z0,z0+.05],[a,b,y+h-.17,y+h-.12,z0,z0+.05]]);
        for(const xx of [x-.08,x+.08])single(f.id+':handle'+xx,'brass',[xx-.015,xx+.015,y+h*.4,y+h*.57,z0,z0+.055]);
        return;
      }
      const vertical:Box[]=[[x0,x0+.08,y,y+h,z0,z1],[x1-.08,x1,y,y+h,z0,z1],[x0,x1,y,y+h,z1-.06,z1]];
      const shelves=Math.max(2,Math.floor(h/.38));for(let k=0;k<=shelves;k++)vertical.push([x0,x1,y+k*(h-.06)/shelves,y+k*(h-.06)/shelves+.06,z0,z1]);
      boxes(f.id+':shelves','oak',vertical);
      for(let k=0;k<shelves;k++)for(let j=0;j<Math.floor(w/.17)-1;j++){
        const a=x0+.12+j*.17,lo=y+k*(h-.06)/shelves+.06;
        single(f.id+`:book${k}:${j}`,['rose','sage','gold','linen'][(k+j)%4],[a,a+.11,lo,Math.min(y+h-.07,lo+.22+(j%3)*.03),z0+.08,z0+Math.min(.3,d-.08)]);
      }
    }else if(/fog[oó]n|cocina/.test(name)){
      single(f.id+':stove','stone',rectBox(bounds,y,y+h-.2));
      for(let k=0;k<3;k++)lathe(f.id+':pot'+k,'iron',x0+w*(k+.5)/3,z,[[0,y+h-.2],[.15,y+h-.2],[.18,y+h-.07],[.16,y+h]],false);
    }else {
      const bench=(f.id!=='P01-F0'&&!f.id.startsWith('P07')&&/banco|asiento|sill[oó]n/.test(name))||f.id.startsWith('S14-'),seat=bench?Math.min(.45,h-.09):h-.1;
      boxes(f.id+':legs','oak',legs(bounds,y,seat));single(f.id+':top','oak',rectBox(bounds,y+seat,y+seat+.09));
      if(bench&&h>.6)single(f.id+':back','oak',[x0,x1,y+seat,y+h,z1-.08,z1]);
      if(!bench){single(f.id+':runner','sage',[x0+w*.3,x1-w*.3,y+h-.009,y+h-.003,z0+.12,z1-.12]);}
    }
    };build();
    const ox=expandX(cx)-cx,oz=expandZ(cz)-cz;
    for(const part of parts.slice(first)){
      const g=part.data;
      for(let i=0;i<g.positions.length;i+=3){
        if(flip){g.positions[i]=2*cx-g.positions[i];g.positions[i+2]=2*cz-g.positions[i+2];g.normals[i]*=-1;g.normals[i+2]*=-1;}
        if(rotate){const x=g.positions[i]-cx,z=g.positions[i+2]-cz,nx=g.normals[i],nz=g.normals[i+2];g.positions[i]=cx-direction*z;g.positions[i+2]=cz+direction*x;g.normals[i]=-direction*nz;g.normals[i+2]=direction*nx;}
        g.positions[i]+=ox;g.positions[i+2]+=oz;
      }part.expanded=true;
    }

  }
  // The former public cubicles are now an open court wardrobe. The original
  // room aperture remains; no modern sanitary partitions or extra doors.
  // Exterior cornices and cornice bands give the long facades a human scale.
  for(const [y,h,p] of [[4.48,.27,.12],[8.94,.26,.3]]){
    boxes('facade-bands'+y,'stone',[[ -36.2-p,36.2+p,y,y+h,-.2-p,-.2],[-36.2-p,36.2+p,y,y+h,56.2,56.2+p],[-36.2-p,-36.2,y,y+h,-.2,56.2],[36.2,36.2+p,y,y+h,-.2,56.2]],false,false);
  }
  // The facade owns the corner quoins and portico columns. Do not superimpose
  // the former generic pilasters/capitals on those finished assemblies.
  const lamps:P3[]=[];
  for(const x of [-32,32])for(const y of [6.5,10.5,13.5])lamps.push([x+Math.sign(x)*3.45,y,5]);
  for(const x of [-3.3,3.3,-15,15,-24,24])lamps.push([x,2.7,-.75]);
  for(const y of [2.8,7.6])for(const c of PALACE_COLUMNS){const [x,z]=c.center_xz;if(Math.abs(x)===16&&[24,31.2,40].includes(z))lamps.push([x-Math.sign(x)*.4,y,z]);}
  for(const x of [-12,0,12])lamps.push([x,3.65,50]);
  for(const [i,[x,y,z]] of lamps.entries()){
    single('lamp'+i+':glow','light',[x-.15,x+.15,y-.24,y+.23,z-.15,z+.15],false,false);
    const bars:Box[]=[];for(const xx of [x-.18,x+.14])for(const zz of [z-.18,z+.14])bars.push([xx,xx+.04,y-.28,y+.26,zz,zz+.04]);
    bars.push([x-.2,x+.2,y-.32,y-.27,z-.2,z+.2],[x-.23,x+.23,y+.26,y+.33,z-.23,z+.23]);boxes('lamp'+i+':frame','brass',bars,false,false);
    lathe('lamp'+i+':cap','brass',x,z,[[.24,y+.33],[.24,y+.37],[.06,y+.54],[0,y+.59]],false,false);
    if(z===50)single('lamp'+i+':suspension','brass',[x-.018,x+.018,y+.54,4.5,z-.018,z+.018],false,false);
    else if(z<0)boxes('lamp'+i+':bracket','iron',[[x-.028,x+.028,y+.53,y+.58,z,-.2],[x-.028,x+.028,y+.3,y+.58,z-.028,z+.028]],false,false);
    else {const wall=x+Math.sign(x)*.4;boxes('lamp'+i+':bracket','iron',[[Math.min(x,wall),Math.max(x,wall),y+.53,y+.58,z-.028,z+.028],[x-.028,x+.028,y+.3,y+.58,z-.028,z+.028]],false,false);}
  }
  for(const x of [-8,8]){
    const banner=geometry();face(banner,[[x-.6,8.3,39.62],[x+.6,8.3,39.62],[x+.6,3.3,39.62],[x,2.7,39.62],[x-.6,3.3,39.62]],[0,0,-1]);
    parts.push({id:'banner'+x,material:'banner',solid:false,detail:false,data:banner});
    for(let i=0;i<banner.positions.length/3;i++){banner.uvs[i*2]=(banner.positions[i*3]-x+.6)/1.2;banner.uvs[i*2+1]=(banner.positions[i*3+1]-2.7)/5.6;}
    single('banner-rod'+x,'brass',[x-.75,x+.75,8.3,8.38,39.58,40],false,false);
  }
  // Window flower boxes; foliage is small and non-colliding.
  for(const o of PALACE_OPENINGS.PA){if(o.kind!=='window'||o.center_xyz[2]!==0)continue;
    const [x,,z]=o.center_xyz,y=o.bottom_y-.28;
    single(o.id+':flowerbox','oak',[x-o.width/2,x+o.width/2,y,y+.24,z-.7,z-.21],false,false);
    for(let i=0;i<9;i++){const xx=x-o.width*.45+i*o.width*.9/8;palacePlant(parts,o.id+':flowers'+i,xx,y+.24,-.48,.14,.2,4);}
  }
  // Walk ring and north/south approach are one non-overlapping courtyard surface.
  const ring=geometry(),courtZ=expandZ(29);for(let i=0;i<64;i++){
    const a=i*Math.PI/32,b=(i+1)*Math.PI/32;face(ring,[[3*Math.cos(a),0,courtZ+3*Math.sin(a)],[5*Math.cos(a),0,courtZ+5*Math.sin(a)],[5*Math.cos(b),0,courtZ+5*Math.sin(b)],[3*Math.cos(b),0,courtZ+3*Math.sin(b)]],[0,1,0]);
  }parts.push({id:'courtyard-ring',material:'paving',solid:true,detail:false,data:ring,expanded:true});
  // Axis ends stop at the ring's outer boundary; clipped arc avoids two painted layers.
  for(const sign of [-1,1]){
    const g=geometry();for(let i=0;i<32;i++){const x=-2+i*.125,xx=x+.125,z=courtZ+sign*Math.sqrt(25-x*x),zz=courtZ+sign*Math.sqrt(25-xx*xx),end=expandZ(sign<0?18:40);
      face(g,[[x,0,end],[xx,0,end],[xx,0,zz],[x,0,z]],[0,1,0]);}
    parts.push({id:'courtyard-axis'+sign,material:'paving',solid:true,detail:false,data:g,expanded:true});
  }
  lathe('courtyard-planter','stone',0,29,[[2.8,-.08],[3,-.08],[3,.42],[2.8,.42],[2.8,-.08]],true,false);
  lathe('court-trunk-collider','hidden',0,29,[[.45,0],[.45,6]],true,false);
  if(includeFurniture){
    // The six-metre central aisle stays clear up to the ceremonial dais.
    single('P11:dais','trim',[-4,4,0,.15,52.5,55.35],true,false);
    single('P11:carpet','velvet',[-2.7,2.7,.004,.012,44.8,52.45],false,false);
    boxes('P11:carpet-border','gold',[[-2.64,-2.59,.012,.016,44.9,52.35],[2.59,2.64,.012,.016,44.9,52.35],[-2.59,2.59,.012,.016,44.9,44.95],[-2.59,2.59,.012,.016,52.3,52.35]],false,false);
    for(const x of [-1.25,1.25]){
      for(const dx of [-.5,.5])single('P11:throne-front-leg'+x+dx,'oak',[x+dx-.08,x+dx+.08,.15,.65,53.84,54],true,false);
      boxes('P11:throne-gilding'+x,'gold',[[x-.4,x-.35,1.02,2.02,54.81,54.85],[x+.35,x+.4,1.02,2.02,54.81,54.85],[x-.4,x+.4,1.02,1.07,54.81,54.85],[x-.4,x+.4,1.97,2.02,54.81,54.85]],false,false);
      boxes('P11:throne-frame'+x,'oak',[[x-.58,x+.58,.15,.28,53.8,55],[x-.58,x-.44,.28,2.22,54.83,55],[x+.44,x+.58,.28,2.22,54.83,55],[x-.44,x+.44,.65,2.08,54.88,54.98],[x-.58,x+.58,.65,.78,53.8,55],[x-.58,x-.44,.78,1.03,54,54.9],[x+.44,x+.58,.78,1.03,54,54.9]],true,false);
      single('P11:throne-cushion'+x,'velvet',[x-.43,x+.43,.78,.9,53.86,54.82],false,false);
      single('P11:throne-upholstery'+x,'velvet',[x-.36,x+.36,1.05,1.95,54.84,54.88],false,false);
      for(const dx of [-.51,.51])lathe('P11:throne-finial'+x+dx,'gold',x+dx,54.9,[[.07,2.22],[.11,2.29],[.07,2.39],[0,2.45]],false,false);
    }
  }
  palaceFacade(parts);
  if(includeFurniture)palaceRoomProps(parts);
  return {lamps};
}

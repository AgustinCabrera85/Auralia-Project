import {PALACE_PLAN} from './BrisaliaPalacePlan';
import {face,geometry,unionBoxes,type Box,type P3} from './PalaceGeometry';
import {rectBox,type Part,type DoorSpec} from './PalaceModel';
import {palaceFacade} from './PalaceFacade';
import {PALACE_OPENINGS,PALACE_COLUMNS} from './PalaceLayout';
import {expandZ} from './PalaceExpansion';
/** Turn the plan's occupancy envelopes into recognizable objects. No geometry
 * or collider extends beyond its authored furniture footprint. */
export function palaceFurnishing(parts:Part[],doors:DoorSpec[],includeFurniture=false){
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
  for(const f of includeFurniture?PALACE_PLAN.furniture:[]){
    if(f.id.startsWith('P05-C'))continue;
    const y=f.level==='PB'?0:4.8,[x0,x1,z0,z1]=f.bounds,w=x1-x0,d=z1-z0,h=f.height,x=(x0+x1)/2,z=(z0+z1)/2,name=f.name.toLowerCase();
    // One simple occupied volume; fine feet, pages and handles have no colliders.
    single(f.id+':collision','hidden',rectBox(f.bounds,y,y+h),true);
    if(f.kind==='bed'||/cama/.test(name)){
      single(f.id+':frame','oak',rectBox(f.bounds,y+.12,y+h*.38));
      single(f.id+':mattress','linen',[x0+.06,x1-.06,y+h*.38,y+h*.66,z0+.08,z1-.08]);
      single(f.id+':cover','rose',[x0+.055,x1-.055,y+h*.66,y+h*.74,z0+.07,z1-d*.32]);
      single(f.id+':pillow','linen',[x0+w*.16,x1-w*.16,y+h*.66,y+h*.86,z1-d*.28,z1-.1]);
      single(f.id+':headboard','oak',[x0,x1,y,y+h,z1-.08,z1]);
    }else if(/inodoro/.test(name)||f.id.endsWith('-WC')){
      lathe(f.id+':porcelain','ceramic',x,z,[[0,y],[w*.25,y],[w*.18,y+.2],[w*.45,y+h*.63],[w*.44,y+h*.78],[w*.32,y+h*.8],[w*.3,y+h*.62],[0,y+h*.55]]);
      single(f.id+':tank','ceramic',[x0+.04,x1-.04,y+.25,y+h,z1-d*.24,z1]);
    }else if(/ducha/.test(name)||f.id.endsWith('-SH')){
      single(f.id+':tray','ceramic',rectBox(f.bounds,y,y+.08));
      single(f.id+':shower','brass',[x-.025,x+.025,y+.08,y+h,z1-.09,z1-.04]);
      single(f.id+':screen','glass',[x0+.03,x0+.05,y+.1,y+h,z0+.1,z1-.05]);
    }else if(/lavabo/.test(name)||f.id.endsWith('-LV')){
      single(f.id+':vanity','oak',rectBox(f.bounds,y+.12,y+h*.72));
      lathe(f.id+':bowl','ceramic',x,z,[[0,y+h*.72],[Math.min(w,d)*.43,y+h*.85],[Math.min(w,d)*.44,y+h],[Math.min(w,d)*.36,y+h],[0,y+h*.8]]);
    }else if(/estante|estanter|biblioteca|archivo|armario|vitrina/.test(name)||f.id.endsWith('-A')){
      if(/armario/.test(name)||f.id.endsWith('-A')){
        single(f.id+':cabinet','oak',[x0,x1,y,y+h,z0+.05,z1]);
        for(const xx of [x-.08,x+.08])single(f.id+':handle'+xx,'brass',[xx-.015,xx+.015,y+h*.4,y+h*.57,z0,z0+.055]);
        continue;
      }
      const vertical:Box[]=[[x0,x0+.08,y,y+h,z0,z1],[x1-.08,x1,y,y+h,z0,z1],[x0,x1,y,y+h,z1-.06,z1]];
      const shelves=Math.max(2,Math.floor(h/.38));for(let k=0;k<=shelves;k++)vertical.push([x0,x1,y+k*(h-.06)/shelves,y+k*(h-.06)/shelves+.06,z0,z1]);
      boxes(f.id+':shelves','oak',vertical);
      for(let k=0;k<shelves;k++)for(let j=0;j<Math.floor(w/.17)-1;j++){
        const a=x0+.12+j*.17,lo=y+k*(h-.06)/shelves+.06;
        single(f.id+`:book${k}:${j}`,['rose','sage','gold','linen'][(k+j)%4],[a,a+.11,lo,Math.min(y+h-.07,lo+.22+(j%3)*.03),z0+.08,z0+Math.min(.3,d-.08)]);
      }
    }else if(/fog[oó]n|cocina/.test(name)){
      single(f.id+':stove','stone',rectBox(f.bounds,y,y+h-.2));
      for(let k=0;k<3;k++)lathe(f.id+':pot'+k,'iron',x0+w*(k+.5)/3,z,[[0,y+h-.2],[.15,y+h-.2],[.18,y+h-.07],[.16,y+h]],false);
    }else {
      const bench=/banco|asiento|sill[oó]n/.test(name),seat=bench?Math.min(.45,h-.09):h-.1;
      boxes(f.id+':legs','oak',legs(f.bounds,y,seat));single(f.id+':top','oak',rectBox(f.bounds,y+seat,y+seat+.09));
      if(bench&&h>.6)single(f.id+':back','oak',[x0,x1,y+seat,y+h,z1-.08,z1]);
      if(!bench){single(f.id+':runner','sage',[x0+w*.3,x1-w*.3,y+h-.009,y+h-.003,z0+.12,z1-.12]);}
    }
  }
  for(const fixture of PALACE_PLAN.public_wc_cubicles.fixtures){
    const c={id:fixture.cubicle_id,fixtures:fixture};
    const f=PALACE_PLAN.furniture.find(f=>f.id===c.id)!,[a,b,d,e]=f.bounds,t=.08,door=.9,dx=fixture.door_center_xz[0],y=0,h=2.2;
    boxes(c.id+':partitions','plaster',[[a,a+t,y,h,d,e],[b-t,b,y,h,d,e],[a+t,b-t,y,h,d,d+t],[a+t,dx-door/2,y,h,e-t,e],[dx+door/2,b-t,y,h,e-t,e],[dx-door/2,dx+door/2,2.05,h,e-t,e]],true);
    doors.push({thickness:t,opening:{id:c.id+':door',wall_id:c.id,width:door,height:2.05,kind:'door',leaf_count:1,angle_deg:100,leaf_thickness:.04,linked_room:'P05',center_xyz:[dx,1.025,e-t/2],span_axis:'X',bottom_y:0,open_normal_xz:[0,1]}});
    const r=c.fixtures.toilet_bounds_xz,tx=c.fixtures.toilet_center_xz[0],tz=c.fixtures.toilet_center_xz[1];
    if(includeFurniture){single(c.id+':wc-collider','hidden',rectBox(r,0,.75),true);
      lathe(c.id+':wc','ceramic',tx,tz,[[0,0],[.2,0],[.15,.28],[.3,.48],[.31,.55],[.22,.55],[0,.36]]);
      single(c.id+':tank','ceramic',[tx-.26,tx+.26,.3,.75,r[2],r[2]+.18]);}
  }
  // Exterior cornices and cornice bands give the long facades a human scale.
  for(const [y,h,p] of [[4.48,.27,.12],[8.94,.26,.3]]){
    boxes('facade-bands'+y,'stone',[[ -36.2-p,36.2+p,y,y+h,-.2-p,-.2],[-36.2-p,36.2+p,y,y+h,56.2,56.2+p],[-36.2-p,-36.2,y,y+h,-.2,56.2],[36.2,36.2+p,y,y+h,-.2,56.2]],false,false);
  }
  // The facade owns the corner quoins and portico columns. Do not superimpose
  // the former generic pilasters/capitals on those finished assemblies.
  const lamps:P3[]=[];
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
    for(let i=0;i<9;i++){const xx=x-o.width*.45+i*o.width*.9/8;lathe(o.id+':flowers'+i,i%3?'rose':'linen',xx,-.48,[[0,y+.24],[.15,y+.34],[.16,y+.45],[0,y+.52]],false,false);}
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
  palaceFacade(parts);
  return {lamps};
}

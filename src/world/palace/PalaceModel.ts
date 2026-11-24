import {PALACE_PLAN} from './BrisaliaPalacePlan';
import {PALACE_OPENINGS,PALACE_COLUMNS} from './PalaceLayout';
import {boxGeometry,face,geometry,rampGeometry,stairFlightGeometry,turnedGeometry,slabBoxes,subtractRect,unionBoxes,type Box,type Geometry} from './PalaceGeometry';
import {palaceRoof} from './PalaceRoof';
import {palaceStairRails} from './PalaceStairRails';
import {expandX,expandZ} from './PalaceExpansion';
export type Opening={id:string;wall_id:string;width:number;height:number;kind:string;leaf_count?:number;angle_deg?:number;leaf_thickness?:number;linked_room?:string|null;center_xyz:readonly number[];span_axis:string;bottom_y:number;open_normal_xz?:readonly number[]};
export type Part={id:string;material:string;solid:boolean;detail:boolean;data:Geometry;rigid?:boolean;expanded?:boolean};
export type DoorSpec={opening:Opening;thickness:number};
export type Anchor={id:string;name:string;use:string;level:string;point:readonly number[]};
export const rectBox=(r:readonly number[],lo:number,hi:number):Box=>[r[0],r[1],lo,hi,r[2],r[3]];
export function buildPalaceModel(){
  const parts:Part[]=[],doors:DoorSpec[]=[],anchors:Anchor[]=[];
  // The slab extends 30 cm beyond the column axes to carry their plinths.
  // This is part of the same solid, not a second coplanar strip on the floor.
  const floorSlabBoxes=(s:typeof PALACE_PLAN.slabs[number])=>slabBoxes(s.outer,s.holes.map((h,i)=>i===0?h.map(([x,z])=>[x-Math.sign(x)*.3,z+(z===18?.3:-.3)] as [number,number]):h),s.bottom_y,s.top_y);
  const add=(id:string,material:string,data:Geometry,solid=true,detail=false)=>{if(data.indices.length)parts.push({id,material,data,solid,detail});};
  const boxes=(id:string,mat:string,b:readonly Box[],solid=true,detail=false)=>add(id,mat==='stone'&&/column|baluster/.test(id)?'column':mat==='stone'&&/cornice|casings|visible-treads/.test(id)?'trim':mat,unionBoxes(b,geometry(),mat==='oak'),solid,detail);
  const box=(id:string,mat:string,b:Box,solid=true,detail=false)=>add(id,mat,boxGeometry(b,geometry(),mat==='oak'),solid,detail);
  const railGroups=new Map<string,{material:string;boxes:Box[]}>(),railPostKeys=new Set<string>();
  const rail=(id:string,a:readonly number[],b:readonly number[],base:number,top:number,thick=.16)=>{
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
    const r=[Math.min(a[0],b[0])-thick/2,Math.max(a[0],b[0])+thick/2,Math.min(a[1],b[1])-thick/2,Math.max(a[1],b[1])+thick/2];
    box(id+':collider','hidden',rectBox(r,base,top));
    const balcony=id.startsWith('balcony');
    const groupId=balcony?'balcony':id.startsWith('courtyard')?'courtyard':id.split(':')[0]+':'+base;
    let group=railGroups.get(groupId);if(!group){group={material:balcony?'trim':'oak',boxes:[]};railGroups.set(groupId,group);}
    group.boxes.push(rectBox(r,base+.08,base+.19),rectBox(r,top-.13,top));
    const posts:Box[]=[];for(let t=0;t<=len+.001;t+=len/Math.ceil(len/.6)){
      const x=a[0]+dx*t,z=a[1]+dz*t;
      const postKey=`${groupId}:${x.toFixed(4)}:${z.toFixed(4)}`;if(railPostKeys.has(postKey))continue;railPostKeys.add(postKey);
      if(id.startsWith('courtyard')&&PALACE_COLUMNS.some(c=>Math.abs(x-c.center_xz[0])<.32&&Math.abs(z-c.center_xz[1])<.32))continue;
      if(balcony||id.startsWith('courtyard'))add(id+':baluster'+t,'column',turnedGeometry(x,z,[[.085,base+.19],[.085,base+.25],[.072,base+.27],[.06,base+.3],[.066,base+.34],[.081,base+.38],[.098,base+.43],[.105,base+.48],[.104,base+.53],[.095,base+.58],[.079,base+.63],[.063,base+.68],[.052,base+.73],[.045,base+.78],[.044,base+.82],[.045,top-.23],[.055,top-.2],[.08,top-.13]],16,true),false);
      else posts.push([x-.06,x+.06,base+.19,top-.13,z-.06,z+.06]);
    }boxes(id+':balusters','stone',posts.filter(p=>!id.startsWith('courtyard')||!PALACE_COLUMNS.some(c=>Math.abs((p[0]+p[1])/2-c.center_xz[0])<.29&&Math.abs((p[4]+p[5])/2-c.center_xz[1])<.29)),false);
  };
  for(const [level,plan] of Object.entries(PALACE_PLAN.levels)){
    const wallBoxes:Box[]=[],casings:Box[]=[],windowWood:Box[]=[],glass:Box[]=[],skirting:Box[]=[];
    for(const room of plan.rooms)anchors.push({id:room.id,name:room.name,use:room.use,level,point:room.navigation_anchor_xyz});
    for(const wall of plan.walls){
      const axis=wall.start_xz[1]===wall.end_xz[1]?'X':'Z',i=axis==='X'?0:1,c=wall.start_xz[1-i],t=wall.thickness/2;
      let spans:number[][]=[[Math.min(wall.start_xz[i],wall.end_xz[i]),Math.max(wall.start_xz[i],wall.end_xz[i]),wall.base_y,wall.base_y+wall.height]];
      const ops=PALACE_OPENINGS[level].filter(o=>o.wall_id===wall.id);
      const b=(r:readonly number[],extra=0):Box=>axis==='X'?[r[0],r[1],r[2],r[3],c-t-extra,c+t+extra]:[c-t-extra,c+t+extra,r[2],r[3],r[0],r[1]];
      // Architraves are applied to the two finished wall faces. A full-depth
      // box would duplicate the plaster reveal at every jamb and lintel.
      const casing=(r:readonly number[],projection:number)=>{
        for(const s of [-1,1]){
          const near=c+s*t,far=near+s*projection,lo=Math.min(near,far),hi=Math.max(near,far);
          casings.push(axis==='X'?[r[0],r[1],r[2],r[3],lo,hi]:[lo,hi,r[2],r[3],r[0],r[1]]);
        }
      };
      for(const o of ops){
        const at=o.center_xyz[axis==='X'?0:2],lo=at-o.width/2,hi=at+o.width/2,y=o.bottom_y,h=o.height;
        spans=spans.flatMap(r=>subtractRect(r,[lo,hi,y,y+h]));
        const w=o.id==='PB-D001'?.3:.18;
        casing([lo-w,lo,y,y+h],.08);casing([hi,hi+w,y,y+h],.08);
        if(o.id!=='PB-D001')casing([lo-w,hi+w,y+h,y+h+w],.08);
        if(o.kind==='door')doors.push({opening:o,thickness:wall.thickness});
        else {
          casing([lo-w,hi+w,y-.15,y],.14);
          windowWood.push(b([lo,lo+.06,y,y+h],-.1),b([hi-.06,hi,y,y+h],-.1),b([lo,hi,y,y+.06],-.1),b([lo,hi,y+h-.06,y+h],-.1));
          for(let j=1;j<3;j++){const x=lo+o.width*j/3;windowWood.push(b([x-.018,x+.018,y,y+h],-.1));}
          for(let j=1;j<5;j++){const yy=y+h*j/5;windowWood.push(b([lo,hi,yy-.018,yy+.018],-.1));}
          glass.push(axis==='X'?[lo+.06,hi-.06,y+.06,y+h-.06,c-.012,c+.012]:[c-.012,c+.012,y+.06,y+h-.06,lo+.06,hi-.06]);
        }
      }
      wallBoxes.push(...spans.map(r=>b(r)));
      // Revestimiento terminates at the architrave, not inside its clear reveal.
      let low=spans.filter(r=>r[2]<wall.base_y+.9).map(r=>[r[0],r[1],r[2],Math.min(r[3],wall.base_y+.9)]);
      for(const o of ops){const at=o.center_xyz[axis==='X'?0:2],w=o.id==='PB-D001'?.3:.18;
        low=low.flatMap(r=>subtractRect(r,[at-o.width/2-w,at+o.width/2+w,o.bottom_y-.15,o.bottom_y+o.height+w]));}
      // A lining belongs to a finished face, never to a box through the wall.
      // Outer walls receive timber only on the room side upstairs.
      const exteriorSide=axis==='X'&&c===0?-1:axis==='X'&&c===56?1:axis==='Z'&&c===-36?-1:axis==='Z'&&c===36?1:0;
      for(const side of [-1,1]){
        if(level==='PA'&&side===exteriorSide)continue;
        const near=c+side*t,far=near+side*.04;
        skirting.push(...low.map(r=>axis==='X'?[r[0],r[1],r[2],r[3],Math.min(near,far),Math.max(near,far)] as Box:[Math.min(near,far),Math.max(near,far),r[2],r[3],r[0],r[1]] as Box));
      }
    }
    const slabs=PALACE_PLAN.slabs.flatMap(floorSlabBoxes);
    slabs.push([-10.4,10.4,4.5,4.8,-1.2,0]);
    add(level+':walls','plaster',unionBoxes(wallBoxes,geometry(),false,slabs));
    const lining=level==='PA'?skirting.flatMap(b=>subtractRect([b[0],b[1],b[4],b[5]],[-10,10,0,4]).map(r=>rectBox(r,b[2],b[3]))):skirting;
    add(level+':skirting',level==='PB'?'stone':'oak',unionBoxes(lining,geometry(),level==='PA',wallBoxes),false);
    add(level+':casings','trim',unionBoxes(casings,geometry(),false,wallBoxes),false);
    boxes(level+':window-frames','oak',windowWood,false);
    boxes(level+':glass','glass',glass);
    // Room-local beam grids and a mitred, stepped cornice around each room.
    for(const room of plan.rooms){
      if(['EA','EB','B01'].includes(room.id))continue;
      const [x0,x1,z0,z1]=room.bounds_xz,top=level==='PB'?4.5:8.9,beams:Box[]=[],trim:Box[]=[];
      // Seat the timber inside the masonry, including the thinner 24 cm
      // partitions. The cornice is cut around the sockets below.
      for(let z=z0+2;z<z1-.38;z+=4)beams.push([x0+.04,x1-.04,top-.32,top,z-.11,z+.11]);
      for(let x=x0+2;x<x1-.38;x+=4)beams.push([x-.11,x+.11,top-.32,top,z0+.04,z1-.04]);
      const clearBeams=beams.flatMap(b=>{
        let rects:number[][]=[[b[0],b[1],b[4],b[5]]];
        for(const bath of plan.bathrooms){const [a,c,d,e]=bath.bounds_xz;rects=rects.flatMap(r=>subtractRect(r,[a+.04,c-.04,d+.04,e-.04]));}
        return rects.map(r=>rectBox(r,b[2],b[3]));
      });
      boxes(room.id+':ceiling-beams','oak',clearBeams,false);
      // Successive inset rings join at their corners; union removes internal faces.
      const profile=PALACE_PLAN.approved_interior_language.cornice.profile_projection_height_m;
      const wallHalf=(axis:number,at:number,mid:number)=>(plan.walls.find(w=>Math.abs(w.start_xz[axis]-at)<1e-6&&Math.abs(w.end_xz[axis]-at)<1e-6&&mid>=Math.min(w.start_xz[1-axis],w.end_xz[1-axis])&&mid<=Math.max(w.start_xz[1-axis],w.end_xz[1-axis]))?.thickness??.24)/2;
      const a=x0+wallHalf(0,x0,(z0+z1)/2)-.015,b=x1-wallHalf(0,x1,(z0+z1)/2)+.015;
      const c=z0+wallHalf(1,z0,(x0+x1)/2)-.015,d=z1-wallHalf(1,z1,(x0+x1)/2)+.015;
      for(let j=1;j<profile.length-1;j++){
        const prev=profile[j-1],cur=profile[j];if(cur[1]<=prev[1])continue;
        const proj=Math.max(cur[0],prev[0]);
        trim.push(...slabBoxes([[a,c],[b,c],[b,d],[a,d]],
          [[[a+proj,c+proj],[b-proj,c+proj],[b-proj,d-proj],[a+proj,d-proj]]],top-.22+prev[1],top-.22+cur[1]));
      }
      const socketTrim=trim.flatMap(b=>{
        let rects:number[][]=[[b[0],b[1],b[4],b[5]]];
        for(const beam of clearBeams)rects=rects.flatMap(r=>subtractRect(r,[beam[0],beam[1],beam[4],beam[5]]));
        return rects.map(r=>rectBox(r,b[2],b[3]));
      });boxes(room.id+':cornice','stone',socketTrim,false);
    }
  }
  // The entrance is a real segmental opening, including its curved reveal.
  const arch=geometry(),trim=geometry(),radius=3.6333333333,cy=-.0333333333;
  for(let i=0;i<32;i++){
    const x=-2+i/8,xx=x+.125,y=cy+Math.sqrt(radius*radius-x*x),yy=cy+Math.sqrt(radius*radius-xx*xx);
    for(const sign of [-1,1]){
      const z=sign*.2;face(arch,[[x,y,z],[xx,yy,z],[xx,3.6,z],[x,3.6,z]],[0,0,sign]);
      const tz=sign*.29;face(trim,[[x,y,tz],[xx,yy,tz],[xx,yy+.3,tz],[x,y+.3,tz]],[0,0,sign]);
    }
    const dx=xx-x,dy=yy-y,n=Math.hypot(dx,dy);face(arch,[[x,y,-.2],[xx,yy,-.2],[xx,yy,.2],[x,y,.2]],[dy/n,-dx/n,0]);
  }add('entrance-arch','plaster',arch);add('entrance-architrave','trim',trim,false);
  for(const slab of PALACE_PLAN.slabs)boxes(slab.id,'paving',floorSlabBoxes(slab));
  // The portico columns stand below a real projecting balcony slab. Previously
  // their centres were outside the floor, leaving the upper bases in the air.
  box('portico-balcony-slab','paving',[-10.4,10.4,4.5,4.8,-1.2,0]);
  // Slab bounds are wall axes; side walks start at the exterior wall face.
  // Fill only that 20 cm reveal, without overlapping either finished surface.
  for(const o of PALACE_OPENINGS.PB){
    if(o.kind!=='door'||Math.abs(o.center_xyz[0])!==36)continue;
    const [x,,z]=o.center_xyz,outer=x+Math.sign(x)*.2;
    box(o.id+':threshold','stone',[Math.min(x,outer),Math.max(x,outer),-.3,0,z-o.width/2,z+o.width/2]);
  }
  const sl=PALACE_PLAN.slabs[0];boxes('upper-ceiling','plaster',slabBoxes(sl.outer,sl.holes,8.9,9.2));
  for(const stair of PALACE_PLAN.stairs){
    // Bottom and upper landings already belong to the floor slabs.
    for(const l of stair.landings)if(l.name==='mid')box(stair.id+':landing','trim',rectBox(l.bounds_xz,l.top_y-.3,l.top_y));
    for(const [i,r] of stair.collision_ramps.entries()){
      const steps=stair.steps.filter(s=>s.id.includes('-F'+(i+1)+'-'));
      add(stair.id+':visible-treads'+i,'trim',stairFlightGeometry(steps,r.start_xyz,r.end_xyz),false);
      add(stair.id+':ramp'+i,'hidden',rampGeometry(r.start_xyz,r.end_xyz,r.width,.3,i===0?0:undefined));
    }
    parts.push(...palaceStairRails(stair));
  }
  const roof=palaceRoof();add('roof-shell','roof',roof.roof,false);add('roof-soffit','oak',roof.soffit,false);add('roof-fascia','oak',roof.fascia,false);add('pavilion-gables','plaster',roof.ends,false);
  for(const [i,t] of PALACE_PLAN.tower_extensions.entries()){
    const [a,b,c,d]=t.bounds_xz;
    boxes('tower'+i,'plaster',slabBoxes([[a-.2,c-.2],[b+.2,c-.2],[b+.2,d+.2],[a-.2,d+.2]],[[[a+.2,c+.2],[b-.2,c+.2],[b-.2,d-.2],[a+.2,d-.2]]],t.bottom_y,t.top_y));
  }
  for(const c of PALACE_PLAN.chimneys){box(c.id,'stone',rectBox(c.shaft_bounds_xz,c.bottom_y,c.top_y));const [x0,x1,z0,z1]=c.shaft_bounds_xz;
    box(c.id+':cap','roof',[x0-.15,x1+.15,c.top_y,c.top_y+.16,z0-.15,z1+.15],false);}
  for(const c of PALACE_COLUMNS)for(const [lo,hi] of c.segments_y){
    const [x,z]=c.center_xz;
    parts.push({id:c.id+':column-collider'+lo,material:'hidden',solid:true,detail:false,rigid:true,
      data:unionBoxes([[x-.23,x+.23,lo,hi-.3,z-.23,z+.23],[x-.3,x+.3,lo,lo+.16,z-.3,z+.3]])});
  }
  const beam=PALACE_PLAN.gallery_beams,bb:Box[]=[];
  // Expand the structural axes first, then give the beams their real section.
  // Stretching their vertices across a grid break shifts them off the columns.
  for(let i=1;i<beam.path_xz.length;i++){
    const a=beam.path_xz[i-1],b=beam.path_xz[i];
    for(const [lo,hi] of beam.segments_y)bb.push([expandX(Math.min(a[0],b[0]))-.2,expandX(Math.max(a[0],b[0]))+.2,lo-.3,hi-.3,expandZ(Math.min(a[1],b[1]))-.2,expandZ(Math.max(a[1],b[1]))+.2]);
  }
  parts.push({id:'gallery-beams',material:'oak',solid:true,detail:false,expanded:true,data:unionBoxes(bb,geometry(),true)});
  for(const [id,path] of [['courtyard',PALACE_PLAN.upper_courtyard_guardrail.closed_path_xz],['balcony',PALACE_PLAN.front_balcony_guardrail.path_xz]] as const)
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],front=(p:readonly number[])=>[p[0],p[1]===0?-1.1:p[1]];
      rail(id+i,id==='balcony'?front(a):a,id==='balcony'?front(b):b,4.8,5.9);
    }
  for(const [id,group] of railGroups){
    // Rails enter the round columns as housed joints. A stretched rectangular
    // cutout left daylight around the rigid shafts after enlarging the court.
    // The embedded timber is hidden by the closed column surface.
    add(id+':joined-rails',group.material,unionBoxes(group.boxes,geometry(),group.material==='oak'),false);
  }
  const l=PALACE_PLAN.landscape;
  box('podium','stone',rectBox(l.foundation_podium.bounds_xz,-.6,-.3));
  // Separate garden surfaces join, without painting grass through the floors.
  box('courtyard-ground','garden',rectBox(l.courtyard_ground.bounds_xz,-.3,-.08));
  boxes('perimeter-walk','paving',l.perimeter_walks.map(w=>rectBox(w.bounds_xz,w.bottom_y,w.top_y)));
  const rear=subtractRect(l.rear_garden_ground.bounds_xz,l.perimeter_walks[2].bounds_xz);
  boxes('rear-garden','garden',rear.map(r=>rectBox(r,-.6,0)));
  box('front-terrace','paving',rectBox(l.front_terrace.bounds,-.6,0));
  for(let i=0;i<4;i++)box('front-step'+i,'stone',[-10,10,-.6,-.6+(i+1)*.15,-4.4+i*.6,-3.8+i*.6]);
  add('accessible-ramp','stone',rampGeometry([-12.8,-.6,-14],[-12.8,0,-2],2.4,.12));
  // Plaza and walkways replace the recessed soil; their tops agree at -0.60 m.
  box('plaza','paving',[-32,32,-.69,-.59,-24,-4.4]);
  for(const x of [-39,39])box('front-side-walk','paving',[x-3,x+3,-.69,-.59,-24,0]);
  return {parts,doors,anchors};
}




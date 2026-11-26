import {face,geometry,timberGeometry,turnedGeometry,unionBoxes,type Geometry,type P3} from './PalaceGeometry';
import {PALACE_PLAN} from './BrisaliaPalacePlan';
import {expandX,expandZ} from './PalaceExpansion';
import type {Part} from './PalaceModel';

/** Reading and crafting stations are visible objects attached to the furniture. */
export function palaceRoomProps(parts:Part[]){
  const place=(id:string,material:string,data:Geometry,origin:P3)=>{
    for(let i=0;i<data.positions.length;i+=3){data.positions[i]+=expandX(origin[0]);data.positions[i+1]+=origin[1];data.positions[i+2]+=expandZ(origin[2]);}
    parts.push({id:'station:'+id,material,data,solid:false,detail:true,expanded:true});
  };
  for(const [id,origin] of [['reception',[6.5,.85,8]],['administration',[13.5,.85,3]],['archive',[13,5.65,54.5]]] as [string,P3][]){
    place(id+':book-cover','oak',unionBoxes([[-.45,.45,0,.04,-.3,.3]]),origin);
    const pages=geometry();face(pages,[[-.42,.07,-.27],[0,.045,-.27],[0,.045,.27],[-.42,.07,.27]],[0,1,0]);face(pages,[[0,.045,-.27],[.42,.07,-.27],[.42,.07,.27],[0,.045,.27]],[0,1,0]);place(id+':pages','linen',pages,origin);
    const ink=geometry();for(const s of [-1,1])for(let j=0;j<7;j++){const x=s*.22,z=-.2+j*.06,a=x-.14,b=x+.14,ya=.046+Math.abs(a)*.025/.42,yb=.046+Math.abs(b)*.025/.42;face(ink,[[a,ya,z],[b,yb,z],[b,yb,z+.009],[a,ya,z+.009]],[0,1,0]);}place(id+':writing','iron',ink,origin);
    place(id+':inkwell','iron',turnedGeometry(.7,.1,[[0,0],[.07,0],[.09,.09],[.05,.15],[.04,.15],[.04,.1],[0,.09]],16,true),origin);
    place(id+':pen','brass',timberGeometry([.66,.13,.07],[.6,.33,.13],.012,.012),origin);
  }
  const origin:P3=[-30,.856,19.5];
  place('map:paper','linen',unionBoxes([[-1.12,1.12,0,.008,-.82,.82]]),origin);
  const rooms=geometry(),court=geometry(),line=geometry(),scale=.023;
  for(const room of PALACE_PLAN.levels.PB.rooms){const [a,b,c,d]=room.bounds_xz,x0=a*scale,x1=b*scale,z0=(c-28)*scale,z1=(d-28)*scale;
    face(rooms,[[x0,.01,z0],[x1,.01,z0],[x1,.01,z1],[x0,.01,z1]],[0,1,0]);
    const y=.012,w=.009;for(const [a,b,c,d] of [[x0,x1,z0,z0+w],[x0,x1,z1-w,z1],[x0,x0+w,z0,z1],[x1-w,x1,z0,z1]])face(line,[[a,y,c],[b,y,c],[b,y,d],[a,y,d]],[0,1,0]);
  }
  face(court,[[-16*scale,.01,-10*scale],[16*scale,.01,-10*scale],[16*scale,.01,12*scale],[-16*scale,.01,12*scale]],[0,1,0]);
  place('map:rooms','trim',rooms,origin);place('map:courtyard','sage',court,origin);place('map:walls','iron',line,origin);
  const bench:P3=[-30,.85,32];
  place('workshop:hammer-handle','oak',timberGeometry([-.65,.035,-.35],[.12,.035,.12],.045,.045),bench);
  place('workshop:hammer-head','iron',unionBoxes([[-.03,.2,.015,.14,.05,.23]]),bench);
  for(const s of [-1,1])place('workshop:tongs'+s,'iron',timberGeometry([.42+s*.08,.025,-.36],[.58-s*.035,.025,.35],.025,.025),bench);
  place('workshop:tool-roll','linen',unionBoxes([[-1.3,-.92,0,.045,-.66,.62]]),bench);
  for(let i=0;i<4;i++)place('workshop:chisel'+i,'brass',timberGeometry([-1.24+i*.08,.06,-.5],[-1.24+i*.08,.06,.45],.025,.025),bench);
}

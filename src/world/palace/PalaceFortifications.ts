import {geometry,unionBoxes,turnedGeometry,face,type Box,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';
import {PALACE_DESIGN as D} from './PalaceDesign';

/** Crenellated corner towers and the high timber hall establish the building's
 * medieval silhouette. Their masonry returns are full solids, not facade cards. */
export function palaceFortifications(parts:Part[]){
  const add=(id:string,material:string,data:Part['data'],solid=false)=>parts.push({id,material,data,solid,detail:false});
  const box=(id:string,material:string,bs:Box[],solid=false)=>add(id,material,unionBoxes(bs,geometry(),material==='oak'),solid);
  for(const cx of [-32,32]){
    const a=cx-4.7,b=cx+4.7,c=-.7,d=10.7,y=D.towerEave;
    const ring=(t:number,lo:number,hi:number):Box[]=>[[a,b,lo,hi,c,c+t],[a,b,lo,hi,d-t,d],[a,a+t,lo,hi,c+t,d-t],[b-t,b,lo,hi,c+t,d-t]];
    box('castle:parapet'+cx,'masonry',ring(.65,y-.12,y+.74),true);
    box('castle:parapet-belt'+cx,'trim',ring(.73,y-.18,y+.02));
    const merlons:Box[]=[];
    for(const z of [c,d-.65])for(let x=a;x<b-.1;x+=1.74)merlons.push([x,Math.min(x+.93,b),y+.74,y+1.73,z,z+.65]);
    for(const x of [a,b-.65])for(let z=c+1.65;z<d-1;z+=1.82)merlons.push([x,x+.65,y+.74,y+1.73,z,z+.94]);
    box('castle:merlons'+cx,'masonry',merlons,true);
    box('castle:merlon-coping'+cx,'trim',merlons.map(q=>[q[0]-.025,q[1]+.025,q[3],q[3]+.08,q[4]-.025,q[5]+.025]));
    // Corbel tables carry the projecting battlement instead of hanging from it.
    for(const z of [c+.22,d-.22])for(let x=a+.5;x<b-.3;x+=1.1)
      box('castle:corbel'+cx+x+z,'trim',[[x-.17,x+.17,y-.78,y-.12,z-.3,z+.3],[x-.23,x+.23,y-.3,y-.12,z-.36,z+.36]]);
    for(const x of [a+.22,b-.22])for(let z=c+1.3;z<d-1;z+=1.1)
      box('castle:side-corbel'+cx+x+z,'trim',[[x-.3,x+.3,y-.78,y-.12,z-.17,z+.17],[x-.36,x+.36,y-.3,y-.12,z-.23,z+.23]]);
    // Corner watch turrets begin inside the main wall and rise above the merlons.
    for(const x of [cx-4.05,cx+4.05])for(const z of [.1,9.9]){
      const outer=Math.abs(x)>32,base=outer?-1.55:8.8,r=outer?1.08:.84;
      add('castle:watch-turret'+x+z,'masonry',turnedGeometry(x,z,[[r*1.12,base],[r*1.12,Math.max(base+.15,.16)],[r,Math.max(base+.4,.7)],[r,y+1.85],[r*.77,y+1.85],[r*.77,y+1.5],[0,y+1.5]],40,true),true);
      if(outer&&z<1){
        // Two conical watch roofs break the rectangular skyline. The stone
        // drum carries their overhang; the point is a solid weathered finial.
        add('castle:conical-roof'+x,'roof',turnedGeometry(x,z,[[0,y+1.84],[r*1.16,y+1.84],[r*1.16,y+2],[.04,y+5],[0,y+5.04]],48,true));
        continue;
      }
      const teeth=geometry();
      for(let i=0;i<6;i++){
        const start=i*Math.PI/3,end=start+.57;
        const p=(radius:number,h:number,t:number):P3=>[x+Math.cos(t)*radius*r/.7,h,z+Math.sin(t)*radius*r/.7];
        const low=y+1.85,high=y+2.38;
        face(teeth,[p(.7,low,start),p(.7,low,end),p(.7,high,end),p(.7,high,start)],[Math.cos((start+end)/2),0,Math.sin((start+end)/2)]);
        face(teeth,[p(.54,low,start),p(.54,high,start),p(.54,high,end),p(.54,low,end)],[-Math.cos((start+end)/2),0,-Math.sin((start+end)/2)]);
        face(teeth,[p(.54,high,start),p(.7,high,start),p(.7,high,end),p(.54,high,end)],[0,1,0]);
        for(const [t,s] of [[start,-1],[end,1]])face(teeth,[p(.54,low,t),p(.7,low,t),p(.7,high,t),p(.54,high,t)],[-Math.sin(t)*s,0,Math.cos(t)*s]);
      }add('castle:turret-merlons'+x+z,'trim',teeth);
    }
  }
  // S01 opens into the attic: a seven-metre-high great hall, clear at the centre.
  box('great-hall:raised-walls','masonry',[[-10.12,-9.88,8.9,12.05,4,14],[9.88,10.12,8.9,12.05,4,14],[-9.88,9.88,8.9,12.05,3.88,4.12],[-9.88,9.88,8.9,12.05,13.88,14.12]],true);
  const vault=geometry(),arch=(x:number)=>9.45+2.6*Math.sqrt(Math.max(0,1-(x/10.12)**2));
  for(let i=0;i<48;i++){
    const a=-10.12+20.24*i/48,b=-10.12+20.24*(i+1)/48,ya=arch(a),yb=arch(b),len=Math.hypot(b-a,yb-ya);
    face(vault,[[a,ya,3.88],[a,ya,14.12],[b,yb,14.12],[b,yb,3.88]],[(yb-ya)/len,-(b-a)/len,0]);
    face(vault,[[a,ya+.15,3.88],[b,yb+.15,3.88],[b,yb+.15,14.12],[a,ya+.15,14.12]],[-(yb-ya)/len,(b-a)/len,0]);
  }add('great-hall:ceiling','oak',vault);
  for(const z of [4.4,8.8,13.4]){
    for(const s of [-1,1]){
      box('great-hall:wall-post'+s+z,'oak',[[s*9.7-.17,s*9.7+.17,4.8,arch(9.7),z-.19,z+.19]]);
    }
    const rib=geometry();
    for(let i=0;i<40;i++){
      const a=-9.7+19.4*i/40,b=-9.7+19.4*(i+1)/40,ya=arch(a),yb=arch(b),len=Math.hypot(b-a,yb-ya);
      for(const s of [-1,1])face(rib,[[a,ya-.3,z+s*.2],[b,yb-.3,z+s*.2],[b,yb+.015,z+s*.2],[a,ya+.015,z+s*.2]],[0,0,s]);
      face(rib,[[a,ya-.3,z-.2],[a,ya-.3,z+.2],[b,yb-.3,z+.2],[b,yb-.3,z-.2]],[(yb-ya)/len,-(b-a)/len,0]);
    }add('great-hall:arched-rib'+z,'oak',rib);
    add('great-hall:chandelier-chain'+z,'iron',turnedGeometry(0,z,[[.018,9.55],[.018,11.85]],8));
    add('great-hall:iron-chandelier'+z,'iron',turnedGeometry(0,z,[[.82,9.5],[1,9.5],[1,9.59],[.82,9.59],[.82,9.5]],20));
    for(let j=0;j<8;j++){const angle=j*Math.PI/4,x=Math.cos(angle)*.9,zz=z+Math.sin(angle)*.9;box('great-hall:candle'+z+j,'linen',[[x-.035,x+.035,9.59,9.84,zz-.035,zz+.035]]);box('great-hall:flame'+z+j,'light',[[x-.018,x+.018,9.84,9.9,zz-.018,zz+.018]]);}
  }
}

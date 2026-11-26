import {face,geometry,unionBoxes,turnedGeometry,timberGeometry,handrailGeometry,rampGeometry,subtractRect,type Box,type Geometry,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';
import {palaceRoofDetails} from './PalaceRoofDetails';
import {PALACE_DESIGN as D} from './PalaceDesign';
import {timberCorbel} from './PalaceTimber';

/** Open, supported exterior galleries and the three roof pavilions. The room
 * walls retain their existing apertures; the new gallery is outside them. */
export function palaceExterior(parts:Part[]){
  palaceRoofDetails(parts);
  const add=(id:string,material:string,data:Geometry,solid=false,rigid=false)=>parts.push({id:'reference:'+id,material,data,solid,detail:false,rigid});
  const box=(id:string,material:string,b:readonly Box[],solid=false)=>add(id,material,unionBoxes(b,geometry(),material==='oak'),solid);
  const beam=(id:string,a:P3,b:P3,w=.2,d=.2)=>add(id,'oak',timberGeometry(a,b,w,d));
  const turn=(id:string,mat:string,x:number,z:number,profile:readonly (readonly [number,number])[],solid=false)=>add(id,mat,turnedGeometry(x,z,profile,16,true),solid,true);
  // The attic is a closed raised body, not a triangular billboard.
  box('pavilion-attic','masonry',[
    [-10.6,10.6,9.2,D.pavilion.eave_y,-.7,-.2],[-10.6,10.6,9.2,D.pavilion.eave_y,16.4,16.9],
    [-10.6,-10.2,9.2,D.pavilion.eave_y,-.2,16.4],[10.2,10.6,9.2,D.pavilion.eave_y,-.2,16.4],
  ],true);
  for(const y of [4.35,8.95,11.65])box('central-cornice'+y,'oak',[[-10.8,10.8,y,y+.24,-1.05,-.2]]);
  for(const x of [-9.55,-4.7,4.7,9.55]){
    box('central-pier'+x,'stone',[[x-.34,x+.34,0,11.65,-.86,-.2]],true);
    for(const y of [0,4.8,9.2])box('pier-base'+x+y,'trim',[[x-.44,x+.44,y,y+.18,-1.02,-.2]]);
    for(const y of [4.15,8.75,11.42])box('pier-cap'+x+y,'trim',[[x-.46,x+.46,y,y+.23,-1.08,-.2]]);
  }
  // Curved stone crown centred above the ceremonial balcony.
  const crown=geometry();
  for(let i=0;i<24;i++){
    const a=i*Math.PI/24,b=(i+1)*Math.PI/24;
    const p=(r:number,t:number,z:number):P3=>[Math.cos(t)*r,10.25+Math.sin(t)*r*.68,z];
    face(crown,[p(1.78,a,-1.1),p(1.78,b,-1.1),p(2.02,b,-1.1),p(2.02,a,-1.1)],[0,0,-1]);
    const n:P3=[Math.cos((a+b)/2),Math.sin((a+b)/2),0];
    face(crown,[p(2.02,a,-1.1),p(2.02,b,-1.1),p(2.02,b,-.7),p(2.02,a,-.7)],n);
  }add('curved-crown','trim',crown);
  // A continuous balcony links the two wings, with a real 3 m deep floor.
  for(const s of [-1,1]){
    const lo=Math.min(s*D.galleryStart,s*D.galleryEnd),hi=Math.max(s*D.galleryStart,s*D.galleryEnd);
    box('gallery-floor'+s,'oak',[[lo,hi,4.5,4.8,D.galleryFront,-.2]],true);
    box('gallery-rail'+s,'oak',[[lo,hi,4.94,5.08,D.galleryRail-.09,D.galleryRail+.09],[lo,hi,5.78,5.94,D.galleryRail-.11,D.galleryRail+.11]],true);
    box('gallery-guard'+s,'hidden',[[lo,hi,4.8,5.94,D.galleryRail-.08,D.galleryRail+.08]],true);
    for(let x=lo+.28;x<hi-.2;x+=.5)box('gallery-baluster'+s+x,'oak',[[x-.045,x+.045,5.08,5.78,D.galleryRail-.045,D.galleryRail+.045]]);
    const marks=[lo,lo+(hi-lo)/3,lo+2*(hi-lo)/3,hi];
    for(const x of marks){
      box('gallery-post'+s+x,'oak',[[x-.15,x+.15,.18,4.5,-3.07,-2.77],[x-.15,x+.15,4.8,8.92,-3.07,-2.77]],true);
      box('gallery-foot'+s+x,'trim',[[x-.24,x+.24,0,.18,-3.16,-2.68]],true);
      for(const y of [4.2,8.67])for(const dx of [-1,1])if(x+dx>lo&&x+dx<hi)
        add('gallery-brace'+s+x+y+dx,'oak',timberCorbel([x,y+.015,-2.92],[dx,0],.95,.8,.24));
      beam('gallery-joist'+s+x,[x,4.32,-3.15],[x,4.32,-.15],.22,.26);
    }
    box('gallery-beam'+s,'oak',[[lo-.12,hi+.12,4.2,4.5,-3.12,-2.72],[lo-.12,hi+.12,8.67,8.93,-3.12,-2.72]]);
    // End guard terminates against the tower wall, not in an open fall.
    const x=s*D.galleryEnd;
    box('gallery-end-guard'+s,'oak',[[x-.08,x+.08,5.78,5.94,-3.05,-.18],[x-.08,x+.08,4.94,5.08,-3.05,-.18]],true);
    box('gallery-end-collider'+s,'hidden',[[x-.08,x+.08,4.8,5.94,-3.05,-.2]],true);
    for(let z=-2.8;z<-.2;z+=.45)box('gallery-end-spindle'+s+z,'oak',[[x-.045,x+.045,5.065,5.795,z-.045,z+.045]]);
    box('gallery-wall-newel'+s,'oak',[[x-.1,x+.1,4.8,5.94,-.32,-.18]],true);
  }
  // Two real arched lights in each tower attic, with masonry reveals and glazing.
  for(const cx of [-32,32]){
    const a=cx-4.2,b=cx+4.2,holes=[cx-.95,cx+.95],r=.67,spring=10.73,bottom=9.55;
    let rects=[[a,b,9.2,D.towerEave]];
    for(const x of holes)rects=rects.flatMap(q=>subtractRect(q,[x-r,x+r,bottom,spring+r]));
    for(const x of [cx-2.3,cx+2.3])rects=rects.flatMap(q=>subtractRect(q,[x-.12,x+.12,12.35,13.65]));
    box('tower-arched-wall'+cx,'masonry',rects.map(q=>[q[0],q[1],q[2],q[3],-.2,.2] as Box),true);
    for(const x of [cx-2.3,cx+2.3])box('tower-arrow-slit'+x,'iron',[[x-.12,x+.12,12.35,13.65,.15,.17]]);
    for(const x of holes){
      const masonry=geometry(),frame=geometry(),glass=geometry();
      for(let i=0;i<20;i++){
        const xx=x-r+2*r*i/20,xxx=x-r+2*r*(i+1)/20,y=spring+Math.sqrt(Math.max(0,r*r-(xx-x)**2)),yy=spring+Math.sqrt(Math.max(0,r*r-(xxx-x)**2));
        for(const z of [-.2,.2])face(masonry,[[xx,y,z],[xxx,yy,z],[xxx,spring+r,z],[xx,spring+r,z]],[0,0,Math.sign(z)]);
        const len=Math.hypot(xxx-xx,yy-y);face(masonry,[[xx,y,-.2],[xxx,yy,-.2],[xxx,yy,.2],[xx,y,.2]],[(yy-y)/len,-(xxx-xx)/len,0]);
        face(frame,[[xx,y,-.28],[xxx,yy,-.28],[xxx,yy+.12,-.28],[xx,y+.12,-.28]],[0,0,-1]);
        face(glass,[[xx,bottom,.02],[xxx,bottom,.02],[xxx,yy,.02],[xx,y,.02]],[0,0,-1]);
      }
      add('tower-arch'+x,'masonry',masonry,true);add('tower-arch-trim'+x,'trim',frame);add('tower-glass'+x,'glass',glass);
      box('tower-window-frame'+x,'oak',[[x-r,x-r+.065,bottom,spring,-.23,-.1],[x+r-.065,x+r,bottom,spring,-.23,-.1],[x-.025,x+.025,bottom,spring+r,-.23,-.1],[x-r,x+r,10.25,10.31,-.23,-.1]]);
      box('tower-window-sill'+x,'trim',[[x-r-.14,x+r+.14,bottom-.14,bottom,-.45,.2]]);
    }
    for(const y of [4.42,8.86,11.84]){
      box('tower-timber-band'+cx+y,'oak',[[a-.04,b+.04,y,y+.25,-.48,-.2]]);
      for(let x=a+.6;x<b;x+=1.25)add('tower-bracket'+cx+y+x,'oak',timberCorbel([x,y+.015,-.185],[0,-1],.3,.52,.2));
    }
    for(const x of [cx-3.65,cx+3.65])box('tower-timber-upright'+x,'oak',[[x-.1,x+.1,4.68,11.84,-.39,-.2]]);
  }
  for(const x of [-23,-16,16,23]){
    // Each dormer has an actual glazed front and closed sloping cheek walls.
    box('dormer-face'+x,'oak',[[x-1.12,x-.84,9.62,11.25,.48,.68],[x+.84,x+1.12,9.62,11.25,.48,.68],[x-.84,x+.84,9.62,9.8,.48,.68],[x-.84,x+.84,11.08,11.25,.48,.68],[x-.04,x+.04,9.8,11.08,.48,.68]]);
    box('dormer-glass'+x,'glass',[[x-.84,x+.84,9.8,11.08,.6,.62]]);
    for(const s of [-1,1]){
      const cheek=geometry();face(cheek,[[x+s*1.1,9.56,.5],[x+s*1.1,10.75,4.8],[x+s*1.1,11.25,4.8],[x+s*1.1,11.25,.5]],[s,0,0]);add('dormer-cheek'+x+s,'oak',cheek);
      beam('dormer-verge'+x+s,[x+s*1.15,11.2,.43],[x,12.4,.43],.12,.14);
    }
  }
  // Golden cloth carries the lantern and cherry emblem in a single material.
  for(const x of [-7.2,7.2]){
    const g=geometry(),w=1.9,top=10.1,bottom=5.65,z=-1.25;
    face(g,[[x-w/2,top,z],[x+w/2,top,z],[x+w/2,bottom+.35,z],[x,bottom,z],[x-w/2,bottom+.35,z]],[0,0,-1]);
    for(let i=0;i<g.positions.length/3;i++){g.uvs[i*2]=(g.positions[i*3]-x)/w+.5;g.uvs[i*2+1]=(g.positions[i*3+1]-bottom)/(top-bottom);}
    add('front-banner'+x,'banner',g);box('banner-rod'+x,'brass',[[x-1.15,x+1.15,top,top+.09,z-.04,-.65]]);
  }
  const lantern=(id:string,x:number,z:number,y:number,k:number)=>{
    turn(id+'-base','brass',x,z,[[0,y],[.32*k,y],[.32*k,y+.14*k],[.16*k,y+.26*k]]);
    box(id+'-light','light',[[x-.23*k,x+.23*k,y+.26*k,y+.97*k,z-.23*k,z+.23*k]]);
    const bars:Box[]=[];for(const dx of [-.28,.23])for(const dz of [-.28,.23])bars.push([x+dx*k,x+(dx+.05)*k,y+.22*k,y+1.02*k,z+dz*k,z+(dz+.05)*k]);
    box(id+'-frame','brass',bars);turn(id+'-cap','brass',x,z,[[.38*k,y+1.01*k],[.38*k,y+1.1*k],[.08*k,y+1.36*k],[.09*k,y+1.44*k],[0,y+1.6*k]]);
  };
  lantern('central-lantern',0,6.95,16.5,1.25);
  // Continuous side guards follow the eight arrival treads.
  for(const s of [-1,1]){
    const x=s*9.65;
    const path:P3[]=[[x,D.plazaY+1.05,D.stairFront-.35],[x,D.plazaY+.15+1.05,D.stairFront+.3],[x,1.05,D.stairBack-.3],[x,1.05,D.stairBack+.35]];
    // Solid masonry cheeks carry a stone coping; no classical vase balusters.
    for(let i=1;i<path.length;i++)add('arrival-parapet'+s+i,'masonry',rampGeometry(path[i-1].map((v,k)=>v-(k===1?.09:0)) as P3,path[i].map((v,k)=>v-(k===1?.09:0)) as P3,.48,1.1),true);
    add('arrival-rail'+s,'trim',handrailGeometry(path,.22,.18),true);
    for(let i=1;i<path.length;i++)add('arrival-guard'+s+i,'hidden',rampGeometry(path[i-1],path[i],.2,1.05),true);
    for(const [z,y] of [[D.stairFront-.35,D.plazaY],[D.stairBack+.35,0]]){
      box('arrival-pier'+s+z,'stone',[[x-.3,x+.3,y,y+1.04,z-.3,z+.3]],true);
      add('arrival-finial'+s+z,'trim',turnedGeometry(x,z,[[.44,y+1.04],[.44,y+1.14],[.12,y+1.34],[0,y+1.34]],4),false,true);
    }
  }
}

import {face,geometry,timberGeometry,unionBoxes,type Geometry,type P3} from './PalaceGeometry';
import {ellipsoid,joinSculpture,sculptedTube} from './PalaceSculpture';
import {PALACE_OPENINGS} from './PalaceLayout';
import type {Part} from './PalaceModel';
import {timberCorbel} from './PalaceTimber';

/** Carved details have thickness and a visible support. Apertures stay clear. */
export function palaceOrnaments(parts:Part[]){
  const add=(id:string,material:string,data:Geometry,solid=false)=>parts.push({id:'carved:'+id,material,data,solid,detail:false});
  const floral=geometry(),scrolls=geometry(),back=geometry();
  // The backing reaches the stems and leaves, so the relief is attached.
  const outline:P3[]=[[-1.78,10.23,-1.18],[1.78,10.23,-1.18],...Array.from({length:25},(_,i)=>{const a=i*Math.PI/24;return [Math.cos(a)*1.78,10.25+Math.sin(a)*1.2,-1.18] as P3;})];
  face(back,outline,[0,0,-1]);face(back,outline.map(([x,y])=>[x,y,-.66]),[0,0,1]);
  for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...d);if(l>1e-6)face(back,[a,b,[b[0],b[1],-.66],[a[0],a[1],-.66]],[d[1]/l,-d[0]/l,0]);}
  add('crest-backing','stone',back);
  joinSculpture(scrolls,sculptedTube(Array.from({length:37},(_,i)=>{const a=i*Math.PI/36;return [Math.cos(a)*1.69,10.25+Math.sin(a)*1.11,-1.19] as P3;}),.048));
  for(let j=0;j<5;j++){const a=j*Math.PI*2/5;joinSculpture(floral,ellipsoid([Math.sin(a)*.2,10.96+Math.cos(a)*.2,-1.2],[.105,.19,.075],-a));}
  joinSculpture(floral,ellipsoid([0,10.96,-1.26],[.105,.105,.075]));
  for(const s of [-1,1]){
    joinSculpture(scrolls,sculptedTube(Array.from({length:25},(_,i)=>{const t=i/24;return [s*(.12+1.28*t),10.35+.3*Math.sin(t*Math.PI),-1.2] as P3;}),.027));
    for(let i=0;i<5;i++){
      const t=(i+.5)/6,x=s*(.12+1.28*t),y=10.35+.3*Math.sin(t*Math.PI);
      joinSculpture(floral,ellipsoid([x+s*.08,y+.12,-1.18],[.06,.15,.055],-s*.65));
      joinSculpture(floral,ellipsoid([x+s*.07,y-.09,-1.18],[.055,.12,.05],s*.8));
    }
    // Closed stone brackets carry the projecting ceremonial balcony.
    const x=s*3.8,g=geometry(),profile=[[-.27,3.3],[-.7,3.34],[-1,3.5],[-1.3,3.91],[-2.5,4.2],[-3.12,4.32]];
    // Divide the concave side into strips; a polygon fan would cross its recess.
    for(let i=1;i<profile.length;i++){
      const [z,y]=profile[i-1],[zz,yy]=profile[i],l=Math.hypot(zz-z,yy-y);
      for(const dx of [-.18,.18])face(g,[[x+dx,y,z],[x+dx,yy,zz],[x+dx,4.5,zz],[x+dx,4.5,z]],[Math.sign(dx),0,0]);
      face(g,[[x-.18,y,z],[x+.18,y,z],[x+.18,yy,zz],[x-.18,yy,zz]],[0,(zz-z)/l,-(yy-y)/l]);
    }
    face(g,[[x-.18,4.5,-.27],[x+.18,4.5,-.27],[x+.18,4.5,-3.12],[x-.18,4.5,-3.12]],[0,1,0]);
    for(const [z,y] of [profile[0],profile.at(-1)!])face(g,[[x-.18,y,z],[x+.18,y,z],[x+.18,4.5,z],[x-.18,4.5,z]],[0,0,z===-.27?1:-1]);
    add('balcony-console'+s,'trim',g);
    for(const dx of [-.19,.19]){
      const spiral=Array.from({length:32},(_,i)=>{const t=i/31,a=t*Math.PI*2.6,r=.24*(1-t)+.025;return [x+dx,4.07+Math.sin(a)*r,-2.55+Math.cos(a)*r] as P3;});
      add('console-scroll'+s+dx,'column',sculptedTube(spiral,.04));
    }
  }
  add('crest-leaves','column',floral);add('crest-stems','trim',scrolls);
  for(const x of [-9,-6,-3,0,3,6,9]){
    add('pavilion-eave-beam'+x,'oak',timberGeometry([x,11.99,-.4],[x,11.99,-3.35],.2,.22));
    add('pavilion-eave-brace'+x,'oak',timberCorbel([x,11.895,-.69],[0,-1],1.42,.55,.22));
  }
  const arch=geometry(),cy=-.0333333333,r=3.6333333333;
  for(const offset of [.08,.24,.4])joinSculpture(arch,sculptedTube(Array.from({length:49},(_,i)=>{const x=-2+4*i/48;return [x,cy+Math.sqrt(r*r-x*x)+offset,-.62-offset*.35] as P3;}),.045));
  add('portal-archivolts','trim',arch);
  for(const s of [-1,1])add('portal-jamb'+s,'trim',unionBoxes([[s*2.18-.1,s*2.18+.1,.15,3.15,-.73,-.28]]));
  // The two lower tower windows now have arched masonry reveals, not a
  // decorative arch pasted over a rectangular opening.
  for(const o of [...PALACE_OPENINGS.PB,...PALACE_OPENINGS.PA].filter(o=>o.kind==='window'&&o.center_xyz[2]===0&&Math.abs(o.center_xyz[0])===32)){
    const x=o.center_xyz[0],r=o.width/2,top=o.bottom_y+o.height,spring=top-r,g=geometry(),surround=geometry();
    for(let i=0;i<32;i++){
      const xx=-r+2*r*i/32,xxx=-r+2*r*(i+1)/32,y=spring+Math.sqrt(Math.max(0,r*r-xx*xx)),yy=spring+Math.sqrt(Math.max(0,r*r-xxx*xxx));
      for(const z of [-.205,.205])face(g,[[x+xx,y,z],[x+xxx,yy,z],[x+xxx,top,z],[x+xx,top,z]],[0,0,Math.sign(z)]);
      const l=Math.hypot(xxx-xx,yy-y);face(g,[[x+xx,y,-.205],[x+xxx,yy,-.205],[x+xxx,yy,.205],[x+xx,y,.205]],[(yy-y)/l,-(xxx-xx)/l,0]);
      const a=i*Math.PI/32+.008,b=(i+1)*Math.PI/32-.008,p=(rr:number,t:number,z:number):P3=>[x+Math.cos(t)*rr,spring+Math.sin(t)*rr,z];
      face(surround,[p(r,a,-.4),p(r,b,-.4),p(r+.19,b,-.4),p(r+.19,a,-.4)],[0,0,-1]);
      const n:P3=[Math.cos((a+b)/2),Math.sin((a+b)/2),0];face(surround,[p(r+.19,a,-.4),p(r+.19,b,-.4),p(r+.19,b,-.22),p(r+.19,a,-.22)],n);
    }
    add(o.id+':arched-infill','plaster',g,true);add(o.id+':voussoirs','trim',surround);
  }
}

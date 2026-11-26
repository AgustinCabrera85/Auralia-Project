import {face,geometry,turnedGeometry,type P3} from './PalaceGeometry';
import {ellipsoid,joinSculpture,sculptedTube} from './PalaceSculpture';

export const PALACE_FOUNTAIN={diameter:6.4,height:2.5,waterY:.31,basinRadius:2.85,lowerLip:1.04,lowerY:1.452,upperLip:.52,upperY:1.932,lowerLanding:1.27,upperLanding:.72} as const;
export function palaceFountainGeometry(){
  const stone=geometry(),carving=geometry(),gold=geometry(),bronze=geometry(),eyes=geometry();
  const turn=(profile:readonly (readonly [number,number])[])=>joinSculpture(stone,turnedGeometry(0,0,profile,96,true,true));
  turn([[0,0],[3.1,0],[3.2,.08],[3.2,.14],[3.04,.2],[3.04,.49],[3.16,.53],[3.16,.62],[2.83,.62],[2.83,.55],[2.86,.22],[.36,.22],[.36,0],[0,0]]);
  turn([[0,.22],[.58,.22],[.62,.3],[.56,.36],[.43,.41],[.32,.58],[.28,.83],[.38,1.05],[.54,1.12],[.54,1.17],[0,1.17]]);
  turn([[0,1.06],[.46,1.06],[.59,1.12],[.8,1.19],[1.02,1.29],[1.14,1.35],[1.14,1.42],[1.04,1.44],[.91,1.34],[.6,1.24],[.22,1.21],[0,1.21]]);
  turn([[0,1.21],[.24,1.21],[.28,1.3],[.19,1.4],[.17,1.61],[.25,1.72],[.46,1.77],[.6,1.85],[.6,1.9],[.52,1.92],[.32,1.84],[.15,1.82],[0,1.82]]);
  turn([[0,1.82],[.16,1.82],[.18,1.88],[.14,1.95],[0,1.95]]);
  // Sixteen shallow floral reliefs are mounted on the basin wall.
  for(let i=0;i<16;i++){
    const a=i*Math.PI*2/16,local=geometry();
    for(let j=0;j<5;j++){const t=j*Math.PI*2/5;joinSculpture(local,ellipsoid([Math.sin(t)*.09,.355+Math.cos(t)*.09,-3.045],[.045,.072,.025],-t,10,6));}
    joinSculpture(local,ellipsoid([0,.355,-3.07],[.045,.045,.026],0,10,6));
    for(let n=0;n<local.positions.length;n+=3){for(const values of [local.positions,local.normals]){const x=values[n],z=values[n+2];values[n]=x*Math.cos(a)-z*Math.sin(a);values[n+2]=x*Math.sin(a)+z*Math.cos(a);}}
    joinSculpture(carving,local);
  }
  // A canary in profile: connected body, neck, head, folded wings and long tail.
  joinSculpture(gold,ellipsoid([0,2.2,0],[.28,.19,.145],-.18,24,14));
  joinSculpture(gold,ellipsoid([-.16,2.3,0],[.15,.17,.12],-.2));
  joinSculpture(gold,ellipsoid([-.24,2.38,0],[.13,.12,.115]));
  for(const s of [-1,1]){
    joinSculpture(bronze,ellipsoid([.045,2.205,s*.13],[.22,.103,.025],-.25));
    joinSculpture(eyes,ellipsoid([-.285,2.41,s*.1],[.016,.018,.01],0,10,6));
    joinSculpture(bronze,sculptedTube([[s*.08,2.08,s*.075],[s*.08,1.97,s*.08],[s*.08-.06,1.955,s*.08]],.012,6));
    for(let j=-1;j<=1;j++)joinSculpture(bronze,sculptedTube([[s*.08,1.965,s*.08],[s*.08-.1,1.955,s*.08+j*.028]],.009,6));
    for(let j=0;j<4;j++)joinSculpture(gold,sculptedTube([[-.06+j*.045,2.23,s*.15],[.12+j*.028,2.17,s*.15],[.22+j*.012,2.14,s*.12]],.007,6));
  }
  for(let i=-1;i<=1;i++)joinSculpture(gold,ellipsoid([.36,2.12,i*.035],[.26,.035,.031],-.3,16,8));
  const tip:P3=[-.46,2.37,0],back:P3[]=[[-.345,2.4,-.035],[-.345,2.4,.035],[-.345,2.345,.035],[-.345,2.345,-.035]];
  for(let i=0;i<4;i++){const a=back[i],b=back[(i+1)%4],n:P3=[-.3,(a[1]+b[1])/2-2.37,(a[2]+b[2])/2];const l=Math.hypot(...n);face(bronze,[tip,a,b],n.map(v=>v/l) as P3);}face(bronze,back,[1,0,0]);
  return [{id:'basin-and-cups',material:'trim',data:stone,solid:true},{id:'basin-carving',material:'column',data:carving,solid:false},{id:'canary',material:'gold',data:gold,solid:false},{id:'canary-feathers',material:'brass',data:bronze,solid:false},{id:'canary-eyes',material:'iron',data:eyes,solid:false}];
}

/** Thin film follows the crown, peels from its outside edge, then falls under
 * gravity. Its lower edge meets the next reservoir, never the side of a bowl. */
export function palaceOverflowPoint(t:number,angle:number,upper=false):P3{
  const f=PALACE_FOUNTAIN,lip=upper?f.upperLip:f.lowerLip,y0=upper?f.upperY:f.lowerY;
  const outer=upper?.615:1.155,landing=upper?f.upperLanding:f.lowerLanding,y1=upper?f.lowerY:f.waterY;
  t=Math.max(0,Math.min(1,t));let r:number,y:number;
  if(t<.2){const u=t/.2;r=lip+(outer-lip)*Math.sin(u*Math.PI/2);y=y0-.022*(1-Math.cos(u*Math.PI/2));}
  else{const u=(t-.2)/.8;r=outer+(landing-outer)*u;y=y0-.022-(y0-.022-y1)*(.16*u+.84*u*u);}
  return [Math.cos(angle)*r,y,Math.sin(angle)*r];
}
export function palaceOverflowGeometry(upper=false){
  const g=geometry(),sides=128,rows=24;
  for(let j=0;j<=rows;j++)for(let i=0;i<=sides;i++){
    const t=j/rows,a=i*Math.PI*2/sides,p=palaceOverflowPoint(t,a,upper);
    const before=palaceOverflowPoint(Math.max(0,t-.001),a,upper),after=palaceOverflowPoint(Math.min(1,t+.001),a,upper);
    const dr=Math.hypot(after[0],after[2])-Math.hypot(before[0],before[2]),dy=after[1]-before[1],length=Math.hypot(dr,dy);
    g.positions.push(...p);g.normals.push(-dy*Math.cos(a)/length,dr/length,-dy*Math.sin(a)/length);g.uvs.push(a,t);
    if(j<rows&&i<sides){const n=j*(sides+1)+i;g.indices.push(n,n+sides+2,n+1,n,n+sides+1,n+sides+2);}
  }return g;
}
export function palaceReservoirGeometry(){
  const g=geometry(),f=PALACE_FOUNTAIN;
  for(const [inner,outer,y,impact] of [[.615,f.basinRadius,f.waterY,f.lowerLanding],[.19,f.lowerLip,f.lowerY,f.upperLanding],[.15,f.upperLip,f.upperY,0]])for(let i=0;i<128;i++){
    const a=i*Math.PI/64,b=(i+1)*Math.PI/64,p=(r:number,t:number):P3=>[Math.cos(t)*r,y,Math.sin(t)*r],first=g.positions.length/3;
    face(g,[p(inner,a),p(outer,a),p(outer,b),p(inner,b)],[0,1,0]);
    for(let n=first;n<g.positions.length/3;n++){g.uvs[n*2]=impact;g.uvs[n*2+1]=outer;}
  }return g;
}

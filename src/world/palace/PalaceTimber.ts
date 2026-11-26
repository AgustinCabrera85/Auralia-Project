import {face,geometry,type P3} from './PalaceGeometry';

/** Solid sawn knee with a curved cut-out, a vertical housed back and a flat
 * upper bearing face. Directions are horizontal and point away from support. */
export function timberCorbel(origin:P3,direction:readonly [number,number],reach:number,height:number,width=.22){
  const g=geometry(),[dx,dz]=direction,across:P3=[-dz,0,dx];
  const p=(u:number,y:number,w:number):P3=>[origin[0]+dx*u+across[0]*w,origin[1]+y,origin[2]+dz*u+across[2]*w];
  const bottom=(t:number)=>-.09-(height-.09)*(1-Math.sqrt(Math.max(0,2*t-t*t)));
  for(let i=0;i<12;i++){
    const a=reach*i/12,b=reach*(i+1)/12,ya=bottom(i/12),yb=bottom((i+1)/12),l=Math.hypot(b-a,yb-ya);
    for(const s of [-1,1])face(g,[p(a,ya,s*width/2),p(b,yb,s*width/2),p(b,0,s*width/2),p(a,0,s*width/2)],across.map(n=>n*s) as P3);
    face(g,[p(a,ya,-width/2),p(a,ya,width/2),p(b,yb,width/2),p(b,yb,-width/2)],[dx*(yb-ya)/l,-(b-a)/l,dz*(yb-ya)/l]);
  }
  face(g,[p(0,0,-width/2),p(reach,0,-width/2),p(reach,0,width/2),p(0,0,width/2)],[0,1,0]);
  for(const [u,y,s] of [[0,-height,-1],[reach,-.09,1]])face(g,[p(u,y,-width/2),p(u,y,width/2),p(u,0,width/2),p(u,0,-width/2)],[dx*s,0,dz*s]);
  for(let i=0;i<g.positions.length/3;i++){const x=g.positions[i*3]-origin[0],z=g.positions[i*3+2]-origin[2];g.uvs[i*2]=g.positions[i*3+1]/.35;g.uvs[i*2+1]=(x*dx+z*dz)/2;}
  return g;
}

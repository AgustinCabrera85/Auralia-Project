import {face,geometry,turnedGeometry,unionBoxes,type Geometry,type P3} from './PalaceGeometry';
import type {Part} from './PalaceModel';
import {sculptedTube} from './PalaceSculpture';

const merge=(out:Geometry,g:Geometry)=>{const offset=out.positions.length/3;out.positions.push(...g.positions);out.normals.push(...g.normals);out.uvs.push(...g.uvs);out.indices.push(...g.indices.map(i=>i+offset));};
const noise=(i:number)=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};

/** Low planting uses individual leaves; larger shrubs reuse the Brisalia GLBs.
 * New cosmos and daisy heads have cupped petals, a centre and attached stems. */
export function palacePlant(parts:Part[],id:string,x:number,y:number,z:number,radius:number,height=.65,flowerCount=12){
  const leaves=geometry(),stems=geometry(),pollen=geometry(),blooms=[geometry(),geometry(),geometry()];
  const leaf=(base:P3,angle:number,length:number)=>{
    const end:P3=[base[0]+Math.cos(angle)*length,base[1]+length*.28,base[2]+Math.sin(angle)*length];
    const mid:P3=base.map((n,k)=>(n+end[k])*.5+(k===1?length*.16:0)) as P3;
    const side:P3=[-Math.sin(angle)*length*.22,0,Math.cos(angle)*length*.22];
    for(const sign of [-1,1]){
      const edge:P3=mid.map((n,k)=>n+side[k]*sign-(k===1?length*.15:0)) as P3;
      const u=edge.map((n,k)=>n-base[k]),v=end.map((n,k)=>n-base[k]);
      let normal:P3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const len=Math.hypot(...normal);normal=normal.map(n=>n/len*(normal[1]<0?-1:1)) as P3;
      face(leaves,[base,edge,mid],normal);face(leaves,[mid,edge,end],normal);
    }
  };
  if(radius>=.4){
    parts.push({id:id+':asset',material:'sage',data:geometry(),solid:false,detail:false,
      plant:{id,x,y:y-.025,z,radius,height:height*.85,asset:height>1?'brisaliaYuyos':'brisaliaMatorral'}});
  }else for(let i=0;i<14;i++){
    const a=i*2.4,r=radius*.45*noise(i+x);leaf([x+Math.cos(a)*r,y+.02,z+Math.sin(a)*r],a,radius*(.55+.45*noise(i+z)));
  }
  for(let i=0;i<flowerCount;i++){
    const a=i*2.399,r=radius*Math.sqrt((i+.5)/flowerCount)*.88,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
    const yy=y+height*(.66+.4*noise(i+z)),size=(radius<.4?.045:.065)+.025*noise(i+x+z),g=blooms[(i+Math.floor(Math.abs(x)))%3];
    const h=yy-y,bend=h*(.1+.13*noise(i+x*3+z)),direction=a+.8*noise(i+z*2);
    const dx=Math.cos(direction),dz=Math.sin(direction),sway=h*.04*(noise(i+x*2)-.5);
    const stemPoint=(t:number):P3=>[xx+dx*bend*t*t-dz*sway*Math.sin(Math.PI*t),y+h*t,zz+dz*bend*t*t+dx*sway*Math.sin(Math.PI*t)];
    const tip=stemPoint(1),tangent:P3=[2*dx*bend+dz*sway*Math.PI,h,2*dz*bend-dx*sway*Math.PI];
    const length=Math.hypot(...tangent),up=tangent.map(n=>n/length) as P3;
    const acrossLength=Math.hypot(up[0],up[1]),across:P3=[up[1]/acrossLength,-up[0]/acrossLength,0];
    const forward:P3=[across[1]*up[2],-across[0]*up[2],across[0]*up[1]-across[1]*up[0]];
    const headPoint=(x:number,y:number,z:number):P3=>tip.map((v,k)=>v+across[k]*x+up[k]*y+forward[k]*z) as P3;
    const headSolid=(g:Geometry)=>{
      for(let i=0;i<g.positions.length;i+=3){
        const p=g.positions.slice(i,i+3),n=g.normals.slice(i,i+3);g.positions.splice(i,3,...headPoint(p[0],p[1],p[2]));
        g.normals.splice(i,3,...up.map((v,k)=>across[k]*n[0]+v*n[1]+forward[k]*n[2]));
      }return g;
    };
    merge(stems,sculptedTube(Array.from({length:5},(_,j)=>stemPoint(j/4)),.006,5));
    for(const f of [.32,.58])leaf(stemPoint(f),a+f*9,size*2.4);
    // A green receptacle surrounds the stem tip and overlaps the petal roots
    // and pollen disk. All three follow the same terminal tangent.
    merge(stems,headSolid(turnedGeometry(0,0,[[0,-.012],[.008,-.012],[size*.3,.018],[0,.026]],5,true)));
    const petals=i%3===0?8:6;
    for(let petal=0;petal<petals;petal++){
      const angle=a+petal*Math.PI*2/petals,along:P3=[Math.cos(angle),0,Math.sin(angle)],side:P3=[-Math.sin(angle),0,Math.cos(angle)];
      const centre=headPoint(along[0]*size*.58,.018,along[2]*size*.58);
      const ring=Array.from({length:8},(_,j)=>{
        const t=j*Math.PI/4,long=size*(.58+Math.cos(t)*.56),wide=Math.sin(t)*size*.38;
        return headPoint(along[0]*long+side[0]*wide,.012+Math.max(0,long/size-.3)**2*.04,along[2]*long+side[2]*wide);
      });
      for(let j=0;j<8;j++){
        const u=ring[j].map((n,k)=>n-centre[k]),v=ring[(j+1)%8].map((n,k)=>n-centre[k]);
        let n:P3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        const length=Math.hypot(...n);n=n.map(q=>q/length*(n[1]<0?-1:1)) as P3;
        face(g,[centre,ring[j],ring[(j+1)%8]],n);
      }
    }
    merge(pollen,headSolid(turnedGeometry(0,0,[[0,.005],[size*.26,.014],[size*.2,.032],[0,.037]],10,true)));
  }
  for(const [suffix,material,data] of [['leaves','leaf',leaves],['stems','leaf',stems],['flowerPink','flowerPink',blooms[0]],['flowerCream','flowerCream',blooms[1]],['flowerBlue','flowerBlue',blooms[2]],['pollen','pollen',pollen]] as const)
    if(data.indices.length)parts.push({id:id+':'+suffix,material,data,solid:false,detail:false,rigid:[x,z]});
}

export function palaceGardenDetails(parts:Part[]){
  const solid=(id:string,material:string,b:Parameters<typeof unionBoxes>[0])=>parts.push({id,material,data:unionBoxes(b,geometry(),material==='oak'),solid:true,detail:false});
  for(const s of [-1,1]){
    // Cherry-tree islands and benches frame a clear central approach.
    const x=s*24,z=-11,y=-1.2;
    parts.push({id:'cherry-island'+s,material:'stone',solid:true,detail:false,rigid:true,data:turnedGeometry(x,z,[[1.75,-1.55],[1.95,-1.55],[1.95,y+.4],[1.7,y+.4],[1.7,y]],24,true)});
    for(let i=0;i<9;i++){const a=i*Math.PI*2/9;palacePlant(parts,'cherry-island-plant'+s+i,x+Math.cos(a)*1.25,y+.18,z+Math.sin(a)*1.25,.48,.48,8);}
    for(const zz of [-19,64,78]){
      const bx=s*(zz<0?20:30),base=zz<0?-1.2:0;
      solid('garden-bench'+s+zz,'oak',[[bx-1.8,bx+1.8,base+.44,base+.56,zz-.35,zz+.35],[bx-1.8,bx+1.8,base+.58,base+1.12,zz+.26,zz+.36]]);
      solid('garden-bench-feet'+s+zz,'stone',[[bx-1.5,bx-1.15,base,base+.44,zz-.28,zz+.28],[bx+1.15,bx+1.5,base,base+.44,zz-.28,zz+.28]]);
    }
    for(let i=0;i<8;i++){
      palacePlant(parts,'rear-border'+s+i,s*43,0,62+i*2.5,1.05,.75+(i%3)*.25,14);
      palacePlant(parts,'court-border'+s+i,s*13.9,-.06,20.5+i*2.4,.65,.45+(i%2)*.2,8);
    }
    for(const z of [23,35])solid('court-bench'+s+z,'oak',[[s*9-1.6,s*9+1.6,.4,.52,z-.32,z+.32],[s*9-1.4,s*9-1.15,-.08,.4,z-.25,z+.25],[s*9+1.15,s*9+1.4,-.08,.4,z-.25,z+.25]]);
  }
  // Paths and a clipped hedge define the rear garden without obstructing exits.
  solid('rear-axis','paving',[[-2,2,0,.015,60,82],[-38,38,0,.015,73,75]]);
  for(const s of [-1,1])for(let i=0;i<10;i++)palacePlant(parts,'rear-end'+s+i,s*(4+i*3.6),0,81,1,.8,8);
}

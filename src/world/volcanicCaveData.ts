/** Authored lava-tube route. Units match the runtime character (3.8 m tall).
 * The exterior belongs to the World Studio Crisol massif, not legacy town offsets. */
export const VOLCANIC_CAVE={id:'caverna-del-crisol',name:'Caverna del Crisol',
  entrance:{x:-342,z:-4287},entranceYaw:-.0755,legacyEntrance:{x:-180,z:-1640},baseY:-400,
  rewardId:'crisol-corazon-descubierto',secretId:'crisol-camara-secreta',
  recoveryY:-419} as const;
export type CavePoint={x:number;y:number;z:number};
export type CaveNode=CavePoint&{width:number};
export const CAVE_NODES:Record<string,CaveNode>={
  exit:{x:0,y:0,z:70,width:4.8},
  entry:{x:0,y:0,z:65,width:5},throat:{x:3,y:0,z:48,width:5},
  overlook:{x:-5,y:1,z:28,width:8},west:{x:-26,y:4,z:8,width:7},
  bridgeWest:{x:-20,y:6,z:-14,width:5.5},bridgeEast:{x:16,y:6,z:-14,width:5.5},
  eastApproach:{x:21,y:6,z:-3,width:6},
  east:{x:31,y:3,z:8,width:7},lowerEast:{x:30,y:-4,z:29,width:5},
  lowerSouth:{x:10,y:-6,z:36,width:5},lowerTurn:{x:-4,y:-7,z:17,width:5},
  westBend:{x:-43,y:-5,z:-12,width:5},
  under:{x:0,y:-7,z:-14,width:7},lowerWest:{x:-24,y:-5,z:-31,width:8},
  return:{x:-39,y:-3,z:30,width:5},north:{x:18,y:5,z:-40,width:7},
  rejoin:{x:-20,y:1.8,z:31,width:6},
  vault:{x:13,y:5,z:-63,width:11},secret:{x:-35,y:0,z:-52,width:8},
  shortcut:{x:-13,y:4,z:-40,width:5}
};
export const CAVE_ROUTES:readonly (readonly string[])[]=[
  ['exit','entry','throat','overlook','west','bridgeWest','bridgeEast','north','vault'],
  ['bridgeEast','eastApproach','east','lowerEast','lowerSouth','lowerTurn','under','lowerWest','westBend','return','rejoin','overlook'],
  ['lowerWest','secret'],['vault','shortcut','bridgeWest']
];
export const CAVE_LIGHTS=[
  {x:0,y:9,z:58,color:[.52,.65,.82],range:36,power:1.4},
  {x:-26,y:12,z:8,color:[.88,.57,.31],range:44,power:1.8},
  {x:17,y:16,z:-12,color:[.52,.7,.75],range:52,power:2.1},
  {x:13,y:11,z:-63,color:[1,.43,.16],range:34,power:2.3},
  {x:-35,y:6,z:-52,color:[.32,.72,.77],range:27,power:1.5},
  {x:10,y:-1,z:22,color:[.88,.42,.19],range:34,power:1.1}
] as const;
export const caveWorldPoint=(p:CavePoint):CavePoint=>({...p,y:p.y+VOLCANIC_CAVE.baseY});

/** Negative inside the connected air volume. Smooth unions and coherent ridges
 * shape rock masses, instead of scattering intersecting spheres along a route. */
export function caveField(x:number,y:number,z:number):number{
  const ellipsoids=[
    [0,2,0,54,29,55], [1,7,47,13,14,34],
    [12,9,-55,26,23,29],[-29,4,-44,24,20,25]
  ];
  let field=1000;
  for(const [cx,cy,cz,rx,ry,rz] of ellipsoids){
    const d=(Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz)-1)*Math.min(rx,ry,rz);
    const h=Math.max(0,5-Math.abs(field-d))/5;
    field=Math.min(field,d)-h*h*1.25;
  }
  field+=1.25*Math.sin(x*.16+Math.sin(z*.08))*Math.sin(y*.21+z*.09)
    +.55*Math.sin(x*.37+y*.24)*Math.cos(z*.29);
  if(z>48){
    const t=Math.min(1,(z-48)/13),rx=13-7.4*t,ry=18-11.9*t;
    const arch=y<3?Math.abs(x)-rx:(Math.hypot(x/rx,(y-3)/ry)-1)*Math.min(rx,ry);
    field=Math.max(field,arch+.12*Math.sin(x*.7+z*.4),-y-.6);
  }
  return field;
}

export type CaveGeometry={positions:number[];indices:number[];uvs:number[];colors:number[]};
export const emptyCaveGeometry=():CaveGeometry=>({positions:[],indices:[],uvs:[],colors:[]});
type V=readonly [number,number,number];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** Explicit winding is shared by rendering and exact-triangle collision. */
export function caveTriangle(g:CaveGeometry,a:V,b:V,c:V,toward:V,tint=1,offsetY:number=VOLCANIC_CAVE.baseY):void{
  let n=cross(sub(b,a),sub(c,a));
  // Babylon's left-handed ComputeNormals uses the opposite cross-product order.
  if(n[0]*toward[0]+n[1]*toward[1]+n[2]*toward[2]>0){[b,c]=[c,b];n=n.map(v=>-v) as unknown as V;}
  if(Math.hypot(...n)<1e-7)return;
  const k=g.positions.length/3,axis=Math.abs(n[1])>Math.max(Math.abs(n[0]),Math.abs(n[2]))?1:Math.abs(n[0])>Math.abs(n[2])?0:2;
  for(const p of [a,b,c]){
    g.positions.push(p[0],p[1]+offsetY,p[2]);
    g.uvs.push((axis===0?p[2]:p[0])/9,(axis===1?p[2]:p[1])/9);
    const shade=tint*(.83+.1*Math.sin(p[0]*.21+p[2]*.13)+.07*Math.sin(p[1]*.5));
    g.colors.push(shade*.94,shade*.97,shade,1);
  }
  g.indices.push(k,k+1,k+2);
}

/** Connected interior surface; the mountain and entrance form its outer rock. */
export function buildCaveShell(step=3):CaveGeometry{
  const g=emptyCaveGeometry(),min=[-60,-36,-90],size=[40,26,58];
  const corners:V[]=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const cache=new Float32Array((size[0]+1)*(size[1]+1)*(size[2]+1));
  const index=(x:number,y:number,z:number)=>(z*(size[1]+1)+y)*(size[0]+1)+x;
  for(let z=0;z<=size[2];z++)for(let y=0;y<=size[1];y++)for(let x=0;x<=size[0];x++)
    cache[index(x,y,z)]=caveField(min[0]+x*step,min[1]+y*step,min[2]+z*step);
  for(let z=0;z<size[2];z++)for(let y=0;y<size[1];y++)for(let x=0;x<size[0];x++){
    const v=corners.map(([dx,dy,dz])=>cache[index(x+dx,y+dy,z+dz)]);
    if(v.every(d=>d>0)||v.every(d=>d<0))continue;
    const p=corners.map(([dx,dy,dz]):V=>[min[0]+(x+dx)*step,min[1]+(y+dy)*step,min[2]+(z+dz)*step]);
    for(const t of tetra){
      const inside=t.filter(i=>v[i]<0),outside=t.filter(i=>v[i]>=0);
      if(!inside.length||!outside.length)continue;
      const edge=(a:number,b:number):V=>{const f=v[a]/(v[a]-v[b]);return [0,1,2].map(k=>p[a][k]+(p[b][k]-p[a][k])*f) as unknown as V;};
      const towards=sub(p[inside[0]],p[outside[0]]);
      const emit=(a:V,b:V,c:V)=>{
        caveTriangle(g,a,b,c,towards,.78);
      };
      if(inside.length===1)emit(...outside.map(b=>edge(inside[0],b)) as [V,V,V]);
      else if(outside.length===1)emit(...inside.map(a=>edge(a,outside[0])) as [V,V,V]);
      else{const [a,b]=inside,[c,d]=outside,A=edge(a,c),B=edge(a,d),C=edge(b,c),D=edge(b,d);emit(A,B,C);emit(B,D,C);}
    }
  }
  return g;
}

/** Thick, irregular ribbons with shared joint sections: no cracks at bends.
 * Tops are gently crowned; undersides taper into lava-flow rock. */
export function buildCaveRoute(route:readonly string[]):CaveGeometry{
  const g=emptyCaveGeometry(),points=route.map(id=>CAVE_NODES[id]);
  const offsets=points.map((p,i)=>{
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    const before=i?{x:p.x-a.x,z:p.z-a.z}:{x:b.x-p.x,z:b.z-p.z};
    const after=i<points.length-1?{x:b.x-p.x,z:b.z-p.z}:before;
    const la=Math.hypot(before.x,before.z),lb=Math.hypot(after.x,after.z);
    const nx=-before.z/la-after.z/lb,nz=before.x/la+after.x/lb,length=Math.hypot(nx,nz);
    const factor=1/Math.max(.55,(nx/length*(-after.z/lb)+nz/length*(after.x/lb)));
    return {nx:nx/length*factor,nz:nz/length*factor};
  });
  const samples:{p:CaveNode;nx:number;nz:number;phase:number}[]=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/3);
    for(let j=0;j<steps;j++){
      const t=j/steps,A=offsets[i],B=offsets[i+1];
      samples.push({p:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,width:a.width+(b.width-a.width)*t},
        nx:A.nx+(B.nx-A.nx)*t,nz:A.nz+(B.nz-A.nz)*t,phase:i+t});
    }
  }
  const last=points.at(-1)!,before=points.at(-2)!,length=Math.hypot(last.x-before.x,last.z-before.z);
  samples.push({p:last,nx:-(last.z-before.z)/length,nz:(last.x-before.x)/length,phase:points.length-1});
  const rings=samples.map(({p,nx,nz,phase})=>{
    const width=p.width*(1+.09*Math.sin(phase*7)+.045*Math.sin(phase*17));
    const depth=p.y>=0?3.1+.25*Math.sin(phase*4)+p.width*.02:5.5+1.4*Math.sin(phase*4)+p.width*.18;
    return [[-1,-.08],[0,.08],[1,-.08],[1.06,-1.3],[.79,-depth*.6],[.16,-depth],[-.72,-depth*.7],[-1.07,-1.5]]
      .map(([side,y]):V=>[p.x+nx*width*side,p.y+y,p.z+nz*width*side]);
  });
  for(let i=1;i<rings.length;i++)for(let k=0;k<8;k++){
    const j=(k+1)%8,a=rings[i-1][k],b=rings[i][k],c=rings[i][j],d=rings[i-1][j];
    const toward:V=k<2?[0,1,0]:k<4?[samples[i].nx,-.3,samples[i].nz]:k>5?[-samples[i].nx,-.3,-samples[i].nz]:[0,-1,0];
    caveTriangle(g,a,b,c,toward,k<2?1.12:.85);caveTriangle(g,a,c,d,toward,k<2?1.12:.85);
  }
  for(const end of [0,rings.length-1])for(let k=1;k<7;k++){
    const p=samples[end],n=end===0?samples[1]:samples[end-1];
    caveTriangle(g,rings[end][0],rings[end][k],rings[end][k+1],[p.p.x-n.p.x,0,p.p.z-n.p.z]);
  }
  return g;
}

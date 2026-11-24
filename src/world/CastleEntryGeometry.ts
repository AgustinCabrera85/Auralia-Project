export const CASTLE_ENTRIES={
  gate:{width:7,front:-33.16,back:-29.88,sideBack:-30.12,base:0,top:1.35,steps:8,tread:.36},
  hall:{width:4.74,front:-13.86,back:-9.42,sideBack:-9.66,base:1.35,top:3,steps:10,tread:.34}
} as const;
export type CastleEntry=keyof typeof CASTLE_ENTRIES;
type Point=readonly [number,number,number];

/** One closed stair/landing shell. No overlapping top slabs or hidden ramps. */
export function castleEntryGeometry(kind:CastleEntry){
  const c=CASTLE_ENTRIES[kind],half=c.width/2,bottom=c.base-.16;
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
  const quad=(points:readonly Point[],normal:Point)=>{
    const start=positions.length/3;
    for(const p of points){positions.push(...p);normals.push(...normal);
      uvs.push((normal[0]?p[2]:p[0])/1.3,(normal[1]?p[2]:p[1])/1.3);}
    const [a,b,d]=points,u=b.map((v,i)=>v-a[i]),v=d.map((v,i)=>v-a[i]);
    const dot=(u[1]*v[2]-u[2]*v[1])*normal[0]+(u[2]*v[0]-u[0]*v[2])*normal[1]+(u[0]*v[1]-u[1]*v[0])*normal[2];
    const order=dot>0?[0,2,1,0,3,2]:[0,1,2,0,2,3];
    indices.push(...order.map(i=>start+i));
  };
  for(let i=0;i<c.steps;i++){
    const z=c.front+i*c.tread,end=i===c.steps-1?c.back:z+c.tread;
    const top=c.base+(c.top-c.base)*(i+1)/c.steps,previous=i===0?bottom:c.base+(c.top-c.base)*i/c.steps;
    quad([[-half,top,z],[half,top,z],[half,top,end],[-half,top,end]],[0,1,0]);
    quad([[-half,previous,z],[half,previous,z],[half,top,z],[-half,top,z]],[0,0,-1]);
    for(const side of [-1,1] as const)quad([[half*side,bottom,z],[half*side,bottom,end],[half*side,top,end],[half*side,top,z]],[side,0,0]);
  }
  quad([[-half,bottom,c.back],[half,bottom,c.back],[half,c.top,c.back],[-half,c.top,c.back]],[0,0,1]);
  quad([[-half,bottom,c.front],[half,bottom,c.front],[half,bottom,c.back],[-half,bottom,c.back]],[0,-1,0]);
  if(kind==='gate'){
    // The front, curtain and rear walls each supply a sill. Fill the two
    // spaces between them, without painting another face over those sills.
    for(const [a,b] of [[-29.10,-26.48],[-25.52,-23.90]]){
    const low=c.top-.18;
    quad([[-half,c.top,a],[half,c.top,a],[half,c.top,b],[-half,c.top,b]],[0,1,0]);
    quad([[-half,low,a],[half,low,a],[half,low,b],[-half,low,b]],[0,-1,0]);
    for(const side of [-1,1])quad([[half*side,low,a],[half*side,low,b],[half*side,c.top,b],[half*side,c.top,a]],[side,0,0]);
    for(const [z,n] of [[a,-1],[b,1]])quad([[-half,low,z],[half,low,z],[half,c.top,z],[-half,c.top,z]],[0,0,n]);
    }
  }
  // Each pier and rising parapet form one outer shell. The old intersecting
  // boxes left coplanar triangular caps visible on the columns.
  const profile=[{z:c.front-.22,y:c.base+1.05},{z:c.front+.22,y:c.base+1.05},
    {z:c.front+.22,y:c.base+.72},{z:c.sideBack,y:c.top+.64}];
  for(const side of [-1,1]){
    const x0=side*(half-.005),x1=side*(half+.465);
    for(let i=1;i<profile.length;i++){
      const a=profile[i-1],b=profile[i],dz=b.z-a.z,dy=b.y-a.y;
      quad([[x0,a.y,a.z],[x1,a.y,a.z],[x1,b.y,b.z],[x0,b.y,b.z]],
        Math.abs(dz)<1e-6?[0,0,1]:[0,1,-dy/dz]);
      if(dz>1e-6)for(const [x,n] of [[x0,-side],[x1,side]])
        quad([[x,bottom,a.z],[x,bottom,b.z],[x,b.y,b.z],[x,a.y,a.z]],[n,0,0]);
    }
    const a=profile[0],b=profile.at(-1)!;
    quad([[x0,bottom,a.z],[x1,bottom,a.z],[x1,a.y,a.z],[x0,a.y,a.z]],[0,0,-1]);
    quad([[x0,bottom,b.z],[x1,bottom,b.z],[x1,b.y,b.z],[x0,b.y,b.z]],[0,0,1]);
    quad([[x0,bottom,a.z],[x1,bottom,a.z],[x1,bottom,b.z],[x0,bottom,b.z]],[0,-1,0]);
  }
  return {positions,normals,uvs,indices};
}

export function castleEntryHeight(kind:CastleEntry,x:number,z:number):number|null{
  const c=CASTLE_ENTRIES[kind];if(Math.abs(x)>c.width/2||z<c.front||z>c.back)return null;
  return c.base+(c.top-c.base)*Math.min(c.steps,Math.floor((z-c.front)/c.tread)+1)/c.steps;
}

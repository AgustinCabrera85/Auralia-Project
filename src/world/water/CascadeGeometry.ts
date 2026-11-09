/** Reusable river -> rounded lip -> falling curtain -> plunge footprint.
 * Coordinates are metres; no region IDs or fixed water levels are embedded.
 * The first row is an exact inlet seam. Wind/ripples must be zero at that row. */
export interface CascadeSpec {
  x:number;z:number;top:number;bottom:number;width:number;run:number;
  heading?:number;seed?:number;
}
/** Closed, collidable bedrock beneath the inlet and spillway. Water geometry
 * alone cannot close the hole under a river perched on the edge of a shelf. */
export function createCascadeBedGeometry(f:CascadeSpec,heightAt?:(x:number,z:number)=>number){
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[];
  const c=Math.cos(f.heading??0),s=Math.sin(f.heading??0),seed=f.seed??0;
  const height=Math.max(.1,f.top-f.bottom),run=Math.max(.1,f.run);
  const back=Math.max(12,Math.min(26,f.width*1.7)),rows=36,across=24,stride=across+1;
  const floor=f.bottom-Math.max(9,height*.06);
  const write=(x:number,y:number,z:number)=>{
    positions.push(f.x+x*c+z*s,y,f.z-x*s+z*c);uvs.push(x/5,z/5);
    return positions.length/3-1;
  };
  for(let j=0;j<=rows;j++){
    const z=-back+(back+run*1.015)*j/rows,t=Math.max(0,z/run);
    const shoulder=1.4+.32*Math.sin(z*.43+seed)+.18*Math.sin(z*.91-seed);
    const half=f.width*.5*(1+.28*t)+shoulder;
    for(let i=0;i<=across;i++){
      const lateral=i/across*2-1,x=lateral*half;
      const wave=.10*Math.sin(x*1.8+seed)*Math.sin(Math.min(1,t)*Math.PI);
      const upstream=Math.min(1,Math.max(0,-z/8));
      const channelDepth=z<0?.8+1.2*upstream*upstream*(3-2*upstream)-z*.08
        :.8+.65*Math.sin(Math.min(1,t)*Math.PI);
      let y=f.top-height*t*t-channelDepth;
      // Broad rocky banks flank the eroded central channel.
      y+=Math.pow(Math.abs(lateral),6)*1.3+wave;
      if(heightAt&&z<0){
        const join=Math.min(1,Math.max(0,(z+back)/8)),blend=join*join*(3-2*join);
        y=heightAt(f.x+x*c+z*s,f.z-x*s+z*c)*(1-blend)+y*blend;
      }
      write(x,Math.max(floor+.5,y),z);
      if(j&&i){const a=j*stride+i;indices.push(a,a-stride-1,a-1,a,a-stride,a-stride-1);}
    }
  }
  const rim:number[]=[];
  for(let i=0;i<=across;i++)rim.push(i);
  for(let j=1;j<=rows;j++)rim.push(j*stride+across);
  for(let i=across-1;i>=0;i--)rim.push(rows*stride+i);
  for(let j=rows-1;j>0;j--)rim.push(j*stride);
  const lower=rim.map(a=>{
    const index=positions.length/3;positions.push(positions[a*3],floor,positions[a*3+2]);
    uvs.push(uvs[a*2],uvs[a*2+1]);return index;
  });
  const center=write(0,floor,(run-back)*.5);
  for(let i=0;i<rim.length;i++){
    const next=(i+1)%rim.length,a=rim[i],b=rim[next],aa=lower[i],bb=lower[next];
    indices.push(a,b,bb,a,bb,aa,center,aa,bb);
  }
  return {positions,indices,uvs};
}
export function createCascadeGeometry(f:CascadeSpec,across=24,down=56){
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[],colors:number[]=[];
  const yaw=f.heading??0,c=Math.cos(yaw),s=Math.sin(yaw),seed=f.seed??0;
  const height=Math.max(.1,f.top-f.bottom),run=Math.max(.1,f.run);
  const write=(x:number,y:number,z:number,u:number,v:number,kind:number,progress:number)=>{
    positions.push(f.x+x*c+z*s,y+.045,f.z-x*s+z*c);
    uvs.push(u,v);colors.push(0,kind,progress,1);
  };
  const faces=(row:number,stride:number,base=0)=>{
    if(!row)return;
    for(let i=1;i<stride;i++){const a=base+row*stride+i;
      indices.push(a,a-1,a-stride-1,a,a-stride-1,a-stride);}
  };
  for(let j=0;j<=down;j++){
    const t=j/down*1.025,envelope=Math.sin(Math.PI*Math.min(1,t));
    for(let i=0;i<=across;i++){
      const u=i/across,lateral=u*2-1;
      const width=f.width*(1+.28*t);
      const ribs=Math.sin(u*29+seed)+.45*Math.sin(u*53-seed);
      // Smooth flutes give the curtain depth even with frozen shader time.
      // Their amplitude fades to zero at the inlet and the receiving surface.
      const bulge=(1-lateral*lateral)*.5+ribs*.18;
      const z=run*t+envelope*bulge*Math.min(1.1,f.width*.07);
      const y=f.top-height*t*t+envelope*ribs*.10;
      const edge=.12*Math.sin(t*18+seed)*envelope*Math.pow(Math.abs(lateral),4);
      write(lateral*width*.5+edge,y,z,u,1-t,1,t);
    }
    faces(j,across+1);
  }
  const curtainVertices=positions.length/3;
  // A rounded, low crown at impact blends into the receiving water. Its entire
  // perimeter fades in the shader; no opaque rectangular panel or cone tips.
  const rows=16,span=32,reach=Math.max(2.5,Math.min(6,height*.10));
  for(let j=0;j<=rows;j++)for(let i=0;i<=span;i++){
    const v=j/rows,u=i/span,lateral=u*2-1;
    const half=f.width*.64+reach*v*.55;
    const taper=Math.sqrt(Math.max(0,1-lateral*lateral));
    const y=f.bottom+Math.sin(v*Math.PI)*taper*(.35+.12*Math.sin(u*24+seed));
    write(lateral*half,y,run+(v-.12)*reach,u,v,2,v);
    if(i===span)faces(j,span+1,curtainVertices);
  }
  return {positions,indices,uvs,colors,curtainVertices,
    impact:{x:f.x+run*s,z:f.z+run*c,halfWidth:f.width*.64,level:f.bottom}};
}

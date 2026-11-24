export type PaintedRoad={width:number;points:readonly {x:number;z:number}[]};
export type RoadMask={data:Uint8Array;width:number;height:number;minX:number;minZ:number;spanX:number;spanZ:number};

/** Cached union of road corridors. Junctions share pixels, never stacked faces. */
export function rasterizeRoads(roads:readonly PaintedRoad[],tintAt:(x:number,z:number)=>readonly number[],maxSize=4096):RoadMask{
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(const road of roads)for(const p of road.points){
    const r=road.width/2+2;
    minX=Math.min(minX,p.x-r);minZ=Math.min(minZ,p.z-r);maxX=Math.max(maxX,p.x+r);maxZ=Math.max(maxZ,p.z+r);
  }
  if(!Number.isFinite(minX))return {data:new Uint8Array(4),width:1,height:1,minX:0,minZ:0,spanX:1,spanZ:1};
  const step=Math.max(.5,(maxX-minX)/maxSize,(maxZ-minZ)/maxSize);
  const width=Math.ceil((maxX-minX)/step),height=Math.ceil((maxZ-minZ)/step),data=new Uint8Array(width*height*4);
  for(const road of roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
    if(len2<1e-8)continue;
    const radius=road.width/2,feather=Math.max(.45,step),tint=tintAt((a.x+b.x)/2,(a.z+b.z)/2);
    const x0=Math.max(0,Math.floor((Math.min(a.x,b.x)-radius-minX)/step)),x1=Math.min(width-1,Math.ceil((Math.max(a.x,b.x)+radius-minX)/step));
    const z0=Math.max(0,Math.floor((Math.min(a.z,b.z)-radius-minZ)/step)),z1=Math.min(height-1,Math.ceil((Math.max(a.z,b.z)+radius-minZ)/step));
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
      const px=minX+(x+.5)*step,pz=minZ+(z+.5)*step,t=Math.max(0,Math.min(1,((px-a.x)*dx+(pz-a.z)*dz)/len2));
      const fade=Math.max(0,Math.min(1,(radius-Math.hypot(px-a.x-dx*t,pz-a.z-dz*t))/feather));
      const alpha=Math.round(255*fade*fade*(3-2*fade)),offset=(z*width+x)*4;
      if(alpha<=data[offset+3])continue;
      for(let k=0;k<3;k++)data[offset+k]=Math.round(Math.min(1,tint[k]/1.25)*255);
      data[offset+3]=alpha;
    }
  }
  return {data,width,height,minX,minZ,spanX:width*step,spanZ:height*step};
}

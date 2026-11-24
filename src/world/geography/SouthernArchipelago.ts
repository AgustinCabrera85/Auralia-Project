/** The five low islands south of Llanuras del Sur. Coordinates and bathymetry
 * are shared by terrain, swimming, vegetation and the baked atlas. */
export const SOUTHERN_ISLANDS=[
  {id:'west',x:-2100,z:5280,rx:440,rz:350,peak:40,beach:68,phase:1.3},
  {id:'southwest',x:-1000,z:6200,rx:500,rz:350,peak:23,beach:76,phase:2.7},
  {id:'north',x:100,z:5360,rx:330,rz:285,peak:32,beach:62,phase:4.1},
  {id:'east',x:1600,z:5690,rx:285,rz:300,peak:32,beach:58,phase:5.2},
  {id:'south',x:650,z:6470,rx:280,rz:245,peak:24,beach:60,phase:6.4},
] as const;
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

export function southernSeaWeight(x:number,z:number):number{
  return smooth(-3000,-2740,x)*(1-smooth(2040,2340,x))*smooth(4608,4800,z)*(1-smooth(6810,7000,z));
}

/** Positive inland, negative offshore. Irregular outlines have no tile seams. */
export function southernIslandDistance(island:typeof SOUTHERN_ISLANDS[number],x:number,z:number):number{
  const nx=(x-island.x)/island.rx,nz=(z-island.z)/island.rz;
  const outline=1+.11*Math.sin(nx*3.7+nz*2.1+island.phase)*Math.sin(nz*4.3-nx*1.8)
    +.045*Math.sin(nx*6.1-nz*4.7+island.phase);
  return (outline-Math.hypot(nx,nz))*Math.min(island.rx,island.rz);
}

export function southernArchipelagoHeight(x:number,z:number,original:number,seaLevel:number):number{
  const weight=southernSeaWeight(x,z);if(weight===0)return original;
  // Broad channels have real depth, rather than a flat shallow seabed. The
  // 3–14 m shelves remain available for future coral and coastal fish habitats.
  const channelDepth=155+20*Math.sin(x/430+z/710)*Math.sin(z/520-x/840);
  let height=seaLevel-channelDepth;
  for(const island of SOUTHERN_ISLANDS){
    if(Math.abs(x-island.x)>island.rx+600||Math.abs(z-island.z)>island.rz+600)continue;
    const d=southernIslandDistance(island,x,z);
    if(d>=0){
      const beachRise=.045*Math.min(d,island.beach);
      const hill=(island.peak-beachRise)*smooth(island.beach,Math.min(island.rx,island.rz)*1.04,d);
      height=Math.max(height,seaLevel+beachRise+hill);
    }else{
      const offshore=-d;
      const depth=offshore<28?offshore*.075:
        offshore<120?2.1+11.9*smooth(28,120,offshore):
        14+(channelDepth-14)*smooth(120,440,offshore);
      height=Math.max(height,seaLevel-depth);
    }
  }
  return original+(height-original)*weight;
}

export function southernBeachWeight(x:number,z:number,height:number,seaLevel:number):number{
  const region=southernSeaWeight(x,z);if(region===0||height<seaLevel-.5)return 0;
  let beach=0;
  for(const island of SOUTHERN_ISLANDS){
    if(Math.abs(x-island.x)>island.rx*1.18+12||Math.abs(z-island.z)>island.rz*1.18+12)continue;
    const d=southernIslandDistance(island,x,z);
    beach=Math.max(beach,(1-smooth(island.beach*.8,island.beach+25,d))*smooth(-10,0,d));
  }
  return beach*region;
}

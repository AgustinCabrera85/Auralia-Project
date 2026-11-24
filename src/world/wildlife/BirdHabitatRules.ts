const excludedRegions=new Set(['DES','CRI','ALB','MAL']);

/** These two small woodland species do not populate dry, volcanic or alpine regions. */
export function birdRegionAllowsFlocks(id:string|undefined):boolean{
  return !id||!excludedRegions.has(id);
}

/** Use the current continent's atlas, never the old world's coordinate polygons. */
export function woodlandBirdHabitatAllowed(x:number,z:number,desert:number,
  regions:readonly {id:string;x:number;z:number}[]):boolean{
  if(desert>0)return false;
  let nearest:string|undefined,distance=Infinity;
  for(const r of regions){
    const d=(x-r.x)**2+(z-r.z)**2;
    if(d<distance){nearest=r.id;distance=d;}
  }
  return birdRegionAllowsFlocks(nearest);
}

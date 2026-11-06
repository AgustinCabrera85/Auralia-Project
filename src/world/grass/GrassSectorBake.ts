import { waterSurfaceAt } from '../geographicFeatures';
import { grassDensityAt, saveGrassBake } from '../editor/WorldEditState';
import { hash01, MAINLAND, sampleMainlandHeight } from '../terrainData';
import { nearTerrainHeightAt } from '../terrainLod';

/** Editor-only deterministic placement bake. Runtime never calls this function. */
export function bakeGrassSectorPatch(px:number,pz:number):void{
  const size=12;
  const count=140;
  const columns=12;
  const rows=Math.ceil(count/columns);
  const heights=new Map<string,number>();
  const gridHeight=(x:number,z:number):number=>{
    const key=`${x}:${z}`;
    let height=heights.get(key);
    if(height===undefined){height=sampleMainlandHeight(x,z);heights.set(key,height);}
    return height;
  };
  const placements:number[]=[];
  for(let i=0;i<count;i++){
    const ix=i%columns,iz=Math.floor(i/columns);
    const x=(px+(ix+.16+.68*hash01(px*41+i,pz*43+i,1))/columns)*size;
    const z=(pz+(iz+.16+.68*hash01(px*41+i,pz*43+i,2))/rows)*size;
    const density=grassDensityAt(x,z);
    if(density<=0||hash01(px,pz,i+3)>Math.min(1,density*.56))continue;
    const y=nearTerrainHeightAt(x,z,gridHeight);
    if(y<=MAINLAND.waterLevel+.25)continue;
    const water=waterSurfaceAt(x,z);
    if(water&&y<=water.level+.3)continue;
    const slope=Math.hypot(gridHeight(x+1,z)-gridHeight(x-1,z),
      gridHeight(x,z+1)-gridHeight(x,z-1))*.5;
    if(slope>.7)continue;
    const yaw=hash01(px+i,pz,17)*Math.PI*2;
    const scale=.75+hash01(px,pz+i,18)*.65;
    const tall=hash01(px+i,pz,19);
    const flower=hash01(px,pz+i,20)>.975?1:0;
    placements.push(x,y,z,yaw,scale,scale*(.85+tall*.3),1,1,1,flower);
  }
  saveGrassBake(px,pz,placements);
}

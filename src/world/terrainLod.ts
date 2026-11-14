import { MAINLAND } from './terrainData';
import { activeGeography } from './geography/ActiveGeography';

/** All distances are metres. Each level is an integer multiple of the next. */
export const TERRAIN_LOD_CONFIG = {
  nearRadius: 252,
  midRadius: 720,
  farRadius: 1700,
  nearSize: MAINLAND.chunkSize,
  midSize: MAINLAND.chunkSize * 2,
  farSize: MAINLAND.chunkSize * 4,
  nearSubdivisions: MAINLAND.terrainSubdivisions,
  midSubdivisions: 8,
  farSubdivisions: 8,
  detailedSourceFarSubdivisions: 16,
  generationBudgetMs: 4,
  maxGeneratedPerFrame: 2,
  forwardPriority: .35,
  cliffDetailDistance: 320,
  farBoundsMargin: 280
} as const;

export type TerrainLod = 'near'|'mid'|'far';
export type TerrainCell = {cx:number;cz:number};
export const lodKey=(cell:TerrainCell)=>`${cell.cx}:${cell.cz}`;
export const cellAt=(x:number,z:number,size:number):TerrainCell=>
  ({cx:Math.floor(x/size),cz:Math.floor(z/size)});
export const childrenOf=(cell:TerrainCell):TerrainCell[]=>[
  {cx:cell.cx*2,cz:cell.cz*2}, {cx:cell.cx*2+1,cz:cell.cz*2},
  {cx:cell.cx*2,cz:cell.cz*2+1}, {cx:cell.cx*2+1,cz:cell.cz*2+1}
];
export const parentOf=(cell:TerrainCell):TerrainCell=>
  ({cx:Math.floor(cell.cx/2),cz:Math.floor(cell.cz/2)});

/** Interpolate the same two triangles emitted by a near TerrainStream tile. */
export const canonicalTerrainSpacing=()=>activeGeography()?.source.meshSpacing??
  TERRAIN_LOD_CONFIG.nearSize/TERRAIN_LOD_CONFIG.nearSubdivisions;
export function nearTerrainHeightAt(x:number,z:number,heightAtGrid:(x:number,z:number)=>number,
  step=canonicalTerrainSpacing()):number{
  const x0=Math.floor(x/step)*step,z0=Math.floor(z/step)*step;
  const tx=(x-x0)/step,tz=(z-z0)/step;
  const a=heightAtGrid(x0,z0),b=heightAtGrid(x0+step,z0);
  const c=heightAtGrid(x0,z0+step),d=heightAtGrid(x0+step,z0+step);
  return tx+tz<=1?a+tx*(b-a)+tz*(c-a):
    d+(1-tz)*(b-d)+(1-tx)*(c-d);
}

/** Height and exact slopes of the visible near-tile triangle under a point. */
export function nearTerrainSurfaceAt(x:number,z:number,
  heightAtGrid:(x:number,z:number)=>number,step=canonicalTerrainSpacing()):
  {height:number;slopeX:number;slopeZ:number}{
  const x0=Math.floor(x/step)*step,z0=Math.floor(z/step)*step;
  const tx=(x-x0)/step,tz=(z-z0)/step;
  const a=heightAtGrid(x0,z0),b=heightAtGrid(x0+step,z0);
  const c=heightAtGrid(x0,z0+step),d=heightAtGrid(x0+step,z0+step);
  return tx+tz<=1
    ?{height:a+tx*(b-a)+tz*(c-a),slopeX:(b-a)/step,slopeZ:(c-a)/step}
    :{height:d+(1-tz)*(b-d)+(1-tx)*(c-d),
      slopeX:(d-c)/step,slopeZ:(d-b)/step};
}

/** Support for upright props. A flat center alone is not enough: the base may
 * straddle a triangle crease or cliff edge. Callers can cache grid samples for
 * their chunk, then discard that cache after placement generation. */
export function terrainFootprintAt(x:number,z:number,radius:number,
  heightAtGrid:(x:number,z:number)=>number,step=canonicalTerrainSpacing()):
  {height:number;minHeight:number;maxHeight:number;maxSlope:number}{
  const center=nearTerrainSurfaceAt(x,z,heightAtGrid,step);
  let minHeight=center.height,maxHeight=center.height;
  let maxSlope=Math.hypot(center.slopeX,center.slopeZ);
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    const surface=nearTerrainSurfaceAt(x+Math.cos(angle)*radius,z+Math.sin(angle)*radius,heightAtGrid,step);
    minHeight=Math.min(minHeight,surface.height);maxHeight=Math.max(maxHeight,surface.height);
    maxSlope=Math.max(maxSlope,Math.hypot(surface.slopeX,surface.slopeZ));
  }
  return {height:center.height,minHeight,maxHeight,maxSlope};
}

/** Distance to the closest point of a tile, so edge tiles retain coverage. */
export function tileDistance(cell:TerrainCell,size:number,x:number,z:number):number{
  const dx=Math.max(0,Math.abs((cell.cx+.5)*size-x)-size*.5);
  const dz=Math.max(0,Math.abs((cell.cz+.5)*size-z)-size*.5);
  return Math.hypot(dx,dz);
}

/** Complete parent groups avoid holes during swaps between resolutions. */
export function selectGroups(x:number,z:number,radius:number,parentSize:number):TerrainCell[]{
  const center=cellAt(x,z,parentSize),reach=Math.ceil(radius/parentSize)+1;
  const cells:TerrainCell[]=[];
  for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++){
    const cell={cx:center.cx+dx,cz:center.cz+dz};
    if(tileDistance(cell,parentSize,x,z)<=radius)cells.push(cell);
  }
  return cells;
}

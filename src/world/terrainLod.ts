import { MAINLAND } from './terrainData';

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
  skirtDepth: 22,
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

export type Bounds3 = { minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number };
type Entry = { bounds:Bounds3; keys:string[]; stamp:number };
/** Multi-cell AABBs, exact cell keys and deduplication. Large objects use a
 * fallback list rather than truncating their coverage or allocating huge grids. */
export class SpatialHash {
  private readonly cells=new Map<string,Set<number>>();
  private readonly entries=new Map<number,Entry>();
  private readonly large=new Set<number>();
  private stamp=0;
  constructor(readonly cellSize=4,private readonly maxCells=4096){
    if(!Number.isFinite(cellSize)||cellSize<=0)throw new Error('Invalid spatial cell size');
  }
  get size(){return this.entries.size;}
  get cellCount(){return this.cells.size;}
  upsert(id:number,b:Bounds3):void{
    validate(b);
    this.remove(id);
    const entry:Entry={bounds:{...b},keys:[],stamp:0};this.entries.set(id,entry);
    const s=this.cellSize,x0=Math.floor(b.minX/s),x1=Math.floor(b.maxX/s),y0=Math.floor(b.minY/s),y1=Math.floor(b.maxY/s),z0=Math.floor(b.minZ/s),z1=Math.floor(b.maxZ/s);
    if(!safeCells(x0,x1,y0,y1,z0,z1)||(x1-x0+1)*(y1-y0+1)*(z1-z0+1)>this.maxCells){this.large.add(id);return;}
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++){
      const key=`${x},${y},${z}`;let cell=this.cells.get(key);
      if(!cell)this.cells.set(key,cell=new Set());cell.add(id);entry.keys.push(key);
    }
  }
  remove(id:number):void{
    const e=this.entries.get(id);if(!e)return;
    for(const key of e.keys){const cell=this.cells.get(key)!;cell.delete(id);if(!cell.size)this.cells.delete(key);}
    this.large.delete(id);this.entries.delete(id);
  }
  query(b:Bounds3,out:number[],naive=false):number[]{
    out.length=0;
    validate(b);
    if(++this.stamp>=Number.MAX_SAFE_INTEGER){this.stamp=1;for(const e of this.entries.values())e.stamp=0;}
    const stamp=this.stamp;
    // No callback or temporary Set for each query.
    const s=this.cellSize,x0=Math.floor(b.minX/s),x1=Math.floor(b.maxX/s),y0=Math.floor(b.minY/s),y1=Math.floor(b.maxY/s),z0=Math.floor(b.minZ/s),z1=Math.floor(b.maxZ/s);
    if(naive||!safeCells(x0,x1,y0,y1,z0,z1)||(x1-x0+1)*(y1-y0+1)*(z1-z0+1)>this.maxCells){
      for(const [id,e] of this.entries)if(naive||overlaps(b,e.bounds))out.push(id);return out;
    }
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++){
      const cell=this.cells.get(`${x},${y},${z}`);if(!cell)continue;
      for(const id of cell){const e=this.entries.get(id)!;if(e.stamp===stamp)continue;e.stamp=stamp;if(overlaps(b,e.bounds))out.push(id);}
    }
    for(const id of this.large){const e=this.entries.get(id)!;if(overlaps(b,e.bounds))out.push(id);}
    return out;
  }
  clear():void{this.cells.clear();this.entries.clear();this.large.clear();}
}
export function overlaps(a:Bounds3,b:Bounds3):boolean{
  return a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
}
function validate(b:Bounds3){
  if(!Number.isFinite(b.minX)||!Number.isFinite(b.minY)||!Number.isFinite(b.minZ)||!Number.isFinite(b.maxX)||!Number.isFinite(b.maxY)||!Number.isFinite(b.maxZ)||b.minX>b.maxX||b.minY>b.maxY||b.minZ>b.maxZ)throw new Error('Invalid spatial bounds');
}
function safeCells(a:number,b:number,c:number,d:number,e:number,f:number){
  return Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&Number.isSafeInteger(c)&&Number.isSafeInteger(d)&&Number.isSafeInteger(e)&&Number.isSafeInteger(f);
}

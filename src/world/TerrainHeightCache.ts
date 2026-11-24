/** Fixed 10 MiB cache of canonical height/normal-probe samples. Numeric grid
 * keys avoid allocating strings and boxed map entries for every terrain vertex.
 * Collisions replace a slot; neither travel nor long sessions can grow it. */
export class TerrainHeightCache {
  private readonly capacity=1<<19;
  private readonly xs=new Int32Array(this.capacity);
  private readonly zs=new Int32Array(this.capacity);
  private readonly values=new Float64Array(this.capacity);
  private readonly stamps=new Uint32Array(this.capacity);
  private epoch=1;
  hits=0;
  misses=0;
  readonly bytes=this.capacity*20;
  constructor(private readonly step:number,private readonly sample:(x:number,z:number)=>number){}
  at(x:number,z:number):number{
    const gx=Math.round(x/this.step),gz=Math.round(z/this.step);
    // Keep arbitrary editor probes exact rather than snapping them to a grid.
    if(Math.abs(gx*this.step-x)>1e-7||Math.abs(gz*this.step-z)>1e-7){this.misses++;return this.sample(x,z);}
    let hash=Math.imul(gx,73856093)^Math.imul(gz,19349663);
    hash=Math.imul(hash^(hash>>>16),0x45d9f3b);
    const i=(hash^(hash>>>16))&(this.capacity-1);
    if(this.stamps[i]===this.epoch&&this.xs[i]===gx&&this.zs[i]===gz){this.hits++;return this.values[i];}
    const height=this.sample(x,z);this.misses++;
    this.xs[i]=gx;this.zs[i]=gz;this.values[i]=height;this.stamps[i]=this.epoch;
    return height;
  }
  clear():void{
    this.epoch=(this.epoch+1)>>>0;
    if(this.epoch===0){this.stamps.fill(0);this.epoch=1;}
  }
}

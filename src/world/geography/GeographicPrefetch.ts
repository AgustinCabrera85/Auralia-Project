import type { GeographicSource } from './GeographicSource';

/** Fetch the next height sectors while the current, authoritative ground stays
 * playable. This does not put the world into the teleport/loading state. */
export class GeographicPrefetch {
  private pending=false;
  private disposed=false;
  private retryAt=0;
  constructor(private readonly source:GeographicSource,private readonly radius:number,
    private readonly onError:(error:unknown)=>void=error=>console.warn('[Geography prefetch]',error)){}

  update(x:number,z:number,velocityX:number,velocityZ:number):void{
    if(this.pending||this.disposed||performance.now()<this.retryAt)return;
    const speed=Math.hypot(velocityX,velocityZ);
    // Eight seconds at sprint speed; retain >2 km around the actual player for
    // terrain, camera and water sampling, even after a sudden direction change.
    const seconds=speed>0?Math.min(8,216/speed):0;
    const cx=x+velocityX*seconds,cz=z+velocityZ*seconds,r=this.radius;
    const bounds=[cx-r,cz-r,cx+r,cz+r] as const;
    if(this.source.isReady(bounds))return;
    this.pending=true;
    void this.source.prepare(bounds).catch(error=>{
      this.retryAt=performance.now()+2000;
      if(!this.disposed)this.onError(error);
    }).finally(()=>{this.pending=false;});
  }

  dispose():void{this.disposed=true;}
}

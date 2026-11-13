import type { GeographicBounds } from './GeographicSource';

const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const hash=(x:number,z:number)=>{
  let n=(Math.imul(x,374761393)+Math.imul(z,668265263)+314159)|0;
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
};
function noise(x:number,z:number):number{
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,z-iz);
  const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}

/** Local incision of Nácar's existing submerged bed. The compact distance field
 * protects the authored coastline AND all R16 islands, including those absent
 * from the lake polygon. It stores no heights and retains no heightmap tiles.
 * This field controls broad bathymetry only; rendered water still clips against
 * the authoritative terrain triangles, never this eight-metre mask. */
export class NacarBathymetry {
  readonly step=8;
  readonly bounds:GeographicBounds;
  private readonly nx:number;
  private readonly nz:number;
  private readonly distance:Float32Array;
  readonly buildMs:number;
  constructor(bounds:GeographicBounds,readonly level:number,inside:(x:number,z:number)=>boolean,
    originalHeight:(x:number,z:number)=>number){
    const start=performance.now(),s=this.step;
    this.bounds=[Math.floor(bounds[0]/s)*s,Math.floor(bounds[1]/s)*s,Math.ceil(bounds[2]/s)*s,Math.ceil(bounds[3]/s)*s];
    this.nx=Math.round((this.bounds[2]-this.bounds[0])/s)+1;
    this.nz=Math.round((this.bounds[3]-this.bounds[1])/s)+1;
    const data=this.distance=new Float32Array(this.nx*this.nz),diagonal=s*Math.SQRT2;
    for(let iz=0;iz<this.nz;iz++)for(let ix=0;ix<this.nx;ix++){
      const x=this.bounds[0]+ix*s,z=this.bounds[1]+iz*s;
      data[iz*this.nx+ix]=ix>0&&iz>0&&ix<this.nx-1&&iz<this.nz-1&&inside(x,z)&&level-originalHeight(x,z)>3?1e6:0;
    }
    // Eight-neighbour chamfer distance. The conservative correction below
    // removes its maximum ~8.3% overestimate plus one cell's diagonal.
    for(let iz=1;iz<this.nz;iz++)for(let ix=0;ix<this.nx;ix++){
      const i=iz*this.nx+ix;
      data[i]=Math.min(data[i],data[i-this.nx]+s,
        ix?Math.min(data[i-1]+s,data[i-this.nx-1]+diagonal):1e6,
        ix<this.nx-1?data[i-this.nx+1]+diagonal:1e6);
    }
    for(let iz=this.nz-2;iz>=0;iz--)for(let ix=this.nx-1;ix>=0;ix--){
      const i=iz*this.nx+ix;
      data[i]=Math.min(data[i],data[i+this.nx]+s,
        ix<this.nx-1?Math.min(data[i+1]+s,data[i+this.nx+1]+diagonal):1e6,
        ix?data[i+this.nx-1]+diagonal:1e6);
    }
    this.buildMs=performance.now()-start;
  }
  shoreDistanceAt(x:number,z:number):number{
    const fx=(x-this.bounds[0])/this.step,fz=(z-this.bounds[1])/this.step;
    if(fx<0||fz<0||fx>=this.nx-1||fz>=this.nz-1)return 0;
    const ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz,i=iz*this.nx+ix,d=this.distance;
    const distance=(d[i]+(d[i+1]-d[i])*u)*(1-v)+(d[i+this.nx]+(d[i+this.nx+1]-d[i+this.nx])*u)*v;
    return Math.max(0,distance*.9238-this.step*Math.SQRT2);
  }
  heightAt(x:number,z:number,original:number):number{
    const originalDepth=this.level-original;
    if(originalDepth<=3)return original;
    const distance=this.shoreDistanceAt(x,z),strength=smooth(24,120,distance)*smooth(3,8,originalDepth);
    if(strength===0)return original;
    const basin=smooth(85,330,distance);
    // Shelf, talus and broad depressions: 14–80 m target depths with features
    // hundreds of metres wide, resolved by the existing 6/18/36 m terrain LOD.
    const targetDepth=14+54*basin+(3+9*basin)*noise(x/260,z/260);
    return original-Math.max(0,targetDepth-originalDepth)*strength;
  }
  get stats(){return {bytes:this.distance.byteLength,gridSpacing:this.step,buildMs:this.buildMs,targetMaximumDepth:80};}
}

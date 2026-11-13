import type { GeographicBounds } from '../geography/GeographicSource';

/** Shared CPU/GPU ownership, independent of resident height sectors. This is
 * an ocean exclusion mask, never the terrain or shoreline geometry. */
export class InlandWaterMask {
  readonly size=2048;
  readonly bounds:GeographicBounds=[-8192,-8192,8192,8192];
  readonly data=new Uint8Array(this.size*this.size);
  readonly texel=8;
  constructor(regions:readonly GeographicBounds[],owns:(x:number,z:number)=>boolean){
    const visited=new Uint8Array(this.data.length);
    for(const b of regions){
      const minX=Math.max(0,Math.floor((b[0]-this.bounds[0])/this.texel)-1),maxX=Math.min(this.size-1,Math.ceil((b[2]-this.bounds[0])/this.texel)+1);
      const minZ=Math.max(0,Math.floor((b[1]-this.bounds[1])/this.texel)-1),maxZ=Math.min(this.size-1,Math.ceil((b[3]-this.bounds[1])/this.texel)+1);
      for(let iz=minZ;iz<=maxZ;iz++)for(let ix=minX;ix<=maxX;ix++){
        const i=iz*this.size+ix;if(visited[i])continue;visited[i]=1;
        this.data[i]=owns(this.bounds[0]+(ix+.5)*this.texel,this.bounds[1]+(iz+.5)*this.texel)?255:0;
      }
    }
  }
  /** Exactly the bilinear, clamp-to-edge GPU lookup (including half texels). */
  valueAt(x:number,z:number):number{
    const u=Math.max(0,Math.min(this.size-1,(x-this.bounds[0])/this.texel-.5)),v=Math.max(0,Math.min(this.size-1,(z-this.bounds[1])/this.texel-.5));
    const ix=Math.floor(u),iz=Math.floor(v),jx=Math.min(this.size-1,ix+1),jz=Math.min(this.size-1,iz+1),a=u-ix,b=v-iz;
    return ((this.data[iz*this.size+ix]*(1-a)+this.data[iz*this.size+jx]*a)*(1-b)+(this.data[jz*this.size+ix]*(1-a)+this.data[jz*this.size+jx]*a)*b)/255;
  }
}

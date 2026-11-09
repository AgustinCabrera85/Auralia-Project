import type { ChainState } from './ChainDynamics';
/** Reusable Hermite sampling and arc-length resampling. Each component stays
 * inside its segment endpoint envelope; interpolation cannot create overshoot. */
export class ChainCurve {
  readonly points:Float32Array;
  readonly normals:Float32Array;
  readonly binormals:Float32Array;
  private readonly dense:Float64Array;
  private readonly lengths:Float64Array;
  constructor(readonly samples=25,readonly subdivisions=8,readonly capacity=64){
    this.points=new Float32Array(samples*3);this.normals=new Float32Array(samples*3);this.binormals=new Float32Array(samples*3);
    this.dense=new Float64Array(((capacity-1)*subdivisions+1)*3);this.lengths=new Float64Array((capacity-1)*subdivisions+1);
  }
  update(chain:ChainState,alpha:number):void{
    const n=chain.count;if(n>this.capacity)throw new Error('Curve capacity exceeded');
    alpha=Math.max(0,Math.min(1,alpha));const p=chain.p,prev=chain.previous,steps=(n-1)*this.subdivisions;
    this.lengths[0]=0;
    for(let s=0;s<=steps;s++){
      const i=Math.min(n-2,Math.floor(s/this.subdivisions)),t=(s-i*this.subdivisions)/this.subdivisions,t2=t*t,t3=t2*t;
      for(let k=0;k<3;k++){
        const a=i*3+k,b=a+3,before=Math.max(0,i-1)*3+k,after=Math.min(n-1,i+2)*3+k;
        const av=prev[a]+(p[a]-prev[a])*alpha,bv=prev[b]+(p[b]-prev[b])*alpha;
        const v0=prev[before]+(p[before]-prev[before])*alpha,v3=prev[after]+(p[after]-prev[after])*alpha;
        const value=(2*t3-3*t2+1)*av+(t3-2*t2+t)*(bv-v0)*.5+(-2*t3+3*t2)*bv+(t3-t2)*(v3-av)*.5;
        this.dense[s*3+k]=Math.max(Math.min(av,bv),Math.min(Math.max(av,bv),value));
      }
      if(s){const j=s*3;this.lengths[s]=this.lengths[s-1]+Math.hypot(this.dense[j]-this.dense[j-3],this.dense[j+1]-this.dense[j-2],this.dense[j+2]-this.dense[j-1]);}
    }
    let cursor=1;
    for(let i=0;i<this.samples;i++){
      const target=this.lengths[steps]*i/(this.samples-1);
      while(cursor<steps&&this.lengths[cursor]<target)cursor++;
      const span=this.lengths[cursor]-this.lengths[cursor-1],t=span>1e-12?(target-this.lengths[cursor-1])/span:0;
      for(let k=0;k<3;k++)this.points[i*3+k]=this.dense[(cursor-1)*3+k]*(1-t)+this.dense[cursor*3+k]*t;
    }
    // Rotation-minimizing frame: project the previous normal onto the next
    // tangent plane. Stable reference at the pinned end; guarded reversals.
    let nx=0,ny=0,nz=1;
    for(let i=0;i<this.samples;i++){
      const a=Math.max(0,i-1)*3,b=Math.min(this.samples-1,i+1)*3;
      let tx=this.points[b]-this.points[a],ty=this.points[b+1]-this.points[a+1],tz=this.points[b+2]-this.points[a+2];
      const length=Math.hypot(tx,ty,tz);if(length<1e-9){tx=0;ty=-1;tz=0;}else{tx/=length;ty/=length;tz/=length;}
      const dot=nx*tx+ny*ty+nz*tz;nx-=dot*tx;ny-=dot*ty;nz-=dot*tz;
      if(Math.hypot(nx,ny,nz)<1e-8){nx=Math.abs(tx)<.8?1:0;ny=Math.abs(tx)<.8?0:1;nz=0;const d=nx*tx+ny*ty;nx-=d*tx;ny-=d*ty;nz-=d*tz;}
      const nl=Math.hypot(nx,ny,nz);nx/=nl;ny/=nl;nz/=nl;
      const j=i*3;this.normals[j]=nx;this.normals[j+1]=ny;this.normals[j+2]=nz;
      this.binormals[j]=ty*nz-tz*ny;this.binormals[j+1]=tz*nx-tx*nz;this.binormals[j+2]=tx*ny-ty*nx;
    }
  }
}

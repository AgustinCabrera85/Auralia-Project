import type {GeographicBounds} from './GeographicSource';

/** Ownership of an inland basin, not shoreline geometry or a height map.
 * Expand the authored polygon through low ground, then hide the ownership
 * boundary under dry banks. Grid centres match InlandWaterMask exactly. */
export class LakeWaterDomain{
 readonly step=8;
 readonly bounds:GeographicBounds;
 readonly data:Uint8Array;
 private readonly width:number;
 private readonly height:number;
 private boundaryContacts=0;
 constructor(bounds:GeographicBounds,level:number,contains:(x:number,z:number)=>boolean,
     baseHeight:(x:number,z:number)=>number){
  const step=this.step,pad=512;
  this.bounds=[Math.floor((bounds[0]-pad)/step)*step,Math.floor((bounds[1]-pad)/step)*step,
    Math.ceil((bounds[2]+pad)/step)*step,Math.ceil((bounds[3]+pad)/step)*step];
  this.width=(this.bounds[2]-this.bounds[0])/step;this.height=(this.bounds[3]-this.bounds[1])/step;
  const n=this.width*this.height,mask=new Uint8Array(n),visited=new Uint8Array(n),queue=new Uint32Array(n);
  let head=0,tail=0;
  const point=(i:number)=>({x:this.bounds[0]+(i%this.width+.5)*step,z:this.bounds[1]+(Math.floor(i/this.width)+.5)*step});
  for(let i=0;i<n;i++){
   const p=point(i);if(contains(p.x,p.z)){mask[i]=255;visited[i]=1;queue[tail++]=i;}
  }
  const visit=(i:number)=>{
   if(visited[i])return;visited[i]=1;const p=point(i);
   // Do not join separate depressions across a dry saddle. A dry guard is
   // added only after tracing the connected water below the original datum.
   if(baseHeight(p.x,p.z)<=level){mask[i]=255;queue[tail++]=i;}
  };
  while(head<tail){
   const i=queue[head++],x=i%this.width,z=Math.floor(i/this.width);
   if(x===0||z===0||x===this.width-1||z===this.height-1)this.boundaryContacts++;
   if(x>0)visit(i-1);if(x+1<this.width)visit(i+1);if(z>0)visit(i-this.width);if(z+1<this.height)visit(i+this.width);
  }
  // Guard band is ownership only. The water mesh still intersects the real
  // six-metre terrain triangles, so there is no rectangular water fringe.
  this.data=mask.slice();
  for(let z=2;z<this.height-2;z++)for(let x=2;x<this.width-2;x++)if(mask[z*this.width+x])
   for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)this.data[(z+dz)*this.width+x+dx]=255;
 }
 valueAt(x:number,z:number):number{
  const u=(x-this.bounds[0])/this.step-.5,v=(z-this.bounds[1])/this.step-.5;
  if(u<0||v<0||u>=this.width-1||v>=this.height-1)return 0;
  const ix=Math.floor(u),iz=Math.floor(v),a=u-ix,b=v-iz,i=iz*this.width+ix;
  return ((this.data[i]*(1-a)+this.data[i+1]*a)*(1-b)+(this.data[i+this.width]*(1-a)+this.data[i+this.width+1]*a)*b)/255;
 }
 touches(bounds:GeographicBounds):boolean{
  const x0=Math.max(0,Math.floor((bounds[0]-this.bounds[0])/this.step)-1),z0=Math.max(0,Math.floor((bounds[1]-this.bounds[1])/this.step)-1);
  const x1=Math.min(this.width-1,Math.ceil((bounds[2]-this.bounds[0])/this.step)),z1=Math.min(this.height-1,Math.ceil((bounds[3]-this.bounds[1])/this.step));
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)if(this.data[z*this.width+x])return true;
  return false;
 }
 get stats(){return {bytes:this.data.byteLength,step:this.step,boundaryContacts:this.boundaryContacts};}
}

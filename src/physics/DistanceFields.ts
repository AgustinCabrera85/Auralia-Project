import type { Bounds3 } from './SpatialHash';
export type Point3={x:number;y:number;z:number};
export type FieldSample={distance:number;nx:number;ny:number;nz:number};
export type Collider={id:number;group:number;mask:number;friction:number;restitution:number;vx?:number;vy?:number;vz?:number}&(
  |{kind:'sphere';x:number;y:number;z:number;radius:number}
  |{kind:'capsule';x:number;y:number;z:number;bx:number;by:number;bz:number;radius:number}
  |{kind:'box';x:number;y:number;z:number;hx:number;hy:number;hz:number;yaw:number}
  |{kind:'plane';x:number;y:number;z:number;nx:number;ny:number;nz:number});
export const fieldSample=():FieldSample=>({distance:0,nx:0,ny:1,nz:0});
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
/** World-unit primitives. Boxes support yaw; nonuniform scale is baked into
 * half extents, not applied to a distance value after evaluation. */
export function sampleField(c:Collider,x:number,y:number,z:number,out:FieldSample):FieldSample{
  let dx=x-c.x,dy=y-c.y,dz=z-c.z;
  if(c.kind==='plane'){
    const l=Math.hypot(c.nx,c.ny,c.nz);out.nx=l>1e-9?c.nx/l:0;out.ny=l>1e-9?c.ny/l:1;out.nz=l>1e-9?c.nz/l:0;
    out.distance=dx*out.nx+dy*out.ny+dz*out.nz;return out;
  }
  if(c.kind==='box'){
    const co=Math.cos(c.yaw),si=Math.sin(c.yaw),lx=co*dx-si*dz,lz=si*dx+co*dz;
    const qx=Math.abs(lx)-c.hx,qy=Math.abs(dy)-c.hy,qz=Math.abs(lz)-c.hz;
    let nx=Math.max(qx,0)*Math.sign(lx),ny=Math.max(qy,0)*Math.sign(dy),nz=Math.max(qz,0)*Math.sign(lz);
    const length=Math.hypot(nx,ny,nz);out.distance=length+Math.min(Math.max(qx,qy,qz),0);
    if(length>1e-9){nx/=length;ny/=length;nz/=length;}
    else if(qx>=qy&&qx>=qz){nx=lx<0?-1:1;ny=nz=0;}
    else if(qy>=qz){ny=dy<0?-1:1;nx=nz=0;}else{nz=lz<0?-1:1;nx=ny=0;}
    out.nx=co*nx+si*nz;out.ny=ny;out.nz=-si*nx+co*nz;return out;
  }
  if(c.kind==='capsule'){
    const bx=c.bx-c.x,by=c.by-c.y,bz=c.bz-c.z,den=bx*bx+by*by+bz*bz;
    const t=den>1e-12?clamp((dx*bx+dy*by+dz*bz)/den,0,1):0;dx-=bx*t;dy-=by*t;dz-=bz*t;
  }
  const length=Math.hypot(dx,dy,dz);out.distance=length-c.radius;
  out.nx=length>1e-9?dx/length:1;out.ny=length>1e-9?dy/length:0;out.nz=length>1e-9?dz/length:0;return out;
}
export function colliderBounds(c:Collider,out:Bounds3):Bounds3{
  let hx=0,hy=0,hz=0,bx=c.x,by=c.y,bz=c.z;
  if(c.kind==='plane')throw new Error('Planes belong in the unbounded collider list');
  if(c.kind==='box'){const co=Math.abs(Math.cos(c.yaw)),si=Math.abs(Math.sin(c.yaw));hx=co*c.hx+si*c.hz;hz=si*c.hx+co*c.hz;hy=c.hy;}
  else{hx=hy=hz=c.radius;if(c.kind==='capsule'){bx=c.bx;by=c.by;bz=c.bz;}}
  out.minX=Math.min(c.x,bx)-hx;out.maxX=Math.max(c.x,bx)+hx;out.minY=Math.min(c.y,by)-hy;out.maxY=Math.max(c.y,by)+hy;out.minZ=Math.min(c.z,bz)-hz;out.maxZ=Math.max(c.z,bz)+hz;return out;
}
export type SegmentContact=FieldSample&{s:number;t:number};
/** Closest points of two finite segments; handles coincident endpoints and parallel lines. */
export function closestSegments(ax:number,ay:number,az:number,bx:number,by:number,bz:number,
  cx:number,cy:number,cz:number,dx:number,dy:number,dz:number,out:SegmentContact):void{
  const ux=bx-ax,uy=by-ay,uz=bz-az,vx=dx-cx,vy=dy-cy,vz=dz-cz,rx=ax-cx,ry=ay-cy,rz=az-cz;
  const a=ux*ux+uy*uy+uz*uz,e=vx*vx+vy*vy+vz*vz,b=ux*vx+uy*vy+uz*vz,c=ux*rx+uy*ry+uz*rz,f=vx*rx+vy*ry+vz*rz;
  let s=0,t=0;
  if(a<=1e-12)t=e>1e-12?clamp(f/e,0,1):0;
  else if(e<=1e-12)s=clamp(-c/a,0,1);
  else{const den=a*e-b*b;s=den>1e-12*a*e?clamp((b*f-c*e)/den,0,1):0;t=(b*s+f)/e;
    if(t<0){t=0;s=clamp(-c/a,0,1);}else if(t>1){t=1;s=clamp((b-c)/a,0,1);}}
  let nx=rx+s*ux-t*vx,ny=ry+s*uy-t*vy,nz=rz+s*uz-t*vz;
  const distance=Math.hypot(nx,ny,nz);
  if(distance>1e-9){nx/=distance;ny/=distance;nz/=distance;}
  else{nx=uy*vz-uz*vy;ny=uz*vx-ux*vz;nz=ux*vy-uy*vx;
    if(Math.hypot(nx,ny,nz)<1e-9){nx=-uy;ny=ux;nz=0;if(Math.hypot(nx,ny)<1e-9){nx=1;ny=nz=0;}}
    const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;}
  out.distance=distance;out.nx=nx;out.ny=ny;out.nz=nz;out.s=s;out.t=t;
}
/** Capsule against primitive. Sphere/capsule/plane are exact; convex box
 * minimization is bounded to 22 iterations (positional tolerance ~segment/7500). */
export function segmentField(c:Collider,ax:number,ay:number,az:number,bx:number,by:number,bz:number,out:SegmentContact):void{
  if(c.kind==='capsule'||c.kind==='sphere'){
    closestSegments(ax,ay,az,bx,by,bz,c.x,c.y,c.z,c.kind==='capsule'?c.bx:c.x,c.kind==='capsule'?c.by:c.y,c.kind==='capsule'?c.bz:c.z,out);
    out.distance-=c.radius;return;
  }
  if(c.kind==='plane'){
    sampleField(c,ax,ay,az,out);const a=out.distance;sampleField(c,bx,by,bz,out);
    out.s=a<out.distance?0:1;out.distance=Math.min(a,out.distance);return;
  }
  const dx=bx-ax,dy=by-ay,dz=bz-az;let lo=0,hi=1;
  for(let i=0;i<22;i++){
    const s=lo+(hi-lo)/3,t=hi-(hi-lo)/3;sampleField(c,ax+dx*s,ay+dy*s,az+dz*s,out);const d=out.distance;
    sampleField(c,ax+dx*t,ay+dy*t,az+dz*t,out);if(d<out.distance)hi=t;else lo=s;
  }
  out.s=(lo+hi)/2;sampleField(c,ax+dx*out.s,ay+dy*out.s,az+dz*out.s,out);
}
/** Conservative advancement for a moving particle against an exact static SDF.
 * Returns safe travel fraction; exhaustion stops conservatively, never tunnels. */
export function sweepSphere(c:Collider,ax:number,ay:number,az:number,bx:number,by:number,bz:number,radius:number,out:FieldSample):number{
  const dx=bx-ax,dy=by-ay,dz=bz-az,length=Math.hypot(dx,dy,dz);if(length<1e-9)return 1;
  let t=0;
  for(let i=0;i<32;i++){
    sampleField(c,ax+dx*t,ay+dy*t,az+dz*t,out);const gap=out.distance-radius;
    if(gap<=1e-5)return t===0&&dx*out.nx+dy*out.ny+dz*out.nz>=0?1:t;
    t+=gap/length*.9;if(t>=1)return 1;
  }
  return t;
}

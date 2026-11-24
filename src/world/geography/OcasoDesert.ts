/** Current continent coordinates. Shared by terrain, vegetation and the atlas. */
export const OCASO_DESERT=Object.freeze({
  id:'DES',name:'Desierto del Ocaso',x:-4900,z:-4600,radiusX:2700,radiusZ:2000,inner:.68,
});

/** Broad dry interior and a gently irregular, continuous transition to the foothills. */
export function ocasoDesertAt(x:number,z:number):number{
  const r=OCASO_DESERT,dx=(x-r.x)/r.radiusX,dz=(z-r.z)/r.radiusZ;
  if(Math.abs(dx)>1.04||Math.abs(dz)>1.04)return 0;
  const edge=Math.hypot(dx,dz)+.035*Math.sin(x/650)*Math.sin(z/430);
  const t=Math.max(0,Math.min(1,(edge-r.inner)/(1-r.inner)));
  return 1-t*t*(3-2*t);
}

/** Same field on the GPU; no texture lookup or dependence on camera/sector LOD. */
export const OCASO_DESERT_GLSL=`
float ocasoDesertMask(vec2 p){
  vec2 q=(p-vec2(${OCASO_DESERT.x.toFixed(1)},${OCASO_DESERT.z.toFixed(1)}))/
    vec2(${OCASO_DESERT.radiusX.toFixed(1)},${OCASO_DESERT.radiusZ.toFixed(1)});
  if(abs(q.x)>1.04||abs(q.y)>1.04)return 0.0;
  float edge=length(q)+.035*sin(p.x/650.0)*sin(p.y/430.0);
  return 1.0-smoothstep(${OCASO_DESERT.inner},1.0,edge);
}`;

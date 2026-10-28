/** Ejes de cámara: W avanza; D va a la derecha de la pantalla; A a la izquierda. */
export type Move2D={x:number;z:number};
export function cameraRelativeMovement(forward:Move2D,horizontal:number,vertical:number):Move2D {
  const length=Math.hypot(forward.x,forward.z);
  if(length<1e-8)return {x:0,z:0};
  const fx=forward.x/length, fz=forward.z/length;
  // La mano derecha de la cámara en plano XZ: rotación -90° del vector hacia adelante.
  const x=fx*vertical+fz*horizontal;
  const z=fz*vertical-fx*horizontal;
  const norm=Math.hypot(x,z);
  return norm>1?{x:x/norm,z:z/norm}:{x,z};
}

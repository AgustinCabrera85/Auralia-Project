/** Authored contour routes. Coordinates are independent of terrain generation:
 * adding a route cannot recursively move its own mountain or bridge abutment. */
export const MOUNTAIN_TRAILS=[
  {id:'senda-ferragris',name:'Acceso de Altapiedra',from:'cueva-antigua',to:'cruce-occidental',
    points:[[-300,-640],[-472,-1048],[-640,-1208],[-672,-1176],[-680,-1216],[-688,-1224],[-736,-1216]]},
  {id:'senda-viaducto-oeste',name:'Senda del Viaducto',from:'viaducto-canon:west',to:'cruce-occidental',
    points:[[-690,-1040],[-692,-1040],[-696,-1048],[-706,-1070],[-736,-1216]]},
  {id:'senda-cordillera-oeste',name:'Paso Occidental',from:'cruce-occidental',to:'puente-cordillera:west',
    points:[[-736,-1216],[-840,-1224],[-1022,-1320],[-1010,-1320]]},
  {id:'senda-viaducto-este',name:'Salida Oriental del Viaducto',from:'viaducto-canon:east',to:'cruce-oriental',
    points:[[-150,-1040],[-126,-1040]]},
  {id:'senda-cordillera-este',name:'Paso Oriental',from:'cruce-oriental',to:'puente-cordillera:east',
    points:[[-126,-1040],[-120,-1056],[-264,-1264],[-318,-1320],[-330,-1320]]},
  {id:'senda-altaluz',name:'Acceso de Altaluz',from:'cruce-oriental',to:'altaluz',
    points:[[-126,-1040],[-112,-1048],[-64,-1032],[24,-1040],[40,-1016],[24,-872],[56,-656],[200,-660]]}
] as const;

export function mountainTrailExcludes(x:number,z:number,radius=0):boolean{
  for(const trail of MOUNTAIN_TRAILS)for(let i=1;i<trail.points.length;i++){
    const a=trail.points[i-1],b=trail.points[i];
    if(x<Math.min(a[0],b[0])-10-radius||x>Math.max(a[0],b[0])+10+radius||
      z<Math.min(a[1],b[1])-10-radius||z>Math.max(a[1],b[1])+10+radius)continue;
    const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<10+radius)return true;
  }
  return false;
}

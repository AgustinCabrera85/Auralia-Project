/** Local beach repair at Costas de los Faros. The northern hills, authored
 * inland waters and the rest of the mainland keep their original relief. */
const SHORE=[[900,4420],[1180,4300],[1430,4200],[1650,4190],[1900,4290],
  [2150,4420],[2450,4490],[2760,4450]] as const;
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

export function southernCoastProfile(x:number,z:number):{weight:number;inland:number}|null{
  if(x<=900||x>=2760||z<3700||z>4770)return null;
  let shore=SHORE[0][1] as number;
  for(let i=1;i<SHORE.length;i++)if(x<=SHORE[i][0]){
    const a=SHORE[i-1],b=SHORE[i];shore=a[1]+(b[1]-a[1])*smooth(a[0],b[0],x);break;
  }
  const inland=shore-z;
  const weight=smooth(900,1180,x)*(1-smooth(2480,2760,x))*
    smooth(-260,-90,inland)*(1-smooth(260,430,inland));
  return weight>0?{weight,inland}:null;
}

export function southernCoastHeight(x:number,z:number,original:number,seaLevel:number):number{
  const p=southernCoastProfile(x,z);if(!p)return original;
  // A continuous cross-shore grade replaces both closed depressions. The
  // gentle dry beach descends into a shallow sand bed without a raised sill.
  const target=seaLevel+p.inland*(p.inland>=0?.025:.055);
  return original+(target-original)*p.weight;
}

export function southernCoastSand(x:number,z:number):number{
  const p=southernCoastProfile(x,z);if(!p)return 0;
  return p.weight*(1-smooth(190,320,p.inland));
}

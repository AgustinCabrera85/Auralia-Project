/** The clear river optics used by main's Tres Vertientes watershed. */
export const CLEAR_RIVER_PROFILE={uClearWater:1,uWaveAmp:.09,uWaveSpeed:.8,
  uFlowSpeed:1.2,uFoamIntensity:.4,uDeepColor:'#28595b',uShallowColor:'#79a79a',uCaustics:.2,uContactFoam:.95};

/** First bank, never a second low valley beyond it (same search as the watershed). */
export function riverBankDistance(x:number,z:number,nx:number,nz:number,width:number,
  heightAt:(x:number,z:number)=>number,waterAt:(x:number,z:number)=>number):number{
  let lo=0,hi=width+35;
  for(let d=2;d<=width+37;d+=2){
    if(heightAt(x+nx*d,z+nz*d)>=waterAt(x+nx*d,z+nz*d)){hi=d;break;}lo=d;
  }
  for(let k=0;k<12;k++){const mid=(lo+hi)/2;
    if(heightAt(x+nx*mid,z+nz*mid)<waterAt(x+nx*mid,z+nz*mid))lo=mid;else hi=mid;}
  return (lo+hi)/2;
}

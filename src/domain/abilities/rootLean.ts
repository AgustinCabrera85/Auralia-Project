import type { AbilityProfile } from './types';

/** Lean grows during emergence, holds, then relaxes as the root retracts. */
export function sampleRootLean(lean:number,age:number,profile:Pick<AbilityProfile,'emergence'|'hold'|'retraction'>):number{
  const {emergence,hold,retraction}=profile;
  if(age<=0||age>=emergence+hold+retraction)return 0;
  const amount=age<emergence?age/emergence:age<emergence+hold?1:1-(age-emergence-hold)/retraction;
  const t=Math.max(0,Math.min(1,amount));
  return lean*t*t*(3-2*t);
}

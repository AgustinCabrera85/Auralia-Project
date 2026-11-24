import { biomeWeightsAt } from '../terrainData';
import { activeGeography } from '../geography/ActiveGeography';

const STONE_TINTS={valle:[1.08,1.02,.89],ecos:[.89,.99,.88],sierras:[.88,.93,1.02],
  nacar:[1.10,1.08,1.02],cumbres:[.95,1.02,1.10],costa:[1.17,1.06,.85]} as const;
/** Continuous palette blending avoids a color seam at regional borders. */
export function roadTintAt(x:number,z:number):readonly [number,number,number]{
  const geo=activeGeography(),weights=geo?.biomeWeights(x,z)??biomeWeightsAt(x,z);
  const color:[number,number,number]=[0,0,0];
  for(const key of Object.keys(STONE_TINTS) as (keyof typeof STONE_TINTS)[])
    for(let i=0;i<3;i++)color[i]+=STONE_TINTS[key][i]*weights[key];
  const desert=geo?.desertAt?.(x,z)??0;
  return color.map((v,i)=>v+(STONE_TINTS.costa[i]-v)*desert) as [number,number,number];
}

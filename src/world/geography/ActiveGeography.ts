import type { GeographicSource } from './GeographicSource';
import type { WaterSample } from '../geographicFeatures';
import type { FlowSample } from '../water/riverFlow';
import type { Biome } from '../terrainData';
import type { GeographicBounds } from './GeographicSource';
import type { RiverStrip } from './StudioRivers';
import type { InlandWaterMask } from '../water/InlandWaterMask';

/** One geography per game session, like WorldEditState. A page reload switches
 * worlds; editor tools and the original game keep the null/default context. */
export interface ActiveWorldGeography {
  source:GeographicSource;
  town:{x:number;z:number};
  firefly:{x:number;z:number};
  destinations:readonly {id:string;name:string;x:number;z:number;floating?:string}[];
  mapMarkup():string;
  waterAt(x:number,z:number):WaterSample|null;
  /** Metadata waterline, including dry banks; mesh clipping uses real terrain. */
  waterFieldAt?(x:number,z:number):WaterSample|null;
  oceanExclusion?:InlandWaterMask;
  /** Conservative inland-water mask; must not require resident height sectors. */
  waterMaskAt?(x:number,z:number):boolean;
  flowAt(x:number,z:number):FlowSample;
  waterNear(cx:number,cz:number,size:number):boolean;
  riverStrips?(bounds:GeographicBounds):Iterable<RiverStrip>;
  riverLevelAt?(x:number,z:number):number|null;
  ownsLagoon(x:number,z:number):boolean;
  biomeWeights(x:number,z:number):Readonly<Record<Biome,number>>;
  masks(x:number,z:number):{lake:number;river:number;road:number;existingRoadClearance:number};
}
let active:ActiveWorldGeography|null=null;
export const activeGeography=():ActiveWorldGeography|null=>active;
export function setActiveGeography(value:ActiveWorldGeography|null):void{active=value;}

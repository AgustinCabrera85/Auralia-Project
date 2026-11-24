import { REAL_SECONDS_PER_GAME_DAY, type ClimateFrame } from './ClimateModel';

export const TORNADO_RULES = Object.freeze({
  chancePerWeatherSlot: .22, cooldownHours: 24, minSeconds: 45, maxSeconds: 75,
  minDistance: 120, maxDistance: 220, groundRadius: 14, maxGroundSlope: .22, driftSpeed: .45
});
export function tornadoRandom(seed:number):number {
  let n=(seed+0x57b7a519)|0;
  n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);
  return ((n^(n>>>15))>>>0)/4294967296;
}
export type TornadoWindow={slot:number;seed:number;remaining:number;endHour:number};
/** One deterministic opportunity per weather slot, never a per-frame dice roll. */
export function tornadoWindow(frame:Pick<ClimateFrame,'elapsedHours'|'weatherMix'>):TornadoWindow|null {
  const {elapsedHours:h,weatherMix:w}=frame;
  if(!Number.isFinite(h)||h<0||w.wind<.7||w.cloud<.85||w.snow>.1)return null;
  const slot=Math.floor(h/4),seed=Math.imul(slot,1640531527);
  if(tornadoRandom(seed)>=TORNADO_RULES.chancePerWeatherSlot)return null;
  const start=slot*4+.9+tornadoRandom(seed+1)*1.2;
  const duration=TORNADO_RULES.minSeconds+tornadoRandom(seed+2)*(TORNADO_RULES.maxSeconds-TORNADO_RULES.minSeconds);
  const endHour=start+duration/(REAL_SECONDS_PER_GAME_DAY/24);
  const remaining=(endHour-h)*(REAL_SECONDS_PER_GAME_DAY/24);
  return h>=start&&remaining>8?{slot,seed,remaining,endHour}:null;
}
export type TornadoSurface={height:number;slopeX:number;slopeZ:number;biome:'plains'|'desert'};
export type TornadoHabitat={height:number;waterLevel:number;desert:number;valley:number;coast:number;mountain:number;trees:number;protected:boolean;roadClearance:number};
export function tornadoBiome(h:TornadoHabitat):TornadoSurface['biome']|null {
  if(h.protected||h.height<h.waterLevel+3||h.roadClearance<45||h.coast>.14)return null;
  // The desert includes high plateaus; slope is checked on the real footprint.
  if(h.desert>.55)return 'desert';
  return h.mountain<.16&&h.valley>.5&&h.trees<.55?'plains':null;
}

import { ABILITY_IDS, type AbilityId, type AbilityProgress } from './types';
import { abilityDefinition } from './catalog';
import type { SaveGameV1 } from '../types';
export const isAbilityId=(id:unknown):id is AbilityId=>typeof id==='string'&&ABILITY_IDS.includes(id as AbilityId);
export function normalizeAbilityProgress(raw:unknown,state:Pick<SaveGameV1,'inventory'|'discoveredPlaces'>):AbilityProgress{
  const value=raw&&typeof raw==='object'?raw as Partial<AbilityProgress>:{};
  const unlocked=new Set<AbilityId>(Array.isArray(value.unlocked)?value.unlocked.filter(isAbilityId):[]);
  // Migrate only real existing reward sources; consuming crafting crystals cannot revoke knowledge.
  if(state.inventory.sword>0)unlocked.add('forest_roots');
  if(state.discoveredPlaces?.includes('reino-igneo-cristal'))unlocked.add('igneo_fire');
  const levels:AbilityProgress['levels']={};
  if(value.levels&&typeof value.levels==='object')for(const [id,level] of Object.entries(value.levels))
    if(isAbilityId(id)&&abilityDefinition(id).levelSource==='ability'&&
      Number.isInteger(level)&&level!>=1&&level!<=100)levels[id]=level;
  const selectable=(id:unknown):id is AbilityId=>isAbilityId(id)&&unlocked.has(id)&&
    abilityDefinition(id).implementation==='available'&&abilityDefinition(id).slot==='special';
  return {unlocked:[...unlocked],levels,selected:selectable(value.selected)?value.selected:
    [...unlocked].find(selectable)??null};
}

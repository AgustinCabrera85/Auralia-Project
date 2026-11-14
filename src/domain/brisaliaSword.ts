import type { SaveGameV1 } from './types';

export const BRISALIA_SWORD_NAME='Espada del Bosque Encantado';
export const BRISALIA_SWORD_OBJECTIVES=[
  {id:'hito-ecos',description:'Examiná el Arco del Bosque de los Ecos.'},
  {id:'bosque-ilustrado',description:'Llegá al Bosque Ilustrado.'},
  {id:'pradera-florida-v4',description:'Encontrá la Pradera Florida.'}
] as const;

export type SwordLevel=0|1|2|3|4;

/** Existing discoveries persist the evolution without a second save counter. */
export function brisaliaSwordLevel(state:Readonly<SaveGameV1>):SwordLevel{
  if((state.inventory.sword??0)<1)return 0;
  const discovered=new Set(state.discoveredPlaces??[]);
  return (1+BRISALIA_SWORD_OBJECTIVES.filter(objective=>discovered.has(objective.id)).length) as SwordLevel;
}

export function nextBrisaliaSwordObjective(state:Readonly<SaveGameV1>):string{
  if((state.inventory.sword??0)<1)return 'Fabricá la espada en el taller de Brisalia.';
  const discovered=new Set(state.discoveredPlaces??[]);
  return BRISALIA_SWORD_OBJECTIVES.find(objective=>!discovered.has(objective.id))?.description??
    'Nivel máximo alcanzado.';
}

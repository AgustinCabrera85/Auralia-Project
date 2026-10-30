import type { BuildType, ItemId, Inventory } from './types';

export type Recipe = {
  id: 'hammer' | 'pickaxe' | 'lantern';
  title: string;
  description: string;
  output: ItemId;
  requires: Partial<Record<ItemId, number>>;
};

export const RECIPES: readonly Recipe[] = [
  {
    id: 'hammer', title: 'Martillo de carpintero', description: 'Desbloquea la construcción modular.',
    output: 'hammer', requires: { wood: 2, stone: 1 }
  },
  {
    id: 'pickaxe', title: 'Pico de explorador', description: 'Primer prototipo de una herramienta minera.',
    output: 'pickaxe', requires: { wood: 2, stone: 2 }
  },
  {
    id: 'lantern', title: 'Linterna de las Chispas', description: 'Recuerdo luminoso de la primera isla.',
    output: 'lantern', requires: { wood: 1, spark: 2 }
  }
];

export type BuildDefinition = {
  type: BuildType;
  title: string;
  description: string;
  group:'Cimientos y pisos'|'Paredes y aberturas'|'Techos'|'Decoración';
  requires: Partial<Record<ItemId, number>>;
};

export const BUILD_CATALOG: readonly BuildDefinition[] = [
  {type:'foundation',title:'Cimiento',description:'Base firme de 4 × 4 con soportes en desniveles.',group:'Cimientos y pisos',requires:{wood:2,stone:2}},
  {type:'floor',title:'Piso de madera',description:'Módulo horizontal de 4 × 4.',group:'Cimientos y pisos',requires:{wood:2}},
  {type:'wall',title:'Pared de madera',description:'Se encastra en el borde de un piso.',group:'Paredes y aberturas',requires:{wood:2}},
  {type:'stone-wall',title:'Muro de piedra',description:'Pared de piedra con juntas visibles.',group:'Paredes y aberturas',requires:{stone:3}},
  {type:'metal-wall',title:'Panel de cobre',description:'Pared de metal con remaches.',group:'Paredes y aberturas',requires:{copper:3,stone:1}},
  {type:'door-wall',title:'Pared con puerta',description:'Entrada abierta para caminar al interior.',group:'Paredes y aberturas',requires:{wood:3}},
  {type:'window-wall',title:'Pared con ventana',description:'Abertura con marco y luz.',group:'Paredes y aberturas',requires:{wood:2,stone:1}},
  {type:'roof',title:'Techo a dos aguas',description:'Sección modular apoyada en dos paredes.',group:'Techos',requires:{wood:3,stone:1}},
  {type:'roof-section',title:'Alero de techo',description:'Otra sección que continúa el tejado.',group:'Techos',requires:{wood:3,stone:1}},
  {type:'post',title:'Columna',description:'Poste de esquina para estructurar la casa.',group:'Decoración',requires:{stone:2,copper:1}}
];

export function hasCost(inventory: Inventory, cost: Partial<Record<ItemId, number>>): boolean {
  return (Object.entries(cost) as [ItemId, number][]).every(([key, amount]) => inventory[key] >= amount);
}

export function costAsText(cost: Partial<Record<ItemId, number>>): string {
  const icons: Partial<Record<ItemId, string>> = { wood: '🪵', stone: '🪨', copper: '🔩', spark: '✨' };
  return (Object.entries(cost) as [ItemId, number][]).map(([key, amount]) => `${icons[key] ?? key} ${amount}`).join('  ·  ');
}

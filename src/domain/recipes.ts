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
  requires: Partial<Record<ItemId, number>>;
};

export const BUILD_CATALOG: readonly BuildDefinition[] = [
  { type: 'floor', title: 'Piso de madera', description: 'Módulo de 4 × 4 unidades.', requires: { wood: 2 } },
  { type: 'wall', title: 'Pared de madera', description: 'Pared orientable con la tecla R.', requires: { wood: 2 } },
  { type: 'stone-wall', title: 'Muro de piedra', description: 'Una variante resistente para los edificios.', requires: { stone: 3 } },
  { type: 'metal-wall', title: 'Panel de cobre', description: 'Primer módulo de construcción metálica.', requires: { copper: 3, stone: 1 } },
  { type: 'roof', title: 'Techo de tejas', description: 'Techo de cuatro aguas para tu cabaña.', requires: { wood: 3, stone: 1 } },
  { type: 'post', title: 'Farol de piedra', description: 'Decoración luminosa para el jardín.', requires: { stone: 2, copper: 1 } }
];

export function hasCost(inventory: Inventory, cost: Partial<Record<ItemId, number>>): boolean {
  return (Object.entries(cost) as [ItemId, number][]).every(([key, amount]) => inventory[key] >= amount);
}

export function costAsText(cost: Partial<Record<ItemId, number>>): string {
  const icons: Partial<Record<ItemId, string>> = { wood: '🪵', stone: '🪨', copper: '🔩', spark: '✨' };
  return (Object.entries(cost) as [ItemId, number][]).map(([key, amount]) => `${icons[key] ?? key} ${amount}`).join('  ·  ');
}

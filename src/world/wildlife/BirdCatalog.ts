export type BirdSpecies='canary'|'swallow';
export const BIRD_CLIPS=['Reposo','Mirar alrededor','Saltar','Picotear','Cantar','Alerta',
  'Despegar','Volar','Planear','Aterrizar'] as const;
export type BirdClip=typeof BIRD_CLIPS[number];

/** World units match Auralia's larger characters; originals remain unmodified. */
export const BIRDS={
  canary:{url:'/assets/wildlife/canary-v3.glb',height:.34,speed:5.6,altitude:7,
    count:7,performanceCount:4,fear:5.5},
  swallow:{url:'/assets/wildlife/swallow-v2.glb',height:.30,speed:8.5,altitude:10,
    count:4,performanceCount:2,fear:4.5}
} as const;

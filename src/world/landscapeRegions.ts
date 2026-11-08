/** Geographic subregions refine the six legacy resource biomes without changing save IDs. */
export const LANDSCAPE_REGIONS = {
  forest:{x:-650,z:-410,rx:540,rz:390},
  wetland:{x:710,z:-460,rx:580,rz:350},
  lake:{x:335,z:-255,rx:260,rz:220},
  steppe:{x:-1120,z:-580,rx:550,rz:440},
  sierra:{x:-410,z:-960,rx:470,rz:570},
  alpine:{x:300,z:-1320,rx:550,rz:650},
  desert:{x:-1330,z:-1730,rx:650,rz:660},
  volcanic:{x:-180,z:-1640,rx:440,rz:470},
  cursed:{x:1040,z:-1860,rx:640,rz:560},
  jungle:{x:1360,z:-660,rx:510,rz:610}
} as const;

export function landscapeRegionWeight(x:number,z:number,region:typeof LANDSCAPE_REGIONS[keyof typeof LANDSCAPE_REGIONS]):number {
  const radius=Math.hypot((x-region.x)/region.rx,(z-region.z)/region.rz);
  const t=Math.max(0,Math.min(1,(radius-.48)/.6));
  return 1-t*t*(3-2*t);
}

/** Warm/dry and sterile areas share their placement masks with the terrain shader. */
export function landscapeVegetation(x:number,z:number):{trees:number;grass:number;scale:number}{
  const forest=landscapeRegionWeight(x,z,LANDSCAPE_REGIONS.forest);
  const jungle=landscapeRegionWeight(x,z,LANDSCAPE_REGIONS.jungle);
  const desert=landscapeRegionWeight(x,z,LANDSCAPE_REGIONS.desert);
  const volcanic=landscapeRegionWeight(x,z,LANDSCAPE_REGIONS.volcanic);
  const cursed=landscapeRegionWeight(x,z,LANDSCAPE_REGIONS.cursed);
  const barren=Math.max(desert,volcanic,cursed*.9);
  return {trees:1-barren*.98,grass:1-barren*.98,scale:1+forest*.3+jungle*.35};
}

const NEW_REGION_NAMES={steppe:'Valles Occidentales',desert:'Desierto del Ocaso',
  volcanic:'Cordillera del Crisol',cursed:'Tierras Malditas',jungle:'Selva de las Mil Cascadas'} as const;

export function landscapeNameAt(x:number,z:number,legacyName:string):string {
  let name=legacyName;
  for(const key of Object.keys(NEW_REGION_NAMES) as (keyof typeof NEW_REGION_NAMES)[])
    if(landscapeRegionWeight(x,z,LANDSCAPE_REGIONS[key])>.65)name=NEW_REGION_NAMES[key];
  return name;
}

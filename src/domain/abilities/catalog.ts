import type { AbilityDefinition, AbilityId, AbilityProfile } from './types';

/** Initial balance proposal, not a second sword progression. All distances are metres. */
export const ROOT_RING_DELAY=.24;
export const ROOT_PROFILES:readonly AbilityProfile[] = [
  {level:1,radius:4,damageMultiplier:1,rootScale:.55,fxIntensity:.65},
  {level:2,radius:6,damageMultiplier:1.3,rootScale:.65,fxIntensity:.8},
  {level:3,radius:8,damageMultiplier:1.6,rootScale:.75,fxIntensity:1},
  {level:4,radius:10,damageMultiplier:2,rootScale:.85,fxIntensity:1.2}
].map(p=>{
  const rings=Array.from({length:p.level},(_,i)=>({radius:4+2*i,roots:6+4*i,
    scale:p.rootScale+.1*i,delay:i*ROOT_RING_DELAY,lean:(i%2===0?1:-1)*22*Math.PI/180}));
  const tail=rings[rings.length-1].delay;
  return {...p,roots:rings.reduce((n,r)=>n+r.roots,0),rings,
    emergence:.35,hold:.7,retraction:.6,push:0,immobilize:0,
    cameraShake:{amplitude:.035+.015*(p.level-1),duration:.2,frequency:24},
    timeline:{impacts:rings.map(r=>.75+r.delay),recovery:2.05+tail,release:2.25+tail}};
});
export const MAX_ROOT_INSTANCES=Math.max(...ROOT_PROFILES.map(p=>p.roots));

const pending=(id:AbilityId,name:string,origin:string,description:string,
  design:'confirmed'|'proposed'='proposed'):AbilityDefinition=>({
  id,name,origin,description,design,implementation:'pending',
  pendingReason:'Comportamiento, requisitos y recursos pendientes de definición.',
  slot:'special',activation:'timed',unlockDescription:'Fuente de desbloqueo pendiente.',conditions:null,
  levelSource:'ability',profiles:[{level:1,radius:0,roots:0,damageMultiplier:0,rootScale:1,
    fxIntensity:0,emergence:0,hold:0,retraction:0,push:0,immobilize:0}],behavior:null,fx:null,animation:null,
  timeline:{commit:0,fx:[],impacts:[],recovery:0,release:0},cooldown:0,cooldownStarts:'commit',
  cancel:{beforeCommit:true,afterCommit:true}
});

export const ABILITIES:readonly AbilityDefinition[] = [
  {id:'forest_roots',name:'Raíces del Bosque',origin:'Bosque Encantado',
    description:'Cada nivel añade un anillo exterior de raíces más grandes. Emergen en secuencia, impactan una vez por blanco y se retraen.',
    design:'confirmed',implementation:'available',slot:'special',activation:'timed',
    unlockDescription:'Fabricá la Espada del Bosque Encantado.',
    conditions:{all:[{rule:'equipment',value:'sword',reason:'Equipá la espada (2).'},
      {rule:'swordLevel',value:1,reason:'Necesitás la espada en nivel 1.'},
      {rule:'playerState',value:'grounded',reason:'Apoyate en suelo firme.'}]},
    levelSource:'sword',profiles:ROOT_PROFILES,behavior:'forest_roots',fx:'forest_roots',
    animation:{file:'santi',clip:'Sword And Shield Casting',speed:1.2,blendSeconds:.12,groundStrikeAt:1.1},
    timeline:{commit:.4,fx:[.4],impacts:[.75],recovery:2.05,release:2.25},
    cooldown:12,cooldownStarts:'commit',cancel:{beforeCommit:true,afterCommit:true}},
  {...pending('forest_ultimate','Definitivo del Bosque','Bosque Encantado',
    'Poder independiente de las raíces. Animación corporal, comportamiento y condiciones por incorporar.','confirmed'),
    slot:'ultimate',unlockDescription:'Desbloqueo propio todavía pendiente.',
    pendingReason:'Definitivo pendiente: faltan animación identificada, comportamiento y condiciones.'},
  {id:'igneo_fire',name:'Llamarada Ígnea',origin:'Reino Ígneo',
    description:'X lanza una ráfaga de fuego desde la mano hacia delante. Los obstáculos cortan su alcance. Esc cancela.',
    design:'confirmed',implementation:'available',slot:'special',activation:'timed',
    unlockDescription:'Despertá el cristal sagrado del Reino Ígneo.',
    conditions:{rule:'playerState',value:'grounded',reason:'Apoyate en suelo firme para lanzar fuego.'},
    levelSource:'ability',profiles:[{level:1,radius:5.8,roots:0,damageMultiplier:1,rootScale:1,
      fxIntensity:1,emergence:.2,hold:1.05,retraction:.55,push:0,immobilize:0}],
    behavior:'igneo_fire',fx:'igneo_fire',
    animation:{file:'santi',clip:'Idle (1)',speed:1,blendSeconds:.15,loop:true,
      handCast:{extendBy:.42,retractFrom:1.9,end:2.25}},
    timeline:{commit:.45,fx:[.45],impacts:[.65,.85,1.05,1.25,1.45,1.65],recovery:1.7,release:2.25},
    cooldown:5,cooldownStarts:'end',cancel:{beforeCommit:true,afterCommit:true}},
  {...pending('albor_flight','Vuelo de Albor','Albor','Vuelo real con colisiones, sin noclip.','confirmed'),
    activation:'toggle',animation:{file:'santi',clip:'Flying',speed:1,blendSeconds:.18,loop:true}},
  pending('valdoria_light','Luz protectora','Valdoria','Luz protectora.'),
  pending('valdemonte_stone','Dominio de la piedra','Valdemonte','Dominio de la piedra.'),
  pending('sylvarin_resonance','Resonancia y ecos','Sylvarin','Resonancia y ecos.'),
  pending('ferragris_magnetism','Magnetismo','Ferragrís','Magnetismo.'),
  pending('solhar_sand','Control de arena','Solhar','Control de arena.'),
  pending('umbrael_shadow','Paso de sombra','Umbrael','Paso de sombra.'),
  pending('nacar_water','Control del agua','Nácar','Control del agua.'),
  pending('viridara_vines','Lianas de agarre','Viridara','Lianas de agarre.'),
  pending('doravena_beasts','Afinidad animal','Doravena','Afinidad animal.'),
  pending('thalamar_lightning','Electricidad','Thalamar','Electricidad.')
];
export const abilityDefinition=(id:AbilityId):AbilityDefinition=>ABILITIES.find(a=>a.id===id)!;

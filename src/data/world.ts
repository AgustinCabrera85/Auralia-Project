/** Mapa narrativo en coordenadas normalizadas (0..100), independiente del render 3D. */
export type ZoneId = 'brisalia' | 'luciernagas';
export type RegionStatus = 'playable' | 'explorable' | 'planned';
export type MapLocation = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: 'region' | 'island';
  status: RegionStatus;
  x: number;
  y: number;
  zoneId?: ZoneId;
  specialty: string;
};

/** Posiciones relativas al arte del mapa maestro (1536 x 1024). */
export const MAP_LOCATIONS: readonly MapLocation[] = [
  {
    id: 'brisalia', name: 'Brisalia', subtitle: 'Valle de los Faroles',
    description: 'Tu hogar, la aldea, el bosque, la cantera y el primer taller.',
    category: 'region', status: 'playable', x: 48.2, y: 59.5, zoneId: 'brisalia',
    specialty: 'Vida cotidiana · construcción · crafting básico'
  },
  {
    id: 'altapiedra', name: 'Altapiedra', subtitle: 'Sierras de los Engranajes',
    description: 'Grúas, caminos de montaña, metalurgia y puentes suspendidos.',
    category: 'region', status: 'explorable', x: 39, y: 22.5,
    specialty: 'Mecanismos · herrería avanzada · ingeniería'
  },
  {
    id: 'nacar', name: 'Nácar', subtitle: 'Lago de las Dos Orillas',
    description: 'Mercado de canales, barcos, pesca y proyectos comunitarios.',
    category: 'region', status: 'explorable', x: 68.8, y: 46.5,
    specialty: 'Navegación · cooperación · comercio'
  },
  {
    id: 'lindebrumas', name: 'Lindebrumas', subtitle: 'Bosque de los Ecos',
    description: 'Senderos que se transforman, acertijos e ilusiones.',
    category: 'region', status: 'explorable', x: 31, y: 47,
    specialty: 'Magia · observación · criterio propio'
  },
  {
    id: 'altaluz', name: 'Altaluz', subtitle: 'Cumbres del Primer Amanecer',
    description: 'La gran ciudadela y el faro que conecta los caminos de Auralia.',
    category: 'region', status: 'explorable', x: 71, y: 19,
    specialty: 'Síntesis de habilidades · grandes expediciones'
  },
  {
    id: 'luciernagas', name: 'Isla de las Luciérnagas', subtitle: 'Isla cercana',
    description: 'Una expedición en bote para descubrir cristales de chispa y fabricar una linterna mágica.',
    category: 'island', status: 'playable', x: 24, y: 87.5, zoneId: 'luciernagas',
    specialty: 'Cristales de chispa · primer viaje en bote'
  },
  {
    id: 'herrero', name: 'Peñasco del Herrero', subtitle: 'Isla de materiales',
    description: 'Un antiguo horno volcánico y minerales especiales.',
    category: 'island', status: 'planned', x: 85.6, y: 77.4,
    specialty: 'Metal encantado · nuevas herramientas'
  },
  {
    id: 'cristal', name: 'Isla del Cristal Sonoro', subtitle: 'Isla de aprendizaje',
    description: 'Cristales que responden a melodías; futuros acertijos acústicos.',
    category: 'island', status: 'planned', x: 94.1, y: 46,
    specialty: 'Minerales resonantes · magia sonora'
  },
  {
    id: 'faro', name: 'Faro Dormido', subtitle: 'Isla legendaria',
    description: 'Ruinas de un faro en el borde del archipiélago.',
    category: 'island', status: 'planned', x: 94, y: 15.5,
    specialty: 'Navegación avanzada · exploración'
  },
  {
    id: 'bruma', name: 'Isla de la Bruma Serena', subtitle: 'Isla de misterio',
    description: 'Un pequeño bosque casi siempre envuelto en niebla violeta.',
    category: 'island', status: 'planned', x: 9, y: 28.2,
    specialty: 'Hierbas extrañas · investigación'
  }
];

export const LAND_ROUTES = [
  ['brisalia', 'altapiedra'], ['brisalia', 'nacar'], ['brisalia', 'lindebrumas'],
  ['altapiedra', 'altaluz'], ['nacar', 'altaluz'], ['lindebrumas', 'altapiedra']
] as const;
export const SEA_ROUTES = [
  ['brisalia', 'luciernagas'], ['brisalia', 'herrero'], ['nacar', 'cristal'],
  ['cristal', 'faro'], ['lindebrumas', 'bruma']
] as const;

export const ZONES: Record<ZoneId, { name: string; description: string; island: boolean }> = {
  brisalia: {
    name: 'Valle de los Faroles',
    description: 'Brisalia · claro del hogar · bosque y cantera', island: false
  },
  luciernagas: {
    name: 'Isla de las Luciérnagas',
    description: 'Islote brillante · cristales de chispa', island: true
  }
};

# Auralia · POC

Prototipo de aventura en mundo abierto con Babylon.js, TypeScript y Vite. Incluye exploración de la isla principal y la Isla de las Luciérnagas, recolección, crafting, construcción modular, NPC y guardado local. La isla principal tiene una envolvente nominal de **4.000 × 3.000 m** y seis biomas. Las ciudades fuera de Brisalia siguen en desarrollo.

## Ejecutar y verificar

Requiere Node 20.17+ (o 22+), npm y un navegador compatible con WebGL.

```bash
npm install
npm run dev
```

Vite muestra la dirección local, normalmente `http://localhost:5173/`. Para verificar el proyecto:

```bash
npm run check
npm test
npm run build
```

`npm run map:terrain` regenera el mapa técnico después de cambiar la geografía. `npm run map:static` regenera el atlas conceptual.

## Controles

| Control | Acción |
| --- | --- |
| `W` / `S` / `A` / `D` o flechas | Caminar respecto de la cámara |
| `Shift` | Correr |
| Arrastrar ratón / rueda | Orbitar cámara / zoom |
| `E` | Interactuar, recolectar o viajar |
| `M` | Abrir mapa regional y atlas |
| `C` | Abrir crafting |
| `B` | Entrar en construcción |
| `R` | Rotar pieza al construir |
| `Esc` | Cerrar panel o salir de construcción |

La [guía de construcción](docs/BUILDING_SYSTEM.md) explica la colocación y los encastres.

## Mapas y datos del mundo

`src/world/terrainData.ts` define la altura, costa, biomas e hitos de la isla principal. `src/world/geographicFeatures.ts` define ríos, lagos y accidentes. El mapa técnico `docs/Mapa_geografico_auralia_v0.2.svg` y el asset `public/assets/mapa-geografico-v0.2.svg` se derivan de esos datos. Su nombre conserva `v0.2` por compatibilidad. El atlas ilustrado es una referencia narrativa, no un mapa métrico.

El terreno usa tres niveles de detalle y se carga alrededor del personaje. La vegetación, las rocas y otros objetos decorativos se distribuyen por sectores. Los puntos de interés descubiertos y los recursos recolectados conservan su estado en el guardado.

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md): sistemas y decisiones de persistencia.
- [Geografía jugable](docs/GEOGRAFIA.md): fuentes de datos, mapa y descubrimientos.
- [Assets del mundo](docs/ASSETS.md): catálogo, instanciación y recursos.
- [Follaje ilustrado V4](docs/FOLIAGE_V4.md): modelos, shader de viento y acceso al bosque de prueba.
- [Terreno distante y atmósfera](docs/LANDSCAPE_LOD.md), [material del terreno](docs/TERRAIN_MATERIAL.md), [vegetación](docs/VEGETACION_PROCEDURAL.md) y [césped](docs/GRASS_FIELD.md): sistemas de render.
- [Atlas conceptual](docs/ATLAS_AURALIA.md), [GDD preliminar](docs/GDD_v0.2_previo.md), [roadmap navideño](docs/ROADMAP_NAVIDAD.md) y [roadmap visual](docs/ROADMAP_VISUAL.md): visión y planificación. El GDD está marcado como propuesta, no como canon definitivo.

El código y sus constantes son la referencia para valores de configuración. El mapa y los GLB generados o procesados se mantienen como assets del proyecto.

# Auralia · POC

Prototipo de aventura en mundo abierto con Babylon.js, TypeScript y Vite. Incluye exploración, recolección, crafting, construcción modular, NPC y guardado local. El mapa jugable usa la geografía de World Studio. Brisalia tiene 28 edificios; las demás ciudades siguen en desarrollo.

## Estado del 14 de noviembre de 2026

- **Santi:** carrera orientada a la pendiente, barrida sostenida al deslizar cuesta abajo y apoyo visual de los pies sin mover el collider. Se conservan las correcciones de pisada, aterrizaje y parpadeo del commit anterior.
- **Espada del Bosque Encantado:** cuatro GLB para una única espada que evoluciona con los descubrimientos. Agarre con los dedos del ataque, colocación calibrada manualmente y giro de la muñeca sobre el eje del antebrazo al correr. Equipo muestra el nivel y el siguiente objetivo; crafting conserva el costo de la receta.
- **Herramienta de colocación:** `F9` ajusta posición XYZ en centímetros y rotación XYZ en grados, permite copiar/restablecer valores y admite registrar otros assets. Solo se instancia en desarrollo; sus ajustes locales no se leen en producción.
- **Brisalia:** B01–B27 de la revisión 4 y un único B28 de la revisión 5. Escala calibrada con Santi de 1,40 m, accesos conectados, colisiones sobre la geometría real y patio del castillo formado por el terreno del mapa. Se retiraron las casas provisionales y el castillo anterior; se reubicaron NPC y banco de trabajo.
- **Terreno y caminos:** mayor continuidad de la silueta de las montañas entre LOD; terreno estable en los apoyos de Brisalia y desvío del río adaptado a la implantación ampliada. Caminos de tierra y grava con bordes irregulares y suaves.
- **Vegetación:** margaritas, matorrales y yuyos con los tres LOD suministrados. El pasto conserva su forma y altura grandes, respeta edificios y caminos, se ve hasta 240 unidades del juego y se precarga hasta 288, con fondo disperso y detalle cercano.

La referencia de rendimiento es **GTX 1060 de 6 GB, 1080p y al menos 30 FPS**; sigue siendo un objetivo pendiente de medición en ese hardware. La integración actual fue comprobada con compilación de producción, pruebas de los sistemas modificados y revisión del mapa en el navegador. No se incorporan ZIP, escenas de Blender, capturas ni perfiles de prueba al paquete de ejecución.

Los detalles y límites vigentes están en [Santi](docs/SANTI_CHARACTER.md), [Brisalia y terreno](docs/LANDSCAPE_LOD.md) y [pasto y precarga](docs/GRASS_FIELD.md).

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

El [mapa maestro geográfico](docs/MAPA_MAESTRO_GEOGRAFICO.md) define el rediseño hacia doce regiones con relieve y cuencas propios. El tamaño total queda abierto hasta completar y medir el piloto de Brisalia; las coordenadas actuales siguen vigentes durante esa preparación.

`src/world/geography/PlayableWorld.ts` adapta la fuente de World Studio al mapa de ejecución, incluidas las terrazas de Brisalia. `src/world/brisaliaLayout.ts` contiene la implantación activa de edificios y caminos. `src/world/terrainData.ts`, `src/world/geographicFeatures.ts` y los mapas técnicos `v0.2` conservan datos del terreno legado y funciones compartidas. El atlas ilustrado es una referencia narrativa, no un mapa métrico.

El terreno usa tres niveles de detalle y se carga alrededor del personaje. La vegetación, las rocas y otros objetos decorativos se distribuyen por sectores. Los puntos de interés descubiertos y los recursos recolectados conservan su estado en el guardado.

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md): sistemas y decisiones de persistencia.
- [Geografía jugable](docs/GEOGRAFIA.md): fuentes de datos, mapa y descubrimientos.
- [Assets del mundo](docs/ASSETS.md): catálogo, instanciación y recursos.
- [Santi, personaje jugable](docs/SANTI_CHARACTER.md): modelo, acciones NLA y expresiones faciales.
- [Follaje ilustrado V4](docs/FOLIAGE_V4.md): modelos, shader de viento y acceso al bosque de prueba.
- [Terreno distante y atmósfera](docs/LANDSCAPE_LOD.md), [material del terreno](docs/TERRAIN_MATERIAL.md), [vegetación](docs/VEGETACION_PROCEDURAL.md) y [césped](docs/GRASS_FIELD.md): sistemas de render.
- [Mapa maestro geográfico](docs/MAPA_MAESTRO_GEOGRAFICO.md), [atlas anterior](docs/ATLAS_AURALIA.md), [GDD preliminar](docs/GDD_v0.2_previo.md), [roadmap navideño](docs/ROADMAP_NAVIDAD.md) y [roadmap visual](docs/ROADMAP_VISUAL.md): visión y planificación. El GDD está marcado como propuesta, no como canon definitivo.

El código y sus constantes son la referencia para valores de configuración. El mapa y los GLB generados o procesados se mantienen como assets del proyecto.

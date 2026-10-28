# Geografía de Auralia · Update 2

La isla principal tiene una envolvente nominal de **4.000 × 3.000 m**. El origen y los objetos de Brisalia conservan sus coordenadas. `+X` apunta al este y `+Z` al sur. El centro geográfico está en `(0, -1130)`; la costa irregular modifica la silueta nominal. La Isla de las Luciérnagas permanece separada por mar y su viaje no cambia.

## Fuente única y parámetros

`src/world/terrainData.ts` define `MAINLAND` y `TERRAIN_CONFIG`. La altura `sampleMainlandHeight(x,z)` sirve al terreno, la posición del jugador, los apoyos de objetos y la colisión terrestre. `biomeWeightsAt(x,z)` mezcla seis influencias continuas: valle templado, Bosque de los Ecos, sierras rocosas, Humedales de Nácar, costa y alta montaña.

| Parámetro | Valor inicial | Función |
| --- | ---: | --- |
| `MAINLAND.radiusX / radiusZ` | 2000 / 1500 m | Escala nominal de la isla |
| `MAINLAND.centerZ` | -1130 m | Brisalia cerca del litoral sur |
| `MAINLAND.chunkSize` | 72 m | Lado de cada malla independiente |
| `MAINLAND.visibleRadius` | 4 | Anillo circular de carga |
| `MAINLAND.terrainSubdivisions` | 12 | Resolución de cada chunk |
| `MAINLAND.chunksPerFrame` | 1 | Límite de creación por fotograma |
| `TERRAIN_CONFIG.seed` | 271828 | Ruido determinista |
| `noise.*Scale / *Amplitude` | 470, 175, 58 m / 5, 2,8, 0,75 m | Ondas de distintas escalas |
| `relief.*` | según bioma | Colinas, depresiones, crestas, nieve y descenso costero |
| `biomes.blendWidth / coastalBand / snowLine` | 180 / 160 / 82 m | Mezcla regional, litoral y nieve |
| `reservations.*` | configurable | Anchura y suavizado de corredores |

Las influencias sitúan el valle y Brisalia al sur, Lindebrumas al oeste, Altapiedra al noroeste, Nácar al este y Altaluz al norte. Los hitos actuales permanecen en sus coordenadas. El relieve v0.2 se conserva exactamente en su núcleo y en Brisalia y se mezcla gradualmente con el terreno ampliado. La costa antigua transitable conserva su cota mínima para las posiciones guardadas. Por eso las construcciones ya guardadas siguen apoyadas en el mismo suelo, sin cambiar el formato `SaveGameV1`.

## Reservas para Update 3

`ROAD_RESERVATIONS` contiene las ocho rutas ya visibles y tres corredores exteriores todavía no construidos. `RIVER_RESERVATION` y `LAKE_RESERVATIONS` fijan las futuras cuencas. `geographyMasks` rebaja y suaviza el relieve localmente. Estas máscaras son solo geografía: no incorporan un sistema fluvial, nuevos caminos físicos ni accidentes definitivos.

El SVG del mapa se regenera con `npm run map:terrain` desde la misma configuración y la misma proyección que usa el marcador del jugador. Los nombres de archivo `v0.2.svg` se conservan para no romper las referencias existentes; su contenido representa Update 2.

## Pendiente

- El agua sigue siendo un plano a cota constante; las cuencas se muestran como superficies lacustres preliminares.
- Los hitos, recursos y caminos originales son objetos estáticos; solo el terreno y la decoración distante usan streaming.
- Falta validación visual e interactiva en un navegador WebGL del equipo destino.

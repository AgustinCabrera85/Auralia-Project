# Material del terreno continental

`TerrainStream` mantiene sus mallas, alturas, normales y streaming de 72 m. Cada vértice ahora guarda cuatro pesos RGBA (pasto, tierra, roca, arena), y todos los chunks usan el mismo `ShaderMaterial` y las mismas seis texturas WebP de 1024 × 1024. El alfa de cada albedo almacena rugosidad, no transparencia. No se agrega una malla de suelo superpuesta.

La implementación está en `src/world/materials/TerrainMaterial.ts`. Se adaptó el material del POC `auralia-valle-escenico-poc`; no se incorporaron su relieve, agua, vegetación ni escena. Los seis archivos usados están en `public/assets/terrain/`: `grass_albedo_rough`, `soil_albedo_rough`, `sand_albedo_rough`, `rock_albedo_rough`, `grass_normal` y `rock_normal` (todos `.webp`). Las texturas fueron generadas proceduralmente para Auralia según la documentación del laboratorio.

## Cálculo y continuidad

- La pendiente proviene de las mismas muestras de altura que producen las normales de los chunks. La altura y los biomas vienen de `terrainData`; las distancias a ríos, arroyos, lagos y lagunas vienen de `geographicFeatures`. La máscara del cañón sólo afecta el material.
- Los pesos se calculan con coordenadas globales. El shader también proyecta desde coordenadas mundiales: XZ para pasto, tierra y arena; triplanar para la roca. Por eso el patrón y las máscaras continúan en los límites de chunks.
- El ruido desplaza suavemente las transiciones de la ribera. El shader combina un segundo muestreo rotado de pasto, deformación de UV de baja frecuencia y variación cromática amplia. Las normales de pasto y roca aportan detalle fino; el alfa de los albedos regula el brillo especular.

## Ajustes

Los valores predeterminados están en `TERRAIN_MATERIAL_CONFIG`. `TerrainStream` acepta un tercer argumento opcional con los campos que se quieran ajustar.

| Parámetro | Predeterminado | Efecto |
| --- | ---: | --- |
| `tileScale` | 0.135 | Repeticiones por metro; una textura ocupa ~7,4 m. |
| `grassDetailScale` | 1.37 | Escala del segundo muestreo rotado que reduce el mosaico de pasto. |
| `macroScale`, `macroStrength` | 0.012, 0.085 | Tamaño e intensidad de la variación cromática amplia. |
| `normalStrength`, `rockNormalStrength` | 0.16, 0.23 | Intensidad de normales de pasto y roca. |
| `slopeStart`, `slopeFull` | 0.32, 1.2 | Pendiente donde empieza y se completa la capa rocosa. |
| `rockHeightStart`, `rockHeightFull` | 38, 95 | Refuerzo de roca en sierras y cumbres elevadas. |
| `shoreBlend`, `soilBlend` | 18, 42 m | Anchura de las transiciones hacia arena y tierra junto al agua. |
| `maskNoiseScale`, `maskNoiseStrength` | 0.044, 3.5 m | Frecuencia y desplazamiento de los bordes de mezcla. |
| `sandStrength` | 0.84 | Presencia máxima de arena en orillas. |

Las distancias y pendientes se evalúan por vértice; los cambios muy finos requieren más resolución de malla y aquí se dejan al detalle de textura para conservar la geometría y las colisiones existentes.

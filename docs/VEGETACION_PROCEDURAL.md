# Vegetación procedural

La isla principal usa `Arbolito_1.glb`, `Arbolito_2.glb`, `Arbolito_3.glb` y `plantitas_1.glb` como decoración. Los recursos recolectables de Brisalia y sus hitos siguen siendo objetos interactivos separados.

## Modelos

Cada GLB contiene una malla, un material y una textura. Se revisaron sus dimensiones y vistas de color con Blender 4.5. La escala de juego se ajustó tomando como referencia al protagonista, que mide aproximadamente 4 m. Los pivotes están al pie, la orientación vertical es Y en Babylon, y no se modificaron los archivos originales.

| Modelo | Alto original aproximado | Escala base | Uso |
| --- | ---: | ---: | --- |
| Arbolito_1 | 1,00 m | 15 | Valle y bosque abierto |
| Arbolito_2 | 1,00 m | 17 | Bosque denso y transiciones |
| Arbolito_3 | 1,00 m | 20 | Árbol destacado cerca de regiones especiales |
| plantitas_1 | 0,72 m | 2,4 | Pradera, sotobosque y ribera |

La escala final varía un 16 % en torno a la base. Solo se rota alrededor del eje vertical.

## Distribución y streaming

`vegetationData.ts` calcula candidatos con una semilla fija por chunk, biome weights, máscaras de humedad/agua/caminos, altura y pendiente. Los centros de agrupación usan coordenadas mundiales y atraviesan los bordes de chunks. Se excluyen el centro de Brisalia, la parcela, casas, plazas, hitos, muelles, caminos, recursos existentes, construcciones guardadas y superficies sumergidas. La colocación no modifica el guardado.

`VegetationSystem.ts` importa cada GLB una sola vez. Cada especie usa una malla fuente y un buffer de thin instances. Al descargar chunks se descartan colocaciones y se reconstruyen los buffers; las mallas, materiales y texturas compartidos se conservan hasta cerrar la escena. Se procesa como máximo un chunk de vegetación por frame. Los troncos tienen colisión circular simplificada calculada solo en chunks cercanos, sin mallas físicas por instancia.

## Parámetros

Editar `VEGETATION_CONFIG` en `src/world/vegetationData.ts`:

| Parámetro | Valor actual | Efecto |
| --- | --- | --- |
| `seed` | 89031 | Distribución reproducible |
| `renderRadiusChunks` | árboles 3, plantas 2 | Distancia máxima desde el chunk del jugador |
| `candidatesPerChunk` | 8 / 12 / 2 / 16 | Límite de densidad por modelo y chunk |
| `baseScale` | 15 / 17 / 20 / 2,4 | Tamaño de cada modelo |
| `scaleVariation` | 0,16 | Variación determinista |
| `crownRadius` | 0,43 / 0,38 / 0,5 / 0,5 | Despeje de copas y plantas cerca de objetos |
| `clusterCellSize` | 135 m | Tamaño de agrupaciones y claros |
| `minHeightAboveWater` | árboles 1,5 m, plantas 0,55 m | Separación del agua |
| `maxSlope` | árboles 0,45, plantas 0,62 | Límite de pendiente |
| `roadMaskLimit` | 0,55 | Exclusión de corredores reservados |
| `obstacleRadius` | 1,2 / 1,4 / 1,7 m | Colisión de troncos |

En la prueba de una zona continental se midieron **162 instancias visibles en 37 chunks activos**. La cantidad cambia según el bioma, la costa y los corredores despejados.

## Límites actuales

No hay LOD, viento ni animación para estos GLB. La colisión de troncos es circular en el plano y no usa un cuerpo físico.

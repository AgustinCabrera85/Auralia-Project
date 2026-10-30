# Césped volumétrico continental

El césped de `src/world/grass/` añade geometría opaca cerca del jugador sin alterar el relieve, el material del terreno, las colisiones ni la vegetación GLB. `GrassFieldSystem` recibe los chunks activos de `TerrainStream`, prepara una ventana fija de 3 × 3 chunks alrededor del chunk del jugador, divide cada chunk de 72 m en parches de 12 × 12 m y crea thin instances de prototipos compartidos. Una caminata dentro del chunk sólo cambia la visibilidad y el desvanecimiento: no crea, mueve ni redistribuye matas. Cada mata usa la altura de `sampleMainlandHeight()`; sus hojas no tienen colisionador ni proyectan sombras individuales.

`grassData.ts` clasifica previamente los parches de cada chunk de terreno usando altura, pendiente, agua y material del suelo. Esa clasificación permanece fija mientras el chunk está activo, independientemente de los movimientos del jugador. Las posiciones se generan de manera determinista y respetan biomas, caminos, agua, formaciones geológicas, casas, parcela y construcciones. Brisalia conserva césped en el espacio libre alrededor de las casas. Los obstáculos rocosos se obtienen de las composiciones y colocaciones de roca existentes. Los parches se construyen por turnos; sus buffers permanecen fijos en la ventana de chunks y se liberan al descargar el chunk o desactivar el sistema.

`GrassGeometry.ts` construye con `VertexData` tres alturas (corta, media y alta) y un prototipo simplificado para distancia media. Cada mata tiene varias hojas triangulares curvas, no planos rectangulares cruzados. Algunas matas altas incluyen flores blancas o amarillas. `GrassMaterial.ts` deforma sólo la parte flexible de cada hoja en el vertex shader; una actualización de uniformes por frame usa tiempo real para que el viento no dependa de los FPS. El nivel medio conserva una selección fija de las posiciones del nivel cercano, de modo que las matas no cambian de lugar al moverse el jugador. El desvanecimiento se calcula por parche desde el jugador y usa una semilla fija por mata, sin parpadeo al mover la cámara; ambos niveles comparten un solo material.

## Configuración

`GRASS_CONFIG` es el perfil predeterminado. `GRASS_QUALITY.low`, `.medium` y `.high` ofrecen presupuestos listos para pasar al constructor de `GrassFieldSystem`. Un objeto parcial también puede modificar cualquier campo. `setEnabled(false)` libera los parches sin afectar a los árboles GLB; `dispose()` libera todo el sistema.

| Campo | Predeterminado | Función |
| --- | ---: | --- |
| `patchSize` | 12 m | Tamaño del parche; debe dividir 72 m. |
| `nearDistance`, `farDistance` | 40, 74 m | Alcance de geometría detallada y simplificada. |
| `transitionDistance` | 10 m | Franja de transición con dithering. |
| `nearCandidates`, `mediumCandidates` | 140, 24 | Máximo de matas candidatas por parche. |
| `maxVisibleInstances` | 12000 | Presupuesto global; los parches cercanos tienen prioridad. |
| `patchesPerFrame` | 3 | Máximo de parches generados por frame. |
| `density`, `height`, `width` | 1, 1, 1 | Densidad y escala de las matas. |
| `colorVariation` | 0.17 | Diferencias de color entre matas. |
| `windStrength`, `windSpeed` | 0.24, 1 | Desplazamiento máximo y velocidad del viento. |
| `maxSlope`, `minGrassWeight` | 0.58, 0.34 | Límites de pendiente y presencia mínima de pasto en el suelo. |
| `roadClearance`, `waterClearance` | 1.25, 0.45 m | Separación de caminos y agua. |

Para ver métricas en el juego, abrir la URL local con `?grassStats=1`. La esquina inferior derecha muestra FPS, draw calls totales de la escena, matas, triángulos aproximados, chunks de terreno y parches de césped activos. El número de draw calls del césped es aproximadamente uno por parche activo; el conteo real de la escena viene de `SceneInstrumentation`.

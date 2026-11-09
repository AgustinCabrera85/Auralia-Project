# Física secundaria reducida y colisiones locales

Estado: implementación integrada y validada para elementos decorativos. No sustituye el controlador de Santi ni convierte todos los assets del mapa en cuerpos físicos.

## Auditoría y alcance elegido

| Sistema existente | Situación encontrada | Decisión y motivo |
| --- | --- | --- |
| Colisión de árboles | Copias de colisión cercanas, pero cada rayo usaba `scene.multiPickWithRay`: recorrido de toda la escena. También se creaba un Map de candidatos por consulta. | Reutilizar `SpatialHash` en XZ, conservar la prueba de triángulos y consultar directamente las mallas candidatas. No cambia las reglas de raíces transitables ni de salida de troncos. |
| Faroles de entradas y cámaras | Cubos estáticos combinados con el resto de la arquitectura. No había cuerpos rígidos ni cadenas simuladas. | Incorporar movimiento secundario mediante seis partículas por cable, XPBD y reconstrucción agrupada. Es una capacidad nueva con coste adicional medido, no un ahorro frente a una simulación anterior inexistente. |
| Vegetación y césped | Geometría compartida/instancias, LOD y viento en shader. | Conservar. Simular hojas o cada árbol en CPU empeoraría el objetivo de memoria y FPS. |
| Santi | Animaciones esqueléticas, expresiones y controlador de desplazamiento con consultas de superficies. | Conservar la autoridad del controlador. Su cápsula solo empuja elementos secundarios; estos no alteran saltos, combate ni escalada. |
| Rocas | Colliders locales y rayos contra una lista explícita de mallas. | No reemplazar triángulos por un SDF aproximado: afectaría apoyos y escalada. El índice reutilizable permite una extensión futura si el perfil lo justifica. |
| Puentes, galerías y terreno | Superficies transitables, recintos superpuestos y streaming regional. | Mantener rígidos. No aplicar un heightfield a los interiores ni simular las barandas portantes como cuerdas. |

No se modificó bosque-babylon. No se incorporaron dependencias, workers, un motor rígido nuevo ni un SDF volumétrico del continente.

## Componentes

- `src/physics/SpatialHash.ts`: AABB en todas las celdas ocupadas, claves completas XYZ, deduplicación por sello, actualización/eliminación por ID y lista de respaldo para volúmenes enormes. `floor` funciona también en coordenadas negativas. Las consultas grandes recorren entradas en vez de expandir millones de celdas. Entradas no finitas se rechazan.
- `DistanceFields.ts`: distancias en unidades del mundo para esfera, cápsula, plano y caja orientada alrededor de Y; normales con alternativas deterministas en degeneraciones. Distancia entre segmentos finitos; contacto cápsula–primitiva y avance conservador para una esfera en movimiento contra primitivas estáticas.
- `ChainDynamics.ts`: registro y retirada, buffers separados de posiciones/velocidades/masas/restricciones, integración, solvers, colisiones, sueño, LOD, presupuesto y métricas. No depende de Babylon.
- `ChainCurve.ts`: interpolación de estados físicos, Hermite acotado al intervalo de cada componente, remuestreo por longitud de arco y marcos orientados de manera continua. Buffers reutilizados.
- `HangingLanterns.ts`: adaptación visual a Babylon. Dos mallas por grupo: cables y faroles. No crea un objeto, material, luz u observer por segmento.
- `MountainPassSystem.ts`: propietario único de la simulación secundaria. Crea seis cadenas exteriores y siete interiores al entrar; las interiores se retiran al salir.
- `TreeColliderSystem.ts`: utiliza el mismo índice para acelerar colisiones ya existentes.
- `GameTelemetry.ts` / `telemetryData.ts`: fase F8 «Pasos/física secundaria», contadores actuales y exportación de métricas dentro de `world.secondaryDynamics`.

## Modelo y selección de solver

`ChainDynamics.add` admite `analytic`, `ftl`, `pbd` y `xpbd`. El modo analítico conserva una forma rígida oscilante sin contactos; sirve para decoración sin interacción. FTL proyecta los seguidores a la distancia del predecesor; es útil cuando importa que la cabeza guíe la forma y no una respuesta física bilateral. PBD usa proyección con compliance cero. XPBD acumula lambda durante las iteraciones de cada subpaso y utiliza `compliance / h²`.

Los faroles usan XPBD: anclaje con masa inversa cero, gravedad, amortiguación exponencial, compliance `2e-7`, seis iteraciones cercanas y seis partículas por cadena. Las masas inversas son configurables. La punta usa un radio conservador de 0,59 m para abarcar el farol; el resto del cable usa 0,045 m. El cuerpo visual queda centrado en la punta. La flexión opcional se aproxima mediante distancias entre segundos vecinos (`bendCompliance`); no es un modelo de torsión ni una varilla Cosserat.

El paso global es 1/120 s, con un máximo de ocho pasos por llamada. La parte fraccionaria alimenta la interpolación visual. El exceso de tiempo se descarta y se cuenta en `droppedSeconds`; no hay recuperación ilimitada después de una pausa. `pause()` descarta el acumulador y las velocidades. `setAnchor(..., true)` traslada todo el estado al teletransportar, sin estirar la cadena desde su ubicación anterior. Los parámetros de reloj pueden elegirse al crear el sistema; no se cambia el paso según los FPS.

El juego ya limita el `dt` que entrega a WorldView: el tiempo descartado por ese límite previo no pertenece al contador del solver. Para medir los tirones reales se conserva la telemetría de intervalos de render, que es independiente de la simulación.

## Colisiones y límites de exactitud

Los contactos se evalúan sobre segmentos con radio, no solo en sus extremos. La corrección unilateral reparte el desplazamiento según masas y coordenadas del punto de contacto. Los anclajes permanecen inmóviles. Se ajusta el estado anterior para evitar que la despenetración se transforme en una velocidad de rebote artificial. Fricción y restitución son aproximaciones estabilizadas, no un solver de impulsos rígidos con conservación completa del momento.

Para obstáculos se descarta primero la envolvente barrida de toda la cadena cuando no hay candidatos; los casos positivos conservan consultas por segmento. Se vuelve a consultar el índice después de cada iteración de restricciones. El volumen consultado incluye posiciones anteriores y actuales. El avance conservador evita que una partícula rápida atraviese una pared fina representada por una primitiva estática. No garantiza CCD completo de cápsulas que giran rápidamente ni de dos cadenas/obstáculos móviles que se cruzan entre pasos. Los contactos contra cajas usan una minimización acotada de 22 iteraciones; esfera, cápsula y plano tienen consultas analíticas. Las cajas admiten yaw, no una orientación 3D arbitraria. El escalado no uniforme se expresa como dimensiones del collider, no multiplicando arbitrariamente su distancia.

Autocolisión y colisión entre cadenas son opcionales, con grupos/máscaras y exclusión de vecinos topológicos hasta dos segmentos. Usan una instantánea de segmentos y acumulación Jacobi: los puntos no se mueven mientras se consulta ese índice. Las correcciones se aplican juntas y los contactos que crean se atienden en el siguiente subpaso. No garantizan desenredar instantáneamente un nudo denso ni conservar exactamente la longitud después de una proyección entre cadenas. Están desactivadas en los faroles, que están separados físicamente.

El adaptador opcional `terrainHeight` devuelve soporte vertical o `null`. No se presenta como SDF euclidiano y no representa cavernas, puentes superpuestos ni paredes verticales. Los faroles actuales interactúan con la cápsula de Santi; no se reconstruyó una segunda geometría física completa de cada galería para ellos. Las superficies del personaje siguen consultando el sistema original.

`measureResiduals()` permite medir penetración residual contra primitivas y error de longitud fuera de la ruta normal de producción. `maxPenetration` en las métricas de un frame registra la mayor penetración encontrada antes de proyectar, no el error residual final. Esa diferencia se mantiene en los archivos de benchmark.

## Gestión de trabajo y memoria

La región habilita o suspende grupos. Dentro del sistema, el foco determina relevancia: calidad alta hasta aproximadamente 60 m, reducida hasta 190 m y suspensión más lejos. Los umbrales de regreso son 45 y 160 m para evitar cambios continuos en el borde. No se reduce el número de partículas al cambiar LOD; se mantiene la forma, se sincroniza el estado visual y se descarta velocidad acumulada. El regreso no recorre el tiempo omitido.

El límite inicial es de 128 cadenas decorativas activas. Un promedio suavizado del tiempo de simulación ajusta ese límite cada 0,2 s hacia un presupuesto de 2 ms, con márgenes de subida/bajada distintos. Es un objetivo blando: no interrumpe un subpaso a la mitad ni garantiza dos milisegundos en cualquier equipo. Las cadenas `critical: true` no se suspenden por distancia ni por presupuesto decorativo. La selección usa distancia, habilitación regional y criticidad; todavía no usa tamaño en pantalla u oclusión individual.

El sueño se activa tras 1,5 s con velocidad pequeña. Cambios de viento, impulso, anclaje, LOD u obstáculos cercanos lo interrumpen. El presupuesto no elimina colisiones del personaje: el sistema de árboles sigue consultando todos los candidatos relevantes.

Los buffers físicos ocupan 160 bytes por partícula sin colisiones entre cadenas y 192 con ellas. Esto no incluye objetos JS, celdas del índice, buffers de dibujo ni recursos de Babylon. Los seis cables exteriores suman 5.760 bytes de buffers físicos; los siete interiores añaden 6.720. No se reserva un pool de miles de entidades que no existen en el nivel. La retirada elimina las referencias, incluidos los registros auxiliares usados por contactos entre cadenas.

No se afirma «cero asignaciones»: las claves de celdas son cadenas y el índice usa Map/Set; el streaming crea/elimina entradas y Babylon gestiona sus propias asignaciones. Los buffers de partículas, curvas, vértices y normales se reutilizan; los bucles principales no crean Vector3 por partícula ni matrices/meshes por segmento.

## Reconstrucción y dibujo

Cada cable tiene seis puntos simulados y 25 anillos visuales de seis lados. Los faroles de un grupo comparten otra malla. Se actualizan posiciones, normales y límites de las mallas; no se mantienen bounds del estado inicial. Los materiales y luces regionales existentes se comparten. No hay una nueva luz dinámica por farol.

La opción elegida es CPU con buffers persistentes porque hay como máximo 13 faroles registrados y normalmente solo uno o dos grupos relevantes. No se añadió un shader de deformación ni una variante GPU sin medir. La medición de reconstrucción de curvas escala a miles de entidades en el benchmark; el coste real de reconstruir y subir vértices se mide en navegador con la integración pequeña. Si un futuro caso necesita cientos de cables visibles simultáneos, debe compararse esa subida con un atlas de puntos en textura y deformación GPU, incluyendo normales, bounds y sombras. Thin instances por sí solas no deforman una cadena.

Para desactivar la simulación secundaria desde la carga: `?secondaryPhysics=0`. Los faroles permanecen visibles. El índice de árboles tiene `useSpatialIndex`; desactivarlo conserva las consultas directas contra mallas y únicamente cambia la búsqueda de candidatos. El script de benchmark conserva aparte la ruta antigua de recorrido de escena para poder repetir la comparación completa.

## Validación reproducible

```sh
npm run test:physics
npm run test:vegetation
npm run test:traversal
npm run test:telemetry
npm run test:routes
npm run check
npm run build
npm run bench:physics
```

`test:physics` comprueba consultas aleatorias del hash frente a búsqueda exhaustiva, negativos, multicelda, objetos grandes, movimientos/eliminaciones, entradas inválidas, SDF, cajas rotadas, segmentos cruzados/paralelos/degenerados, paredes finas, cuatro modos, masas distintas, anclajes, compliance, colapso de restricciones, igualdad a 30/144 FPS, pausa, teletransporte, suspensión/regreso, despertar, prioridad crítica y geometría finita.

La prueba de integración se ejecuta en `tests/landscape-review.html`, que utiliza una partida efímera. Desde su consola:

```js
const { verifySecondaryDynamics } = await import('/tests/physics.browser.mjs');
verifySecondaryDynamics(review.world);
review.verifyRoutes();
```

Estas verificaciones detienen el render para avanzar pasos deterministas; recargar reanuda la vista. Se comprobaron visualmente los faroles en una entrada y se verificaron veinte recorridos/apoyos/salidas de puentes y galerías, además de las pruebas nuevas. El JSON `artifacts/physics/browser.json` conserva resultados y versión del navegador. Doce visitas al interior dejaron exactamente los mismos recuentos de mallas, geometrías, materiales, texturas, luces y cadenas. Esto comprueba ese ciclo de vida; no es una medición de toda la RAM de Chrome ni prueba que no exista otra fuga en el juego.

## Mediciones y lectura correcta

Equipo local: Intel Core i7-8700K, Node 22.12.0 y Babylon 9.32.0. Los scripts registran fecha y condiciones. Los ensayos CPU no incluyen GPU, vsync, dibujado del mundo o memoria del proceso Chrome. No se convierten contactos evitados en una promesa de FPS.

- A existente: consultas de árboles antes/después, escena de 4.171 mallas, 169 colliders locales, 3.000 consultas de calentamiento y 12.000 medidas. Se conserva la captura original anterior a las modificaciones (`tree-before.json`) y una ruta reproducible `--legacy`.
- B: cadenas reducidas con búsqueda exhaustiva de primitivas.
- C: las mismas cadenas y parámetros con hash espacial.
- D: reconstrucción CPU remuestreada, medida separadamente. No existe una comparación GPU ni un motor rígido equivalente anterior; no se inventa esa columna.
- E: índice, LOD y presupuesto de trabajo. Cambia cuántas cadenas se simulan: hay que leer el coste junto a `active`, `culled` y los errores.

`chains.json` contiene 10, 100, 500, 1.000 y 2.000 cadenas, distribución dispersa y concentrada, seis partículas, tres iteraciones, 16 esferas estáticas y 120 Hz. Dos ejecuciones por caso, cada una con 12 frames de calentamiento y 60 medidos. Guarda mediana/P95/P99, tiempos por fase, candidatos, tests, contactos, buffers, errores y reconstrucción. El ensayo entre cadenas es distinto: `segment-pairs.json` mide instantáneas de cápsulas, verifica los mismos contactos contra búsqueda exhaustiva y expone el peor caso de concentración. No debe confundirse con una simulación de 2.000 cuerdas entrelazadas con respuesta física completa.

### Resultados locales (8 de noviembre de 2026)

Tiempos en ms por frame de simulación de 1/60 s; mediana / P95. La curva y la cantidad activa de E se muestran separadas.

| Cadenas | Distribución | B exhaustivo | C índice | E con LOD y presupuesto | Activas E al final | Curva E mediana |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 10 | Dispersa | 1.01 / 2.00 | 0.24 / 0.49 | 0.12 / 0.29 | 6 | 0.04 |
| 10 | Concentrada | 0.99 / 1.65 | 0.13 / 0.28 | 0.08 / 0.17 | 10 | 0.07 |
| 100 | Dispersa | 9.76 / 12.88 | 1.04 / 1.82 | 0.90 / 1.60 | 86 | 0.67 |
| 100 | Concentrada | 10.09 / 14.22 | 1.27 / 2.74 | 1.26 / 2.12 | 100 | 0.68 |
| 500 | Dispersa | 50.25 / 61.96 | 5.37 / 8.05 | 1.75 / 2.82 | 128 | 0.87 |
| 500 | Concentrada | 50.30 / 57.75 | 9.58 / 12.95 | 3.84 / 5.24 | 55 | 0.60 |
| 1000 | Dispersa | 99.85 / 117.07 | 11.55 / 14.87 | 2.18 / 3.40 | 108 | 0.93 |
| 1000 | Concentrada | 102.12 / 115.11 | 18.95 / 24.65 | 4.54 / 6.86 | 55 | 0.61 |
| 2000 | Dispersa | 203.74 / 229.56 | 23.83 / 29.32 | 2.87 / 4.79 | 65 | 0.80 |
| 2000 | Concentrada | 234.46 / 311.44 | 29.71 / 52.68 | 5.28 / 7.90 | 55 | 0.69 |

En estos ensayos, el máximo error de longitud fue 1.261 mm. La mayor penetración residual final contra primitivas fue 1.74e-10 m. Corresponden al escenario de primitivas estáticas descrito, no a nudos de cuerdas con colisión mutua.

Con 2.000 cadenas, C supera el presupuesto habitual de un frame antes de sumar curvas y render del mundo. E reduce trabajo decorativo y conserva suspendida la forma de las restantes; no equivale a simular las 2.000 con plena calidad. Los 2 ms son un objetivo blando; recorrer y medir miles de registros también tiene coste.

| Consulta de árboles | Mediana (ms) | P95 (ms) |
| --- | ---: | ---: |
| Captura original antes del cambio | 0.1242 | 0.1431 |
| Ruta anterior repetida con --legacy | 0.0639 | 0.0770 |
| Índice + rayos directos | 0.0179 | 0.0288 |

Ambas rutas entregaron el mismo checksum de impactos. En la repetición comparada, la mediana fue 3.58 veces menor. La diferencia entre capturas de la ruta anterior muestra por qué no se usa una sola cifra como garantía para cualquier sesión.

| 2.000 cápsulas, instantánea | Sin índice (ms) | Con índice (ms) | Tests sin / con índice | Contactos iguales |
| --- | ---: | ---: | ---: | ---: |
| sparse | 920.91 | 4.26 | 1999000 / 0 | 0 |
| dense | 1057.65 | 1718.28 | 1999000 / 1983063 | 1939659 |

En concentración extrema el hash es más lento: casi todos los pares siguen siendo candidatos y se suma el coste del índice. No se oculta este resultado ni se propone habilitar colisión mutua indiscriminadamente.

En navegador, los faroles midieron 0,30 ms de mediana y 0,60 ms de P95 para solver y geometría, con render detenido para avanzar pasos deterministas. No incluye un frame completo de dibujo. Pasaron las 25 verificaciones de recorridos y física secundaria.

## Próximos candidatos, condicionados a medición

1. Accesorios blandos y vegetación grande cercana con pocos huesos/puntos: compartir el scheduler y conservar shader para la distancia.
2. Índice para rocas solo si el perfil muestra coste de buscar colliders, separándolo del coste de intersectar triángulos y de cargar assets.
3. Atlas de curvas GPU si aparecen cientos de cables realmente visibles; primero medir subida de buffers y coste de render.
4. CCD de cápsulas móviles, fricción con restricciones acumuladas y contactos más convergentes antes de convertir cuerdas en mecánicas de balanceo, agarre o soporte del jugador.
5. Workers únicamente si la simulación medida sigue dominando después de limitar DOF y trabajo; el coste de transferir/sincronizar buffers debe incluirse.

## Fuentes técnicas consultadas

- [XPBD, Macklin y colaboradores, 2016](https://matthias-research.github.io/pages/publications/XPBD.pdf): compliance y multiplicadores acumulados por paso.
- [Small Steps in Physics Simulation, 2019](https://matthias-research.github.io/pages/publications/smallsteps.pdf): análisis de subpasos; se adopta un reloj fijo con coste acotado, no una equivalencia universal entre iteraciones y subpasos.
- [PositionBasedDynamics](https://github.com/InteractiveComputerGraphics/PositionBasedDynamics): referencia de modelos y alcance; no se añadió como dependencia.
- [GPU Gems 3, capítulo 32](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-32-broad-phase-collision-detection-cuda): separación broad/narrow, cobertura multicelda y duplicados. La implementación de Auralia es CPU; no usa CUDA.
- [Babylon.js, Thin Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances): costes de objetos y limitaciones del dibujo agrupado. Aquí se eligieron mallas deformables agrupadas porque una matriz por instancia no reconstruye una cuerda curva.

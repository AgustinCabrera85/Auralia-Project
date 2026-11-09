# Doce Coronas · Fase A: línea base del piloto de Brisalia

Fecha: 2026-11-09. Estado: diagnóstico y plan técnico; ninguna de las 122 RF queda validada por este documento.

## Alcance y fuentes

Esta fase responde al primer encargo de `Auralia_Doce_Coronas_Especificacion_Funcional/04_Implementacion_Codex/PROMPT_COPIAR_EN_CODEX.md`, dentro de `F:\PROYECTO AURALIA\REQUERIMIENTOS Y DISEÑO FUNCIONAL`. El paquete es una propuesta de ampliación. El relieve P0/P1 descrito en [PILOTO_VALLE_FAROLES.md](PILOTO_VALLE_FAROLES.md) precede a esta revisión; sus capturas y recorridos no prueban por sí solos la aceptación de las nuevas RF.

Se inspeccionó `main` en `510b2f3`. El árbol de trabajo ya tenía cambios sin confirmar en hidrología, laguna, óptica submarina, rutas, Santi y pruebas. No se tocaron esos cambios ni el mundo editable. `src/world/terrainData.ts` tiene `skip-worktree`, de modo que el estado Git ordinario puede omitir diferencias de ese archivo. Antes de modificar el terreno hay que contrastar el contenido en disco, no sólo `git diff`.

## Punto de integración del relieve

`sampleMainlandHeight(x,z)` en [terrainData.ts](../src/world/terrainData.ts) es la altura canónica. En el área heredada conserva la base histórica y, después, aplica en orden `applyRegionalRelief` → `applyLandscapeRelief` → `applyGeographicRelief` → `applyGeologyRelief` → `applyLagoonRelief` → `applyHeightEdits`. La última operación mantiene las ediciones del mundo. Fuera de la base heredada se calcula el relieve continental y se usa la misma cadena de ajustes.

[regionalReliefData.ts](../src/world/regionalReliefData.ts) define una influencia acotada para cuenca, lomas, garganta y meseta; [regionalRelief.ts](../src/world/regionalRelief.ts) protege el núcleo habitado, sitios históricos, cauces, lagos y caminos mediante transiciones suaves. Los perfiles de acceso modifican el mismo muestreo de altura, sin malla física separada. `TerrainStream`, `GeographyStream`, colisiones, vegetación y apoyos de objetos consultan ese terreno. La grilla cercana sigue siendo de 6 m (72 m / 12 divisiones), con radios near/mid/far de 252/720/1700 m.

La geografía existente está en `geographicFeatures.ts`, `geologyData.ts`, `lagoonData.ts` y `TerrainStream.ts`; las ediciones persistidas se aplican desde `WorldEditState.ts`. `RegionCatalog.ts` ya enumera 12 territorios con nombre de reino, polígonos y necesidades de assets. Eso todavía no proporciona el catálogo completo de soberanos, asentamientos, mazmorras y misiones de la nueva especificación. Las seis categorías de bioma de `terrainData.ts` siguen siendo otra dimensión del mundo.

## Anclas que no deben desplazarse en silencio

Las alturas anteriores al piloto proceden de [brisalia-relief-baseline.json](../tests/fixtures/brisalia-relief-baseline.json). `Y` es altura canónica y `apoyo` es la interpolación del terreno cercano bajo el punto. Se compararon con el muestreo actual compilado de este árbol; las cifras se redondean a 0,001 m.

| Ancla | X | Z | Y anterior | Apoyo anterior | Y actual | Apoyo actual | Acceso / control necesario |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Brisalia | 0 | −23 | 8,405 | 8,406 | 8,405 | 8,406 | Núcleo y plaza; conservar conexión con hogar y senderos. |
| Claro del Hogar | −29 | 18 | 7,601 | 7,605 | 7,601 | 7,605 | Parcela y estructuras guardadas; preservar superficie de apoyo. |
| Embarcadero | 33 | 120 | 1,411 | 1,403 | 1,411 | 1,403 | Acceso al viaje marítimo. |
| Lindebrumas | −350 | −285 | 17,352 | 17,353 | 17,352 | 17,353 | Acceso occidental existente. |
| Altapiedra | −275 | −535 | 42,668 | 42,661 | 42,668 | 42,661 | Paso hacia las sierras. |
| Nácar | 245 | −250 | 5,032 | 5,035 | 5,032 | 5,035 | Orilla y ruta oriental. |
| Altaluz | 200 | −660 | 50,081 | 50,078 | 50,081 | 50,078 | Mirador y ruta de altura. |
| Cueva Antigua | −300 | −640 | 31,024 | 31,026 | 31,233 | 31,244 | Entrada de galerías; el trabajo local de laguna modifica este apoyo en unos 0,22 m. Requiere regresión antes de aceptar compatibilidad. |
| Cascada | 470 | −1005 | 18,676 | 18,589 | 18,676 | 18,589 | Agua y cuatro assets editados cercanos; revisar las uniones. |

La referencia incluye otras 321 muestras de caminos, 525 del núcleo y 12 exteriores. La prueba de [regional-relief.test.cjs](../tests/regional-relief.test.cjs) carga un guardado v1 con una pared en el hogar, pero no examina las partidas privadas del usuario. El mundo editable versionado contiene 152 ediciones de altura, 4 assets junto a la cascada y 2 aguas. El plano de anclas debe ampliarse con cualquier construcción real de una partida anterior antes de una migración de relieve.

## Circuito piloto y zonas de influencia

El circuito a evaluar es Claro del Hogar → Brisalia → cuenca de Cerezos → ribera de la garganta → meseta → regreso alternativo. La cuenca de Cerezos se observa en torno a `(−20, −215)`, la ribera alta en `(90, −260)` y el mirador de la meseta en `(−270, −95)`. Son puntos de revisión del relieve, **no** ubicaciones definitivas de Cerezal, un castillo o una mazmorra.

La influencia regional actual está limitada aproximadamente a `X −480…240`, `Z −490…160`, con 60 m de mezcla en el borde. El núcleo `X −125…125`, `Z −125…170` conserva su apoyo con margen y mezcla. La meseta tiene dos perfiles transitables: ascenso principal desde `(−142, −92)` por el sur y retorno alternativo hacia la cuenca desde `(−165, −170)`. Las rutas exactas y sus puntos de control están en `FAROLES_RELIEF.approaches`; la identificación visual, los caminos terminados y el contenido de los asentamientos corresponden a etapas posteriores.

La prueba histórica del piloto documenta unos 30 s de ascenso principal y 12,5 s por la alternativa en navegador. Esos tiempos no se repitieron sobre el árbol local actual. Faltan recorrido completo hogar–meseta–hogar, sprint, vistas comparables y prueba con partida real anterior.

## Cambios siguientes por archivo y RF

| Etapa | Archivos a intervenir | RF y comprobación antes de aceptar |
| --- | --- | --- |
| Compatibilidad P0 | `terrainData.ts`, `regionalReliefData.ts`, `regionalRelief.ts`, `tests/fixtures/brisalia-relief-baseline.json`, `tests/regional-relief.test.cjs` | RF-0005, RF-0006, RF-0025, RF-0026, RF-0030: comparar anclas, apoyos, accesos, continuidad y saves; resolver la divergencia de Cueva Antigua. |
| Agua y suelo P2 | `geographicFeatures.ts`, `lagoonData.ts`, `GeographyStream.ts`, `src/world/water/*`, pruebas de geografía/laguna y navegador | RF-0008, RF-0029: cauce descendente, unión río–cascada, puente y paso alternativo sin atravesar el suelo. Los cambios locales en curso deben cerrarse y medirse primero. |
| Ecología y rutas P3 | `vegetationData.ts`, `VegetationSystem.ts`, `expansionBiomeData.ts`, `RegionCatalog.ts`, `worldPropsData.ts` | RF-0009, RF-0010, RF-0019, RF-0027, RF-0028, RF-0031: distinguir hábitats y recorridos sin bloquear accesos ni subir el coste de forma sostenida. |
| Contenido P4 | `pointsOfInterest.ts`, `assetCatalog.ts`, sistemas de assets/props, datos de mundo y guardado | RF-0011, RF-0012, RF-0014, RF-0015, RF-0032–RF-0036, RF-0040–RF-0044: una capital, una aldea y una cueva pequeña antes de ampliar las doce regiones. |
| Validación P5 | pruebas de streaming, traversal, guardados, navegador, capturas y telemetría | RF-0007, RF-0021, RF-0023, RF-0024, RF-0037, RF-0038: recorridos repetidos, carga/descarga, memoria de proceso, p95/p99 y comparación visual bajo las mismas condiciones. |

## Riesgos y puertas de decisión

1. Las pruebas del relieve usan una referencia capturada antes de los cambios locales de cuenca y laguna. Una diferencia deliberada necesita ancla nueva, efecto sobre guardados y evidencia visual; no se corrige rebajando un umbral para que la suite pase.
2. El cauce, el puente y la gruta comparten alturas con el terreno. Cualquier modificación de `lagoonData.ts` o `geographicFeatures.ts` exige repetir colisiones, salida de interiores y unión de agua near/far.
3. El soporte de 6 m representa las macroformas, pero los detalles angostos de garganta o acantilado requerirían refinamiento local. No crear una malla decorativa que contradiga el suelo físico.
4. Los IDs y coordenadas de lugares, recursos y estructuras guardadas deben conservarse. Una reubicación requiere migración versionada y prueba con save previo.
5. La referencia de rendimiento de optimización se midió con el árbol local y una escena aislada; el SHA de Git no identifica por sí solo ese ejecutable. Comparar capturas y telemetría con idéntica cámara, clima, calidad, resolución y ruta.

## Seguimiento de RF

La matriz CSV y `requerimientos.json` del paquete contienen 122 RF. Se actualizaron RF-0005, RF-0006, RF-0023, RF-0024, RF-0025, RF-0026, RF-0030 y RF-0038 a `En desarrollo`, cada una con referencia a esta evidencia. Las otras 114 siguen `Propuesto`. Ninguna pasa a `Validado`: las pruebas y recorridos pendientes impiden afirmar aceptación jugable.

## Verificación de este árbol

| Comando ejecutado | Resultado observado |
| --- | --- |
| `npm run check` | Código 0; TypeScript pasa. |
| `npm test` | Código 1. Pasan clima, cielo, resolución, Santi, dominio, construcción, atlas y `geography.test.cjs`; se detiene en `regional-relief.test.cjs:21`. En `(-1200,-1000)` la elevación frente a la referencia es **21,298 m**, inferior al umbral de **más de 25 m** que exige esa prueba. No se redujo el umbral. |
| `npm run build` | Primera ejecución bloqueada por el entorno al iniciar esbuild (`spawn EPERM`); repetida con permiso de proceso hijo, código 0, 3258 módulos transformados. Vite advierte que el bundle principal supera 500 kB (7.848,07 kB). |
| `npm run test:stream` | Código 0. Cobertura, costuras, intercambio LOD, teletransporte y altura canónica pasan; inicialización **2451 ms**, cerca del límite de 2500 ms y no demostrada estable. |
| `npm run test:vegetation` | Código 0; instancias, liberación y recarga pasan. |
| `npm run test:lagoon` | Código 0; laguna, cascadas, nado y pruebas de cuenca pasan. |
| `npm run test:routes` | Código 0; catálogo territorial y rutas pasan. |
| `npm run test:traversal` | Código 0; salto, pendientes y controles pasan. |
| `npm run test:features` | Código 1. `geographic-features.test.cjs:163` espera que la cascada tenga material opaco con escritura de profundidad; el material actual informa `needAlphaBlending() === true`. Las pruebas posteriores de ese comando no se ejecutaron. |

La documentación previa del piloto refleja otro estado del árbol y no sustituye estos resultados. Faltan una ejecución completa de la suite, capturas actuales equivalentes y revisión en navegador del acceso a Cueva Antigua y del material de la cascada. No se declara ninguna RF validada.

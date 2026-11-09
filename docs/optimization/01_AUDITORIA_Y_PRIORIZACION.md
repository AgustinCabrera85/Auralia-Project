# 01 · Auditoría técnica del commit `b511d35`

**Tipo de auditoría:** lectura estática del repositorio remoto. No confundir hallazgos estáticos con resultados de ejecución. Las rutas son relativas a la raíz. **No modificar ni migrar** hasta superar los bloqueos P0.

## A. Evidencia de estado actual

| Subsistema | Evidencia inspeccionada | Situación observada | Implicación |
|---|---|---|---|
| Bucle general | `src/game/WorldView.ts` (constructor y `update`, aprox. líneas 283–306 y 1136–1307) | `Engine.runRenderLoop`, `dt` acotado a `0.045`, actualización secuencial de clima, movimiento, océano, física secundaria, terreno, vegetación, pasto, props, assets y agua | Un scheduler transversal puede reducir picos, pero no debe alterar órdenes de dependencia. |
| Telemetría | `src/game/GameTelemetry.ts`, `src/game/telemetryData.ts` | F8 / `?telemetry=1`, exportación JSON, fases CPU, draw calls, memoria JS aproximada, consulta GPU condicionada a soporte | **Extender**, no reemplazar. Distinguir tiempos de update, render y GPU asíncrona. |
| Física secundaria | `src/physics/{ChainDynamics,SpatialHash,DistanceFields,ChainCurve}.ts`, `src/world/HangingLanterns.ts` | Modos analytic/FTL/PBD/XPBD, colisiones locales, LOD, sleeping, presupuesto, curvas CPU, índices, pruebas | Ya implementada: el siguiente trabajo es de integración selectiva y verificación. |
| Colisión de árboles | `src/world/TreeColliderSystem.ts` | Índice espacial y rayos contra candidatos; mantiene mallas de colisión reales | No reemplazar la intersección con triángulos si cambia escalada/apoyos. |
| Colisión de rocas | `src/world/RockColliderSystem.ts` | Colliders locales de geometría irregular, selección mediante proximidad y rayos | Índice para rocas solo si el perfil revela costo de selección. |
| Terreno | `src/world/TerrainStream.ts`, `src/world/terrainLod.ts`, `src/world/terrainTileTopology.ts` | LOD near/mid/far; caché de alturas por actualización; cola de trabajo hasta 2 tiles y objetivo 4 ms; topología nueva y código viejo contradictorios | P0 de coherencia; después caché, colas y streaming. |
| Vegetación | `src/world/VegetationSystem.ts`, `src/world/AuraliaFoliageWind*`, `docs/FOLIAGE_V4.md` | Thin Instances, LOD de árboles, shader de viento; `refreshBuffers()` recompone matrices de instancias | Posible optimización por cambios/deltas, **no** cálculo de árboles físicos CPU. |
| Césped | `src/world/grass/{GrassSectorBake,GrassSectorSystem,GrassWindPlugin}.ts` | Bakes deterministas, matrices persistentes, actualizaciones al mover ventana de sectores, shader de movimiento | Conservar exactamente; optimizar buffers solo si se mide beneficio. |
| Props | `src/world/WorldPropSystem.ts` | Decoración thin-instanced, recursos interactivos separados, `refreshDecoration` crea matrices y arrays temporales, colliders de rocas | Candidato a caché por sector y reducción de reuploads. |
| Assets editables | Importaciones a `src/world/editor/` en varios sistemas | Directorio ausente en el árbol auditado | Bloquea build real y auditoría completa de V4, agua editable y materiales de editor. |
| Materiales de terreno | `src/world/materials/TerrainMaterial.ts`, `TerrainMaterialV2.ts`, `TerrainBiomeMaterial.ts`, `BiomeTextureArrays.ts` | Varias rutas de shader; `TerrainStream` está cableado a `TerrainMaterial.ts` en el archivo leído. La ruta Biome tiene arrays 2D en WebGL2 | Confirmar selector real, pruebas y números; no reemplazar materiales a ciegas. |
| Nubes | `src/world/climate/{SkyDome,CloudPieces,NoiseCloudShader}.ts` | Renderer por defecto `pieces` con atlas y shader; `?cloudRenderer=noise` experimental, `?cloudQuality=...` | Primero medir overdraw, texturas, fragment shader y carga; **no asumir** que hay raymarching volumétrico. |
| Lluvia/nieve | `src/world/climate/Precipitation.ts` | ParticleSystem CPU de capacidad 700 lluvia / 350 nieve | GPU Particles son opción **solo** si hay cuello de botella medido. |
| Agua | `src/world/{GeographyStream,LagoonSystem}.ts`, `src/world/water/*` | Shaders de flujo, texturas compartidas y aguas por región. `GeographyStream.update` genera hasta 2 mallas por llamada; `LagoonSystem` reparte río en pasos de 1,5 ms | Consolidar presupuestos, medir carga/CPU/GPU. No crear un solver de fluidos innecesario. |
| Construcción | `src/world/building/BuildVisuals.ts`, `src/domain/buildingRules.ts` | Reglas de colisión/soporte separadas de representación visual | Instancing/HLOD posibles para escenarios grandes sin alterar anclajes y guardado. |
| Santi | `src/game/SantiCharacter.ts`, `CharacterTraversalController.ts`, `docs/SANTI_CHARACTER.md` | Animaciones esqueléticas, 35 acciones NLA documentadas, nado y acciones | No tocar rig, morphs, root motion ni autoridad de locomoción durante optimizaciones gráficas. |
| Calidad | `src/game/renderResolution.ts` | `balanced` hasta 1920×1080, `performance` hasta 1600×900, `native`; hardware scaling independiente del CSS HUD | Base para calidad adaptativa, con selección manual siempre disponible. |

## B. Bloqueos y discrepancias que exigen resolución inmediata

### P0.1: faltan fuentes `src/world/editor/` en remoto

- El árbol de GitHub del commit auditado **no contiene** el directorio. Sin embargo `WorldView.ts` importa `AuthoredAssets`, `AuthoredWater`, `WorldEditState`, `LiveWaterProfiles`; `LagoonSystem.ts` importa `LiveWaterProfiles` y `AuraliaWaterProfiles`; `GrassSectorSystem.ts` y `GrassSectorBake.ts` importan `WorldEditState`.
- Acción de Codex: confirmar rama, SHA y `git status`; rastrear si está en el entorno local y no versionado; restaurar **archivos reales** desde fuente autorizada/historia o solicitar localización. No crear `export class AuthoredAssets {}` artificial para compilar.
- Cierre: `npm run check`, `npm run build`, pruebas y navegación del World Editor con esos módulos presentes.

### P0.2: topología del terreno incompatible

- `TerrainStream.ts` extrae `{..., skirtDepth}` de `TERRAIN_LOD_CONFIG`, y resta `skirtDepth` a Y en faldones near/mid/far.
- `terrainLod.ts` **no declara** `skirtDepth`.
- `terrainTileTopology.ts` implementa perímetro de 6 m compartido con refinamiento de caras de borde, pero **no aparece importado** por `TerrainStream.ts` en la revisión.
- `docs/LANDSCAPE_LOD.md` afirma que no se usan faldones; `docs/LAGUNA_Y_VERTIENTES.md` documenta faldones; `tests/terrain-stream.test.cjs` conserva comprobaciones de la ruta antigua.
- Acción: elegir topología activa consistente con terreno visible y colisión, migrar la creación de mallas si corresponde, reconciliar normales/pesos/seis canales y tests de parejas de LOD. No reintroducir `skirtDepth` como parche rápido ni ocultar grietas con faldones si la arquitectura elegida es perímetro compartido.
- Cierre: test de seams, checks TS, screenshots desde los mismos puntos, sin grietas, pliegues o superposiciones en todas las parejas de resolución y coordenadas negativas.

### P0.3: ruta activa de material por verificar

- El código consultado de `TerrainStream.ts` importa `createTerrainMaterial` desde `materials/TerrainMaterial.ts`.
- `TerrainBiomeMaterial.ts` contiene alternativa con `RawTexture2DArray` y `BiomeTextureArrays.ts`; puede ser un módulo aún no integrado. No asumir que ya está disponible en la escena.
- `tests/terrain-stream.test.cjs` todavía espera seis texturas del material anterior y vértices RGBA.
- Acción: confirmar importaciones de runtime, selector de materiales, WebGL fallback y tests; decidir el contrato de seis pesos si se activa nuevo material; documentar VRAM real frente a estimaciones.

### P0.4: cobertura insuficiente del benchmark integral

- `docs/FISICA_SECUNDARIA.md` ofrece mediciones CPU locales de física, pero no un benchmark sostenido de mundo real en GPU ni perfil de carga de escenas pesadas.
- `docs/LAGUNA_Y_VERTIENTES.md` señala una expectativa antigua fallida en `regional-relief.test.cjs` (sin ocultarla).
- Acción: establecer una línea base reproducible y distinguir fallos anteriores de nuevos. No declarar `npm test` satisfactorio sin ejecutarlo.

## C. Qué no hay que volver a implementar

- **XPBD/SpatialHash/SDF/ChainCurve:** ya están; no crear `ProceduralDynamicsSystemV2` sin justificación.
- **Pasto estático por sectores:** ya está horneado; no distribuirlo por frame, no cambiar sus posiciones con viento.
- **LOD del terreno y vegetación:** ya existen; evaluar continuidad/costo antes de ampliar.
- **Shared shaders y Thin Instances:** existen; inspeccionar sobrecarga de reconstrucción antes de introducir un segundo pipeline.
- **Flujo visual del agua:** ya existe; no plantear Navier–Stokes como prerequisito del render.
- **Medición de física:** ya existe; extender F8 para otros subsistemas.

## D. Análisis de la física secundaria existente

El documento `docs/FISICA_SECUNDARIA.md` registra 10, 100, 500, 1.000 y 2.000 cadenas, distribuciones dispersas y densas, 6 partículas por cadena, 3 iteraciones, 16 esferas y reloj de 120 Hz. Sobre ese equipo, el caso de 2.000 cadenas dispersas tuvo **mediana de ~203,74 ms** con búsqueda exhaustiva de primitivas y **~23,83 ms** con índice. **Eso no equivale a FPS de juego**: es tiempo de un frame de simulación en un benchmark CPU, sin escena ni GPU.

El índice espacial **empeora en concentración extrema**. En `segment-pairs.json`, para 2.000 cápsulas densas, el índice medido tardó ~1.718,28 ms frente a ~1.057,65 ms sin índice; casi dos millones de pares siguen siendo candidatos. Esto justifica habilitar pares inter-entidad solo cuando el gameplay lo necesite, usar máscaras y agrupar por relevancia. **No aplicar hashing automáticamente**.

Los faroles reales son 13 cadenas decorativas agrupadas; la deformación CPU con buffers persistentes es una decisión razonada, no evidencia de que se necesite GPU. El objetivo de 2 ms y límite de 128 cadenas son presupuestos blandos del scheduler secundario; no deben copiarse como objetivos de todos los subsistemas.

## E. Matriz priorizada de optimizaciones (hipótesis)

| ID | Técnica | Evidencia / candidato | Beneficio esperado | Riesgo | Prioridad / condición |
|---|---|---|---|---|---|
| O00 | Integridad/compilación y documentación | Editor ausente; terreno incompatible | Desbloquear medición y trabajo seguro | Alto si se parchea mal | **P0 obligatorio** |
| O01 | Baseline integral y telemetría por fase | F8 ya existe | Evitar optimizaciones a ciegas | Bajo | **P1 obligatorio** |
| O02 | Job scheduler cooperativo compartido | `TerrainStream` 4 ms, `LagoonSystem` 1,5 ms, `GeographyStream` 2 mallas | Menos picos CPU por trabajo concurrente | Medio (orden/dependencias) | P1 si hitches de generación |
| O03 | Caché de consultas de terreno / máscaras | `heightCache` se limpia cada `TerrainStream.update`; otros sistemas repiten alturas | Menos CPU de generación | Medio (invalidez) | P1 si muestras dominan |
| O04 | Actualizaciones de instancias por delta | `VegetationSystem.refreshBuffers`, `WorldPropSystem.refreshDecoration` crean arreglos/matrices | Menos allocations y transferencias | Medio (culling/bounds) | P1 si refrescos cuestan |
| O05 | Culling jerárquico / HLOD por grupo | Grandes conjuntos de árboles, V4, construcciones y rocas | Menos draw calls/triángulos/sombras | Alto (pop-in/colisiones) | P2 después de editor recuperado |
| O06 | Optimización de overdraw de foliage | Shader de hojas y miles de colocaciones V4 | Menor fragment time | Medio (silueta/estética) | P2 solo con GPU-bound confirmado |
| O07 | Compresión KTX2 / Meshopt | Fuentes 1K, GLB y datos de biomas | Menos VRAM/tráfico | Medio (calidad/decode) | P2 piloto representativo |
| O08 | Cielo: coste real del atlas y shader | `CloudPieces` default; ruido experimental | Menor GPU/carga | Medio-alto (forma/ghosting) | P2 medición y capturas |
| O09 | Agua: streaming, flujo y efectos | `LagoonSystem`, `GeographyStream`, `OceanWater` | Menos hitches, espuma/cáusticas eficientes | Alto (continuidad/nado) | P2 sin reescribir física |
| O10 | Streaming predictivo / cancelación | `TerrainStream.jobScore` ya prioriza dirección; otros usan colas | Menos aparición tardía y picos | Medio-alto | P2 después del scheduler |
| O11 | GPU Particles selectivas | Lluvia 700, nieve 350, rocío y burbujas pequeñas | Menos CPU al escalar efectos | Bajo-medio si no se usa | P3 sólo si se justifican volúmenes |
| O12 | Calidad adaptativa por cuello de botella | `renderResolution` manual y F8 | Mantener frame pacing | Alto si produce cambios molestos | P3 tras perf budgets |
| O13 | DOD / pools selectivos | Hotspots de matrices, instancias y registros | Menos GC y churn | Medio | P2 si allocations medidas |
| O14 | IA y navegación escalonada | No se verificó una infraestructura de miles de NPC en el código revisado | Escalabilidad futura | No prioritario ahora | **Diseño futuro**, no implementar a ciegas |
| O15 | Evolución de física secundaria | `ChainDynamics` ya implementado | Cuerdas/raíces futuras sin duplicación | Alto si se usa para gameplay crítico | P3, caso de uso real |

## F. Orden propuesto y puertas

- **Puerta G0:** checkout íntegro + compilación/tests base; reconciliación del terreno.
- **Puerta G1:** muestras de GPU/CPU y trazas de 4–5 escenarios representativos.
- **Puerta G2:** implementar el **único** primer candidato cuya mejora potencial se respalda por datos (normalmente scheduler o buffers por delta). Medir y decidir si consolidar o revertir.
- **Puerta G3:** escalar a HLOD, caché, materiales, nubes/agua por subsistema; una variable principal por benchmark.
- **Puerta G4:** opciones avanzadas (GPU/Workers/adaptativo) solo si la implementación simple no cumple.

## G. Guía para puntuar oportunidades

Utilizar una puntuación explícita de **hipótesis** (no un ranking automático de fallos):

- Impacto medido o potencial (0–5).
- Frecuencia del trabajo/recurrencia (0–5).
- Escalabilidad con número de entidades (0–5).
- Riesgo de alterar gameplay/arte (0–5; se resta).
- Dificultad e incertidumbre de implementación (0–5; se resta).
- Disponibilidad de benchmark/regresión automatizados (0–5).

Ejemplo: `score = 3*impacto + 2*frecuencia + 2*escalabilidad + 1*testabilidad - 3*riesgo - 2*incertidumbre`. No utilizar una puntuación inventada para omitir mediciones: sirve para ordenar investigación, no para demostrar beneficios.

## H. Estado de verificación

**Verificado leyendo fuentes:** existencia de archivos, importaciones, constantes, algoritmos y documentación citada. **Pendiente de confirmación por Codex:** que `npm run check` y `npm run build` compilen; que la topología renderizada corresponda a `terrainTileTopology`; que los shaders bioma se usen; que cifras del benchmark se reproduzcan; FPS y memoria GPU actuales en la escena del juego; contenido faltante del directorio del editor. No se modificó ningún archivo del repositorio.

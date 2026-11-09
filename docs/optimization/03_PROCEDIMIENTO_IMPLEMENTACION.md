# 03 · Procedimiento de implementación ultra detallado para Codex

**Objetivo:** ejecutar cambios incrementalmente en la arquitectura existente, con condiciones de entrada/salida, pruebas, mediciones y reversibilidad. **No** implementar todas las fases por obligación: la fase de análisis decide qué optimizaciones se justifican. Las fases 0 y 1 sí son obligatorias.

**Reglas de ejecución:** rama `main`; revisar `git status` antes de escribir; commits pequeños; conservar datos/persistencia y assets; no añadir dependencias sin justificar; no modificar pruebas para que un bug parezca resuelto; no declarar resultados no ejecutados. En cada commit de optimización incluir artefacto de comparación o explicar por qué no se pudo medir.

---

# Fase 0 · Restauración de integridad y línea base compilable

## Objetivo

No optimizar una versión que no corresponde a la composición real del proyecto. Resolver faltantes detectados en el árbol `b511d35`, especialmente editor y continuidad de terreno. Evitar intervenir sistemas artísticos durante la recuperación.

## Pasos obligatorios

1. Desde la raíz, ejecutar `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git ls-files src/world/editor`, `ls src/world/editor` (equivalente Windows). Guardar salida en informe local de auditoría. Confirmar si SHA coincide con el auditado; si no, registrar nuevo SHA y revisar diferencias antes de reutilizar números.
2. Ejecutar `npm ci` con lockfile actual y Node compatible, luego `npm run check`. Guardar el log **sin recortarlo**. No instalar manualmente paquetes para ocultar importaciones no resueltas.
3. Si faltan los módulos reales de `src/world/editor/`, localizar su fuente auténtica en el entorno actual/historial/autores. Recuperar `AuthoredAssets`, `AuthoredWater`, `WorldEditState`, `LiveWaterProfiles`, `AuraliaWaterProfiles` y las dependencias reales. No inventar clases vacías, mocks de producción ni `// @ts-ignore`.
4. Verificar que la carpeta esté versionada y que `WorldView`, `LagoonSystem`, `GrassSectorSystem`, `GrassSectorBake` y tests la resuelvan. Comparar `public/world/auralia-world.json` y editor con el formato esperado. No convertir ni borrar ubicaciones guardadas.
5. Revisar `src/world/terrainLod.ts`, `src/world/TerrainStream.ts`, `src/world/terrainTileTopology.ts` **juntos**. Decidir la geometría activa: topología con perímetro compartido sin faldones, si esa era la intención de la última revisión, o la variante antigua consistente. No conservar simultáneamente desestructuración de `skirtDepth` ausente y una segunda topología ignorada.
6. Si se activa `terrainTileTopology(lod)`, construir `positions`, `normals`, pesos y `indices` sobre `topology.offsets` en coordenadas globales, y transformar a locales restando el centro del tile. Preservar orden de winding de Babylon y diagonales de triangulación cercanas. No aumentar inadvertidamente subdivisiones interiores.
7. Confirmar que `nearTerrainHeightAt` y `nearTerrainSurfaceAt` representan **los mismos triángulos cercanos usados para colisiones**. Cualquier cambio de diagonales afectaría caminar, césped y ubicación de assets.
8. Cambiar test de continuidad solo para verificar el **comportamiento correcto adoptado**, no para relajar tolerancias sin motivo. Cubrir near/near, near/mid, near/far, mid/far, X/Z, coordenadas negativas y ausencia de caras verticales extrañas o solapamientos.
9. Reconciliar `docs/LANDSCAPE_LOD.md`, `docs/LAGUNA_Y_VERTIENTES.md` y `docs/ARQUITECTURA.md` con el código y los tests. Anotar el cambio de estrategia de perímetros con fecha y motivo.
10. Identificar ruta activa de material (`TerrainMaterial`, `TerrainMaterialV2`, `TerrainBiomeMaterial`) y compatibilidad WebGL/fallback. No activar el material nuevo en esta fase salvo que sea necesario para reparar una regresión; documentar qué camino usa el render en producción.
11. Ejecutar `npm run check`, `npm run build`, `npm run test:stream`, `npm run test:grass`, `npm run test:vegetation`, `npm run test:props`, `npm run test:routes`, `npm run test:lagoon`, `npm run test:physics`, `npm run test:traversal` y luego `npm test`. Guardar exit codes.
12. Si persiste el fallo documentado de `regional-relief.test.cjs`, demostrar que era preexistente mediante comparación con baseline. No corregirlo automáticamente desde este programa si no está relacionado con el objetivo. Registrar issue/tarea independiente.
13. Abrir el juego: inspeccionar llegada a Brisalia, Bosque Ilustrado, Altapiedra, laguna, entradas y salidas de grutas/puentes. Confirmar ausencia de grietas, barreras invisibles, material negro, assets ausentes y efectos visuales duplicados.

## Archivos prioritarios

`src/world/editor/*` (fuente auténtica), `src/world/{TerrainStream,terrainLod,terrainTileTopology}.ts`, `src/world/materials/*`, `src/game/WorldView.ts`, `tests/terrain-stream.test.cjs`, `tests/landscape-biomes.test.cjs`, docs de terreno/laguna.

## Criterio de cierre

TS/build compilables, tests base sin nuevas fallas, referencias de editor completas, una sola implementación real de topología y ruta de materiales identificada. **Si no puede restaurarse editor, detener las migraciones de rendimiento y documentar el bloqueo**. Es válido entregar la auditoría y la evidencia sin modificar código.

## Reversión

Revertir el commit de reparación si se detecta cambio de alturas, colisiones o pérdida de assets; recuperar la versión real original. No intentar una reversión que elimine mundo editable.

---

# Fase 1 · Captura de la línea base y mapa de costos

## Objetivo

Conocer el costo real de la escena completa. La documentación de física contiene benchmarks CPU específicos, pero no es una medición de toda la ejecución.

## Procedimiento

1. Identificar hardware, OS, navegador y versión, backend `WebGL`, DPR, resolución de canvas, render quality (`balanced`), número de CPU cores si está disponible, RAM aproximada y GPU identificable por herramientas oficiales. **Nunca incluir datos personales** en el artefacto.
2. Fijar commit SHA, seed, posición, orientación de cámara, FOV/zoom, clima, hora del día, inventario/guardado de prueba y estado de efectos. No modificar el guardado real del usuario: reutilizar `tests/landscape-review.html` o una partida efímera.
3. Seleccionar escenas de referencia: (A) Brisalia `(1,10)`; (B) Bosque Ilustrado `(-730,-420)`; (C) Pradera Florida `(-790,-510)`; (D) laguna `(-160,-810)`; (E) Altapiedra `(-275,-535)`; (F) interior subterráneo con transición. Validar superficies reales y alturas al posicionar el jugador; los pares son **referencias X/Z**, no coordenadas 3D directas.
4. Medir al menos: escena estable, movimiento a través de varios sectores, teletransporte y vuelta, cambio de clima, activar/desactivar nubes, entrar y salir de interior, nado/submersión, y cambio de calidad.
5. Para escenas estables: calentar recursos/shaders, medir una ventana mínima definida (por ejemplo 30 s), repetir ≥3 veces. Para cargas: medir desde acción inicial hasta convergencia con `pendingCount=0` o condición equivalente; separar cold load y warm load.
6. Registrar `frameMs` (intervalo), `updateMs`, `renderMs`, GPU si se soporta, `cameraMs`, `activeMeshesMs`, triángulos, draw calls, pendientes de terreno/asset, total de mallas/materiales/texturas y memoria JS aproximada si existe API. Capturar **p50, p95, p99 y máximos**, no solo FPS promedio.
7. Medir fases existentes de `GameTelemetry` (`clima`, `movimiento`, `oceano`, `dinamica`, `terreno`, `vegetacion`, `pasto`, `props`, `assets`, `agua`, `ui`). Si un bloque domina, instrumentar subfases **locales y opcionales** antes de diseñar cambios.
8. Tomar screenshots A/B en mismas coordenadas y clima. Si se dispone de herramienta de capturas automatizadas, guardar metadatos de tamaño/fecha; de lo contrario documentar procedimiento manual reproducible.
9. Identificar clasificación del cuello: CPU update, scene submission, GPU fragment/fill-rate, GPU geometry/shadow, IO/decode o memoria/GC. No utilizar tiempo de GPU asíncrono como si coincidiera exactamente con el mismo frame de CPU.
10. Crear `artifacts/optimization/baseline-<sha>.json` y un resumen legible con las condiciones. El archivo debe contener **datos realmente capturados**; `null` para métricas no soportadas.
11. Definir qué hipótesis se comprobará primero. No avanzar a implementación de técnicas cuyo costo no aparezca en el perfil sin una razón de escalabilidad documentada.

### Esquema de captura sugerido

```ts
interface BenchmarkCapture {
  schemaVersion: 1;
  commit: string;
  scenario: string;
  browser: string;
  engine: string;
  canvas: {width:number;height:number;dpr:number;quality:string};
  scene: {x:number;z:number;cameraAlpha:number;cameraBeta:number;cameraRadius:number;
          climate:string;worldStateId:string};
  warmupFrames: number;
  measuredFrames: number;
  metrics: Record<string,{p50:number|null;p95:number|null;p99:number|null;max:number|null}>;
  counts: Record<string,number|null>;
  notes: string[];
}
```

## Criterio de cierre

Existe una línea base repetible con al menos escenas extremas de CPU y GPU, exportación utilizable y metodología documentada. No presuponer que un benchmark de física equivale a FPS global.

---

# Fase 2 · Extender telemetría sin añadir overhead significativo

## Objetivo

Observar job scheduling, actualizaciones de instancias, cachés, GPU uploads y memoria de forma consistente con F8.

## Pasos

1. Extender `src/game/GameTelemetry.ts` y `src/game/telemetryData.ts`, respetando buffer circular actual y export JSON existente. No añadir un segundo overlay flotante con otras métricas incompatibles.
2. Agregar contadores **agregados** por frame: `jobsQueued`, `jobsExecuted`, `jobsCancelled`, `jobsOverBudget`, `jobTimeMs`, `terrainCacheHits`, `terrainCacheMisses`, `instanceMatricesRebuilt`, `instanceUploadBytes`, `visibleClusters`, `culledClusters`, `assetReadyMs`, `gpuMs` (null si no disponible).
3. Mantener costo próximo a cero con telemetría desactivada; sampling en intervalos regulares para métricas caras. No crear arrays, strings u objetos en el loop hot únicamente para dibujar el debug.
4. Especificar **unidades** y semántica: por frame, acumulado o ventana. Exportar versión del schema para que herramientas anteriores no interpreten mal campos nuevos.
5. Integrar marks en puntos concretos de `WorldView.update`, `TerrainStream.update`, `LagoonSystem.update`, `VegetationSystem.refreshBuffers` y `WorldPropSystem.refreshDecoration` únicamente donde se midan cargas.
6. Registrar el propio overhead del profiler comparando misma escena con F8 apagado/encendido. Si la diferencia es significativa, reducir frecuencia de sampling.
7. Añadir test de exportación y de capacidad/rotación del buffer, usando `tests/telemetry.test.cjs` y pruebas de browser donde corresponda.

## Cierre

La telemetría permite atribuir cada mejora a su componente, y las métricas ausentes se muestran como no disponibles, no como cero.

---

# Fase 3 · Scheduler de generación cooperativa

## Condición de entrada

Los hitches coinciden con varias operaciones de generación/carga o con `TerrainStream`/`GeographyStream`/`LagoonSystem`. Si el perfil no revela esos problemas, posponer fase.

## Diseño mínimo

Proponer `src/performance/WorldJobScheduler.ts` y `tests/world-job-scheduler.test.cjs`, o adaptar infraestructura existente si Codex detecta una mejor ubicación. El scheduler es **cooperativo**: los pasos largos deben dividirse desde cada productor.

### Pasos de implementación

1. Definir `WorldJob` con `id`, `owner`, `priority`, `regionKey`, `generation`, `step`, `cancel`, `resourceClass` y, si corresponde, `deps`.
2. Implementar conjunto de IDs activos para evitar duplicados, cola por prioridad y envejecimiento. Mantener orden determinista con empate por número de registro.
3. Hacer `tick(budgetMs, now)` una única vez por frame en `WorldView` después del movimiento crítico. **No cambiar** el momento del `climate.update` ni las consultas de Santi.
4. Adaptar `TerrainStream`: separar `refreshTargets()` (sincrónico cuando se cruza sector) de generación de mallas (jobs). Conservar fallback lejano y reemplazo en grupos completos. No permitir que al agotarse el presupuesto deje un agujero bajo el jugador.
5. Migrar la generación incremental de `LagoonSystem` (generador `buildRivers`) al mismo presupuesto **sin modificar** el número de vértices ni las uniones entre río/cascada. Registrar carga del interior por separado; transiciones E deben ser correctas.
6. Adaptar `GeographyStream` de manera incremental. Su cola ya genera dos mallas por update; marcar la generación como trabajo aplazable y dar prioridad más alta al agua cercana/interactiva.
7. **Después** de medir, integrar `WorldPropSystem`/`VegetationSystem` solo si sus refrescos son costosos. Evitar que los métodos de dibujo temporalmente hagan staging de muchos GLB en un solo paso.
8. Incluir prioridad basada en distancia y velocidad del jugador, distinguiendo mirada de movimiento. Prevenir starvation: una tarea de fondo no puede quedarse indefinidamente pendiente cuando el jugador está quieto.
9. Añadir cancelación por `generation` o versión del mundo. Un job cancelado no debe crear mesh ni escribir buffer tarde. Si un paso creó recursos transitorios, disponerlos.
10. Cada productor debe aceptar un presupuesto y producir una unidad segura de trabajo. Una malla muy costosa debe dividir su cálculo CPU o enviarse a Worker opcional; el scheduler no interrumpe JS síncrono.
11. Agregar pruebas con reloj simulado: prioridades, idempotencia, cancelación, expiración, starvation, `yield`, dependencias, teletransporte, error de paso, dispose y uso después de dispose.
12. Registrar histograma p95 de tiempo de trabajo por frame antes/después y tiempo de convergencia de escena. Detectar si se transfirió el costo desde CPU a aparición tardía.

### Pseudocódigo de integración

```ts
// ESQUEMA, adaptar a interfaces existentes.
function updateWorld(dt:number):void {
  updateCriticalGameplay(dt);        // entrada, traversal, colisiones
  syncRegionTargets();              // posiciones, IDs, deseados
  scheduler.tick(computedBudgetMs); // generación decorativa y preparativos
  updateVisualUniforms(dt);         // no bloquear render
}
```

**Invariante:** nunca mover el único terreno transitable detrás de un trabajo decorativo. Prioridad y presupuesto se definen con perfiles; no fijar los 4 ms + 1,5 ms anteriores como una suma obligatoria.

## Cierre

Se reducen p95/p99 o long tasks sin aumentar de forma inaceptable el tiempo de carga visible. Tests y screenshots de continuidad OK.

---

# Fase 4 · Caché regional de consultas de terreno

## Condición de entrada

La traza evidencia gasto repetido en `sampleMainlandHeight`, consultas de orilla, pendientes o pesos por sector. Si la caché no alcanza un hit rate útil o genera más overhead que computación, revertir.

## Pasos

1. Inventariar todas las rutas de muestreo (terrain, grass bake, vegetation, world props, water, colliders, footprint). Anotar coordenadas y grid de cada consumidor.
2. Medir el número de consultas totales y únicas por generación de sector. Distinguir `heightAtGrid` de `nearTerrainHeightAt` y cálculos de material/bioma.
3. Crear módulo pequeño, por ejemplo `src/world/TerrainQueryCache.ts`, con `getCanonicalHeight(gx,gz,revision)` y opcional `getNearSurface(x,z,revision)` cuando se compruebe que compartirla no cambia precisión.
4. Clavear puntos exactos por índices enteros **solo donde las muestras caigan en grilla estable**. Mantener ruta directa para posiciones arbitrarias o introducción de parámetros especiales.
5. Definir límites de memoria por número de regiones/bytes, eviction LRU o epoch; evitar caché ilimitada de strings con coordenadas flotantes.
6. Cuando cambien superficie, geología o mundo editable, invalidar mediante `revision`, no limpiando todo por cada frame. Una importación de mundo invalidará solo lo necesario o el conjunto completo según dependencias.
7. Mantener función canónica pura y reproducible; si la caché devuelve una aproximación distinta, se rechaza.
8. En cálculos asíncronos, guardar `revision` en el job y descartar resultados obsoletos antes del publish.
9. Añadir pruebas de equivalencia para miles de puntos deterministas, límites de chunks, cambios negativos, bordes de ríos/lagunas, distancia al agua, inclinaciones y estabilidad en teletransporte.
10. Medir costo propio de caché (lookup, hash, eviction), heap y reducción de tiempo de generación. No medir solo hit rate.

## Cierre

Error numérico dentro de tolerancia original, sin cambios de coordenadas de césped/colisión, y ganancia en el escenario que justificó la fase. Si no hay ganancia, conservar cachés locales.

---

# Fase 5 · Matrices de instancias y actualizaciones por cambios

## Condición de entrada

F8/GC/bench muestra picos en `VegetationSystem.refreshBuffers`, `WorldPropSystem.refreshDecoration` o carga de AuthoredAssets (una vez recuperado editor).

## Pasos

1. Registrar costo de cada refresco, llamadas por minuto, bytes subidos, número de instancias y frecuencia del cambio que lo provoca.
2. En `VegetationSystem`, separar **generación de placements** de **matrices serializadas**. Crear buffers por chunk/variante/LOD cacheados a partir de placements deterministas, con invalidación explícita al cambiar exclusiones.
3. En `WorldPropSystem`, separar los 17 modelos de rocas por pieza, como ya hace el sistema, y cachear su `Float32Array` por clase. **No volver a instanciar todas las piezas para cada colocación**.
4. Mantener cristal/recurso/IDs fuera de thin batch si requieren picking/interacción, conservando ruta actual.
5. No reescribir `GrassSectorSystem` para que regenere posiciones: sus matrices horneadas ya son estáticas. Cualquier actualización por exclusiones debe preservar base/pendiente/orillas.
6. Evitar `Matrix.Compose`, `new Vector3` y `Quaternion` en recomposición masiva solo si el profiling muestra costo; alternativa: calcular matriz 4x4 en buffer con cos/sin de yaw y escala, verificando convención de ejes y `Matrix.Compose` de Babylon.
7. Reusar buffers de capacidad amortizada; distinguir `count` de `capacity`. Antes de subir, escribir solo matriz válida; no dejar instancias fantasmas por datos viejos en el extremo del buffer.
8. Registrar AABB/bounds de cada lote y actualizar a Babylon al cambiar matrices. Bounds incorrectos pueden ocultar objetos o impedir culling.
9. Cualquier estrategia incremental debe conservar orden estable si picking o ID dependen del índice. Si se compactan índices, mantener mapa ID->índice y actualizarlo transaccionalmente.
10. Validar `load`/`dispose`/streaming y teletransporte. Confirmar que ningún asset quede en el mundo después de salir de la zona.
11. Medir refesh latency, allocations, tiempo de upload, draw calls y calidad visual bajo igual número de instancias.

## Cierre

Menos picos de actualización; igualdad de placements y estados; matrices y bounds correctos; ningún cambio en resource respawn, colisiones o viento.

---

# Fase 6 · Streaming predictivo, priorización y cancelación

## Problema y criterio de entrada

`TerrainStream.jobScore()` **ya considera** dirección (`forwardPriority=.35`): no desarrollar un segundo sistema predictivo ignorando el actual. `GeographyStream`, vegetación, props, assets authored y laguna manejan colas o tareas con dependencias distintas. La optimización se justifica cuando la telemetría revela **pop-in, backlog o trabajo obsoleto** durante desplazamientos, sprint y teletransporte.

## Procedimiento

1. Inventariar para cada recurso su secuencia de estados: `unloaded → requested → generating/decoding → ready → resident → disposed`. Señalar cuándo requiere una malla transitable, cuándo basta proxy lejano y cuándo el elemento es decorativo.
2. Registrar eventos con `{system,region,resourceId,version,queuedAt,startedAt,finishedAt,uploadedAt,priority,reason}`. Medir tiempo en cola y hasta visibilidad, no solamente duración de `createTile`.
3. Identificar **única autoridad** de región deseada: el cálculo de near/mid/far se conserva en TerrainStream; la coordinación puede consumir `activeCells` y estados publicados, no inventar otra geografía.
4. Calcular predictor cinemático filtrado `p̂ = p + clamp(velocity * lookaheadSeconds, maxAheadDistance)` con velocidad del jugador o dirección de cámara como señal secundaria. Distinguir teletransporte (sin extrapolación) de recorrido continuo; calcular los valores mediante trazas, no constantes arbitrarias.
5. Ordenar trabajos por una puntuación compuesta: *bloqueo de gameplay*, tiempo de espera, distancia futura, dependencia de otros trabajos, visibilidad potencial y costo estimado. No permitir que prefetch desplace la malla transitable bajo el jugador.
6. Introducir prioridad estable: reordenar **solo** cuando cambia centro/dirección significativamente o después de un intervalo acotado; evitar ordenar completa la cola en cada frame cuando no es necesario.
7. Versionar solicitudes por `{zone,region,lod,worldRevision}`. Si una generación termina luego de que la región dejó de ser deseada, liberar resultados, no publicar una malla huérfana.
8. Admitir `cancel()` cooperativo para jobs iterativos o `AbortController` cuando se trate de `fetch`. Para operaciones GPU ya despachadas, no asumir cancelación: aplicar control de vigencia en la publicación final.
9. Dar prioridad a grupos LOD completos: conservar transición atómica del conjunto de hijos y la malla de cobertura mientras refinamientos estén incompletos. No dejar huecos ni una mezcla de colisiones incompatibles.
10. Registrar presupuesto de **decodificación y subida GPU**, además del presupuesto de generación CPU. La descarga termina antes de que el asset sea realmente visible.
11. Implementar caché pequeña de regiones recientes **solo** si el patrón de ida y vuelta justifica mantenerlas. Definir límite de memoria y expiración; no mantener todos los GLB y meshes del mundo residentes.
12. Agregar tests: ida/vuelta, avance rápido, teletransporte, descarte de jobs viejos, prioridad de suelo, regiones negativas, cambios de mundo y destrucción del scene. Añadir un test que provoque dos cargas de distinta revisión con finalización fuera de orden.
13. Medir `timeToUsable`, `timeToVisible`, `staleJobsDiscarded`, `pendingPeak`, `uploadMs` y p95 de frames durante sprint/teletransporte.

### Invariante de publicación asíncrona

```ts
interface RegionTicket {
  zone: string;
  regionKey: string;
  revision: number;
  requestId: number;
}

function mayPublish(ticket: RegionTicket): boolean {
  return !disposed
    && currentRevision(ticket.regionKey) === ticket.revision
    && desiredRegions.has(ticket.regionKey)
    && activeTickets.get(ticket.regionKey) === ticket.requestId;
}
```

**Cierre:** no hay regiones sin cobertura, el sistema descarta resultados obsoletos, mejora el pop-in o frame pacing medido y no aumenta memoria de forma injustificada.

---

# Fase 7 · Visibilidad jerárquica, HLOD y culling por grupos

## Condición de entrada

La escena se encuentra CPU-bound por evaluación de mallas/draw calls o GPU-bound por triángulos/sombras de conjuntos realmente invisibles o demasiado detallados. Medir con `GameTelemetry`, herramientas de Babylon/Chrome y capturas comparables. Ya existen LOD de terreno, árboles y follaje authored; **extender**, no sustituir globalmente.

## Procedimiento

1. Contabilizar en Bosque Ilustrado y aldeas: source meshes, instancias, materiales, submeshes, draw calls, triángulos, costo de sombras y conteo de objetos visibles. Usar el bosque V4 (~9.306 colocaciones documentadas) como escenario exigente, no como garantía de runtime exacto.
2. Definir jerarquía espacial por **regiones y grupos renderizables** (por ejemplo, celdas de 72 m o grupos de celdas), distinta de las colisiones. Una jerarquía de render no puede eliminar el estado de recursos ni interferir en la recolección.
3. Para cada grupo calcular AABB conservadora en espacio mundial, incluyendo variación de viento, animación y alturas. Generar un índice de grupos determinista que pueda reconstruirse tras edición.
4. Evaluar primero **frustum por grupo** y distancia a bounds; medir si el frustum que ya ejecuta Babylon cubre la mayoría de casos. Evitar duplicar CPU por un filtro redundante.
5. Probar **HLOD**: representar un conjunto lejano por meshes simplificadas/atlases/impostores. Elaborar el recurso una sola vez en pipeline de assets; evitar `MergeMeshes` masivo al vuelo mientras corre el juego.
6. Separar render de colisión: manteniendo rayos/colliders de tronco/roca cercanos y reglas de Santi. No crear un collider gigante a partir de un HLOD de árboles.
7. Seleccionar niveles por **error proyectado** y tamaño pantalla cuando pueda medirse, no solo distancia. Como aproximación inicial: `projectedRadiusPx ≈ radiusWorld * focalLengthPx / depth`; aplicar histéresis, dithering o crossfade donde soporte de materiales lo permita.
8. Evitar que los cambios de LOD de miles de árboles se sincronicen en un único frame. Distribuir umbrales, transiciones y reconstrucciones de buffers mediante jobs.
9. Considerar oclusión conservadora por montañas/arquitectura **solo** si los benchmarks identifican mucho trabajo invisible. Evaluar hardware occlusion queries o representación de oclusores; incluir latencia de consulta y posibilidad de falsos negativos temporales.
10. En cámaras móviles, mantener visibilidad conservadora hasta disponer de resultados confiables. No ocultar cuerpos transitables, portales, NPC interactivos o objetos que deben estar disponibles inmediatamente.
11. No activar `scene.freezeActiveMeshes()` en todo el mundo streaming: un conjunto congelado impide actualizaciones esperadas de visibilidad. Si se utiliza en una subescena realmente estática, descongelar ante cualquier alta, baja o cambio de LOD.
12. Validar escenario con árboles tapados por laderas, cámara girando, teletransporte, sombra proyectada desde objetos fuera de frustum y zonas subterráneas superpuestas.
13. Medir `culledGroups`, `visibleInstances`, draw calls, p95 GPU, CPU de evaluación de mallas, tamaño HLOD, memoria extra y aparición tardía. Documentar cómo se calculan bounds y por qué los resultados son conservadores.

**Cierre:** la representación de grupos funciona sin fallos de aparición, cambios de LOD invisibles injustificados ni pérdida de colisión; mejora verificada bajo cámara equivalente.

---

# Fase 8 · Fill-rate, transparencia, viento y sombras del follaje

## Condición de entrada

Perfil GPU demuestra alto costo de sombreado/overdraw asociado a hojas, flores, pasto o transparencias. *No* presumir que reducir triángulos reduce necesariamente fragment cost.

## Procedimiento

1. Capturar imagen, perfil y draw calls del Bosque Ilustrado con follaje activo, mismas coordenadas/cámara/resolución y estado climático.
2. Separar pruebas: render sin hojas (diagnóstico temporal), sin sombras, con viento congelado y con materiales básicos. Comparar **un factor por prueba** y restaurar inmediatamente.
3. Medir tamaño de cobertura por alfa en las texturas: proporción de texels transparentes y solapamiento de planos. Identificar modelos con grandes rectángulos de aire transparente.
4. Preferir geometría de hoja agrupada con silueta compacta y alpha clipping donde la estética lo soporte; evaluar bordes en movimiento, sombras y mips. Evitar cambiar alpha-blend a alpha-test a ciegas si aparecen halos o aliasing.
5. Evaluar `alpha-to-coverage` únicamente cuando MSAA/backend/material lo permitan; no introducirlo si rompe el aspecto ilustrado.
6. Garantizar que viento de raíces se ancle al suelo: posición de thin instances permanece inmutable y solo se deforma vértice, como indica `GRASS_FIELD.md`.
7. Medir sombras: número de casters, costo de render shadow map, alpha-test en pase de sombra, distancia de dibujo y LOD del shadow caster. Permitir que el objeto conserve visibilidad mientras cambia la precisión de su sombra.
8. Reducir operaciones fragment shader repetidas del follaje si se comprueba alto costo: muestras duplicadas, operaciones trigonometric per-fragment y múltiples capas sin necesidad.
9. Evitar generar materiales únicos por árbol; mantener shaders/materiales compartidos y variación por atributos de instancia.
10. Comparar capturas cerca y lejos, con viento fuerte, atardecer, tormenta y al rotar cámara. Incluir contornos de ramas y sombra del tronco.
11. Mantener colisiones, interacción y picking separados de la representación de hojas.

**Cierre:** menor tiempo GPU o fill-rate sin reducir densidad percibida de copa por debajo del estándar artístico aceptado. Guardar imágenes A/B antes de consolidar.

---

# Fase 9 · Ruta activa de materiales, arrays GPU y compresión de assets

## Dependencia

**No iniciar hasta cerrar P0.** Actualmente conviven `TerrainMaterial.ts`, `TerrainMaterialV2.ts`, `TerrainBiomeMaterial.ts` y `BiomeTextureArrays.ts`, con importaciones/documentación divergentes. La fase empieza por resolver cuál debe estar activo, no por convertir las texturas.

## Procedimiento para materiales

1. Rastrear `createTerrainMaterial` desde `WorldView → TerrainStream → import`. Registrar material, atributos, samplers, uniformes, conteos y shader compilado realmente utilizado.
2. Reconciliar el protocolo de pesos de bioma: cuatro componentes RGBA y componentes auxiliares cuando se use UV XY; corregir `TerrainStream`, material, topology y tests de forma atómica. No dejar un material de seis capas leyendo únicamente cuatro pesos.
3. Mantener malla de terreno canónica, altura/normal de colisión y continuidad de LOD. Al introducir un material nuevo, usar feature flag o selector explícito con fallback antiguo probado.
4. Medir coste del shader en terreno con pendientes, roca triplanar, agua somera y nieve. Registrar muestras textureGrad, shaders compilados, draw calls y GPU frame.
5. `BiomeTextureArrays` carga albedo y normales de múltiples biomas en arrays GPU con working set de 512 px; no confundir los assets fuente de 1K con la resolución efectiva de runtime. Antes de aumentar tamaño, medir pérdida perceptual.
6. Corregir cualquier comportamiento transitorio durante `ready`: colores por defecto solo hasta texturas listas; gestionar `AbortError`, `dispose`, reentrada y error de carga. Evitar subir enormes arrays sin control de memoria.
7. Los sistemas de clima, fog y tiempo comparten reloj coherente: no introducir `performance.now()` divergente entre materiales si la escena puede pausarse o reproducirse determinísticamente.

## Procedimiento para compresión

8. Inventariar GLB por modelo, triángulos, materiales, texturas embebidas, tamaño de archivo, VRAM aproximada, decode time y número de instancias. Conservar archivos originales versionados/regenerables.
9. Piloto KTX2/Basis para **tres** texturas representativas (normal, albedo, alpha foliage), verificando formato de GPU soportado, tiempo de transcodificación, mipmaps, bordes y calidad. Preferir artefactos 1K como fuente, no reemplazarlos por 2K.
10. Piloto `EXT_meshopt_compression` en un GLB repetido y Draco solo si el balance compresión/decodificación lo justifica. Verificar soporte en loader Babylon 9.32.0 y estrategia de carga/decoder en la app.
11. Mantener una versión sin extensión para fallback si el backend de destino no admite el formato o decoder; documentar condiciones de selección, caché y tamaño adicional del fallback.
12. **No convertir automáticamente Santi**: primero comprobar preservación de rig, skinning, 35 acciones NLA, morph targets, materiales de remera y animaciones reproducibles. Usar `test:santi` y navegador.
13. Comparar carga caliente y fría, bytes transferidos, decode CPU, tamaño GPU efectivo, calidad visual y uso de memoria. Si mejora descarga pero introduce hitches visibles, evaluar pipeline asíncrono o descartar.

**Cierre:** selector de material coherente y probado, fuente 1K intacta, piloto de compresión con métricas y fallback; sin regresión de render o animación.

---

# Fase 10 · Cielo y nubes: optimización de lo que existe, no raymarching inventado

## Evidencia

`SkyDome.ts` elige `CloudPieces` (atlas ilustrado) por defecto; el renderizador de ruido con `?cloudRenderer=noise` es experimental. Los archivos revisados **no prueban** que exista raymarching volumétrico 3D completo. No rediseñar el cielo como una técnica ajena.

## Procedimiento

1. Capturar capturas y perfiles en cielo despejado, cúmulos, tormenta y cambios día/noche con `pieces` y `noise` por separado. Registrar draw calls y GPU frame con y sin nubes, no reducir todo a un contador FPS.
2. Medir fase de **construcción de atlas en CPU** en `CloudPieces.load()`: fetch, canvas, trimming, composición, generación de máscaras, extrusión de bordes, `RawTexture` uploads y creación de geometría. Registrar que esto ocurre en carga, no por frame, si se confirma.
3. Eliminar únicamente trabajo duplicado probado: caché de atlas construido para sesión, reuse de bitmaps, composición offline en etapa de asset si es reproducible y no requiere estado de clima; comprobar tamaño final de descarga.
4. Medir fragment shader del cielo/masas, overdraw de piezas, mezclas, máscaras y costo de sombras entre nubes. Optimizar operaciones de alto costo preservando bordes suaves.
5. Cuando se necesiten nubes realmente volumétricas, diseñar **una ruta nueva opcional** con campo 3D/noise, raymarch adaptativo, render target de resolución menor, reconstrucción temporal y reproyección de historia. No etiquetar el renderer actual como volumétrico sin demostrarlo.
6. Si se prueba historia temporal: almacenar color/transmitancia/depth de historia, reproyectar mediante matrices de cámara previa y movimiento de nubes, invalidar por teleport/turn brusco/cambio de estado de tormenta/resize. Evitar ghosting.
7. Limitar muestras con criterio óptico (transmitancia acumulada), early-out, muestreo espacial y step size adaptativo. Considerar banda de error en bordes; no fijar 64 pasos para todas las condiciones.
8. Comprobar soporte de WebGL2 y WebGPU antes de cualquier compute shader. Mantener fallback render clásico y evitar WebGPU obligatorio para el juego.
9. Validar nubes con cámara orbital, viento, resolución performance/balanced/native, amanecer, atardecer, luna, lluvias. Comparar color, silueta, suavidad y ausencia de artefactos temporales.
10. Registrar bytes GPU/CPU de atlas, tiempo startup y costo GPU sostenido. Conservar `test:sky` y, cuando aplique, screenshot tests.

**Cierre:** mejoras medibles en startup/render con cielo visualmente igual o superior. La ruta volumétrica avanzada solo se habilita tras prueba A/B positiva.

---

# Fase 11 · Agua, cascadas, espuma y caústicas: datos de flujo compartidos

## Evidencia

`LagoonSystem.ts` crea ríos en un generador repartido con deadline de 1,5 ms por update; agua y cascadas usan shaders; `OceanWater`, `GeographyStream` y `WaterContacts` tienen responsabilidades distintas. La simulación visual **no equivale** a fluidos físicos y no requiere implementar Navier–Stokes.

## Procedimiento

1. Registrar cuellos de botella separados: formación de geometría de canales, consultas repetidas a altura/agua, subidas GPU, shader de agua, partículas de rocío, cambios de zona y nado.
2. Mantener los vértices compartidos en unión río–cascada y la cota uniforme de laguna. Registrar las coordenadas del contorno y verificar continuidad; no simplificar rompiendo costuras.
3. Preparar datos derivados de flujo por segmentos: tangente/velocidad aproximada/curvatura/proximidad a roca y profundidad. Usar vectores persistentes o atributos del mesh si evita recalcular datos equivalentes por frame.
4. Para cada tramo evaluar flow map 2D o atributos de vértice, manteniendo shader para normales y espuma; preferir **datos procedurales precalculados** a simulación completa de partículas de agua.
5. Calcular máscaras de espuma a partir de impactos, orillas, turbulencia y obstrucciones físicas conocidas; evitar un pass de detección de roca por píxel si existe geometría precomputada adecuada.
6. Consolidar uniforms compartidos de tiempo, viento y caústicas; asegurar no modificar inadvertidamente el mismo shader mientras `updateView` ajusta niebla submarina y la cámara termina de resolver oclusión.
7. Si el usuario/editor modifica cauces, versionar la geometría y las máscaras dependientes. Recomputar solo tramos sucios; cancelar generación obsoleta (Fase 6).
8. Asegurar `dispose()` de texturas, partículas, meshes y luces al entrar/salir de gruta. Verificar con contadores en visitas repetidas; una cuenta estable **no prueba** por sí sola que toda VRAM esté libre.
9. Reservar partículas GPU para rocío/salpicaduras *solo* si las cantidades y perfil justifican migración. Preservar burbujas del jugador con un fallback simple.
10. Ejecutar `test:lagoon`, `test:features`, `test:routes`, `test:traversal` y verificaciones de navegador de nado/buceo, orillas, mirador, transiciones y cámara bajo el agua.

**Cierre:** ríos y cascadas conservan forma/continuidad, nado y visibilidad; menos hitches o GPU shading con mediciones; sin nueva física de fluidos innecesaria.

---

# Fase 12 · Física secundaria, colisiones y partículas: evolución selectiva

## Premisa

`ChainDynamics`, `SpatialHash`, `DistanceFields`, `ChainCurve` y `HangingLanterns` están implementados y documentados en `FISICA_SECUNDARIA.md`. **No crear una física V2 por costumbre.** Tampoco presuponer que hashing gana en alta densidad: el benchmark documenta lo contrario para 2.000 cápsulas concentradas.

## Procedimiento

1. Repetir `npm run bench:physics` y pruebas de referencia una vez resuelta Fase 0; registrar diferencias contra `artifacts/physics` sin sustituir esos archivos por nuevas cifras no comparables.
2. Si surge una necesidad real de cuerdas, colas o raíces: probar primero `analytic`/`ftl` cuando baste; usar `pbd/xpbd` si requiere gravedad, compliance y contactos.
3. Reservar canal `critical` para sistemas que afecten gameplay; los faroles decorativos actuales continúan con LOD/sleeping y presupuesto blando.
4. Solo expandir SDF cuando la forma y la precisión sean adecuadas: roca transitables y puente requieren la colisión concreta que preserva el controlador. No reducir collider de escalada a SDF aproximada sin tests geométricos.
5. Para inter-colisión densamente concentrada, medir reducción mediante máscaras y agrupación antes de intentar optimizar `pairGrid`; nunca saltar contactos obligatorios.
6. Si aparecen cientos de cables visibles simultáneos, comparar deformación CPU actual frente a atlas de puntos GPU, incluyendo transferencia, normals, sombra y bounds; Thin Instances por sí solas no reconstruyen la curva.
7. Registrar costo de SDF, broad/narrow, error de longitud/penetración residual, CPU y GPU, además de FPS.
8. Para precipitación (`Precipitation.ts` implementa lluvia/nieve CPU en cantidades moderadas), medir el costo CPU antes de migrar. GPU particles no sirven automáticamente para efectos que interactúan frecuentemente con gameplay.
9. Preservar `test:physics`, `tests/physics.browser.mjs` y ciclo de carga/retirada de 13 faroles.

**Cierre:** se conserva madurez de física existente; cualquier expansión tiene caso de uso, benchmark y límites explícitos.

---

# Fase 13 · Calidad adaptativa por cuello de botella

## Condición de entrada

Los sistemas anteriores están medidos y la telemetría separa adecuadamente CPU de GPU. `renderResolution.ts` ya permite `performance`, `balanced`, `native`: preservar la selección del usuario y la nitidez de UI/HUD.

## Procedimiento

1. Definir un módulo de políticas separado del HUD; utilizar `GameTelemetry` o un sampler liviano y no habilitar instrumentación costosa permanentemente.
2. Registrar presupuestos independientes por subsistema, no una perilla global. Distinguir `cpuFrameMs`, `gpuFrameMs` (si disponible), `loadHitchMs`, `shadowMs` (si se mide) y `degradedQualityCount`.
3. Identificar qué subsistema puede degradarse sin alterar gameplay: sombras decorativas, densidad de partículas, resolución de nubes **en modo compatible**, distancia de vegetación LOD, calidad de filtros. No degradar colisiones o render de suelo transitable.
4. Activar adaptación solo ante ventana sostenida con histéresis, por ejemplo baseline medido durante varios segundos, no cuando exista un único frame lento por navegación.
5. Limitar frecuencia de cambios (`cooldownSeconds`) y escalones; aplicar recuperación gradual para evitar oscilaciones y pops. No cambiar múltiples parámetros simultáneamente sin una razón trazable.
6. Si el tiempo de GPU no está disponible, usar hipótesis conservadora y permitir modo manual. No inferir que el juego es GPU-bound exclusivamente por FPS bajo.
7. Guardar preferencia y respetar el modo `native` cuando el usuario lo elija explícitamente, salvo política configurable y visible.
8. Registrar cada cambio con motivo, evidencia, valor anterior/nuevo y efectos en frame pacing. Permitir reset.
9. Validar al iniciar y terminar tormenta, al nadar, en aldeas, al teletransportar y al activar F8. Comprobar que cámaras y UI no cambian de tamaño al ajustar resolución interna.

**Cierre:** frame pacing mejor y sin degradación perceptual brusca; modo manual estable; decisiones respaldadas por datos suficientes.

---

# Fase 14 · Workers, GPU compute, pools y técnicas avanzadas (no automáticas)

## Condición de entrada

Después de las mejoras algorítmicas y de arquitectura, queda un costo dominante con suficiente volumen para amortizar paralelismo o buffers adicionales. No crear infraestructura compleja por anticipación.

## Procedimiento

1. Separar datos **puros y serializables** de objetos Babylon. Candidatos: generación numérica de posiciones/índices, alturas/regiones, mallas de terreno, análisis de recursos; no transferir referencias `Mesh/Scene` a Worker.
2. Evaluar `Worker` con mensajes y buffers transferibles; comparar la reducción de bloqueo del main thread contra serialización, copias y retorno de resultados.
3. Usar double buffering para resultados de regiones y distinguir generación, publicación y upload GPU; disponer de resultados obsoletos.
4. Considerar `SharedArrayBuffer` solo si despliegue permite aislamiento cross-origin y existe justificación real; documentar requisitos de headers y fallback.
5. Para WebGPU compute, verificar backend y APIs realmente utilizadas en Auralia. Proveer fallback WebGL2 equivalente para no excluir dispositivos actuales.
6. Evitar dependencias de motor gráfico en módulos que deben ejecutarse en Worker. Mantener pruebas unitarias sobre generadores puros.
7. Medir y reportar además latencia de startup, worker count, peak resident memory, GC, CPU principal y total, latencia de sincronización y baterías si aplica.
8. No usar pools enormes que queden reservados después de salir de regiones. Comparar costos de creación/retirada contra memoria retenida.

**Cierre:** sólo se conserva si mejora un bottleneck comprobado bajo condiciones representativas y dispone de fallback seguro.

---

# Fase 15 · Revisión final, integración y publicación

1. Reejecutar el inventario de archivos y dependencias; confirmar que los archivos no aparezcan/desaparezcan silenciosamente entre commits.
2. `npm ci` y comprobar versión Node soportada antes de compilar; asegurar que módulos externos/decoders se instalen con lockfile versionado.
3. Ejecutar **sin falsificar resultados**: `npm run check`, `npm run build`, `npm test` y benchmarks relacionados con los sistemas realmente modificados.
4. Registrar fallos anteriores y posteriores por separado. Si la suite global ya tenía una expectativa fallida, no modificarla arbitrariamente para que aparezca verde: reconciliar la expectativa con la geografía canónica y documentar la decisión.
5. Ejecutar escenarios de navegador frío/caliente, cámara, transiciones LOD, teletransporte, Bosque Ilustrado, laguna/gruta, Altapiedra/puentes, guardado y reapertura.
6. Ejecutar series A/B con **misma cámara, posición, resolución CSS e interna, clima, bioma, duración, hardware, navegador y calentamiento**; separar mediana/p95/p99 y reportar memoria aproximada con limitaciones.
7. Comparar cada intervención contra su propio baseline, no combinar mejoras de física con mejoras de GPU y atribuir todo a un único cambio.
8. Conservar capturas A/B de nubes, follaje, costuras de terreno, lago/submarino y Santi; registrar artefactos visuales y correcciones.
9. Revisar regresiones funcionales: colisiones de roca y árbol, contactos y cámara, nado y salidas, IDs de recursos, inventario, guardado y 35 acciones/shape keys de Santi.
10. Documentar en `docs/optimization/` cambios hechos, archivos, benchmarks, hipótesis rechazadas, limitaciones, rollback y nuevas oportunidades. No sobrescribir `FISICA_SECUNDARIA.md`; actualizarlo con resultados adicionales manteniendo trazabilidad.
11. Usar commits pequeños en **main** según flujo establecido. Antes de cambiar una segunda técnica, integrar y validar la primera. No crear ramas ni reescribir el historial.
12. Entrega por fase con tabla: `estado`, `archivos`, `antes`, `después`, `pruebas`, `riesgos`, `rollback`. Si hubo un bloqueo, especificar con precisión qué impidió continuar y qué quedó listo sin fingir implementación.

## Política de aceptación o reversión

```text
Si falla integridad o compilación:
    bloquear cambios de rendimiento y resolver Fase 0.
Si no hay benchmark comparable:
    registrar oportunidad, instrumentar y NO afirmar ganancia.
Si la mejora reduce CPU pero sube GPU/VRAM y empeora p95:
    comparar trade-off bajo mismo perfil; revertir si no cumple objetivos.
Si mejora FPS pero altera terreno, colisión, guardado o arte:
    RECHAZAR hasta corregir regresión.
Si mejora rendimiento y pasa pruebas/capturas:
    consolidar commit, documentar y pasar a fase siguiente.
```

## Secuencia mínima que Codex debe informar tras cada fase

```markdown
### Fase N — <nombre>
- Base SHA y working tree inicial:
- Diagnóstico medido / hipótesis:
- Decisión técnica y alternativas descartadas:
- Archivos modificados:
- Contratos/invariantes preservados:
- Pruebas ejecutadas y resultados literales:
- Benchmark A/B (entorno, mediana, p95, p99):
- Capturas / artefactos:
- Regresiones/fallos preexistentes:
- Estado: implementada | descartada por datos | bloqueada
- Rollback y próximos pasos:
```

**Regla de cierre general:** la documentación debe reflejar el repositorio que **realmente compila y ejecuta**, no un diseño deseado. La ganancia se mide en una escena con el gameplay intacto; que un módulo matemático aislado sea veloz no basta.

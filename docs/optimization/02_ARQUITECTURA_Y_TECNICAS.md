# 02 · Arquitectura de optimización y fundamentos técnicos

**Base:** commit `b511d35`; **estado:** diseño recomendado, no módulos ya implementados. Separar lo EXISTENTE de lo PROPUESTO. El capítulo de física complementa —no reemplaza— `docs/FISICA_SECUNDARIA.md`.

## 1. Modelo de costos: ¿qué se quiere reducir?

Un frame idealmente se compone de trabajo de CPU (`input`, `gameplay`, generación y preparación), submission/render de Babylon y procesamiento GPU (geometría, fragmentos, transparencias, sombras, postprocesos). No es correcto sumarlos como si cada bloque ocupara necesariamente un intervalo secuencial: CPU y GPU se solapan; GPU timings pueden ser asíncronos.

La optimización se clasifica por su efecto primario:

| Familias | Recursos afectados | Riesgo al optimizar |
|---|---|---|
| Menos trabajo | CPU por frame, cantidad de colisiones, cálculos de terreno | Cambiar resultado matemático o gameplay |
| Diferir trabajo | Picos de CPU e IO | Aparición tardía de elementos |
| Reutilizar resultados | CPU, allocations, GPU uploads | Caché obsoleta tras edición |
| Rechazar objetos invisibles | Draw calls, vértices, sombras, fragmentos | Pop-in, incorrecto culling de objetos grandes |
| Reducir fragmentos | GPU fill-rate y ancho de banda | Folios menos densos, bordes duros |
| Reorganizar datos | Cache locality, GC, memoria residente | Complejidad, bugs de estado |
| Comprimir | GPU memory, ancho de banda, transferencia | Degradación visual, tiempo de transcodificación |
| Simular aproximadamente | Solver, restricciones, consultas | Pérdida de interacción esencial |
| Adaptar calidad | Consumo según escena/hardware | Oscilación visual, degradación no aceptada |

Regla: **primero perfilar, después modificar un costo dominante**. En Auralia los presupuestos de `TerrainStream` y `ChainDynamics` ya son ejemplos existentes de reducción de trabajo por frame.

## 2. Estructura transversal propuesta

```text
WorldView.update(dt)
  ├─ trabajo síncrono crítico: entrada, personaje, cámara, colisiones de gameplay
  ├─ cambios de estado: mundo, clima, biomas, versiones
  └─ WorkScheduler.tick(budget)
       ├─ prioridad vital: sector de suelo bajo jugador, salida de cueva
       ├─ prioridad alta: carga de mallas cerca de cámara
       ├─ prioridad media: vegetación, agua, props, precarga
       └─ prioridad baja: caché anticipada, HLOD, precómputos

        ↕ dependencias explícitas y cancelación

  WorldQueryCache  → Height/Surface/Region Data
  WorldVisibility  → clusters/tiles/occluders/LOD
  InstanceBatches  → buffers de sectores/materiales
  AssetPipeline    → loading/decode/upload/resource residency
  QualityController→ presupuestos según métricas CPU/GPU
  GameTelemetry    → evidencia y verificación
```

No construir todos esos servicios simultáneamente ni convertir el `WorldView` en una clase dependiente de una arquitectura especulativa. Evolucionar por fases desde contratos mínimos.

## 3. Job System cooperativo y frame budgets

### 3.1. Motivación y precedentes

`TerrainStream.update()` ya limita generación usando `generationBudgetMs: 4` y `maxGeneratedPerFrame: 2`. `LagoonSystem` crea bandas de río mediante un generador y un deadline de 1,5 ms. `GeographyStream` limita generación a dos mallas por llamada. Al ejecutarse secuencialmente en un mismo frame, presupuestos independientes pueden provocar picos acumulados.

### 3.2. Semántica del scheduler

```ts
export type JobPriority = 'critical'|'near'|'normal'|'background';
export type JobStepResult =
  | {kind:'yield'}
  | {kind:'done'}
  | {kind:'blocked'; dependency:string};
export interface WorldJob {
  id: string;                 // idempotencia; no duplicar pendientes
  owner: string;              // 'terrain' | 'lagoon' | 'vegetation' ...
  priority: JobPriority;
  regionKey?: string;
  generation: number;         // invalidación por versión
  step(maxTimeMs:number): JobStepResult; // cooperativo, acotado
  cancel?(): void;
}
```

**Contrato:** `step()` hace una unidad de trabajo razonablemente corta, **nunca promete ser preemptible**. Un cálculo largo síncrono no puede cortarse con `performance.now()` desde fuera. Dividir mallas/filas/tiles en unidades suspendibles o enviar CPU puro a Worker tras demostrar necesidad. Llamar `step` solo desde el hilo correspondiente; crear recursos Babylon en el hilo con autoridad de render.

**Algoritmo:** presupuesto global `B`, reservar primero trabajos críticos, ordenar por prioridad/distancia/antigüedad, ejecutar hasta `B` o agotar cola; evitar starvation mediante envejecimiento y límites para jobs repetitivos. Los deadlines son blandos: un `step` no puede ser interrumpido a la mitad. Un trabajo cancelado debe liberar buffers temporales y no publicar resultados tardíos.

```ts
const start = performance.now();
while (queue.length && performance.now() - start < budgetMs) {
  const job = pickEligibleJob();
  if (!job || !isCurrent(job)) { discard(job); continue; }
  const remaining = Math.max(0, budgetMs - (performance.now()-start));
  const outcome = job.step(remaining);
  if (outcome.kind === 'done') finish(job);
  else if (outcome.kind === 'yield') requeue(job);
  else suspendUntil(job, outcome.dependency);
}
```

El pseudocódigo omite indexación eficiente de colas. Medir el overhead del scheduler: no usar prioridad por sorting completo cada frame cuando hay muchos jobs si un heap o buckets deterministas serían mejores.

### 3.3. Prioridades e invariantes

El suelo/collider bajo Santi y la geometría necesaria para cruzar una transición son críticos. No deben esperar detrás de césped lejano. La caché puede llegar después, pero las consultas de terreno canónicas y la colisión deben estar disponibles sincronizadamente.

### 3.4. Worker opcional

Mover solo computación pura y serializable, como generación de arrays de alturas/vértices/índices. Enviar un `jobId`, `generation` y parámetros deterministas; devolver `ArrayBuffer` transferibles. **No** enviar Mesh/Scene/Texture. Descartar mensajes de generaciones anteriores y respetar orden. Separar producción de CPU y creación/upload de GPU.

## 4. Caché determinista, incremental y por región

### 4.1. Riesgo de repetir cálculos

La altura `sampleMainlandHeight(x,z)` alimenta render, pasto, vegetación, agua, rayos, huellas y construcciones. `TerrainStream` tiene `heightCache`, pero lo limpia tras cada `update`. `GeographyStream` y `GrassSectorSystem` también emplean cachés locales en generación. Es necesario determinar si compartir **algunos** resultados reduce costos; no confundir caché con alterar la función canónica.

### 4.2. Datos y claves

Para vértices de grid, definir índices enteros, sin cadenas con floats arbitrarios:

```ts
type TerrainGridKey = { gridX:number; gridZ:number; sampleStep:number; revision:number };
type SampleSet = {
  heights: Float32Array;
  slopesX: Float32Array;
  slopesZ: Float32Array;
  biomeWeights?: Uint8Array;
};
```

`nearTerrainHeightAt()` usa los triángulos realmente emitidos por el LOD cercano; no reemplazar una consulta de colisión por una aproximación interpolada de otro grid. Compartir **muestras canónicas** en puntos exactamente coincidentes y preservar interpolación/diagonales y normales acordes al terreno visible. Especificar precisión aceptable si se pasa de Float64 a Float32.

### 4.3. Ciclo de vida

- Clave `worldRevision` al editar altura/biomas/agua o importar un documento; no invalidar todo al mover cámara.
- Caché con TTL o LRU/presupuesto bytes por región; pin temporal de datos bajo el jugador.
- Publicar datos solo cuando finaliza el cálculo y la versión coincide; cancelar trabajos anteriores.
- Contabilizar `hit`, `miss`, `eviction`, `staleReject`, bytes y tiempo total.
- Contar costo de hashing/búsqueda de caché: funciones simples pueden ser más rápidas que consultarla.

### 4.4. Precomputación editorial vs runtime

El grass bake es un precedente útil: se realiza al editar, se guarda y el runtime solo instancia. Ampliar este patrón a colocación de recursos decorativos, masks o variantes de distancia **solo** si son deterministas y tienen mecanismo de invalidación y compatibilidad con el archivo de mundo. No guardar coordenadas/transforms de assets como sustituto de datos semánticos persistentes.

## 5. Data-Oriented Design y lotes por instancia

### 5.1. Problema observado

`VegetationSystem.refreshBuffers()` crea matrices con `Matrix.Compose(new Vector3, Quaternion...)` y arreglos de números; `WorldPropSystem.refreshDecoration()` recompone materiales/instancias y sube nuevos `Float32Array`. Esto ocurre en refrescos, **no necesariamente por frame**. Medir cuántos refrescos ocurren por minuto antes de optimizar.

### 5.2. Datos persistentes por chunk

```ts
interface InstanceBatch {
  key: string; // sector + assetKind + LOD + materialVariant
  matrixData: Float32Array;
  capacity: number;
  instanceCount: number;
  generation: number;
  dirty: boolean;
  bounds: {minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number};
}
```

Guardar matrices deterministas una vez por chunk. Si cambian exclusiones o un asset, regenerar **solo** chunks afectados. Agregar buffers por material/LOD visible en un grupo pequeño de uploads, sin reconstruir mallas individuales por cada instancia. Usar `thinInstanceSetBuffer` siguiendo el contrato de Babylon, actualizando bounds y culling cuando cambien. Es distinto de modificar el pasto estático por frame.

### 5.3. ID y gameplay

Los objetos que se recolectan, los cristales y sus cooldowns deben conservar IDs de recurso y estado de guardado. La instancia gráfica puede desaparecer; el dato de mundo no. Nunca convertir una entidad interactiva en mera thin instance sin adaptar picking, selección, reaparición y colisiones.

### 5.4. Evaluación de estructuras de datos

SoA/TypedArray acelera loops masivos y reduce GC, pero complica inserción/eliminación. Usar free lists y handles estables solo en lotes donde la tasa de cambios lo justifique. No transformar todo el juego a ECS por moda.

## 6. Visibilidad: frustum, occlusion, sector culling y HLOD

### 6.1. Orden de descarte

1. Zona/región activa y streaming.
2. Relevancia espacial (distancia o banda de interés).
3. Bounding sphere/AABB frente al frustum.
4. Oclusión conservadora contra relieve o construcción, **solo si rentabiliza el test**.
5. Selección LOD/HLOD según error de pantalla, histéresis y distancia.
6. Preparación de draw lists y sombras.

No ejecutar culling per-instance en CPU para millones de Thin Instances sin comparar costo. Babylon culling y bounds se prueban con la versión instalada.

### 6.2. HLOD agregativo

Para un cluster de árboles o una aldea, preservar entidades semánticas y colisiones originales, pero representar a distancia un proxy más económico. HLOD puede ser malla combinada, impostor o LOD agregado. No fusionar mallas con materiales incompatibles ni introducir UV/layout nuevos sin validar la estética.

Cada cluster contiene bounds conservadores, modelo LOD0/LOD1/LOD2 o proxy, distancia de transición con histéresis y opcional crossfade si cabe en presupuesto. **El interior de castillos, puertas, pasajes y escalones interactivos** no puede desaparecer de la simulación si el jugador está allí.

### 6.3. Oclusión por terreno

En exterior abierto, el relieve puede ocultar grupos grandes. Considerar horizonte por sector, bounds contra depth prepass o queries de oclusión agrupadas. La oclusión GPU suele introducir latencia; reutilizar el último resultado conservador y evitar flashes de aparición. No crear miles de queries GPU por mata de pasto.

### 6.4. Precaución con `freezeActiveMeshes`

Babylon permite congelar mallas activas, pero en Auralia la escena cambia continuamente con streaming y portales. Nunca aplicarlo globalmente sin estrategia explícita de descongelamiento/invalidación y tests de aparición/desaparición.

## 7. Overdraw de foliage y sombras

El coste de hojas alpha puede estar dominado por fill-rate aunque los polígonos sean pocos. Distinguir:

- `alpha-test`/cutout: mejor orden de profundidad, pero bordes y aliasing; medir sombras y alpha-to-coverage si el antialias permite.
- `alpha-blend`: necesita sorting y puede renderizar muchas capas. Usar solo cuando la transparencia real lo exija.
- Tarjetas/cards con mucho espacio transparente: recortar el contorno, combinar atlas y minimizar áreas vacías.
- Follaje lejano: LOD específico de silueta y densidad; preservar copa y escala real.
- Sombras: limitar casters o distancia de sombra por cluster/LOD, sin eliminar sombras cercanas esenciales.
- Viento: deformación de vértices compartida en shader; no actualizar posiciones del árbol en CPU.

**Métricas:** tiempo GPU, draws sombra/principal, triángulos, overdraw visualizado con herramienta gráfica, pixel coverage, imágenes A/B. No atribuir a GPU una mejora de FPS si el frame es CPU-bound.

## 8. Cielo: shader por atlas existente y ruta experimental de ruido

`SkyDome` usa `pieces` como render por defecto y `noise` como vía explícita (`?cloudRenderer=noise`). `CloudPieces` construye/combina atlas y dibuja formaciones; el shader `NoiseCloudShader` emplea un campo procedural de 4/6/8 pasos según calidad. No se ha demostrado un pipeline volumétrico de raymarching clásico.

### Orden de experimentación

1. Perfilar tiempo GPU/fragment con cielo y nubes activadas/desactivadas, fijando cámara/tiempo/clima.
2. Medir preparación CPU de atlas (redes, `createImageBitmap`, composición y subida) en carga fría.
3. Revisar cantidad de fragmentos, transparencia, máscaras, alpha y draw passes.
4. Reducir cálculos duplicados y material variants; reutilizar texturas/masks.
5. Evaluar precomponer atlas estáticos **offline** si se mantiene la fidelidad del cielo y las estaciones.
6. Solo si el coste GPU sigue dominando: probar render de nubes a resolución inferior + upscale adaptativo o histórico temporal con reproyección.

### Reproyección temporal opcional

Para un buffer de nubes `C_t` a baja resolución y el histórico `H_{t-1}`:

```text
p_prev = projectPreviousWorldDirection(p_current, cameraPrev, motionOfClouds)
confidence = validateHistory(depth/coverage/time/weather/cameraJump)
H_t = lerp(C_t, H_{t-1}(p_prev), confidence * historyWeight)
```

En cielo infinito no usar profundidad de objetos locales como si representara la distancia a la nube. Si el atlas está dibujado en espacio angular, reproyectar con direcciones y el desplazamiento temporal de la nube. Invalidar ante teletransporte, FOV, clima brusco, cambio de renderer/resolución. Evitar ghosting y bordes rectangulares; comparar métricas de error de contorno, no solo FPS.

No recomendar compute WebGPU como prerequisito: `WorldView` crea un `Engine` WebGL actualmente.

## 9. Agua: flujos en shader + generación amortiguada

`LagoonSystem` ya usa geometría de río, cascada y shader de espuma/cáusticas; los ríos se construyen como generator repartido (1,5 ms). `OceanWater` tiene parche cercano/far; `GeographyStream` crea superficies próximas. Prioridades:

- Integrar presupuestos de preparación con scheduler, preservando continuidad visual durante sustituciones.
- No regenerar geometría de canales por cambios de cámara o tiempo.
- Compartir máscaras/caústicas cuando su contenido es idéntico, sin confundir cache de URL con uso de VRAM.
- Para flujos alrededor de rocas, usar campos de velocidad 2D/3D locales o flow maps **si** el shader no logra la forma requerida con parámetros existentes.
- Separar geometría física de superficie acuática y visual: el nado usa altura/volumen canónico.
- Ajustar LOD de espuma y rocío según área visible, no solo distancia.
- Un efecto de obstáculo en cascada puede reconstruir la corriente mediante una máscara de interferencia/proyección del obstáculo; no introducir un solver Navier–Stokes sin propósito de gameplay.

Riesgos: juntas entre río y cascada, cota constante de laguna, transición aire/agua, cámara subacuática, shaders compartidos, carga de interior, fugas de mallas/materiales tras entrar y salir. Las pruebas existentes son obligatorias.

## 10. Asset pipeline: VRAM, KTX2, Meshopt y carga

### Texturas

Un asset 1024×1024 RGBA8 sin mipmaps ocupa `1024*1024*4 = 4 MiB` descomprimido en GPU. Con cadena mip 2D completa, ≈5,33 MiB. La compresión del archivo descargado (WebP/PNG) **no implica** que GPU almacene esa textura comprimida. KTX2 puede transcodificar a formatos GPU compatibles; verificar soporte real y fallback.

`BiomeTextureArrays` ya declara fuentes 1K y working set de 512 px para capas compartidas, con presupuesto GPU calculado en `BiomeMaterialCatalog`. No recomendar un atlas duplicado sin medirlo: quizás ya resuelva el objetivo si se conecta correctamente.

### Modelos GLB

Comparar `EXT_meshopt_compression` y/o `KHR_draco_mesh_compression` en un conjunto controlado, midiendo descarga, decodificación, total de vértices, calidad de normales, UV, materiales y tiempo de primera imagen. Es importante no asumir soporte/transcoders presentes en Vite si no se agregaron y versionaron correctamente.

### Santi

No reprocesar su GLB como parte de una migración masiva sin prueba específica de sus **35 NLA**, jerarquía, morph targets, skinning, texturas y material separado de remera. Los assets están limitados por su integración artística, no solo por peso.

### Presupuestos y lifecycle

Crear inventario de bytes de assets por familia, `downloadBytes`, `decodedBytes` cuando se pueda, GPU-estimated bytes, número de materiales/texturas y tiempo de carga. Evitar afirmar VRAM total de Chrome a partir del heap JS.

## 11. Streaming predictivo

Ya existe prioridad direccional de tiles mediante `jobScore()` en `TerrainStream`. Para ampliar:

- Predicción `p_future = p + v * horizon` con `horizon` acotado y adaptable; no usar la dirección de cámara como sustituto automático del movimiento.
- Priorizar terrenos críticos bajo el jugador, vecindad hacia movimiento, luego assets visibles y regiones de baja prioridad.
- Cancelar trabajos obsoletos mediante `regionRevision`/`generationId`. Resolver carreras en cargas async y transferencia de buffers.
- Mantener una caché pequeña de sectores recientemente abandonados si la memoria lo permite, para evitar thrash al cruzar bordes.
- No crear todos los chunks lejanos detallados al iniciar; conservar la cobertura del mundo sin perder terreno mientras refina.

**Métricas:** tiempo desde entrar en un sector hasta contenido listo, número de cargas canceladas, pico de jobs, bytes residentes, hitches en teletransporte, ausencia de huecos.

## 12. GPU particles y FX escalables

`Precipitation.ts` contiene ParticleSystem CPU con capacidades de cientos, no cientos de miles. La conversión inmediata a `GPUParticleSystem` puede añadir dependencia/costos y no cambiar FPS. Hacer piloto con 2–3 volúmenes de emisión (actual, 5×, 20×), cámaras iguales, y fallback soportado. `GPUParticleSystem.IsSupported` detecta capacidad en WebGL2; no todos los comportamientos CPU poseen equivalentes GPU (subemitters, callbacks, lectura de posiciones). Mantener partículas de gameplay en CPU y cosméticas en GPU solo si hay beneficio.

## 13. Física secundaria: integración selectiva, no reinvención

La implementación ya contiene `ChainDynamics`, `SpatialHash`, primitivas SDF analíticas y `ChainCurve`. `HangingLanterns` usa mallas agrupadas y deformación CPU. Extender a lianas, colas, cuerdas u orgánicos solo en un caso real; preferir shader para follaje masivo. `SpatialHash` no es adecuado para densidad extrema por sí solo: cuando casi todos colisionan, hay casi `N(N-1)/2` candidatos. Usar grupos, máscaras, topología, LOD y restricciones de interacción antes de construir un segundo índice.

Los cuerpos rígidos/puntos de terreno/personaje deben permanecer bajo la autoridad existente. Probar interacciones críticas antes de usar cadenas como cuerdas de balanceo o puentes físicos.

## 14. Calidad adaptativa y presupuestos separados

`renderResolution.ts` ya define `balanced`, `performance`, `native`. Mantener selección manual; una opción **Auto** futura puede adaptar subsistemas según cuello de botella.

- CPU-bound: diferir jobs, disminuir actualizaciones cosméticas, reducir cálculos repetidos.
- GPU fragment-bound: menor resolución de nube, menor área de alpha, menos sombras volumétricas, escalado controlado.
- GPU vertex/draw-bound: HLOD/instancing/culling.
- VRAM/memoria-bound: descarga, KTX2, residencia y eviction.

Usar media móvil o percentiles con ventanas, umbrales de entrada/salida diferentes y tiempo mínimo de permanencia en cada perfil. No cambiar ajustes con cada frame. Nunca degradar resolución de HUD/CSS; usar hardware scaling solo sobre render 3D.

## 15. IA y navegación escalonada (futuro)

No se comprobó un sistema de miles de NPC actualmente. Si se añade, recomendar **simulation LOD** con comportamiento próximo a frecuencia alta y distant behavior a baja frecuencia, navegación jerárquica, spatial index para percepción, eventos en vez de polling por frame, y estado semántico persistente. No implementar sin casos de uso y pruebas. No confundir animación de fauna con IA de combate; sus presupuestos pueden diferir.

## 16. Prioridades de compatibilidad y fuentes de referencia

- Babylon.js Optimizing Your Scene: https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/
- Babylon.js GPU Particles: https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/gpu_particles
- Babylon.js Compute Shaders (WebGPU únicamente): https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader/
- GPU Gems 3 Broad Phase: https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-32-broad-phase-collision-detection-cuda
- XPBD: https://matthias-research.github.io/pages/publications/XPBD.pdf
- Small Steps: https://matthias-research.github.io/pages/publications/smallsteps.pdf
- KTX2: https://github.khronos.org/KTX-Specification/ktxspec.v2.html
- glTF extensions: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0

Todas las capacidades deben verificarse en **Babylon.js 9.32.0** y el `Engine` WebGL real de Auralia, no en ejemplos que presuponen WebGPU.

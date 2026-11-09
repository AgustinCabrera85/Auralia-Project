# 05 · Validación, benchmarks y criterios de calidad

**Base:** `main` `b511d35`; documento de validación para **cambios futuros**, no acta de pruebas ejecutadas por este asistente. La evidencia del benchmark físico precedente se cita desde `docs/FISICA_SECUNDARIA.md` y `artifacts/physics/*`.

## 1. Evidencias y condiciones reproducibles

Separar cuatro tipos de evidencia:

1. **Estática:** el archivo/import/contrato existe y se ha revisado; no demuestra compilación ni funcionamiento.
2. **Automatizada:** comando exacto, exit code, salida/log y SHA de checkout; permite verificar invariantes.
3. **En navegador:** escena, cámara, clima, duración, perfil gráfico, contadores y capturas de antes/después; comprueba UX y composición de frame.
4. **Benchmark comparativo:** A/B con mismo commit o variantes controladas, hardware, resolución, warmup, datos fijos, muestras, p50/p95/p99. Demuestra impacto local, con límites explícitos.

### Formato de ficha de benchmark

```json
{
  "experimentId": "O02-job-scheduler-brin-001",
  "commitBefore": "<sha>",
  "commitAfter": "<sha>",
  "dateUtc": "<iso8601>",
  "environment": {
    "os": "<sistema>",
    "cpu": "<modelo>",
    "gpu": "<modelo>",
    "ramGb": null,
    "browser": "<nombre-version>",
    "node": "<version>",
    "babylon": "9.32.0",
    "backend": "webgl2 | webgpu | otro",
    "cssResolution": [1920, 1080],
    "renderResolution": [1920, 1080],
    "quality": "balanced",
    "telemetryEnabled": true
  },
  "scenario": {
    "id": "bosque-ilustrado",
    "playerPosition": [-730, 0, -420],
    "cameraPose": "<matriz/alpha-beta-radius-target>",
    "weather": "<preset>",
    "runType": "steady | stream | teleport | cold-start",
    "warmupSeconds": 15,
    "measureSeconds": 30,
    "repetitions": 3
  },
  "before": {
    "frameMsMedian": null,
    "frameMsP95": null,
    "frameMsP99": null,
    "gpuMsMedian": null,
    "drawCallsMedian": null,
    "estimatedMemoryBytes": null
  },
  "after": {
    "frameMsMedian": null,
    "frameMsP95": null,
    "frameMsP99": null,
    "gpuMsMedian": null,
    "drawCallsMedian": null,
    "estimatedMemoryBytes": null
  },
  "notes": "No registrar métricas inventadas. Null = dato no disponible."
}
```

Los valores nulos son marcadores, **no resultados reales**. Si la GPU asíncrona no entrega datos, registrar `null` y **no imputar cero**. No comparar con vsync/backends diferentes sin indicar el sesgo.

## 2. Escenarios obligatorios y objetivos de prueba

| Escenario | Posición de referencia | Carga / sistema | Riesgo funcional a vigilar |
|---|---|---|---|
| Brisalia | X=1, Z=10 | Arranque, ciudad, interacciones, construcción, terreno y props | Save, colisiones, artefactos de LOD, HUD |
| Bosque Ilustrado | X≈−730, Z≈−420 | Miles de instancias V4, viento, alpha/overdraw, sombras | Densidad aparente, raíces apoyadas, frustum |
| Pradera Florida | X≈−790, Z≈−510 | Flores, matas, batches y transiciones de LOD | Alpha clip, popping, pasto flotante |
| Laguna Tres Vertientes | X≈−160, Z≈−810 | Shader de agua, caústicas, cascadas, spray y nado | Superficie uniforme, unión río/caída, buceo |
| Paso de Altapiedra | X≈−275, Z≈−535 | Viaductos, túneles, colisiones, faroles XPBD | Apoyo, cámara, penetración, salida de galerías |
| Gruta submarina | Usar punto de entrada de `LAGUNA_Y_VERTIENTES.md` | Cambio de atmósfera y luces locales | Liberación, cámara sumergida, no fugas |
| Travelling lento | Ruta fija Brisalia→región próxima | Cola de chunks, caché, HLOD | Tiempos de carga y estabilidad |
| Sprint + giro brusco | Ruta conocida con camera pose fija | Priorización y rayos de cámara | Pop-in, tareas obsoletas, p99 |
| Teletransporte | Entre dos regiones separadas | Cancelación y recuperación de streaming | Suelo continuo, assets liberados |
| Retorno repetido | Ir y volver 10–20 veces | Lifecycle, pools, recursos GPU | Conteos, memoria residente y objetos fantasma |

Estas posiciones son referencias geográficas del repositorio. Codex debe registrar la **posición Y real** del jugador y la cámara en cada ejecución. Las capturas usan transformación de cámara exacta, no solo las mismas coordenadas X/Z.

## 3. Comandos y alcance real

| Comando | Responsabilidad principal | Notas |
|---|---|---|
| `npm ci` | Reproducibilidad de dependencias | Se ejecuta en el checkout con lockfile |
| `npm run check` | Validación TypeScript estricta | Debe identificar importaciones editor ausentes y tipos incompatibles |
| `npm run build` | Compilación + Vite | No demuestra rendimiento en navegador |
| `npm run test:stream` | Terrain streaming, material y cobertura | Actualizar expectativas para topología real, sin suavizar tolerancias para ocultar huecos |
| `npm run test:grass` | Bakes y matrices estables | Verificar agua/orillas/pendiente/streaming |
| `npm run test:vegetation` | Instancias, LOD y colisiones de árboles | Conservar fuente de datos determinista |
| `npm run test:props` | Props, geología, colisiones/recursos | Mantener 17 piezas del pack de rocas |
| `npm run test:physics` | Matemáticas de cadenas, SDF, hash, lifecycle | Abarca casos extremos y opciones habilitadas |
| `npm run bench:physics` | Benchmarks CPU físicos existentes | No interpretar como FPS de juego |
| `npm run test:telemetry` | Contadores, exportación y muestras | Ningún instrumento costoso oculto |
| `npm run test:lagoon` | Geometría/agua/travesía de laguna | Validación de cuenca, nado, galerías |
| `npm run test:routes` | Puentes, caminos y transiciones | Confirmar apoyo/altura |
| `npm run test:traversal` | Movimiento/cámaras/saltos | No cambiar autoridad del controlador |
| `npm run test:sky` | Componentes de cielo | Complementar con capturas de nube día/noche |
| `npm run test:biomes` | Texturas y reglas del bioma | Distinguir catálogo de material efectivamente activo |
| `npm run test:santi` | GLB, animación y morphs | No perder NLA ni skin al comprimir |
| `npm test` | Suite agregada | No afirmar éxito si falla prueba de relieve preexistente |

**Nota:** estos scripts se verificaron en `package.json`. Su ejecución por Codex debe ocurrir **después** de cerrar P0, y los logs deben indicar si el estado inicial impide correr la suite.

## 4. Matriz de aceptación por técnica

| ID | Hipótesis | Métrica principal | Verificación funcional | Criterio de rechazo/rollback |
|---|---|---|---|---|
| O00 | Checkout coherente | `check`/`build` y árbol completo | Editor, terreno, 6 pesos/materiales, test de seam | Fuentes faltantes, stubs, suelo con grietas |
| O01 | Medición reproduce hotspot | CPU/GPU por fase, p95/p99, cobertura de muestras | Cero efectos de instrumentación cuando F8 está oculto | Overhead mayor al problema o datos imposibles de reproducir |
| O02 | Scheduler reduce hitches | p95/p99 de frames, tiempo de cola, jobs tardíos | Suelo prioritario, agua y props se crean sin huecos | Aumenta significativamente latencia de gameplay o pop-in |
| O03 | Caché evita muestreo redundante | µs por muestra, hit rate, bytes, ms por región | Determinismo de terreno/orillas/pendientes | Cache invalida mal, desplaza objetos o cambia colisiones |
| O04 | Batches incrementales reducen alloc/upload | bytes/refresh, p95 refresh, GC, transferencias | Matrices, LOD, bounds, cristal/IDs y exclusiones iguales | Instancias fantasma, elementos invisibles, recursos perdidos |
| O05 | HLOD reduce escena distante | GPU ms, draw calls, tris, active meshes | No pop-in grave, sombras y colisión igual | Transiciones intrusivas, pérdida de objetos interactivos |
| O06 | Menor overdraw con igual silueta | GPU ms en vegetación, capas por píxel | Bordes de hojas, viento, sombras | Hojas recortadas o degradación estética inaceptable |
| O07 | Compresión reduce VRAM/tráfico | MiB VRAM, bytes, decode ms, warm/cold load | Texturas 1K, color/normal, rig/NLA | Hitches, pérdida de animación, fallos de decodificador |
| O08 | Cielo optimiza carga/render | ms inicialización CPU, GPU ms cielo, VRAM | Nube default, tormenta, luna, sin ghosting | Formas rígidas, artefactos y mala compatibilidad |
| O09 | Agua reduce costo sin afectar flujo | build ms, GPU ms, masks/bytes | Cascada/unión/nado/cámara/salida | Tiras, huecos, agua flotante, control roto |
| O10 | Prefetch reduce pop-in | time-to-visible, solicitudes canceladas, backlog | Teletransporte y streaming sin huecos | Memoria sin límite, trabajo obsoleto publicado |
| O11 | GPU particles solo cuando escalan | CPU/GPU ms por n partículas, memoria | Emisión/luces correctas, fallback | Mejora aparente por eliminar interacciones esenciales |
| O12 | Adaptativo sostiene frame pacing | p95/p99, calidad real, ajustes/min | No afecta HUD/input, permite manual | Oscilación, reducción excesiva de calidad |
| O13 | Layout SoA/pools reduce GC | bytes alloc/frame, pausas GC y CPU | Igualdad de geometría/identificadores | Retención excesiva de memoria o complejidad superior al beneficio |
| O14 | IA escalonada preserva lógica | CPU por entidad, latencia de estado | Misiones/interacciones se conservan | NPC se queda congelado en interacción importante |
| O15 | Física extendida justificada | solver ms, contactos, residual, presupuesto | No altera traversal ni rigs | Hash peor en densidad, colisiones omitidas sin autorización |

### Umbrales de aceptación

No fijar ganancia porcentual universal. Codex debe acordar/estimar un criterio de mínima relevancia **antes** de implementar, basado en repetibilidad, costo de mantenimiento y error del benchmark. Recomendación operativa: si el intervalo de variabilidad de medidas A/B se solapa ampliamente, marcar *inconcluso* y repetir; no declarar éxito por diferencias de 1–2 muestras. Para calidad visual, la condición es comparabilidad fotográfica con aprobación de los cambios deliberados.

## 5. Test del scheduler cooperativo

Desarrollar tests de funciones puras, con reloj inyectado (`now` fake) y trabajos reproducibles:

```text
SJ-01: high-priority traversable terrain siempre precede a decal/grass.
SJ-02: la cola mantiene dependencias; un child LOD no se publica incompleto.
SJ-03: un job yieldable conserva progreso y se reanuda sin repetir vértices.
SJ-04: maxJobsPerTick y deadline no bloquean la actualización de Santi.
SJ-05: los trabajos de una revisión anterior se descartan sin crear mesh.
SJ-06: cancelar un job libera buffers/resources y no dispara callbacks tardíos.
SJ-07: jobs con igual prioridad mantienen política estable o fairness explícita.
SJ-08: un job atómico largo reporta overrun; el sistema no miente sobre presupuesto.
SJ-09: teletransporte reordena prioridad y asegura suelo antes de decoración.
SJ-10: cerrar escena cancela cola y no deja observers, timers ni materiales.
```

Evitar tests dependientes del tiempo real de CPU para la lógica del scheduler. Los tests de performance deben ser experimentos aparte.

## 6. Test de caché de terreno y consistencia geométrica

```text
TC-01: altura cacheada == sampleMainlandHeight para mismas entradas.
TC-02: cacheHit, miss y evictions contabilizados correctamente.
TC-03: ±0.001 en bordes y coordenadas negativas no genera claves erróneas.
TC-04: distintas revisiones de mundo no comparten valores incompatibles.
TC-05: interacciones de 4 bordes entre near/mid/far no abren triángulos.
TC-06: normal y peso de material coinciden al llegar a una costura.
TC-07: cerca de agua, grass/props usan triángulo de terreno visible.
TC-08: alturas/collisions no dependen del nivel gráfico lejano.
TC-09: cargar dos veces un chunk genera mismas posiciones y pesos.
TC-10: cache de tamaño limitado expulsa regiones sin perder corrección.
```

El test de costura debe extraer posiciones de bordes de las mallas *renderizadas*, no comparar únicamente helpers puros. Si se usa topología refinada, incluir parejas de LOD en ambos ejes y vista desde abajo (para detectar triángulos verticales superpuestos).

## 7. Test de instancias, HLOD y culling

```text
IN-01: mismo seed + misma región => mismas matrices que versión baseline.
IN-02: buffer parcial sólo actualiza sectores afectados.
IN-03: bajar count no deja matrices viejas activas.
IN-04: AABB incluye deformación máxima por viento y escala de GLB.
IN-05: al entrar/salir de región, meshes/geometry/texture IDs se liberan.
IN-06: recurso recolectable conserva id, cooldown y visibilidad correcta.
IN-07: el HLOD no recibe picking ni colisiones como sustituto de originals.
IN-08: los árboles cerca del jugador siguen con colisiones reales.
IN-09: teletransporte activa LOD sin agujeros/pop-in prolongado.
IN-10: cámara dentro de gruta no dibuja excesivamente el exterior oculto.
IN-11: la sombra del objeto no desaparece indebidamente al quedar fuera de frustum.
IN-12: atlas/material compartido mantiene la variación estilística.
```

## 8. Test de cielo, agua y materiales

```text
VIS-01: `?cloudRenderer=pieces` es referencia visual default.
VIS-02: `noise` experimental no sustituye default sin benchmark/calidad.
VIS-03: atlas y masks conservan bordes suaves en low/standard/high.
VIS-04: día/noche/tormenta no muestran ghosting temporal.
VIS-05: cambiar render resolution no cambia orientación y fase de nubes.
VIS-06: materiales activos reciben número correcto de pesos de bioma.
VIS-07: textura array tiene fallback cuando falta WebGL2/bitmap.
VIS-08: materiales liberan textures y observers en dispose.
VIS-09: unión río-cascada comparten bordes sin tira ni muro vertical.
VIS-10: caústicas no se aplican sobre regiones secas indebidamente.
VIS-11: superficie de laguna no cambia de altura al descartar vértices.
VIS-12: bajo el agua, cámara, niebla y luz local se retiran al salir.
VIS-13: cambio de LOD de agua/terreno no modifica nadabilidad.
VIS-14: KTX2 piloto mantiene visual de normal/alfa y mipmaps.
VIS-15: meshopt piloto conserva transformaciones y materiales de GLB.
VIS-16: Santi conserva 35 acciones, shape keys y remera separada.
```

## 9. Test de física secundaria y colisiones

Usar `tests/physics.test.cjs` y extender **solo** ante cambios comprobados:

- Buscar equivalencia de candidatos del `SpatialHash` frente a brute force con AABB multicelda, grandes volúmenes y negativos.
- No exigir que el índice sea más veloz en concentración extrema: registrar densidad y costo real.
- Verificar anclajes de masa inversa 0, error longitudinal, compliance, degenerados, FTL/PBD/XPBD y teletransporte.
- Mantener precisión de contactos de cápsula/segmento contra primitivas y límites explícitos de CCD.
- Medir penetración **residual después del solver** además de penetración máxima previa.
- Comprobar interacción de faroles con cápsula del jugador sin cambiar traversal.
- Revisar que `dispose()` de faroles retire `ChainState` y meshes; repetir entradas a túneles.

Benchmark preexistente `docs/FISICA_SECUNDARIA.md`: en 2.000 cadenas dispersas el índice mejora sustancialmente frente a búsqueda exhaustiva; en 2.000 cápsulas densas con casi todos los pares candidatos el índice empeora. Reproducir esos perfiles antes de ampliar el sistema.

## 10. Capturas, perf y evidencia visual

Guardar por experimento:

```text
artifacts/optimization/<id>/
    environment.json
    before.json
    after.json
    benchmark-notes.md
    before.png
    after.png
    tests.log
```

Evitar añadir automáticamente capturas grandes al repositorio si inflan descargas: decidir según flujo actual y `.gitignore`. Conservá en el informe enlaces o rutas verificadas, no supuestas.

Las capturas A/B deben usar cámara y clima iguales. Para prueba submarina registrar profundidad de cámara y posición de Santi; para terreno, cámara rasante mostrando seams; para follaje, viento fuerte y silhouette de copas; para nubes, posición del sol/luna y estado de tormenta.

## 11. Interpretación de porcentajes y límites

Cálculo de mejora para duración:

\[
\mathrm{reduccion}_{\%}=100\left(1-\frac{t_{after}}{t_{before}}\right)
\]

Para ratio de velocidad: `speedup = t_before / t_after`. No sumar porcentajes de optimizaciones diferentes. Si cambia el número de entidades simuladas (LOD físico/sleeping), indicar **calidad y entidades activas** junto al tiempo: no equivale a la misma carga completa.

Cuando se reporte VRAM, diferenciar bytes estimados de texturas con bytes realmente asignados por la GPU; un WebP de 1 MB descargado puede ocupar ~4 MiB sin mipmaps como RGBA8 1K. Los perfiles del navegador no miden toda la memoria del proceso ni la VRAM siempre; reportar el alcance real.

## 12. Estado de ejecución que debe quedar siempre explícito

| Tipo de evidencia | Estado al entregar este dossier | Próxima acción de Codex |
|---|---|---|
| Lectura de archivos en `main` | Verificada estáticamente al SHA fijado | Revalidar SHA y `git status` |
| Disponibilidad de editor | **No presente en árbol remoto auditado** | Recuperar genuinamente o bloquear compilación |
| Consistencia terrain/skirt | **Discrepancia verificada** | Reparar coherentemente y testear seams |
| Material activo nuevo | **No confirmado en render** | Trazar imports/selector y probar |
| Tests `npm` desde esta auditoría | **No ejecutados** | Ejecutar y registrar logs |
| Benchmarks físicos existentes | Documentados por proyecto | Reproducir antes de comparar nuevas técnicas |
| Nuevos benchmarks globales | **No ejecutados** | Instrumentar, medir, guardar evidencia |
| Modificaciones del juego por este dossier | **Ninguna** | Codex implementa gradualmente en main |

## 13. Decisión de cierre por fase

Una fase queda **aceptada** si (i) hay baseline y comparación honesta, (ii) mantiene invariantes y pasa tests pertinentes, (iii) no introduce regresiones visuales no aceptadas, (iv) tiene rollback explícito y (v) se documentaron límites. De lo contrario queda **bloqueada**, **en evaluación** o **descartada**, con motivo. Ningún número del vídeo original es garantía de mejora para Auralia.

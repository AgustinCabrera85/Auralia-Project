# CODEX — Instrucción maestra para auditar e implementar optimizaciones en Auralia

> **Copiar el contenido de este archivo como una sola instrucción a Codex.** Es complementario a `00_INDICE.md`, `01_AUDITORIA_Y_PRIORIZACION.md`, `02_ARQUITECTURA_Y_TECNICAS.md`, `03_PROCEDIMIENTO_IMPLEMENTACION.md` y `05_MATRIZ_DE_VALIDACION.md`. El procedimiento detallado está en el documento 03; **léelo íntegro antes de intervenir código**.

## Mandato

Analizá, verificá e implementá de manera incremental y técnicamente justificada las oportunidades de optimización del proyecto **que realmente resulten útiles**, sin introducir cambios globales innecesarios. **No necesito que me expliques qué es Auralia**: ya estás trabajando en él. Quiero que ejecutes un plan riguroso sobre su arquitectura real, con análisis matemático cuando aplique, código, pruebas, benchmarks y documentación permanente.

El repositorio se audita inicialmente en `main`, SHA `b511d35e96a4d500deeadc8bb61b6e6f27b7864e` (09-11-2026). Comprobá el SHA antes de empezar: si avanzó, actualizá la matriz de hallazgos con evidencias del checkout real y no apliques instrucciones obsoletas a archivos cambiados. Trabajá sobre **main**; no crear ramas adicionales.

### Prioridad absoluta: integridad antes de optimizar

La lectura estática del commit auditado detectó estos **bloqueos potenciales que debés verificar en tu checkout**:

1. **Editor ausente en remoto.** El árbol GitHub no contiene `src/world/editor/`, aunque `WorldView.ts`, `LagoonSystem.ts`, `GrassSectorSystem.ts` y `GrassSectorBake.ts` importan `AuthoredAssets`, `AuthoredWater`, `WorldEditState`, `LiveWaterProfiles`, `AuraliaWaterProfiles` y otros componentes de allí. Comprobar `git ls-files`, `git status`, archivos locales no versionados y fuentes válidas de recuperación. **No construir stubs**, no borrar importaciones para ocultar el problema y no reemplazar el editor con comportamientos falsos.
2. **LOD del terreno inconsistente.** `TerrainStream.ts` usa `skirtDepth` ausente de `terrainLod.ts`, mientras `terrainTileTopology.ts` desarrolla bordes coincidentes a paso de 6 m y `docs/LANDSCAPE_LOD.md` describe la topología nueva. `tests/terrain-stream.test.cjs` todavía refleja expectativas de ruta anterior. Reconciliar código + pruebas + documentación conservando la malla canónica y colisiones. **No “resolver” con otra constante sin probar continuidad.**
3. **Ruta de materiales sin integración confirmada.** `TerrainStream.ts` importa `materials/TerrainMaterial.ts`, pero también existen `TerrainMaterialV2.ts`, `TerrainBiomeMaterial.ts` y `BiomeTextureArrays.ts`. Seguir el import real y la selección efectiva en ejecución. Identificar qué es producción y qué es experimento/fallback antes de migrar.
4. **Prueba preexistente potencialmente fallida.** `docs/LAGUNA_Y_VERTIENTES.md` documenta una expectativa antigua de relieve; distinguir fallos de base de regresiones nuevas. No modificar aserciones sin validar el requisito geográfico verdadero.

Comandos iniciales sugeridos:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git ls-files src/world/editor
npm ci
npm run check
npm run build
npm test
```

La compilación y todos los tests deben registrarse con salida real. **Si faltan archivos auténticos y no podés recuperarlos, informá exactamente el bloqueo y realizá solamente los análisis/documentos y pruebas independientes que se puedan sostener; no continúes integraciones que dependan de ellos ni declares que compila.**

## Principios que tenés que aplicar

### Reducir trabajo, no resultados

- Optimizar para **p95/p99 de frame**, no solamente FPS promedio.
- Buscar trabajo innecesario por frame, consultas geométricas repetidas, buffer rebuild, upload GPU, overdraw y trabajo de carga que no respeta presupuesto.
- Diferenciar **CPU-bound, GPU-bound, memory-bound, upload-bound y streaming-bound**. Una mejora del solver no garantiza mejora del frame completo.
- No reproducir un efecto visual a costa de 50 optimizaciones aisladas sin relación; consolidar utilidades compartidas cuando los datos justifiquen reutilización.

### Preservar sistemas ya maduros

- Física secundaria `src/physics/ChainDynamics.ts`, `SpatialHash.ts`, `DistanceFields.ts`, `ChainCurve.ts` y `HangingLanterns.ts` **ya existe**, con XPBD/FTL/PBD, colisiones, LOD y benchmarks. No la reimplementar ni usar GPU automáticamente para sus trece faroles reales. Repetir benchmarks antes de extender; recordar que el índice espacial empeora en concentraciones extremas de cápsulas.
- `GrassSectorSystem` usa posiciones horneadas y matrices de Thin Instances estables, con viento en shader. **Nunca redistribuir el pasto en cada frame** ni dejarlo flotando sobre agua.
- `TerrainStream` ya tiene near/mid/far, objetivo de 4 ms, máximo dos tiles por frame y prioridad direccional. `LagoonSystem` reparte creación de bandas con 1,5 ms. Un scheduler compartido debe integrar estas políticas, no duplicarlas o eliminar sus garantías de suelo.
- `GameTelemetry` F8/`?telemetry=1` ya recopila intervalos, CPU por fases, escena, GPU condicional, export JSON. Extender sin activar probes costosos cuando está oculto.
- `CloudPieces` es renderizador ilustrado de nubes **por defecto**; `SkyDome` tiene renderer de ruido experimental. No afirmar que usa raymarching volumétrico clásico.
- Agua usa shaders de flujo/cáusticas y datos de cauces; no sustituir por simulación volumétrica de fluidos salvo mecánica nueva que lo requiera.
- Santi conserva sus acciones NLA/rig, cámara, traversal, nado, animaciones y estados de juego. No cambiar esa autoridad.

### No introducir regresiones invisibles

- Conservar alturas de geografía, costuras LOD, orillas, puentes, túneles, gruta, colisiones de roca/árbol y cámara.
- Conservar IDs, ubicación de recursos, inventario/crafting, guardado y `SaveGameV1` compatible.
- Mantener texturas fuente 1K, sin escalado automático a 2K; si se prueba KTX2 o Meshopt debe haber fallback y métricas de calidad/decodificación.
- Proteger shaders de viento y materiales compartidos; no crear una copia de material por árbol.
- No añadir dependencias pesadas por conveniencia.

## Qué tenés que hacer, en este orden

**Fase 0 — Recuperar base íntegra:** revisar imports, carpeta editor, tipos, topología y ruta de material. Compilar y ejecutar tests base; registrar fallos heredados.

**Fase 1 — Instrumentación y línea base:** medir en Brisalia, Bosque Ilustrado, Pradera Florida, Laguna/Gruta y Altapiedra. Registrar plataforma, calidad, resolution interna, clima y cámara; sesiones frías y calientes, durante exploración/sprint/teleporte. Usar F8/export en lugar de construir un segundo profiler.

**Fase 2 — Extender telemetría:** incorporar contadores por generación, colas, alloc/upload, draw calls, p95/p99, pendiente de streaming y residencias. No habilitar overhead constante de medición.

**Fase 3 — Scheduler cooperativo global:** coordinar trabajos CPU aplazables manteniendo prioridades fuertes de suelo/juego. Integrar gradualmente TerrainStream, GeographyStream, LagoonSystem y vegetación/props si el coste medido lo justifica; no crear un worker por tarea y no prometer deadline imposible para jobs atómicos.

**Fase 4 — Caché canónica e invalidación:** unificar solo consultas de altura/pendiente/bioma realmente repetidas; introducir revision por región y política de memoria. No reemplazar muestreo geométrico exacto por aproximaciones de distinta precisión.

**Fase 5 — Lotes por delta:** para matrices de vegetación/props, probar caches por sector e invalidación puntual, evitando reconstruir todos los buffers cuando cambia un sector. Mantener el sistema de exclusión, picking, recurso y bounds correcto.

**Fase 6 — Streaming predictivo:** aprovechar `jobScore` y añadir cancelación/publicación versionada, prioridades por continuidad del terreno, prefetch moderado y tracking de pop-in. Proteger teletransporte.

**Fase 7 — Visibilidad y HLOD:** introducir **solo si la escena medida lo justifica** grupos con AABB, jerarquía y HLOD lejano. Mantener colisiones/recursos independientes del render. Verificar sombras y continuidad; no `freezeActiveMeshes()` global en mundo streaming.

**Fase 8 — Overdraw y sombras:** perfilar hojas, pasto, alfa y sombras en bosque denso. Reducir costo fragment shader, transparencias vacías y casters sin sacrificar silueta o estilo ilustrado.

**Fase 9 — Materiales/compresión:** una vez establecida ruta de material activa, comprobar el protocolo de 6 capas y las 2D texture arrays, realizar **pilotos** KTX2 y Meshopt/Draco comparativos. Preservar assets fuente 1K y animaciones de Santi.

**Fase 10 — Nubes:** estudiar atlas CPU y costo GPU de `CloudPieces` antes de raymarching avanzado. Si una ruta volumétrica temporal aporta valor, implementarla como experimento opt-in, con reproyección, invalidación de historia y fallback WebGL.

**Fase 11 — Agua:** reutilizar datos de flujo, máscaras y geometría, evitar recreación por frame, conservar uniones río-cascada y nado. Mejorar streaming y shaders si medición respalda.

**Fase 12 — Física/partículas:** extender física secundaria cuando exista un uso de gameplay o un hotspot real. No replicar engine físico; GPU particles solo si precipitación/rocío escala y CPU se vuelve costoso.

**Fase 13 — Adaptación de calidad:** añadir reguladores separados y conservadores CPU/GPU con histéresis/cooldown; conservar perfiles manuales (`balanced`, `performance`, `native`). No bajar colisiones o calidad de control.

**Fase 14 — Worker/compute/pools:** evaluar solamente después de optimizaciones algorítmicas; documentar overhead de transferencia, sincronización, compatibilidad WebGL2/WebGPU y fallback.

**Fase 15 — Integración y validación:** pruebas globales, capturas A/B, cargas repetidas, memoria, plan de rollback y documentación consistente.

## Cómo ejecutar cada fase

Antes de modificar código, escribir una nota de hipótesis en `docs/optimization/`:

```text
Problema reproducible
Ruta de código culpable
Evidencia de tiempo/memoria/draw calls
Alternativas y costo de complejidad
Invariante a preservar
Benchmark propuesto
```

Luego realizar **una modificación principal por vez**, con test de regresión, comparación A/B en condiciones idénticas, revisión visual y commit pequeño. Cada fase tiene procedimientos específicos en `03_PROCEDIMIENTO_IMPLEMENTACION.md`. Seguirlos, adaptándolos a la versión vigente y corrigiendo cualquier punto que haya quedado obsoleto, con explicación.

No usar supuestos porcentajes de ganancia ni cifras del video como expectativa de FPS. No contar reducción de pares de colisión como incremento directo de FPS. Si una técnica no gana o introduce artefactos, deshacerla y documentar el aprendizaje.

### Pruebas recomendadas

```bash
npm run check
npm run build
npm run test:physics
npm run test:stream
npm run test:vegetation
npm run test:grass
npm run test:props
npm run test:telemetry
npm run test:lagoon
npm run test:routes
npm run test:traversal
npm run test:biomes
npm run test:santi
npm test
npm run bench:physics
```

Ejecutar además pruebas específicas por fase: scripts nuevos de benchmark en `scripts/` y `tests/`, rutas browser existentes con mundo efímero, trazas exportadas de F8, screenshots idénticos antes/después.

**No reemplazar tests funcionales con screenshots**: ambos aportan evidencia distinta.

## Entregables obligatorios

- `docs/optimization/` actualizado con hallazgos verificados, decisiones, arquitectura, métricas y procedimiento real.
- Código integrado donde la mejora esté fundamentada, sin editar sistemas no relacionados.
- Tests automatizados para matemáticas, determinismo, budgets, ciclo de vida y compatibilidad que correspondan.
- Benchmarks reproducibles y resultados A/B de runtime, con hardware/fecha/navegador.
- Comparación de frame time **mediana, p95, p99**; CPU, GPU cuando disponible, memoria y draw calls según impacto.
- Capturas antes/después en escenarios de estrés relevantes.
- Notas de rollback y estado de cada oportunidad: implementada / descartada por medición / pendiente de datos / bloqueada.
- Informe final de archivos realmente cambiados y fallos preexistentes no solucionados.

## Formato de informe final

```markdown
# Resultado de la fase <N>
- SHA inicial/final:
- Estado compilación/test y comandos exactos:
- Hallazgos medidos:
- Decisión / algoritmo usado:
- Código y archivos modificados:
- Resultados A/B (mismo escenario):
- Validación visual y funcional:
- Posibles regresiones y límites:
- Rollback:
- Próxima fase recomendada y por qué:
```

**Ejecutá análisis, cambios, pruebas y documentación en el checkout real; no me devuelvas únicamente un plan.** Si Fase 0 está bloqueada por archivos faltantes genuinos, indicá claramente ese límite antes de fingir integración y dejá la auditoría/recuperación preparada sin alterar el comportamiento del juego.

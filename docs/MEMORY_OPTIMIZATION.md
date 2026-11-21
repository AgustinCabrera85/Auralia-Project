# Reducción de memoria: Brisalia y mundo jugable

20 de noviembre de 2026. Motivación: el navegador del usuario mostraba 2,2 GB para la pestaña.

## Cambios sin reducir el detalle visual

1. `SharedTextureBuffers.ts` comparte también la fuente codificada de las texturas de edificios que Babylon ya comparte en GPU. Cada envoltorio apuntaba antes a otra copia del archivo. Se conserva la fuente del objeto interno para restauración de contexto, clonación y serialización; no cambian los píxeles, mapas PBR, UV ni muestreo.
2. `WayfindingSystem.ts` libera 12 mapas antiguos de madera que dejaron de usarse al aplicar la madera final. Se comprueban todas las referencias de materiales antes de liberar cada textura.
3. `TerrainStream.ts`, `BrisaliaIvyVolume.ts` y los caminos de `BrisaliaVillage.ts` conservan atributos en Float32Array en lugar de arrays numéricos de JavaScript. El GPU ya usaba esa precisión. El terreno mantiene los índices compartidos y la consulta canónica de alturas.
4. Los nuevos faroles usan geometría/materiales compartidos, ninguna imagen adicional y hasta seis luces locales activas.

## Medición

Navegador Chrome de pruebas aislado, 28 edificios cargados y 27 faroles. Se solicitó recolección de basura mediante CDP para comparar memoria retenida. El juego no fuerza recolecciones de basura.

| Medida | Antes | Después |
| --- | ---: | ---: |
| Memoria JS informada por Chrome | 1.153,4 MiB | 821,9 MiB |
| Buffers únicos de imágenes codificadas | 407,7 MiB | 112,3 MiB |
| Buffers CPU de geometría estimados | 137,8 MiB | 112,3 MiB |
| Imágenes GPU residentes | 252 | 240 |
| Texturas RGBA + mipmaps estimados | 985,0 MiB | 957,0 MiB |

Reducción medida de memoria JS: aproximadamente 331,5 MiB (28,7 %). La eliminación de duplicados de imágenes ahorra unos 295,4 MiB. No se deben sumar estas columnas: la cifra JS incluye memoria que también se desglosa en buffers. El tamaño GPU es una estimación RGBA, no una medición del controlador.

La cifra de la tarjeta de Chrome incluye otros recursos del proceso y no equivale a `performance.memory`. No se afirma que los 2,2 GB originales se conviertan en una cifra exacta determinada. Conviene recargar la pestaña existente para liberar los recursos retenidos de la sesión anterior.

## Verificación y evidencias

- `npm run build`: correcto. Registro: `artifacts/memory/build.log`.
- `npm run test:wayfinding`: rutas, materiales, luces, personajes y movimiento correctos.
- `node tests/terrain-stream.test.cjs`: cobertura, costuras, cambios de LOD, teletransporte y alturas correctos. La primera ejecución coincidió con la compilación y superó el límite temporal de inicialización; la repetición aislada pasó en 2.480 ms, sin relajar la prueba.
- `node --experimental-transform-types tests/shared-texture-buffers.test.mjs`: propiedad de buffers, fuente de restauración, muestreo, carga pendiente e idempotencia correctos.
- Auditorías reales de Rev3, faroles y recorrido del castillo correctas.
- `scripts/memory-audit.browser.js`: medición reproducible, sin modificar recursos.
- Evidencias: `artifacts/memory/before-gc.json`, `detail.json`, `after.json` y `context-restoration.json`.

Los assets finales de Rev3 conservan sus bytes y resolución. No se redujeron polígonos, densidad de vegetación ni distancia visible como parte de esta optimización.

# Ejecución inicial del programa de optimización

Fecha: 2026-11-09. Rama `main`; HEAD inicial `b511d35e96a4d500deeadc8bb61b6e6f27b7864e`.

## Alcance y estado

Los seis documentos originales se conservan sin cambios en esta carpeta. Esta entrega aborda reproducibilidad y medición. No declara implementadas las fases 2–15: dependen de una hipótesis respaldada por datos y una comparación A/B.

El árbol ya contenía cambios de hidrología, óptica submarina, cascadas y rutas. Se conservaron. Por tanto, el SHA identifica la base Git, **no una revisión limpia equivalente al ejecutable medido**. `artifacts/optimization/phase0/initial-status.txt` conserva el estado inicial; cada benchmark incluye hashes de las fuentes y su estado Git. No se modificó Bosque Babylon ni la partida del usuario.

## Integridad comprobada

- El editor auténtico existía localmente, pero reglas de exclusión impedían versionarlo. Se hicieron explícitas las excepciones para sus fuentes, la página del editor, el mundo editable, el laboratorio de agua y cuatro texturas que necesita el runtime. No se crearon sustitutos ni se eliminaron importaciones.
- `scripts/audit-runtime.mjs` carga el parser real y verifica el documento de mundo: 152 ediciones de altura, 125 superficies, 88 áreas de pasto, 168 sectores de pasto horneado, 4 assets y 2 aguas. Conserva identificadores y matrices horneadas. El archivo de mundo no se reescribe.
- La ruta activa comprobada es `TerrainStream → TerrainBiomeMaterial → BiomeTextureArrays`. Hay 17 capas, tres samplers, fuentes 1024 px y arrays runtime 512 px. `TerrainMaterialV2` queda como fallback. Se corrigió la descripción desactualizada en `LANDSCAPE_LOD.md`.
- `terrainTileTopology` ya se utiliza: perímetros compartidos cada 6 m, interiores más espaciados y muestras globales de normales/pesos. El supuesto `skirtDepth` ausente del dossier no describe el código inspeccionado. No se cambió la geometría, las diagonales de colisión ni la autoridad de alturas.

### Instalación y compilación

Se creó `.test-build/optimization-clean` a partir de las fuentes del árbol de trabajo, incluyendo las dependencias auténticas recuperadas. Se instalaron dependencias desde el lockfile con `npm ci` y se compiló allí; el servidor abierto y su `node_modules` permanecieron separados. Esto comprueba dependencias limpias sobre esa instantánea, no un checkout limpio de HEAD.

`npm ci`, `npm run check` y `npm run build` terminaron con código 0. Vite informó bundles mayores de 500 kB; la compilación tardó 5 min 50 s. El intento offline no tenía todos los paquetes en caché y fue sustituido por la instalación normal. Una compilación iniciada antes de acabar la instalación fue interrumpida y no se considera evidencia válida. Los logs completos están en `artifacts/optimization/phase0/`.

### Pruebas y problemas pendientes

| Verificación | Resultado observado |
|---|---|
| Integridad de mundo/editor | Pasa |
| TypeScript | Pasa |
| Pasto, props, rutas, laguna, física, traversal, biomas y telemetría | Pasan |
| Santi | Pasa tras reparar la carga ESM del test; mismas aserciones |
| Suite completa | Falla en la referencia numérica de `regional-relief.test.cjs` |
| Streaming | Falla en el límite de inicialización de 2500 ms, antes de comprobar costuras |
| Vegetación | Falla la expectativa de que un proxy lejano específico tenga instancias |

La carga del test de Santi no resolvía la dependencia nueva `WaterOptics` mediante el cargador nativo de Node. El test ahora transpila ambos módulos reales, como ya hacía con su controlador; las importaciones de shaders usan extensiones ESM explícitas. No se sustituyen los módulos por mocks.

Los otros tres fallos se observaron antes de aplicar cualquier optimización. No se cambiaron tolerancias, coordenadas ni expectativas para convertirlos en éxitos. La suite agregada se detiene en relieve; las suites citadas como aprobadas se ejecutaron individualmente. La fase 0 mantiene esas incidencias abiertas y no equivale a una validación visual completa del mapa.

## Protocolo reproducible de medición

`tests/optimization.browser.mjs` conduce la escena aislada `tests/landscape-review.html`. `scripts/measure-optimization.mjs` se conecta únicamente a esa página mediante un perfil dedicado de Chrome con depuración local. Nunca carga ni guarda la partida real.

Se reutiliza el profiler F8. `GameTelemetry.snapshot()` y `reset()` exponen las mismas operaciones del panel, sin un segundo profiler. El anillo se copia cada cinco segundos para no perder muestras en capturas de 30 segundos a más de 60 FPS; se registra el costo de esas copias. La instrumentación y actualización del panel permanecen activas, aunque el panel es transparente durante las capturas.

Ejecutar con Vite abierto y un Chrome dedicado que tenga `/tests/landscape-review.html?telemetry=1`:

```powershell
# El Chrome dedicado debe escuchar solo localmente en el puerto 9343.
node scripts/audit-runtime.mjs
node scripts/measure-optimization.mjs artifacts/optimization/nueva-captura
```

Se pueden seleccionar escenarios mediante `AURALIA_SCENARIOS` (lista separada por comas); los valores predeterminados son seis escenas, tres repeticiones de 30 segundos y al menos 15 segundos de calentamiento hasta que se estabilizan cargas y recursos. `AURALIA_SECONDS` y `AURALIA_REPETITIONS` sirven para depurar el harness; una captura breve no cumple el protocolo de aceptación.

El benchmark conserva posición Y real, transformaciones de cámara, resolución interna/CSS, clima fijo, conteos, percentiles de las fases, GPU disponible y datos crudos comprimidos. La memoria JS no representa RAM total de Chrome ni VRAM. Los tiempos GPU son asíncronos y no se suman a CPU como intervalos consecutivos. Los tiempos DOM no se presentan como tiempo de juego listo.

## Reversión

Las modificaciones de instrumentación pueden revertirse independientemente del contenido del mundo: devolver export/reset a los manejadores F8 y retirar los dos scripts de benchmark. Los datos de mundo/editor recuperados deben conservarse; ocultarlos otra vez impediría reproducir el proyecto. No aplicar un `reset --hard` sobre este árbol con cambios previos.

## Referencia capturada

Evidencia: [baseline.json](../../artifacts/optimization/baseline-b511d35-fixed-orbit/baseline.json), junto con los 18 registros crudos comprimidos, seis capturas y el manifiesto de fuentes. Se completaron tres repeticiones de 30 segundos por escena, después de al menos 15 segundos de calentamiento y estabilización de cargas. No hubo excepciones del navegador durante la captura.

Condiciones: Chrome headless 156, WebGL2/ANGLE D3D11, RTX 3090, i7-8700K, aproximadamente 48 GiB de RAM física, Vite en desarrollo, calidad equilibrada, **1264 × 805 píxeles internos y CSS**, DPR 1, despejado a las 14:00 y reloj detenido. Es una referencia de esta escena aislada y esta resolución; no representa los FPS de la pestaña del usuario a 2560 × 1313 ni una compilación de producción.

Cada intervalo de la tabla es el mínimo–máximo de los percentiles de las tres repeticiones, en milisegundos; no se promedian percentiles ni se convierten en un supuesto FPS mínimo.

| Escena | Frame p50 | Frame p95 | Frame p99 | Render CPU p50 | GPU p50 | Draw calls p50 | Triángulos reportados |
|---|---:|---:|---:|---:|---:|---:|---:|
| Brisalia | 7,7–8,2 | 13,3–15,1 | 16,8–19,7 | 6,9–7,0 | 4,90–5,06 | 304 | 1.167.629 |
| Bosque ilustrado | 10,9–11,1 | 19,1 | 24,7–25,9 | 9,9–10,0 | 6,79–6,94 | 474 | 10.487.832 |
| Pradera florida | 10,9–12,0 | 18,8–19,6 | 22,7–26,7 | 9,9–10,9 | 6,80–7,31 | 469 | 11.283.821 |
| Laguna sumergida | 8,7–11,2 | 14,3–22,4 | 17,8–32,6 | 7,4–8,0 | 4,52–5,47 | 273 | 2.439.820 |
| Altapiedra | 10,0–10,1 | 16,5–16,7 | 20,0–22,1 | 8,9–9,0 | 5,66–5,92 | 309 | 3.389.254 |
| Entrada interior de gruta | 6,9–7,2 | 10,3–12,8 | 12,7–18,1 | 5,7–6,6 | 2,11–2,17 | 107 | 1.007.270 |

Hubo 14 frames mayores de 50 ms y ninguno mayor de 100 ms en estas ventanas. El máximo fue 79,4 ms. La primera repetición de laguna fue más lenta que las siguientes: se conserva, no se descarta como ruido. Las copias periódicas del profiler costaron entre 0,7 y 9,9 ms; esta sobrecarga está incluida y debe mantenerse igual en una comparación A/B.

Los snapshots finales del heap JS oscilaron entre aproximadamente 357 y 714 MiB. Los conteos de recursos se mantuvieron iguales entre las tres repeticiones de cada escena, pero esto **no demuestra ausencia de fugas**: falta la prueba prolongada de reposo y reentradas. Tampoco permite explicar por sí solo los 1,4 GB de RAM del proceso de Chrome reportados por el usuario.

### Límites y aceptación pendiente

- La fase 1 queda **parcial**: existe referencia en reposo. Faltan capturas equivalentes caminando, con sprint 2X, durante streaming/teletransporte, cambios de calidad y clima, cargas frías/calientes y recorrido completo de superficie–cueva–superficie. También falta medir memoria del proceso de Chrome, además del heap.
- La gruta se mide en su entrada interior sumergida, posición real `(80, Y registrada, -850)`, después de entrar por el portal de referencia `(-6, -858)`. No es una medición de todas sus salas.
- Las coordenadas exactas del dossier en bosque, pradera y Altapiedra intersectan plataformas blancas del prototipo. Se observan piernas ocultas y elementos provisionales en las capturas. Es evidencia del estado actual, **no aprobación visual ni de colisiones**. Conviene añadir puntos de observación libres de esos obstáculos al siguiente perfil de vegetación, conservando esta referencia.
- La laguna mantiene una vista submarina con el personaje visible, pero estas imágenes no validan todas las uniones río–cascada ni todos los ángulos de la línea de agua denunciados previamente.
- La captura exploratoria `baseline-b511d35` quedó descartada como referencia: `setTarget()` reconstruía la órbita a partir de la posición anterior. Se corrigió únicamente el harness y se repitieron las 18 capturas con órbita fijada después del teletransporte. No es una comparación antes/después de rendimiento.

## Decisión siguiente

El costo mediano de actualización del juego fue 0,3–1,3 ms, mientras que el bloque de renderizado fue 5,7–10,9 ms. Esto prioriza investigar renderizado, selección de mallas y detalle de vegetación. No demuestra un cuello de botella exclusivamente CPU: ese bloque puede incluir esperas del driver y la GPU también tiene costo relevante.

1. Resolver o explicar las tres incidencias de pruebas abiertas, en especial el cambio a proxy lejano de vegetación. Separar un presupuesto temporal de arranque de la comprobación funcional de costuras sin suprimir esta última.
2. Desglosar los aproximadamente 10–11 millones de triángulos reportados en bosque/pradera por malla, instancias, material y nivel LOD. Comprobar culling y límites de grupos antes de elegir una intervención. El siguiente cambio debe tener una hipótesis concreta y repetir este benchmark con las mismas condiciones.
3. Completar las capturas dinámicas y prolongadas de memoria. Solo después valorar presupuestos compartidos, cachés o cambios de streaming según los picos observados.

No se ha aplicado una optimización de renderizado ni se afirma una reducción de memoria o aumento de FPS en esta entrega. El resultado es recuperar reproducibilidad, corregir premisas del dossier y establecer evidencia para decidir la primera intervención.

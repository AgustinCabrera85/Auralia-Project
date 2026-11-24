# Investigación de memoria, tirones y equipamiento — 21/11/2026

Se encontró y corrigió una fuga reproducible en las bandadas: cada renovación al alejarse 115 m creaba once rigs nuevos y abandonaba once MorphTargetManager en la escena. Estos objetos conservaban deformaciones y animaciones aunque se hubieran eliminado las mallas. La renovación completa también bloqueaba el hilo principal. Se corrigieron además la carga tardía de la espada y las reconstrucciones repetidas de vegetación por cuadro.

## Evidencia en el juego antes de modificarlo

Lecturas del panel F8 de la sesión abierta, durante el recorrido del usuario por Sendero del Bosque Húmedo. Son ventanas distintas de diez segundos, no una comparación A/B de la misma cámara.

| Medida | X −1967, Z −953 | X −1710, Z −1088 |
|---|---:|---:|
| FPS | 46 | 20 |
| Tiempo medio / máximo de cuadro | 21,8 / 64,9 ms | 50,2 / 300,2 ms |
| P95 / P99 | 38,3 / 46,5 ms | 67,9 / 123,2 ms |
| CPU actualización | 8,7 ms | 30,2 ms |
| CPU Babylon | 11,9 ms | 18,8 ms |
| GPU asíncrona | 6,3 ms | 10,5 ms |
| Heap JavaScript aproximado | 2087 MiB | 2496 MiB |

Resolución de estas lecturas: 2027×1284. La etiqueta de Chrome llegó a indicar 2,4 GB. El antiguo bloque «Terreno/streaming» incluía también el trabajo de las aves: su pico de 250,5 ms no puede atribuirse exclusivamente al terreno. Ahora existe un bloque «Aves/hábitat» independiente.

Los porcentajes globales del monitor de recursos no describen el tiempo del hilo principal por cuadro. En estas lecturas el trabajo CPU limita antes que la GPU. El consumo estable en una posición tampoco descarta una fuga que se dispara al recorrer cierta distancia. Chrome distingue memoria del proceso y heap JavaScript; no se han medido aquí bytes reales de VRAM. Referencias: [actividad del hilo principal](https://developer.chrome.com/docs/devtools/performance/reference), [medidas de memoria de Chrome](https://developer.chrome.com/docs/devtools/memory-problems).

## Causa y reproducción aislada

En Babylon 9.32.0, `AssetContainer.instantiateModelsToScene` clona los MorphTargetManager. `InstantiatedEntries.dispose()` libera raíces, esqueletos y grupos; `Mesh.dispose()` desvincula el gestor de deformaciones pero no lo destruye. La implementación instalada se inspeccionó en `assetContainer.js`, `Meshes/mesh.pure.js` y `Morph/morphTargetManager.js`.

La prueba usa los GLB reales: siete canarios y cuatro golondrinas, seis posiciones separadas 130 m, cuarenta actualizaciones por posición y GC explícito entre ciclos. La primera comparación aisló `BirdFlockSystem.update` sin renderizar: no mide FPS ni GPU.

| Ciclo | Gestores antes | Gestores después | Heap antes | Heap después |
|---|---:|---:|---:|---:|
| 0 | 11 | 11 | 144 MiB | 144 MiB |
| 1 | 22 | 11 | 180 MiB | 147 MiB |
| 2 | 33 | 11 | 217 MiB | 152 MiB |
| 3 | 44 | 11 | 253 MiB | 155 MiB |
| 4 | 55 | 11 | 289 MiB | 158 MiB |
| 5 | 66 | 11 | 325 MiB | 161 MiB |
| Tras dispose | 66 | 0 | 320 MiB | 157 MiB |

Antes se retenían aproximadamente 36 MiB adicionales por renovación, incluso después de GC. Los máximos de actualización de las cinco renovaciones fueron 142–221 ms antes y 17–27 ms después. La primera creación completa pasó de 237 ms en un cuadro a una creación gradual, cuyo cuadro máximo fue 46 ms. Son tiempos CPU de este equipo, no garantías de duración en otros procesadores.

Se comprobó también el ciclo normal de Babylon mediante `scene.render()` en NullEngine para limpiar los animatables detenidos entre cuadros: heap 146–148 MiB durante los seis ciclos; once gestores siempre; cero gestores, esqueletos, mallas y animatables tras dispose. El ligero crecimiento del primer ensayo corregido provenía de omitir ese avance del motor. El script conservado ejecuta esta variante más representativa: `node --expose-gc scripts/profile-bird-lifecycle.mjs`.

## Cambios aplicados

- `BirdFlockSystem`: reutiliza un conjunto acotado de rigs por especie al viajar; oculta y reinicia sus clips mientras busca el nuevo hábitat. Crea como máximo un visual nuevo por actualización. Destruye explícitamente los gestores clonados al cerrar. Conserva las geometrías y materiales compartidos. Evita reconstruir la lista de mallas de cada ave en todos los cuadros.
- `BrisaliaSwordVisual`, `SantiCharacter`, `WorldView`: precargan únicamente el nivel de espada que posee el jugador, aunque esté desarmado. Equipar y desequipar durante la carga comparten la misma petición. Una carga obsoleta no reemplaza el arma seleccionada. Se conserva como máximo una variante preparada, salvo el solapamiento transitorio de una sustitución.
- `VegetationSystem`: los cambios de dirección, posición y sectores marcan una actualización pendiente; se realiza una única reconstrucción de buffers al finalizar `update`. No se redujeron densidad, distancias ni calidad de los árboles.
- `GameTelemetry` y `telemetryData`: separan el coste de aves del terreno y muestran deformadores, esqueletos y grupos de animación para detectar crecimiento sin depender exclusivamente de los MB totales.

La espada de nivel 3 ocupa 1,01 MiB en disco y tiene 11081 vértices. Ser pequeña no evitaba la espera: su importación comenzaba al seleccionarla. La comprobación de selección después de precargar midió 0,038 ms de CPU, habilitó el modelo sincrónicamente y no inició una nueva importación. Esto no mide el intervalo hasta presentar el píxel en pantalla ni garantiza latencia cero si se selecciona durante la carga inicial.

## Medición posterior en Chrome

El usuario dejó el personaje quieto en X −1912,90, Z −1086,01. Tras unos 87 s de captura, la cola de terreno terminó en cero. Resolución 2560×1313, escala 100 %. No se cambió el perfil gráfico para obtener el resultado.

Últimos 30 s exportados (1758 cuadros): **58,6 FPS**, P95 **21,1 ms**, P99 **27,7 ms**, máximo **42,9 ms**, **cero cuadros de más de 50 ms**. El último muestreo de heap fue 692096858 bytes, aproximadamente **660 MiB**. Durante toda la captura hubo exactamente 21 deformadores, 13 esqueletos, 168 grupos y 247 texturas internas. El aumento inicial de mallas de 1400 a 1760 corresponde al llenado de sectores pendientes.

La última ventana visible de diez segundos dio GPU 5,7 ms, actualización 5,3 ms y CPU Babylon 9,5 ms. La escena contenía unos 2,73 millones de triángulos y 267 draw calls. Persistieron picos menores durante la carga inicial: terreno hasta 35,4 ms y vegetación hasta 22,9 ms. Quieto, una vez completada la carga, ambos bloques quedaron prácticamente en cero.

La captura posterior se hizo después de recargar, en otra posición y resolución. No demuestra por sí sola que la corrección ahorre exactamente 1,8 GB ni que haya triplicado los FPS durante el mismo recorrido. La prueba de ciclos con los mismos modelos sí aísla la fuga y demuestra la reutilización. El archivo original exportado por Chrome es `auralia-telemetria (5).json`, conservado en Descargas del usuario.

## Hardware objetivo y trabajo que aún merece medición

Objetivo del proyecto: GTX 1060 de 6 GB, 16 GB RAM y Ryzen 7 4700S. La captura anterior no identifica el modelo de CPU/GPU y no certifica ese hardware. Criterio propuesto para una validación específica: 1920×1080, mismo recorrido y perfil, carga inicial separada, diez minutos caminando y cambiando armas, memoria sin crecimiento por vuelta y seguimiento de P95/P99 además del promedio. Para 60 FPS el presupuesto total es 16,7 ms; el modo de rendimiento existente limita a 30 FPS y debe evaluarse separadamente.

Prioridades restantes, sustentadas por la captura y la inspección:

1. Generación de terreno: el muestreo ya cede cada dieciséis puntos, pero la construcción inicial de topología y la publicación/subida final de la malla siguen siendo síncronas. El presupuesto de 4 ms es blando y no incluye fragmentación interna de esas operaciones. Medir y dividir estas etapas antes de reducir detalle de costas o alterar la geometría canónica.
2. Movimiento y colisiones: aun quieto consume aproximadamente 4,7 ms en esta escena. Revisar consultas repetidas de altura y apoyo con invalidación de ediciones; no saltarse colisiones para subir FPS.
3. Evaluación y animación: Babylon CPU ronda 9,5 ms; evaluación de mallas unos 3 ms. Las golondrinas tienen 54136 vértices, 72 huesos y diez clips; no son simples sprites. Un LOD animado distante puede beneficiar a la GTX 1060, pero requiere comparar apariencia y vuelo, no una reducción global arbitraria.
4. Vegetación: se eliminó la reconstrucción múltiple por cuadro; el coste de una reconstrucción individual todavía necesita una medición de recorrido. La captura quieto no cuantifica el ahorro de esta agrupación.
5. Memoria residente y texturas: GpuAssets ya usa rutas KTX2 cuando hay soporte y WorldStudioSource limita los R16 a nueve sectores. La fuga de aves está demostrada; no se ha demostrado una fuga global de texturas ni se ha atribuido toda la memoria del proceso a ellas.

No se habilitó `freezeActiveMeshes` global: el juego cambia continuamente de sectores, avatares y visibilidad. No se eliminaron buffers CPU que sirven para colisiones, restauración del contexto o edición. Tampoco se cambió el límite de FPS ni la resolución para ocultar pausas.

## Verificación realizada

Pasaron `node tests/birds.test.mjs` (incluye seis viajes y liberación de gestores), `npm run test:sword` (incluye precarga, toggles rápidos y carga obsoleta), `npm run test:telemetry` y `npx tsc --noEmit`. El sondeo de ciclo de aves se ejecutó antes y después y la captura posterior se observó y exportó desde el juego real. No se ejecutó la batería completa de regresión ni una build de producción innecesaria para estas modificaciones.

## Nueva evidencia durante el recorrido — 22/11, captura (6)

El usuario exportó `auralia-telemetria (6).json` a las 00:01:59. Esta captura continúa la sesión anterior hasta X −1884,47, Z 723,03. Confirma la estabilidad de los recursos pero **no** un rendimiento suficiente mientras se avanza. La medición estacionaria no representa este caso.

| Ventana final | FPS | P95 | P99 | Máximo | Cuadros >50 ms |
|---|---:|---:|---:|---:|---:|
| 10 s | 31,3 | 39,5 ms | 45,9 ms | 59,3 ms | 2 |
| 30 s | 22,9 | 68,1 ms | 83,2 ms | 108,9 ms | 173 |
| 60 s | 19,9 | 75,8 ms | 98,1 ms | 207,2 ms | 530 |

En los últimos treinta segundos: actualización CPU media 20,5 ms, Babylon CPU 22,2 ms, GPU asíncrona 15,45 ms. Terreno promedia 4,42 ms y alcanza 14,2 ms; pasto 4,05 / 28,2 ms; vegetación 1,92 / 18 ms. Aves promedia 2,61 ms, pero el peor cuadro de los sesenta segundos, en X −1925,88 Z −88,57, concentra **157,9 ms en aves** de 207,2 ms totales. CPU y GPU no se suman porque se solapan.

Memoria final: 700170645 bytes de heap, unos **668 MiB**. A lo largo de los 316 s de historial se mantienen exactamente 21 deformadores, 13 esqueletos y 168 grupos; las texturas pasan de 247 a 250. Esto confirma que ya no reaparece la acumulación de once gestores por renovación. No significa que todos los costes de aves estuvieran resueltos.

Un sondeo con la geografía real de esa zona separó búsqueda de hábitat y simulación: un cuadro llegó a efectuar 1945 consultas originales de altura y 3529 de agua al planificar varios corredores de vuelo. En ese sondeo el máximo de simulación fue 79,5 ms. Es una reproducción CPU sin los árboles y el resto del render, no una repetición exacta de la captura de Chrome.

Se aplicó una segunda corrección: `BirdSimulation.step` acepta un límite de planes nuevos; el juego permite uno por cuadro, conservando los puntos y la curva del corredor. La primera aparición espera a tener ruta para no mostrar aves inmóviles mientras se preparan. `BirdHabitatScanner` limita la búsqueda de sitios a un presupuesto blando de 2 ms y reutiliza vértices de la malla canónica de 3 m, interpolando el triángulo exacto en lugar de redondear coordenadas arbitrarias. Los proveedores sin rejilla conservan consultas exactas. WorldView entrega las alturas de los vértices directamente para evitar una interpolación duplicada.

El sondeo con esta segunda corrección redujo el máximo de simulación a 21,2 ms (incluida la primera planificación); no hubo ráfagas de miles de consultas en un cuadro. No se interpreta como porcentaje de mejora de FPS: cambió la distribución temporal de decisiones, faltan obstáculos de la escena y NullEngine no mide GPU. Un corredor individual o una consulta todavía puede superar el presupuesto: es amortización, no un límite duro de tiempo.

Pasaron nuevamente la comprobación específica de aves —incluye un plan por cuadro, continuidad y reutilización de alturas— y TypeScript. **La captura (6) precede a esta segunda corrección. Todavía falta una nueva captura del mismo recorrido para cuantificar su resultado real.** Siguen identificados los costes de pasto, generación de terreno y render durante desplazamiento; no se declara completada la validación de GTX 1060/4700S.

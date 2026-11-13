# Migración jugable al continente de World Studio

Fecha: 2026-11-13. Rama: `feat/worldstudio-v36-preview`.
Esta etapa sustituye el alcance de «solo validación» descrito en `WORLD_STUDIO_GEOGRAPHIC_SOURCE.md`; conserva aquel informe como registro de la primera implementación.

## Acceso y separación de partidas

- Juego actual: `http://127.0.0.1:5173/`.
- Nuevo continente jugable: `http://127.0.0.1:5173/?world=worldstudio`.
- El selector «Mundo actual / Nuevo continente» recarga la página y elige una sola fuente.
- Guardado actual: `auralia:poc:save:v1`; nuevo: `auralia:worldstudio-playable-v1:save:v1`.
- No se importa, convierte ni copia automáticamente ninguna partida. Reiniciar borra únicamente el slot seleccionado.
- `/world-preview.html` sigue siendo una herramienta de comparación, independiente de la partida.

La rama `main` permanece en `c72ac2e17e466c4720c3c031baa3489772dd3159`. No se realizó checkout, merge ni escritura de guardados del usuario: la automatización usó perfiles nuevos de Chrome dentro de `.test-build/`.

## Implementación

`PlayableWorld` adapta `WorldStudioSource` a una sesión jugable. `ActiveGeography` selecciona la fuente de alturas, agua, corrientes, biomas y exclusiones que consultan los sistemas existentes. No se monta la malla del antiguo preview sobre el terreno del juego.

El `TerrainStream` real genera la única superficie continental. El controlador, la colocación de vegetación/recursos y la construcción consultan sus triángulos canónicos cercanos a través de `nearTerrainHeightAt` / `GeographicSurface`. Se conservan los sistemas de colisión de rocas, árboles, edificios, puentes y galerías.

Los 25 R16 originales tienen 640 × 640 muestras, little-endian, 819.200 bytes cada uno. Cada sector cubre 2.800 m: separación de muestras 4,38185 m. Eso NO es la separación de la malla: se mantiene el LOD nativo de 6 / 18 / 36 m, con perímetros compartidos. Esta etapa no pretende utilizar cada muestra R16 como vértice; prioriza integrar y verificar la arquitectura real.

El detalle determinista usa escalas de 18 y 48 m, amplitud acotada a ±1,25 m, y máscaras que protegen costas, lagos, cauces, reservas y pendientes fuertes. La adaptación jugable añade una plataforma compacta para Brisalia y el relieve de la cuenca nativa; ambos forman parte del mismo proveedor, no son terrenos superpuestos. Los R16 no se reescriben.

El streaming prepara una ventana de 2.600 m alrededor del jugador y retiene como máximo nueve R16 (7,03 MiB). El FAR también se descarga por distancia. Nunca se mantienen los 25 sectores con geometría de alta resolución. Los traslados esperan datos de altura antes de activar colisiones; una descarga fallida detiene el movimiento y muestra el error, sin inventar altura cero.

## Contenido trasladado

| Sistema | Adaptación y comportamiento |
|---|---|
| Brisalia | Traslación X −1.250, Z +1.943; el ancla antigua (0, −23) queda en (−1.250, 1.920). Casas, plaza, NPC, recursos y banco mantienen IDs e interacciones. |
| Parcela | Claro del Hogar en (−1.279, 1.961), con grilla, soporte, obstáculos, encastres y visuales del sistema existente. |
| Muelle | Se busca la costa al sur: (−1.217, 4.067), en vez de conservar un muelle en tierra firme. |
| Luciérnagas | Zona jugable separada trasladada frente al muelle, centro (−1.617, 4.487), con recursos de chispa, altar, barca y regreso. |
| Laguna de las Tres Vertientes | Centro derivado del polígono maestro, escala horizontal 2,2; mantiene cuenca, cascadas, nacientes, corrientes, gruta y portales del juego. |
| Nácar y Gemelas | Superficies independientes del terreno, usando polígonos de hidrología y materiales acuáticos nativos. |
| Ríos maestros | índice espacial de los perfiles de las splines; nivel descendente, lecho local, corriente y malla de `GeographyStream`. La cuenca nativa tiene prioridad en su región. |
| Puentes y galerías | Rutas, barandas, suelo transitable, portales y salida exterior trasladados junto a Brisalia. |
| Vegetación y recursos | GLB, instancias, césped, viento, colisiones y respawn existentes. Distribución procedural y alturas adaptadas al nuevo mundo. |
| Albor y Umbrael | Se carga un reino original por vez, al oeste y al este. Llegada sobre triángulos reales, colisión y guardado del reino activo. |
| Mapa y viajes | Mapa nuevo derivado de R16, cursos de agua y destinos nuevos. La ubicación y los descubrimientos usan coordenadas trasladadas. |
| Calidad gráfica | Nuevo mundo limitado a 60 FPS; modo Rendimiento a 30 FPS. El mundo actual conserva su política de render. |

Los GLB de los reinos no contienen NORMAL. Se generan normales al cargarlos para que el controlador pueda clasificar las superficies transitables; no se añaden vértices ni se escriben los modelos originales. Se normaliza la cámara al llegar para evitar que quede dentro de la isla.

SHA-256 de los modelos conservados:

- Albor: `c78b246a9e9352c2f7356eadcaa9e9f1b489b02e6454e0456fc3df1ac85067b9`.
- Umbrael: `f72acaf9ef28cea1d7d2676cd1666e1dda68b412fa46477926d4fb09d4e1539b`.

## Validación jugable

`scripts/check-worldstudio-game.mjs --run --functional --travel` completó 22 comprobaciones y terminó sin errores de consola/runtime. Los desplazamientos largos se aceleran mediante teletransporte; los materiales de la misión se recolectan mediante los objetivos reales de interacción, sin inyectar inventario.

Verificado: caminar, saltar, recolectar madera/piedra, fabricar el martillo desde HUD, colocar piso y dos paredes mediante picking y las reglas reales, avanzar al viaje marítimo, navegar a Luciérnagas, recolectar chispa, fabricar la linterna y completar la misión, volver en barca, entrar/salir de gruta y galerías, nadar, visitar Albor y Umbrael sobre sus superficies, recargar con construcciones y linterna, y reiniciar en el spawn nuevo.

La prueba mantiene un valor centinela en el slot antiguo y comprueba que permanece intacto. Otra ejecución `--realms` recargó la página guardada en Umbrael y recuperó el reino y el apoyo del personaje. Esto verifica aislamiento y persistencia en un perfil desechable, no inspecciona guardados reales del usuario.

`npm run test:playable-world` pasó 63 comparaciones entre raycast de malla cercana y altura autoritativa, en 21 destinos; también verifica determinismo tras descarga/recarga, límite de nueve sectores, construcción, misión y separación de guardados. `test:geographic-source` conserva sus pruebas de continuidad y fuente híbrida.

Pasaron TypeScript, build de producción, validador de assets (25 R16, 40 bordes y dos GLB), dominio, construcción, atlas, océano, césped, vegetación, bosque, expansión, telemetría, shader de follaje, props/geología, traversal, biomas, rutas, física y cuenca/laguna. El build conserva el aviso de chunks superiores a 500 kB.

### Comprobaciones antiguas que siguen fallando

La batería completa no se declara verde. Se reprodujeron tres fallos también presentes en la referencia:

1. `regional-relief.test.cjs`: exige +25 m en un punto que da +21,298 m. Se transpila el archivo de HEAD y se verifica exactamente la misma altura: 47,3827335848 m en (−1.200, −1.000). Brisalia y la parcela también coinciden con HEAD.
2. `terrain-stream.test.cjs`: límite de inicialización de 2.500 ms. Medición de control: HEAD 4.168 ms, versión de trabajo 3.554 ms, ambos con 224 chunks FAR. El resto de sus comprobaciones de cobertura, costuras, swaps, teletransporte y soporte pasa al evaluar esa única puerta temporal por separado; no se modificó el test original.
3. `geographic-features.test.cjs`: espera cascada opaca, mientras el material vigente utiliza transparencia. El mismo fallo se reproduce cargando `GeographyStream` de HEAD. `ocean.test.cjs` se ejecutó aparte y pasó.

Los registros y la reproducción de las referencias están en `artifacts/geographic-source/game/migration-*.json` / `.log`.

## Comparación de rendimiento

Esta tabla corresponde a la migración inicial, antes de la corrección de cauces y LOD documentada al final de este archivo.

Chrome headless, perfiles nuevos independientes, 1.600 × 900, modo Rendimiento y límite de 30 FPS en ambos casos. Posiciones de aparición equivalentes en Brisalia; cámara radio 11,5 m, alfa π/2, beta 1,22, objetivo 2,05 m sobre los pies. Muestra estable de 10 s después del calentamiento. Heap medido tras GC explícito. La generación se registra durante la carga/estabilización; no incluye el constructor completo anterior a la exposición de QA.

| Métrica | Mundo actual | Nuevo continente |
|---|---:|---:|
| Separación interior cerca / medio / lejos | 6 / 18 / 36 m | 6 / 18 / 36 m |
| Vértices de terreno residentes | 83.360 | 64.035 |
| Triángulos de terreno residentes | 107.520 | 85.728 |
| Triángulos de terreno habilitados (antes de frustum) | 60.096 | 72.960 |
| Triángulos de escena reportados por Babylon | 939.705 | 1.411.332 |
| Buffers estimados de terreno | 4,41 MiB | 3,42 MiB |
| Heightmaps residentes | No aplica, procedural | 6 / 4,69 MiB (máximo 9 / 7,03 MiB) |
| Heap JavaScript tras GC | 379,34 MiB | 245,84 MiB |
| Memoria privada de todos los procesos del Chrome de prueba | 1.399,94 MiB | 1.141,64 MiB |
| FPS observados | 30,00 | 30,00 |
| Intervalo medio / p95 entre frames | 33,31 / 38,70 ms | 33,33 / 39,00 ms |
| CPU por frame medio / p95 | 12,33 / 17,50 ms | 7,79 / 13,00 ms |
| Generación por actualización media / p95 | 13,02 / 27,10 ms | 7,61 / 13,00 ms |

El heap baja 35,2 % y la memoria privada total del navegador 18,5 %. El nuevo entorno dibuja aproximadamente 50 % más triángulos de escena, principalmente por la distribución de vegetación; no se presenta como una reducción de todos los costes. La alineación de las nuevas coordenadas con la grilla hace que los anillos habiliten cantidades distintas de chunks.

La memoria privada de TODO Chrome no equivale al heap, a memoria de GPU ni a la cifra histórica de ~500 MB citada para otro proceso/medición. No se midió utilización de GPU ni VRAM. El límite de FPS evita render sin límite, pero no demuestra por sí solo menor coste GPU por frame.

| LOD | Actual: vértices / triángulos residentes | Nuevo: vértices / triángulos residentes | Chunks habilitados actual / nuevo |
|---|---:|---:|---:|
| Cercano | 10.816 / 18.432 | 13.520 / 23.040 | 64 / 80 |
| Medio | 18.560 / 24.576 | 17.980 / 23.808 | 112 / 104 |
| Lejano | 53.984 / 64.512 | 32.535 / 38.880 | 70 / 104 |

Datos completos: `artifacts/geographic-source/comparison/{legacy,worldstudio}/metrics.json`. Capturas comparables: `brisalia.png` en ambas carpetas. Repetir: `node scripts/check-worldstudio-game.mjs --run --metrics --legacy`, luego el mismo comando sin `--legacy`.

## Capturas inspeccionadas

Las imágenes de `artifacts/geographic-source/game/` muestran costa a pie y muelle (`costa.png`), isla de Nácar en la posición denunciada X 1.373, Z −438 (`isla-nacar.png`), ladera, nacimiento, desembocadura, Brisalia con vegetación, Laguna, construcciones, gruta, galerías, Luciérnagas y ambos reinos. La altura de cámara sigue al personaje; no se usa la vista aérea para ocultar el relieve.

Se corrigieron durante la validación: spawn antiguo, consultas a portales remotos con sectores descargados, cámara dentro de islas flotantes, normales ausentes en GLB, bordes de río elevados artificialmente por un perfil provisional y coordenadas locales guardadas al salir de portales. Las capturas finales corresponden al juego real.

## Coordenadas locales y trabajo posterior

- Las funciones de autoría de Brisalia y puestos regionales conservan coordenadas locales antiguas y se transforman al crear contenido. Los puestos de bosque/sierra/miradores se trasladaron junto al conjunto jugable, no a una equivalencia exacta con cada reino aprobado.
- Los interiores de la gruta y de las galerías conservan su propio espacio local. Sus portales convierten entradas/salidas a coordenadas nuevas y no guardan una ubicación subterránea como punto continental.
- `TerrainData`, `RegionCatalog`, máscaras antiguas, atlas ilustrado y constantes de relieve siguen siendo la referencia del modo actual. En la partida nueva, altura/agua/biomas consultan el contexto activo; la navegación utiliza destinos trasladados.
- El documento de edición `auralia-world.json` y sus assets colocados manualmente no se copian al nuevo mundo. El bosque procedural y los sistemas jugables funcionan, pero la composición artística completa de aquel documento y las formaciones geológicas fijas requieren una adaptación específica.
- La red completa de carreteras de World Studio sigue siendo metadata de diseño; se trasladaron los caminos, puentes y senderos ya jugables. No se han construido ciudades nuevas inexistentes en el juego anterior.
- Los niveles de lago son un datum jugable provisional inferido de bordes R16 y acotado al mar: 1 m en esta versión. Los ríos maestros son perfiles descendentes deterministas, no simulación de caudal. La integración fina entre cada guía maestra y la cuenca trasladada aún requiere autoría; la geografía jugable no se declara idéntica a la de diseño.
- Los modelos flotantes conservan geometría y texturas originales; esta migración habilita su visita, no añade misiones o ciudades completas sobre ellos.

El objetivo completado es una partida jugable con los sistemas existentes sobre la fuente nueva, aislada de la actual, y verificada de principio a fin. El acabado artístico y la ubicación definitiva de todos los contenidos siguen siendo etapas posteriores explícitas.

## Escala de texturas: comprobación del 13 de noviembre

La comparación con `main` confirmó que el catálogo, la frecuencia y la proyección de texturas ya eran compartidos: hierba a 0,18 repeticiones/m (5,56 m por repetición), coordenadas de mundo y proyección triplanar para roca. No se escala una textura al tamaño de un sector o de un chunk. Se conservan esas proporciones; no se modificaron el shader ni los assets del terreno en esta corrección.

Las capturas comunicadas comparaban la cámara en tercera persona del juego con una vista a 1,75 m del suelo en el preview. Además, el preview renderizaba al 75 %. La vista cercana de la geografía actual reproduce el mismo aspecto ampliado. Esto distingue aumento por perspectiva de una diferencia de densidad UV entre proveedores.

El preview ahora inicia con «Vista del juego»: radio 11,5 m, objetivo 2,05 m sobre los pies, beta 1,22 y FOV 0,8 rad, usando la configuración compartida con `WorldView`. La referencia de escala mide 1,75 m. «A pie» mantiene los ojos a 1,75 m y permite inspeccionar la superficie de cerca; cambiar de cámara no modifica el material. La colisión de cámara reutiliza `cameraTerrainView`.

La resolución predeterminada de comparación es 100 %, con opción 75 % para reducir carga; ambas mantienen el límite de 30 FPS. Las texturas fuente siguen siendo 1K y los arrays compartidos de ejecución 512 px, igual que en `main`: el acercamiento extremo sigue mostrando esa limitación. No se aumentó la memoria de texturas; renderizar al 100 % sí incrementa el trabajo por píxel respecto al 75 %.

Validación reproducible: `node scripts/benchmark-world-preview-browser.mjs --run --textures --walk --modes=legacy-terrain,hybrid --views=sector,ladera`. Ocho capturas y mediciones en `artifacts/geographic-source/texture-scale/`: ambas fuentes, sector inicial y ladera, cámara del juego y a pie. Se verificaron materiales cargados, FOV, radio, altura de ojos, resolución y densidad de textura, con cero errores de navegador. El recorrido de 110 m cruzó un borde R16 con error de apoyo 0 y sin frames sin malla cercana. También pasaron TypeScript y `test:traversal`.

La herramienta enlaza directamente a `/?world=worldstudio`, donde están la vegetación, el agua, Brisalia y los sistemas jugables migrados. Se retiró el aviso antiguo que decía que todavía no estaban migrados.

## Corrección integral del agua y desvío de Brisalia

Esta revisión del 13 de noviembre sustituye la implementación anterior de cintas de río (`RiverRibbonWriter`). Las validaciones anteriores no detectaron todos los solapamientos: el océano opaco continuaba dibujándose dentro de cauces; Prado y Valle tenían niveles incompatibles en su intersección; la selección del segmento más próximo plegaba las cintas. El recorte del océano lejano por grandes triángulos producía cuñas. No bastaba aumentar la profundidad o elevar el agua.

### Una superficie de agua por posición

`ClippedWaterSurface` construye una partición de XZ en celdas de streaming de 72 m. Cada triángulo se emite una vez, aunque se crucen varios ejes de río. Recorta el agua contra la misma triangulación canónica usada por el terreno y las colisiones. Todos sus vértices quedan en el nivel de agua más 0,035 m; no se bajan hacia las orillas para tapar huecos.

La malla es de 3 m en ríos y orillas, tanto cerca como lejos. El interior plano de lagos puede usar 12 m a distancia. Se descargan las celdas fuera del radio de 1.250 m; no se mantiene toda la red mallada. El material transparente vigente de `main` se conserva, con colores de río algo más oscuros (`#214d50` / `#6a9b90`).

El océano cercano y lejano comparten `InlandWaterMask`: una máscara de propiedad de 2.048² bytes, 8 m por texel, que descarta fragmentos dentro del dominio de agua continental. Esa máscara no define la costa del terreno ni carga alturas remotas. La textura usa explícitamente UNSIGNED_BYTE: el valor predeterminado FLOAT no correspondía al buffer. La lectura de texeles reales de GPU verifica 255 dentro de los dos cauces comprobados y 0 mar adentro. El plano lejano necesita dos triángulos, sin eliminar enormes triángulos completos sobre los ríos.

En la cuenca trasladada, `LagoonSystem` deja de crear sus lagos/cintas horizontales: también los construye `GeographyStream`. Conserva cascadas, espuma, rocas, colisiones, grutas, portales y caudal climático. El mundo anterior conserva el comportamiento por defecto de esos sistemas.

### Excavación, conexiones y plataforma

`bake-studio-river-levels.mjs` calcula niveles deterministas usando los R16 originales, ambas orillas, lagos y contactos entre cauces. Genera 630 estaciones para 12 registros; conserva hashes del origen y permite comprobar el resultado con `--check`. `StudioRivers` interpola niveles con pesos continuos en las curvas y contactos, y excava mediante `min(altura_original, perfil_del_cauce)`: no levanta terreno ni una segunda lámina para simular profundidad. El fondo nominal queda a `4 + semiancho × 0,16` m bajo el agua; la profundidad efectiva se mide contra los triángulos renderizados.

Los 13 registros importados tienen una asignación explícita:

- Siete rutas maestras activas.
- Cinco rutas de Ferragrís, Velo y Gemelas sustituidas de extremo a extremo por la cuenca jugable, sin dejar fragmentos al cruzar una caja rectangular.
- `catarata-alta-altaluz` es un elemento del recorrido `rv-cumbres-nacar`, no un segundo río superpuesto. No se añadió un nuevo modelo específico de cascada en ese punto.

La salida de la laguna se limita al nivel del mar y se conecta con la salida maestra. Se adapta el fondo junto con su nivel; no queda una salida a −13 m atravesada por el océano a +1 m.

Con autorización del usuario se desvía únicamente el tramo del Prado que atravesaba la parcela de Brisalia. `SettlementRiverBypass` rodea la plataforma con un arco elíptico de radio mínimo 230 m y estaciones aproximadas de 12 m, conservando los puntos exteriores al tramo de aproximación. La plataforma protegida termina a 155 m. El mapa del juego dibuja este recorrido efectivo y las rutas nativas trasladadas. Brisalia, la parcela y sus IDs jugables permanecen en sus emplazamientos.

`TerrainStream` mantiene 6 m en cauces y márgenes para los tres LOD; fuera de ellos usa 6 / 18 / 36 m. Los chunks de cada LOD abarcan áreas distintas (72 / 144 / 288 m). Por eso un chunk lejano puede contener más vértices sin tener mayor densidad por metro. Altura visual, colisión, vegetación y construcción siguen usando la misma superficie autoritativa. Los R16 originales continúan en 640² muestras, separadas 4,38185 m, sin reescritura.

### Evidencia geométrica y funcional

`artifacts/geographic-source/water-union/network.json` registra:

- 1.504 muestras de eje en las siete rutas maestras; profundidad mínima efectiva 4,878 m.
- 722 muestras en los siete canales de la cuenca nativa, incluidas nacientes y salida; mínimos de 1,889 a 3,500 m según tributario. Los arroyos pequeños conservan su sección propia.
- 7.382 comprobaciones de que la excavación no supera la altura original, fuera de las adaptaciones explícitas de poblado/cuenca.
- Catorce mallas reales, cercano/lejano en siete posiciones denunciadas: un solo triángulo de agua por punto XZ muestreado y vértices sobre el nivel autoritativo. No se duplican cintas ni se pliegan contra el terreno.
- Todos los ejes muestreados quedan fuera de la plataforma protegida. Máximo nueve R16 residentes.

`terrain-lod.json` conserva las 78 intersecciones con mallas de terreno reales en tres LOD; error máximo 1,87 × 10⁻¹⁴ m. Profundidades del centro: Prado 5,748 m; ambos puntos del Valle 5,760 m. Esto prueba ausencia de tapones en esos puntos, además de la auditoría de ejes; no es una simulación de erosión o fluidos.

Pasaron `hydrology-integration`, `studio-rivers`, `playable-world` (63 apoyos en 21 destinos), `lagoon`, `watershed`, `ocean` y TypeScript. La prueba de cuenca incluye los 15 tramos de hidrología nativa, lluvia/deshielo, cascadas, colisiones y portales. Los tres fallos históricos de otras suites señalados arriba siguen separados de estos resultados.

La validación de GPU (`browser/optics.json`) comprueba una superficie inclinada desde abajo, el cruce aire/agua, absorción por profundidad, recuperación de color al salir y estabilidad de recursos. La prueba de compilación espera el shader y renderiza antes de leer píxeles, evitando aceptar un frame vacío. `gpu-ownership.json` compara CPU y textura GPU.

En Ferragrís se aisló además un defecto óptico: prolongar el plano local de agua sobre la ladera distante generaba una franja oscura aun sin mallas duplicadas. En la geografía nueva, `WaterOptics` consulta un pase de profundidad de las mallas horizontales de agua realmente visibles. La absorción empieza/termina en esa interfaz, sin inundar ópticamente el terreno seco. Se reutiliza el target y se retira de los pases activos al salir del agua; el modo antiguo conserva su cálculo anterior. La prueba `finite` obtiene RGB seco 184/127/82 y húmedo 142/120/81. El target R32F añade 5,49 MiB de color a 1.600 × 900, más su buffer de profundidad administrado por el driver. No es otra superficie dibujada ni una copia de la escena en color.

El navegador aislado pasó las 22 comprobaciones funcionales: movimiento, salto, recolección, crafting, picking de construcción, misión, barca, portales, grutas, Albor/Umbrael, recarga y reinicio con el slot antiguo intacto. Después del cambio óptico se repitió con el controlador real la secuencia nadar → sumergirse → volver a superficie → caminar en la orilla; pasó y queda registrada en `browser/movement.json`. Se inspeccionaron las capturas de agua, lecho y naciente desde la perspectiva del jugador. `nacimiento-sin-optica.png` es únicamente el control diagnóstico con el efecto desactivado; `nacimiento.png` muestra el efecto final activado.

### Memoria y coste

Misma Brisalia, 1.600 × 900, cámara de radio 11,5 m y beta 1,22, calidad Rendimiento y límite de 30 FPS. La medición nueva espera a que terminen terreno y agua, fuerza GC y recoge 300 frames en 10 segundos. Las dos referencias anteriores son históricas, no mediciones simultáneas. La medición se realizó antes del build y las pruebas pesadas.

| Métrica | Juego actual, referencia | Corrección anterior | Agua unificada y desvío |
|---|---:|---:|---:|
| Separación fuera del río, cerca / medio / lejos | 6 / 18 / 36 m | 6 / 18 / 36 m | 6 / 18 / 36 m |
| Separación dentro del cauce | Según terreno nativo | 6 m en tres LOD | 6 m en tres LOD |
| Vértices de terreno residentes | 83.360 | 103.117 | 104.668 |
| Triángulos de terreno residentes | 107.520 | 163.892 | 166.994 |
| Buffers estimados de terreno | 4,41 MiB | 5,81 MiB | 5,90 MiB |
| Heap JavaScript tras GC | 379,34 MiB | 256,72 MiB | 266,43 MiB |
| Memoria privada total del Chrome aislado | 1.399,94 MiB | 1.155,23 MiB | 1.172,76 MiB |
| FPS observados | 30,00 | 30,08 | 30,01 |
| Intervalo entre frames medio / p95 | 33,31 / 38,70 ms | 33,31 / 40,50 ms | 33,31 / 38,40 ms |
| CPU por frame media / p95 | 12,33 / 17,50 ms | 12,64 / 20,70 ms | 12,85 / 18,90 ms |
| Generación por actualización media / p95 | 13,02 / 27,10 ms | 4,35 / 4,90 ms | 4,40 / 5,00 ms |

Los seis R16 de esta vista ocupan 4,69 MiB; el máximo de nueve ocupa 7,03 MiB. La máscara de propiedad añade 4 MiB de buffer CPU y aproximadamente 4 MiB de textura GPU; durante su construcción hay otro buffer temporal de 4 MiB. No equivale a mantener el continente con mallas densas.

| LOD | Chunks residentes / habilitados | Vértices residentes | Triángulos residentes |
|---|---:|---:|---:|
| Cercano | 80 / 80 | 13.520 | 23.040 |
| Medio | 124 / 104 | 27.395 | 42.638 |
| Lejano | 135 / 104 | 63.753 | 101.316 |

Habilitado significa activo para streaming, antes del frustum. La cifra de triángulos de escena incluye vegetación, personaje y otros objetos; no sustituye los totales de terreno de la tabla. La memoria privada incluye todos los procesos del Chrome descartable y no es comparable directamente con los ~500 MB citados para otra medición. No se midió utilización GPU ni VRAM total. El límite de 30 FPS no demuestra por sí solo una reducción del coste GPU.

La generación por actualización mide el trabajo repartido en frames; no mide toda la duración de un teletransporte. Las cargas inmediatas siguen siendo síncronas. Se conserva el límite de nueve sectores y la descarga por distancia.

Se midieron además 300 frames nadando en el Prado con el pase óptico de interfaz activo a 1.600 × 900: 30,01 FPS; intervalo medio/p95 33,33/39,60 ms; CPU media/p95 12,65/19,60 ms. El heap instantáneo fue 295,46 MiB **sin GC forzado**, buffers de terreno 5,98 MiB y cuatro R16 (3,125 MiB). Esa muestra de otra ubicación no se resta de la de Brisalia para atribuir todo el cambio al efecto. Datos: `browser/swimming-performance.json`.

### Reproducción y límites

Ejecutar `npm run test:hydrology-integration`, `npm run test:studio-rivers`, `npm run test:playable-world` y `npm run test:lagoon`. Para capturas y recorrido jugable: `node scripts/check-worldstudio-game.mjs --run --water-union --water-movement --functional`. Añadir `--metrics` para repetir la medición, sin ejecutar otros trabajos pesados al mismo tiempo.

Los informes y capturas finales están en `artifacts/geographic-source/water-union/`; `rivers/` conserva evidencia de intentos anteriores y no es la referencia visual final. Las coordenadas locales pendientes se enumeran más arriba.

Persisten el facetado visible de orillas a 6 m y la necesidad de autoría artística de algunos encuentros con lagos/cascadas. La red maestra usa perfiles y corrientes deterministas; solo la cuenca nativa conserva su modelo climático de caudal. No se afirma haber implementado hidráulica física de todo el continente. Esta corrección conserva `main`, guardados existentes, silueta continental y modelos originales de los reinos.

## Profundización del Lago de Nácar

Revisión del 13 de noviembre de 2026 para preparar espacio habitable bajo el agua. `NacarBathymetry` excava únicamente el fondo sumergido del Lago de Nácar dentro de `PlayableWorld.heightAt`. Conserva el nivel del agua en Y = 1 m, la costa, los puntos emergidos de las islas y los R16 originales. No añade otro terreno ni otra capa de agua. La fuente del mundo anterior no utiliza esta modificación.

La forma incluye plataformas someras, taludes graduales y depresiones amplias con un objetivo máximo de 80 m. La variación es determinista, con rasgos de cientos de metros, adecuados a los LOD existentes. Un campo de distancia de 8 m, calculado desde el R16 y el polígono del lago, protege tanto la costa exterior como las islas interiores. Se conserva el terreno de menos de 3 m de profundidad y una franja adicional alrededor de esas zonas. El campo controla la excavación, no la malla ni la máscara visual del agua.

Medición uniforme cada 24 m contra la superficie canónica: 7.277 posiciones, de las cuales 7.055 estaban sumergidas antes y después. No son un barrido exhaustivo del máximo continuo.

| Profundidad | Antes | Después |
|---|---:|---:|
| Mediana de puntos sumergidos | 11,31 m | 24,07 m |
| Percentil 90 | 20,20 m | 72,17 m |
| Máximo muestreado | 20,41 m | 79,48 m |
| X 1580, Z −688, junto a la isla de la captura | 6,01 m | 6,81 m |
| X 1700, Z −1000, cuenca al sur de la isla | 20,41 m | 73,04 m |

La zona de la captura sigue siendo una plataforma insular somera: la mayor profundidad aparece al entrar en la cuenca, evitando convertir la costa de la isla en un corte vertical. Hay 2.436 muestras de más de 40 m y 1.422 de más de 60 m; el cambio no se limita a un pozo aislado. La cota de la isla aprobada en X 1373, Z −438 permanece en 65,839 m.

Validación con `npm run test:nacar`:

- Las 7.277 posiciones no elevan el terreno. Los 339 puntos protegidos, incluidos 222 emergidos, mantienen su altura exacta; el nivel de agua no cambia.
- Dieciocho raycasts contra mallas reales de `TerrainStream`, en seis ubicaciones y tres LOD. Error cercano menor de 0,002 m; máximo observado de 0,222 m en LOD distante. Cada malla conserva exactamente sus cantidades de vértices y triángulos anteriores.
- El controlador desciende hasta 0,3 m sobre el fondo más profundo, mantiene la profundidad al soltar el control y vuelve a superficie. Descargar y recargar los sectores produce la misma altura.

La prueba de navegador `node scripts/check-worldstudio-game.mjs --run --nacar` utiliza un perfil descartable. Comprueba el descenso real con Ctrl a 73 m, la permanencia en el fondo, el regreso con Espacio y la llegada a pie a la isla. Sin errores de ejecución. La ayuda de natación del mundo nuevo ahora indica **Ctrl descender**; soltarlo mantiene la profundidad y **Espacio** regresa a superficie.

El campo añade 373.500 bytes (0,356 MiB) de CPU, sin texturas GPU adicionales ni retención de los heightmaps con los que se construye. La creación inicial en navegador tomó 70,3 ms. Se mantienen el límite de nueve sectores R16 y los LOD de 6 / 18 / 36 m. En 180 frames sobre el fondo, a 1.600 × 900 y límite de 30 FPS: 29,99 FPS; frame medio 33,33 ms y p95 37,10 ms; buffers de terreno 4,23 MiB. El heap instantáneo fue 473,93 MiB sin GC forzado, por lo que no se compara directamente con las mediciones tras GC de Brisalia. No se midió VRAM total ni utilización GPU.

Informes y siete capturas en `artifacts/geographic-source/nacar-depth/`: `before.json`, `geometry.json`, `browser/nacar.json` y `browser/errors.json`. Esta revisión prepara la batimetría; la fauna, flora acuática, refugios y distribución de recursos submarinos todavía requieren su propia implementación.

## Arboledas por sectores y sprites lejanos

Revisión del 13 de noviembre de 2026, aprobada visualmente por el usuario. Solo se aplica a `worldstudio-playable-v1`. `WorldForest` distribuye arboledas y claros deterministas que atraviesan las celdas de streaming. En las mismas 657 celdas de Nácar se midieron 228 árboles con la distribución anterior y 451 con la nueva. Se mantienen las exclusiones de agua, pendiente, caminos, parcela inicial y edificios; la separación mínima medida entre candidatos de celdas contiguas es 9,58 m.

El LOD comparte las posiciones y escalas, sin dibujar dos versiones del mismo árbol:

- Hasta 96 árboles cercanos usan el GLB completo, normalmente dentro de 135–160 m.
- Se priorizan dos filas por franja angular de 2,5° frente a la cámara, incluso al otro lado del lago: hasta 96 modelos completos adicionales, entre 160 y 1.100 m. La selección reserva una separación radial de 14 m entre filas y un cono de 120°. No es un cálculo de oclusión por terreno.
- Hasta 240 árboles intermedios usan los GLB LOD1 existentes, normalmente hasta 420–500 m.
- El resto usa un sprite vertical orientado hacia el observador: dos triángulos por árbol. Un atlas de 2.048 × 1.024 contiene ocho vistas de 256 px de cada una de las cuatro especies V4. Se generó desde los GLB y materiales originales; estos no se modificaron. Se mantiene la iluminación de escena, niebla y color estacional. No se generan render targets durante el juego.

El atlas ocupa 678.398 bytes en disco y aproximadamente 10,67 MiB GPU en RGBA con mipmaps. Las cuatro especies usan cuatro lotes de sprites instanciados. El anillo residente es de 22 celdas (1.565 celdas en estas posiciones); cada árbol tiene un corte de distancia determinista entre 1.100 y 1.560 m. La descarga por distancia continúa activa. El cambio de dirección se reconsidera cada 8° y el desplazamiento cada 12 m; los frames inmóviles no reconstruyen buffers. La generación reparte hasta cuatro celdas por actualización con objetivo de 2,5 ms, sin garantizar un tiempo máximo para una única celda.

Medición con Chrome descartable, 1.600 × 900, misma cámara e iluminación, límite de 30 FPS; 180 intervalos de frame por vista. Árboles significa instancias residentes enviadas a los lotes; no conteo de píxeles visibles. Triángulos de escena incluye terreno, personaje y vegetación.

| Vista | Árboles antes / después | Triángulos de escena antes / después | Frame medio antes / después | p95 antes / después |
|---|---:|---:|---:|---:|
| Nácar, X 1524 Z −434 | 29 / 1.235 | 433.017 / 923.661 | 33,31 / 33,36 ms | 37,60 / 37,60 ms |
| Brisalia | 265 / 5.544 | 1.206.247 / 1.657.657 | 33,32 / 33,30 ms | 37,20 / 38,10 ms |

En la vista de Nácar señalada después por el usuario, X 1430 Z −414, hay 138 árboles completos (85 priorizados en el frente), 33 intermedios y 1.088 sprites. Frame medio 33,34 ms; p95 39,50 ms. Capturas diurna y nocturna en `artifacts/geographic-source/forest/after/`.

El heap instantáneo antes/después fue 497,84/442,48 MiB en Nácar y 292,23/293,88 MiB en Brisalia. Son muestras sin GC y no demuestran una reducción de memoria. Tras GC, la versión nueva midió 301,10 MiB en Nácar, 299,03 MiB en la segunda vista y 269,43 MiB en Brisalia. Las matrices de vegetación ocuparon 81,81–356,25 KiB, más un float por sprite para seleccionar su vista. La última reconstrucción de buffers medida fue de 3,4–9,1 ms. El límite de 30 FPS no mide utilización GPU ni margen de rendimiento sin límite. No se midió VRAM total.

Validación: `npm run test:world-forest` comprueba distribución, exclusiones, determinismo, presupuestos, dos filas, ocho orientaciones, ausencia de duplicados, colisiones locales, descarga/recarga y límite de nueve R16. `npm run test:vegetation` conserva el comportamiento del mundo anterior. Capturas y medición: `node scripts/check-worldstudio-game.mjs --run --forest`. Regenerar atlas: `node scripts/check-worldstudio-game.mjs --run --forest --bake-tree-sprites`. Los perfiles de prueba no utilizan guardados existentes.

## Corrección de la orilla en la desembocadura de Cumbres

La franja azul opaca reportada en X 1762, Z −1466 y X 1770, Z −1464 provenía del océano, no de una segunda versión del río. Se reprodujo desde ambos ángulos; al ocultar únicamente `OceanWater`, desaparecía. La máscara de exclusión oceánica seguía el polígono simplificado del lago, mientras que la costa real del R16 y parte de la malla transparente llegaban más lejos. Había tanto espacios sin propietario de lago como zonas donde su máscara oceánica interpolada valía menos de 0,5.

`LakeWaterDomain` traza la cuenca conectada bajo el nivel original del agua, partiendo del polígono aprobado. Usa una cuadrícula de propiedad de 8 m alineada con `InlandWaterMask`, con una franja de protección de 16 m en las orillas. La cuadrícula no genera geometría ni modifica alturas: `ClippedWaterSurface` sigue recortando el agua contra los triángulos reales del terreno. El mismo dominio cubre el agua transparente y excluye el océano. También se aplica al lago Gemelas Alta; Tres Vertientes conserva su sistema migrado.

El dominio anterior de los ríos se conserva por separado en CPU. Así, ampliar la exclusión del lago no ensancha ni eleva el agua del río vecino. Se mantienen el cauce, los niveles, las costas del terreno, las islas, los guardados y la rama `main`. El océano sigue disponible en las costas marítimas.

Validación con `npm run test:lake-shore`: 32.676 muestras de propiedad compartida sin huecos ni convivencia con el océano; ambas cuencas cierran antes del límite de búsqueda. Los cuatro puntos de regresión conservan exactamente la altura anterior y agua a Y = 1 m. El nivel del río en X 1740, Z −1480 sigue en 1,995428562 m y el hombro seco en X 1760, Z −1500 continúa seco. `npm run test:hydrology-integration` pasó con siete rutas maestras, siete recorridos nativos, 1.504 muestras de ejes y 7.382 comprobaciones de excavación; no registró incidencias.

Los dos dominios añaden 220.697 bytes y la máscara CPU que conserva el dominio fluvial añade 4.194.304 bytes: aproximadamente 4,21 MiB adicionales a las mediciones de vegetación anteriores. No se añade una textura GPU: el océano conserva su única máscara de 4 MiB. Continúa el límite de nueve R16 residentes y las celdas secas se descartan del streaming de agua.

Capturas comparables antes/después y diagnóstico sin océano: `artifacts/geographic-source/lake-shore/`. La prueba `node scripts/check-worldstudio-game.mjs --run --lake-shore` terminó sin errores de navegador y las capturas finales muestran una sola superficie transparente hasta la orilla. Persiste el facetado propio de la malla del terreno a 6 m; esta corrección no altera esa geometría.

## Color del río al entrar al agua

Se reprodujo el cambio brusco entre X 1842, Z −1735 (óptica desactivada) y X 1841, Z −1736 (activada). El pase de profundidad opaca sólo incluye objetos próximos a 100 m, pero el pase de interfaces incluye los ríos lejanos. Desde el aire, el shader interpretaba la profundidad vacía como una columna de agua de hasta 90 m: el cauce distante se volvía azul y perdía su niebla al activarse el efecto local.

`WaterOptics` conserva el material y la niebla originales cuando falta profundidad opaca. Con la cámara sobre el agua, la contribución óptica local se desvanece entre 60 y 90 m, antes del límite de descarte; también atenúa las cáusticas. Bajo el agua se mantiene el cálculo de absorción existente. No se amplía el pase de profundidad ni se añaden texturas, geometría o recursos residentes.

Validación: `node scripts/check-worldstudio-game.mjs --run --water-entry` recorre orilla, agua y regreso con el controlador real, comprueba la activación 0 → 1 → 0 y ejecuta regresiones GPU de superficie inclinada, vista parcialmente sumergida, huella finita y agua distante. La nueva prueba falla antes de corregir el shader: a 110 y 200 m, RGB [184,127,82] pasaba a [9,59,66]. Después conserva [184,127,82] a 95, 110 y 200 m; a 12 m mantiene la absorción [141,120,81] y a 80 m transiciona a [173,125,82]. Cuatro ciclos adicionales no acumulan recursos y al salir se recupera el color original. Evidencias antes/después en `artifacts/geographic-source/water-entry/`.

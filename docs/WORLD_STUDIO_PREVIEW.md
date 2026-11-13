# Prueba del mapa World Studio v3.6

> Cambio de enfoque: el preview independiente queda como referencia histórica.
> La implementación vigente reutiliza `TerrainStream` del juego y se documenta en
> [World Studio como fuente geográfica](WORLD_STUDIO_GEOGRAPHIC_SOURCE.md), con
> nuevas pruebas, capturas, mediciones y plan de migración. Las métricas siguientes
> corresponden al enfoque anterior y no describen el sector híbrido actual.

## Revisi?n geom?trica del 12 de noviembre de 2026 ? aceptaci?n pendiente

Trabajo exclusivo en `feat/worldstudio-v36-preview`. `main`, los guardados, los R16,
los pol?gonos aprobados y los GLB fuente de Albor/Umbrael no se modificaron.
Las secciones bajo **Historial anterior** describen revisiones previas: sus capturas
no validan este nuevo sistema.

### Auditor?a de los datos y de la malla

Los 25 R16 originales tienen **640 ? 640 muestras**, 819.200 bytes cada uno:
20.480.000 bytes en total. Cubren sectores de 2.800 m: separaci?n **4,38185 m**.
El proyecto `.ptrterrain`, en cambio, contiene un sculpt global de **640 ? 640**
sobre 14.000 m: **21,90923 m** entre muestras de autor?a. No son resoluciones
intercambiables. Comparar todos los R16 con una interpolaci?n bilineal de ese sculpt
produce RMS **1,23478 m**, P95 absoluto **1,81934 m**, m?ximo **44,40493 m**.
No puede afirmarse que cada muestra R16 contenga detalle independiente ni que el
exportador sea una simple interpolaci?n bilineal. Falta el algoritmo del exportador
para atribuir ese residual. No se invent? relieve ni se subdividi? por debajo del R16.

El importador conserva uint16 LE y decodifica linealmente las alturas. Su sampler
es bilineal; la malla anterior muestreaba a 96/384 subdivisiones por sector y
adem?s aplanaba cuatro filas del borde cercano para alcanzar el borde lejano.
El sistema nuevo toma posiciones enteras del R16 y utiliza interpolaci?n triangular
s?lo para consultar la superficie renderizada o para la transici?n temporal de LOD.

| Malla | Paso interior | V?rtices por unidad | Tri?ngulos por unidad |
| --- | ---: | ---: | ---: |
| Preview anterior, cerca: sector entero | 7,29167 m | 148.225 | 294.912 |
| Preview anterior, lejos: sector entero | 29,16667 m | 9.409 | 18.432 |
| Nuevo, cerca: parche 311,11 m | 4,38185 m | 5.184 | 10.082 |
| Nuevo, intermedio: parche 933,33 m | 13,14554 m | 5.752 | 10.650 |
| Nuevo, lejos: sector 2.800 m | 39,43662 m | 7.456 | 12.354 |
| main, cerca: chunk 72 m | 6 m | 169 | 288 |
| main, intermedio: chunk 144 m | 18 m | 145 | 192 |
| main, lejos: chunk 288 m | 36 m | 241 | 288 |

Los bordes nuevos mantienen paso 4,38185 m en todos los LOD; los de `main`, 6 m.
La densidad interior cercana nueva es 1,875 veces la de main por unidad de ?rea;
la anterior era 0,677 veces. Esto describe pol?gonos, no detalle geol?gico nuevo.
`TerrainStream` y sus configuraciones en esta rama son iguales a `main`.

En un cuadro de 620 m alrededor de la costa aportada (1373, ?438), 20.022 muestras
R16 revelan que la malla anterior ten?a RMS **1,62555 m** y m?ximo **35,62853 m**
de diferencia con el mismo campo de alturas/cauces. En la isla (1369, ?303), RMS
**1,27215 m**, mismo m?ximo. El nuevo LOD cercano reproduce exactamente los v?rtices
R16 del campo: no fuerza su altura contra el LOD lejano. Esto demuestra la eliminaci?n
de un error geom?trico; todav?a no sustituye una comparaci?n visual desde el jugador.

### Streaming y transiciones

Se adapta el contrato de cobertura de `TerrainStream`: el padre permanece disponible
hasta tener todos sus hijos; se libera el detalle que deja de necesitarse. Los sectores
se dividen 3 ? 3 y luego 3 ? 3 porque 639 = 9 ? 71. Radios de selecci?n: 420 m cerca
y 1.100 m intermedio, medidos contra el rect?ngulo del parche. El per?metro usa fans
con muestras originales compartidas, sin faldones ni deformaci?n de acantilados.
La transici?n de 350 ms interpola desde los tri?ngulos reales del padre; al caminar,
la altura consultada coincide con esa superficie en transici?n.

La generaci?n cede cada 128 v?rtices, con presupuesto objetivo de 4 ms por frame.
El upload de un parche es indivisible, por lo que ese presupuesto no es una garant?a
absoluta de tiempo. El estado estable no vuelve a reconstruir la visibilidad cada frame.
L?mite expl?cito de buffers de terreno: **28 MiB**, incluyendo los buffers de morph.
La selecci?n estable alcanza como m?ximo 36 parches cerca y 36 intermedios, adem?s
de los 25 sectores lejanos. No son 25 sectores a m?xima densidad. Durante un cambio
pueden coexistir padres/hijos o detalle saliente, siempre dentro de ese presupuesto.
Se elimin? la cach? ilimitada de muestras de la malla anterior.

### Comparaci?n calculada de residencia

Valores de topolog?a/selecci?n, **no consumo total del proceso ni visibilidad en el
frustum**. El anterior mantiene 25 mallas gruesas y hasta dos finas. Los padres ocultos
se cuentan como residentes. La columna de buffers es una copia GPU de posiciones,
normales, ?ndices y, en el sistema nuevo, alturas de morph. Excluye texturas,
heightmaps, copias CPU, agua, objetos y memoria del navegador.

| Vista nueva | Tri?ngulos residentes | Tri?ngulos habilitados antes del frustum | Buffers terreno | Frame / GPU / proceso |
| --- | ---: | ---: | ---: | --- |
| Anterior, dos sectores cerca | 1.050.624 | 1.013.760 | 24,19 MiB | No medidos en prueba equivalente |
| costa | 1,055,202 | 963,186 | 21.53 MiB | Pendiente |
| isla | 1,055,202 | 963,186 | 21.53 MiB | Pendiente |
| ladera | 959,352 | 879,690 | 19.60 MiB | Pendiente |
| vegetacion | 964,464 | 883,098 | 19.76 MiB | Pendiente |
| nacimiento | 863,502 | 796,194 | 17.67 MiB | Pendiente |
| desembocadura | 682,026 | 636,018 | 14.14 MiB | Pendiente |

Detalle por LOD en costa/isla:

| LOD | Parches residentes / habilitados | V?rtices residentes | Tri?ngulos residentes | Tri?ngulos visibles |
| --- | ---: | ---: | ---: | --- |
| Cerca | 36 / 36 | 186.624 | 362.952 | Pendiente de captura runtime |
| Intermedio | 36 / 32 | 207.072 | 383.400 | Pendiente de captura runtime |
| Lejos | 25 / 21 | 186.400 | 308.850 | Pendiente de captura runtime |

Los buffers nuevos de costa/isla suman 21,53 MiB, m?s 2,21 MiB de alturas CPU para
muestrear padres. No equivalen a los 1,1 GB del preview o los aproximadamente 500 MB
del juego informados por el usuario. Chrome expuso 323 MB en la pesta?a anterior,
y despu?s 297 MB en la vista general nueva: son lecturas de la interfaz, con vistas
distintas, y **no permiten afirmar una reducci?n equivalente ni un pico m?ximo**.
La vista general nueva cargada mostr? 363.274 tri?ngulos de escena y 30 FPS limitados.
No se midieron todav?a tiempos CPU/GPU ni percentiles equivalentes con main.

### Agua y materiales

El agua cercana usa una malla independiente de 622,22 m, alineada a la grilla R16,
recortada por intersecci?n de cada tri?ngulo con la cota de agua y el ?rea autorizada.
La m?scara de oc?ano s?lo selecciona una vecindad; no determina la costa cercana.
Los lagos lejanos triangulan sus v?rtices aprobados mediante ear clipping: se eliminan
la expansi?n Catmull-Rom y los abanicos radiales que pod?an cruzar pol?gonos c?ncavos.
La geometr?a de ola se aten?a en la orilla y en el borde del parche. Hay espuma
seg?n profundidad y franja h?meda en el material del terreno. La normal del agua
se corrigi? a Y-up. Mar, lagos y r?os conservan materiales separados.

Los r?os ya no se mueven con el LOD. Reutilizan el material World Water de Auralia y
muestrean un campo geogr?fico estable. **El perfil a?n no est? resuelto:** 765 de
4.547 muestras centrales de la cota provisional quedan bajo el cauce limitado a
3 m. En esos cruces se conserva una cinta provisional por encima del campo fuente,
sin depender de los tri?ngulos de cada LOD; esto evita hacer desaparecer el agua,
pero no demuestra un perfil hidr?ulico correcto ni una desembocadura aprobada.
Las cotas de los tres lagos siguen siendo nulas en la fuente y Y=1 es provisional.
No se invent? una uni?n de 255 m sobre la loma entre Prado y Vertientes.

Se comparten siete albedos y siete normales 1K del cat?logo del juego, con roughness
del cat?logo, reflexi?n GGX y proyecci?n triplanar de color y normales en pendientes.
El RGB exportado aporta 22 % del color; las m?scaras de bioma y la vegetaci?n V4
instanciada existente permanecen. Estos materiales no a?aden resoluci?n geom?trica.
Los GLB originales de los reinos flotantes no se editaron; sus proxies preexistentes
se conservaron y no forman parte de esta reconstrucci?n del terreno continental.

### Reanudaci?n con Chrome visible

Se export? desde el bot?n del preview una [captura real de costa](../artifacts/world-preview/coast-native-before-water-seam.png), en (1373, ?438). Corresponde al sistema de parches antes de la correcci?n de la uni?n del agua. En esa imagen se detect? una l?nea discontinua sobre el borde del parche acu?tico: se igual? la cota de lagos/agua local y se a?adi? una franja de mezcla de 8 m con orden de profundidad expl?cito. Esa correcci?n todav?a necesita una captura posterior.

La interfaz de Chrome permiti? leer 383.706 tri?ngulos de escena, 78 draw calls, 300 frames con mediana 34,60 ms y P95 35,40?35,50 ms, CPU de render 1,00?1,30 ms y heap JS alrededor de 177,5 MiB. La pesta?a indicaba 336?343 MB. Terreno en frustum: 13 parches cercanos (131.066 tri?ngulos), 7 intermedios (74.550), 8 lejanos (98.832). El FPS est? limitado a 30. La ventana cambi? de tama?o durante los intentos de control y los valores GPU variaron; estas lecturas **no son una comparaci?n v?lida antes/despu?s ni frente a main**.

`inspection.mjs` ahora cuenta s?lo resultados nuevos del timer GPU y permite recorrer seis vistas y descargar im?genes/mediciones en un ?nico JSON. Las c?maras de inspecci?n usan una cota fija derivada del campo fuente en ambas geometr?as, para que el cambio de LOD no cambie el punto de comparaci?n. El modo normal de caminar conserva su consulta a la superficie visible.

Se preparó `scripts/benchmark-world-preview-browser.mjs --run`: Chrome headless instalado, perfil nuevo por variante dentro de `.test-build`, viewport 1600 × 900, seis vistas en geometría anterior/nueva y en `tests/world-preview-main-reference.html`. Esta última reutiliza la referencia existente con adaptador de guardado en memoria; no carga partidas del usuario. **No ejecutado: el usuario eligió exportar las capturas manualmente.** El script no constituye evidencia de rendimiento ni de calidad visual.

### Corrección sobre Graphify

La indicación de que la actualización semántica necesitaba una API key fue incorrecta.
La skill instalada permite extraer documentos e imágenes con los agentes de esta
sesión. `GEMINI_API_KEY` o `GOOGLE_API_KEY` son alternativas opcionales para usar
Gemini, no requisitos para continuar. El error del comando CLI no demuestra una
limitación del flujo de la skill. La actualización semántica de esta revisión abarca
este informe y la captura de costa anterior a la corrección del agua; no equivale a
validar las imágenes ni a reextraer todo el archivo histórico del proyecto.

### Reproducci?n y aceptaci?n

- `python scripts/audit-worldstudio-source.py`: resoluci?n, residual y SHA-256 por R16 en `artifacts/world-preview/source-audit.json` (requiere NumPy).
- `node scripts/audit-worldstudio-geometry.mjs`: conteos por vista/LOD, errores del muestreo anterior y perfiles fluviales en `artifacts/world-preview/geometry-audit.json`.
- `node tests/world-preview-stream.test.mjs`: ?rea y orientaci?n de tri?ngulos, per?metros completos, muestreo triangular, cobertura sin huecos/solapamientos durante morph, liberaci?n tras tres viajes, l?mite de selecci?n y triangulaci?n de lagos. Pasa con NullEngine; no es benchmark de GPU.
- `node tests/validar_assets.mjs` y `node tests/world-preview-lod.test.mjs`: pasan. La segunda prueba corresponde s?lo al modo anterior de comparaci?n.
- `npm run check`: pasa. Vite build: pasa (aviso habitual de chunk grande). El sandbox requiri? escalaci?n para que esbuild iniciara su proceso.

En desarrollo, **Inspecci?n geom?trica** ofrece costa, isla, ladera, vegetaci?n,
nacimiento y desembocadura con c?maras reproducibles y botones para guardar JSON
/captura. `?qa=costa` abre directamente una; `?geometry=baseline&qa=costa` conserva
la geometr?a anterior para aislar la comparaci?n geom?trica (agua/materiales son
los actuales en ambos modos). El panel distingue residencia, visibilidad, frame
mediano/P95, CPU de render, GPU si hay timer query y heap JS. El heap no es memoria
del proceso. Comparar despu?s de estabilizar la carga, misma resoluci?n y altura;
registrar adem?s memoria del proceso y pico de GPU en el hardware objetivo.

**No aceptado todav?a:** faltan las cinco comparaciones visuales equivalentes con
main, el recorrido durante transiciones, mediciones de proceso/picos/frame y resolver
los perfiles acu?ticos pendientes. Computer Use pudo leer ambas escenas, pero las
capturas agotaron tiempo; luego detuvo la navegaci?n al no poder verificar la URL
actual de Windows con confianza. No se sustituy? esa validaci?n por una compilaci?n
ni se reutilizaron capturas viejas como evidencia del resultado nuevo.

## Historial anterior (no valida la revisi?n geom?trica actual)


## Abrir la escena

En la raíz del repositorio, ejecutar `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173` y abrir `http://127.0.0.1:5173/world-preview.html`. El enlace **Volver al juego actual** lleva a `/`. La vista previa tiene su propia entrada HTML y no importa `src/main.ts`, `GameStore` ni `SaveRepository`; no lee ni escribe partidas o `localStorage`.

La escena carga 25 sectores R16 de 640 × 640, sus mapas RGB8, las siete capas de pintura originales y los GLB v6. Una sola instancia de material Babylon comparte siete albedos y siete normales de 1024 × 1024 del catálogo de `main`; las máscaras pintadas mezclan sus colores y texturas, mientras el RGB8 exportado conserva una contribución del 52 % para mantener los tonos regionales. La iluminación y el cielo adoptan la configuración del juego; la niebla orbital se atenúa para poder evaluar el color y el relieve a escala continental. Hay 25 mallas generales de 96 subdivisiones (paso de 29,17 m) y como máximo dos mallas cercanas de 384 subdivisiones (paso de 7,29 m). Sólo se generan instancias próximas de ocho modelos V4 de árboles, arbustos y pastos, y tres piezas del pack de rocas de `main`. El mar y los lagos están en Y=1, provisional por falta de cotas de agua en la hidrografía. Los 13 splines de tipo río producen superficies visuales próximas a la cámara. Las líneas de autoría siguen como guías separadas, ocultas al entrar y activables con **Mostrar guías**.

Las islas pequeñas de la costa aprovechan las 640 muestras R16 por sector, con más vértices al acercarse. El mar se recorta con una máscara visual de 2048 × 2048 derivada del contorno de nivel del R16 original y de la guía de océano de 640 px; su borde se interpola con transparencia. Los tres lagos se dibujan desde los polígonos originales, interpolando entre sus puntos sin moverlos, con cinco anillos interiores para ondulación leve. Un parche oceánico de 480 m y 120 subdivisiones sigue la cámara sólo en vistas cercanas; la superficie distante conserva dos triángulos. Estas mallas no cambian el relieve ni el archivo de hidrografía. Albor y Umbrael conservan sus GLB v6: cerca de la cámara se dibuja un clon visual subdividido de la superficie superior y la roca inferior, mientras las mallas importadas permanecen intactas. El clon usa los mismos materiales y texturas 1K.

La vista inicial muestra gran parte del continente desde el sur y desde arriba. **Vista general** regresa a ella. Orbital permite rotar, desplazar y acercar con la rueda o con **Acercar/Alejar**; vuelo usa WASD y Q/E; caminar busca un punto con pendiente moderada y orienta la cámara hacia un horizonte despejado. El menú incluye Ferragrís, Nácar, el desierto, las Cumbres, los ríos y accesos a Albor y Umbrael tanto desde arriba como desde abajo. Los ríos se aprecian en vistas cercanas: seleccionar uno en el menú lo abre con zoom, y al seguir acercándose se puede inspeccionar el cauce. **Rendimiento gráfico** ofrece 20, 30 o 60 FPS y tres resoluciones internas; arranca en 30 FPS y 75 %. El panel muestra FPS, triángulos, draw calls, sectores en el encuadre, tramos de río e instancias próximas.

Albor está en X=-4750, Z=-3500, Y=1350 y Umbrael en X=5200, Z=-3700, Y=1200. Sus alturas de suspensión son provisionales. El carrier rota los GLB de Z-up a Y-up una vez; en las capturas cercanas las plataformas verdes de Albor quedan horizontales y las bases rocosas apuntan hacia abajo.

## Ríos del preview y continuidad

`splines.json` contiene 13 trazados de tipo `river` y 37 de caminos. Los ríos usan las coordenadas y anchos exportados de 10, 12 o 22 m; el spline, los R16 y las coordenadas fuente permanecen intactos. El cauce es una depresión calculada en las mallas del preview, limitada a 3 m bajo el terreno original y suavizada hacia ambas orillas. Se calcula con los mismos splines para las mallas generales y las de detalle; no se graba en los heightmaps. El agua se subdivide a intervalos de hasta 8 m y se dibuja en tramos de aproximadamente 400 m. Su material compartido es el mismo perfil `World Water` del río en el juego actual, con sus máscaras 1K de cáusticas y espuma. Cada vértice aporta orilla y profundidad visual del cauce; la velocidad, turbulencia y dirección se estiman a partir de la pendiente y curvatura del spline, en vez de valores fijos. La vista global oculta el agua fluvial; en vistas próximas se activan trazados completos de ríos cercanos. Las guías se pueden activar por separado para comparar la superficie con el trazado original.

La continuidad se verifica en el LOD que se está dibujando: la superficie del agua queda 1,4 m sobre la altura interpolada de los triángulos del cauce visible, mientras la depresión en la franja acuática mide al menos 2,2 m en los vértices del terreno. Al pasar de 96 a 384 subdivisiones se recalcula la misma malla de agua. Las cuatro muestras finas de cada segmento del borde se ajustan al borde general vecino, con una transición de cuatro filas dentro del sector: los 40 límites conservan una unión continua sin modificar los R16. El fondo del cauce puede seguir una ladera muy empinada, con un máximo de 3 m de excavación visual, en lugar de abrir una garganta artificial para mantener una lámina horizontal. Los extremos de tramos vecinos comparten muestras y normales transversales. El primer punto de `rv-ferragris` repite una posición posterior y creaba un salto de 330 m; se omite sólo al construir la superficie y la guía, sin editar el JSON fuente.

Hay una discontinuidad en la **autoría** entre el inicio de `rv-prado` y `rv-salida-vertientes`: sus ejes quedan a 255 m y el terreno intermedio se eleva aproximadamente 17 m por encima de las cotas de agua de ambos splines. La superficie del preview conserva los dos extremos; unirlos con una franja de agua atravesaría esa loma e inventaría un cauce fuera del trazado aprobado. Al inspeccionar Vertientes desde arriba se ve el extremo del Prado como un nacimiento separado, no como un tramo descargado a mitad de spline.

Capturas cercanas: [Ferragrís](../artifacts/world-preview/river-ferragris.png), [Cumbres](../artifacts/world-preview/river-cumbres.png), [Vertientes desde arriba](../artifacts/world-preview/river-vertientes.png), [Vertientes junto al cauce](../artifacts/world-preview/river-vertientes-side-close.png), [Nácar](../artifacts/world-preview/river-nacar.png) y [Valle](../artifacts/world-preview/river-valle.png). El preview representa una superficie en movimiento; **no simula caudal, profundidad física, erosión, colisiones acuáticas ni cascadas funcionales**. Las cotas de agua y la sección del cauce son visuales y provisionales hasta contar con niveles aprobados para el gameplay.

## Máscaras de superficie originales

`WorldStudio_v3_6_fuente.ptrterrain` es un ZIP con `project.json`. En `terrain.manualTerrain.surfacePaint.materials` hay dos cadenas Base64 llamadas `weightsA` y `weightsB`. Cada una decodifica a 409.600 bytes: una grilla RGBA8 de 320 × 320. `weightsA` contiene los canales 0–3; `weightsB` los canales 4–6 y un octavo canal vacío. El origen es X=-7000, Z=-7000, el alcance es 14.000 × 14.000 m; las columnas avanzan hacia el este (+X) y las filas hacia el sur (+Z), con la fila 0 en el borde norte. No hay inversión ni rotación de la máscara. Se comprobó con la pintura de arena en (-5200,-3800), Umbrael en (5200,-3700), la zona húmeda de Nácar en (1450,-520) y la nieve de las Cumbres en (2500,-3500). La prueba automática verifica también SHA-256 del proyecto y de ambas máscaras.

Los valores son pesos de pintura, no colores RGB8. Algunas sumas por píxel superan 255; el shader los normaliza. Ambas máscaras se muestrean como un atlas global con interpolación bilineal, de modo que una transición puede cruzar el borde de un sector sin reiniciarse. El exportador reproducible es `scripts/export-worldstudio-materials.py`; sólo extrae datos de pintura, no toca R16 ni GLB.

El proyecto **no serializa nombres de canales ni rutas de los mapas PBR originales**. Esta asignación visual usa texturas 1K compartidas del catálogo actual de Auralia y conserva los RGB8 exportados como referencia de color; no equivale a recuperar los materiales PBR nativos de World Studio:

| Canal original | Sustituto visual de Auralia | Uso visible |
| --- | --- | --- |
| 0 | `pradera_templada` | Pasto |
| 1 | `sierra_grava_pasto` | Tierra y grava |
| 2 | `desierto_arena` | Arena |
| 3 | `snow` | Nieve |
| 4 | `pantano_humedo` | Zonas húmedas |
| 5 | `rock` | Roca |
| 6 | `tierra_maldita` | Suelo de Umbrael |

Las texturas usan las escalas físicas del catálogo actual, con proyección triplanar también para pasto, tierra, arena y nieve en las pendientes. Una segunda escala y un desplazamiento suave reducen repeticiones. El color base combina los albedos de Auralia ponderados por los canales pintados y un 52 % del RGB8 exportado de World Studio. La vegetación y las rocas son una aproximación filtrada por peso pintado, pendiente, altura, cercanía y distancia del cauce; el archivo de World Studio no incluye posiciones de instancias para esta prueba.

## Comparación visual con World Studio

Referencia: [vista de datos reales](../artifacts/world-studio/Auralia_Vista_Previa_Datos_Reales.png) y [máscara de agua](../artifacts/world-studio/Auralia_Mascara_Agua_Referencia.png). La referencia es cenital; las capturas de Babylon son perspectivas 3D. La vista general mira desde el sur, por lo que el este queda a la izquierda de la imagen; las coordenadas del mapa y la ubicación oeste/este de los reinos no cambian.

Las capturas `overview`, `ferragris`, `nacar`, `desert`, `cumbres`, `albor-above`, `umbrael-above` y `river-vertientes-side-close` se renovaron después de los cambios de geometría y color. Otras capturas archivadas pueden corresponder a una revisión anterior del preview.

| Región | Verificación en navegador | Diferencia que queda |
| --- | --- | --- |
| [Ferragrís](../artifacts/world-preview/ferragris.png) | Predominan piedra y tierra gris, con laderas y rutas en la posición esperada. | El sombreado de roca y la vegetación son sustitutos de Auralia; no hay galerías ni puentes jugables. |
| [Nácar](../artifacts/world-preview/nacar.png) | Se reconocen el cuenco del lago, las zonas húmedas y la ribera. El borde procede del polígono de 129 puntos y el agua tiene malla interior ondulada. | La cota Y=1 sigue siendo provisional; la isla del lago revela todavía la forma discretizada del R16 a distancias muy cortas. |
| [Desierto](../artifacts/world-preview/desert.png) | La arena ocupa el sector pintado y pasa a roca/pasto sin cortar en el límite de sector. | El grano y brillo de la arena dependen del sustituto 1K, no del PBR de World Studio. |
| [Cumbres](../artifacts/world-preview/cumbres.png) | La nieve y la roca conservan sus áreas y el relieve exportado; Umbrael aparece al este con su GLB v6. | Aun con la malla más densa, el color y el sombreado de roca y nieve dependen de sustitutos de Auralia, no del PBR nativo de World Studio. |
| [Albor y Umbrael](../artifacts/world-preview/albor-above.png) | Sus perfiles cercanos usan clones visuales subdivididos de los GLB v6, con las texturas y colores originales intactos. | El diseño de las plataformas sigue siendo simple en su fuente v6; subdividir el render no añade detalles de arquitectura. |
| [Ríos cercanos](../artifacts/world-preview/river-vertientes-side-close.png) | Los 13 trazados se convierten en agua visible del perfil `World Water`; el cauce local sostiene la superficie al cambiar de LOD. | El fondo visual, la profundidad y las cotas finales requieren autoría; la separación entre Prado y Vertientes ya está en los splines exportados. |

El mayor límite pendiente es disponer de los nombres y mapas PBR originales de las siete capas, junto con cotas de agua autorizadas. La vista diurna y la vegetación dispersa del preview todavía difieren de la escena jugable nocturna usada como referencia visual. La máscara costera derivada sigue limitada por las 640 muestras de altura de cada sector y por la guía original del océano; no representa una costa modelada a mano. No se regeneraron heightmaps ni se alteraron coordenadas de los archivos exportados; el cauce existe sólo en la malla temporal del preview.

## Verificación de esta integración

- `node tests/validar_assets.mjs`: 25 sectores, 40 uniones de altura originales, 7 canales de 320 × 320 con hash y orientación correctos, 2 GLB v6 válidos y orden oeste/este correcto.
- `node tests/world-preview-lod.test.mjs`: 15.400 muestras sobre los 40 bordes entre el LOD de 384 subdivisiones y su vecino de 96; separación máxima medida: 0 m. `python scripts/build-worldstudio-shore-mask.py` reproduce la máscara costera de 2048 px desde los R16 y la guía original, sin escribir heightmaps.
- `npm run check` y `npm run build`: pasan; el build produce `dist/index.html` y `dist/world-preview.html`.
- `npm run test:atlas`: pasa. `npm run test:stream` falla en su aserción de inicialización `<2500 ms` en `tests/terrain-stream.test.cjs:25`, incluso con el servidor detenido. `npm run test:geography` pasa la prueba principal de geografía y falla en `tests/regional-relief.test.cjs:21` (`outer landscape gains substantial relief`). No se modificaron los módulos ni las pruebas de esos dos fallos.
- Chrome headless con SwiftShader: vista general, Ferragrís, Nácar, desierto, Cumbres, ambos reinos desde arriba y abajo, caminar, vuelo y mostrar guías. En esta revisión se volvió a recorrer Albor, Umbrael, Nácar y Vertientes; se comparó el GLB original de Albor contra su clon subdividido en la misma cámara. La captura lateral cercana de Vertientes permite revisar el contacto con las orillas y la escala del pasto. Se cargaron las 13 opciones de ríos sin excepciones JavaScript ni errores de recursos o shader.
- Capturas reales: [vista general](../artifacts/world-preview/overview.png), [Albor arriba](../artifacts/world-preview/albor-above.png) y [abajo](../artifacts/world-preview/albor-below.png), [Umbrael arriba](../artifacts/world-preview/umbrael-above.png) y [abajo](../artifacts/world-preview/umbrael-below.png), [caminar](../artifacts/world-preview/walk.png) y las cuatro regiones de la tabla anterior.

En la prueba por software, la vista general produjo aproximadamente 2 FPS, 529.000 triángulos, 53 draw calls y 25 sectores generales con ninguno refinado. Ferragrís produjo 1 FPS, 474.000 triángulos y 79 draw calls; Nácar, 1 FPS, entre 525.000 y 558.000 triángulos según terminara de cargar el segundo LOD cercano; desierto, 1 FPS, 780.000 y 40; Cumbres, 1 FPS, 574.000 y 49. Los FPS de SwiftShader no representan el rendimiento de una GPU real, pero el costo geométrico es materialmente mayor que antes. Las 14 texturas de capas 1K se comparten entre todos los sectores y ocupan memoria de GPU adicional a los datos R16/RGB8, los GLB, la máscara costera y los buffers de terreno. Medir memoria, tiempos y margen de GPU en hardware objetivo antes de incorporar el mapa al runtime jugable.

En la recorrida de ríos, la vista global mantuvo 0 tramos acuáticos activos. Las vistas cercanas activaron 60 tramos en Ferragrís, 41 en Cumbres y 38 en Vertientes. Sólo dos sectores se refinan a 384 subdivisiones. La auditoría del cauce recorrió 4.547 muestras de los 13 ríos y encontró una excavación máxima de 3 m, sin muestras que superaran ese límite. Estos valores son de SwiftShader y sólo sirven como control funcional.

## Fase B: diseño de integración jugable opt-in

La escena actual es una prueba visual. La siguiente fase debe entrar solo con `?world=worldstudio-v36` o un control de desarrollador, manteniendo `sampleMainlandHeight` y la ruta actual como modo legacy. El selector del mundo se decide al inicio, antes de crear `WorldView`, y se inyecta como interfaz de superficie/sector para que render y colisiones consulten la misma fuente. Fuera del flag, se crea exactamente el mundo actual.

1. **Datos y muestreo.** Extraer `AuraliaHeightAtlas` a un lector tipado de sectores R16 con `sampleHeight(x,z)`, `sampleSurface(x,z)` y `getTile(cx,cz)`. Cargar primero un sector de inicio y sus vecinos; en modo experimental, esperar los sectores necesarios antes de activar movimiento o teletransporte. No devolver una altura legacy cuando falte un sector World Studio: eso separaría la colisión del relieve visible. Declarar un estado `loading` y bloquear o reubicar al jugador de forma segura hasta que el dato esté presente.
2. **Streaming y LOD.** Conservar la estructura near/mid/far de `TerrainStream` y `terrainLod`, sustituyendo su fuente de alturas por el proveedor elegido. Evitar un far-grid completo de 14 × 14 km al iniciar. Generar meshes por sector y subtiles con cola priorizada por cámara, límite de trabajos por frame y caché LRU con presupuesto explícito de bytes. Mantener cobertura gruesa de cada sector cargado mientras llegan refinamientos; cambiar mesh y sampler en una misma transición. Eliminar buffers de CPU y GPU al desalojar un sector, excepto los necesarios para movimiento inmediato.
3. **Rutas de altura.** Sustituir los accesos directos al sampler legacy en `WorldView` (traversal, cámara, puntos de aparición, teletransportes y construcción), `GameStore`/`BuildVisuals` (base de edificios), `TerrainStream`, `GeographyStream`, `AuthoredAssets`, `GrassSectorSystem`/`GrassSectorBake`, `vegetationData`, `worldPropsData`/`WorldPropSystem`, `geologyPresets`, `OceanWater`, `riverFlow`, `WaterfallGeometry` y las herramientas del editor. Pasar también el proveedor a `nearTerrainHeightAt`/`nearTerrainSurfaceAt` para que props, vegetación y colisiones coincidan con el mesh. Revisar `mapProjection` y minimapa con los nuevos límites y coordenadas.
4. **Agua, pasos y cuevas.** `hidrologia_v3_6.json` y las 50 splines son guías, no superficies de agua jugables. Definir por separado niveles y volúmenes de ríos, lagunas, cascadas y mar antes de activar `GeographyStream`, `OceanWater`, `lagoonWaterAt`, `waterSurfaceAt` y `riverFlow` en el mundo nuevo. Revisar puentes y pasos en `mountainRoutes`/`MountainPassSystem`, además de entradas y techos de cuevas en `lagoonData`/`LagoonSystem`. Si una función geográfica legacy no tiene equivalente World Studio, desactivarla **solo dentro del modo experimental** con un resultado explícito y visible para QA, en vez de colocarla usando alturas incompatibles.
5. **Partidas y reversión.** Separar la posición y cualquier construcción experimental por identificador de mundo. Nunca interpretar coordenadas de una partida legacy como coordenadas de World Studio ni migrarlas automáticamente. Al quitar el flag, cargar el mundo y la posición legacy sin cambios. Los GLB flotantes siguen siendo decoración; no asignar colisiones caras, edificios, NPC ni portales hasta contar con datos de autoría y pruebas específicas.

### Gates para activar la fase B

Verificar continuidad de altura en los 40 bordes, exactitud entre sampler y mesh en near/mid/far, teletransportes a todos los destinos, colisiones y cámara al cambiar de sector, colocación de props y edificios, vegetación y exclusiones de agua, entradas de cuevas, puentes y lagunas. Medir FPS, draw calls, memoria máxima, tiempo hasta la primera imagen y picos al viajar entre sectores en hardware objetivo. Confirmar que la partida legacy y su posición son idénticas antes y después de usar el flag.

**Pendiente:** caudal y cascadas animadas, puentes jugables, cuevas adaptadas, estructuras/NPC y guardado de posición en el nuevo mundo.

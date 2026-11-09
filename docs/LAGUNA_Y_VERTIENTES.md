# Laguna de las Tres Vertientes

Implementación revisada el 9 de noviembre de 2026. Es una región jugable de prototipo, no una región terminada artísticamente.

## Ubicación y controles

- Laguna centrada en **X -160, Z -810**, aproximadamente 340 × 270 m y hasta 18 m de profundidad. El mapa contiene un punto de acceso en la orilla sur, **(-160, -650)**.
- Tres vertientes: Ferragrís, Velo y Gemelas. Los canales descienden hacia las cascadas y la laguna tiene un desagüe hacia el arroyo existente.
- Santi entra en nado al perder el apoyo en agua profunda. **WASD** desplaza y **Shift** acelera. Una pulsación de **Espacio** sumerge hasta 8 m bajo el nivel del agua (limitado por el fondo); la siguiente vuelve a la superficie. Soltar la tecla mantiene la profundidad. Mantenerla pulsada no alterna repetidamente. **Ctrl** conserva el descenso manual opcional. Recupera la marcha al alcanzar una orilla somera.
- La entrada sumergida está en **(-6, -858)**, alrededor de Y 11. **E** permite entrar en el sifón.
- La cámara interior contiene un lago, siete conexiones y dos salidas secas: mirador **(50, -1060)** y bosque húmedo **(160, -720)**.
- Las entradas utilizan una transición con E a un interior separado. No existe todavía una perforación continua del terreno que permita cruzar sin transición.

## Correcciones de geometría

Los canales de esta cuenca usan una banda continua con secciones cada 3 m, cuya orilla se busca sobre los triángulos del terreno cercano. Ya no se recortan por celdas completas de agua. La búsqueda toma la primera orilla, evitando saltar sobre un banco y crear triángulos de agua aislados.

La cuenca se aplica tanto al terreno histórico como al ampliado. Antes, la salida anticipada del cálculo histórico omitía la laguna y generaba una cuña elevada en su interior. La modificación se desvanece en los límites regionales para no generar cortes abruptos.

Los bordes de los tres niveles de terreno tienen faldones por ambas caras. Esto cierra las uniones donde el terreno cercano queda por encima de un vecino más simplificado. Se mantienen las distancias de streaming y las subdivisiones existentes.

Las antiguas grandes paredes y plataformas GLB se excluyen de la cuenca y de los tableros por su volumen, no solo por el centro. El antiguo cañón usa ahora pequeños afloramientos apoyados en las márgenes. Los tableros tienen textura de mampostería repetida, cantos, barandas y apoyos que terminan bajo su cara superior.

Los dos viaductos cruzan el nuevo río. Un tercer puente de unos 136 m incluyendo accesos conserva el camino histórico sobre el desagüe, cerca de **(-23, -530)**.

Las tres cabeceras tienen una poza de perímetro curvo, márgenes elevadas, bóveda rocosa y una surgencia que emerge bajo la roca. El perímetro del agua se busca sobre el terreno renderizado; no termina en una sección rectangular al aire. El desagüe conecta con el Arroyo del Prado existente.

La última sección de cada río comparte los 25 vértices del borde superior de su cascada. El cauce se estrecha y gira hacia ese borde, con márgenes adaptadas. El pie de la caída penetra ligeramente en la laguna. La superficie de la laguna mantiene una cota común, incluso en vértices descartados por la máscara de orilla: ya no se hunden formando triángulos. `GeographyStream` excluye esta cuenca y sus caídas también al muestrear esquinas, evitando tiras verticales de agua antigua.

Las galerías comparten secciones en los codos y alturas de bóveda continuas. Suelo y zócalo coinciden en anchura; los portales terminales cierran su fondo con roca y conservan la transición con E.

## Visibilidad submarina

- La órbita de nado se limita a 8 m y apunta al cuerpo a 1,25 m sobre los pies. Durante el buceo permanece bajo la misma superficie y se acorta ante el fondo, las orillas y las bóvedas.
- El agua deja ver al nadador desde arriba. Desde abajo, la transparencia disminuye fuera del cono de transmisión hacia la superficie, para que el paisaje no parezca estar detrás de un vidrio transparente.
- La atmósfera se calcula con la cámara activa después de resolver su posición. Niebla azul verdosa progresiva, cáusticas sobre el fondo real, iluminación limitada al personaje y hasta 48 burbujas pequeñas. La máscara de cáusticas reutiliza la textura del agua.
- El filtrado de color y la distorsión leve periférica reutilizan el postproceso de movimiento existente. No se añaden pases de profundidad o reflexión; el centro conserva la nitidez de Santi. El efecto se retira al salir del agua.

## Agua, vegetación y presupuesto

- Superficies y cascadas mediante shaders: flujo orientado, variación de color por profundidad, espuma, cáusticas y ondas de impacto en las tres vertientes. No se simula un volumen de agua con cuerpos rígidos.
- Rocío limitado a tres emisores de 120 partículas, activos según distancia. Agua exterior y rocas se cargan cerca de la cuenca y se liberan al alejarse.
- Construcción de las bandas de río repartida en cuadros con presupuesto de 1,5 ms; no se reconstruye cada cuadro.
- Sauces, sarandíes, juncos, totoras, helechos, flores, camalotes, lentejas de agua y nenúfares reutilizan los GLB y lotes de instancias existentes. Una revisión de la configuración actual produjo 351 colocaciones próximas, de ellas 69 árboles; la visibilidad depende de distancia y LOD.
- La acción de nado utiliza `Swimming (3)` del modelo de Santi. Las expresiones y las otras acciones existentes se conservan.
- El interior libera sus mallas y sus dos luces al salir. No se guardan las coordenadas negativas del espacio subterráneo como ubicación exterior del jugador.

## Validación y límites

`npm run test:lagoon` verifica la cuenca completa, el agua bajo puentes, el desagüe, las tres caídas, nado/buceo, salida a pie y conectividad interior. Las suites de streaming, vegetación, expansión, agua, props, travesía, biomas, rutas y física también se ejecutaron.

En `/tests/landscape-review.html`, `verifyLagoon` de `tests/lagoon.browser.mjs` recorre diez trayectos con el controlador real, comprueba la acción NLA y ocho visitas sin incremento de mallas, luces o materiales. Siete comprobaciones contra la geometría real no detectaron paredes bloqueando el eje de las galerías. Resultado guardado en `artifacts/lagoon/verification.json`.

`review.verifyRoutes()` obtuvo 23 comprobaciones satisfactorias, incluyendo los tres puentes y sus salidas. La revisión visual se realizó en Chrome aislado sin escribir el guardado del jugador. Los contadores estables del motor no equivalen a una medición sostenida de toda la memoria de Chrome.

La revisión submarina añade 48 órbitas en superficie/profundidad, 12 órbitas de caverna y 20 cruces de superficie sin aumento de recursos después de la inicialización. Las pruebas de teclado real verifican inmersión, mantenimiento de profundidad, repetición de tecla ignorada y retorno a superficie. Se comprueban las tres uniones río–cascada, la altura plana de la laguna y la ausencia de la antigua tira de agua junto a Ferragrís. Evidencia numérica en `artifacts/lagoon/underwater-verification.json`.

La suite general encontró una expectativa antigua en `regional-relief.test.cjs`: exige un aumento mayor a 25 m en (-1200, -1000), donde el relieve actual aumenta unos 21,3 m. El punto está fuera de esta cuenca y no recibe esta modificación. La expectativa se mantiene explícitamente pendiente; no se declara que toda la suite general pase.

Faltan una pasada artística de las laderas y fuentes rocosas, mejor integración de materiales y LOD de vegetación, audio ambiental y mediciones prolongadas de FPS/memoria. El nado queda habilitado en esta cuenca y su caverna; no se extiende todavía a todos los mares y lagos del mundo.

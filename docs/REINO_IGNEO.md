# Reino Ígneo integrado

Entrega fuente: `F:/PROYECTO AURALIA/REFACTORS/Reino_Igneo_Integracion_2026-11-19`. Integración verificada el 19 de noviembre de 2026.

## Acceso y escala

Ejecutar `npm run dev` y abrir `http://localhost:5173/?reinoIgneo=1`. También está el botón **Reino Ígneo · probar** y la entrada normal del volcán, mediante **E**. El acceso de desarrollo empieza en `A0`; `?reinoIgneo=1&checkpoint=mirador` permite elegir otro punto para pruebas. La entrada normal del volcán recupera el último checkpoint guardado.

Santi conserva sus 3,8 unidades y el controlador existente. El padre del nivel usa **3,8 / 1,4 = 2,7142857**, según la equivalencia indicada por el usuario. Las coordenadas de metadatos pasan por la matriz del root glTF; no se cambia el handedness global. Cada llegada se verifica contra los triángulos del suelo.

## Integración

- `IgneousRealm` carga y reutiliza el AssetContainer del nivel y otro pequeño contenedor para el cristal original, en la escena existente. `VolcanicCaveSystem` conserva la boca exterior y el flujo entrar/salir.
- GLB y JSON originales en `public/assets/reino-igneo`; shaders fuente en `src/world/reino-igneo`, empaquetados por Vite. Las texturas siguen embebidas en el GLB. No se descarga Blender ni se incorpora la preview.
- Base importada antes de sustituir el cristal: 396 mallas y 329.219 triángulos después de limpiar solapamientos (329.310 en el GLB), 368 colisionadores estáticos. Las puertas móviles tienen colisión y matrices independientes; la lava queda fuera del suelo, escalada y agua.
- Palanca, torno, hallazgos y recompensa única del Cristal usan `GameStore`. El checkpoint se guarda aparte, preservando el inventario y la posición exterior. Dogo se recoloca mediante su recuperación existente al cambiar de checkpoint del interior.
- Se excluye el exterior de los candidatos de dibujo, luces, agua y actualizaciones de vegetación. Al salir se restauran iluminación, entorno, cámara y clima. Los personajes y su equipo cargado tarde permanecen en la lista de dibujo.
- ACES y exposición 1,05 conservan el contraste del basalto. El perfil exterior se restaura al salir. Se retiró el foco sin fuente visible del palacio, incluida su sombra; la sonda de oro sigue calculándose una sola vez.
- Las listas de receptores son estables: dos fuentes puntuales, dos apliques bifocales y la iluminación ambiental. Máximo observado: ocho luces por malla, por debajo del límite de nueve del material.

## Correcciones de lava, pisos y escaleras

- Las cascadas traían franjas con toda la coordenada V fijada a 0,001. Ahora V proviene de la altura real, con una escala de 24 m por repetición; el lago mantiene su proyección independiente de 44 m. La corriente baja, la costra deriva y se erosiona, y el reloj del shader se actualiza incluso cuando Babylon reutiliza el material.
- La costra toma el albedo del **Macizo continuo de basalto · Reino**, la roca del entorno. No se usa como color de la costra la imagen de techo señalada por el usuario. Se mantienen los mapas de control y relieve de las placas; se recupera su detalle sin levantar la exposición general.
- Cuatro fuentes de área aproximadas sobre el lago y seis sobre las cascadas aportan luz cálida a sus alrededores. Comparten los dos puestos de iluminación por sector con los faroles. No producen sombras dinámicas ni son iluminación global trazada; el palacio cerrado queda fuera de esa contribución.
- De 110 luces puntuales de metadatos se conservan 87 con geometría emisiva próxima. Se retiraron 23 rellenos sin fuente visible, el foco del salón y los rellenos de la pasarela. Los apliques con luminaria se conservan. Las manchas blancas de la entrada al palacio desaparecieron.
- `IgneousGeometry` recorta 148 caras de basalto cubiertas por pavimento coplanar antes de registrar colisiones. Conserva el basalto expuesto y los atributos interpolados; no modifica el GLB fuente ni oculta el problema con un sesgo de profundidad.
- El apoyo usa normales geométricas y la altura del peldaño más alto bajo el pie, sin promediar alturas dentro del suelo. En esquinas y uniones comprueba también el borde real de la cápsula, con dos contactos separados. Se restituyó la consulta de superficie sólida durante las caídas.

## Cristal único y afinidad de fuego

- Se usa exactamente `public/assets/world/crystals/Cristal_de_Fuego.glb`, el modelo rojo facetado de la captura del usuario, con su textura original. `IgneousCrystal` lo normaliza a 7,6 unidades de altura y lo sitúa sobre el pedestal existente de la cámara final; sólo se ocultan las tres primitivas del cristal anterior. Hay 419 candidatos del reino, contando 24 brasas instanciadas y el halo.
- Se eliminan los candidatos aleatorios y el punto fijo de Altapiedra para este cristal. `WorldPropSystem` ya no carga su GLB en el exterior; los cristales azules y celestes conservan su comportamiento. Los fragmentos de partidas anteriores se preservan.
- Material PBR con rugosidad 0,24, capa brillante y emisión modulada por la textura roja, oscilación suave, halo local y 24 brasas. Una luz cálida de alcance limitado participa en el presupuesto existente de dos fuentes por malla. No se añade bloom de pantalla completa, sombras dinámicas ni texturas nuevas. Las matrices y límites se actualizan antes de asignar receptores de luz.
- Al llegar al altar, **E · Despertar el poder del Cristal Ígneo** registra `reino-igneo-cristal` y una única recompensa de inventario en la misma operación de guardado. `GameStore.hasFirePower` consulta ese logro; poseer fragmentos antiguos no desbloquea el poder. El cristal permanece en el altar, sin volver a otorgar recompensas.
- Equipo muestra **Afinidad de fuego: sellada/desbloqueada** y el aviso del reino refleja el desbloqueo. Por ahora queda registrada la afinidad; los ataques de fuego concretos todavía no están implementados. Las partidas que ya habían alcanzado el cristal de la versión anterior conservan el logro y obtienen esta afinidad.
- Pruebas de dominio, exterior y cueva verifican exclusividad, persistencia, recompensa única y ocultación al salir. El ensayo `scripts/igneous-crystal.browser.js` camina hasta el altar con el controlador real, activa E, verifica recarga de localStorage, animación de luz/brasas y regreso sin duplicar el modelo. No hubo recuperaciones durante esa aproximación.

## Rendimiento

El índice de triángulos estáticos divide el espacio X/Z en celdas de 10 unidades. Suelo, paredes, techo y cámara consultan sólo los triángulos próximos; se conserva la geometría exacta. Para interiores totalmente estáticos se reutiliza el conjunto de mallas y se evita recorrer sus 368 entradas en cada rayo. Las instancias y piezas móviles mantienen la ruta habitual. Exposición y tone mapping se ajustan sólo en las transiciones: modificarlos por cuadro invalidaba miles de materiales de la escena.

Medición final: Chrome headless con GPU real **RTX 3090 / ANGLE D3D11**, framebuffer **1920 × 1080**, bucle normal de Babylon y delta de tiempo real. Dos segundos de calentamiento y diez de muestra, con Santi y Dogo cargados y visibles. Son vistas concretas, no una garantía para otros equipos o para cada punto del nivel.

| Vista | FPS | Procesamiento mediano / p95 | Dibujos | Triángulos visibles |
| --- | ---: | ---: | ---: | ---: |
| Puente sobre el lago | 59,98 | 6,1 / 10,2 ms | 122 | 310.492 |
| Poblado / Hogar | 59,82 | 8,4 / 11,9 ms | 263 | 213.709 |
| Salón del trono | 59,84 | 8,6 / 15,7 ms | 69 | 56.283 |

GLB: **117.992.436 bytes**, original intacto. La limpieza de caras se realiza al cargar. Carga inicial anterior: **29,34 s**; sesión de revisión con recursos ya disponibles: **18,99 s**. No son una comparación de carga en frío. La segunda visita reutiliza el contenedor. El peso inicial sigue siendo una mejora pendiente independiente de los FPS.

Los ensayos previos con actualización fija de 1/30 s arrojaron aproximadamente 54 FPS en el lago antes del último ahorro de colisiones y la recuperación de Dogo. Ese método no es idéntico al bucle final: no se debe presentar como una comparación A/B exacta ni equipararlo directamente con los 26 FPS informados en la preview.

## Validación y alcance

Pasaron `npm run check`, `npm run test:cave`, `npm run test:traversal`, `npm run test:dogo`, `npm run test:wayfinding` y `npm run build`. El build conserva el aviso del paquete grande de BiomeMaterialCatalog. La prueba del índice compara 200 rayos y sus normales contra Babylon, con reflexión, rotación y escala. También cubre carga diferida, caché, puertas, personajes tardíos, lava, guardado y restauración del perfil exterior.

En esta revisión se repitieron TypeScript, `test:cave`, `test:traversal` y producción. Se añadieron regresiones de peldaños y recorte parcial de pisos con conservación de UV. En el GLB real pasaron **60 subidas/bajadas a 26, 60 y 144 pasos/s**, caminando y corriendo por cinco líneas de la escalera, sin pies bajo el peldaño (antes: hasta 9,77 cm). Una reproducción de **752 puntos / 2.912 pasos** con el controlador real completó puente, Basti­ón, Forja, palacio, Archivo, Cristal y regreso, sin recolocar al jugador entre puntos. Es una regresión física acelerada, no una nueva grabación WASD del descenso completo.

La animación se verificó también comparando el framebuffer con el mismo encuadre y tiempos de shader separados tres segundos: cambiaron 162.570 píxeles (20,58% del cuadro). El video de detalle usa la cámara de la misma escena colocada para inspeccionar la lava; no representa una posición caminable del jugador.

Recorrido real con WASD y saltos mediante `WorldView`/`CharacterTraversalController`: entrada → Abismos → Puente Alto → vapores → rodeo del Puente Roto → cornisas → palanca/reja → túnel → mirador → poblado/Casa del Hogar → puente del lago → Bastión/torno/Forja → salón → trono → Archivo → Cristal. No hubo teletransportes internos del jugador ni recuperaciones en ese recorrido principal. Se rodearon las columnas; dos labios de basalto requirieron salto. No se reemplazó al controlador por una cámara libre.

**Limitación pendiente:** el acceso opcional desde la Cornisa Norte a la galería superior no quedó superado en la prueba automatizada de movimiento; el último intento se detuvo cerca de `[-14.76, 14.24, -37.51]` en coordenadas fuente. No se certifica esa rama ni el desvío del Eco como recorridos completos. Los cuatro hallazgos están conectados al estado; Hogar y Forja se activaron durante la caminata registrada.

En casos aislados se comprobó salto y aterrizaje, caída por lava y sima con regreso al mirador, y ocultación/restauración del personaje cuando la cámara queda dentro de su cuerpo. Para rendimiento y caídas se posicionó explícitamente al jugador al inicio de cada caso; esas pruebas están separadas del recorrido continuo. La entrada/salida con **E** restauró el exterior y volvió a entrar sin duplicar mallas. La sesión nueva no mostró los errores de terreno durante la carga tardía de Brisalia y cartelería: sus elevaciones se capturan antes de que el streaming pueda desalojar esas teselas.

## Evidencia

En `artifacts/reino-igneo/`:

- `recorrido-integracion.webm`: registro completo de la caminata, anterior a la corrección final de ACES. Incluye pausas de inspección; la simulación se avanzó a 1/30 s por cuadro, por lo que su velocidad de reproducción no es una medición de FPS.
- `recorrido-integracion.json`: posiciones y etapas reales alcanzadas, rutas y estado guardado.
- `palacio-contraste-final.webm`: caminata breve del salón al trono con ACES, anterior a retirar los focos sin fuente; temporizada a 30 pasos por segundo y capturada a 20 FPS. Sin audio.
- `pool.png`, `poblado.png`, `trono.png` y `performance-*.json`: evidencia de la integración anterior a esta revisión.
- `lava-corregida.webm`, `repair-lava-final.png`, `repair-lake-game.png`: detalle animado y vista de juego con las correcciones de lava.
- `repair-floor-final.png`, `repair-palace-entry.png`: piso sin superposición y entrada sin focos flotantes.
- `repair-stairs-final.json`, `repair-affected-route.json`, `repair-animation.json`, `repair-summary.json`: regresiones y métricas de esta revisión.
- `repair-performance-*.json`: las tres mediciones actuales a 1080p.
- `crystal-final.png`, `crystal-validation.json`, `crystal-performance.json`: aspecto, interacción/persistencia y medición de la cámara del cristal.
- `portal-final.json`, `safety-final.json`, `spawn-clearance-final.json`: comprobaciones de portales, caída/salto/cámara y los 66 puntos de metadatos.

Para repetir: `node scripts/check-igneous-game.mjs --start`, esperar la carga, ejecutar `--eval=scripts/igneous-walkthrough.browser.js` para preparar el arnés y `--eval=scripts/igneous-performance.browser.js --report=performance-lake` para medir el lago. El perfil de Chrome es exclusivo de QA (`.test-build/igneous-chrome`, puerto 9227); no usa las partidas del usuario. El arnés queda pausado al acabar cada medida.

La regresión de escaleras se repite con `--eval=scripts/igneous-stairs.browser.js --report=repair-stairs-final`, sobre ese mismo arnés.

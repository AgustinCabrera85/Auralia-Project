# Dogo: mascota de Santi

Actualizado el 23 de noviembre de 2026 con el nuevo DOGO.glb entregado por el usuario. Conserva el comportamiento de compañero y adapta las animaciones y los apoyos al nuevo esqueleto.

## Asset y animaciones originales

`public/assets/characters/dogo/Dogo_Refined.glb` es una copia íntegra del nuevo archivo, sin modificar sus mallas, materiales ni animaciones. SHA-256: `1891bf32badcae20f5c4a10d46cd0334194e62613fec212c2adfcaa048f12646`.

Ocupa 6.131.624 bytes y contiene una malla deformable (`Dogo_LP`), 3.312 triángulos y un esqueleto de 190 huesos. La altura de referencia se normaliza a 1,35 unidades de mundo; las poses animadas pueden cambiar la caja envolvente. Se conserva la conversión de coordenadas del cargador y se habilita la textura de matrices de huesos para evitar el límite de uniformes de GPU.

El GLB contiene 36 clips exportados: 34 acciones distintas y dos duplicados de `sleep_curl` y `sniff_walk`. `DogoCatalog.ts` asigna nombres lógicos a las acciones `[RA] A_metarig_*` y registra una sola copia de cada una.

| Acción | Clip original | Uso actual |
| --- | --- | --- |
| Idle | idle_breathe | Reposo |
| Walk | walk | Caminar y dar pasos al girar |
| Trot | trot | Transición entre caminar y correr |
| Run | run | Correr para acompañar a Santi |
| Sniff | sniff_ground | Olfateo completo del cuerpo |
| Otras 29 acciones | Catálogo DOGO_CLIPS | Disponibles para futuras interacciones |

El olfateo utiliza ahora la animación original del modelo; se eliminó la anterior capa procedural de cuello y cabeza. La locomoción terrestre mezcla Idle, Walk, Trot y Run según la velocidad real, con cadencia progresiva. Solo se reproducen los clips necesarios para el estado y sus transiciones.

El nuevo archivo no incluye natación. `DogoSwimAnimations.ts` usa la postura delantera de `Dig` como base y recrea el gesto alternado de estirar y recoger las patas sobre un cuerpo horizontal. Añade pataleo trasero y una elevación suave de cuello y cabeza sincronizada con las brazadas para mostrar esfuerzo sin hundir el hocico. Genera `Swim_Forward` y `Swim_Idle`, con menor intensidad al permanecer quieto; los extremos de cada ciclo coinciden. Estos dos ciclos son una adaptación, no animaciones acuáticas originales del archivo. El catálogo de ejecución reúne 34 acciones originales y estos dos ciclos.

Los ciclos base duran 0,70 segundos al avanzar y 0,95 segundos al flotar quieto. La cadencia activa aumenta hasta un 30 % según la velocidad, manteniendo el pataleo rápido incluso al desplazarse lentamente. La cabeza realiza una oscilación suave por cada par de brazadas, a menor frecuencia que las patas.

El hombro hace un recorrido corto cerca de la superficie y el codo acompaña visiblemente la extensión de la pata hacia adelante y su recogida bajo el pecho. La muñeca concentra la mayor flexión del pataleo. Su rotación se limita a un único eje transversal, sin amplificar las pequeñas torsiones de las claves originales. Los dedos acompañan con una flexión pequeña.

La muñeca flexiona hacia abajo y vuelve a la postura neutra, sin levantar la pata hacia arriba. Su recorrido angular queda acotado; el codo y el hombro acompañan con amplitudes progresivamente menores, sin quedar inmóviles. La prueba visual comprueba durante todo el ciclo que los dedos se mantienen por debajo de la muñeca.

El antiguo `Dogo_Auralia.glb` permanece como referencia histórica y no se carga para esta integración.

## Movimiento y comportamiento

`DogoFollowController.ts` mantiene una guía lateral y adelantada respecto a Santi. La guía y el perro tienen velocidades angulares limitadas independientes; girar a Santi no teletransporta al Dogo. Aceleración, frenado y cambios de dirección son progresivos, con menor velocidad en curvas cerradas. Al detenerse Santi, el perro termina su desplazamiento antes de reposar.

Después de una pausa, alterna olfateo y exploraciones locales de unos 3–6 metros, con un límite de curiosidad de 7 metros respecto al jugador. Vuelve a acompañarlo cuando este se mueve. Los destinos se comprueban contra suelo, agua, paredes y desniveles. Los subpasos de movimiento son de hasta 0,3 metros para evitar atravesar obstáculos estrechos.

Usa `TraversalWorld`, la misma interfaz de soporte que Santi. Consulta terreno, plataformas, puentes y agua en el contexto del mundo activo. Reduce la velocidad al subir, ajusta la cadencia a la distancia recorrida sobre la pendiente e inclina el cuerpo usando apoyos delanteros, traseros y laterales. Los giros mezclan Idle y Walk para animar las patas aunque la traslación sea pequeña.

La reposición directa se reserva para aparición inicial y viajes/cambios de contexto del jugador. Si no encuentra soporte válido al aparecer, espera antes de mostrarse. Un giro, una parada o un obstáculo ordinario no activa la reposición. Cuando no puede continuar, espera: todavía no tiene navegación global, escalada ni saltos autónomos.

`DogoRunMotion.ts` superpone un rebote suave sobre la carrera original: hasta dos centímetros en el torso, un pequeño retraso en cuello y cabeza y una respuesta posterior en los segmentos de las orejas. Sigue la fase real del clip Run, se desvanece al frenar y restaura la pose antes de cada evaluación para evitar acumulación. El apoyo de las patas se resuelve después.

`DogoPlayController.ts` alterna dos juegos tras una pausa prolongada del jugador. El Dogo se acerca, se levanta sobre las patas traseras y apoya ambas delanteras en Santi mientras mueve la cola; después retrocede. En otra ocasión recorre un círculo pequeño persiguiendo su cola. `DogoPlayMotion.ts` mantiene los apoyos traseros y dirige las patas delanteras mediante IK, reutilizando la animación original de la cola. Ambos juegos comprueban suelo, agua, obstáculos y espacio libre; se interrumpen cuando el jugador camina o cambia de contexto.

## Contacto con el suelo

`GroundFootPlacement.ts` aplica IK visual de dos segmentos a las dos piernas de Santi y las cuatro patas del Dogo, después de evaluar las animaciones. Consulta el soporte autoritativo, conserva la elevación de los pies durante el paso y ajusta suavemente la pelvis y la orientación de los apoyos plantados.

En el nuevo rig, los apoyos delanteros usan `front_thigh → front_shin → front_toe` y los traseros `thigh → shin → toe`, en ambos lados. El extremo de apoyo es la punta de la pata; las articulaciones intermedias conservan su flexión animada.

La corrección es acotada y restaura las rotaciones antes del siguiente fotograma para no acumular deformaciones. Se desactiva al nadar; Santi también la libera durante salto, escalada y acciones incompatibles. No modifica el terreno, las colisiones físicas del personaje ni las animaciones originales. No es un sistema de bloqueo permanente del pie en coordenadas del mundo.

## Pasto y sombras

El pasto utiliza un segundo contacto de radio 1,5 metros para apartarse alrededor del Dogo. Las raíces permanecen fijas y las puntas se doblan; comparte las instancias y el streaming existentes, sin añadir otro campo de vegetación.

`CharacterShadows.ts` concentra un mapa de sombras de 1024 × 1024 en un frustum de 40 metros alrededor de los personajes. Solo Santi y el Dogo son emisores. Las sombras siguen al sol y se desactivan cuando corresponde al contexto nocturno o subterráneo.

Los materiales de terreno personalizados requieren muestreo explícito del mapa: `CharacterShadowSampling.ts` atenúa iluminación directa y especular con cuatro muestras y conserva la iluminación ambiente. Los receptores incluyen terreno, plataformas de reinos, tableros de puentes y piezas de construcción. La ruta antigua limitada a ocho samplers omite este muestreo adicional para respetar el límite de hardware.

## Validación de la versión refinada

- `npm run test:dogo`: hash del nuevo archivo, 34 acciones originales sin duplicados, dos ciclos acuáticos, orientación y escala, mezclas de locomoción, olfateo nativo, liberación de apoyos en agua y limpieza de recursos.
- `npm run test:feet`: carga los GLB reales de Santi y Dogo; verifica planos, pendientes laterales y longitudinales, escalones, pies levantados y desplazamientos del origen a 30, 60 y 144 Hz. Resultados en [foot-contact-tests.json](../artifacts/dogo/foot-contact-tests.json).
- `node scripts/check-dogo-refined.cjs <vista>`: revisa el modelo con WebGL real en `idle`, `walk`, `trot`, `run`, `sniff`, `slope`, `swim`, `swim-idle`, `greet` y `chase-tail`. Comprueba deformación visible, textura de huesos, apoyo y ausencia de errores de WebGL. Guarda las capturas y resultados en la carpeta temporal `auralia-dogo-refined`.
- `node scripts/check-worldstudio-game.mjs --run --dogo --out=<carpeta>`: prueba el seguimiento con WASD, giros, curiosidad, olfateo, pasto, sombras, natación y viajes en un perfil aislado de Chrome, sin acceder a guardados del usuario.
- `npm run build`: verifica tipos y genera la compilación de producción.

Las pruebas del controlador cubren seguimiento, frenado, giro de 180°, curiosidad, olfateo, pendientes, paredes, precipicios, agua y cambios de reino a 30, 60 y 144 Hz. El error permitido respecto al objetivo de IK es inferior a 0,035 metros en los casos sintéticos y a 0,12 metros en la prueba integrada.

La revisión de viajes detectó un error ajeno al Dogo: `BirdHabitatScanner` consulta terreno ya descargado y lanza `GeographicDataUnavailable` al cambiar de región. La prueba específica del compañero pausa la actualización de aves en su perfil aislado para comprobar los viajes del Dogo. No modifica el comportamiento de las aves en producción ni constituye una aprobación integral de ese sistema.

Las capturas y `validation.json` que ya existían en `artifacts/dogo/` corresponden a la versión del 13 de noviembre, con 30 huesos y 22 NLA. La confirmación visual del usuario sobre pies y sombras corresponde a aquella versión. La nueva revisión aislada guarda sus capturas en la carpeta temporal indicada arriba.

Las capturas históricas `sombras-activas.png` y `sombras-desactivadas.png` se tomaron sobre un camino plano que no recibía sombras, por lo que no demuestran el resultado sobre terreno. La captura histórica de olfateo sobre césped sí muestra ambos personajes con sombra.

## Coste y límites

El nuevo Dogo utiliza 3.312 triángulos y un esqueleto de 190 huesos. Tiene menos triángulos que la versión anterior, pero más huesos y canales de animación; esto no implica una mejora automática del rendimiento. El mapa de sombras permanece limitado a los personajes y el contacto con el pasto no duplica instancias. Las mediciones funcionales headless del proceso completo no aíslan el coste del Dogo ni garantizan un FPS jugable.

Quedan fuera de esta integración órdenes, combate, búsqueda de objetos, navegación global y ejecución autónoma del resto de acciones. No se incorpora persistencia propia de la mascota ni se migran o reemplazan guardados. La adaptación del Dogo no modifica la geografía autoritativa.

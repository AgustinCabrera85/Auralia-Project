# Dogo: mascota de Santi

Implementado y validado el 13 de noviembre de 2026 sobre el continente actual de Auralia. El usuario confirmó el apoyo de los pies y las sombras de ambos personajes.

## Asset y animaciones originales

`public/assets/characters/dogo/Dogo_Auralia.glb` conserva el archivo entregado, sin editar el modelo ni sus animaciones. SHA-256: `cdabbdbcfea9c9c7ca5f2eedfb74013b6a0b6926d22edd9815751d662cca7f5d`.

El asset ocupa 3.629.384 bytes, contiene 30 huesos y dos primitivas con 3.600 triángulos en total. Su altura de referencia se normaliza a 1,35 unidades de mundo; Santi usa 3,8. Las poses animadas pueden cambiar la caja envolvente.

`DogoCatalog.ts` registra los 22 nombres NLA exportados en el GLB:

| Acción NLA | Duración aproximada (s) | Uso actual |
| --- | ---: | --- |
| Idle | 3,00 | Reposo y mezcla durante giros |
| Walk | 1,10 | Caminar y mover patas al girar |
| Run | 0,67 | Correr para acompañar a Santi |
| Sit | 1,17 | Registrada para futuras acciones |
| Sit_Idle | 4,13 | Registrada |
| Scratch_Ear | 2,77 | Registrada |
| Stand_Up | 1,00 | Registrada |
| Tail_Wag | 1,73 | Registrada |
| Growl | 1,50 | Registrada |
| Bark | 1,27 | Registrada |
| Carry_Pickup | 1,47 | Registrada |
| Carry_Idle | 2,13 | Registrada |
| Carry_Walk | 1,27 | Registrada |
| Carry_Drop | 1,30 | Registrada |
| Lie_Down | 1,63 | Registrada |
| Sleep | 3,60 | Registrada |
| Wake_Up | 1,63 | Registrada |
| Celebrate | 1,90 | Registrada |
| Jump_In_Place | 1,37 | Registrada |
| Jump_Running | 1,17 | Registrada |
| Swim_Forward | 1,10 | Nadar |
| Swim_Idle | 1,47 | Reposo en el agua |

Olfatear es una capa procedural de cuello y cabeza sobre la animación original: el archivo no incluye una NLA llamada Sniff. No se reproducen las 22 acciones simultáneamente. La locomoción terrestre mezcla Idle, Walk y Run; la acuática utiliza sus dos ciclos correspondientes.

## Movimiento y comportamiento

`DogoFollowController.ts` mantiene una guía lateral y adelantada respecto a Santi. La guía y el perro tienen velocidades angulares limitadas independientes; girar a Santi no teletransporta al Dogo. Aceleración, frenado y cambios de dirección son progresivos, con menor velocidad en curvas cerradas. Al detenerse Santi, el perro termina su desplazamiento antes de reposar.

Después de una pausa, alterna olfateo y exploraciones locales de unos 3–6 metros, con un límite de curiosidad de 7 metros respecto al jugador. Vuelve a acompañarlo cuando este se mueve. Los destinos se comprueban contra suelo, agua, paredes y desniveles. Los subpasos de movimiento son de hasta 0,3 metros para evitar atravesar obstáculos estrechos.

Usa `TraversalWorld`, la misma interfaz de soporte que Santi. Consulta terreno, plataformas, puentes y agua en el contexto del mundo activo. Reduce la velocidad al subir, ajusta la cadencia a la distancia recorrida sobre la pendiente e inclina el cuerpo usando apoyos delanteros, traseros y laterales. Los giros mezclan Idle y Walk para animar las patas aunque la traslación sea pequeña.

La reposición directa se reserva para aparición inicial y viajes/cambios de contexto del jugador. Si no encuentra soporte válido al aparecer, espera antes de mostrarse. Un giro, una parada o un obstáculo ordinario no activa la reposición. Cuando no puede continuar, espera: todavía no tiene navegación global, escalada ni saltos autónomos.

## Contacto con el suelo

`GroundFootPlacement.ts` aplica IK visual de dos segmentos a las dos piernas de Santi y las cuatro patas del Dogo, después de evaluar las animaciones. Consulta el soporte autoritativo, conserva la elevación de los pies durante el paso y ajusta suavemente la pelvis y la orientación de los apoyos plantados.

La corrección es acotada y restaura las rotaciones antes del siguiente fotograma para no acumular deformaciones. Se desactiva al nadar; Santi también la libera durante salto, escalada y acciones incompatibles. No modifica el terreno, las colisiones físicas del personaje ni las animaciones originales. No es un sistema de bloqueo permanente del pie en coordenadas del mundo.

## Pasto y sombras

El pasto utiliza un segundo contacto de radio 1,5 metros para apartarse alrededor del Dogo. Las raíces permanecen fijas y las puntas se doblan; comparte las instancias y el streaming existentes, sin añadir otro campo de vegetación.

`CharacterShadows.ts` concentra un mapa de sombras de 1024 × 1024 en un frustum de 40 metros alrededor de los personajes. Solo Santi y el Dogo son emisores. Las sombras siguen al sol y se desactivan cuando corresponde al contexto nocturno o subterráneo.

Los materiales de terreno personalizados requieren muestreo explícito del mapa: `CharacterShadowSampling.ts` atenúa iluminación directa y especular con cuatro muestras y conserva la iluminación ambiente. Además se habilitaron receptores en terreno, plataformas de reinos, tableros de puentes y piezas de construcción. La ruta antigua limitada a ocho samplers omite este muestreo adicional para respetar el límite de hardware.

## Validación

Pasaron los siguientes comandos:

- `npm run check`
- `npm run build`
- `npm run test:dogo`
- `npm run test:feet`
- `npm run test:santi`
- `npm run test:traversal`
- `npm run test:biomes`
- `node tests/grass-lod.test.cjs`
- `node scripts/check-worldstudio-game.mjs --run --dogo`

Las pruebas del controlador cubren seguimiento, frenado, giro de 180°, curiosidad, olfateo, pendientes, paredes, precipicios, agua y cambios de reino a 30, 60 y 144 Hz. Se verifican el hash del asset, las 22 NLA, las mezclas de locomoción y la restauración de las poses.

La prueba de pies carga ambos GLB reales y verifica planos, pendientes laterales y longitudinales, escalones, pies levantados y desplazamientos del origen. El error permitido respecto al objetivo de IK es inferior a 0,035 metros en estos casos sintéticos. En la prueba de navegador se comprobaron seis apoyos con error inferior a 0,12 metros.

La sesión automatizada en Chrome utilizó un perfil aislado y entradas WASD, sin acceder a los guardados del usuario. Verificó seguimiento, patas durante giros, olfateo, curiosidad, contacto con pasto, emisores y receptores de sombras, natación en Nácar y viaje a Albor. `artifacts/dogo/errors.json` quedó vacío (`[]`).

Evidencias:

- [Recorrido](../artifacts/dogo/dogo-recorrido.png).
- [Olfateo y sombras sobre césped](../artifacts/dogo/dogo-olfateando.png).
- [Contacto con pasto](../artifacts/dogo/dogo-pasto.png).
- [Natación](../artifacts/dogo/dogo-nadando.png).
- [Viaje a Albor](../artifacts/dogo/dogo-albor.png).
- [Resultados del navegador](../artifacts/dogo/validation.json).
- [Resultados de apoyo](../artifacts/dogo/foot-contact-tests.json).

Las capturas `sombras-activas.png` y `sombras-desactivadas.png` registran una comparación inicial sobre un camino plano de Brisalia: ese camino no recibe las sombras y esas dos imágenes no demuestran el resultado sobre terreno. La captura de olfateo sobre césped sí muestra ambos personajes con sombra. El usuario también confirmó visualmente el resultado en su sesión.

## Coste y límites

El Dogo añade 3.600 triángulos de modelo, su evaluación esquelética y sus consultas locales de soporte. El mapa de sombras se limita a los dos personajes; no incorpora árboles como emisores. La deformación del pasto agrega un contacto de shader, sin duplicar instancias.

La última muestra de la prueba automatizada, tomada en Albor, registró 434.481.905 bytes de heap JavaScript (414,35 MiB) y 9,42 FPS instantáneos. Son datos del proceso completo durante una prueba funcional headless, no una comparación de rendimiento ni una medida de memoria GPU. No permiten atribuir el coste al Dogo o garantizar un FPS jugable. El navegador no reportó errores de ejecución.

Quedan fuera de esta implementación órdenes, combate, búsqueda de objetos, navegación global y ejecución autónoma del resto de NLA. No se incorporó persistencia propia de la mascota ni se migraron o reemplazaron guardados. El mapa autoritativo y las ubicaciones del continente permanecen como estaban.

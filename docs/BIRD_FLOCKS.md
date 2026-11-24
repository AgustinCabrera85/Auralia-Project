# Canarios y golondrinas NPC

Integración del 21 de noviembre de 2026. `WorldView` crea `BirdFlockSystem` en el continente: siete canarios y cuatro golondrinas cerca del jugador (cuatro y dos al iniciar con calidad Rendimiento). No requieren activación ni modifican las partidas guardadas.

Los GLB originales se copiaron sin transformación desde `Auralia_Canario_NPC_NLA_v3/Canario_NPC_10Anim_v3.glb` y `Auralia_Pajarito_NPC_NLA_v2/Pajarito_NPC_10Anim_v2.glb` a `public/assets/wildlife/canary-v3.glb` y `swallow-v2.glb`. Sus texturas están embebidas. Se conservan los diez clips, esqueletos y cuatro morph targets de plegado. Los BLEND editables permanecen en las carpetas originales de Downloads.

## Comportamiento

`BirdSimulation` es una simulación determinista independiente de Babylon. Cada especie tiene una bandada con destino compartido; hambre, sed, cansancio, horarios y pequeñas variaciones individuales regulan las salidas. El vuelo combina separación, alineación y cohesión, con aceleración limitada, inclinación en giros y planeo de golondrinas. `BirdFlightPath` construye arcos tangentes de radio mínimo 5 m y tramos rectos, con un perfil cúbico de altura y muestreo por longitud recorrida. Conserva la dirección inicial, reserva espacio horizontal para descender incluso si el destino queda justo debajo, nivela la llegada y frena progresivamente hasta posarse. Una envolvente suave eleva la ruta para despejar terreno, agua, copas y edificios. Las correcciones de bandada se amortiguan y desaparecen gradualmente cerca del apoyo; las golondrinas conservan velocidad durante la pasada de bebida y salen hacia delante.

- Canarios: buscan parches secos, picotean, dan saltitos, beben desde una orilla accesible y descansan en árboles o superficies construidas. Alternan reposo, observación y el gesto de canto.
- Golondrinas: hacen pasadas de alimentación aérea cerca del suelo y del agua, beben planeando sobre agua dulce y descansan en posaderos. No picotean semillas en el suelo. La referencia breve fue [Cornell Lab, Barn Swallow Life History](https://www.allaboutbirds.org/guide/Barn_Swallow/lifehistory), que describe alimentación y bebida en vuelo.
- Santi o Dogo cerca provocan alerta y huida compartida. Al anochecer o con lluvia muy intensa priorizan posarse; no quedan inmunes a las amenazas.
- Sin un recurso disponible, exploran en vuelo. No inventan agua ni una superficie donde aterrizar. Una retirada de hábitat invalida el destino en el siguiente escaneo.

`BirdHabitatScanner` busca recursos hasta 80 m y árboles hasta 100 m, distribuyendo 18 muestras por fotograma y renovando cada cinco segundos. Usa los niveles de agua y altura del mundo activo. Distingue agua abierta con espacio de salida de orillas secas a menos de 35 cm del nivel del agua. Excluye interiores y construcciones del alimento.

`VegetationSystem.birdTrees` toma posiciones de los árboles que carga el streaming. `AuthoredAssets.birdTrees` incluye árboles colocados a mano, con su matriz real. Los árboles cosechables usan sus instancias visibles. Los posaderos se muestrean sobre superficies superiores de la malla (incluidas copas); son aproximaciones de apoyo, no puntos de rama etiquetados por un artista. Los techos y estructuras usan intersecciones contra sus mallas. Los obstáculos se aproximan con cajas conservadoras: no es navegación volumétrica exacta entre ramas, cuevas ni interiores.

## Animación y recursos

`BirdFlockSystem` carga una plantilla por especie. Los ejemplares comparten geometría y materiales, con esqueletos y gestores de morph independientes. Se mezclan clips completos, incluidos los canales de plegado, y se respetan Despegar y Aterrizar. Picotear sirve también como gesto de bebida del canario. Cantar no incluye audio, igual que los assets entregados.

La golondrina original tiene 96.472 triángulos: por eso la población es acotada. Altura visual configurada: canario 0,34 m y golondrina 0,30 m, acorde con la escala ampliada de los personajes de Auralia. El catálogo permite ajustar tamaño, velocidad y población.

Los modelos se ocultan a 115 m, pausando sus animaciones; hay un fundido de entrada y de distancia. Viajar más de 115 m renueva la población local. En cuevas, otros reinos y zonas distintas del continente se ocultan. La pausa del juego y la pérdida de foco detienen la simulación y las animaciones. La destrucción libera clones, grupos y plantillas, incluso si la carga todavía está pendiente.

## Verificación

- `npm run test:birds`: curvas de descenso cercano y lejano, continuidad de dirección y posición, nivelación final, despeje de obstáculos y pasada de bebida horizontal; frenada completa a 30, 60 y 144 Hz; 240 segundos simulados por frecuencia; alimentación y bebida efectivas; descanso nocturno; huida; ausencia de recursos; pausa y delta grande; orillas; clips completos; aislamiento de esqueletos y morph targets; geometría compartida; viajes y liberación durante carga.
- `npm run check` y `npm run build`: verificación TypeScript y bundle del juego.
- `tests/birds-visual.html`: banco de revisión manual aislado, servido por Vite. Permite revisar cada clip y ambas bandadas sin tocar una partida.
- Diagnóstico: `window.__auraliaGame.world.birdStatus` y `geographicStatus.birds` exponen especies cargadas, errores, estados, destinos y tiempo de actualización.

La revisión visual inicial quedó interrumpida. La comprobación posterior en Chrome detectó y corrigió un error de visibilidad: `Vector3.Distance` recibía un `BirdPoint` común, producía `NaN` y desactivaba los modelos por distancia. El cálculo ahora utiliza las coordenadas públicas con `Math.hypot`. La prueba de regresión comprueba mallas habilitadas, opacidad finita, presencia en la lista activa de renderizado y ocultación/reaparición por distancia. Después del arreglo se observaron el canario en primer plano y las dos especies en la vista de bandadas (canarios volando y golondrinas posadas). Sigue pendiente medir el coste GPU dentro del mundo completo y certificar el apoyo de las patas y todas las trayectorias; las pruebas automatizadas de Babylon usan NullEngine y no comprueban píxeles.

El ajuste de vuelo suave pasó las pruebas numéricas y TypeScript. Su revisión visual automática quedó interrumpida porque Computer Use no pudo verificar con seguridad la URL de Chrome; este cambio de trayectoria todavía requiere revisión visual en el banco aislado.

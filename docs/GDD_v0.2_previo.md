# Auralia: El Valle de las Chispas
## Game Design Document · Propuesta conceptual v0.2

**Fecha:** 28 de octubre de 2026  
**Objetivo de primera entrega:** Navidad, 25 de diciembre de 2026  
**Público:** niños y niñas de 7 a 11 años (primer protagonista: un niño de 9 años)  
**Género:** aventura fantástica de mundo abierto; vida cotidiana, construcción, crafting y exploración; diseño preparado para cooperativo y multijugador futuro  
**Motor:** Babylon.js + TypeScript  
**Estado:** propuesta creativa, no canon definitivo

---

## 1. Una idea central

**Un mundo crece con vos, y vos crecés al dejar tu huella en él.**

El jugador no es un héroe predestinado ni recibe puntos por ser «bueno». Es un niño aventurero que llega al Valle de las Chispas y descubre un mundo donde reparar un puente, diseñar una casa, escuchar a alguien o encontrar un camino perdido pueden ser aventuras tan importantes como explorar ruinas.

Su viaje habla de curiosidad, perseverancia, empatía, criterio propio y valentía. Esos temas permanecen *detrás* del diseño; nunca se presentan como materias escolares o pruebas de madurez. Un niño puede fallar, experimentar, volver a casa y probar otra idea.

### Principios no negociables

1. **Libertad con orientación:** una historia opcional que invita a explorar, sin imponer tareas permanentes.
2. **El mundo recuerda:** construcciones, reparaciones, descubrimientos y relaciones se conservan.
3. **La magia habita lo cotidiano:** carpintería, herrería, cultivo, cocina y transporte pueden combinarse con fenómenos fantásticos.
4. **Construir tiene consecuencias:** además de decorar, el jugador habilita atajos, talleres, puentes y servicios.
5. **Crecimiento sin sermón:** decisiones comprensibles, personajes con motivos y consecuencias suaves; evitar un medidor moral.
6. **Amabilidad con el tiempo del jugador:** poco grindeo, objetivos cortos, guardado fiable y ausencia de castigos severos.
7. **Preparado para crecer:** sistemas guiados por datos y persistencia compatible con expansión del mundo y cooperativo futuro.

## 2. Identidad narrativa de Auralia

La magia de Auralia aparece en pequeñas manifestaciones llamadas **Chispas**. No se obtienen únicamente derrotando enemigos; también surgen al crear, descubrir, reparar y conectar elementos del mundo.

Antiguamente una red de **Caminos Vivos** conectaba aldeas, refugios, talleres y regiones. Ahora una anomalía conocida como **La Deriva** mueve algunos senderos, oscurece señales y deja aislados ciertos lugares. No es necesariamente un villano: es un misterio natural y mágico.

El protagonista encuentra una **Brújula Viva** que no señala simplemente el norte; aprende a reconocer sus descubrimientos y lo ayuda a seguir rutas que él mismo ha reabierto. En las primeras horas parece una herramienta sencilla. Con el tiempo se convierte en el hilo conductor de la aventura.

La historia principal no trata de «convertirse en adulto» ni de salvar el mundo a través de la violencia. Trata de descubrir quién quiere ser mientras aprende a orientarse, crear y colaborar. El mensaje del desenlace: **ser valiente no significa no tener miedo, ni crecer significa dejar atrás aquello que amás.**

## 3. El protagonista y su vínculo con el jugador

- Personaje inspirado en el sobrino, con su nombre y rasgos estilizados, personalizable sin perder identidad.
- Puede especializarse temporalmente en explorar, construir, crear herramientas, ayudar a otros o combatir criaturas fantásticas, sin clases excluyentes.
- Su **Hogar** es un refugio persistente y una expresión de su personalidad: no se abandona al avanzar.
- La Brújula Viva registra caminos, construcciones significativas y pistas; no evalúa si el jugador es «bueno» o «malo».
- Compañero inicial propuesto: **Tilo**, pequeño guardián de madera y musgo. Funciones iniciales: acompañar, reaccionar, señalar recursos especiales. Funciones avanzadas posteriores: exploración, colaboración, pequeñas interacciones.
- Personalización familiar de la edición navideña: mensaje, objeto único, personaje o cofre con dedicatoria; todo local y privado.

## 4. El mundo: cinco regiones, cinco experiencias

Los nombres son de trabajo. Las regiones no se llaman directamente Inocencia, Empatía o Madurez: su significado se descubre *jugando*.

### Región I — Valle de los Faroles · Brisalia

**Sensación:** curiosidad, seguridad, pertenencia.  
**Paisaje:** colinas verdes, río tranquilo, bosque luminoso, molino, huertas, talleres y pequeños caminos.  
**Vida cotidiana:** carpintero, panadera, herrero, granjera, pescador, mercadito, mascotas.  
**Mecánica distintiva:** aprender a combinar recolección, crafting y construcción en la parcela personal; reparar espacios comunitarios.  
**Materiales:** madera, piedra, cobre, fibras.  
**Construcciones emblemáticas:** cabaña personal, taller, primer puente pequeño.  
**Aventura:** descubrir qué hace titilar los faroles del sendero y encontrar la Brújula Viva.  
**Tema invisible:** la curiosidad y la confianza que nace de tener un hogar al que regresar.

### Región II — Sierras de los Engranajes · Altapiedra

**Sensación:** altura, desafío, satisfacción de experimentar.  
**Paisaje:** cañones, acantilados, viejas minas, funiculares y cascadas.  
**Vida cotidiana:** mineros, ingenieras, constructores de puentes, hornos y herrerías.  
**Mecánica distintiva:** resolver problemas con palancas, poleas, plataformas, peso y contrapesos; reparar infraestructuras de varias formas.  
**Materiales:** hierro, granito, carbón, cristales térmicos.  
**Desbloqueos:** herrería avanzada, refuerzos metálicos, elevadores simples, piezas de vehículos.  
**Aventura:** restablecer el transporte entre dos sectores aislados del pueblo.  
**Tema invisible:** la perseverancia es cambiar de estrategia, no repetir una tarea sin sentido.

### Región III — Lago de las Dos Orillas · Nácar

**Sensación:** tranquilidad, encuentro, puntos de vista diferentes.  
**Paisaje:** pueblo sobre pilotes, canales, islas, barcas, jardines flotantes.  
**Vida cotidiana:** pesca, cultivos acuáticos, carpintería naval, mercado fluvial y fiestas.  
**Mecánica distintiva:** resolver problemas comprendiendo las necesidades de dos o más NPC; trabajar con compañeros NPC o jugadores invitados. Todo desafío obligatorio debe poder completarse en solitario.  
**Materiales:** juncos, madera flexible, nácar mágico y pigmentos.  
**Desbloqueos:** pequeños botes, puentes colgantes, decoración, sistemas sencillos de riego.  
**Aventura:** reconectar dos orillas con prioridades aparentemente contrapuestas.  
**Tema invisible:** escuchar y cooperar no exige estar siempre de acuerdo.

### Región IV — Bosque de los Ecos · Lindebrumas

**Sensación:** misterio amable, duda, descubrimiento y autonomía.  
**Paisaje:** árboles enormes, niebla de colores, hongos luminosos, senderos móviles y ruinas.  
**Vida cotidiana:** botánica, cartografía, artesanos de lentes y guardianes forestales.  
**Mecánica distintiva:** pistas incompletas, mapas que parecen contradecirse, ilusiones visuales, elecciones sin una respuesta moral impuesta.  
**Materiales:** resinas, hongos, vidrio encantado y piedra lunar.  
**Desbloqueos:** brújulas mejoradas, faroles, lentes y artefactos de detección.  
**Aventura:** descubrir por qué las rutas cambian y cómo distinguir información confiable de apariencias.  
**Tema invisible:** formar criterio propio y aceptar que uno puede equivocarse.

### Región V — Cumbres del Primer Amanecer · Altaluz

**Sensación:** inmensidad, nervios, esperanza, culminación sin cierre definitivo.  
**Paisaje:** fortaleza-laboratorio sobre nubes, observatorio, tormentas mágicas y senderos suspendidos.  
**Vida cotidiana:** observadores del clima, artesanos de cometas, cuidadores de faros.  
**Mecánica distintiva:** combinar capacidades desarrolladas en otras regiones: construir refugio, gestionar viento, seguir señales, interactuar con aliados y elegir rutas.  
**Materiales:** aleaciones luminosas, cristales de tormenta y tejidos resistentes.  
**Desbloqueos:** estructuras extraordinarias, nuevos planos y caminos hacia futuras tierras.  
**Aventura:** restablecer el Gran Faro de los Caminos. No es obligatorio derrotar a un jefe violento.  
**Tema invisible:** valentía es actuar con incertidumbre y saber pedir ayuda.

## 5. Estructura espacial: abierta, no rígidamente lineal

- **Brisalia es el centro de la primera etapa**, no un tutorial descartable.
- Tras completar una introducción breve, se abren varios caminos posibles. Algunas herramientas facilitan zonas difíciles pero no todo debe estar cerrado por nivel.
- Se vuelve a regiones anteriores con nuevos materiales y recetas, y el hogar sigue creciendo.
- **Progresión principal suave:** el relato propone un orden, pero el jugador puede distraerse, explorar y realizar actividades alternativas.
- Un Camino Vivo reabierto sirve tanto como infraestructura narrativa como atajo real de juego.
- En futuras versiones, cada región debe poseer espacios de construcción personales o comunitarios cuidadosamente delimitados.

## 6. Integración entre historia y sistemas

El mundo no ofrece construcción y crafting como menús independientes de la aventura. Las misiones importantes deben usar al menos dos de estas actividades: explorar, recolectar, fabricar, construir, conversar, observar y utilizar magia.

**Ejemplo: El puente del arroyo.** El puente está dañado; un vecino quiere restaurarlo para llevar mercancía, mientras otro teme que el paso asuste a animales cercanos. El objetivo no es elegir el diálogo «bueno». El jugador escucha, explora el arroyo y descubre posibles soluciones: reparar el puente con barreras, construir otro paso o diseñar una ruta alternativa. Para el MVP navideño se implementa una solución simple y una reacción de NPC; las variantes profundas se reservan para futuras versiones.

### Crafting por estaciones

- **Banco de trabajo:** herramientas de madera y piedra; cimientos y mobiliario inicial.
- **Forja:** metal, armaduras, herramientas reforzadas y vehículos.
- **Mesa arcana:** faroles, brújulas, encantamientos y componentes mágicos.
- **Cocina / cultivo:** alimentos, regalos, huerta y objetos cotidianos con pequeñas propiedades mágicas.

### Construcción

- Piezas modulares con pivotes y encastres, vista previa, rotación y comprobación de colisiones.
- Categorías: cimientos, suelos, paredes, techos, puertas, ventanas, escaleras y decoración.
- Madera, piedra y metal cambian apariencia y resistencia; evitar simulaciones estructurales complejas en el MVP.
- Distinguir parcela personal (libertad creativa) de construcciones públicas (misiones predefinidas y persistentes).
- Las estructuras se guardan como datos (`pieceId`, transformaciones, variante de material, propietario/ámbito), no como geometría serializada.

### Combate

- Combate de fantasía estilizado, opcional para gran parte del contenido, sin violencia gráfica.
- Armas medievales, hechizos y defensas disponibles por recetas y progreso, sin exigir violencia para desarrollar oficios.
- Los enfrentamientos importantes pueden resolverse mediante preparación, evasión, ingenio o cooperación según el diseño de cada misión.

## 7. Arco emocional de largo plazo

**Acto I — Tengo un lugar.** El jugador llega, conoce Brisalia y construye su casa.  
**Acto II — Puedo intentar cosas difíciles.** Descubre territorios, crea herramientas y aprende de los errores.  
**Acto III — No estoy solo.** Conoce personajes con necesidades distintas y descubre maneras de colaborar.  
**Acto IV — Puedo elegir.** Interpreta pistas, toma decisiones y reconoce que las apariencias pueden engañar.  
**Acto V — Puedo abrir caminos.** Reúne conocimientos, personas y construcciones para restablecer el Gran Faro.

Al final, la Brújula Viva muestra que cada ruta abierta conduce a nuevos horizontes, pero siempre puede señalar el camino de regreso al Hogar. Es una culminación de la primera gran aventura, no «el fin de la infancia».

## 8. Primera sesión ideal: Navidad de 2026

**Duración guiada objetivo:** 30–45 minutos, con juego libre posterior.

1. **Bienvenida (3 min).** Personaje personalizado, aldea, presentación breve de Brisalia.
2. **Un pequeño favor (5–8 min).** Recoger madera y piedra para ayudar al carpintero.
3. **Mi primer oficio (5–8 min).** Fabricar martillo o herramienta en banco de trabajo.
4. **Mi hogar (10–15 min).** Colocar cimientos, paredes, puerta y techo sobre la parcela. Sin requisitos imposibles ni penalizaciones.
5. **El farol del camino (5–8 min).** Explorar un sendero, interactuar con una pista y reparar un pequeño puente/farol.
6. **La sorpresa (2–3 min).** Regresar a la vivienda; encontrar cofre o carta familiar personalizada. Tilo acompaña la celebración.
7. **Juego libre.** Construir, recolectar y explorar; una vista parcial de rutas futuras anticipa nuevas regiones.

### MVP comprometido

- Un mapa pequeño pero coherente: aldea, claro, bosque, cantera y arroyo.
- Un avatar personalizable y cámara en tercera persona.
- Movimiento, interacción, minimapa o brújula simple.
- Cuatro NPC con diálogos y una línea corta de misiones.
- Cuatro recursos iniciales: madera, piedra, cobre y fibras (el cobre puede usarse poco en esta edición).
- Inventario, banco de trabajo y 6–8 recetas.
- Construcción modular básica con 10–12 tipos de pieza.
- Guardado de inventario, posición, construcciones y misiones.
- Primer misterio y sorpresa navideña.
- Arte y audio coherentes; pruebas en el equipo real de entrega.

### No comprometido para Navidad

- Cinco regiones completas; multijugador; servidores; chat; PvP; sistemas profundos de IA de NPC; vehículos completos; combate complejo; generación procedural infinita; sistemas de física estructural avanzada.

El objetivo es que el primer valle concentre una **versión miniatura de todas las sensaciones del juego completo**, no que intente tener cinco biomas a medio terminar.

## 9. Enfoque técnico para Babylon.js

**Base:** Babylon.js + TypeScript + Vite, proyecto separado y sistemas data-driven.

### Subsistemas

- `world/` regiones, streaming, puntos de interés, clima y navegación.
- `player/` personaje, cámara, interacción, equipamiento.
- `inventory/` ítems, stacks, transferencias.
- `crafting/` recetas, estaciones, desbloqueos.
- `building/` piezas, sockets, colocación, permisos, serialización.
- `quests/` objetivos, eventos, diálogos, estados.
- `npc/` identidad, rutinas livianas, reacciones.
- `persistence/` esquema versionado, migraciones, exportación de respaldo.
- `ui/` HUD, inventario, crafting, construcción, mapa.
- `multiplayer/` contratos futuros, sin integración de red obligatoria en el MVP.

### Criterios de arquitectura

- Datos de objetos, recetas, edificios y misiones en JSON o módulos de definiciones tipadas.
- Eventos de dominio compartidos: `resourceCollected`, `itemCrafted`, `structurePlaced`, `questCompleted`, `routeRestored`.
- Guardar el **estado del mundo** de manera independiente de Babylon.js.
- Preparar identificadores estables para regiones, recursos, piezas y estados.
- Evitar crear desde ahora una infraestructura MMORPG: preservar interfaces y límites para migración futura.
- Usar instanciación, LOD y optimización de texturas según la densidad de cada escena; medir antes de complicar.

## 10. Multijugador y seguridad infantil: fases futuras

**Fase 1:** individual offline/local, sin comunicación externa.  
**Fase 2:** cooperativo privado con invitación administrada por adulto; permisos claros para editar construcciones.  
**Fase 3:** servidores persistentes y comunidad, solo tras diseñar moderación, privacidad, recuperación de cuentas y controles familiares.

Para niños de 7 a 11 años, evitar de inicio chat público, interacción con desconocidos, comercio irrestricto, publicación de datos personales y sistemas de retención agresiva.

## 11. Calendario de producción y criterios de corte

| Período | Hito | Resultado verificable |
|---|---|---|
| 28 oct – 8 nov | Vertical slice de mundo e interacción | caminar, cámara, recoger un recurso y abrir un banco de trabajo |
| 9 – 22 nov | Inventario y crafting | fabricar herramienta, consumir recursos, interfaz consistente |
| 23 nov – 6 dic | Construcción y guardado | colocar/remover piezas, reiniciar y recuperar la partida |
| 7 – 16 dic | Misiones y capítulo navideño | completar toda la experiencia con un recorrido de pruebas |
| 17 – 23 dic | Estabilización y empaquetado | sin errores críticos; copias de seguridad y entrega probadas |
| 25 dic | Regalo | edición de Navidad jugable |

**Regla de alcance:** si una función opcional amenaza la estabilidad, se posterga; no se recorta guardado, construcción básica, identidad del protagonista ni sorpresa navideña.

## 12. Riesgos y decisiones abiertas

**Riesgos:** exceso de alcance; esfuerzo artístico; UI compleja para 9 años; datos de guardado incompatibles; rendimiento en el equipo de destino; contenido demasiado tutorializado.

**Mitigación:** priorizar vertical slice, reutilizar sistemas genéricos existentes sin acoplamiento al otro juego, una sola dirección de arte, testear con niños, automatizar pruebas del guardado, congelar mecánicas el 16 de diciembre.

**Decisiones de diseño que aún pueden cambiar:** nombre de Auralia, nombres de regiones, diseño visual del avatar, estética del mundo, naturaleza de La Deriva, personalidad de Tilo, capacidades de la Brújula Viva.

---

### Síntesis

**Navidad entrega un hogar y la primera aventura. Las expansiones entregan más mundo, más formas de crear y nuevos desafíos.** El crecimiento del protagonista se expresa en las huellas que deja y en las opciones que aprende a reconocer, no en una clase moral explícita.

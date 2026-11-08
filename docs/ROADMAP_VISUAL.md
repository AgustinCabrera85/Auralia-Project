# Roadmap de dirección visual de Auralia

**Estado:** propuesta de producción · **Fecha:** 06/11/2026 · **Actualización geográfica:** 08/11/2026

**Relación:** complementa el [roadmap navideño](ROADMAP_NAVIDAD.md), la [arquitectura del POC](ARQUITECTURA.md) y el [mapa maestro geográfico](MAPA_MAESTRO_GEOGRAFICO.md), y sigue sus fechas de entrega y reglas de compatibilidad.

## Objetivo

Convertir el mundo actual en una fantasía 3D luminosa y acogedora, con formas claras, vegetación de volumen suave y lugares reconocibles desde la cámara normal de juego. La primera muestra completa será **Brisalia y su entorno de pradera**; la segunda, **la Cascada del Valle** como lugar emblemático. Ambas establecerán un patrón reutilizable para las otras regiones.

Ambas muestras forman parte del piloto del Valle de los Faroles. La pradera se integra en una cuenca con lomas, garganta y miradores; el relieve se define antes de distribuir biomas, asentamientos y caminos. La escala total del mundo se decidirá después de jugar y medir una región completa.

Las tres referencias visuales aportadas definen funciones distintas:

| Referencia | Regla de arte que aporta |
| --- | --- |
| Pradera abierta | Colinas suaves, cielo azul amplio, pasto verde y dorado, pequeñas flores y rocas cálidas con siluetas simples. Es la base de Brisalia. |
| Árboles y vegetación desglosada | Copas redondeadas compuestas por grupos de hojas, variedad de tamaño y tono, arbustos y enredaderas modulares, matas de pasto legibles. Es la guía para los assets. |
| Valle de cascadas | Profundidad en capas, roca azulada, agua turquesa y un árbol rosado como foco. Es la guía para componer un lugar emblemático. |

### Reglas visuales comunes

- **Silueta antes que detalle:** árboles, rocas, edificios e hitos deben reconocerse a la distancia de juego. El detalle de hojas y flores aparece al acercarse.
- **Color con jerarquía:** verdes y azules dominan; piedra y luz cálidas equilibran la escena; rosa, violeta y brillos mágicos se reservan para focos concretos.
- **Materiales coherentes:** superficies mayormente mates, variación suave de color y textura, oclusión en uniones y bases. El agua y los elementos mágicos pueden tener reflejos y emisión propios.
- **Composición jugable:** caminos, accesos, personaje y objetos interactivos deben seguir siendo fáciles de leer entre el pasto y las copas.
- **Profundidad:** primer plano con pasto y flores, plano medio con árboles y rocas, fondo suavizado por la niebla existente. Cada lugar emblemático necesita un foco visible al aproximarse.
- **Movimiento sutil:** conservar el viento del pasto y estudiar una oscilación ligera de copas y hojas, sin alterar troncos ni colisiones.

## Alcance de la edición navideña

**Imprescindible:** guía visual, captura de línea base, muestra de pradera en Brisalia, composición de la Cascada del Valle y validación en el equipo objetivo.  
**Si hay margen antes del 16/12:** variantes de color y densidad para Lindebrumas, Nácar y las sierras; mejora de nubes y sombras; animación de árboles.  
**Después de la entrega:** desarrollo progresivo de las doce regiones del mapa maestro, más especies y lugares emblemáticos, y ampliación de los sistemas de clima y luz según lo aprendido en el piloto.

La prioridad sigue siendo una primera aventura estable y legible. Las mejoras visuales opcionales se cierran o se posponen al llegar al congelamiento del 16/12; del 17 al 23/12 sólo entran correcciones y optimización para la entrega.

## Hitos y entregables

Las ventanas son objetivos de planificación desde el 06/11/2026; se revisan tras medir el rendimiento y el esfuerzo de assets. Pueden avanzar en paralelo con los hitos de mecánicas del roadmap navideño.

| Hito | Ventana propuesta | Trabajo | Entregable y criterio de salida |
| --- | --- | --- | --- |
| V0 · Línea base y guía | 6–10 nov | Guardar capturas de Brisalia, Cascada y Lindebrumas con cámara y coordenadas reproducibles. Medir FPS, draw calls, triángulos y tiempos de carga en el equipo objetivo. Fijar paleta, proporciones y referencias de materiales. | Una guía de una página y una comparación inicial que permitan revisar cambios sin depender de impresiones de memoria. |
| V1 · Pradera de Brisalia | 11–24 nov | Ajustar terreno, rocas, árboles, matas y flores; ordenar claros, caminos y grupos de vegetación. Unificar luz y niebla de día. | Recorrido jugable desde la aldea hasta la parcela que reproduzca el carácter de la primera referencia, con personaje e interacciones visibles. |
| V2 · Cascada del Valle | 25 nov–8 dic | Componer entrada, mirador, agua, acantilados, vegetación de ribera y árbol focal. Revisar la aproximación desde el camino y la vista cercana. | Un lugar reconocible desde el acceso, transitable y legible, que traduzca la tercera referencia a la geografía existente. |
| V3 · Cohesión y rendimiento | 9–16 dic | Aplicar acentos regionales de bajo riesgo, revisar LOD, distancias, transición de sectores, iluminación y coste de materiales. Congelar contenido visual nuevo el 16/12. | Brisalia y Cascada aprobadas; regiones vecinas sin quiebres evidentes de estilo; métricas y capturas de comparación archivadas. |
| V4 · Estabilización | 17–23 dic | Corregir defectos visuales críticos, saltos de LOD, solapes, obstrucciones de cámara y problemas del equipo objetivo. | Recorrido completo sin fallos visuales que impidan jugar; paquete navideño listo para la prueba de instalación. |

## Secuencia de trabajo por sistema

1. **Captura y presupuesto.** Usar `?landscapeDebug=1` y `?grassStats=1` en puntos fijos. Registrar resolución, dispositivo, coordenadas, ángulo de cámara y métricas antes de cambiar la escena. Elegir una vista abierta, una con vegetación densa y otra con agua.
2. **Assets vegetales.** Revisar los GLB del [catálogo](ASSETS.md) en escala, pivote, color y silueta. Priorizar variantes de copa y arbusto derivadas de los árboles existentes; conservar sus versiones LOD y materiales compartidos. El segundo referente orienta el aspecto de hojas, enredaderas y pasto.
3. **Suelo, rocas y flores.** Ajustar pesos y color del [material de terreno](TERRAIN_MATERIAL.md), matizar roca y mejorar la lectura de caminos. Usar las cuatro matas del [sistema de césped](GRASS_FIELD.md) como base; añadir variedad visual sólo donde la cámara la perciba. Distribuir flores en pequeños grupos con claros, no como una cobertura uniforme.
4. **Luz y atmósfera.** Afinar la configuración común de niebla y materiales antes de añadir efectos. Probar un cielo con gradiente y nubes estilizadas, luz solar cálida, relleno frío y sombras de proximidad con un presupuesto medido. Usar brillo con moderación en agua y magia.
5. **Composición de lugares.** Colocar a mano rocas grandes, árboles focales y detalles de acceso mediante el documento del mundo y World Editor. La vegetación procedural completa el espacio entre esos elementos y respeta caminos, agua, hitos y construcciones.
6. **Variantes regionales.** Extender la misma gramática de formas: Brisalia verde/dorada; Lindebrumas más densa con acentos violetas; Nácar con vegetación de ribera y turquesas; Altapiedra y Altaluz con más roca y siluetas verticales. Estas variantes reutilizan la geografía actual.

## Integración técnica

| Necesidad | Puntos de integración existentes |
| --- | --- |
| Luz, niebla, cielo y cámara | `src/game/WorldView.ts`, `src/world/LandscapeAtmosphere.ts` |
| Mezcla de suelo, pendientes y costa | `src/world/materials/TerrainMaterial.ts`, `src/world/terrainData.ts` |
| Modelos, escala, LOD y materiales compartidos | `src/world/assetCatalog.ts`, `src/world/VegetationSystem.ts`, `src/world/WorldPropSystem.ts` |
| Distribución de árboles, arbustos y rocas | `src/world/vegetationData.ts`, `src/world/worldPropsData.ts` |
| Pasto, flores y viento | `src/world/grass/GrassSectorSystem.ts`, `src/world/grass/GrassWindPlugin.ts`, World Editor y `public/world/auralia-world.json` |
| Agua y cascada | `src/world/GeographyStream.ts`, `src/world/water/WaterfallGeometry.ts` y materiales de agua existentes |

Se conservan el relieve de apoyo y las coordenadas del núcleo construido de Brisalia, los IDs de lugares y recursos y el formato de guardado. El nuevo relieve se integra alrededor mediante transiciones controladas, según el mapa maestro. Si una composición requiere mover un hito, se trata como un cambio de datos con revisión de accesos, colisiones, mapa y guardados. Las distribuciones por sectores deben seguir siendo deterministas; los elementos singulares se ubican de forma explícita.

## Revisión y aceptación

Cada hito se revisa con las mismas capturas y un recorrido en juego, no sólo con vistas de editor:

- **Arte:** siluetas distinguibles, paleta coherente, foco visible, densidad equilibrada y ausencia de repeticiones o cortes notorios en la cámara de juego.
- **Juego:** personaje, caminos, recursos y objetos interactivos visibles; sin bloqueo de recorridos, cámara ni puntos de construcción por decoración nueva.
- **Técnica:** sin huecos de terreno, saltos molestos entre LOD o aparición brusca de vegetación. Comparar FPS, draw calls y triángulos con V0 en el mismo hardware y vista; investigar cualquier caída sostenida antes de aprobar el hito.
- **Regresión:** ejecutar `npm run build` y las pruebas de terreno, vegetación, césped, geografía y props que correspondan al cambio. Verificar carga de un guardado anterior y una partida nueva.

## Riesgos y decisiones de corte

| Riesgo | Respuesta |
| --- | --- |
| Densidad vegetal y efectos reducen el rendimiento | Medir primero; limitar variantes, materiales y sombras; reutilizar thin instances y LOD existentes; reducir detalle lejano antes de quitar composición cercana. |
| La pradera luce bien en captura pero dificulta jugar | Revisar el recorrido con el personaje, despejar caminos e interacciones y controlar la altura del pasto cerca de la cámara. |
| Los nuevos GLB rompen LOD, escala o colisiones | Validar pivote Y, escala frente al protagonista, silueta lejana y colisión simplificada al importar cada asset. |
| La cascada demanda demasiada producción | Entregar una entrada y un mirador completos con assets reutilizables; diferir ornamentos secundarios. |
| El trabajo visual compite con la edición navideña | Congelar incorporaciones el 16/12. Priorizar V1 y una V2 acotada antes de expandir regiones. |

**Siguiente paso de ejecución:** completar V0 y la maqueta de relieve del piloto de Brisalia, verificar el recorrido y fijar dos capturas objetivo —valle inicial y Cascada del Valle— antes de producir variantes adicionales.

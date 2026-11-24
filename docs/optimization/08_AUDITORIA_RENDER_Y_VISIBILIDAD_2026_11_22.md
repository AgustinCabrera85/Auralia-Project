# Auditoría de renderizado y visibilidad del personaje

22 de noviembre de 2026. Objetivo de hardware: GTX 1060 de 6 GB, 16 GB de RAM y Ryzen 7 4700S. Objetivo de experiencia propuesto: 60 FPS a 1080p, con tiempos de cuadro estables durante el recorrido y el cambio de equipo.

El problema observado tiene un componente importante en el hilo principal: trabajo repetido de iluminación, reconstrucción de buffers de vegetación y tareas de streaming que acumulan su coste en el mismo cuadro. Se corrigieron los dos primeros y un fallo de descarte de partes animadas de Santi. El rendimiento durante un recorrido completo y la desaparición de todo el personaje todavía no están resueltos de forma demostrada.

## Evidencia de la sesión

La exportación `auralia-telemetria (7).json`, de las 01:05 locales, conserva 31,83 segundos quieto en X −1098,33 Z 1769,62. Su ventana final de 30 segundos tiene 56,31 FPS, P95 de 23,4 ms y un cuadro mayor de 50 ms. Actualizar el juego cuesta 5,02 ms de CPU y renderizar con Babylon 11,64 ms; la GPU registra 7,10 ms. Los tiempos CPU y GPU se solapan: no se suman entre sí.

Esa exportación perdió los cuadros del recorrido anterior porque el historial retenía solamente 1800 cuadros. Sus 351 segundos de historial de recursos mantienen 21 administradores de morphs, 13 esqueletos y 168 grupos de animación; las mallas bajan de 1704 a 1633. No reproduce la antigua fuga de rigs de aves. Tampoco demuestra que toda la memoria esté bajo control.

Después de separar la iluminación de las colisiones, F8 mostró 2,8 ms por cuadro en faroles, señales y fuente, frente a 0,4 ms en movimiento y colisiones. Durante esa carga inicial, terreno alcanzó 33,8 ms, vegetación 15,6 ms, pasto 13,9 ms y agua 12,6 ms como máximos de una ventana de diez segundos. Esos máximos no necesariamente pertenecen al mismo cuadro.

La exportación `auralia-telemetria (8).json`, de las 01:25 locales, verifica el estado posterior a las correcciones: 1455 cuadros durante 25 segundos, quieto en X −1127,64 Z 1768,71, render a 1704 × 1080.

| Medida posterior | Resultado |
|---|---:|
| FPS medios | 58,13 |
| Cuadro medio / P95 / P99 / máximo | 17,20 / 22,1 / 27,3 / 38 ms |
| Cuadros mayores de 50 ms | 0 |
| CPU actualización / Babylon | 1,92 / 11,47 ms |
| Faroles, señales y fuente | 0,10 ms |
| Movimiento y colisiones | 0,23 ms |
| Selección de mallas / animación | 2,99 / 1,23 ms |
| Envío del dibujo CPU / GPU asíncrona | 5,61 / 7,26 ms |
| Partes visibles y seleccionadas de Santi | 11 de 11 en todos los cuadros |

Las ubicaciones, hora del juego y estado de carga cambian entre las capturas: no constituyen un A/B para atribuir la diferencia de FPS a una única corrección. La última captura verifica reposo; no certifica desplazamientos, combate, natación ni el hardware objetivo. La escena estabilizada conserva unas 396 llamadas de dibujo, 2,85 millones de triángulos, 1620 mallas y 623 materiales.

El monitor de recursos puede mostrar porcentajes moderados mientras el hilo principal incumple el plazo de 16,67 ms. Además, la memoria de la pestaña, el heap JavaScript y la VRAM son medidas diferentes. La herramienta de Chrome permite inspeccionar tareas y cuadros del hilo principal. [Referencia de Performance de Chrome](https://developer.chrome.com/docs/devtools/performance/reference).

## Correcciones implementadas

### Luces que recorrían toda la escena cada cuadro

En Babylon 9.32, `Light.setEnabled` llama a `_resyncMeshes` incluso cuando el valor solicitado no cambia. Este último recorre `scene.meshes`. `WayfindingSystem` y `BrisaliaEntranceLanterns` repetían esa llamada para sus luces en cada actualización, incluidas luces apagadas.

`SceneLightBudget.setLightEnabled` compara primero el estado local, sin confundirlo con el estado heredado del padre. Los dos sistemas lo usan ahora. Las transiciones reales conservan la sincronización del motor. La prueba con los sistemas reales verifica cero recorridos de luces en 120 cuadros estables de día y de noche, y conserva las transiciones por distancia y por visibilidad del edificio. La lectura posterior del bloque completo queda en 0,10 ms.

### Buffers de vegetación y pasto

`VegetationSystem.refreshBuffers` recreaba buffers estáticos y calculaba sus límites dos veces. `GrassPatchStream.refresh` también recreaba los buffers al actualizar la selección. `DynamicInstanceBuffers` conserva buffers actualizables, aumenta capacidad por potencias de dos y calcula límites una sola vez usando la cantidad real de instancias. La selección vacía reutiliza la reserva al volver a poblarse. La capacidad depende del máximo conjunto residente, no de la distancia recorrida.

En una prueba aislada de 10.000 instancias y 35 actualizaciones, las recreaciones pasan de 35 a 1 y los cálculos de límites de 70 a 35. La mediana de esa operación pasa de 4,96 a 2,34 ms. Es una medición CPU con NullEngine, no una mejora porcentual de FPS ni una prueba de transferencia a una GPU real. La generación de listas, su ordenación y parte de las asignaciones CPU siguen existiendo.

### Partes animadas descartadas fuera de cámara

Las cajas de la pose base de Santi no describen todas sus poses animadas. La prueba del GLB en 32.256 combinaciones de malla, animación y cámara encontró 2246 descartes falsos en ropa y partes de la cara al compararlas con límites recalculados tras deformación. No encontró un descarte falso del cuerpo principal en esa muestra.

Las mallas renderizables de Santi usan ahora `alwaysSelectAsActiveMesh`. Su pequeño número permite evitar este descarte sin recalcular todos sus vértices en CPU cada cuadro. La ocultación explícita de su jerarquía continúa funcionando. Esto corrige una causa de parpadeo parcial; no demuestra la causa de la desaparición completa que reportó el usuario.

### Selección del ratón e instrumentación

Se desactiva la selección automática de mallas al mover el ratón. Los clics y consultas explícitas de construcción se mantienen. Es una optimización indicada por Babylon para escenas que no necesitan ese picking automático. [Optimización de escenas de Babylon](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/).

F8 separa colisiones, iluminación ambiental, compañero, personaje, animación, pases auxiliares y envío del dibujo. Exporta la cantidad de partes de Santi visibles y seleccionadas, y guarda los últimos 120 cuadros mayores de 50 ms aunque el usuario luego se quede quieto. Una malla seleccionada todavía puede quedar oculta por profundidad, recorte o material; ese contador no demuestra que todos sus píxeles se hayan dibujado. La instrumentación se habilita al medir.

## Trabajo prioritario pendiente

| Prioridad | Problema en la implementación | Cambio concreto y comprobación |
|---|---|---|
| 1 | Cada sistema consume su propio presupuesto; terreno usa 4 ms y pasto 2,5 ms, con trabajo posterior fuera del límite. | Introducir una cola común con plazo global inicial de 2 ms por cuadro para trabajo incremental. Incluir selección, límites y publicación de buffers. Mantener el último sector válido hasta que el nuevo esté completo. Medir P95 y P99 al cruzar sectores. |
| 1 | Una tarea individual de aves o generación puede superar todo el presupuesto. | Dividir corredores de vuelo y generación en pasos reanudables; después mover cálculo puro de terreno y placements a workers con arrays transferibles. No mover objetos Babylon al worker. Medir la tarea máxima, no solo su media. |
| 1 | Los lotes globales de thin instances tienen límites enormes. | Separar vegetación por grupos espaciales suficientemente grandes para conservar pocas llamadas de dibujo. Descartar grupos fuera de cámara y aplicar LOD por tamaño proyectado. Comparar CPU, triángulos y continuidad visual en la misma ruta. |
| 1 | El bosque mantiene hasta 96 árboles completos cercanos y hasta 96 de primeras filas distantes, además de 240 medios; las primeras filas pueden estar a 1100 m. | Reemplazar detalle lejano por impostores ya disponibles, usando umbrales en píxeles e histéresis. Preservar siluetas importantes. Medir antes de reducir densidad o distancia global. |
| 2 | Ordenaciones y listas completas al cambiar la selección de pasto y vegetación. | Conservar listas por sector y actualizar solo altas, bajas y cambios de LOD. Evitar ordenar repetidamente toda la cola de terreno. Reservar arrays y reutilizarlos. |
| 2 | Cientos de materiales y mallas activas mantienen alto el coste de envío del dibujo. | Agrupar piezas estáticas por material y sector, y compartir materiales equivalentes. Congelar matrices solo en objetos realmente estáticos; excluir viento, personajes, agua y elementos con cambios de visibilidad. |
| 2 | La preparación de un arma incluye instanciación, shaders y primer envío a GPU, además de descargar el GLB. | Separar tiempos de entrada, carga, creación, compilación y primer cuadro visible. Preparar variantes de armas poseídas durante una fase controlada de carga y conservar su instancia lista. No compilar todo el catálogo cada vez que se equipa. |
| 2 | La memoria de la pestaña vuelve a ser alta aunque los contadores de rigs sean estables. | Hacer inventario por propietario de geometría CPU, morphs, imágenes decodificadas, texturas GPU y cachés residentes. Comparar inicio y regreso a la misma zona con la misma calidad, después de estabilizar la carga. Evitar deducir VRAM del tamaño del GLB. |

Los thin instances ya existen en Auralia; el cambio propuesto es su partición y actualización. Babylon documenta que un lote de thin instances se muestra completo o se descarta completo según los límites de su malla. [Thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/).

La captura posterior oscila aproximadamente entre 923 y 960 MiB de heap JavaScript. Chrome muestra por separado 1,6 GB de pestaña en esta sesión con recargas de desarrollo. Esa observación no permite declarar otra fuga ni considerar resuelto el consumo de memoria. Los recursos residentes requieren una medición de ida y vuelta en una sesión limpia de producción.

## Estrategias de renderizado evaluadas

| Técnica | Decisión para Auralia |
|---|---|
| WebGL2 con partición espacial, instancing y LOD | Primera opción. Ataca trabajo y geometría que ya están identificados sin migrar todo el renderer. |
| Workers para generación | Alta prioridad después de separar cálculo puro y publicación. La creación de recursos GPU permanece presupuestada en el hilo del renderer. |
| Resolución dinámica | Útil cuando sube el tiempo GPU. No elimina los recorridos CPU, las ordenaciones ni los bloqueos de generación. Con histéresis y cambios graduales. |
| Materiales y matrices congelados | Aplicación selectiva a grupos estáticos. No congelar globalmente la lista de mallas activas en un mundo que carga y descarga sectores. |
| Depth prepass | Condicional a demostrar que el exceso de fragmentos de vegetación limita GPU. Añade dibujo y puede empeorar el cuello CPU actual. |
| Oclusión | Considerar por grupos grandes y opacos, con resultados asíncronos e histéresis. No usarla para ocultar al protagonista ni para consultar cada planta. |
| Agua a resolución reducida | Evaluar solo cuando sus pases de profundidad y óptica sean costosos. La captura seca tenía los pases prácticamente apagados; no explica ese coste de reposo. |
| WebGPU | Prototipo posterior con la misma escena y calidad, midiendo CPU y GPU. Cambiar de API no elimina generación síncrona, malas particiones ni recorridos de escena. Mantener fallback WebGL2 para el equipo objetivo. |
| Deferred rendering | Baja prioridad: pocas luces efectivas, vegetación con alfa y materiales propios. Añade buffers y complejidad sin evidencia de que resuelva el cuello dominante. |

Las sombras ya están acotadas a un mapa de 1024 para personajes, y existen texturas comprimidas, LOD, impostores y streaming. La estrategia debe aprovecharlos y corregir su organización; quitar características de forma general no sustituye medir la causa.

## Validación y criterio de aceptación

Pasaron TypeScript y las comprobaciones específicas de buffers, selección de Santi en reposo, marcha, natación y ataque, conservación de tirones en telemetría y transiciones de faroles. No se ejecutó una regresión global.

La próxima medición necesaria es una ruta reproducible: caminar y girar cámara por bosque y Brisalia, cruzar un límite de sector, entrar al agua y cambiar de arma fría y preparada. Guardar los cuadros inmediatamente y correlacionar cualquier desaparición con los contadores del protagonista. Si sus 11 partes siguen seleccionadas, revisar profundidad, cámara y material en ese cuadro; si se deshabilitan, registrar quién cambió la visibilidad.

Como presupuesto inicial de trabajo, reservar margen manteniendo CPU y GPU por debajo de unos 12 ms cada una en la ruta habitual, con P95 próximo a 16,67 ms y sin tareas ordinarias de streaming de más de 50 ms. Son objetivos de optimización, no resultados obtenidos. La aceptación para GTX 1060 requiere medir en ese equipo, con perfil de producción y calidad fijados, incluyendo una vuelta a la zona inicial para comprobar residencia de memoria.

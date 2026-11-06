# Follaje ilustrado V4 y Bosque Ilustrado

El paquete **Auralia Foliage Illustrated V4** aporta 27 modelos GLB y 12 LOD1 originales. Se añadieron seis LOD1 generados para los tres pastos y las tres praderas: en total hay 18 LOD1. Los GLB de juego están en `public/assets/foliage-v4/`; el archivo Blender, las texturas originales, el manifest y `AuraliaFoliageWind.js` recibido están en `assets-source/foliage-v4/`. Las texturas necesarias para jugar ya están incrustadas en cada GLB.

## Uso en el juego y World Editor

Todos los modelos principales están registrados como `v4...` en `src/world/foliageV4Catalog.ts` y aparecen en **World Editor → Colocar GLB → Modelo**. Incluyen cuatro árboles, tres arbustos redondos, tres setos, cuatro enredaderas, tres parches de pasto, tres praderas floridas, trébol, cuatro flores y dos islas naturales compuestas. La escala de referencia, el radio de colisión y la distancia visible están definidos por modelo. Las flores y parches tienen colisión cero.

Los modelos se cargan al acercarse a sus colocaciones. `AuthoredAssets` agrupa sus mallas mediante thin instances, cambia a LOD1 cuando el modelo lo incluye y limita la distancia de dibujo según el catálogo. El GLB original queda disponible cerca de la cámara; los LOD no reemplazan las colisiones ni los datos de la partida. El pasto y las praderas usan su malla completa hasta aproximadamente 90 m y LOD1 hasta 240–255 m; los umbrales se distribuyen por planta para que no cambie una sección entera al mismo tiempo. Los seis LOD nuevos conservan los materiales V4 y tienen entre 18 % y 25 % de los triángulos originales. Se regeneran con Blender 5.2 mediante `scripts/generate-foliage-grass-lods.py`.

El shader V5 recibido se usa directamente desde `src/world/AuraliaFoliageWindV5.js`: mueve troncos, ramas y hojas desde la raíz y añade variación pictórica a la corteza antes de la iluminación PBR. `src/world/AuraliaFoliageWind.ts` conserva un plugin separado para el viento de pastos, praderas, flores y trébol V4; ambos comparten el reloj de la escena. El V5 original se conserva en `assets-source/foliage-v4/AuraliaFoliageWind.js` y la fuente anterior en `AuraliaFoliageWind_V4.js`.

## Bosque de prueba

El **Bosque Ilustrado** ocupa una zona aproximada de **660 × 520 m** al oeste de Lindebrumas, centrada en **X −730, Z −420**. Tiene **9.306 colocaciones V4**: **500 árboles** de aproximadamente 17 a 28 m, **280 arbustos redondos** de unos 3 a 4 m, **6.949 matas de pasto y pradera** y **1.358 flores individuales**. Una malla irregular de pastos ensanchados en X/Z rellena el suelo entre los grupos decorativos sin aumentar la altura de las hojas. Los árboles conservan un claro central y un sendero desde Lindebrumas.

La **Pradera Florida V4** se concentra en **X −790, Z −510**. Reúne 1.253 flores individuales en ramilletes y 180 parches floridos, con predominio de rosa y azul y acentos blancos y amarillos. Fuera del claro quedan algunas flores sueltas para enlazar visualmente ambos espacios. Las piezas verticales de enredadera están disponibles en el editor para ubicarlas sobre superficies concretas.

La paleta del bosque aclara y calienta el suelo, da más verde a las copas y pastos, reduce la niebla azul pálida que lavaba el plano medio, usa un cielo azul más saturado y reemplaza el blanco del camino por un tono tierra mate. El terreno añade un patrón sutil de cobertura a media y larga distancia para enlazar visualmente los LOD del pasto con el suelo. Las transiciones del suelo se suavizan en el borde del bioma.

Los pastos y las praderas toman la altura de la malla visible del terreno, ajustan sus bases a la pendiente y se hunden unos centímetros para evitar bordes flotantes. El generador descarta parches cuyo ancho cruza cambios bruscos de altura o la cara estructural del acantilado de Altapiedra. Los árboles V4 también usan la altura visible del terreno.

Dentro del límite del bioma se excluyen los árboles y plantas procedurales anteriores, el pasto horneado anterior y los props decorativos procedurales. La vegetación visible del bosque utiliza los modelos V4. Fuera del límite se mantienen los sistemas previos.

Para visitarlo, abrir **Mapa → Mapa del terreno jugable** y pulsar el marcador verde **♣ Bosque Ilustrado**. La lista de lugares también ofrece **Pradera Florida V4** para viajar directamente al campo de flores. Ambos viajes abren el panel de diagnóstico con **FPS, draw calls, triángulos, instancias V4, instancias LOD y materiales con viento**. También se puede abrir ese panel desde cualquier zona con `?landscapeDebug=1`.

Las colocaciones están en el archivo versionado `public/world/foliage-v4-forest.json` y se regeneran de forma determinista con `npm run forest:generate`. Al iniciar el juego o el World Editor se combinan con el documento base, sin modificar sus otras colocaciones. El sendero y el marcador se definen en `src/world/foliageForestConfig.ts`; el generador consulta el relieve, el agua, las pendientes y la máscara de caminos antes de ubicar cada pieza.

## Medición

1. Entrar al bosque desde el mapa y esperar a que termine la carga de los GLB.
2. Comparar FPS, draw calls y triángulos en el claro central, dentro de la arboleda y mirando hacia el borde lejano.
3. Repetir el recorrido con la misma resolución, cámara y equipo. El contador **viento** confirma cuántos materiales recibieron el shader; **LOD** indica cuántas instancias V4 usan su malla lejana.
4. Si el rendimiento cae, revisar primero la cantidad visible de praderas y arbustos, el número de materiales por GLB y las distancias de dibujo del catálogo. La densidad elevada está pensada como prueba de carga.

La medición en el navegador y equipo de destino es la referencia para ajustar densidad o distancias. `npm run check`, las pruebas de geografía y la compilación verifican estructura y datos, pero no miden la GPU.

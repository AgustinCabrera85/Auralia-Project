# Unión de agua en la cuenca de Salida de Vertientes

Se reprodujo una división entre río y océano en la depresión situada al norte de la orilla X −2086, Z 242. En X −2086/Z 200, −2104/Z 180, −2090/Z 180, −2080/Z 180 y −2050/Z 120 había terreno sumergido pero ningún propietario de agua interior; el océano dibujaba esa parte junto al río, con otro material y oleaje.

`PlayableWorld` delimita esa cuenca con `LakeWaterDomain`, partiendo del cauce cerca de X −2130/Z 115 y siguiendo el R16 original bajo el nivel Y = 1. El dominio debe cerrarse antes del límite de búsqueda; no se acepta si alcanza una costa abierta. Su franja de protección queda bajo las orillas secas. El canal excavado conserva su trazado, altura, corriente y dominio anterior.

La extensión se comparte entre `waterFieldAt`, `waterMaskAt`, `waterNear` y `oceanExclusion`. `GeographyStream` genera una sola superficie con el material del río y `ClippedWaterSurface` la recorta contra el terreno real. Fuera del eje fluvial, `flowAt` devuelve agua calma, sin heredar la corriente de una vertiente distante. No se cambian alturas del terreno ni del agua; el océano sigue disponible fuera de la cuenca.

Coste: 18.360 bytes de dominio CPU, sin añadir texturas GPU ni materiales. La máscara oceánica existente incorpora la extensión. Los niveles cercano y lejano generan agua a Y = 1,035, incluido el desplazamiento visual previo de 0,035.

`npm run test:river-basin` comprueba 3.381 muestras de propiedad, los cinco puntos anteriormente asignados al océano, conservación exacta del terreno, orillas secas, corriente del cauce, calma exterior y ambas mallas LOD con el mismo material y nivel.

Las pruebas generales `test:hydrology-integration` y `test:lake-shore` presentan fallos anteriores a este cambio. Se repitieron usando la versión de `PlayableWorld.ts` de HEAD en la compilación temporal y fallaron igual: excavación en X −984/Z 1458 (3,0593961976 frente a 3,0280352093) y una altura histórica de la orilla de Nácar. No se modificaron esos valores esperados ni el terreno para ocultar los fallos.

La revisión visual automatizada quedó pendiente: Computer Use detuvo la interacción al no poder verificar con suficiente confianza la URL actual de Chrome. La prueba aislada temporal no toca partidas guardadas. El usuario confirmó que vio una versión corregida que funciona; no pudo precisar si la coordenada de la captura era Z 242 o Z 742.

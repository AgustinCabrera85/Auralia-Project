# Pastizales por sectores

El juego carga cuatro matas estáticas del archivo `public/assets/grass/grass_tufts.glb`:
`short`, `medium`, `tall` y `flower`. El GLB se regenera con Blender 5.2 mediante
`scripts/generate-grass-glb.py`. No se crean hojas ni materiales de pasto durante
el juego; las mallas y sus materiales llegan del GLB.

Los colores verdes oscuros están guardados como colores de vértice en el GLB.
`GrassWindPlugin` agrega una oscilación suave al material importado: desplaza
las puntas según la altura de cada vértice y deja las raíces inmóviles. No
modifica las matrices de las thin instances ni la ubicación de los sectores.

`GrassSectorSystem` lee las posiciones ya guardadas en `grassBakes` dentro de
`public/world/auralia-world.json`. Cada registro contiene X, Z, giro y escala de
una mata. El sistema calcula la altura con los mismos triángulos cercanos que
usa `TerrainStream`, inclina las bases según la pendiente y guarda una matriz
absoluta e inmutable para cada mata. Los valores Y antiguos del archivo no
desplazan el pasto.

Las matrices se agrupan por sectores de 72 m y variante GLB. Al entrar o salir
de un sector, se actualizan como máximo cuatro buffers de thin instances. La
ventana de 5 × 5 sectores depende sólo de la posición del jugador y cubre el
sector adicional visible antes de cruzar un borde. La llegada de una malla de
terreno, el movimiento de la cámara y cada frame de render no generan otra
distribución. Los buffers se vacían al salir de la isla o desactivar el pasto.

Los assets colocados después excluyen las matas dentro de su radio. Una edición
del documento del mundo puede llamar `refreshBakedGrass()` para volver a leer
los registros guardados. La URL `?grassStats=1` muestra cantidad de matas,
triángulos y sectores activos.

En World Editor, el pincel pinta zonas y `GrassSectorBake` hornea sus posiciones
de forma determinista en parches de 12 m. El archivo exportado conserva esos
registros. El juego sólo lee los registros; nunca ejecuta el horneado.

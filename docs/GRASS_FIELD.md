# Pastizales del continente: altura, hábitat y LOD

El continente usa `GrassSectorSystem` con el backend `GrassPatchStream`.
La distribución es determinista, con tramos densos y claros, y sólo ocupa suelo
verde. No añade otra superficie de terreno ni colliders para cada hoja.

## Altura y reacción al jugador

`GrassClumpGeometry` agrupa cinco matas del GLB existente, conserva sus colores
con una corrección hacia el oliva del terreno y normaliza cada variante a una
unidad de altura. El GLB original no se modifica. Las instancias miden entre
el **50 % y el 75 % de `TRAVERSAL.playerHeight`**, la misma constante que escala
el modelo de Santi: actualmente **1,90–2,85 unidades**, frente a 3,80 de Santi.
Los nombres heredados `short`, `medium`, `tall` y `flower` indican variantes de
forma; todas respetan el rango solicitado.

Las puntas se apartan del jugador dentro de un radio de 2,2 unidades, con una
deformación gradual que llega a 1,25 unidades horizontales y 0,32 hacia abajo.
Las raíces quedan fijas. Al alejarse, la forma vuelve suavemente a su posición
original según la distancia. Es una deformación de vértices en GPU; no agrega
simulación física, colliders ni actualizaciones de matrices por hoja. El viento
existente sigue activo. El rango de altura se refiere al pasto erguido: la
inclinación al contacto y la retirada del LOD lejano reducen su altura visible.

## Dónde crece

`GrassHabitat` interpola los pesos de material de los mismos triángulos canónicos
que utiliza el terreno cercano. Exige predominio verde y poca arena/roca tanto
en la raíz como en cuatro puntos de su huella. Se excluyen agua, playas, roca,
pendientes pronunciadas, caminos y radios de objetos/construcciones. Las bases
consultan la superficie autoritativa y se ajustan a la pendiente.

La vegetación propia de humedal —juncos, totoras, iris y plantas flotantes— sigue
en `LagoonVegetation`; estas reglas de pasto terrestre no la reemplazan.

En Brisalia, los caminos, plaza, entradas y huellas de edificios se excluyen
con la misma implantación que usa la escena. El pasto no hereda los grandes
radios reservados para árboles ni la máscara circular antigua de todo el pueblo.
Las matas siguen siendo altas y anchas, con flores dispersas: no se sustituyen
por césped corto ni se afinan las hojas del modelo original.

## Streaming y sprites

Las distancias siguientes son unidades del juego. Con la referencia de Santi
de 1,40 m frente a 3,80 unidades, 240 unidades equivalen a unos 88 m reales.
La ventana móvil genera parches de 24 unidades con candidatos separados 1,5 y ruido
continuo para formar agrupaciones. Sólo consulta sectores R16 ya residentes;
no carga sectores de altura adicionales. La cola trabaja en pasos de 16
candidatos con un presupuesto de generación de 2,5 ms por actualización. Este
presupuesto es cooperativo: no incluye el envío de buffers ni las pausas de GC.

| Distancia al jugador | Representación |
| --- | --- |
| Hasta 30 | Matas 3D compartidas: 90 triángulos, 150 con flor |
| 30–46 | Cambio escalonado por mata, conservando posición, altura y color |
| 46–72 | Dos planos cruzados con alfa recortado: 4 triángulos por mata |
| 72–96 | Retirada gradual del detalle intermedio; permanece una de cada cuatro matas |
| 96–180 | Fondo disperso con sprites de las mismas matas |
| 180–240 | Retirada gradual del fondo |
| 240–288 | Precarga sin dibujar, antes de que los sectores entren en pantalla |

Hay como máximo cuatro lotes 3D y cuatro de sprites. Los límites de buffers son
4.096 instancias cercanas y 16.384 lejanas; incluyen una banda de solape para
moverse antes de renovar la selección. El shader dibuja una sola representación
de cada mata. Los sectores fuera de la ventana se liberan, también al viajar a
Albor o Umbrael. Las matrices sólo se renuevan al avanzar 6 unidades, recibir un parche
o cambiar exclusiones, no por rotar la cámara.

La cola establece primero la silueta dispersa del fondo y después completa el
anillo de detalle, con anticipación de 48 unidades. Los parches dispersos omiten
las consultas de terreno de tres de cada cuatro candidatos; sus raíces coinciden
exactamente con las del detalle completo. Un sector sin alturas residentes no
bloquea otros trabajos que ya pueden generarse. Se conservan los límites de
instancias y el presupuesto cooperativo de 2,5 ms.

El atlas `public/assets/grass/grass-sprites.png` contiene cuatro siluetas de
256 × 256, horneadas del mismo grupo de matas. Ocupa aproximadamente 1,33 MiB
RGBA con mipmaps. Tanto sprites como modelos usan **PBR con iluminación lineal**;
usar StandardMaterial en el LOD lejano producía un salto oscuro al atardecer.
El horneado no incluye iluminación, y la textura se interpreta como albedo sRGB.
Los texeles transparentes conservan el color de las hojas vecinas para evitar
halos negros al filtrar mipmaps. `encode-sprite-png.ts` conserva ese RGB, que
Canvas descartaba al serializar alfa cero. No se usa tramado de píxeles para
desvanecer matas ni transparencia mezclada que requiera ordenación.

Regenerar el atlas en el perfil de navegador desechable:

```sh
node scripts/check-worldstudio-game.mjs --run --bake-grass-sprites
```

## Validación actual y medición anterior

El 14 de noviembre de 2026, `npm run test:grass-lod` comprobó también la cobertura
lejana, la franja de precarga, coincidencia entre raíces dispersas y detalladas,
y altura y exclusiones de Brisalia. Una prueba de avance de 24 unidades en el
navegador encontró todos los sectores visibles y el detalle cercano ya cargados
antes de mover al jugador. Se conservan ocho llamadas de dibujo para el pasto.
No es una medición de rendimiento en una GTX 1060.

La tabla siguiente conserva la medición del **13 de noviembre**, anterior al
alcance ampliado; no debe usarse como benchmark de la configuración actual.

`npm run test:grass-lod` comprueba determinismo, altura de todas las variantes,
suelo verde, exclusiones, cola y límites, raíces, descarga, regreso a sectores,
material PBR, alfa, RGB de los texeles transparentes y uniformes de interacción.
La muestra real de la laguna contiene **2.179 matas válidas en 49 parches**.
`npm run test:grass` conserva la compatibilidad del horneado del editor.

La prueba de navegador usa un perfil desechable sin guardados del usuario,
1600 × 900, calidad de rendimiento, límite de 30 FPS, cámara de radio 11,5 y
la misma posición `(2121, -1211)` a las 10:00. Muestra de 10 segundos:

| Métrica | Antes | Después |
| --- | ---: | ---: |
| Instancias enviadas, incluido solape LOD | 809 | 3.251 |
| Triángulos enviados del pasto | 14.826 | 70.536 |
| Llamadas de dibujo del pasto | 4 | 8 |
| Triángulos activos de toda la escena | 798.329 | 854.039 |
| FPS, limitados a 30 | 30,00 | 29,99 |
| Intervalo medio entre frames | 33,33 ms | 33,33 ms |
| Intervalo p95 | 40,50 ms | 39,10 ms |
| Tiempo CPU medio del frame | 9,61 ms | 10,10 ms |
| Tiempo CPU p95 | 17,20 ms | 16,70 ms |
| Heap JS observado | 318,17 MiB | 386,69 MiB |

El heap es una lectura puntual sin forzar GC y contiene toda la aplicación;
no equivale a VRAM ni permite atribuir esa diferencia al pasto. El atlas y los
buffers activos nuevos suman **1,53 MiB**, además de geometría compartida y
posiciones de CPU. Esta vista mantiene 94 parches, 3.101 posiciones únicas,
662 entradas 3D y 2.589 entradas de sprites. La generación acumulada de 187
parches tomó 507,5 ms, repartidos entre frames; el parche más costoso acumuló
7,8 ms y se dividió en pasos. Se registró un pico de actualización de buffers
de 55,8 ms durante carga: los 30 FPS estables no demuestran ausencia de tirones
durante streaming ni miden tiempo GPU.

Las capturas y mediciones están en `artifacts/geographic-source/grass/`:
`before/` conserva el pasto disperso anterior; `after/` incluye terreno verde,
arena despejada, detalle, recorrido y la transición bajo tres horarios.
`after/height.json` mide las mallas realmente cargadas: mínimo 1,9046 y máximo
2,8491 en la muestra. `after/outside.json` confirma cero instancias en Albor.

```sh
npm run test:grass-lod
npm run test:grass
npm run build
node scripts/check-worldstudio-game.mjs --run --grass
node scripts/check-worldstudio-game.mjs --run --grass-lighting
```

## Compatibilidad del editor

Sin un proveedor geográfico activo, `GrassSectorSystem` conserva el camino de
`grassBakes` de `public/world/auralia-world.json`: sectores de 72 m, ventana
5 × 5 y cuatro buffers de modelos. `GrassSectorBake` sigue horneando parches
de 12 m en el editor. `refreshBakedGrass()` regenera posiciones del continente
cuando corresponde o vuelve a leer esos registros en el modo de editor.
No se cambia el formato de los guardados ni se migra progreso.

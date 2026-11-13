# Orilla y vegetación de las Tres Vertientes

Revisión del 13 de noviembre de 2026 sobre el continente principal.

## Orilla, agua y espuma

Los polígonos celestes junto a X −2936 / Z −827 eran crestas del océano: su máscara terminaba antes que la intersección real entre terreno y laguna. El dominio de la laguna ahora continúa bajo la orilla seca y excluye ambos LOD del océano. La malla de agua se recorta con el terreno canónico de 6 m, sin agregar una segunda superficie.

El relieve tenía un salto de 1,5 m al terminar la cubeta. Se reemplazó por una transición de pendiente finita alrededor de la cota del agua, conservando el fondo profundo y el terreno exterior. La franja de orilla conserva resolución de 6 m también en los LOD intermedio y lejano. El resto del terreno mantiene su streaming habitual.

Las coordenadas de impacto de Ferragrís, Velo y Gemelas se transforman al continente nuevo. Se reactivó su espuma y turbulencia en la superficie receptora, con un movimiento de normales más visible y una franja de espuma más ancha en las aguas someras. Los niveles de agua y los archivos R16 no cambian.

## Vegetación

`LagoonVegetation` coloca 449 grupos deterministas sobre las alturas reales de la laguna migrada:

| Modelo compartido | Grupos |
|---|---:|
| Totoras altas | 101 |
| Juncos densos | 75 |
| Iris amarillos | 84 |
| Helechos húmedos | 67 |
| Flores de ribera | 69 |
| Nenúfares blancos | 53 |

Las plantas emergentes se limitan a −0,70…+0,65 m respecto del agua; los helechos y flores a +0,35…+2,40 m. Los nenúfares flotan sobre zonas tranquilas de 0,30…2,60 m de profundidad, comprobando también su contorno. Se descartan pendientes mayores que 0,25 m/m y se reservan corredores en cascadas, desagüe y entradas de la gruta.

Se reutilizan los GLB V3, sus materiales, viento e instancias compartidas de `AuthoredAssets`. Totoras y juncos usan LOD1 alrededor de 65 m, con una variación de ±6 m para evitar cambios simultáneos. La distancia de dibujo de las plantas se distribuye entre 143 y 167 m. El lote visible se actualiza cada 8 m de desplazamiento por la ribera.

La generación comienza al acercarse a la laguna, únicamente cuando sus alturas ya están residentes, y se reparte por grupos con un presupuesto de 2,5 ms por actualización. Cada grupo es indivisible: ese presupuesto no es un límite estricto de tiempo de frame. Solo se conservan unos 86 KiB de metadatos de colocación; no se carga el continente completo ni se añaden sectores R16. La vegetación decorativa no incorpora obstáculos de colisión ni se escribe en los guardados.

## Validación

- `npm run test:lagoon-shore`: 1.805 muestras del perímetro, 494 comprobaciones de agua, 225 rayos sobre LOD reales y 10 mallas de agua. Error máximo de contorno en las 80 secciones sin afluentes: 2,43 cm; coincidencia de altura entre LOD y colisión dentro de precisión numérica. Tres impactos comprobados en coordenadas migradas.
- `npm run test:lagoon-vegetation`: colocación repetible, seis hábitats, reserva de accesos, matrices sobre terreno/agua, límite de distancia y ausencia de cargas R16 adicionales. Instalación única al acercarse y respeto de objetos existentes.
- `npm run test:expansion`: regresión de los 690 grupos del catálogo anterior, colores, viento y colocación acuática.
- `npm run test:lagoon`, `npm run test:hydrology-integration`, `npm run check` y `npm run build`.
- `node scripts/check-worldstudio-game.mjs --run --lagoon-shore`: perfil descartable de Chrome, dos ángulos de la orilla, ocultación diagnóstica del océano, vegetación, tres cascadas y retorno a Brisalia para comprobar descarte de instancias. Los guardados del usuario no se abren.

## Coste observado

Mismo punto y orientación, resolución de captura 1600 × 900, calidad rendimiento, límite de 30 FPS. La cámara adapta su altura al terreno corregido. Los FPS son muestras con límite, no una medida de capacidad máxima.

| Medida | Antes | Después, con vegetación |
|---|---:|---:|
| Triángulos residentes del terreno | 167.470 | 187.314 |
| Buffers del terreno | 5,91 MiB | 6,52 MiB |
| Sectores R16 residentes | 9 / 25 | 9 / 25 |
| Triángulos activos de escena | 1.979.452 | 2.190.437 |
| FPS de la muestra | 30,20 | 30,00 |

En esta vista se dibujan 167 de los 449 grupos de humedal: 10 lotes, 263.738 triángulos y 13.184 bytes de matrices de instancias. Los modelos y materiales se comparten. La generación acumuló 414 ms repartidos en varias actualizaciones durante esta sesión de navegador; la prueba sin render midió 52 ms. Son mediciones de entornos distintos y no equivalen a tiempo por frame. El heap JS de la muestra fue de 341 MiB, dependiente del GC; no se midió memoria total de GPU ni se afirma equivalencia con memoria total de Chrome.

## Evidencias

| Vista | Antes | Después |
|---|---|---|
| Orilla hacia el noreste | [Captura](../artifacts/geographic-source/lagoon-shore/before/noreste.png) | [Captura](../artifacts/geographic-source/lagoon-shore/after/noreste.png) |
| Orilla hacia el noroeste | [Captura](../artifacts/geographic-source/lagoon-shore/before/noroeste.png) | [Captura](../artifacts/geographic-source/lagoon-shore/after/noroeste.png) |
| Océano oculto para diagnóstico | [Captura](../artifacts/geographic-source/lagoon-shore/before/sin-oceano.png) | [Captura](../artifacts/geographic-source/lagoon-shore/after/sin-oceano.png) |

Vegetación: [ribera](../artifacts/geographic-source/lagoon-shore/after/vegetacion.png). Cascadas: [Ferragrís](../artifacts/geographic-source/lagoon-shore/after/ferragris.png), [Velo](../artifacts/geographic-source/lagoon-shore/after/velo.png), [Gemelas](../artifacts/geographic-source/lagoon-shore/after/gemelas.png). Mediciones y errores del navegador en los JSON del mismo directorio.

La distribución nueva cubre la Laguna de las Tres Vertientes. La vegetación submarina profunda de Nácar queda fuera de esta intervención. Los datos originales de la cuenca siguen expresados en coordenadas locales y se transforman mediante `RegionFrame`; no son posiciones del antiguo continente usadas directamente.

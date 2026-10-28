# Geografía técnica de Auralia · v0.2

## Decisión fundacional

Auralia es **una gran isla** con regiones interconectadas por tierra, rodeada de islas menores que permitirán conseguir materiales raros y aprender habilidades. La isla principal seguirá existiendo cuando sumemos ciudades futuras; no habrá que reemplazar la geografía para agregar contenido.

**Escala de trabajo (POC):** aproximadamente 1,42 × 1,13 km de envolvente del terreno principal. No representa el tamaño definitivo del videojuego: cuando el diseño lo justifique, se podrán sumar sectores continentales adicionales y ampliaciones costeras fuera del límite actual.

Las coordenadas son estables: `+X = este`, `+Z = sur`, y la aldea inicial está cerca del origen. En esta versión, la costa se calcula por una función elíptica irregular y un descenso continuo hacia el mar. La cota de agua se sitúa cerca de Y = -0.15. Las montañas, colinas y el lago se incorporan mediante deformaciones continuas; las alturas se calculan sin depender del orden de aparición de los chunks.

## Hitos y coordenadas

| Nombre | X | Z | Contenido implementado |
| --- | ---: | ---: | --- |
| Brisalia | 0 | -23 | Casas, plaza y NPC básicos |
| Claro del Hogar | -29 | 18 | Parcela de construcción persistente |
| Puerto del Arroyo | 33 | 120 | Muelle y primer viaje en bote (transición entre zonas) |
| Lindebrumas | -350 | -285 | Árboles especiales, piedras antiguas y punto de exploración |
| Altapiedra | -275 | -535 | Grúa minera, cobre y punto de exploración |
| Nácar | 245 | -250 | Lago interior, edificaciones preliminares y punto de exploración |
| Altaluz | 200 | -660 | Mirador con estructura monumental y punto de exploración |
| Isla de las Luciérnagas | -210 | 420 | Segunda isla jugable con cristales de chispa |

**Importante:** que una región tenga terreno y un punto de interés visible no significa que su ciudad y sus misiones estén implementadas. Las ciudades son hitos de expansión a desarrollar progresivamente.

## Expansiones marítimas reservadas

- Peñasco del Herrero: al este/sureste; metal raro y nuevas recetas.
- Isla del Cristal Sonoro: al extremo este; recursos resonantes y habilidades sonoras.
- Isla de la Bruma Serena: al oeste; alquimia y secretos.
- Faro Dormido y nuevos archipiélagos: a definir en futuras versiones.

Las islas reservadas figuran en el mapa visual, pero **no son escenas jugables** en v0.2.

## Streaming de terreno y vegetación

- Grilla de **72 × 72 unidades**.
- Radio visual de 4 sectores, con límite circular para reducir sectores activos.
- Mallas generadas únicamente cerca del personaje; tiles fuera de alcance se liberan.
- Vegetación y rocas lejanas generadas con semilla determinista y thin instances.
- Fuente única `sampleMainlandHeight(x,z)` para física simplificada, terreno y geografía.
- Normales del terreno calculadas por gradiente compartido, que evita discontinuidades visuales obvias en los bordes.
- Para edición de la costa, cambiar únicamente `terrainData.ts` y regenerar el SVG del mapa.

## Reglas de crecimiento del mundo

1. No cambiar el origen, ni mover Brisalia ni las construcciones persistidas sin migración.
2. Mantener IDs canónicos de regiones; diferenciar `regionId`, `settlementId` y `chunkKey`.
3. Añadir ciudades por configuración de sector y carga por proximidad, no con un bloque gigante de código dentro de `WorldView`.
4. Pueblos, árboles, minables y NPC deben avanzar hacia streaming propio; la primera versión de streaming solo afecta al relieve y vegetación distante.
5. Reservar corredores terrestres y costeros que admitan nuevas zonas sin crear muros invisibles.
6. Mantener el atlas visual general separado del mapa de coordenadas y del estado real de las expansiones.
7. Las futuras mejoras de altura y costa requieren evaluación de compatibilidad con estructuras guardadas.

## Siguiente update recomendado

**Update 0.3 — asentamientos y streaming de contenido**

Crear `RegionManifest` declarativo; extraer los constructores de casas y NPC desde `WorldView`; introducir persistencia de descubrimientos; caminos adaptados a alturas; primer asentamiento ampliado y optimización de las colisiones.

Antes de empezar 0.3, medir tiempos de render y draw calls de la versión 0.2 en el equipo destino y obtener una prueba manual de todas las zonas desde el mapa de QA.

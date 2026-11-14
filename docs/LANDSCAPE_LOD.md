# Terreno distante y atmósfera

`TerrainStream` genera tres resoluciones de la misma fuente de alturas.
El mapa legado usa `sampleMainlandHeight`; World Studio usa su fuente geográfica.
El nivel lejano del mapa legado se construye al iniciar; el de World Studio
se transmite alrededor del jugador. Ambos sirven de respaldo mientras se generan
los sectores medios y cercanos. El cambio de nivel se hace por grupos de
cuatro hijos completos, para que nunca falte suelo entre cargas.

`terrainTileTopology` mantiene un perímetro común con vértices cada 6 m en el
mapa legado y cada 3 m en World Studio. Solo refina los triángulos del borde: el interior medio
conserva pasos de 18 m. En World Studio el lejano también usa 18 m para
mantener la silueta de las montañas durante el cambio de LOD; el terreno legado
conserva 36 m. Así, las uniones coinciden incluso
cuando el vecino cambia de detalle o sigue pendiente de carga. No se usan
faldones verticales superpuestos, que provocaban líneas negras y no cerraban
todos los desniveles. Las normales y los pesos de material también se calculan
con la misma escala en todos los niveles (diferencias centrales a ±3 m en el
mapa legado y ±1,5 m en World Studio).
La triangulación cercana y la superficie de colisión no cambian.

| Parámetro | Valor | Archivo |
| --- | ---: | --- |
| Radio cercano / tamaño de sector | 252 m / 72 m | `src/world/terrainLod.ts` |
| Radio medio / tamaño de sector | 720 m / 144 m | `src/world/terrainLod.ts` |
| Radio lejano / tamaño de sector | 1700 m / 288 m | `src/world/terrainLod.ts` |
| Subdivisiones interiores cercano / medio / lejano | 12 / 8 / 8 (legado), 24 / 8 / 16 (World Studio) | `src/world/terrainLod.ts` |
| Separación de vértices en todos los bordes | 6 unidades (legado), 3 (World Studio) | `src/world/terrainTileTopology.ts` |
| Presupuesto de generación | 4 ms, hasta 2 sectores por cuadro | `src/world/terrainLod.ts` |
| Distancia del acantilado detallado | 320 m | `src/world/terrainLod.ts` |
| Densidad y color de niebla | 0,00135 / `#b5d6f2` | `src/world/LandscapeAtmosphere.ts` |
| Intensidad de luz directa importada | 0,62 | `src/world/LandscapeAtmosphere.ts` |
| Color multiplicador del acantilado | (0,74; 0,80; 0,69) | `src/world/LandscapeAtmosphere.ts` |

Todos los sectores comparten un solo material. La ruta activa es
`TerrainStream → TerrainBiomeMaterial → BiomeTextureArrays`: fuentes de 1K
con arrays de trabajo de 512 px y seis pesos por vértice (RGBA + UV).
`TerrainMaterialV2` es el fallback para WebGL1, NullEngine, ausencia de
`createImageBitmap` o selección explícita del material legacy.
El shader usa coordenadas globales. Los sectores lejanos no reciben picking
ni colisiones: la física y la altura siguen consultando la geografía canónica.

La niebla es una sola configuración de escena. Los shaders propios de suelo y
césped leen sus valores cada cuadro; los GLB usan la niebla de Babylon. El
acantilado GLB original trae textura metálica y aparece demasiado claro con
sus factores por defecto. Se fija como roca mate, se reduce su luz directa
y se aplica un multiplicador suave de color. La malla distante conserva la
misma textura/material y tiene unas 7.200 caras frente a unas 65.000 del
original. Se puede regenerar con Blender 5.2 mediante
`blender --factory-startup --background --python scripts/generate-cliff-lod.py`.
La malla detallada y la malla de colisión originales siguen intactas.

Los árboles distantes usan cuatro GLB simplificados a partir de
aproximadamente 300–345 m. Su posición y escala provienen de las mismas
colocaciones deterministas que los árboles cercanos. Cada LOD comparte el
material y la textura de su modelo original y no tiene colisión ni picking.
Se regeneran con `blender --factory-startup --background --python
scripts/generate-tree-lods.py`. Las seis especies GLB originales siguen
disponibles y los árboles cercanos usan sus modelos y colisiones originales.

## Brisalia: implantación y assets vigentes

La escena de ejecución es `BrisaliaVillage`, colocada según `brisaliaLayout.ts`:
un ejemplar de cada ID B01–B28. B01–B27 proceden de
`public/assets/buildings/brisalia-rev4/`; B28 usa exclusivamente
`public/assets/buildings/brisalia-castle-rev5/`. El manifiesto Rev4 se conserva
como referencia de origen; su B28 fue sustituido por el manifiesto y GLB Rev5.
No se carga el catálogo de trabajo ni se duplican las casas provisionales.

Los GLB mantienen sus bytes, UV y materiales. La conversión de ejes se realiza
al importar en Babylon. Una escala común de `3.8 / 1.4` calibra los metros de
los prefabs con Santi de 1,40 m; no se reduce el castillo para hacerlo caber.
La huella Rev5 mide aproximadamente 71,26 × 65,03 m y está desplazada 0,885 m
respecto del pivote en el eje de profundidad del mapa. Esa diferencia se incluye
en las exclusiones de vegetación.

Se agrupan piezas por material y, para el castillo, por celdas de 12 m: en la
revisión de navegador, 2.088 primitivas importadas se agrupan en 147 bloques.
Las colisiones de paredes, suelo, techo y cámara consultan la geometría real.
Las hojas de los portones se abren antes de agrupar para dejar accesibles
las entradas. La escalera principal Rev5 tiene ocho contrahuellas y alcanza
1,35 m; la rampa del terreno termina en su descanso. El patio continúa siendo
suelo del mapa, sin un plano añadido. Las terrazas conservan detalle a distancia
para que los cambios de LOD no atraviesen los peldaños.

Los caminos y accesos a las puertas comparten una máscara con el pasto.
Su malla reutiliza vértices y un material con tierra, grava, variación de color
y bordes irregulares con alfa. Se reutilizan texturas existentes; el material
recibe niebla, iluminación y la sombra compartida sin apropiarse de esa textura.
El banco de trabajo y los NPC se reubican junto a la nueva plaza. El desvío
local del río Prado acompaña la implantación ampliada.

Las margaritas, los matorrales y los yuyos de `brisalia-lods/` se distribuyen
de forma determinista alrededor de Brisalia. Cada especie usa sus tres GLB
LOD0/LOD1/LOD2 con histéresis, instancias compartidas, exclusiones de agua,
pendientes y obstáculos, y un límite visible de 120 unidades.

`tests/brisalia-village.browser.mjs` comprueba los 28 IDs únicos, escala,
orientación, separación, materiales PBR Rev5, recorrido físico por el portón
y ausencia de piso de edificio en el patio. La revisión del 14 de noviembre
de 2026 completó el recorrido de entrada en 286 pasos de simulación.

## Diagnóstico

Abrir `/?landscapeDebug=1` muestra sectores activos por nivel, sectores
pendientes, memoria aproximada de geometría, formaciones, árboles, césped,
FPS, draw calls, triángulos y parámetros atmosféricos. Atajos:

- `F`: alternar niebla.
- `G`: comparar el material geológico ajustado con el original.
- `[` y `]`: cambiar densidad de niebla.
- `V`: cambiar color de niebla.
- `0`, `1`, `2`, `3`: mostrar todos los niveles o solo cerca, medio o lejos.

Las cifras de FPS y draw calls dependen de cámara, hardware y carga de la
escena. Para comparar rendimiento, medir en las mismas coordenadas y con el
mismo ángulo de cámara. `npm run test:stream`, `npm run test:vegetation` y
`npm run test:props` cubren continuidad, colocación, materiales compartidos y
colisiones esenciales con NullEngine.
La prueba de terreno verifica todas las parejas de LOD en ambos ejes,
incluyendo coordenadas negativas: posiciones, normales, seis pesos de material,
ausencia de aristas interiores abiertas y cobertura sin triángulos superpuestos.

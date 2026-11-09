# Terreno distante y atmósfera

`TerrainStream` genera tres resoluciones de la misma función canónica
`sampleMainlandHeight`. No existe una segunda geografía. El nivel lejano se
construye una vez al iniciar y permanece como respaldo mientras se generan
los sectores medios y cercanos. El cambio de nivel se hace por grupos de
cuatro hijos completos, para que nunca falte suelo entre cargas.

`terrainTileTopology` mantiene un perímetro común con vértices cada 6 m en
los tres niveles. Solo refina los triángulos del borde: el interior medio
conserva pasos de 18 m y el lejano de 36 m. Así, las uniones coinciden incluso
cuando el vecino cambia de detalle o sigue pendiente de carga. No se usan
faldones verticales superpuestos, que provocaban líneas negras y no cerraban
todos los desniveles. Las normales y los pesos de material también se calculan
con la misma escala en todos los niveles (diferencias centrales a ±3 m).
La triangulación cercana y la superficie de colisión no cambian.

| Parámetro | Valor | Archivo |
| --- | ---: | --- |
| Radio cercano / tamaño de sector | 252 m / 72 m | `src/world/terrainLod.ts` |
| Radio medio / tamaño de sector | 720 m / 144 m | `src/world/terrainLod.ts` |
| Radio lejano / tamaño de sector | 1700 m / 288 m | `src/world/terrainLod.ts` |
| Subdivisiones interiores cercano / medio / lejano | 12 / 8 / 8 | `src/world/terrainLod.ts` |
| Separación de vértices en todos los bordes | 6 m | `src/world/terrainTileTopology.ts` |
| Presupuesto de generación | 4 ms, hasta 2 sectores por cuadro | `src/world/terrainLod.ts` |
| Distancia del acantilado detallado | 320 m | `src/world/terrainLod.ts` |
| Densidad y color de niebla | 0,00135 / `#b5d6f2` | `src/world/LandscapeAtmosphere.ts` |
| Intensidad de luz directa importada | 0,62 | `src/world/LandscapeAtmosphere.ts` |
| Color multiplicador del acantilado | (0,74; 0,80; 0,69) | `src/world/LandscapeAtmosphere.ts` |

Todos los sectores comparten un solo `TerrainMaterial` y sus texturas 1K.
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

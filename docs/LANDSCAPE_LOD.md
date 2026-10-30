# Terreno distante y atmósfera

`TerrainStream` genera tres resoluciones de la misma función canónica
`sampleMainlandHeight`. No existe una segunda geografía. El nivel lejano se
construye una vez al iniciar y permanece como respaldo mientras se generan
los sectores medios y cercanos. El cambio de nivel se hace por grupos de
cuatro hijos completos, para que nunca falte suelo entre cargas. Los bordes
medios y lejanos tienen faldones de 22 m que tapan las uniones entre
resoluciones sin afectar la superficie ni las colisiones.

| Parámetro | Valor | Archivo |
| --- | ---: | --- |
| Radio cercano / tamaño de sector | 252 m / 72 m | `src/world/terrainLod.ts` |
| Radio medio / tamaño de sector | 720 m / 144 m | `src/world/terrainLod.ts` |
| Radio lejano / tamaño de sector | 1700 m / 288 m | `src/world/terrainLod.ts` |
| Muestras por lado cercano / medio / lejano | 12 / 8 / 8 | `src/world/terrainLod.ts` |
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

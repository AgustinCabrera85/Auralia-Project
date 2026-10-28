# AURALIA · POC — assets y cristales recolectables

**Babylon.js + TypeScript + Vite · Mundo abierto fantástico en evolución**

El prototipo conserva recolección, crafting, construcción, NPC, viaje a la Isla de las Luciérnagas y guardado. La isla principal tiene una envolvente de **aproximadamente 4.000 × 3.000 unidades de mundo** (1 unidad = 1 metro), seis biomas, vegetación procedural, cauces, lagos y nuevos puntos de interés. Update 4 integra modelos GLB 1K y cristales recolectables con reaparición persistente. Ver [assets y cristales de Update 4](docs/ASSETS_UPDATE_4.md), [accidentes y lugares de Update 3](docs/GEOGRAFIA_UPDATE_3.md) y [vegetación procedural](docs/VEGETACION_PROCEDURAL.md).

## Ejecución

Requiere **Node 20.17+ (o 22+)**, npm y navegador compatible con WebGL.

```bash
npm install
npm run dev
```

Abrir la dirección indicada por Vite, generalmente `http://localhost:5173/`.

Para comprobar las reglas y generar una nueva versión del mapa desde los mismos datos del terreno:

```bash
npm test
npm run map:terrain
npm run check
npm run build
```

`npm test` incluye reglas, atlas, geografía, streaming de terreno y agua, persistencia de descubrimientos y carga de vegetación con el motor sin ventana de Babylon. `npm run build` compila TypeScript y genera el paquete de producción.

## Cambios respecto de v0.1

| Apartado | Antes | Ahora |
| --- | --- | --- |
| Isla principal | Aproximadamente 206 × 174 unidades de radio antes de costa | 4.000 × 3.000 unidades nominales |
| Movimiento lateral | A/D invertidos | **A izquierda, D derecha respecto a la cámara** |
| Terreno | Una sola malla fija | Sectores de 72 × 72 unidades alrededor del personaje |
| Carga de sectores | Todo activo | Anillo circular; sectores distantes descargados |
| Paisaje | Recorte de un valle | Valle, Ecos, Sierras, Nácar, Cumbres |
| Decoración | Objetos independientes en el entorno | Rocas con thin instances y vegetación GLB decorativa por chunks |
| Agua interior | Depresiones reservadas | Río principal, arroyo, lagos, lagunas y cascada con cauces y superficies por chunk |
| Exploración | Hitos regionales | Seis puntos de interés con descubrimientos persistentes y marcadores en el mapa |
| Mapa | Atlas ilustrado | **Nuevo mapa geográfico generado por la misma configuración que el terreno** + atlas previo |
| Destinos | Brisalia, isla satélite | Brisalia, isla y cuatro hitos de exploración continental |
| Guardado | Inventario, edificios, zona | También coordenadas periódicas; compatible con guardados anteriores |

El tamaño nuevo no equivale a ciudades terminadas: **se amplió la base geográfica** y se conservaron los primeros hitos de las regiones.

## Controles

| Control | Acción |
| --- | --- |
| `W` / ↑ | Caminar hacia delante respecto de la cámara |
| `S` / ↓ | Retroceder |
| `A` / ← | Ir a la izquierda |
| `D` / → | Ir a la derecha |
| `Shift` | Correr |
| Arrastrar ratón | Orbitar cámara |
| Rueda | Zoom |
| `E` | Interactuar / recolectar / viajar |
| `M` | Mapa regional y atlas ilustrado |
| `C` | Crafting |
| `B` | Construcción |
| `R` | Rotar pieza |
| Clic | Colocar pieza cuando esté activa la vista de construcción |
| `Esc` | Cerrar panel o modo construcción |

## Cómo probar la ampliación

1. Caminá por Brisalia y comprobá que A y D se mueven hacia el lado correcto de la pantalla incluso después de orbitar la cámara.
2. Abrí **M → Mapa del terreno jugable**. La marca dorada muestra la posición y en el HUD aparecen bioma, coordenadas y sectores cercanos cargados.
3. Usá los botones «Visitar un hito» para saltar entre el **Bosque de los Ecos**, el **Paso de Altapiedra**, la **Orilla de Nácar** y el **Mirador de Altaluz**. Es una facilidad de testeo, no un sistema de viaje rápido definitivo.
4. Caminá varios cientos de unidades: el terreno y la vegetación se generan determinísticamente según la posición. Los árboles GLB aparecen fuera del centro de Brisalia y se liberan al alejarse.
5. Regresá a Brisalia, probá el taller, el inventario y la parcela. El estado de las construcciones originales se conserva.
6. Buscá el nuevo muelle del estuario (cerca de `X 33 / Z 120`), presioná E y viajá a la Isla de las Luciérnagas.
7. Recargá el navegador para verificar que el inventario y las construcciones persisten y se recupera la última ubicación guardada.
8. Visitá la Cascada del Valle, la Ruina de los Caminos, el Mirador de Altapiedra, la Entrada de Cueva Antigua, el Puente del Arroyo y el Embarcadero de Brisalia. Al acercarte, sus marcadores quedan descubiertos en el mapa regional y persisten tras recargar.

## Jerarquía de mapas

- **Mapa ilustrado original**: referencia narrativa del universo y futuras expansiones; no representa relieve métrico.
- **`docs/Mapa_geografico_auralia_v0.2.svg`**: mapa de trabajo derivado de la configuración geográfica que usa la escena Babylon; debe tratarse como referencia de coordenadas de esta versión.
- **`src/world/terrainData.ts`**: única fuente de verdad del muestreo del terreno, hitos, clasificación de biomas y dimensiones de la isla principal.

El atlas SVG se regenera con `npm run map:terrain` después de modificar `terrainData.ts`. El sprite exportable para el mapa está en `public/assets/mapa-geografico-v0.2.svg`.

## Estructura destacada

```text
src/
  world/
    terrainData.ts       relieve, costa, biomas, hitos y coordenadas
    mapProjection.ts     conversión mundo → mapa
    TerrainStream.ts     creación, descarga y color de terreno por chunks
    geographicFeatures.ts  definiciones y muestreo de cauces, lagos y relieve
    GeographyStream.ts  superficies de agua interior por chunks
    pointsOfInterest.ts  identificadores y coordenadas estables
    PointOfInterestView.ts  geometría temporal de lugares
    vegetationData.ts    distribución determinista y parámetros de densidad
    VegetationSystem.ts  carga GLB, thin instances y colisión de troncos
  game/
    movement.ts          desplazamiento lateral corregido, sin dependencia Babylon
    WorldView.ts         escena, zona, interacciones, cámara y colocación
  domain/                reglas de inventario, crafting y construcción
  persistence/           guardado compatible con v0.1
  ui/Hud.ts              interfaz, dos mapas y teletransporte de QA
scripts/
  create-terrain-map.cjs genera el SVG técnico
  make-map.cjs           generador del atlas conceptual original
public/assets/
  mapa-geografico-v0.2.svg
  mapa-maestro-auralia.png
docs/
  GEOGRAFIA_v0.2.md
  GEOGRAFIA_UPDATE_2.md
  Mapa_geografico_auralia_v0.2.svg
  ...
tests/
  geography.test.cjs    regresión A/D, costa, hitos, chunks, biomas
  vegetation.test.cjs   distribución, importación única y descarga
  geographic-features.test.cjs  cauces, accesos, agua y POI
  domain.test.cjs
  atlas.test.cjs
```

## Qué todavía falta

- Convertir los hitos de Altapiedra, Nácar, Lindebrumas y Altaluz en ciudades, misiones y recursos propios.
- Streaming también para NPC, edificios, interacciones y decoración detallada; hoy se descargan los **chunks de relieve** y se actualizan las thin instances lejanas, pero la infraestructura estática se crea al iniciar.
- LOD de terreno, colisiones físicas completas, navegación marítima continua, animación del agua y caminos con mallas adaptativas.
- Mejorar la cámara en pendientes y cerca de edificios, añadir física/cápsula para el protagonista.
- Definir ciudades adicionales en manifiestos independientes (no dentro de `WorldView.ts`).
- Mejorar tutorial, crafting, construcción y otros sistemas de juego.

**No se introdujo backend ni multijugador.** La edición de Navidad sigue enfocada en una primera aventura individual, construible, guardable y estable.

Ver `docs/GEOGRAFIA_UPDATE_2.md` para la escala actual y `docs/ARQUITECTURA.md` para la estructura del POC.

## Update 5A — rocas individuales

El RockPack de 17 piezas se distribuye por geometría individual en lugar de
replicar el conjunto; los placeholders esféricos de roca desaparecen.
Las piedras y el cobre recolectables de Brisalia reutilizan el mismo GLB.
Ver [Rock Asset Refactor](docs/ROCK_ASSETS_UPDATE_5A.md).

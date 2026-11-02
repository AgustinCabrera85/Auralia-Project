# Geografía jugable

La isla principal ocupa una envolvente nominal de **4.000 × 3.000 m**. El origen está en Brisalia; `+X` apunta al este y `+Z` al sur. El centro geográfico es `(0, -1130)`. La Isla de las Luciérnagas usa una zona local separada.

`src/world/terrainData.ts` define las dimensiones, biomas, hitos y la altura canónica `sampleMainlandHeight(x, z)`. Terreno, apoyos de objetos, movimiento y mapa deben consultar esa misma geografía. `src/world/geographicFeatures.ts` define cauces, lagos, lagunas y otros accidentes; `src/world/geologyData.ts` añade formaciones rocosas. Las coordenadas existentes de Brisalia y las construcciones guardadas deben conservarse o migrarse explícitamente.

El terreno se carga por proximidad con tres niveles de detalle de **72, 144 y 288 m**. Los parámetros vigentes están en `src/world/terrainLod.ts` y su explicación en [Terreno distante y atmósfera](LANDSCAPE_LOD.md). El agua interior se genera en `src/world/GeographyStream.ts`; la geometría de sus superficies depende del mismo muestreo geográfico. El mapa técnico `Mapa_geografico_auralia_v0.2.svg` y el asset `public/assets/mapa-geografico-v0.2.svg` se regeneran con `npm run map:terrain`. El nombre del archivo conserva `v0.2` por compatibilidad; su contenido se deriva de los datos actuales.

## Lugares y descubrimiento

Los IDs, coordenadas y radios de descubrimiento están en `src/world/pointsOfInterest.ts`. Hoy incluye Cascada del Valle, Ruina de los Caminos, Mirador de Altapiedra, Entrada de Cueva Antigua, Puente del Arroyo y Embarcadero de Brisalia. Los descubrimientos se guardan y aparecen en el mapa regional. Para añadir un lugar, agregá allí un ID estable y una posición transitable; si requiere una forma visual nueva, extendé `src/world/PointOfInterestView.ts`.

Los hitos de Lindebrumas, Altapiedra, Nácar y Altaluz representan regiones de expansión; sus ciudades y misiones todavía no están completas. El [atlas conceptual](ATLAS_AURALIA.md) describe su intención narrativa, pero no fija coordenadas ni alturas jugables.

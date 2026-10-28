# Arquitectura del POC · Auralia v0.2

## Flujo de control

```text
src/world/terrainData.ts ──► relieve / costa / biomas / hitos
           │                    │
           ├──► TerrainStream.ts │ ──► chunks 72×72 y vegetación thin-instance
           │                    │
           └──► mapProjection.ts ──► mapa de coordenadas / HUD

src/domain/GameStore.ts ──► inventario / crafting / edificios
           │
           └──► SaveRepository.ts ──► localStorage (compatibilidad v0.1)

src/game/movement.ts ──► ejes relativos a cámara (A/D corregidos)

src/game/WorldView.ts ──► Babylon.js, mundo, interacción y construcción
           │
           └──► src/ui/Hud.ts ──► mapa regional, atlas conceptual y QA
```

## Decisiones que deben preservarse

- `terrainData.ts` es la fuente única para el muestreo continental. El relieve NO depende de `Math.random` ni del orden de carga.
- `TerrainStream` crea/destruye mallas de relieve alrededor del jugador y reconstruye lotes de thin instances al cambiar de sector.
- `WorldView` sigue siendo un controlador POC; habrá que extraer NPC, recursos, edificios, cámara y constructores antes de añadir más asentamientos.
- `movement.ts` no depende de Babylon.js y tiene pruebas de regresión, especialmente para A y D.
- Las estructuras usan coordenadas de mundo locales y tipos, nunca mallas serializadas.
- `SaveGameV1.playerPosition` es **opcional** para que los guardados antiguos sigan cargando; no se renombra la clave del `localStorage`.
- El mapa técnico es un derivado de `terrainData.ts` (regenerable con `npm run map:terrain`). El atlas ilustrado general sigue siendo una referencia artística.

## Riesgos / deuda técnica explícita

1. Las ciudades futuras son miradores, todavía no contenido jugable completo.
2. Se descargan chunks de relieve, pero no todos los objetos estáticos del mundo; debemos incorporar *interest management* para recursos, construcciones y NPC.
3. El sistema de construcción aún sirve solo para una parcela de Brisalia.
4. Las colisiones son aproximadas: no hay física de personaje, navmesh, agua interactiva ni control de altura máxima en pendientes.
5. Las regiones se cargan con el mismo material de terreno por vértice; faltan blends PBR, ríos visuales, máscaras de caminos, texturas y LOD geográfico.
6. La isla secundaria usa todavía malla de terreno fija y cambio de zona instantáneo; debe migrar a definiciones de zonas consistentes antes de sumar islas.
7. La interfaz todavía tiene controles táctiles experimentales.
8. El render de Babylon.js no pudo verificarse en este entorno por falta de acceso al registro de npm. No desplegar sin compilar y probar en el equipo destino.

## Próximo incremento técnico

- `RegionManifest` con `regionId`, `biomeId`, `poi`, `resourceTable`, `npcSpawns`, `settlements`, `travelConnections`.
- `LandmarkStreamingService` y `PropFactory` para no crear todos los objetos al inicio.
- Colisiones y caminos de jugador acordes a relieve.
- LOD geométrico para terrenos lejanos, métricas de FPS/draw calls, perfil bajo para móviles.
- Navegación real por la costa cuando la geografía del archipiélago se estabilice.

Mantener la edición navideña como **single-player offline** antes de añadir servicios online o multijugador.

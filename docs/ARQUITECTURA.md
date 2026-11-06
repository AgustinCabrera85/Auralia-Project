# Arquitectura del POC

`src/main.ts` crea `GameStore`, `WorldView` y `Hud`, y conecta el guardado. `WorldView` coordina la escena Babylon, cámara, movimiento, interacciones y construcción. `GameStore` concentra inventario, recetas, estructuras y progreso; `SaveRepository` serializa el estado en `localStorage`.

## Mundo

- `terrainData.ts` proporciona la altura canónica y los biomas. Las funciones son deterministas para que carga, mapa, colisiones y colocación consulten el mismo terreno.
- `geographicFeatures.ts` y `geologyData.ts` describen agua interior y formaciones geológicas. `GeographyStream.ts` genera las superficies de agua próximas.
- `TerrainStream.ts` carga y descarga niveles de detalle del relieve. `TerrainMaterial.ts` aplica el material compartido. Los parámetros de distancia están en `terrainLod.ts`.
- `VegetationSystem.ts`, `grass/GrassSectorSystem.ts` y `WorldPropSystem.ts` gestionan vegetación, pastizales GLB por sectores y decoración. `assetCatalog.ts` contiene las rutas y propiedades de los demás GLB.
- `pointsOfInterest.ts` conserva IDs y coordenadas de los lugares descubribles. `mapProjection.ts` convierte coordenadas del mundo para el mapa regional.

## Decisiones de compatibilidad

- Las estructuras persistidas guardan datos y coordenadas, nunca mallas Babylon.
- Las coordenadas de Brisalia, los IDs de recursos y lugares y la clave de `localStorage` no deben cambiar sin migración.
- `SaveGameV1` acepta campos opcionales incorporados después de v0.1 para cargar guardados anteriores.
- El SVG técnico se regenera con `npm run map:terrain`; el atlas ilustrado sigue siendo una referencia narrativa separada.

## Límites del POC

Las ciudades futuras aún son hitos de exploración. `WorldView` sigue concentrando varias responsabilidades de escena. Los NPC y parte de la infraestructura estática no tienen el mismo streaming que relieve y decoración. La construcción se limita a la parcela de Brisalia. La física del personaje y la navegación por agua siguen siendo aproximadas. El proyecto es de un solo jugador y guarda el estado localmente.

Ver [Geografía jugable](GEOGRAFIA.md), [Assets del mundo](ASSETS.md) y [Construcción modular](BUILDING_SYSTEM.md) para las reglas de cada sistema.

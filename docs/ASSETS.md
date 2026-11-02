# Assets del mundo

`src/world/assetCatalog.ts` es el catálogo vigente de modelos GLB: ruta, categoría, biomas, escala de referencia, interacción y forma de instanciación. Los archivos están en `public/assets/vegetation/` y `public/assets/world/`. Las rutas de los modelos pueden cambiar al optimizarlos; consultá el catálogo antes de añadir referencias nuevas.

`src/world/VegetationSystem.ts` y `src/world/WorldPropSystem.ts` comparten modelos fuente y generan vegetación y decoración por sectores activos. La colocación se basa en semillas, biomas y exclusiones de agua, caminos, hitos y construcciones. La decoración repetida usa thin instances; los cristales recolectables y los objetos singulares usan instancias individuales. Las reglas y densidades están en `vegetationData.ts` y `worldPropsData.ts`.

El pack de rocas se distribuye por sus **17 piezas individuales**, con selección y tamaños definidos en `src/world/rockPackData.ts`. Los depósitos recolectables de piedra y cobre también reutilizan ese GLB. Sus IDs y la lógica de recolección se conservan en el sistema de recursos. Los cristales registran tiempos de reaparición persistentes mediante `GameStore` y `SaveRepository`.

Para modelos lejanos se usan los GLB simplificados de árboles y acantilados indicados por `TREE_LOD_PATHS` y `CLIFF_LOD_PATH` en el catálogo. La regeneración y los criterios de distancia están en [Terreno distante y atmósfera](LANDSCAPE_LOD.md). La vegetación tiene su detalle en [Vegetación procedural](VEGETACION_PROCEDURAL.md).

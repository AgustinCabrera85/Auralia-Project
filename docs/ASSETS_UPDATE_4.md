# Assets del mundo y cristales · Update 4

## Origen y organización

La fuente externa es `F:\PROYECTO AURALIA\PARA ASSETS`. Los 13 GLB presentes se copiaron sin modificar a `public/assets/world/`. Cada textura embebida de esos archivos mide 1024 × 1024 píxeles. Los cuatro GLB ya integrados permanecen en `public/assets/vegetation/`, sin duplicados. `src/world/assetCatalog.ts` reúne ID, URL, categoría, biomas permitidos, escala de referencia, tipo de interacción y estrategia de instanciación.

```text
public/assets/world/
  vegetation/ Arbolito_sin_hojas.glb, Tronco_1.glb
  rocks/ Formacion_rocosa_1.glb, Pack_rocas_1.glb, Escalon_rocoso.glb,
         Set_Rocas_Rectanculares.glb, Meseta_rocosa_pasto.glb
  cliffs/ Acantilado_2.glb
  crystals/ Cristal_azul_flotante.glb, Cristal_celeste_1.glb, Cristal_de_Fuego.glb
  structures/ Crisol_Herrero.glb
  landmarks/ Isla_flotante_2.glb
```

| Modelo | Biomas de distribución | Uso |
| --- | --- | --- |
| Arbolito_1, Arbolito_2, Arbolito_3 | Valle, Bosque de los Ecos; el tercero también en Nácar | Vegetación decorativa previa |
| plantitas_1 | Valle, Bosque de los Ecos, Nácar | Vegetación decorativa previa |
| Arbolito_sin_hojas | Bosque de los Ecos y Sierras | Vegetación decorativa escasa |
| Tronco_1 | Bosque de los Ecos y Valle | Vegetación decorativa caída |
| Formacion_rocosa_1 | Sierras, Cumbres y Bosque de los Ecos | Roca decorativa |
| Pack_rocas_1 | Valle, Bosque de los Ecos, Nácar y Sierras | Conjunto decorativo de 17 mallas |
| Escalon_rocoso, Set_Rocas_Rectanculares | Sierras y Cumbres | Roca decorativa |
| Meseta_rocosa_pasto | Valle, Nácar y Sierras | Meseta decorativa |
| Acantilado_2 | Sierras, Cumbres y Costa | Roca decorativa grande |
| Cristal_azul_flotante | Bosque de los Ecos y Nácar | Nodo de Chispa |
| Cristal_celeste_1 | Bosque de los Ecos, Nácar y Cumbres | Nodo de 2 Chispas |
| Cristal_de_Fuego | Sierras y Cumbres | Nodo de Cristal ígneo |
| Crisol_Herrero | Brisalia, junto a Mira `(23, -8)` | Equipo decorativo de herrería |
| Isla_flotante_2 | Cumbres, cerca de Altaluz `(580, -1130)` | Hito visual elevado 95 m sobre el suelo |

Las escalas de referencia están en `assetCatalog.ts`. Todos los GLB inspeccionados usan Y vertical y el pivote inferior cerca de Y = 0. Los materiales y texturas del GLB se conservan. La escala final varía ±20 % en props y ±16 % en vegetación. La isla flotante y los cristales tienen elevación intencional.

## Distribución y rendimiento

`vegetationData.ts` y el `VegetationSystem` existente incorporan el árbol sin hojas y el tronco. `worldPropsData.ts` define las probabilidades por bioma, semillas, límites de densidad, pendiente, agua, caminos y construcciones. `WorldPropSystem.ts` utiliza las mismas celdas activas de `TerrainStream`: genera como máximo un chunk por frame, libera las instancias al alejarse y conserva las mallas fuente compartidas. La decoración usa thin instances. El pack de rocas mantiene sus 17 mallas originales. Los cristales, el crisol y la isla usan geometría compartida con visuales individuales. No se activan colisiones de triángulos; las rocas grandes y el crisol usan radios simples.

Parámetros principales: `VEGETATION_CONFIG` (semilla, candidatos, escala, distancia de árboles y plantas), `PROP_CONFIG` (semilla `43179`, candidatos por especie, distancia de `3` chunks, variación, límite de caminos y reaparición de `180000` ms) y las probabilidades `DENSITY` de `worldPropsData.ts`. Las coordenadas fijas de tres depósitos especiales y de los dos objetos singulares están en `FIXED_CRYSTALS` y `SPECIAL_ASSETS`.

## Recolección y guardado

Cada cristal tiene un ID estable derivado de especie, chunk e índice; los tres depósitos especiales tienen IDs explícitos. La interacción cercana muestra «E · Recolectar», actualiza el inventario, notifica la cantidad y produce un destello breve. Todos flotan y giran suavemente, con un halo de material emisivo compartido por especie. No se crea una luz dinámica por cristal. La decoración no se puede recolectar.

`GameStore.collectResourceNode` registra la cantidad y el instante de reaparición en una sola escritura. `resourceRespawns` es opcional en los guardados v1: `SaveRepository` completa el campo y el nuevo recurso `fireCrystal` sin borrar las construcciones ni cambiar la clave de `localStorage`. El agotamiento sigue vigente al descargar y volver a cargar un chunk o al reiniciar el juego. Las recetas existentes permanecen intactas.

## Límites

El crisol es visual y todavía no añade recetas de herrería. La isla flotante es un hito distante sin viaje ni misión. Los cristales carecen de física de caída; las rocas usan colisionadores circulares aproximados. La inspección automatizada verificó GLB, materiales, texturas, orientación y alturas. Las capturas de Chrome verificaron árboles, troncos, rocas, cristales y el crisol en bosque, sierras, Nácar y Brisalia; la recolección azul también se probó en pantalla. La isla flotante cargó con su modelo y material, pero no entró en las capturas con la cámara estándar, por lo que su composición visual sigue pendiente.

# Paisajes y superficies de Auralia

Implementación del 8 de noviembre de 2026. Amplía el piloto de Brisalia descrito en [PILOTO_VALLE_FAROLES.md](PILOTO_VALLE_FAROLES.md). El tamaño definitivo del mundo continúa abierto; este cambio trabaja sobre las coordenadas actuales.

## Resultado jugable

- Brisalia queda encajada entre lomas, una meseta elevada y montañas visibles desde el pueblo. La plataforma de la meseta pasa de 56 a 82 m; sus dos accesos tienen nuevos perfiles transitables.
- Nueve formas de relieve grandes definen sierras occidentales, agujas del Amanecer, un macizo alpino, el Crisol con depresión de caldera, mesas del Ocaso, escarpes malditos, una pared selvática y colinas al sur. Las elevaciones nominales añadidas van de 62 a 420 m; las reservas de caminos, agua y lugares existentes atenúan esas alturas.
- El terreno cambia gradualmente entre pradera, suelo fértil, hojarasca, barro, estepa, grava, arena, arcilla roja, basalto, suelo maldito y selva. Las laderas tienen proyección de roca en tres ejes y las cumbres alpinas acumulan nieve por altura.
- Los árboles decorativos verdes del sistema principal son un 62,5 % más grandes; los secos, un 50 %. Los árboles procedurales de la expansión aumentan un 40 %. Las ubicaciones manuales, el bosque ilustrado específico y los árboles de recursos mantienen su diseño anterior.
- Se reducen los candidatos de árboles de 25 a 14 por sector. La distribución sigue siendo determinista, con instancias y modelos LOD compartidos; desierto, basalto y tierras malditas reciben menos vegetación. Se omite el pasto prehorneado en pendientes demasiado fuertes.

## Dónde verlo

Coordenadas del juego, con norte hacia Z negativo. Para apreciar la escala conviene salir del centro de Brisalia hacia la meseta y continuar al bosque.

| Lugar | X, Z aproximados | Cambio visible |
| --- | --- | --- |
| Brisalia | 1, 10 | Lomas y montañas cerrando el horizonte |
| Entrada al ascenso | -142, -92 | Camino principal a la meseta |
| Paso de los cerezos | -165, -170 | Segundo acceso a la meseta |
| Plataforma alta | -270, -95 | Vista sobre el valle |
| Bosque de los Ecos | -380, -320 | Árboles mayores, suelo forestal y escarpes |
| Nácar | 230, -240 | Orillas de barro y humedal |
| Mesas del Ocaso | -1330, -1690 | Arena y arcilla roja sobre mesetas |
| Crisol | -180, -1640 | Macizo volcánico y basalto |
| Tierras Malditas | 1040, -1860 | Superficie oscura y escarpes |
| Selva | 1360, -660 | Superficie húmeda y pared de cascadas |

Las regiones nuevas tienen una primera base de terreno y materiales. Sus poblados, fauna, templos, cuevas, efectos volcánicos y decoración específica todavía requieren desarrollo; el atlas completo no está terminado.

## Texturas y presupuesto de memoria

Se incorporaron los 14 pares de albedo y normal del paquete `Auralia_Biomes_1K_Completo`, conservando los originales de 1024 × 1024 y su manifiesto bajo `public/assets/terrain/biomes/`. La carpeta de origen no se modifica.

En WebGL2 se cargan copias de trabajo de 512 × 512 en dos arrays compartidos: 14 capas nuevas más roca, nieve y lava anteriores. Son dos samplers para todo el terreno, sin copias por sector. El presupuesto RGBA8 estimado, incluyendo mipmaps, es **45,33 MiB de GPU**; los dos buffers de restauración de contexto suman **34 MiB de CPU**. A esto se añaden recursos transitorios de descarga y decodificación. Los bitmaps se cierran después de cada imagen y la decodificación es secuencial.

Es un presupuesto del material, no una medición de la memoria total de Chrome. Tampoco demuestra por sí mismo una mejora de FPS. Se mantienen la resolución geométrica y la distancia de streaming existentes.

Las normales del paquete están estimadas desde luminancia; se usan con intensidad moderada y se atenúan a distancia. No son mapas de altura ni modifican colisiones. WebGL1 mantiene el material anterior. Para comparar en WebGL2 puede usarse `?terrainMaterials=legacy`.

## Verificación

- TypeScript y compilación de producción comprobados. La compilación mantiene la advertencia conocida del bundle principal grande.
- Suites del proyecto ejecutadas: clima, cielo, resolución, Santi, dominio, construcción, atlas, geografía, streaming, pasto, vegetación, bosque, expansión, telemetría, shaders de follaje, accidentes geográficos, agua, props, geología y traversal. Nueva suite `test:biomes` para los 14 pares, presupuesto, transiciones, relieve y densidad.
- Las pruebas conservan las alturas históricas de construcciones, lugares protegidos, caminos y agua. Los dos puntos de terreno anteriormente vacíos que ahora reciben montañas se verifican como relieve elevado.
- Los ocho recorridos automatizados de subida/bajada, caminando/corriendo por ambos accesos, pasan. En Chrome, el controlador real completó las subidas principal y alternativa en 28,7 s y 12,0 s, sin atascarse.
- Se corrigió una interferencia detectada entre el nuevo relieve y la ribera superior: se reserva todo el corredor de hasta 90 m utilizado por el agua visible, además del cauce de juego.
- El shader WebGL2 compiló y cargó sus 17 capas sin errores. También se comprobó la compilación del material anterior mediante el parámetro de comparación.
- Comparación determinista sobre los mismos 391 sectores, terreno y máscaras: **320 → 201 árboles**, un **37,2 % menos**. La suma del área aproximada de copas crece **1,63 veces**. Esa suma es una métrica de tamaño, no una medida de cobertura de pantalla ni una garantía de FPS.

## Capturas de revisión

Capturas del motor real con Santi y hora diurna fija, usando una escena de revisión sin guardar cambios en la partida del usuario.

![Brisalia y su nuevo horizonte](evidence/landscape-biomes/brisalia.png)

![Bosque de los Ecos con suelo forestal y árboles mayores](evidence/landscape-biomes/bosque.png)

![Nácar y sus orillas de humedal](evidence/landscape-biomes/nacar.png)

## Puntos de implementación

- `landscapeRelief.ts`: formas grandes y protección de la geografía existente; se integra en el muestreador canónico que comparten terreno y colisiones.
- `regionalReliefData.ts`: versión 2 del piloto y perfiles de los dos accesos.
- `landscapeRegions.ts`: máscaras continuas de materiales, vegetación y nombres visibles; conserva los seis IDs persistentes anteriores.
- `BiomeMaterialCatalog.ts`, `BiomeTextureArrays.ts` y `TerrainBiomeMaterial.ts`: catálogo, carga compartida y mezcla de superficies.
- `vegetationData.ts`, `expansionBiomeData.ts` y `GrassSectorSystem.ts`: escala, densidad y adecuación a pendientes.

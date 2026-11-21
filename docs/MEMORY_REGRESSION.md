# Brisalia: corrección de la regresión de memoria

Validación del 21 de noviembre de 2026, sobre el proyecto abierto y Babylon 9.32.0.

## Causa y cambio aplicado

El cargador glTF elevaba `maxSimultaneousLights` de **todos** los materiales de la escena al número total de luces después de cada importación. Con los faroles, ese límite llegaba a 38, incluso contando luces apagadas o restringidas a otras casas. La carga progresiva conservaba cientos de variantes de shaders. El snapshot inicial contenía unos 272 MB de strings del fragment shader PBR y otros 40 MB del vertex shader PBR.

`SceneLightBudget.ts` restaura los presupuestos al terminar cada importación, antes del siguiente render: 4 por defecto, 5 para fachadas y faroles, 6 para Santi y 8 en el interior ígneo. Las casas necesitan cinco porque sol, luna, ambiente y forja ocupan ranuras aunque alguna intensidad sea cero. Se conserva la iluminación de su farol. No se modifica Babylon en `node_modules` ni se borra una caché de shaders que siga en uso.

La segunda causa era el almacenamiento de imágenes en GPU: comprimir archivos en WebP no significa que permanezcan comprimidos al renderizar. Se derivaron **66 modelos y 146 imágenes compartidas KTX2/UASTC** de los assets finales. En la RTX 3090 de pruebas se transcodifican a BC7; en equipos con ASTC se usa ASTC. Si no existe ninguna de esas capacidades, se conserva la ruta original PNG/WebP. Los decodificadores son locales, con dos workers.

Se mantienen resolución, mipmaps, mapas PBR, canales alfa, UV, transformaciones, colisiones y animaciones. Cuatro imágenes requieren dimensiones múltiplo de cuatro: la flor pasa de 341 a 344 píxeles de ancho y las tres maderas de 1254 a 1256. Es un remuestreo de hasta tres píxeles, sin reducir resolución. UASTC es compresión con pérdida; se conserva la fuente original para regeneración y fallback.

Los modelos derivados usan un único directorio de texturas; los glTF Rev3 reutilizan los binarios originales. La selección se realiza en los cargadores y no modifica IDs ni el catálogo de assets originales. Los buffers codificados se comparten entre wrappers sin eliminar la fuente necesaria para restaurar el contexto.

Documentación de referencia: [KTX2 en Babylon](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression/).

## Mediciones reproducibles

Chrome aislado, WebGL2/ANGLE D3D11, NVIDIA RTX 3090. Sesión nueva, sin tocar el perfil ni la partida del usuario. La medición usa `Tracing.requestMemoryDump` de CDP con `deterministic:true` y registra la huella privada nativa del renderizador y del proceso GPU por separado. **No equivale al número que muestra Chrome al pasar el cursor sobre la pestaña**, ni es una medición del pico instantáneo entre muestras. El proceso GPU incluye asignaciones del driver. Se usan MiB, no MB decimales.

| Muestra | Renderizador MiB | Proceso GPU MiB | Suma MiB |
|---|---:|---:|---:|
| Inicial, antes de estas correcciones | 1123,1 | 1686,9 | 2810,0 |
| Versión final, carga limpia | 781,5 | 912,2 | 1693,7 |
| Después del recorrido 1 | 808,0 | 994,4 | 1802,4 |
| Después del recorrido 2 | 790,7 | 995,2 | 1785,9 |
| Después del recorrido 3 | 788,6 | 997,7 | 1786,3 |
| Exterior, después de las tres vueltas | 794,3 | 995,0 | 1789,3 |

La carga limpia baja aproximadamente **40 %** en la suma medida. El presupuesto estimado de imágenes GPU baja de unos **957 a 352 MiB**. La estimación final cuenta bloques BC7, mipmaps, cubemaps y arrays; es distinta de la memoria del proceso GPU completo.

El recorrido visita Brisalia de día, una posición exterior a más de un kilómetro y Brisalia de noche, con giro completo de cámara. Tras el calentamiento, las vueltas 2 y 3 repiten **196 texturas**, **120 efectos** y los mismos recuentos de geometrías en cada ubicación (1411 en aldea, 1345 fuera). El renderizador no muestra crecimiento entre esas vueltas. Esto es una prueba acotada de tres recorridos, no una garantía para sesiones de horas o todos los reinos.

Los archivos `artifacts/memory-regression/final-*-process.json` contienen las mediciones nativas. `final-route-*.json` registra recuentos y heap JavaScript sin forzar GC en cada etapa. El heap JavaScript por sí solo no representa el consumo completo.

## Validación

- `npm run build`: correcto; persiste la advertencia de Vite sobre chunks mayores de 500 kB.
- `npm run test:light-budget`: importaciones glTF reales concurrentes, luces desactivadas, presupuestos explícitos y aislamiento entre escenas.
- Pruebas de wayfinding y de buffers compartidos: correctas.
- `python tests/gpu-assets.test.py`: 66 modelos, 18096 vistas binarias de geometría/animación idénticas, 146 imágenes con mipmaps y alineación válida.
- Prueba Rev3: 27 IDs, 62 imágenes originales compartidas, PBR, transparencias y URLs restringidas correctos.
- Auditoría de la escena real: 28 edificios incluyendo el castillo existente, transformaciones e interacciones conservadas, 27 faroles, encendido nocturno y apagado a distancia.
- Restauración forzada de contexto WebGL: recupera las 150 imágenes residentes, incluidas las 139 comprimidas, sin errores GL ni solicitudes externas de decodificación. El motor registra un render target adicional después de restaurar (196 a 197 texturas internas); no se atribuye esa diferencia a imágenes duplicadas.
- Comparación de compresión: las 146 imágenes se decodifican; `texture-quality.json` conserva PSNR y diferencia de máscaras alfa. El alfa de los mapas de datos no representa transparencia visual.

Capturas reales: [conjunto y fachada B19](../artifacts/memory-regression/conjunto.png), [entrada B19 de noche](../artifacts/memory-regression/b19-puerta.png), [jardinera B25](../artifacts/memory-regression/b25-jardinera.png). La cámara de revisión se mueve independientemente del jugador; el HUD puede seguir mostrando la región del jugador.

## Archivos y reproducción

- `src/world/SceneLightBudget.ts`, `GpuAssets.ts`, `gpuAssetManifest.ts`: política de luces y selección del paquete GPU.
- Integración: `WorldView`, `BrisaliaVillage`, `BrisaliaEntranceLanterns`, `IgneousRealm`, `WayfindingSystem`, `VegetationSystem`, `WorldPropSystem`, `AuthoredAssets`, `SantiCharacter` y `DogoCompanion`.
- `public/assets/gpu/`: modelos derivados, imágenes compartidas y manifiesto. `public/assets/ktx2/`: decodificadores locales y licencias.
- `scripts/build-gpu-textures.py`: regeneración con Python/Pillow y Khronos `toktx` 4.4.2; usa `artifacts/memory-regression/texture-list.json` como inventario de entradas.
- `scripts/memory-audit.browser.js`, `memory-route.browser.js`, `memory-context.browser.js` y `memory-process.mjs`: mediciones y validación de restauración en Chrome QA, puerto 9228.

Ejemplo: `node scripts/check-abilities.mjs --start --eval=scripts/memory-audit.browser.js --out=memory-regression --report=measurement`, seguido de `node scripts/memory-process.mjs measurement`. La regeneración de assets requiere `python scripts/build-gpu-textures.py --toktx <ruta-a-toktx.exe>`.

## Límites y siguiente nivel de optimización

No se afirma haber recuperado un total de 400–800 MB: el proceso GPU sigue ocupando aproximadamente 1 GiB durante el recorrido. Las imágenes y plantillas compartidas siguen residentes fuera de Brisalia, aunque el terreno y las instancias se transmiten por sectores. Un siguiente presupuesto más bajo requiere cargar y descargar paquetes de región, además del streaming actual de geometría; necesita manejar referencias y viajes de regreso. El fallback sin BC7/ASTC conserva mayor consumo de texturas. No se ha medido una mejora de FPS con un benchmark controlado en esta entrega.

La estrategia aplicada mantiene el renderizado actual con luces acotadas, texturas comprimidas en GPU y reutilización de recursos; conserva el instancing y LOD existentes. Cambiar a deferred o a otra API gráfica por sí solo no resolvería las asignaciones de imágenes y variantes detectadas aquí.

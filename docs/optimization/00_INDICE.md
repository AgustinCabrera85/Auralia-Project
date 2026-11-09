# Auralia · Programa técnico de optimización

> Versión documental 1.0 · Base `main` `b511d35` · 2026-11-09. Dossier para mantener dentro de `docs/optimization/`.

## 1. Objetivo y filosofía

Optimizar **CPU, GPU, memoria, latencia de carga, estabilidad temporal y tamaño de descarga** manteniendo las invariantes de exploración, construcción, guardado, nado, cámara, vegetación, animaciones de Santi y continuidad del mundo. Se prioriza **eliminar trabajo innecesario** antes de introducir complejidad (más hilos, compute shaders, sistemas adicionales o degradación gráfica).

La documentación no ordena implementar las técnicas por popularidad. Cada técnica está sujeta a una hipótesis falsable, una línea base y una puerta de decisión. Se conserva lo que ya funciona.

## 2. Estado de revisión

**Hechos verificados estáticamente:** árbol `main` y último commit, `package.json`, README y documentos de arquitectura/física/vegetación/agua, archivos clave `src/game`, `src/world` y `src/physics`, pruebas de física y streaming. **No verificado por ejecución:** TypeScript, Vite, navegador, FPS, memoria GPU, compatibilidad de los nuevos shaders y datos locales de edición. **No inspeccionado exhaustivamente:** todos los assets binarios, archivos de la computadora local, mundo editable, rendimiento en múltiples GPUs.

### Bloqueos de Fase 0

1. El árbol del commit carece de `src/world/editor/` aunque existen importaciones desde `WorldView`, `LagoonSystem`, `GrassSectorSystem` y `GrassSectorBake`; no se puede garantizar compilación ni comportamiento de los datos editables. La primera tarea es recuperar esas fuentes auténticas y constatar su estado de git, no crear stubs.
2. `src/world/TerrainStream.ts` desestructura `skirtDepth` de `TERRAIN_LOD_CONFIG`; `src/world/terrainLod.ts` no define esa propiedad y `src/world/terrainTileTopology.ts` contiene otro algoritmo de perímetro. Corregir de forma coherente con continuidad y tests, no agregando una constante cosmética.
3. `docs/LANDSCAPE_LOD.md` describe perímetros de 6 m sin faldones, mientras la implementación del `TerrainStream` leída usa faldones y `tests/terrain-stream.test.cjs` comprueba la ruta antigua. Reconciliar código, pruebas y documentación.
4. `src/world/materials/TerrainBiomeMaterial.ts` y `BiomeTextureArrays.ts` parecen una vía nueva, pero `TerrainStream.ts` importa `./materials/TerrainMaterial` y el test clásico espera seis texturas. Verificar cuál es la ruta **activa** antes de optimizar materiales.

## 3. Orden de lectura

1. `01_AUDITORIA_Y_PRIORIZACION.md` — qué existe y dónde.
2. `02_ARQUITECTURA_Y_TECNICAS.md` — por qué y cómo funciona cada técnica.
3. `03_PROCEDIMIENTO_IMPLEMENTACION.md` — acciones precisas por fase.
4. `05_MATRIZ_DE_VALIDACION.md` — cómo demostrar resultados y detectar regresiones.
5. `04_INSTRUCCION_MAESTRA_CODEX.md` — orden para ejecución por Codex.

## 4. Reglas no negociables

- **La física de Santi y sus AnimationGroups/NLA no se sustituyen.** El movimiento secundario tiene autoridad únicamente sobre entidades secundarias.
- **El terreno canónico es única fuente de verdad.** No alterar las coordenadas persistidas ni las reglas de guardado para acelerar renderizado.
- **El pasto horneado no se vuelve a dispersar por frame.** La matriz de cada mata es estable; el shader anima las hojas, no su posición en el mundo.
- **Conservar texturas fuente 1K** salvo pedido explícito. Compresión GPU, mipmaps o working sets menores se miden por separado.
- **Proteger interacción y recursos.** Cristales, materiales, reaparición y objetos recolectables mantienen ID y estados persistentes.
- **No optimizar borrando escenas ni desactivando colisiones esenciales.** LOD y culling no pueden provocar pérdidas de suelo o colisiones del jugador.
- **No asumir mejoras.** Números medidos con una misma escena, cámara, resolución, calidad, dispositivo y duración, con al menos tres repeticiones.
- **No crear nuevas ramas**, no añadir dependencias pesadas sin justificar y nunca reescribir suites para esconder fallos previos.
- **No afirmar pruebas ejecutadas** si no existen resultados registrados por el propio comando correspondiente.

## 5. Referencias del repositorio y fuentes

- [Repositorio Auralia, commit fijado](https://github.com/AgustinCabrera85/Auralia-Project/tree/b511d35e96a4d500deeadc8bb61b6e6f27b7864e)
- [Física secundaria existente](https://github.com/AgustinCabrera85/Auralia-Project/blob/b511d35e96a4d500deeadc8bb61b6e6f27b7864e/docs/FISICA_SECUNDARIA.md)
- [LOD de terreno](https://github.com/AgustinCabrera85/Auralia-Project/blob/b511d35e96a4d500deeadc8bb61b6e6f27b7864e/docs/LANDSCAPE_LOD.md)
- [Pasto horneado](https://github.com/AgustinCabrera85/Auralia-Project/blob/b511d35e96a4d500deeadc8bb61b6e6f27b7864e/docs/GRASS_FIELD.md)
- [Laguna y vertientes](https://github.com/AgustinCabrera85/Auralia-Project/blob/b511d35e96a4d500deeadc8bb61b6e6f27b7864e/docs/LAGUNA_Y_VERTIENTES.md)
- [Documentación Babylon.js — rendimiento](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/)
- [Babylon.js — GPU particles](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/gpu_particles)
- [Babylon.js — compute shaders](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader/)

# Parpadeo al avanzar sumergido en ríos

21 de noviembre de 2026. La pasada de profundidad de la superficie estaba en `scene.customRenderTargets`. Babylon la ejecuta antes de evaluar las mallas visibles de la cámara actual; por eso filtraba los sectores del río usando la lista del fotograma anterior. La profundidad opaca ya usaba la lista actual. Al entrar un sector en cámara, la absorción podía cambiar bruscamente durante un fotograma.

`WaterOptics` registra ahora esa misma textura en `camera.customRenderTargets`, después de evaluar la visibilidad actual, junto con las pasadas de esa cámara. Se retira al salir del agua. No añade otra textura ni otra pasada, ni modifica alturas, corrientes, controles o la paleta submarina.

`tests/water-optics-motion.browser.mjs` reproduce ocho entradas de un sector de río en cámara, con el observador sumergido y un fondo de color constante. Antes: primer fotograma RGB `[33,90,75]`, siguiente `[101,112,79]`, salto máximo de 68. Después: ambos `[101,112,79]`, salto máximo 0. El defecto se reproducía en las ocho entradas y las ocho pasan tras la corrección.

`scripts/underwater-swim.browser.js` comprobó el recorrido real: 360 fotogramas nadando sumergido y 344 comparaciones entre los sectores visibles y los de la pasada de interfaz. Hasta 37 sectores visibles, cero diferencias de fotograma. Esta comprobación verifica la sincronización; no certifica todos los posibles artefactos en cada río.

También pasaron las regresiones GPU de línea de agua, superficie finita, agua distante, pendiente y color submarino, incluida la recuperación del color y reutilización de recursos al salir. `npm run check` correcto. Compilación de producción registrada en `artifacts/underwater-flicker/build.log`.

Resultados: `artifacts/underwater-flicker/motion-after.json`, `regressions.json` y `swim.json`. La prueba GPU usa un lienzo de 256 × 256 y el recorrido real el navegador de QA a 1920 × 1080. No se midió rendimiento en una GTX 1060.

# Lluvia v1 integrada

Fuente: `F:/PROYECTO AURALIA/PARA ASSETS/Para FXs/Auralia_FX_Lluvia_v1`. Integración del 21 de noviembre de 2026.

Se reemplazó RainField por RainFX dentro de Precipitation. Una instancia por escena, actualizada una vez después de resolver la cámara; el clima existente suministra intensidad, viento y brillo. Intensidad 0–1 con transiciones de 1,5 segundos. La opción de gráficos Rendimiento usa low (2.400 gotas/360 impactos); las demás usan medium (5.200/800). Cambiar de calidad libera la instancia anterior. La nieve conserva su sistema.

El sonido procedural de la vista previa se incorporó en RainAudio: un bucle mono de tres segundos, filtrado a 6.200 Hz, sin archivos externos. Se habilita con la primera tecla o pulsación y su volumen sigue la intensidad. Pérdida de foco, pausa e interiores lo silencian. Se liberan el contexto y los listeners al cerrar el mundo.

El adaptador usa coordenadas mundiales y devuelve el máximo entre terreno cargado, agua, puentes, senderos y cubiertas. Brisalia indexa referencias a sus mallas sólidas en celdas de 16 m; consulta solamente candidatos locales, sin duplicar sus triángulos. Construcciones del jugador reutilizan buildingFloorAt. El caché se invalida al cambiar documentos de edición, edificios, construcciones y al terminar el streaming; los viajes lo reinician. Zonas sin cargar devuelven null.

Se conservan los materiales del agua. Las ondas del FX se superponen a esa superficie. No se agregaron controles permanentes, otro sistema de clima, luces ni postprocesos.

## Comprobación

- `tests/rain-fx.test.mjs`: tres calidades, presupuesto acotado de consultas, buffers estáticos, intensidad, pausa, reset, liberación y ciclo del audio. `npm run test:climate` y `npm run build`: correctos; el build conserva la advertencia existente sobre chunks grandes.
- `scripts/rain-v1.browser.js`: escena real a 1920 × 1080, arranque y fin suaves, intensidad de lluvia aproximadamente 0,68 y tormenta 1, pausa, sin segunda capa de lluvia y regiones descargadas. B19: altura de cubierta 32,0573; 81 comparaciones del índice con la geometría coinciden.
- Cambio low/medium: se mantienen dos mallas y una textura. Caché medium de 65 × 65 con 128 consultas por frame. CPU mediana 0 ms, percentil 95 de 4,9 ms y máximo 11,2 ms en la muestra de 290 actualizaciones, que incluye reconstrucciones. No son FPS globales ni mediciones en GTX 1060.
- Audio real en Chrome: contexto running tras una tecla, señal RMS aproximadamente 0,0295, ganancia exterior 0,13 y ganancia pausada 0. También se verificaron ondas sobre el lago Tres Vertientes y lectura nocturna.

Límites del módulo: una altura por columna, celda de aproximadamente 1 m, alturas entre −256 y 768 m. Con este presupuesto el llenado inicial medium necesita 34 frames; empieza oculto hasta completarlo. Techos muy estrechos tienen la tolerancia de la celda y las ondas horizontales pueden cruzar pendientes fuertes. No se afirma validación prolongada en vuelo ni en todas las islas o hardware.

Resultados en `artifacts/rain-v1/`: build.log, integration.json, audio.json, roof.json, water.json y lifecycle.json. Capturas: [B19](../artifacts/rain-v1/roof-b19.png), [agua](../artifacts/rain-v1/water.png) y [noche](../artifacts/rain-v1/water-night.png).

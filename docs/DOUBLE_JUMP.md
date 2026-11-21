# Doble salto: impulso y FX v2.1

Actualizado el 21 de noviembre de 2026.

El segundo salto con Espacio conserva la velocidad vertical aprobada de 13,5, frente a 9,2 del salto inicial. Con dirección, el impulso horizontal es 36 durante 0,32 segundos. Sin dirección, el impulso es vertical. El salto inicial y la patada aérea Q mantienen sus valores. La prueba real mide 3,797 unidades adicionales de subida desde el segundo impulso; un tercer salto se rechaza y el aterrizaje recupera ambos.

## Efecto integrado

`src/game/SantiDoubleJumpFX.js` y su declaración TypeScript son copias exactas del paquete `Auralia_FX_Doble_Salto_v2_1` facilitado por el usuario. Sustituyen al anterior `DoubleJumpTrail.ts`. `WorldView.ts` crea una instancia con intensidad 0,9 y escala 1, prepara sus shaders al cargar y la activa una sola vez cuando el controlador acepta el segundo Espacio.

Tres ondas circulares secuenciales, cintas de viento y motas suaves permanecen en el punto mundial de despegue. El efecto dura 0,66 segundos. Se actualiza una vez por frame y se reinicia al perder el foco, pausar, cambiar de zona o teletransportarse. Al destruir la escena libera sus recursos. No modifica física, animación de Santi, Q, desenfoque de velocidad ni óptica del agua.

La reserva fija tiene tres efectos simultáneos: seis mallas, tres emisores de motas y una máscara radial de 1024 × 1024 compartida. Límite de 72 motas y nueve llamadas de dibujo si se ocupan las tres plazas; un salto normal usa una plaza. Repetir saltos reutiliza esos recursos. Esta versión sí incluye esa textura y esas motas del paquete original; no debe describirse como un efecto sin partículas.

## Comprobaciones

- `npm run test:traversal`: impulso, dirección, aterrizaje, rechazo de tercer salto, techos y patada Q correctos.
- `scripts/double-jump.browser.js`: integración en la escena real, primer salto sin FX, segundo salto con un solo efecto, tecla sostenida sin duplicación, anclaje mundial, Q compatible, pausa/foco/zona y liberación correctos. Nueve disparos seguidos mantienen constantes mallas, texturas y emisores.
- `scripts/visual-fx-occlusion.browser.js`: prueba de píxeles a 1920 × 1080; cero píxeles del efecto atraviesan una superficie opaca. Al retirar la superficie, el control positivo muestra 25.172 píxeles del efecto.
- Capturas revisadas de [día](../artifacts/visual-fx/jump-day.png) y [noche](../artifacts/visual-fx/jump-night.png).
- Resultados: `artifacts/visual-fx/jump-v21.json` y `occlusion.json`.

La medición de recursos de la prueba incluye todos los wrappers de textura de la escena en el campo `resources.textures`; no representa 951 imágenes únicas del FX ni memoria GPU.

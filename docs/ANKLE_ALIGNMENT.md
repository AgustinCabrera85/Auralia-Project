# Tobillo del pie adelantado de Santi

21 de noviembre de 2026. El giro visible estaba en la postura `Idle (1)`, antes del ajuste de apoyo. En el Reino Ígneo se midieron aproximadamente 16,38° hacia adentro respecto al torso; al desactivar el apoyo, el giro persistía.

`SantiCharacter.alignIdleAnkle` alinea el pie adelantado con la dirección visible del torso cuando apunta hacia adentro. Solo rota el tobillo, conservando su pivote y la pose de la tibia y la rodilla. Sigue el peso de mezcla de la postura de reposo. No actúa durante salto, nado, acciones ni poderes, y mantiene la postura exterior del pie trasero. El apoyo al terreno se aplica después.

`GroundFootPlacement.solve` también restaura la orientación completa del tobillo al resolver la pierna. Antes alineaba dos ejes sucesivamente; ahora recompone la rotación local respecto al nuevo padre. Este error era pequeño (máximo 0,0737° en la prueba), por lo que no explicaba por sí solo el giro visible. Tras la corrección, el error máximo fue 0,000183°.

Verificación: `npm run test:santi`, `npm run test:feet` y `npm run build` correctos. Se probaron tres orientaciones del personaje, varias muestras de reposo, caminar y subir escaleras, los rigs reales de Santi y Dogo, pendientes y escalones a 30/60/144 Hz. Las pruebas confirman que el pivote del tobillo y la rotación de la tibia permanecen iguales durante la corrección de reposo.

En la escena real, el giro medido pasó de 16,3837° a aproximadamente 0°. Se comprobó además el apoyo de ambos pies en escalones separados por 0,4886 unidades, con error de altura inferior a 0,00003. Esto corrige la postura de reposo mostrada; no reemplaza las animaciones de locomoción.

Capturas: [antes](../artifacts/ankle/idle-before.png) y [corregido](../artifacts/ankle/idle-corrected.png). Resultados en `artifacts/ankle/idle.json`, `step.json` y `build.log`. Reproducción: `scripts/ankle-idle.browser.js` en el perfil de QA aislado.

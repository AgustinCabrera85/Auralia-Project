# Maderas de Brisalia, lluvia y doble salto

21 de noviembre de 2026.

## Maderas, con B18 como referencia

Los materiales de madera ya eran opacos y de doble cara. La auditoría encontró componentes cerrados cuya orientación de triángulos y normales apuntaba hacia dentro: 2.058 componentes en 57 mallas de los modelos Rev3, incluidos 67 en B18.

`RepairWoodSolids.ts` identifica cada componente cerrado mediante sus aristas y volumen orientado. `BrisaliaVillage.ts` lo aplica antes de unir las mallas por material. Invierte solamente las caras cerradas orientadas hacia dentro y adapta normales y tangentes. Conserva posiciones, UV, pivotes, entradas, colisiones y texturas compartidas. No agrega polígonos ni nuevas texturas. Funciona tanto con los derivados KTX2 como con la carga original.

Las láminas abiertas del techo y los espacios modelados entre vigas quedan fuera de esta reparación: rellenarlos modificaría el modelo. La comprobación automática es idempotente y verifica los 27 archivos fuente. La auditoría de la escena conserva las 28 ubicaciones existentes, incluido el castillo B28, con sus materiales PBR, plantas y colisiones.

Capturas finales de B18: [vista exterior](../artifacts/visual-fx/b18-after.png) y [vigas desde abajo](../artifacts/visual-fx/b18-eaves.png). Los recuentos reales están en `artifacts/visual-fx/wood-runtime.json`; la auditoría de edificios, en `house-audit.json`.

## Lluvia con presupuesto fijo

`RainField.ts` sustituye exclusivamente la lluvia de `Precipitation.ts`. Utiliza una malla de 1.024 trazos con buffers estáticos: 4.096 vértices, 2.048 triángulos, aproximadamente 156 KiB, una llamada de dibujo, cero texturas y cero partículas simuladas en CPU. La GPU calcula caída, viento, variación de longitud y desvanecimiento. La CPU actualiza unos pocos uniformes, sin recorrer gotas ni reconstruir buffers.

Los trazos tienen bordes suaves, menor presencia junto a la cámara y a distancia, y color adaptado al día y la noche. La lluvia se apaga con tiempo despejado y con la señal de refugio existente. La nieve mantiene su sistema separado. Las superficies opacas ocultan la lluvia mediante profundidad normal; no se añade un mapa de lluvia ni una simulación de cobertura por techo. La señal de refugio no implica detección automática de todos los interiores.

La prueba alternó diez veces lluvia/tormenta y cielo despejado sin crecimiento de recursos. La prueba de píxeles confirmó cero trazos atravesando una superficie opaca a 1920 × 1080. `rain.json` contiene también tiempos puntuales de actualización y dibujo; son micropruebas, no una medición estadística del FPS o de la memoria total del juego.

[Captura de lluvia en Brisalia](../artifacts/visual-fx/rain.png).

## Doble salto v2.1

Integrado el paquete entregado, con los archivos originales verificados por SHA-256. Ondas secuenciales, cintas y motas en el punto de despegue, sin cambiar la potencia aprobada ni Q. La reserva de tres efectos limita los recursos y evita crear emisores por salto. Detalles, presupuesto y pruebas en [DOUBLE_JUMP.md](DOUBLE_JUMP.md).

## Validación reproducible

- `node --experimental-transform-types tests/wood-solids.test.mjs`: 2.058 componentes, 67 de B18; entradas originales intactas, reparación idempotente y superficies abiertas preservadas.
- `node --experimental-transform-types tests/rain-field.test.mjs`: presupuesto fijo, buffers reutilizados, apagado por clima/refugio y liberación correctos.
- `npm run test:traversal`: correcto.
- Pruebas reales con `scripts/check-abilities.mjs`: `brisalia-rev3.browser.js`, `wood-solids.browser.js`, `rain.browser.js`, `double-jump.browser.js` y `visual-fx-occlusion.browser.js`.
- Compilación: `artifacts/visual-fx/build.log`.

Esta entrega reduce el trabajo de la lluvia y acota el FX, pero no vuelve a medir ni promete una reducción determinada de la memoria total de Chrome. Las mediciones anteriores de memoria siguen documentadas en `MEMORY_REGRESSION.md`.

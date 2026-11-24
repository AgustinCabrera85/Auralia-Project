# Impacto de tierra del superataque X

21 de noviembre de 2026. Fuente: `F:/PROYECTO AURALIA/PARA ASSETS/Para FXs/Auralia_FX_Impacto_Tierra_v1`.

## Comportamiento validado

El usuario aclaró que el efecto corresponde al golpe contra el suelo del superataque X y confirmó que ya se ve. La conexión anterior con el combo Q fue retirada. No se modificó el aspecto después de esa confirmación.

`forest_roots` declara `animation.groundStrikeAt: 1.1`, en segundos de reproducción de `Sword And Shield Casting` a velocidad 1,2. Es un marcador visual independiente de los impactos de daño de cada anillo. `WorldView` lo consume una sola vez por ejecución comprometida, después de evaluar el rig y el agarre. No se dispara al pulsar la tecla ni se repite al emerger los siguientes anillos.

Se transforma un máximo de 13 vértices reales de la hoja y se proyecta sobre el apoyo válido más cercano bajo ellos para ubicar el FX. Esta integración usa el evento de golpe de la animación de X, no una colisión física continua de espada: las variantes cortas conservan el mismo momento visual. No hace consultas de hoja durante Q ni durante el resto de los fotogramas de X.

El origen queda fijo en coordenadas mundiales. Se rechazan agua, vacío y apoyos demasiado estrechos. Pausa, pérdida de foco, viajes y cancelación de la habilidad evitan eventos pendientes. Un fotograma lento no borra el impacto ni cancela su marcador; el especial usa el reloj de simulación. Las raíces, sus cuatro niveles, daño, inclinación y temblor mantienen su comportamiento.

## Recursos

Una instancia por escena reserva dos impactos: seis mallas, cinco materiales, una máscara compartida de 1024 × 1024, hasta 96 tarjetas de polvo y 44 fragmentos. No agrega luces ni ParticleSystem ni postprocesos. Sus mallas participan en los candidatos de dibujo del Reino Ígneo.

`GroundImpactSurface` captura 17 × 17 alturas una vez por impacto; el efecto interpola esa cuadrícula durante sus 1,85 segundos. Reduce el radio en bordes y omite el efecto si no cabe un radio de 0,6. Es una aproximación que no certifica huecos menores que una celda. El radio máximo visual es 3,4 y la intensidad crece de 1 a 1,45 según el nivel.

## Verificación

- `scripts/ground-impact.browser.js`: entrada normal con Q y X, animaciones y bucle real. Q no emite; X emite una vez en niveles 1–4, en el marcador; cancelar antes del golpe no emite. Repetir X conserva las seis mallas y una máscara del FX. El conteo excluye el streaming independiente del mundo.
- `tests/ground-impact-surface.test.mjs`: pendientes mundiales, límites de plataformas y cero consultas de colisión durante la interpolación.
- `npm run test:abilities`: 29 comprobaciones correctas. Las pruebas de espada verifican que los puntos de contacto pertenecen a las cuatro mallas reales y siguen a su padre animado. También pasaron las pruebas de Santi y del renderizado de la cueva durante la integración.
- `npm run build`: resultado en `artifacts/ground-impact/build.log`.

Capturas del superataque real: [instante del golpe](../artifacts/ground-impact/superattack-contact.png) y [desarrollo del efecto](../artifacts/ground-impact/superattack-burst.png). Resultado reproducible: `artifacts/ground-impact/superattack.json`. Los ensayos anteriores del combo Q fueron archivados en `.test-build/ground-impact-retired/` y ya no representan la activación final.

# Polvo de sprint de Santi

Integración del paquete `Auralia_FX_Polvo_Sprint` entregado en `PARA ASSETS/Para FXs`.
El módulo y su declaración están en `src/game/SantiSprintDust.js` y `.d.ts`.
Los originales del paquete permanecen intactos.

## Apariencia

El ajuste solicitado enfatiza la supervelocidad: intensidad **2,8**, escala **3,6**
(1,5× respecto al ajuste anterior de 2,4),
opacidad máxima **0,68** y vida de **0,28–0,55 s**. Las bocanadas alternan los pies,
crecen y se dispersan hacia atrás; las partículas emitidas permanecen en el mundo.
Se conserva el límite de **72 partículas**, dos sistemas, una máscara procedural
RGBA de **1024×1024** compartida por escena y ninguna malla adicional.

## Integración

`WorldView` crea una instancia y la actualiza después del movimiento con el mismo
`sprintVisual` que utiliza el desenfoque. El FX comprueba desplazamiento real:
entra a 22 m/s y sale por debajo de 20,5 m/s. No cambia controles, velocidades,
animaciones ni el GLB de Santi. No emite quieto, al caminar, correr normalmente,
quedar bloqueado, saltar o nadar.

La consulta de apoyo ocurre únicamente al emitir, como máximo nueve veces por
segundo. Convierte X/Z mundiales a coordenadas de zona y usa `traversalWorld.ground`.
Puentes, raíces de árboles, pisos construidos y edificios tienen prioridad sobre
el terreno inferior. Las pendientes usan la altura y normal del apoyo real.
El suelo natural usa los pesos del mismo terreno renderizado, incluida la pintura
del editor; las calles de Brisalia son tierra, no pavimento.

Tierra, pasto y arena producen polvo; la roca produce menos. Agua, madera,
pavimento, nieve y lava lo suprimen. La lluvia usa `weatherMix.rain / 0.7`, acotado
a 0–1; reduce la emisión y la detiene desde 0,7. La nevada la suprime también.
No existe un acumulador persistente de humedad. Los reinos flotantes y el interior
ígneo quedan sin emisión hasta que sus apoyos expongan materiales fiables.

Se limpia al perder foco, pausar, teletransportarse o cambiar de zona. `dispose`
libera ambos sistemas; la última instancia libera la textura compartida.
La adaptación también admite coordenadas `{x,y,z}` además de `Vector3`.

## Verificación

`scripts/sprint-dust.browser.js` ejecuta pruebas con Babylon real y el controlador
del juego: filtros de emisión, superficies, lluvia, pendiente, conversión de zona,
tasas de 24/60/144 FPS, partículas en mundo, reinicio y liberación de recursos.
La captura y el informe se guardan en `artifacts/sprint-dust/` a 1920×1080.

Con Vite en `127.0.0.1:5173` y el navegador aislado de pruebas en el puerto 9228:

```powershell
node scripts/check-abilities.mjs --reload --1080p --out=sprint-dust --eval=scripts/sprint-dust.browser.js --report=integration --capture=sprint
```

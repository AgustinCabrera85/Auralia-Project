# Santi: personaje jugable

El archivo distribuido `public/assets/characters/santi/Santi_NLA_SK_Opt.glb`
se exportó desde `F:\santi project\Santi_NLA_SK_Opt.blend` con Blender 5.2.
Antes de exportar, el brazo `Santi_Rig_Mixamo` debe estar en modo **POSE**;
en modo **REST** el GLB conserva los nombres de las acciones pero deja sus
huesos inmóviles. Se exportan los 35 NLA tracks y las shape keys, sin animación
de pesos faciales. Su escala visual se ajusta
al alto jugable de 3,8 unidades. El movimiento, la cámara, las colisiones y los
guardados siguen bajo `WorldView` y `CharacterTraversalController`.

Para repetir la exportación desde la raíz del repositorio:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup 'F:\santi project\Santi_NLA_SK_Opt.blend' --python scripts/export-santi.py
npm run test:santi
```

`src/game/SantiCatalog.ts` registra las 35 acciones NLA exportadas. En juego,
`SantiCharacter` usa Idle, Walking, Run, Running Backward, Jumping, Running Jump,
Falling Idle, Climbing, Hanging Idle y Climbing To Top según el estado del jugador.
Las demás acciones quedan disponibles por nombre mediante `playAction()`.
Shift reproduce `Run` como carrera normal; dos pulsaciones de Shift en 320 ms
y mantener la segunda reproducen el mismo `Run` al doble de velocidad.
La cámara de tercera persona comienza a 11,5 unidades del personaje y se puede
acercar hasta 5,5 con la rueda. Al caminar con A o D, Santi gira hacia la
dirección elegida y usa la animación de avance, sin desplazamiento lateral.
Durante el sprint a 2× la cámara se aleja suavemente 2,5 unidades adicionales
y vuelve a la distancia elegida al terminar.
Espacio permite un segundo salto en el aire con otro impulso; los dos saltos se
recargan al aterrizar. El segundo salto reutiliza `Jumping`, ya que el GLB no
incluye un clip NLA llamado «Double Jump».

`Equipo` (`V`) permite elegir mano limpia, espada de cobre o herramientas;
las teclas `1`–`5` son accesos directos. La selección se guarda con la partida.
La espada se fabrica con madera, cobre y piedra, pero fabricarla no la equipa.
Con mano limpia, `Q` alterna `Kicking` y `Inside Crescent Kick`; con la espada
seleccionada, alterna `Two Hand Sword Combo` y `Great Sword High Spin Attack`.
Las herramientas no tienen ataques de `Q` asignados. Las patadas detienen el
desplazamiento hasta que termina su animación. `Running Slide` solo se ejecuta
con `F` y también funciona como ataque, sin aparecer en la secuencia de `Q`.
`R` reproduce `Sprinting Forward Roll` durante el juego; al construir, `R`
gira la pieza seleccionada. Las patadas, la barrida y los rolls bloquean nuevas
acciones hasta que termina su clip. Una caída de 8 unidades o más desde
el punto más alto del vuelo activa `Falling To Roll` al tocar suelo, comenzando
en sus fotogramas de contacto. Los ataques y rolls se ejecutan solo en suelo.
Por ahora activan las animaciones; el juego aún no tiene daño ni enemigos de combate.
El salto de pie omite la preparación inicial del clip. Sus fotogramas de
despegue siguen el tiempo físico una sola vez y mantienen la pose suspendida
desde el punto más alto hasta el descenso final. Al acercarse al suelo empieza
la flexión de `Hard Landing`; el contacto físico continúa desde su pose con los
pies apoyados y el torso bajo. El desplazamiento horizontal de la raíz de ese
clip se fija al jugador, también al saltar quieto sobre un desnivel. La caída
alta anticipa de la misma forma `Falling To Roll`. El salto corriendo conserva
`Running Jump` hasta la aproximación al suelo; `Falling Idle` solo aparece
si los pies descienden más de 1,5 unidades respecto del despegue. El movimiento
de la raíz de ambos clips de salto se fija al inicio para que la trayectoria
la controle la física del jugador.
La corrección de pisada entra desde el impacto y aumenta durante 0,18 s;
los pies se asientan mientras el torso se recupera, sin una corrección súbita
al terminar la animación.

El salto con Shift tiene más impulso vertical y conserva más velocidad horizontal
que el salto caminando. En el aire, un segundo Espacio con una dirección pulsada
produce un impulso fuerte en esa dirección; sin dirección, el segundo salto sube
en el lugar. Santi se orienta según su desplazamiento real durante el vuelo.
El segundo impulso activa un desenfoque radial breve que se desvanece durante
el primer tramo del vuelo. La carrera con doble Shift aplica una intensidad
mucho menor mientras Santi avanza por el suelo; ambos efectos se desactivan
cuando dejan de corresponder. El desenfoque preserva el centro luminoso del sol.
Si se mantienen teclas de movimiento al aterrizar, el salto de pie o doble salto
enlaza desde la pose de impacto con caminar o correr. Sin movimiento, la
recuperación visual detiene el traslado hasta que termina para evitar que patine.
Las cuestas caminables usan `Walking (6)` o `Run`; las animaciones de subir
escaleras requieren un contexto de escalera explícito.

La barrida y el roll fijan su dirección al comenzar y avanzan con velocidad
decreciente, sin giro libre durante el clip. El roll toma la dirección y velocidad
reales del desplazamiento previo; al terminar conserva un breve impulso residual
que se disipa si se sueltan las teclas o se enlaza con la nueva dirección.
Una barrida desde reposo avanza una
distancia corta. En `Falling To Roll`, el movimiento se detiene cuando Santi
queda de pie y la carrera se reanuda al terminar toda la animación.

El GLB también incluye 52 shape keys en la cara y otras mallas. El controlador
las registra por nombre en `shapeKeys` y ofrece `setShapeKey()` y `setExpression()`.
Las 13 expresiones principales están en `SANTI_EXPRESSIONS`; unidades faciales,
visemas y controles de lengua siguen disponibles por su nombre original.
Si una exportación posterior incluye pistas de pesos faciales, el controlador
las retira de los grupos al cargar para que no borren la expresión elegida.

Para revisar todas las acciones y expresiones principales durante el desarrollo,
abrir el juego con `?santiDebug=1`. Si falla la carga del GLB, permanece visible
el personaje provisional.

Verificación: `npm run test:santi` comprueba que las 35 acciones mueven huesos,
y que el esqueleto, la escala y las expresiones funcionan en Babylon.

## Parpadeo espontáneo

`SantiCharacter` anima los shape keys originales `SF_AU45_Blink_L` y
`SF_AU45_Blink_R` sobre las expresiones faciales y las acciones NLA existentes.
Cada parpadeo dura 0,24 s: cierre de 75 ms, pausa de 30 ms y reapertura de
135 ms, con interpolación suave. Los intervalos varían entre 2,6 y 6,2 s;
un 12 % de los ciclos añade un segundo parpadeo breve, sin encadenarlos.
Una pausa de la pestaña no acumula parpadeos pendientes. Al terminar se
restaura cualquier pose manual de los párpados; las demás expresiones se conservan.

`npm run test:santi` verifica ambos párpados en todas las primitivas del GLB,
cierre y reapertura a 30/60/144 FPS, conservación de la sonrisa, restauración
de una pose manual y el presupuesto de atributos GPU. No se modifica el GLB.
La comprobación visual `node scripts/check-worldstudio-game.mjs --run --water-review --blink-only`
usa un perfil descartable y genera capturas locales de ojos abiertos, cerrados
y reabiertos en `artifacts/geographic-source/water-review/after/`.

# Construcción modular

El Claro del Hogar usa una grilla de 4 × 4 m centrada en `(-29, 18)`.
Las reglas de colocación, ocupación, soporte y movimiento están en
`src/domain/buildingRules.ts`; no dependen de Babylon.js. `GameStore` valida
los materiales y guarda las estructuras. `BuildVisuals` dibuja las piezas;
`WorldView` conecta la selección, el preview y el movimiento.

## Anclajes y altura

| Anclaje | Piezas | Ocupación |
| --- | --- | --- |
| `cell` | Piso | Centro de una celda |
| `foundation` | Cimiento | Centro de una celda, slot separado del piso |
| `edge` | Paredes, puerta y ventana | Borde físico compartido por dos celdas |
| `corner` | Columna | Esquina de celda |
| `roof` | Techo a dos aguas y sección | Espacio superior de una celda |

Los slots incluyen el nivel modular. El nivel 0 es el único edificable por
ahora; cada nivel futuro mediría 3,5 m. La primera pieza toma la altura del
terreno y las piezas próximas heredan la altura base para formar una plataforma
horizontal. Cada celda se rechaza si el desnivel entre centro y esquinas
supera 1,25 m. Piso y cimiento añaden soportes visuales donde el suelo baja.

Una pared necesita piso o cimiento en una de las celdas vecinas. Un módulo de
techo necesita piso o cimiento debajo y dos paredes de apoyo. Las secciones
vecinas comparten orientación de cumbrera. No se pueden ocupar dos veces un
slot ni retirar un soporte requerido por otra pieza. La puerta queda abierta
y permite caminar; la ventana bloquea el paso. No se puede cerrar la única
salida si el personaje está dentro.

## Uso

1. Fabricar el martillo, entrar al Claro del Hogar y abrir **Construir** (`B`).
2. Elegir una pieza. La grilla y el encastre aparecen mientras se coloca.
3. Mover el cursor sobre el suelo o una pieza, pulsar `R` para girar y hacer
   clic para colocar. Verde indica colocación válida; rojo muestra el motivo.
4. Pulsar `Esc` para salir. Hacer clic sobre una pieza para retirarla o cambiar
   una pared. `Z` deshace la última colocación de esta sesión si no sostiene
   otras piezas. El desmontaje devuelve el 100 % de los materiales.

El guardado sigue usando `auralia:poc:save:v1`. Las piezas antiguas conservan
sus coordenadas, aspecto y recursos ya gastados; se cargan como `legacy` porque
su posición previa podría no coincidir con los nuevos bordes. La cámara orbital
mantiene rotación con arrastre y zoom con la rueda.

## Límites actuales

- Solo se construye la planta baja en el Claro del Hogar.
- Los tejados usan colisión superior aproximada plana para el movimiento.
- Las piezas antiguas se pueden retirar, pero no reemplazar como paredes
  ancladas; las nuevas sí se pueden editar.

# Fuente de Brisalia

Reemplazo del estanque y obelisco provisionales de la plaza por `public/assets/props/Fuente_Brisalia.glb`, copiado intacto desde `C:/Users/gerar/Downloads/Fuente_Brisalia.glb`. SHA-256: `7aa99ef55985f4ae1706fbbd454c266534f4bf7836c25e31f1bd18f19a061a61`. Textura embebida; 548300 bytes.

`BrisaliaVillage` coloca `BrisaliaFountain` en `(town.x, terreno, town.z - 65 * BRISALIA_SCALE)`. El ancho actual es 16,2 unidades: tres veces las 5,4 iniciales. El ancho original del GLB es 0,9995117784 y su altura 0,71337890625. La escala uniforme se aplica al nodo del conjunto, incluidos chorros, agua y salpicaduras, manteniendo el centro de la plaza y la base sobre el terreno.

Cuatro chorros nacen de los extremos medidos de los caños: radio 0,187 y altura 0,3523 en coordenadas del asset. Sus trayectorias parabólicas desembocan a radio 0,34 y altura 0,105. Una superficie octogonal llena el estanque; el shader anima ondas, brillos y espuma de impacto. Los cuatro tubos se fusionan en una malla y 32 gotas comparten una malla con instancias: tres mallas de efectos en total.

El reloj se detiene con pausa, foco perdido y fuera de alcance. Los efectos se ocultan a 110 unidades y en otros reinos o interiores. La geometría de piedra participa en suelo, paredes, techo, obstrucción de cámara y consultas de lluvia de Brisalia. El agua visual no se utiliza como una pared sólida. La carga asíncrona y `dispose` comparten el ciclo de vida del pueblo; los errores figuran en `village.errors` y `village.fountain.error`.

Validaciones: `npm run check`, `npm run test:fountain`, `npm run test:traversal` y `npm run test:brisalia-rev3`. La prueba de la fuente carga el GLB real, verifica su hash, escala y base, colisiones, los cuatro bordes de los caños mediante rayos, impactos dentro del estanque, presencia en renderizado, pausa, distancia, recursos constantes y liberación durante la carga. `npm test` incluye esta prueba.

Se inspeccionó el asset y el encaje de las mismas mallas de agua mediante renders locales de Blender. Esto verifica geometría y colocación, no el shader final del juego. La revisión automática de Chrome se interrumpió porque Computer Use no pudo verificar la URL actual; la revisión visual dentro del juego permanece pendiente.

Corrección del borde: `CharacterTraversalController` conserva la altura de la superficie de piedra al deslizar por un bisel no transitable y calcula el descenso con consultas de colisión, en vez de bajar los pies hasta el terreno que queda debajo de la fuente. Esto evita introducir al jugador dentro de la pared. La regresión usa el GLB real para comprobar salida caminando y saltando a 30, 60 y 144 Hz, además de un bisel elevado sintético para comprobar deslizamiento sin movimiento de entrada.

Recuperación de partidas: como el guardado contiene X/Z sin altura, `WorldView.safeSavedStart` usa `BrisaliaFountain.safeSavedPosition` para sacar una posición guardada dentro del estanque o sobre su borde a suelo libre junto a la fuente. Funciona antes de terminar la carga del GLB y conserva las posiciones alejadas.

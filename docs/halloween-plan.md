# Plan: tema de Halloween en GcGames

Tema temporal para la sección Juegos, para estar listo el 31/10/2026 (hoy es 26/10, quedan 5 días). Este documento es solo un plan. No contiene código.

## 1. Resumen y decisiones

- Objetivo: que `/juegos` se vea de Halloween durante unos días y se apague solo después, sin tocar reglas de juego ni base de datos.
- Regla del usuario: todo vive dentro de `packages/web/src/juegos/`. Nada en el Layout de TopCode ni en otras páginas. Comprobado: fuera de `juegos/` no aparece la clase `juegos-root` en `packages/web/src`.
- Punto de enganche único: `Juegos()` al final de `Juegos.jsx` (~línea 823) renderiza `<div className="juegos-root">`. Ahí se añade una clase `.juegos-root.halloween` solo mientras el tema esté activo. Todo lo demás cuelga de esa clase.
- Hechos comprobados que condicionan el plan:
  - Variables de paleta en `.juegos-root` (`index.css`: `--baize`, `--baize-deep`, `--brass`, `--red`, `--bolt`...) y en `hub.css` (`--hub-gold*`, `--hub-panel`, `--hub-line*`). Sobrescribirlas bajo `.juegos-root.halloween` retinta casi todo sin editar cada juego.
  - `index.css` pone en su cabecera «Generado ... con scripts/scope-css.cjs: no editar aquí». No se toca. El tema va en un CSS nuevo.
  - `hub.css` carga después de `responsive.css`, y los CSS por juego se cargan al importar cada componente. Para que el tema gane sin `!important`, el CSS nuevo debe cargarse el último y usar selectores `.juegos-root.halloween ...` (más específicos).
  - Cada tarjeta del hub usa `--tint` (en `Juegos.jsx`, arrays `SOLO` y `SEASON3`) y una mini escena SVG de `HubArt.jsx` (`TowerScene`, `HeistScene`, `AuctionScene`, `BridgeScene`, `DuelScene`, `RouletteScene`, `CrashScene`, `RaceScene`, `DungeonScene`, `PlinkoScene`, `FrogScene`).
  - Hay `prefers-reduced-motion` en 40 ficheros (48 apariciones), así que la convención ya existe y hay que seguirla.
  - `sound.js` genera los sonidos con funciones (`playWin`, `playCreak`, `playGrowl`, `playHeartbeat`...). No hay audio externo, y la CSP (`font-src 'self'`) impide fuentes y scripts externos.
  - Las cartas tienen dorso en `PlayingCard.css` (`.card__back`, ~línea 62). El tapete es `FeltPrint.jsx`.
  - Los efectos de victoria están en `WinBurst.jsx`, `WinToast.jsx` y `celebrate.css`.

## 2. Alcance

### 2.a Solo visual y temporal (base del plan)

1. Paleta: fondo casi negro violáceo, naranja calabaza y verde ácido en lugar del azul tapete y el oro. Se hace redefiniendo variables.
2. Hub: título/marquesina, bombillas del borde en naranja, focos de ambiente (`.app.hub::before`) en naranja y violeta.
3. Tarjetas: `--tint` alternativo en naranja, violeta y verde según el juego, y decoración ligera (telarañas en una esquina con CSS, sin SVG pesado).
4. Mini escenas de `HubArt.jsx`: no reescribirlas. Se superponen adornos puntuales por CSS (sombrero de bruja, murciélago...) y solo si el tiempo alcanza, se cambia 1 o 2 escenas.
5. Dorso de cartas y tapete de blackjack/póker en versión Halloween (CSS sobre `.card__back` y el fieltro).
6. Partículas: murciélagos y calabazas cayendo o volando en el hub, con CSS puro, pocas (máximo ~6-8 elementos), solo en el hub y no en las pantallas de juego.
7. Textos: algunos textos del hub cambian (por ejemplo, el saludo). Solo cadenas, sin lógica.
8. Sonidos: opcional. Dos o tres sonidos nuevos en `sound.js` con el mismo sintetizador (por ejemplo un crujido o una risa al entrar), respetando `isMuted()`.

### 2.b Toques ligeros de juego sin tablas nuevas (opcional, solo si el usuario lo pide)

- Cartas gacha temáticas: `api/_juegos/gacha-catalogo.json` se genera con `scripts/gacha/importar.mjs`. Añadir cartas cambia el catálogo y, como `powersOf` se calcula sembrando por id de carta, hay que verificar que los poderes de las cartas existentes no cambian (mismo riesgo que se describe en `docs/gancho-plan.md`, sección 1.4). Riesgo medio. No está en el alcance por defecto.
- Evento de Halloween disparado por la banca (`api/_juegos/banca.mjs`): reutilizar los eventos existentes (Admin Abuse x2/x3/gratis, bote del bingo) con un nombre temático, sin código nuevo en el servidor. Es una decisión de uso, no de desarrollo: la banca lo lanza a mano con el tema ya visible.
- Mimics del Laberinto con aspecto de monstruo: solo arte (`DungeonArt.jsx`, `Dungeon.css`). El comportamiento del juego no cambia.

### 2.c Evitar

- Cambiar probabilidades, pagos, RTP o cualquier función pura compartida entre cliente y servidor (`packages/web/src/juegos/*.js` y `api/_juegos/`). Es un tema visual, y una desincronización cliente/servidor rompería la liquidación.
- Dejar que el cliente decida resultados o fechas con efectos económicos. La fecha solo decide el aspecto.
- Migraciones o tablas nuevas (cualquier tabla `juegos_*` pertenece a `juegos_api`). No hacen falta.
- Fuentes, imágenes o scripts de CDN (la CSP de `vercel.json` los bloquea). Si se quiere una fuente gótica, hay que instalarla como paquete `@fontsource` y evaluar su peso. Por defecto no se añade.
- Editar `index.css` (generado), el Layout de TopCode o estilos globales fuera de `.juegos-root`.
- Animaciones continuas en pantallas de juego (peso en móvil, y distraen en rondas de apuestas en vivo).
- `filter: blur()` grandes, `box-shadow` animados y muchas capas con `mix-blend-mode`.

### Alcance recomendado para 5 días

2.a completo menos la reescritura de escenas SVG, más sonidos opcionales si sobra tiempo. De 2.b, solo el evento por banca (que no requiere desarrollo) y el arte de los mimics si hay tiempo. Gacha: no.

## 3. Cómo hacerlo temporal e interruptor único

- Un módulo nuevo `packages/web/src/juegos/halloween.js` con una función pura `halloweenActivo(ahora)` y las fechas de la ventana. Es el único sitio donde viven las fechas.
- Ventana propuesta (pendiente de confirmar, pregunta 2): del 27/10/2026 00:00 al 02/11/2026 00:00, hora de Canarias (Atlantic/Canary, la misma zona que el reinicio semanal). Hay que calcularla con `Intl`/zona explícita, no con la hora local del navegador, para que todos vean lo mismo.
- `Juegos()` añade `halloween` a la clase del `div.juegos-root` si `halloweenActivo(Date.now())` es verdadero. Se evalúa al montar. Como la ventana es larga, no hace falta temporizador. Quien tenga la pestaña abierta cuando termine lo verá al recargar.
- Interruptor manual: parámetro `?halloween=1` / `?halloween=0` (sobreescribe la ventana, útil para probar sin esperar y para apagarlo antes). Solo afecta a la clase visual.
- Las partículas y adornos de HTML (murciélagos, calabazas) se montan solo si la clase está activa, y no existen en el DOM en otro caso.
- `prefers-reduced-motion: reduce`: sin partículas animadas ni bombillas corriendo. Los adornos se quedan estáticos, o no aparecen.
- Rendimiento en móvil: máximo ~6-8 partículas, solo `transform` y `opacity`, `will-change` solo durante la animación, `contain: paint` en la capa de partículas y `pointer-events: none`. Nada de `blur` grande. En ancho de pantalla pequeño, menos partículas aún.
- Quitarlo después: borrar `halloween.css`, `halloween.js`, el `import` y la clase en `Juegos.jsx`, y los componentes de adorno. Por eso todo va en ficheros nuevos y la única edición en ficheros existentes son pocas líneas en `Juegos.jsx`.

## 4. Subtareas

No hay carpeta `.claude/agents/` en el repo (la búsqueda con Glob devolvió 0 ficheros), así que no he podido leer definiciones de agentes. Los tipos de agente de abajo son los que indicó el usuario, y la elección se basa en el nombre del tipo y en la tarea, no en capacidades verificadas en ficheros. Si el orquestador dispone de otros agentes con definición, conviene releer esta tabla.

| # | Subtarea | Agente | Ficheros que toca | Depende de |
|---|---|---|---|---|
| 1 | Dirección visual: paleta (hex de fondo, naranja, verde, violeta), qué adornos van dónde, qué se queda sin tocar. Salida: sección 8 de este mismo documento o `docs/halloween-paleta.md` | ui-designer | solo documento | nada |
| 2 | Interruptor: `halloween.js` (ventana en hora de Canarias, parámetro `?halloween`) y clase en `Juegos()` | react-specialist | nuevo `juegos/halloween.js`; `Juegos.jsx` (solo `Juegos()` al final y un `import`) | nada |
| 3 | Tema base de variables y hub: nuevo `juegos/halloween.css`, importado el último en `Juegos.jsx`; redefine variables de `index.css`/`hub.css` y retinta marquesina, focos y tarjetas | frontend-developer | nuevo `halloween.css`; `Juegos.jsx` (el `import`) | 1 y 2 |
| 4 | Colores `--tint` de tarjetas y textos del hub bajo el tema | frontend-developer | `Juegos.jsx` (arrays `SOLO`/`SEASON3`, solo con el tema activo) o, mejor, override por CSS en `halloween.css` | 3 |
| 5 | Adornos y partículas (murciélagos, calabazas, telarañas) como componente nuevo montado solo en el hub | react-specialist | nuevo `juegos/HalloweenFx.jsx` y `halloween-fx.css`; una línea en `GameSelector` de `Juegos.jsx` | 2 y 1 |
| 6 | Dorso de cartas y tapete de blackjack/póker | ui-designer + frontend-developer | `halloween.css` (secciones propias); lee `PlayingCard.css`, `FeltPrint.jsx` | 3 |
| 7 | Retinte de pantallas de juego (laberinto/mimics, ruleta, cohete, carrera, bingo, subasta, puente, rana, torre, atraco, plinko, gacha): solo variables y contraste, sin animaciones nuevas | frontend-developer | `halloween.css` (una sección por juego); solo lectura de los CSS de cada juego | 3 |
| 8 | Sonidos opcionales | javascript-pro | `sound.js` (funciones nuevas al final), y llamada en el hub | 2 |
| 9 | Accesibilidad: contraste del texto sobre la nueva paleta, `prefers-reduced-motion`, que las partículas no tengan foco ni lectores de pantalla (`aria-hidden`) | accessibility-tester | solo informe; propone cambios en `halloween*.css` | 3, 5, 7 |
| 10 | Rendimiento en móvil: coste de las partículas y capas, y que con el tema apagado no se cargue nada extra | performance-engineer | solo informe | 5 |
| 11 | Revisión de código: nada fuera de `/juegos`, selectores todos bajo `.juegos-root.halloween`, sin `!important` innecesario, comentarios en español que expliquen el porqué | code-reviewer | solo lectura | 2-8 |
| 12 | Pruebas manuales y visuales (escritorio y móvil), con el tema activo y apagado | qa-expert + ui-ux-tester | solo informe | 11 |

Opcional (2.b), solo si el usuario lo pide: arte de mimics (game-developer, `DungeonArt.jsx` y `Dungeon.css`, sin tocar la lógica) y cartas gacha (javascript-pro, catálogo y script, con la verificación de poderes).

### Qué corre en paralelo

- Paralelo desde el primer momento: 1 (diseño) y 2 (interruptor). No comparten ficheros.
- Tras 1 y 2: 3 se ejecuta primero porque crea `halloween.css`. Después pueden ir en paralelo:
  - 5 (componente y CSS propios, más una línea en `Juegos.jsx`) y 8 (`sound.js`): ficheros distintos de 3.
  - 6 y 7 trabajan en `halloween.css`, como 3 y 4. Para no pisarse, cada uno usa su propio fichero (`halloween-cartas.css`, `halloween-juegos.css`) importado desde `Juegos.jsx` por la subtarea 3, o se serializan. Recomendado: ficheros separados.
- Conflicto a vigilar: 2, 3, 4 y 5 editan `Juegos.jsx`. Aunque cada una toca pocas líneas, deben aplicarse en orden (2, 3, 5), o las hace una sola persona, o se reparten en worktrees distintos.
- Cierre en serie: 9 y 10 en paralelo (solo informes) → correcciones → 11 → 12.

## 5. Orden de ejecución (calendario orientativo, 5 días)

- Día 1 (26/10): 1 y 2. Decisión del usuario sobre fechas.
- Día 2: 3, 4 y 8.
- Día 3: 5, 6 y 7.
- Día 4: 9, 10 y correcciones; 11.
- Día 5 (30/10): 12, correcciones finales, commit y push. Queda un margen de un día antes del 31.
- Si algo se retrasa, el orden de recorte es: sonidos (8), retinte por juego (7), cartas y tapete (6), partículas (5). La base (2, 3) es lo que no se puede perder.

## 6. Puntos de traspaso

- `docs/halloween-plan.md`: este plan y la paleta acordada (sección 8, rellena la subtarea 1).
- `packages/web/src/juegos/halloween.js`: exporta `halloweenActivo`. Lo lee `Juegos.jsx` y, si hace falta, `HalloweenFx.jsx`.
- `packages/web/src/juegos/halloween.css` (y las partes separadas): las variables y reglas bajo `.juegos-root.halloween`. Lo leen 6, 7, 9 y 12.
- Informes de 9, 10, 11 y 12: se guardan en `docs/halloween-informes.md` (un apartado por agente). Los lee quien aplica las correcciones.

## 7. Verificación

1. `npm run build` en la raíz debe terminar sin errores.
2. `npm run lint` sin errores nuevos.
3. Vista visual con `?halloween=1`: hub, una mesa de blackjack, una de póker, ruleta, laberinto, gacha y clasificación, en ancho de escritorio (~1280 px) y de móvil (~390 px). Debe leerse todo y no debe haber desbordes horizontales.
4. Con `?halloween=0` el aspecto es idéntico al actual (comparar capturas antes y después).
5. Simular la fecha fuera de la ventana: el tema debe estar apagado sin el parámetro, y sin partículas en el DOM.
6. Fugas: `Grep` de `halloween` en `packages/web/src` fuera de `juegos/` debe dar 0 resultados. Entrar a otra página de TopCode con el tema activo y comprobar que no cambia nada. Todo selector del tema empieza por `.juegos-root.halloween`.
7. `prefers-reduced-motion: reduce` activado en el navegador: sin movimiento.
8. Rendimiento: abrir el hub en un móvil o emulación con CPU ralentizada y mirar que el desplazamiento va fluido, y que no hay animaciones activas en las pantallas de juego.
9. CSP: la consola no debe mostrar bloqueos (no hay recursos externos).
10. Si se toca `sound.js`: respetar silencio (`isMuted()`), y que no suene nada al cargar sin interacción previa del usuario.
11. Si se añade algo del gacha: script que compare `powersOf` de todas las cartas existentes antes y después (0 diferencias).
12. Al terminar: commit y push, según la convención del usuario.

## 8. Paleta y adornos acordados

Pendiente: la subtarea 1 lo rellena.

## 9. Preguntas abiertas para el usuario

1. Alcance: ¿solo visual (recomendado) o también cartas gacha temáticas o cambios en el Laberinto? Cambia mucho el trabajo y el riesgo.
2. Ventana de fechas: ¿del 27/10 al 1/11 (propuesta) o solo el 31? ¿Se apaga solo (recomendado) o prefieres apagarlo tú a mano?
3. ¿Tema en toda la sección Juegos, o solo en el hub (menos trabajo, menos riesgo)? La recomendación es hub completo y retinte ligero de las pantallas de juego por variables.
4. ¿Evento de la banca (por ejemplo, Admin Abuse x2 el 31) y bote del bingo abierto ese día? Es una decisión tuya, no hace falta código.
5. Sonidos: ¿quieres sonidos nuevos de Halloween o prefieres no tocar el audio?
6. Fuente gótica: la actual (Abril Fatface) puede valer. ¿Quieres una nueva vía `@fontsource` (peso extra) o no?
7. Agentes: el repo no tiene definiciones en `.claude/agents/`. ¿Dónde están las definiciones de los agentes que se van a usar, para afinar la asignación?

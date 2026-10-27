# Plan: tragamonedas con mejor diseño, más premios y más espectáculo

Fecha: 2026-10-21. Basado en la lectura de `packages/web/src/juegos/{slots.js, Slots.jsx, Slots.css, SlotSymbol.jsx, WinBurst.jsx, useCountUp.js, sound.js}` y `api/_juegos/solo.mjs`. Nada se ha ejecutado ni medido: no hay cifras actuales de acierto ni de RTP (ver subtarea 3).

## Resumen

Objetivo: que la tragamonedas dé premio más a menudo, se vea más cuidada y tenga más ritmo, como las recientes Rana y Carrera.

Lo que hay hoy (leído del código):

- `slots.js` es lo único que decide el resultado. Lo importan la pantalla y el servidor (`api/_juegos/solo.mjs`, `slotsSpin`: `spinStops(rand)`, `evaluate(stops, bet)`, `delta = payout - bet`). Cambiar `REELS` o `PAYS` cambia pantalla y servidor a la vez. No hay que tocar `solo.mjs`.
- Cada rodillo tiene 20 posiciones. `BASE` tiene 5 cerezas, 5 limones, 4 campanas, 3 estrellas, 2 diamantes y 1 siete. El comodín (`wild`) sustituye 2, 3 y 2 posiciones en los rodillos 2, 3 y 4, y no sale en el 1 ni en el 5.
- Hay 10 líneas y se paga desde 3 iguales a la izquierda (`MIN_RUN = 3`). `PAYS`: cereza [1, 5, 20], limón [2, 8, 35], campana [4, 16, 70], estrella [8, 35, 160], diamante [20, 80, 400], siete [40, 200, 1000], en veces la apuesta de línea (`bet / 10`).
- La pantalla usa `tier`: `big` si `payout >= 15 * bet`, `win` si `> bet`, `small` si `> 0`. Solo `win` y `big` lanzan `WinBurst`.
- Ya existe: `WinBurst` (monedas, fuegos, confeti), `useCountUp`, `sound.js` (`playChip`, `playClunk`, `playWin(big)`; `playCash(mult)`, `playHop`, `playLand` y `buzz(pattern)` vienen de la Rana y la Carrera), la clase `floor--shake` en gran premio, el efecto `reels--tease` en el último rodillo y las líneas ganadoras en SVG (`.winlines`).

## Aviso previo: CSS generado

La primera línea de `Slots.css` dice «Generado desde el proyecto de juegos con scripts/scope-css.cjs: no editar aquí». En el repo no hay carpeta `scripts/` visible (el glob solo devolvió archivos de `node_modules`), así que no se puede comprobar de dónde sale. Antes de editar CSS, confirmar con el usuario dónde está el origen. Si no existe, editar `Slots.css` directamente y quitar o ajustar esa cabecera para que nadie lo regenere encima. Es la pregunta abierta nº 1.

## Subtarea 1. Más probabilidad de premio (solo `slots.js`)

Archivo a tocar: `packages/web/src/juegos/slots.js` (`BASE`, `withWild`, `REELS`, `PAYS`, y opcionalmente `evaluate`/`MIN_RUN`).

Objetivos (propuestos, a validar con la simulación de la subtarea 3):

- Frecuencia de acierto (tiradas con `payout > 0`): 35-45 %.
- RTP: 95-98 %. Ojo: el servidor suma el `delta` al saldo semanal que cuenta en el Score. Un RTP por encima de 100 % permitiría «cultivar» puntos, así que el techo es firme.
- Premio gordo (`payout >= 15 * bet`): que siga siendo raro (orden de 1 de cada varios cientos de tiradas); a medir.

Palancas, de menos a más invasiva:

1. Más comodines: pasar de 2-3 a 3-4 por rodillo central (el comodín ya está en `withWild`). Es la que más sube la frecuencia, pero también el RTP, sobre todo en los premios altos. Considerar que el comodín no sustituya al siete, o recortar `PAYS.seven`, si se dispara.
2. Rodillos más densos en símbolos bajos: cambiar `BASE` para tener más cerezas y limones y menos diamantes y estrellas. Sube la frecuencia con premios pequeños. Hoy cereza y limón ya son 10 de 20.
3. Pago por 2 cerezas desde la izquierda: hoy `MIN_RUN = 3` es una constante global y `evaluate` descarta todo lo que no llega a ella. Hacerlo implica `PAYS.cherry` con una entrada extra o una regla aparte en `evaluate`, y que `Paytable`, `Rules` y `winCells` en `Slots.jsx` entiendan que una racha de 2 puede ganar. Es la palanca que más sube la frecuencia, y también la que más toca (UI incluida). Solo si las dos anteriores no bastan.
4. Compensar el RTP con `PAYS`: bajar los premios medios (campana, estrella) o los de 5 iguales en la misma medida en que sube la frecuencia, para que el RTP quede en 95-98 %.

Notas técnicas:

- `withWild` y `shuffle(BASE, step)` generan los rodillos; `shuffle` solo es permutación válida si `step` y 20 son coprimos (hoy 3, 7 y 9 lo son). Si se cambia la longitud de `BASE`, revisar los pasos.
- `initialState.stops: [2, 9, 5, 11, 7]` y `windowOf` asumen índices dentro de la longitud de cada rodillo. Si cambia la longitud de las tiras, comprobarlo.
- `Slots.jsx` calcula `--len` y la animación del rodillo con `REELS[reel].length`; funciona con otra longitud.
- Los tiers de `reducer` (`15 * bet`, `> bet`) pueden necesitar reajuste si cambia la distribución de premios.
- La tabla `PAYTABLE` de la UI se alimenta de `PAYS`, así que se actualiza sola.

Quién: el asistente principal, o `game-developer` (mecánicas de juego) con `quant-analyst` como consulta de RTP. Los dos están en `/home/haise/.claude/agents/`; no he leído sus definiciones completas, así que es un encaje por nombre y conviene revisarlo antes de lanzarlos. Si no se usan agentes, esta subtarea la hace el asistente principal, porque el cambio es pequeño pero es iterativo con la simulación.

Orden de trabajo: primero escribir la simulación (subtarea 3, parte A) para medir el estado actual, luego iterar en `slots.js` hasta entrar en los rangos.

## Subtarea 2. Diseño y espectáculo (front)

Archivos: `Slots.jsx`, `Slots.css`, `SlotSymbol.jsx`, y si hace falta `sound.js` y `celebrate.css`. Depende de la subtarea 1 solo en que la UI debe poder mostrar las nuevas rachas (si se añade el pago por 2) y en los umbrales de `tier`. El resto puede hacerse en paralelo.

Quién: `frontend-developer` con `ui-designer` para la propuesta visual (ambos con herramientas de escritura según su definición, sin haberla leído entera; confirmar). Alternativa: el asistente principal, que ya tiene el contexto de los juegos hermanos.

Mejoras concretas, cada una anclada en el código actual:

1. Mueble de la máquina. Hoy es `.machine` con `var(--wood)` y borde `--brass`. Añadir cabecera con rótulo y luces animadas (bombillas CSS alrededor del marco que parpadean en espera y corren al girar), marco cromado de los rodillos, sombra interior y reflejo de cristal sobre `.reels__grid`, y botón «Girar» más grande. Reutilizar las variables de color ya definidas (`--wood`, `--brass`, `--bolt`, `--ivory`, `--display`); mirar cómo las usan `Race.css` y `Frog.css` para mantener coherencia.
2. Símbolos. `SlotSymbol.jsx` son SVG planos. Añadir degradados, brillos y contornos (cereza, limón, campana, estrella, diamante, 7 con borde y brillo, comodín más llamativo). Mantener `viewBox="0 0 100 100"` y los `className` existentes (`symbol__wild`, `symbol__seven`).
3. Giro de rodillos. `juegos-reel-roll` ya anima una tira con `blur(1.5px)`. Mejoras: desenfoque vertical más marcado (`filter` o un degradado de velocidad), sombra arriba y abajo del rodillo para dar profundidad, y rebote más visible en `juegos-reel-land`. Cada rodillo ya tiene su `--speed`; mantener paradas escalonadas. Respetar `prefers-reduced-motion` (ya hay un bloque al final del CSS: añadir las animaciones nuevas ahí).
4. Línea ganadora. Hoy son `<polyline>` con `stroke-width: 4`. Mejorar: dibujarla con `stroke-dasharray` animado (trazo que se recorre), brillo (`drop-shadow` de color), un nodo en cada casilla, y mostrar una a una las líneas premiadas (ciclo) cuando hay varias, en vez de todas a la vez. Para eso hace falta un pequeño estado en `Slots.jsx` (índice de línea resaltada con `useEffect` y temporizador) sin tocar el reducer.
5. Resalte de símbolos. `.slot--win` ya pulsa el símbolo. Añadir destello en la casilla, atenuar las casillas que no ganan (`.reels__grid` con una clase cuando hay premio) y aparición escalonada por rodillo.
6. Contador del premio. `useCountUp` ya se usa en el saldo y en `WinBurst`. Añadir un contador visible en la propia máquina («Premio: +X €») que cuente hasta `payout`, y que aparezca también en `small` (hoy un premio pequeño solo cambia el texto de estado y no tiene celebración).
7. Gran premio. Ya existe `WinBurst` con `big` y `floor--shake`. Opciones: añadir un nivel intermedio («mega») entre `win` y `big`, rótulo grande sobre la máquina, y luces del mueble a toda velocidad. Si se añade un tier en `reducer`, actualizar también las condiciones `tier === 'win' || tier === 'big'` de `Slots.jsx` (efecto de sonido, auto-giro, `won`).
8. Anticipación. Hoy solo hay `tease` cuando faltan el rodillo 5 por parar y las 4 primeras coinciden en alguna línea (`landed === REELS.length - 1`). Ampliar: anticipación también desde el rodillo 4 (3 coinciden), con el rodillo que falta más lento, resplandor (`juegos-lucky-glow`; comprobar que su `@keyframes` existe en algún CSS, porque `Slots.css` la usa pero no la define) y un sonido de tensión que sube de tono. En `Slots.jsx` el retraso va en el `useEffect` de `LAND` (`tease ? 1500 : 300`); la ampliación se hace ahí.
9. Sonido. `sound.js` ya tiene `playChip`, `playClunk` y `playWin(big)`. Candidatos nuevos, con el mismo estilo (`tone(...)`): tictac rápido durante el giro (reutilizar `playSpin(ms)` o hacer una variante), nota ascendente en cada rodillo que para, `playCash(mult)` en `win` y `playWin(true)` más largo en `big`, y vibración con `buzz([...])` en móvil. Respetar el interruptor de Sonido que ya existe (`isMuted`/`setMuted`).
10. Responsive. Mantener el cálculo de `--cell` y las media queries de 900 px y 640 px; probar que las luces y el rótulo no empujan los rodillos fuera de pantalla en móvil.

No cambiar: la lógica del reducer, `request({ t: 'solo_slots', bet })` ni el formato de la respuesta del servidor (`stops`, `payout`, `balance`).

## Subtarea 3. Verificación

A. Simulación (antes y después de la subtarea 1). Archivo nuevo sugerido: `/home/haise/Codigos/TopCode/scripts/simular-tragaperras.mjs` (crear la carpeta si no existe; está fuera del front, no entra en el build de Vite). Importa `../packages/web/src/juegos/slots.js` (ES modules puros, sin DOM), usa `randomInt` de `node:crypto` como `rand` y llama a `spinStops` y `evaluate` igual que `slotsSpin`. Con 1-10 millones de tiradas a una apuesta fija (p. ej. 100) debe imprimir:

- Frecuencia de acierto (`payout > 0`), de `payout > bet` y de `payout >= 15 * bet`.
- RTP = suma de pagos / suma de apuestas.
- Distribución por símbolo y por longitud de racha, y premio máximo observado.
- Opcional: RTP exacto enumerando las 20^5 = 3.200.000 combinaciones de topes (cabe en segundos) en lugar de muestrear; es determinista y evita el ruido, sobre todo en premios raros como el siete x5.

Criterio de aceptación: acierto 35-45 % y RTP 95-98 % (rangos propuestos; ajustar si el usuario prefiere otros). Guardar la salida antes y después en el mensaje final.

B. Calidad de código. Los scripts del `package.json` raíz son `build` y `lint` (ambos delegan en `packages/web`): ejecutar `npm run lint` y `npm run build`. No encontré tests del proyecto fuera de `node_modules` (pregunta abierta nº 2).

C. Prueba manual. Girar en el navegador con las ayudas ya existentes: Turbo, Auto, móvil estrecho, modo sin animaciones y sonido apagado. Comprobar que `evaluate` en pantalla coincide con el `payout` que devuelve el servidor (el reducer usa el `payout` del servidor y `evaluate` solo para pintar las líneas).

Quién: el script y la ejecución de lint/build los puede hacer el asistente principal. Para la revisión independiente, `qa-expert` (según el plan anterior `docs/juegos-mejoras.md`, solo tiene `Read, Grep, Glob, Bash`: puede ejecutar y analizar, pero no escribir archivos; el script lo escribe otro).

## Orden de ejecución

1. Escribir el script de simulación y medir el estado actual (3A). Sin esto no hay base para decir cuánto sube nada.
2. En paralelo:
   - Subtarea 1 (ajustar `slots.js`, iterando con la simulación).
   - Subtarea 2, puntos 1-6, 8-10 (no dependen de las reglas).
3. Cuando la 1 esté cerrada: puntos de la subtarea 2 que dependen de ella (rachas de 2, umbrales de `tier`, textos de `Rules` y `Paytable`), y retoques de sonido.
4. Verificación final (3A de nuevo, 3B, 3C).

Traspasos por archivo: la simulación lee `slots.js`; el front lee `slots.js` y `sound.js`; nadie toca `solo.mjs`.

## Reparto

| Subtarea | Archivos | Quién |
|---|---|---|
| 1. Probabilidades y pagos | `slots.js` | asistente principal (o `game-developer`, consulta `quant-analyst`) |
| 2. Diseño y espectáculo | `Slots.jsx`, `Slots.css`, `SlotSymbol.jsx`, `sound.js`, `celebrate.css` si hace falta | `frontend-developer` + `ui-designer`, o asistente principal |
| 3A. Simulación | `scripts/simular-tragaperras.mjs` (nuevo) | asistente principal |
| 3B/3C. Lint, build, prueba manual | todo | asistente principal; revisión opcional con `qa-expert` |

Los nombres de agentes salen de la lista de `/home/haise/.claude/agents/` (160 archivos); solo he comprobado que existen por nombre, no he leído sus definiciones para este plan, así que el encaje es provisional.

## Subtarea 4. Evento "Admin abuse" (master activa ventajas para todos)

Decisión del usuario: no importa que el saldo semanal suba algo durante el evento. Un master activa un evento visible para todos y, mientras dura, la pantalla muestra qué ventajas hay activas. Nada de ventajas secretas ni solo para una cuenta.

Diseño propuesto (a validar; no he leído `game.mjs` ni `auth.mjs` para esto):

1. **Estado en el servidor.** Una fila de evento (tipo, ventajas, `hasta` como instante de fin). Hará falta tabla o columna nueva, así que migración en `supabase/` y `schema.mjs`; recordar la nota de memoria: las tablas `juegos_*` deben pasar a `juegos_api`. El cliente nunca decide si el evento está activo.
2. **Activar y parar.** Acciones nuevas en `api/_juegos/game.mjs` solo para master: `evento_start` (ventajas + duración) y `evento_stop`. Cómo se reconoce a un master no está verificado: no vi lógica de roles en `api/_juegos`. Pendiente de decidir (columna `rol`, lista de ids, etc.).
3. **Efecto en las tiradas.** `slotsSpin` (`api/_juegos/solo.mjs`) lee el evento activo y lo aplica. Ventajas candidatas: premios x2 o x3, más comodines (tiras alternativas en `slots.js`, p. ej. `REELS_LUCKY`), tiradas sin coste, premio mínimo garantizado cada N tiradas. Cada ventaja se calcula solo en el servidor y se devuelve en la respuesta (`event` junto a `stops`, `payout`, `balance`) para que la pantalla la pinte. Se mantiene el techo de pagos por tirada para que no se descontrole el Score.
4. **Aviso a todos.** El `ping` de broadcast `cambio` que ya usa el juego, sin datos; cada cliente pide el estado del evento. Alternativa más barata: leerlo en la respuesta de cada acción y en un `view`/`peek` periódico. Dos cuidados: el coste de Realtime que anota la memoria del proyecto (Disk IO) y no meter texto en el payload del canal público.
5. **Pantalla.** En `Slots.jsx`: banner "ADMIN ABUSE" arriba de la máquina con las ventajas activas (iconos y texto: "Premios x2", "Más comodines"), cuenta atrás hasta `hasta`, luces del mueble en modo fiesta, aviso grande al empezar y al terminar, y etiqueta en `WinBurst` ("Con evento: x2"). Reutiliza `useCountUp`, `celebrate.css` y los sonidos de la subtarea 2. Opcional: mostrarlo también en el selector de Juegos, para que lo vea quien no está en la tragamonedas.
6. **Prueba.** Ampliar el script de simulación (3A) con un parámetro de evento para medir acierto y RTP con cada ventaja, y fijar el RTP máximo aceptable durante el evento (el usuario ha dicho que puede pasar de 100 %; elegir un tope).

Objetivo añadido por el usuario: que la gente se conecte más. Ideas que encajan (sin medir su efecto; no hay analítica de uso en Juegos): avisar de que hay evento mientras alguien está en TopCode pero fuera de Juegos (insignia en el acceso rápido de `Home.tsx`, ver A6 de `docs/juegos-mejoras.md`; el bot de Telegram solo tras verificar que puede enviar avisos sin que el usuario escriba primero); eventos con hora anunciada ("hoy a las 18:00"); y un contador "N jugadores conectados" en el banner. Cuidado con avisar a menores con demasiada insistencia: límite de frecuencia y opción de silenciar.

Quién: `backend-developer` (acciones, migración, `slotsSpin`), `frontend-developer` (banner y cuenta atrás), `sql-pro` opcional para la migración. Todos existen por nombre en `/home/haise/.claude/agents/`; no leí sus definiciones.

Orden: después de la subtarea 1 (las tiras alternativas parten de las nuevas), en paralelo la parte de servidor y la parte de pantalla con un evento simulado en local.

## Riesgos y preguntas abiertas

0. Evento: ¿cómo se reconoce a un master? ¿Qué ventajas quiere el usuario primero (x2, comodines, tiras gratis)? ¿Duración por defecto y tope de RTP durante el evento? ¿Se muestra también fuera de la tragamonedas?

1. ¿De dónde se genera `Slots.css` (`scripts/scope-css.cjs` no aparece en el repo)? Si se regenera, hay que editar el origen.
2. ¿Hay tests automáticos? No los he encontrado en el proyecto. Sin ellos, la simulación es la única red de seguridad para las reglas.
3. RTP y Score: las tiradas cuentan en el saldo semanal. Subir la frecuencia sin cuidar los pagos puede superar el 100 % y romper el ranking. El rango 95-98 % es una propuesta mía, no un requisito del usuario; confirmarlo.
4. Pago por 2 cerezas: cambia la regla visible («3, 4 o 5 iguales») y tres sitios de la UI. Decidir si merece la pena o basta con comodines y tiras más densas.
5. Sin cifras actuales: no sé cuál es hoy la frecuencia de acierto ni el RTP. El paso 1 del orden de ejecución lo resuelve.
6. Las animaciones nuevas deben respetar `prefers-reduced-motion` y no empeorar el rendimiento en móvil (muchas luces animadas con `filter` son caras).
7. Los símbolos y colores deben seguir sin vocabulario de casino fuera de la sección Juegos, como en el resto del proyecto (criterio ya aplicado en `docs/juegos-mejoras.md`).

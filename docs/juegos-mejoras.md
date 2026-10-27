# Juegos de TopCode: mejoras de experiencia y plan de trabajo

Fecha: 2026-10-15. Basado en la lectura de `packages/web/src/juegos/` (Juegos.jsx, useJuegos.js, table/Table.jsx, table/Chat.jsx, poker/PokerTable.jsx, Scoreboard.jsx, wallet.js), `api/juegos.mjs` y `api/_juegos/` (game.mjs, auth.mjs, schema.mjs, engine/lobby.mjs, engine/room.mjs, engine/timers.mjs, cabeceras de engine/poker-room.mjs).

Las estimaciones de esfuerzo son orientativas (días de una persona), no medidas. Los puntos marcados «a confirmar» salen de leer el código y conviene comprobarlos con una prueba antes de arreglarlos.

## 1. Cómo funciona hoy (lo que condiciona las ideas)

- Cada acción es un `POST /api/juegos`. `withTable` abre la mesa con `select ... for update`, aplica la acción y guarda. Después se manda un broadcast `cambio` (sin datos) por Supabase Realtime, y cada cliente pide su vista con otra petición (debounce de 60 ms en mesa, 400 ms en el selector). Cada cambio cuesta, como mínimo, petición + escritura + ping + N peticiones de vista.
- Los temporizadores no existen en el servidor (`storedTimers`): quedan en `room.pending` y los dispara la primera petición posterior al vencimiento. Cada navegador manda `tick` cuando vence `wakeIn`, con 150-400 ms de margen aleatorio. Si todos cierran la pestaña, la mesa se queda quieta hasta la siguiente petición.
- Presencia: el latido (`view`) es cada 20 s en mesa y 15 s en el selector. En el servidor, `AWAY_MS` = 45 s (se marca «Sin conexión», y en blackjack se planta si era su turno) y `GONE_MS` = 3 min (se le saca de la mesa).
- El selector (`lobby()`) lee el JSON guardado de cada mesa y muestra caras, jugadores, mirones y conectados (`juegos_cuentas.visto` en los últimos 60 s). `summary()` calcula `phase`, pero `LiveGame` no lo usa.
- Chat: `postChat` (comprobación de ritmo + insert + ping) y después un `withTable` completo (con bloqueo) solo para devolver la vista. Se guardan 50 mensajes, 200 caracteres, 700 ms entre mensajes, borrado a los 7 días en el reinicio. `Chat.jsx` ya sabe pintar mensajes de sistema (`from === null`), pero nada los genera, y `juegos_chat.usuario_id` es `not null`.
- `ensureSchema` solo ejecuta `SCHEMA_SQL` si no existe `juegos_chat`. Cualquier columna o tabla nueva exige una migración en `supabase/` (además de actualizar `schema.mjs`).
- Los archivos de `api/_juegos/engine/*` y los CSS generados no se editan a mano: los cambios de reglas del motor se hacen en el proyecto «Rule» y se re-exportan con `scripts/export-topcode.mjs`. Lo editable aquí: `game.mjs`, `auth.mjs`, `db.mjs`, `schema.mjs`, `api/juegos.mjs` y el front que no sea generado (confirmar cuáles CSS son generados antes de tocarlos).
- Ruleta, tragamonedas y blackjack en solitario viven en el navegador (`wallet.js`, banco de 1.000 en `localStorage`); ni usan el saldo del servidor ni cuentan en el Score.

## 2. Hallazgos que cambian las prioridades

1. **La presencia de quien espera parece no guardarse (a confirmar, importante).** En `withTable`, `seen` se actualiza en memoria con cada latido, pero la fila solo se escribe si `room.rev` cambió o hubo `presence`. Un jugador solo en una mesa de póker esperando rival mantiene el latido, pero su `seen` guardado se queda en el instante de la última escritura. Cuando otra persona entra o mira, el servidor ve `idle` grande: lo marca ausente (`Sin conexión`) tras 45 s y lo expulsa tras 3 min (`room.leave`), aunque siga en la pestaña. Es justo el caso «entro, espero y llega alguien». Arreglo previsto en `game.mjs`: persistir `seen` si lleva más de ~15 s sin guardarse (una escritura por jugador cada 15-20 s).
2. **El selector puede mostrar fantasmas.** `lobby()` no aplica ninguna regla de presencia: si alguien cierra la pestaña sentado y nadie más toca esa mesa, sigue apareciendo como «1 jugando» y en `people`, y `pickTable` prefiere «la mesa más llena», así que puede mandar a alguien a una mesa vacía de gente real.
3. **El blackjack bloquea la apuesta por defecto.** Al sentarse, `bet = min(100, saldo)`; al vencer `BET_MS` (20 s), `onTimer.bets` bloquea la apuesta de todos los asientos sin confirmar. Un jugador con la pestaña abierta pero ausente seguirá apostando 100 € por ronda mientras haya latido. No hay «sentado pero fuera» ni expulsión por inactividad en rondas. Es cambio de reglas del motor (Rule), pero se puede cubrir en parte desde `game.mjs`.
4. **Un `view` o un mensaje de chat cuestan lo mismo que una jugada.** Cada aviso `cambio` (incluidos los del chat) hace que todos los de la mesa pidan una vista que toma `for update` sobre la fila de la mesa. Más chat = más contención con las jugadas (error `BUSY`, «La mesa está muy concurrida»).
5. **Alerta de turno desigual.** `PokerTable.jsx` importa `playTurn` y muestra «¡Es tu turno!»; `table/Table.jsx` (blackjack) no tiene sonido ni aviso de turno. Con la pestaña oculta, los temporizadores del navegador pueden espaciarse, lo que agrava los puntos 1 y 3 (a confirmar con una prueba real en móvil).
6. **Ya existe y no hay que reinventarlo:** avatares de TopCode (`Avatar`), caras en las tarjetas, contador de conectados, mirones por mesa, podio de la semana pasada en `Scoreboard`, evolución diaria, tecla de atajos en póker, mesas extra automáticas (hasta 6 por juego), `leave_room`/`stand_up`, chat por mesa con contador de no leídos.

## 3. Mejoras priorizadas

### Grupo A: rápidas e impactantes (0,5-2 días cada una)

| # | Mejora | Qué incluye | Archivos | Riesgos |
|---|--------|-------------|----------|---------|
| A1 | **Presencia fiable y selector veraz** (hallazgos 1 y 2) | Persistir `seen` con límite de frecuencia. En `summary()` descartar de `players`/`people` a quien lleve más de `AWAY_MS` sin señales (o mostrarlo atenuado). Dar a `pickTable` un resumen sin fantasmas. Barrer mesas sin gente real al pedir el selector (solo lectura o con un único `UPDATE` ligero). | `api/_juegos/game.mjs` (`withTable`, `summary`, `lobby`, `joinPublic`). No tocar `engine/lobby.mjs`. | Más escrituras a Postgres (una por jugador cada ~15-20 s). Probar que no reintroduce `BUSY`. Cuidado con no sacar a quien solo tiene la pestaña dormida. |
| A2 | **Estado de espera claro** | En el selector, usar `phase` y `players`: «Esperando rival (1/6)», «Mano en curso», «Mesa libre». En la mesa de póker, mensaje explícito «necesitas un segundo jugador» con botones de invitar y de pasar a mirar. Avisos efímeros «X se sienta/se levanta/se va» derivados de la diferencia entre estados (`PokerTable` ya compara estados para su registro de eventos). | `Juegos.jsx` (`LiveGame`), `table/Table.jsx`, `poker/PokerTable.jsx`, CSS no generado | Poco. Texto neutro: sin vocabulario de casino fuera de «Juegos». |
| A3 | **Invitar con un enlace** | `/juegos?juego=poker` (y opcional `&mesa=CODIGO`) abre directamente la pantalla `Joining`. Botón «Invitar» que copia el enlace o usa `navigator.share` en móvil. Sin tocar el servidor: ya existe `join_public` con `code`. | `Juegos.jsx` (leer parámetros con `useSearchParams` de react-router), `Table.jsx`, `PokerTable.jsx` | Que el enlace pase por el login de TopCode (`ProtectedRoute`) y conserve el destino; comprobarlo. |
| A4 | **Avisos de turno y pestaña oculta** (hallazgo 5) | Sonido `playTurn` y banner también en blackjack; `document.title` con «(Tu turno)» mientras la pestaña esté oculta; vibración en móvil donde exista; al volver a la pestaña (`visibilitychange`) lanzar `view` al momento para refrescar presencia y estado. | `table/Table.jsx`, `poker/PokerTable.jsx`, `useJuegos.js`, `sound.js` | Sonido solo tras interacción previa (política del navegador); respetar el interruptor de sonido existente. |
| A5 | **Resumen semanal más visible** | En `ScoreCard`: diferencia de hoy y puestos subidos/bajados, calculados con `days` (ya llega por jugador). Mostrar la ventaja sobre el siguiente puesto. El podio de la semana pasada ya está en `Scoreboard`: sacarlo también al selector durante el lunes. | `Juegos.jsx` (`ScoreCard`), `Scoreboard.jsx` | Ninguno relevante. Es solo front, con datos existentes. |
| A6 | **Contador de jugando en el inicio de TopCode** | Una acción de solo lectura `peek` (sin `touchAccount`, para no marcar como «conectado a Juegos» a quien solo mira la portada) y un indicador en el acceso rápido de `Home.tsx`. | `api/_juegos/game.mjs`, `packages/web/src/pages/Home.tsx` | No usar `lobby` tal cual: `handle` hace `touchAccount` en cada petición y actualiza `visto`. Cuidar que no se vea como casino en la portada. |

### Grupo B: medianas (2-5 días cada una)

| # | Mejora | Qué incluye | Archivos | Riesgos |
|---|--------|-------------|----------|---------|
| B1 | **Vista y chat sin bloqueo; menos peticiones** | (a) `view` sin cambios: leer primero sin `for update` y solo bloquear si hay temporizador vencido o hay que escribir; (b) acción `chat_poll` ligera (sin `withTable`) y evento de broadcast distinto (`chat`) para que un mensaje no dispare una vista completa de todos; (c) vista condicional por `version` (respuesta mínima «sin cambios»); (d) elegir quién manda `tick` (por ejemplo, el jugador al que le toca y, de segundo, el resto con retraso creciente por asiento) en vez de que todos lo intenten con 150-400 ms de azar. | `game.mjs`, `auth.mjs` (`ping` con nombre de evento), `useJuegos.js` | Es el cambio con más riesgo de regresión: toca el camino crítico. No poner el texto del chat en el payload del broadcast: el canal es público con la clave anon. Pruebas de concurrencia obligatorias. |
| B2 | **Avisos «hay partida» y invitaciones** | Suscripción por usuario y juego (opt-in, con silencio). Cuando una mesa de póker pasa de 0 a 1 jugador, avisar a los suscritos que no estén conectados a Juegos: primero dentro de TopCode (insignia en el acceso rápido) y después por el bot de Telegram. Límites: máximo un aviso por juego y persona cada X minutos, horas de silencio, y «solo si lleva esperando más de 2 min». | Migración nueva `supabase/migracion_juegos_avisos.sql` y `schema.mjs`; `game.mjs`; `supabase/functions/telegram-bot/*` (hoy: `handler.ts`, `db.ts`, `telegram.ts`, `tipos.ts`); `pages/Profile.tsx` (ajustes) | Hay que **verificar** cómo envía hoy el bot mensajes proactivos (hay tablas `telegram_vinculos` y «pendientes», y `tipos_evento` en migraciones; no he leído el envío saliente) y dónde viven el token y los secretos (Supabase vs Vercel). Spam, privacidad (revela quién está jugando; por eso opt-in) y horario de clase. |
| B3 | **Chat: reacciones, mensajes de sistema y moderación básica** | Reacciones rápidas (emoji de una lista cerrada) con el mismo ritmo máximo del chat; mensajes de sistema persistentes (requiere `usuario_id` nulo → migración) o solo efímeros en cliente (sin migración); silenciar a alguien (local, `localStorage`); reportar mensaje; filtro en servidor de enlaces y repetición; borrar mensajes por un administrador de TopCode. | `table/Chat.jsx`, `chat.css`, `game.mjs` (`cleanText`, `postChat`), `schema.mjs` + migración | **No he verificado** cómo se identifica a un administrador en TopCode (en `api/_juegos` no hay lógica de roles); hay que consultarlo antes de prometer «borrar». Moderar un chat de menores o adolescentes exige criterio del centro. |
| B4 | **Jugadores ausentes y sentados sin actuar** | Sentarse en «fuera» (sit-out); tras N rondas sin ninguna acción manual, levantar al jugador con aviso previo; indicador visual claro de «ausente». Desde `game.mjs` se puede cubrir contando acciones por miembro y llamando a `room.standUp`; la versión completa (que no apueste solo) es un cambio de reglas en Rule. | `game.mjs` (y, en Rule, `room.mjs`/`poker-room.mjs`), `Table.jsx`, `PokerTable.jsx` | Reexportar el motor desde Rule. No expulsar a quien está pensando: distinguir turno propio de inactividad. |
| B5 | **Historial de manos y juego limpio** | Registrar cada mano terminada (participantes, bote, resultado, transferencias entre jugadores en póker). Tabla de solo lectura para los jugadores («Mis últimas manos»). Alerta interna sencilla si una pareja concentra transferencias grandes en una semana (colusión o «regalar fichas» para subir a un amigo en el Score). | Migración + `game.mjs`; el motor ya conoce el resultado de cada mano (si hay un hook en `engine/*`, pedirlo en Rule) | Solo hay ~19 usuarios aprobados: la aprobación de cuentas ya frena las multicuentas, así que la colusión es el riesgo real. No hacer ranking de «sospechosos» público. |
| B6 | **Perfil e identidad** | Nombre y avatar enlazados al perfil de TopCode (si existe ruta de perfil público: **no verificada**), estadísticas semanales (mejor día, manos jugadas) y logros simples. | `Avatar.jsx`, `Scoreboard.jsx`, tabla de estadísticas nueva | Dependen de la existencia y privacidad del perfil público. Logros: pocos y que no premien apostar más. |
| B7 | **Móvil y accesibilidad** | Revisar los asientos en arco y la caja de apuestas en pantallas estrechas; botones ≥ 44 px; `aria-live` solo para eventos útiles (hoy el estado y el registro son `aria-live`, con riesgo de ruido); contraste y foco visible; no depender solo del color para «ausente» o «tu turno»; modo reducido de animaciones (`prefers-reduced-motion`). | `table.css`, `poker.css`, `Blackjack.css` (comprobar cuáles son generados), `Chat.jsx` | Si algún CSS se genera desde Rule, el arreglo debe hacerse en el origen. |

### Grupo C: grandes (1-2 semanas o más)

| # | Mejora | Qué incluye | Archivos | Riesgos |
|---|--------|-------------|----------|---------|
| C1 | **Ruleta, tragamonedas y blackjack en solitario con el saldo del servidor (deuda conocida)** | Acciones nuevas en `game.mjs` que resuelven la jugada con `randomInt` de Node y ajustan `juegos_cuentas` en una sola transacción: `solo_roulette` y `solo_slots` (sin estado) y blackjack solo, que necesita estado entre jugadas (por ejemplo, una mesa privada de un asiento reutilizando `Room`, o una columna `solo jsonb` en `juegos_cuentas`). Las reglas de pagos hoy están en `roulette.js`, `slots.js` y `blackjack.js` del front; el motor en `engine/` solo tiene `blackjack-core` y `poker-core`, así que ruleta y tragamonedas **hay que llevarlas al servidor** (idealmente desde Rule, para no duplicar). Quitar `wallet.js`/«Saldo solo» del selector. | `game.mjs`, nuevo `engine/` exportado, `Roulette.jsx`, `Slots.jsx`, `Blackjack.jsx`, `Juegos.jsx`, `useJuegos.js`, migración si hace falta | Mientras corra en el cliente, cualquiera puede falsear el resultado; al contar para el Score hay que resolverlo siempre en el servidor. Porcentaje de retorno de la ruleta/tragamonedas: si es mayor que 100 %, se puede «cultivar» el Score; comprobarlo (no medido). Decisión de producto: ¿los solos deben compartir el saldo semanal? Pueden vaciar o inflar el Score y desplazar a las mesas. Alternativas: tope diario, banco aparte con su propio Score. Un giro = una petición + una escritura: aceptable en latencia, pero el giro automático de la tragamonedas necesita un ritmo mínimo. |
| C2 | **Mesas con estado en el servidor (cambio de modelo)** | Eliminar la dependencia de «los navegadores avanzan los temporizadores»: un cron (Vercel Cron o Supabase `pg_cron`) que llame a una función `sweep` cada minuto para mesas con `pending` vencido y para presencia. | `api/` nueva, `vercel.json`, `game.mjs` | Los crons de Vercel tienen resolución mínima y límites según plan (**no verificado** para este proyecto): no sustituyen al `tick` del navegador a escala de segundos; sirven para limpiar y no dejar mesas «congeladas». Para un grupo de 19 personas probablemente no compense hasta que haya un problema real. |
| C3 | **Torneos y eventos semanales** | Mesas programadas («póker del viernes en el recreo») con inscripción, ciegas crecientes y premio simbólico en el Score; recordatorio por el bot. | Nuevas tablas, `game.mjs`, motor en Rule | Reglas de póker de torneo no existen en el motor; es trabajo de Rule. Evaluar el interés real antes. |

## 4. Orden de ejecución recomendado

1. A1 (presencia y selector), con una prueba que reproduzca el hallazgo 1 primero. Es la base de todo lo demás: si la presencia miente, los avisos, la espera y el ranking de mesas también.
2. A2 + A3 + A4 en paralelo con A5 (todo front, sin dependencias entre sí salvo que A2 usa los datos corregidos por A1).
3. B1 (rendimiento) antes de B2 y B3, porque ambos añaden tráfico a la ruta crítica.
4. B2, B3, B4 en paralelo cuando B1 esté en producción.
5. C1 después de decidir la pregunta de producto de la sección 6; C2 y C3 solo si hay síntomas o demanda.

## 5. Plan de agentes para las 5 primeras

Agentes: de las 160 definiciones que encontró `Glob` en `/home/haise/.claude/agents/*.md` solo he leído la cabecera (nombre, descripción, herramientas) de las 18 que uso o descarto aquí. Si el equipo usa otro directorio de agentes, hay que revisar este reparto.

Herramientas relevantes: `frontend-developer`, `ui-designer`, `backend-developer`, `websocket-engineer`, `webhook-engineer`, `game-developer` y `fullstack-developer` tienen `Read, Write, Edit, Bash, Glob, Grep`. `qa-expert` tiene `Read, Grep, Glob, Bash`: puede ejecutar y analizar pruebas, pero **no puede escribir ni editar archivos**, así que los tests nuevos los escribe otro agente con `Edit`/`Write`. `ux-researcher` y `cohort-analysis` solo leen y buscan: sin datos de uso exportados no tienen sobre qué trabajar (no hay analítica de Juegos todavía).

### Prioridad 1: A1 Presencia fiable y selector veraz

| Orden | Agente | Parte | Entrega / traspaso |
|-------|--------|-------|--------------------|
| 1 | `qa-expert` | Diseñar el caso que reproduce el hallazgo 1 (A espera sola, B entra a los 4 minutos, A debe seguir sentado) y el de los fantasmas en el selector. Usa Bash para ejecutar las pruebas existentes del repo si las hay. | Descripción del caso en `docs/juegos-mejoras-qa.md` (opcional, solo si el orquestador acepta ese archivo) o en el mensaje al siguiente agente |
| 2 | `backend-developer` | Implementar la persistencia de `seen` limitada, el filtro de presencia en `summary()` y el uso en `joinPublic` (solo `game.mjs`). Escribe también la prueba que reproduce el fallo, partiendo del caso de `qa-expert`. | Cambios en `api/_juegos/game.mjs` y tests |
| 3 | `qa-expert` | Re-ejecutar y confirmar que el fallo ya no ocurre y que no hay regresión de `BUSY`. | Veredicto al orquestador |

Alternativa razonable: `sql-pro` para revisar el coste de las escrituras y el índice si el selector empieza a leer más. Opcional.

### Prioridad 2: A2 + A3 Espera clara e invitación por enlace

| Orden | Agente | Parte | Entrega / traspaso |
|-------|--------|-------|--------------------|
| 1 | `ui-designer` | Estados de espera de póker y selector (textos, jerarquía, botón Invitar, estado «ausente» que no dependa solo del color), siempre sin vocabulario de casino fuera de «Juegos». | Propuesta de componentes y copys para `frontend-developer` |
| 2 | `frontend-developer` | Implementar `LiveGame`, `Joining` con parámetros de URL, botón de invitar (copiar/`navigator.share`) y toasts derivados de la diferencia de estados. Después de A1, para usar sus datos. | Cambios en `Juegos.jsx`, `Table.jsx`, `PokerTable.jsx` |
| 3 | `qa-expert` | Comprobar el flujo con un enlace pegado sin sesión iniciada (login y destino), móvil estrecho y teclado. | Informe |

`mobile-developer` está definido para React Native/Flutter: no encaja aquí (es una web responsive); lo cubren `ui-designer` y `frontend-developer`.

### Prioridad 3: A4 + B1 Turno, pestaña oculta y menos peticiones

| Orden | Agente | Parte | Entrega / traspaso |
|-------|--------|-------|--------------------|
| 1 | `websocket-engineer` | Diseñar (solo diseño, antes de código) el protocolo de aviso: evento `chat` separado, vista condicional por `version`, elección del emisor de `tick`. Su definición habla de WebSocket/Socket.IO a escala; aquí el medio es Supabase Realtime broadcast + HTTP, así que la adaptación es mía y hay que decírselo en el encargo: no debe proponer un servidor propio. | Documento de diseño en `docs/` (a decidir con el usuario) |
| 2 | `backend-developer` | Implementar los cambios de `game.mjs`/`auth.mjs` (lectura sin bloqueo, `chat_poll`, `ping` con evento). | Cambios en `api/_juegos/` |
| 3 | `frontend-developer` | Adaptar `useJuegos.js` (nuevo evento, `visibilitychange`, `tick` condicionado) y los avisos de turno de `Table.jsx`. | Cambios en el front |
| 4 | `qa-expert` | Prueba de concurrencia: 6 clientes simulados en una mesa con chat activo; medir `BUSY` y el número de peticiones antes y después. | Cifras reales medidas por el propio agente |

### Prioridad 4: B2 Avisos «hay partida» por Telegram y dentro de TopCode

| Orden | Agente | Parte | Entrega / traspaso |
|-------|--------|-------|--------------------|
| 1 | `fullstack-developer` (o `backend-developer`) | Primero **leer** `supabase/functions/telegram-bot/` y documentar cómo se envían avisos hoy, dónde están los secretos y qué límites hay; si el bot no envía de forma proactiva, decir qué falta. | Nota breve con el hallazgo |
| 2 | `backend-developer` | Tabla de suscripciones, migración, disparador en `game.mjs` (mesa 0→1 jugador), límites de frecuencia y horas de silencio. | Migración + `game.mjs` |
| 3 | `webhook-engineer` | Envío saliente al bot de Telegram: reintentos con retroceso, idempotencia (que un reintento no repita el aviso) y gestión de usuarios que bloquearon el bot. Su definición cubre entrega de webhooks con reintentos e idempotencia; es un encaje parcial (Telegram `sendMessage` no es un webhook propio), pero esas prácticas aplican. | Módulo de envío |
| 4 | `frontend-developer` | Interruptor de avisos en Juegos y en el perfil (`Profile.tsx`, que ya gestiona Telegram). | Cambios en el front |
| 5 | `qa-expert` | Pruebas: sin vínculo de Telegram, usuario conectado (no avisar), límite de frecuencia. | Informe |

### Prioridad 5: C1 Solos con el saldo del servidor

| Orden | Agente | Parte | Entrega / traspaso |
|-------|--------|-------|--------------------|
| 0 | Usuario | Decidir las preguntas de la sección 6 antes de empezar. | Decisión |
| 1 | `game-developer` | Revisar `roulette.js`, `slots.js` y `blackjack.js`, y definir cómo pasarlos al servidor (módulos puros sin dependencias del navegador) y el porcentaje de retorno real. Su definición incluye mecánicas de juego y red multijugador; no tiene análisis financiero, así que el cálculo del retorno lo comprueba `qa-expert` con simulaciones. | Módulo del motor para exportar desde Rule |
| 2 | `backend-developer` | Acciones `solo_*` en `game.mjs`, transacción sobre `juegos_cuentas`, y estado del blackjack solo. | Cambios en `api/_juegos/` |
| 3 | `frontend-developer` | Cambiar `Roulette.jsx`, `Slots.jsx` y `Blackjack.jsx` a llamadas al servidor; quitar `wallet.js` del selector; gestionar latencia del giro y errores. | Cambios en el front |
| 4 | `qa-expert` | Simulación grande de giros para estimar el retorno, y pruebas de manipulación desde el cliente. | Informe |

Hueco sin agente claro: moderación del chat (B3). Entre los agentes que leí no hay uno de moderación de contenido o de seguridad de aplicaciones; `risk-manager` está orientado a riesgo empresarial y `legal-advisor` a contratos y cumplimiento, no a políticas de comunidad de un centro. Recomiendo que la política (qué se permite, quién puede borrar) la decida una persona del centro y que `backend-developer` implemente después.

Para ejecutar el plan: pasar este archivo a `workflow-orchestrator` (secuencia por prioridades) o a `multi-agent-coordinator` si se quieren lanzar en paralelo las prioridades 2 y 3 una vez cerrada la 1. Los agentes se coordinan por archivos, no por mensajes: el traspaso de cada fila es el archivo o diff indicado.

## 6. Preguntas abiertas para el usuario

1. ¿Los juegos en solitario deben compartir el saldo semanal con las mesas, o prefieres un tope diario o un banco aparte? (Decide el diseño de C1.)
2. ¿Cómo se identifica a un administrador de TopCode (¿columna `rol` en `usuarios`?) y quién modera el chat de Juegos?
3. ¿El bot de Telegram puede enviar mensajes sin que el usuario escriba primero? ¿Dónde está el token (Supabase o Vercel)?
4. ¿Existe una ruta de perfil público a la que enlazar desde los nombres? (No la he comprobado.)
5. ¿Cuáles de los CSS de `packages/web/src/juegos/` son generados desde Rule y cuáles se pueden editar? Condiciona A2, A4 y B7.
6. ¿Hay pruebas automáticas para `api/_juegos` o `packages/web`? Afecta al alcance de `qa-expert`. No he buscado tests fuera de `supabase/functions/telegram-bot/index_test.ts`.
7. ¿Qué fracción de las ~19 personas juega a la vez? Sin ese dato (no hay analítica de uso en Juegos), `ux-researcher` o `cohort-analysis` no aportan todavía; valdría la pena registrar eventos mínimos antes.

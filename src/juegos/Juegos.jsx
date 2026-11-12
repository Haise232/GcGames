import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
// Fuentes de juegos, servidas por la propia app.
import '@fontsource/abril-fatface/latin.css'
import '@fontsource-variable/instrument-sans/index.css'
import '@fontsource/lilita-one/latin.css'
// Primero los estilos base y después los de cada juego, para que las reglas de un juego (por ejemplo, las de pantallas
// estrechas) puedan cambiar las comunes. Al revés, App.css las pisaba y algunas pantallas no se adaptaban al móvil.
import './estilos/reset.css'
import './estilos/index.css'
import './estilos/App.css'
import Roulette from './roulette/Roulette.jsx'
import Crash from './crash/Crash.jsx'
import Plinko from './plinko/Plinko.jsx'
import Frog from './frog/Frog.jsx'
import Race from './race/Race.jsx'
import Tower from './tower/Tower.jsx'
import Heist from './heist/Heist.jsx'
import Auction from './auction/Auction.jsx'
import Pez from './fish/Pez.jsx'
import Loteria from './loteria/Loteria.jsx'
import Trineo from './trineo/Trineo.jsx'
import Hilo from './hilo/Hilo.jsx'
import Taller from './taller/Taller.jsx'
import Pesca from './pesca/Pesca.jsx'
import Feria from './feria/Feria.jsx'
import Soga from './soga/Soga.jsx'
import Bingo from './bingo/Bingo.jsx'
import Gacha from './gacha/Gacha.jsx'
import Elevator from './elevator/Elevator.jsx'
import Inmobiliaria from './inmo/Inmobiliaria.jsx'
import Suiza from './suiza/Suiza.jsx'
import Table from './table/Table.jsx'
import PokerTable from './poker/PokerTable.jsx'
import ChessTable from './chess/ChessTable.jsx'
import { useJuegos } from './useJuegos.js'
import Scoreboard from './hub/Scoreboard.jsx'
import BancaAvisos from './banca/BancaAvisos'
import { supabase } from '../lib/supabase'
import './hub/Lobby.css'
import './table/table.css'
import './estilos/responsive.css'
import './hub/hub.css'
// Cabecera común (volver, sonido, ayuda y título) y el fondo de cada juego: después de las hojas de cada juego.
import './estilos/chrome.css'
// Season 4 («Islas»): la estructura de las temporadas (pase…) y el tema tropical (todo .juegos-root.s4), después
// de las hojas de cada juego. La Season 5 (Navidad), justo debajo, lo tiñe todo.
import './season4/season4.css'
import './season4/s4-juegos.css'
import Pase from './season4/Pase.jsx'
import PaseToasts from './season4/PaseToasts.jsx'
// Season 5 («Navidad»): la estructura de la S4 con los colores de Navidad (s5-tinte.css, generado) y lo propio de la
// Navidad (season5.css): nieve y luces. Todo bajo .juegos-root.s5.
import './season5/s5-tinte.css'
import './season5/season5.css'
// Tema de Halloween: sus reglas (todas bajo .juegos-root.halloween) ganan a las de cada juego.
import './temas/halloween/halloween.css'
import { useHalloween } from './temas/halloween/halloween.js'
// El selector de juegos (la portada), con su hoja al final para mandar sobre las de las temporadas.
import GameSelector from './hub/Selector.jsx'
import { LIVE } from './hub/catalogo.jsx'

// Entra a una mesa pública en cuanto hay conexión; mientras tanto, una pantalla de espera.
function Joining({ juegos, request, onExit }) {
  const { conn, me, error, send } = juegos
  const sentFor = useRef(null)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    if (conn !== 'open' || !me || sentFor.current === me.id) return
    if (send({ t: 'join_public', game: request.game, as: request.as, code: request.code })) sentFor.current = me.id
  }, [conn, me, request, send])

  useEffect(() => {
    if (error && sentFor.current) setFailed(error)
  }, [error])

  return (
    <main className="app">
      <header className="top">
        <h1>{LIVE[request.game].name}</h1>
        <div className="toggles">
          <button type="button" onClick={onExit}>
            Volver
          </button>
        </div>
      </header>
      <p className="status" aria-live="polite">
        {failed || (conn === 'open' ? 'Buscando sitio en la mesa…' : 'Conectando con las mesas…')}
      </p>
      {failed && (
        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              setFailed('')
              send({ t: 'join_public', game: request.game, as: 'spectator' })
            }}
          >
            Entrar a mirar
          </button>
        </div>
      )}
    </main>
  )
}

function Notice({ title, children, actions }) {
  return (
    <main className="app">
      <header className="top">
        <h1>{title}</h1>
      </header>
      <div className="lobby-card notice">
        {children}
        <div className="actions">{actions}</div>
      </div>
    </main>
  )
}

// Pantalla en la que estabas, para que al recargar la página vuelvas al mismo juego (las mesas ya las recuerda el servidor).
const SCREEN_KEY = 'juegos-pantalla'
const KEEP = new Set(['pase', 'feria', 'soga', 'pesca', 'bingo', 'roulette', 'crash', 'fish', 'plinko', 'frog', 'race', 'elevator', 'inmo', 'suiza', 'gacha', 'score', 'tower', 'heist', 'auction', 'loteria', 'trineo', 'taller', 'hilo'])
function savedScreen() {
  try {
    const screen = sessionStorage.getItem(SCREEN_KEY)
    return KEEP.has(screen) ? { screen } : { screen: 'lobby' }
  } catch {
    return { screen: 'lobby' }
  }
}

function JuegosScreens() {
  // screen: lobby | pase | bingo | roulette | crash | fish | feria | soga | loteria | trineo | plinko | frog | race | elevator | gacha | join | score
  const [params, setParams] = useSearchParams()
  // Enlace de invitación (/?juego=poker&mesa=ABCD): entra directamente a esa mesa, o a la mejor si ya no existe.
  const [view, setView] = useState(() => {
    const game = params.get('juego')
    if (!Object.hasOwn(LIVE, game)) return savedScreen()
    return { screen: 'join', game, as: 'player', code: params.get('mesa') ?? undefined }
  })
  const juegos = useJuegos()
  useEffect(() => {
    if (params.has('juego') || params.has('mesa')) setParams({}, { replace: true })
  }, [params, setParams])
  useEffect(() => {
    try {
      if (KEEP.has(view.screen)) sessionStorage.setItem(SCREEN_KEY, view.screen)
      else sessionStorage.removeItem(SCREEN_KEY)
    } catch {
      // sin almacenamiento: al recargar se vuelve al selector
    }
  }, [view.screen])
  const exit = () => setView({ screen: 'lobby' })
  // «Ir a …» de una misión del pase: las mesas se buscan como desde el selector; lo demás es su pantalla.
  const go = (game) => {
    if (Object.hasOwn(LIVE, game)) setView({ screen: 'join', game, as: 'player' })
    else setView({ screen: game })
  }
  // Salir de Juegos es cerrar la sesión: vuelve a la pantalla de entrada.
  const home = () => supabase.auth.signOut()

  if (juegos.conn === 'denied') {
    return (
      <Notice
        title="GcGames"
        actions={
          <>
            <button type="button" className="primary" onClick={juegos.reconnect}>
              Reintentar
            </button>
            <button type="button" onClick={home}>
              Cerrar sesión
            </button>
          </>
        }
      >
        <p>{juegos.denied}</p>
      </Notice>
    )
  }

  // Dentro de una mesa manda el servidor (también al volver tras recargar la página).
  if (juegos.room) {
    const Kind = { poker: PokerTable, chess: ChessTable }[juegos.room.state.game] ?? Table
    return (
      <Kind
        room={juegos.room}
        me={juegos.me}
        conn={juegos.conn}
        error={juegos.error}
        send={juegos.send}
        request={juegos.request}
        onLeave={() => {
          juegos.leave()
          exit()
        }}
        chat={juegos.chat}
        bubbles={juegos.bubbles}
        pending={juegos.pending}
      />
    )
  }

  // Un juego que la banca ha quitado del selector (Banca → Juegos) no se abre ni desde una pantalla guardada ni desde un
  // enlace: se vuelve al selector.
  const off = (juegos.lobby?.hidden ?? []).includes(view.screen === 'join' ? view.game : view.screen)
  const screen = off ? 'lobby' : view.screen
  if (screen === 'bingo') return (<Bingo onExit={exit} juegos={juegos} />)
  if (screen === 'roulette') return (<Roulette onExit={exit} juegos={juegos} />)
  if (screen === 'crash') return (<Crash onExit={exit} juegos={juegos} />)
  if (screen === 'fish') return (<Pez onExit={exit} juegos={juegos} />)
  if (screen === 'loteria') return (<Loteria onExit={exit} juegos={juegos} />)
  if (screen === 'trineo') return (<Trineo onExit={exit} juegos={juegos} />)
  if (screen === 'pesca') return (<Pesca onExit={exit} juegos={juegos} />)
  if (screen === 'feria') return (<Feria onExit={exit} juegos={juegos} />)
  if (screen === 'soga') return (<Soga onExit={exit} juegos={juegos} />)
  if (screen === 'hilo') return (<Hilo onExit={exit} juegos={juegos} />)
  if (screen === 'taller') return (<Taller onExit={exit} juegos={juegos} />)
  if (screen === 'plinko') return (<Plinko onExit={exit} juegos={juegos} />)
  if (screen === 'frog') return (<Frog onExit={exit} juegos={juegos} />)
  if (screen === 'race') return (<Race onExit={exit} juegos={juegos} />)
  if (screen === 'tower') return (<Tower onExit={exit} juegos={juegos} />)
  if (screen === 'heist') return (<Heist onExit={exit} juegos={juegos} />)
  if (screen === 'auction') return (<Auction onExit={exit} juegos={juegos} />)
  if (screen === 'elevator') return (<Elevator onExit={exit} juegos={juegos} />)
  if (screen === 'inmo') return (<Inmobiliaria onExit={exit} juegos={juegos} />)
  if (screen === 'suiza') return (<Suiza onExit={exit} juegos={juegos} />)
  if (screen === 'gacha') return (<Gacha onExit={exit} juegos={juegos} initialTab={view.tab} />)
  if (screen === 'join') return (<Joining juegos={juegos} request={view} onExit={exit} />)
  if (screen === 'score') return (<Scoreboard juegos={juegos} onExit={exit} />)
  if (screen === 'pase') return (<Pase juegos={juegos} onExit={exit} onGo={go} />)
  return (
    <GameSelector
      juegos={juegos}
      onPick={(screen) => setView({ screen })}
      onJoin={(game, as, code) => setView({ screen: 'join', game, as, code })}
      onScore={() => setView({ screen: 'score' })}
      onGacha={(tab) => setView({ screen: 'gacha', tab })}
      onHome={home}
      onPase={() => setView({ screen: 'pase' })}
    />
  )
}

// Página principal de Juegos: todo la sección de juegos vive dentro de .juegos-root para que sus estilos no toquen el resto.
export default function Juegos() {
  // Solo el aspecto: s4 es la estructura de las temporadas (portada, pase…) y s5 la Navidad encima. Con la clase
  // .halloween se aplica halloween.css. Se mira al entrar (la ventana dura días) y al cambiarlo desde el panel de la banca.
  const halloween = useHalloween()
  return (
    <div className={halloween ? 'juegos-root s4 s5 halloween' : 'juegos-root s4 s5'}>
      <JuegosScreens />
      <BancaAvisos />
      <PaseToasts />
    </div>
  )
}

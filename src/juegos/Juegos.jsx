import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
import Bola from './bola/Bola.jsx'
import Regata from './regatta/Regata.jsx'
import Pesca from './pesca/Pesca.jsx'
import { PescaScene } from './season4/PescaArt.jsx'
import { FishScene } from './season4/FishArt.jsx'
import { LoteriaScene, TrineoScene } from './season5/NavidadArt.jsx'
import { BolaScene, HiloScene } from './season4/FiestasArt.jsx'
import { RegattaScene } from './season4/RegattaArt.jsx'
import Bingo from './bingo/Bingo.jsx'
import BingoCage from './bingo/BingoCage.jsx'
import Gacha from './gacha/Gacha.jsx'
import GachaShowcase from './gacha/GachaShowcase.jsx'
import { AuctionScene, CrashScene, ElevatorScene, FrogScene, HeistScene, PlinkoScene, RaceScene, RouletteScene, TowerScene } from './hub/HubArt.jsx'
import Elevator from './elevator/Elevator.jsx'
import Inmobiliaria from './inmo/Inmobiliaria.jsx'
import Suiza, { SuizaBanner } from './suiza/Suiza.jsx'
import Table from './table/Table.jsx'
import PokerTable from './poker/PokerTable.jsx'
import ChessTable from './chess/ChessTable.jsx'
import { useJuegos } from './useJuegos.js'
import Scoreboard from './hub/Scoreboard.jsx'
import Avatar from './comun/Avatar.jsx'
import BancaAvisos from './banca/BancaAvisos'
import Tutorial, { TUTORIAL_KEY } from './hub/Tutorial.jsx'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import Logo from '../Logo.jsx'
import { delta, eur, until } from './comun/money.js'
import { useCountUp } from './comun/useCountUp.js'
import { POT_BALL } from './bingo/bingo.js'
import './hub/Lobby.css'
import './table/table.css'
import './estilos/responsive.css'
import './hub/hub.css'
// Cabecera común (volver, sonido, ayuda y título) y el fondo de cada juego: después de las hojas de cada juego.
import './estilos/chrome.css'
// Season 4 («Islas»): la estructura de las temporadas (portada, pase…) y el tema tropical (todo .juegos-root.s4), después
// de las hojas de cada juego. La Season 5 (Navidad), justo debajo, lo tiñe todo.
import './season4/season4.css'
import './season4/s4-juegos.css'
import IslandScene from './season4/IslandScene.jsx'
import PaseStrip from './season4/PaseStrip.jsx'
import Pase from './season4/Pase.jsx'
import PaseToasts from './season4/PaseToasts.jsx'
// Season 5 («Navidad»): la estructura de la S4 con los colores de Navidad (s5-tinte.css, generado) y lo propio de la
// Navidad (season5.css): portada nevada, nieve y luces. Todo bajo .juegos-root.s5.
import './season5/s5-tinte.css'
import './season5/season5.css'
import NavidadScene from './season5/NavidadScene.jsx'
import NavidadFx, { Guirnalda } from './season5/NavidadFx.jsx'
import { navidadRgb } from './season5/tinte.js'
// Tema de Halloween: el último, para que sus reglas (todas bajo .juegos-root.halloween) ganen a las de cada juego.
import './temas/halloween/halloween.css'
import { useHalloween } from './temas/halloween/halloween.js'
import HalloweenFx, { Pumpkin } from './temas/halloween/HalloweenFx.jsx'

// Panel de la banca: solo lo abre el master, así que se carga al pulsar su botón.
const BancaPanel = lazy(() => import('./banca/BancaPanel'))

const LIVE = {
  blackjack: { name: 'Blackjack' },
  poker: { name: 'Póker' },
  chess: { name: 'Ajedrez' },
}

// Cada juego lleva su mini escena (HubArt.jsx), un color (--tint, en r, g, b) para el brillo de su tarjeta y una frase corta.
const ALL_GAMES = [
  {
    id: 'pesca',
    name: 'Campeonato de Pesca',
    kind: 'Cada 2 minutos',
    blurb: 'Todos pescáis en el mismo mar de La Restinga: lee las sombras, lanza por delante y aguanta la pelea. Los más pescadores se llevan el bote, y quien saque el marlín azul, el Bote del Marlín.',
    live: true,
    tint: '70, 224, 200',
    isNew: true,
    art: <PescaScene />,
  },
  {
    id: 'elevator',
    name: 'Ascensor',
    kind: 'Cada minuto',
    blurb: 'Todos suben a la vez y el premio crece en cada planta. Bájate antes de que se rompa el cable: el último en bajar se lleva el bonus.',
    live: true,
    tint: '255, 196, 80',
    art: <ElevatorScene />,
  },
  {
    id: 'roulette',
    name: 'Ruleta',
    kind: 'Cada 25 s',
    blurb: 'Una tirada para todos cada 25 s. Apuesta y mira caer la bola.',
    live: true,
    tint: '226, 70, 60',
    art: <RouletteScene />,
  },
  {
    id: 'crash',
    name: 'Cohete',
    kind: 'Cada 30 s',
    blurb: 'Sube para todos cada 30 s. Retira a tiempo.',
    live: true,
    tint: '95, 170, 255',
    art: <CrashScene />,
  },
  {
    id: 'race',
    name: 'Carrera',
    kind: 'Cada 55 s',
    blurb: 'Una carrera cada 55 s. Apuesta a un coche y cobra si acaba en el podio.',
    live: true,
    tint: '255, 138, 60',
    art: <RaceScene />,
  },
  {
    id: 'regatta',
    name: 'Regata',
    kind: 'Cada 44 s',
    blurb: 'Tormenta, remolino, Kraken… cada regata trae su clima. Apuesta al ganador, a la exacta o al trío y cobra hasta ×3.000.',
    live: true,
    tint: '143, 227, 255',
    isNew: true,
    art: <RegattaScene />,
  },
  {
    id: 'fish',
    name: 'Pez Gordo',
    kind: 'Come y crece',
    blurb: 'Come plancton y peces más pequeños, hazte enorme y que no te coma un tiburón. Cuanto más pesas, más cobras al salir del agua.',
    tint: '46, 230, 208',
    isNew: false,
    art: <FishScene />,
  },
  {
    id: 'loteria',
    name: 'Lotería de Navidad',
    kind: 'Sorteo extraordinario',
    blurb: 'Compra un décimo con tu número y escucha cantar el sorteo: quintos, cuartos, tercero, segundo… y el Gordo, que paga ×400.',
    tint: '248, 197, 78',
    isNew: true,
    art: <LoteriaScene />,
  },
  {
    id: 'trineo',
    name: 'El Trineo de Papá Noel',
    kind: 'Reparte y cobra',
    blurb: 'Nochebuena: elige casita, bloque o rascacielos en cada parada. Cada regalo entregado sube el premio; si te pillan, lo pierdes.',
    tint: '224, 48, 60',
    isNew: true,
    art: <TrineoScene />,
  },
  {
    id: 'hilo',
    name: 'Mayor o Menor',
    kind: 'Baraja española',
    blurb: 'En la mesa del guachinche: ¿la siguiente carta será mayor o menor? Cada acierto sube el premio. Cobra antes de fallar.',
    tint: '232, 68, 58',
    isNew: false,
    art: <HiloScene />,
  },
  {
    id: 'bola',
    name: 'Bola Canaria',
    kind: 'Arrima y cobra',
    blurb: 'Tira tu bola en la cancha de tierra: cuanto más cerca del mingue, más cobras. Arrima suave o arriesga con un bochazo ×25.',
    tint: '217, 168, 106',
    isNew: false,
    art: <BolaScene />,
  },
  {
    id: 'plinko',
    name: 'Plinko',
    kind: 'Suerte',
    blurb: 'Suelta bolas y que caigan en las orillas.',
    tint: '176, 108, 255',
    art: <PlinkoScene />,
  },
  {
    id: 'frog',
    name: 'Rana',
    kind: 'Riesgo',
    blurb: 'Salta de nenúfar en nenúfar y cobra cuando quieras.',
    tint: '124, 207, 74',
    art: <FrogScene />,
  },
  {
    id: 'tower',
    name: 'La Torre',
    kind: 'Escalada',
    blurb: 'Sube piso a piso sin pisar una baldosa rota. Récord del día para el mejor golpe.',
    tint: '110, 123, 240',
    art: <TowerScene />,
  },
  {
    id: 'heist',
    name: 'El Atraco',
    kind: 'En banda',
    blurb: 'Monta tu banda con tus cartas del gacha y baja a la cámara acorazada. Huye antes de que os pillen.',
    tint: '255, 210, 94',
    art: <HeistScene />,
  },
  {
    id: 'auction',
    name: 'La Subasta',
    kind: 'Cada minuto',
    blurb: 'Siete cajas misteriosas, pujas a la vista y prórroga en los últimos segundos. Puede ser el jackpot… o una piedra.',
    live: true,
    tint: '177, 132, 255',
    art: <AuctionScene />,
  },
]

// Season 4: los juegos se agrupan por cómo se juegan. Primero los de ronda común (todos a la vez, con la gente) y luego
// los de a tu ritmo.
const byId = Object.fromEntries(ALL_GAMES.map((g) => [g.id, g]))
const ROUND_GAMES = ['pesca', 'regatta', 'elevator', 'auction', 'roulette', 'crash', 'race'].map((id) => byId[id])
const PACE_GAMES = ['loteria', 'trineo', 'hilo', 'bola', 'fish', 'tower', 'heist', 'plinko', 'frog'].map((id) => byId[id])

// La Inmobiliaria, destacada arriba del todo: un trozo de tablero con sus casas y un hotel.
function InmoBanner({ onOpen }) {
  const bands = ['#8a5a33', '#8fd3f0', '#d9479a', '#f08a24', '#e0322b', '#f5d020', '#22a35a', '#1f4fb5']
  return (
    <button type="button" className="im-banner" onClick={onOpen}>
      <span>
        <span className="im-banner__new">Nuevo</span>
        <h3>Inmobiliaria</h3>
        <p>Compra calles de Canarias, pon casas y hoteles y cobra alquiler cada hora. Y en las 7 islas, 168 propiedades más, cada isla con su tablero y su ciudad: hoteles, bodegas, plataneras, barcos…</p>
        <span className="im-banner__cta">Ver el tablero</span>
      </span>
      <svg viewBox="0 0 200 110" aria-hidden="true">
        {bands.map((color, i) => (
          <g key={color} transform={`translate(${6 + i * 24} 70)`}>
            <rect width="22" height="34" rx="2" fill="#e9f1e4" />
            <rect width="22" height="9" rx="2" fill={color} />
          </g>
        ))}
        {[
          [14, 30, 3],
          [40, 18, 1],
          [64, 44, 5],
          [92, 24, 2],
          [118, 52, 5],
          [146, 30, 4],
          [172, 16, 1],
        ].map(([x, h, lv], k) => (
          <g key={k}>
            <rect x={x} y={66 - h} width={lv === 5 ? 18 : 12} height={h} fill={lv === 5 ? '#2a1d33' : '#1c2433'} />
            <rect x={x} y={66 - h} width={lv === 5 ? 18 : 12} height="3" fill={bands[k]} />
            {Array.from({ length: Math.floor(h / 8) }, (_, w) => (
              <rect key={w} x={x + 3} y={66 - h + 6 + w * 8} width={lv === 5 ? 12 : 6} height="3" fill="#ffd98a" opacity="0.8" />
            ))}
          </g>
        ))}
      </svg>
    </button>
  )
}

// Grupo de WhatsApp de Juegos: avisos de los Admin Abuse y de cuánto lleva el bote del Bingo.
const WHATSAPP_URL = 'https://chat.whatsapp.com/KLOlli4i1X94Mn6wJFFbwH'
const WHATSAPP_SEEN_KEY = 'juegos-whatsapp-visto' // quien cierra el aviso ya no lo vuelve a ver (el botón sigue arriba)
const whatsappSeen = () => {
  try {
    return localStorage.getItem(WHATSAPP_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="hub-wa__icon">
      <path d="M12 2.2A9.8 9.8 0 0 0 3.6 17l-1.4 4.8 5-1.3A9.8 9.8 0 1 0 12 2.2Zm0 17.8a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.2.1-.1 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1 .1-1.2-.1-.1-.2-.2-.4-.3Z" />
    </svg>
  )
}

// Asientos de las mesas públicas (igual que en el servidor) para dibujar la mesa antes de que llegue el lobby.
const SEATS = { blackjack: 7, poker: 6, chess: 2 }
const CAPTION = { blackjack: 'Contra el crupier', poker: 'Ciegas de 50 y 100 €', chess: 'Uno contra uno, con apuesta' }

// Posición de cada asiento en la mini mesa, en % del recuadro. Póker: óvalo completo. Blackjack: arco bajo el crupier.
// Ajedrez: uno a cada lado del tablero.
function seatSpot(i, n, game) {
  if (game === 'chess') return { left: i === 0 ? '13%' : '87%', top: '50%' }
  const [from, span] = game === 'blackjack' ? [162, -144] : [90, 360]
  const deg = game === 'blackjack' ? from + (span * i) / (n - 1) : from + (span * i) / n
  const rad = (deg * Math.PI) / 180
  const cy = game === 'blackjack' ? 34 : 50
  const ry = game === 'blackjack' ? 54 : 46
  return { left: `${50 + 45 * Math.cos(rad)}%`, top: `${cy + ry * Math.sin(rad)}%` }
}

// Texto y tono del estado de una mesa.
function tableState(game, t) {
  if (!t || t.players === 0) return { tone: 'free', text: 'Mesa libre' }
  if (game === 'chess') {
    if (t.phase === 'playing') return { tone: 'hand', text: 'Partida en curso' }
    return t.players === 1 ? { tone: 'wait', text: 'Busca rival' } : { tone: 'on', text: 'Acordando la apuesta' }
  }
  if (game === 'poker' && t.phase === 'waiting') {
    return t.players === 1 ? { tone: 'wait', text: `Espera rival ${t.players}/${t.seats}` } : { tone: 'on', text: `${t.players} jugando` }
  }
  if (t.phase !== 'waiting' && t.phase !== 'betting') return { tone: 'hand', text: 'Mano en curso' }
  return { tone: 'on', text: `${t.players} jugando` }
}

// La mesa que se dibuja: la elegida, o la que tiene gente y sitio (así quien llega se sienta con alguien).
function bestTable(tables, picked) {
  const chosen = tables.find((t) => t.code === picked)
  if (chosen) return chosen
  const open = tables.filter((t) => t.players < t.seats)
  return [...open].sort((a, b) => b.players - a.players)[0] ?? tables[0]
}

// Fotos de quien está en las mesas (si no hay, iniciales), solapadas.
function Faces({ people }) {
  if (people.length === 0) return null
  const shown = people.slice(0, 5)
  return (
    <span className="hub-faces" role="img" aria-label={`En las mesas: ${people.map((p) => p.name).join(', ')}`}>
      {shown.map((p, i) => (
        <span key={`${p.name}-${i}`} title={p.name}>
          <Avatar name={p.name} src={p.avatar} size={30} />
        </span>
      ))}
      {people.length > shown.length && <i>+{people.length - shown.length}</i>}
    </span>
  )
}

// Delta de hoy y distancia al siguiente puesto, solo con los datos del Score.
function standing(scores, me) {
  const list = scores?.players ?? []
  const mine = list.find((p) => p.me)
  if (!mine) return { mine: null, count: list.length, today: null, gap: null }
  const day = scores.week?.day ?? 0
  const known = mine.days.slice(0, day + 1).filter((v) => v !== null)
  const base = day > 0 ? (mine.days[day - 1] ?? scores.starting) : scores.starting
  const today = known.length ? mine.balance - base : 0
  const ahead = list[mine.rank - 2]
  const behind = list[mine.rank]
  let gap = null
  if (ahead) gap = { text: `A ${eur(ahead.balance - mine.balance)} del puesto ${ahead.rank}`, up: true }
  else if (behind) gap = { text: `Vas primero, ${eur(mine.balance - behind.balance)} por delante`, up: false }
  return { mine, count: list.length, today, gap }
}

// El Bingo en el menú: la jaula con el bote a la vista de todos, si el bote está abierto y cuánto falta para la siguiente partida.
function BingoBanner({ info, online, onOpen }) {
  const pot = info?.pot ?? 0
  const shown = useCountUp(pot, 1200)
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  const left = info ? Math.max(0, info.next - Date.now()) : null
  const clock = left === null ? '' : `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`
  const when = !info ? 'Conectando…' : info.phase === 'buy' && left > 0 ? `Venta de cartones · empieza en ${clock}` : `Partida en juego · la siguiente en ${clock}`
  const open = Boolean(info?.bote?.abierto)
  return (
    <button type="button" className={`hub-bingo ${open ? 'is-open' : ''}`} disabled={!online} onClick={onOpen}>
      <span className="hub-bingo__stage" aria-hidden="true">
        <BingoCage pot={pot} className="hub-bingo__cage" />
      </span>
      <span className="hub-bingo__body">
        <span className="hub-bingo__tags">
          <em className="hub-pill">En vivo</em>
          {info?.bote && <em className={`hub-bote ${open ? 'hub-bote--open' : ''}`}>{open ? 'Bote abierto' : 'Bote cerrado'}</em>}
        </span>
        <span className="hub-bingo__name">Bingo</span>
        <span className="hub-bingo__pot">
          <small>Bote en la jaula</small>
          <b>{eur(shown)}</b>
        </span>
        <span className="hub-bingo__when">{when}</span>
        <span className="hub-bingo__blurb">
          Todo lo que se pierde en el casino, y lo que cobra Hacienda, acaba en la jaula. Canta bingo con la bola {POT_BALL} o antes, o con la bola dorada, y te la llevas entera.
          {info?.lastJackpot && ` Último bote: ${info.lastJackpot.bingo.join(', ')} (${eur(info.lastJackpot.jackpot)}).`}
        </span>
      </span>
      <span className="hub-bingo__cta" aria-hidden="true">
        Jugar <i>→</i>
      </span>
    </button>
  )
}

// Acceso al score: tu puesto en grande, tu saldo, lo de hoy, lo que falta para subir y los tres primeros.
function ScoreCard({ scores, me, resetAt, online, onOpen }) {
  const { mine, count, today, gap } = standing(scores, me)
  const top = scores?.players.slice(0, 3) ?? []
  const stale = !online && Boolean(scores)
  const usable = Boolean(scores) || online
  return (
    <button type="button" className={`hub-score ${stale ? 'hub-score--stale' : ''}`} disabled={!usable} onClick={onOpen}>
      <span className="hub-score__rank" aria-hidden={!mine}>
        {mine ? (
          <>
            <b>{mine.rank}</b>
            <small>de {count}</small>
          </>
        ) : scores ? (
          <b>–</b>
        ) : (
          <i className="hub-skel hub-skel--rank" />
        )}
      </span>
      <span className="hub-score__body">
        {mine ? (
          <>
            <span className="hub-score__line">
              <span className="hub-score__label">Puesto {mine.rank} · tu saldo</span>
              <span className="hub-score__money">{eur(mine.balance)}</span>
            </span>
            <span className="hub-score__facts">
              <span className={`hub-score__delta ${today > 0 ? 'is-up' : today < 0 ? 'is-down' : ''}`}>{delta(today)} hoy</span>
              {gap && <span>{gap.text}</span>}
            </span>
          </>
        ) : scores ? (
          <span className="hub-score__line">
            <span className="hub-score__label">Clasificación semanal</span>
            <span className="hub-score__hint">Juega una mano o una tirada para entrar.</span>
          </span>
        ) : (
          <>
            <i className="hub-skel hub-skel--line" />
            <i className="hub-skel hub-skel--short" />
          </>
        )}
      </span>
      <span className="hub-score__foot">
        {top.length > 0 && (
          <span className="hub-score__top" aria-label={`Líderes: ${top.map((p) => p.name).join(', ')}`}>
            {top.map((p) => (
              <span key={p.rank} title={`${p.rank}. ${p.name}`}>
                <Avatar name={p.name} src={p.avatar} size={28} />
              </span>
            ))}
          </span>
        )}
        <span className="hub-score__meta">{stale ? 'Último dato guardado' : resetAt ? `Reinicio en ${until(resetAt)}` : 'Ver clasificación'}</span>
        <span className="hub-score__go" aria-hidden="true">
          Ver →
        </span>
      </span>
    </button>
  )
}

// Mini mesa: el tapete con un punto por asiento (cara = ocupado, anillo = libre, atenuado = ausente).
function MiniTable({ game, table, name }) {
  const n = table?.seats ?? SEATS[game]
  const present = table?.people ?? []
  const away = table?.away ?? 0
  const seats = Array.from({ length: n }, (_, i) => {
    if (i < present.length) return { kind: 'on', person: present[i] }
    if (i < present.length + away) return { kind: 'away' }
    return { kind: 'free' }
  })
  const free = seats.filter((s) => s.kind === 'free').length
  const label = `${name}: ${present.length} de ${n} asientos ocupados${present.length ? ` (${present.map((p) => p.name).join(', ')})` : ''}${away ? `, ${away} ausente${away > 1 ? 's' : ''}` : ''}, ${free} libre${free === 1 ? '' : 's'}`
  return (
    <div className={`hub-table hub-table--${game}`} role="img" aria-label={label}>
      <span className="hub-table__felt" aria-hidden="true">
        {game === 'blackjack' && <em className="hub-table__dealer">Crupier</em>}
        {game === 'chess' && <span className="hub-table__board" />}
        <span className="hub-table__caption">{CAPTION[game]}</span>
      </span>
      {seats.map((seat, i) => (
        <span key={i} className={`hub-seat hub-seat--${seat.kind}`} style={seatSpot(i, n, game)} title={seat.person?.name}>
          {seat.kind === 'on' && <Avatar name={seat.person.name} src={seat.person.avatar} size={36} />}
        </span>
      ))}
    </div>
  )
}

function LiveSkeleton({ name }) {
  return (
    <article className="hub-live hub-live--skel" aria-busy="true" aria-label={`${name}: cargando`}>
      <div className="hub-live__head">
        <h3>{name}</h3>
        <i className="hub-skel hub-skel--chip" />
      </div>
      <div className="hub-skel hub-skel--table" />
      <div className="hub-skel hub-skel--line" />
      <div className="hub-skel hub-skel--btn" />
    </article>
  )
}

// Tarjeta de un juego en vivo: la mesa en miniatura, su estado y un botón para sentarse (o mirar), sin códigos.
function LiveGame({ game, tables, loaded, online, onJoin }) {
  const { name } = LIVE[game]
  const [picked, setPicked] = useState(null)
  if (!loaded) return <LiveSkeleton name={name} />
  const featured = bestTable(tables, picked)
  const state = tableState(game, featured)
  const players = tables.reduce((sum, t) => sum + t.players, 0)
  const watching = tables.reduce((sum, t) => sum + t.spectators, 0)
  const people = tables.flatMap((t) => t.people)
  const full = featured ? featured.players >= featured.seats : false
  const code = picked && featured?.code === picked ? picked : undefined
  const meta = [players ? `${players} jugando` : 'Nadie jugando', watching ? `${watching} mirando` : null].filter(Boolean).join(' · ')
  return (
    <article className={`hub-live hub-live--${game} ${players > 0 ? 'is-busy' : ''} ${online ? '' : 'is-stale'}`}>
      <div className="hub-live__head">
        <h3>{name}</h3>
        <span className={`hub-chip hub-chip--${online ? state.tone : 'free'}`}>
          <i aria-hidden="true" />
          {online ? state.text : 'Sin conexión'}
        </span>
      </div>
      <MiniTable game={game} table={featured} name={name} />
      <div className="hub-live__meta">
        <span>{meta}</span>
        {tables.length > 1 && <Faces people={people} />}
      </div>
      {tables.length > 1 && (
        <div className="hub-segs" role="group" aria-label={`Mesas de ${name}`}>
          {tables.map((t) => (
            <button key={t.code} type="button" className="hub-seg" aria-pressed={featured?.code === t.code} onClick={() => setPicked(t.code)}>
              <span>{t.label}</span>
              <small>
                {t.players}/{t.seats}
              </small>
            </button>
          ))}
        </div>
      )}
      <div className="hub-live__actions">
        <button type="button" className="hub-btn hub-btn--primary" disabled={!online || full} onClick={() => onJoin(game, 'player', code)}>
          {full ? 'Mesa llena' : 'Jugar'}
        </button>
        <button type="button" className="hub-btn" disabled={!online} onClick={() => onJoin(game, 'spectator', code)}>
          Mirar
        </button>
      </div>
    </article>
  )
}

// El color de cada tarjeta («r, g, b»), pasado a los colores de Navidad de la Season 5.
const navidadTint = (tint) => (typeof tint === 'string' && /^\d+,\s*\d+,\s*\d+$/.test(tint) ? navidadRgb(tint.split(',').map(Number)).join(', ') : tint)

// Tarjeta de un juego: la escena, la píldora (en vivo / nuevo), el nombre y una frase. big: las de la Season 3 del escaparate.
function GameCard({ game, big = false, connected, onPick, mission }) {
  const { id, name, kind, blurb, art, live, tint, isNew } = game
  const halloween = useHalloween()
  return (
    <button type="button" className={`hub-card hub-card--${id} ${big ? 'hub-card--big' : ''}`} style={{ '--tint': halloween ? tint : navidadTint(tint) }} disabled={!connected} onClick={() => onPick(id)}>
      <span className="ns5-cap" aria-hidden="true" />
      <span className="hub-card__art" aria-hidden="true">
        {art}
      </span>
      <span className="hub-card__tags">
        {live && <em className="hub-pill">En vivo</em>}
        {(isNew || (big && !live)) && <em className="hub-pill hub-pill--new">Nuevo</em>}
      </span>
      {mission && (
        <em className={`s4-sticker ${mission.done ? 'is-done' : ''}`} title={mission.text}>
          {mission.done ? '✓ Misión hecha' : `Misión ${mission.progress}/${mission.goal}`}
        </em>
      )}
      <span className="hub-card__body">
        <span className="hub-card__kind">{kind}</span>
        <span className="hub-card__name">{name}</span>
        <span className="hub-card__blurb">{blurb}</span>
        <span className="hub-card__cta" aria-hidden="true">
          Jugar <i>→</i>
        </span>
      </span>
    </button>
  )
}

// Barra de secciones del selector: se queda arriba al bajar y marca la sección que se está viendo.
function SectionNav({ sections }) {
  const [active, setActive] = useState(sections[0]?.id)
  const key = sections.map((s) => s.id).join()
  useEffect(() => {
    const els = key.split(',').map((id) => document.getElementById(id)).filter(Boolean)
    if (!els.length || typeof IntersectionObserver === 'undefined') return
    const seen = new Map()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        const first = els.find((el) => seen.get(el.id))
        if (first) setActive(first.id)
      },
      { rootMargin: '-80px 0px -55% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [key])
  const go = (id) => (e) => {
    e.preventDefault()
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    setActive(id)
  }
  return (
    <nav className="hub-nav" aria-label="Secciones del casino">
      <ul>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} onClick={go(s.id)} aria-current={active === s.id ? 'true' : undefined}>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function GameSelector({ juegos, onPick, onJoin, onScore, onGacha, onHome, onPase }) {
  const { me, lobby, conn, scores, send } = juegos
  const master = useAuth().usuario?.es_superadmin === true
  const [bank, setBank] = useState(false)
  const [waClosed, setWaClosed] = useState(whatsappSeen)
  const [tour, setTour] = useState(false)
  const connected = conn === 'open' && Boolean(me)
  const balance = useCountUp(me?.balance ?? 0, 900)
  const { mine, count } = standing(scores, me)
  // La guía se abre sola la primera vez que entras en la Season 5 (cuando ya está pintado el selector).
  const hubReady = Boolean(me && lobby)
  useEffect(() => {
    if (!hubReady) return
    let seen = true
    try {
      seen = localStorage.getItem(TUTORIAL_KEY) === '1'
    } catch {
      // sin almacenamiento: no se abre sola
    }
    if (seen) return
    const timer = setTimeout(() => setTour(true), 600)
    return () => clearTimeout(timer)
  }, [hubReady])
  const online = connected && Boolean(lobby)

  // El resumen del score se pide al entrar en el selector; después llega con cada sondeo del lobby (useJuegos).
  const ready = conn === 'open' && Boolean(me)
  useEffect(() => {
    if (ready) send({ t: 'scores' })
  }, [ready, send])
  const tablesOf = (game) => lobby?.tables.filter((t) => t.game === game) ?? []

  let status = { tone: 'off', text: 'Sin conexión · reintentando' }
  if (juegos.error) status = { tone: 'err', text: juegos.error }
  else if (online) status = { tone: 'on', text: `${lobby.online} ${lobby.online === 1 ? 'conectado' : 'conectados'}` }
  else if (conn === 'connecting' || (connected && !lobby)) status = { tone: 'wait', text: 'Conectando…' }

  const halloween = useHalloween()
  // Misión del día de ese juego (si la hay), para la pegatina de su tarjeta.
  const missionFor = (id) => juegos.pase?.missions.find((m) => m.game === id)
  // Lo que la banca ha quitado del selector esta temporada (Banca → Juegos): no se borra, solo no se enseña.
  const hidden = new Set(lobby?.hidden ?? [])
  const shown = (id) => !hidden.has(id)
  const roundGames = ROUND_GAMES.filter((g) => shown(g.id))
  const paceGames = PACE_GAMES.filter((g) => shown(g.id))
  const liveGames = Object.keys(LIVE).filter(shown)
  const moneyBits = ['gacha', 'inmo', 'suiza'].filter(shown)

  return (
    <main className="app app--lobby hub">
      {halloween ? <HalloweenFx /> : <NavidadFx />}
      {bank && (
        <Suspense fallback={null}>
          <BancaPanel onClose={() => setBank(false)} />
        </Suspense>
      )}
      {tour && <Tutorial onClose={() => setTour(false)} />}
      {/* Portada de la Season 5: noche de Navidad en las islas, con tu ficha y los botones encima. */}
      <header className="hub-top s4-hero">
        {halloween ? <IslandScene className="s4-hero__scene" /> : <NavidadScene className="s4-hero__scene" />}
        {halloween ? <Pumpkin className="hw-pumpkin" /> : <Guirnalda />}
        <div className="hub-top__brand s4-hero__brand">
          <small className="s4-hero__season">
            <span>Season 5</span> Navidad
          </small>
          <div className="hub-top__title">
            <Logo className="hub-top__logo" />
            <h1>GcGames</h1>
          </div>
          <p className="s4-hero__tag">{halloween ? 'Noche de Halloween en el casino' : 'Esta Navidad, la casa invita'}</p>
          <p className={`hub-status hub-status--${status.tone}`} role="status" aria-live="polite">
            <i aria-hidden="true" />
            {status.text}
          </p>
        </div>
        <div className="hub-top__who">
          {me && (
            <div className="hub-me" data-tour="me">
              <Avatar name={me.name} src={me.avatar} size={52} />
              <span className="hub-me__text">
                <small>{me.name}</small>
                <b>{eur(balance)}</b>
                {mine && (
                  <em className="hub-me__rank">
                    Puesto {mine.rank} de {count}
                    {juegos.pase && ` · Nivel ${juegos.pase.level}`}
                  </em>
                )}
              </span>
            </div>
          )}
          <div className="hub-top__btns">
            {master && (
              <button type="button" className="hub-btn hub-bank" data-tour="bank" onClick={() => setBank(true)} aria-label="La banca (master)" title="La banca">
                <span aria-hidden="true">€</span>
                <em>Banca</em>
              </button>
            )}
            <a className="hub-btn hub-wa" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" title="Grupo de WhatsApp de Juegos">
              <WhatsAppIcon />
              <em>WhatsApp</em>
            </a>
            <button type="button" className="hub-btn hub-btn--ghost" onClick={() => setTour(true)}>
              Tutorial
            </button>
            <button type="button" className="hub-btn hub-btn--ghost" onClick={onHome}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <SectionNav
        sections={[
          { id: 'hub-pase', label: 'Pase' },
          roundGames.length > 0 && { id: 'hub-round', label: 'Todos a la vez' },
          paceGames.length > 0 && { id: 'hub-solo', label: 'A tu ritmo' },
          { id: 'hub-bingo', label: shown('bingo') ? 'Bingo y clasificación' : 'Clasificación' },
          liveGames.length > 0 && { id: 'hub-live', label: 'Mesas en vivo' },
          moneyBits.length > 0 && { id: 'hub-money', label: 'Tu dinero a salvo' },
        ].filter(Boolean)}
      />

      <section id="hub-pase" aria-labelledby="pase-title" data-tour="pase">
        <h2 id="pase-title" className="hub-title">
          Pase de Navidad <small>misiones cada día, un regalo gratis y premios en cada nivel</small>
        </h2>
        <PaseStrip juegos={juegos} online={connected} onOpen={onPase} />
      </section>

      {roundGames.length > 0 && (
        <section id="hub-round" aria-labelledby="round-title" data-tour="round">
          <h2 id="round-title" className="hub-title">
            Todos a la vez <small>la misma ronda para todo el casino</small>
          </h2>
          <ul className="hub-showcase s4-round">
            {roundGames.map((game, i) => (
              <li key={game.id} className={game.isNew ? 'is-big' : undefined} style={{ '--i': i }} data-tour={game.id === 'elevator' ? 'elevator' : undefined}>
                <GameCard game={game} big connected={connected} onPick={onPick} mission={missionFor(game.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {paceGames.length > 0 && (
        <section id="hub-solo" aria-labelledby="solo-title" data-tour="solo">
          <h2 id="solo-title" className="hub-title">
            A tu ritmo <small>tú contra la casa, cuando quieras</small>
          </h2>
          <ul className="hub-games s4-pace">
            {paceGames.map((game, i) => (
              <li key={game.id} className={game.isNew ? 'is-big' : undefined} style={{ '--i': i }}>
                <GameCard game={game} connected={connected} onPick={onPick} mission={missionFor(game.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div id="hub-bingo" className={shown('bingo') ? 'hub-feature' : 'hub-feature hub-feature--solo'}>
        {shown('bingo') && (
          <section aria-labelledby="bingo-title">
            <h2 id="bingo-title" className="hub-title">
              Bingo <small>el bote de todo el casino</small>
            </h2>
            <BingoBanner info={lobby?.bingo} online={connected} onOpen={() => onPick('bingo')} />
          </section>
        )}
        <section aria-labelledby="score-title" data-tour="score">
          <h2 id="score-title" className="hub-title">
            Clasificación <small>se reinicia el domingo a las 23:59</small>
          </h2>
          <ScoreCard scores={scores} me={me} resetAt={lobby?.resetAt} online={online} onOpen={onScore} />
        </section>
      </div>

      {liveGames.length > 0 && (
        <section id="hub-live" className="hub-live-sec" aria-labelledby="live-title" data-tour="live">
          <h2 id="live-title" className="hub-title">
            Mesas en vivo <small>con la gente del casino</small>
          </h2>
          <div className="hub-cards">
            {liveGames.map((game) => (
              <LiveGame key={game} game={game} tables={tablesOf(game)} loaded={Boolean(lobby)} online={online} onJoin={onJoin} />
            ))}
          </div>
        </section>
      )}

      {/* Las tres formas de guardar el dinero lejos de Hacienda, juntas: las cartas, las propiedades y Suiza. */}
      {moneyBits.length > 0 && (
        <section id="hub-money" aria-labelledby="money-title" data-tour="gacha">
          <h2 id="money-title" className="hub-title">
            Tu dinero a salvo <small>Hacienda solo mira el saldo</small>
          </h2>
          <ul className="hub-money">
            {shown('gacha') && (
              <li>
                <GachaShowcase juegos={juegos} online={connected} onOpen={onGacha} />
              </li>
            )}

      {!waClosed && (
        <aside className="hub-wa-banner" aria-label="Grupo de WhatsApp de Juegos">
          <span className="hub-wa-banner__icon">
            <WhatsAppIcon />
          </span>
          <p>
            <b>¿Quieres enterarte antes que nadie de los Admin Abuse y de cuánto lleva el bote del Bingo?</b>
            <span>Únete al grupo de WhatsApp de Juegos: avisamos de cada Admin Abuse y de cuándo se abre el bote.</span>
          </p>
          <a className="hub-wa-banner__go" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            Unirme al grupo
          </a>
          <button
            type="button"
            className="hub-wa-banner__close"
            aria-label="Cerrar el aviso del grupo de WhatsApp"
            onClick={() => {
              setWaClosed(true)
              try {
                localStorage.setItem(WHATSAPP_SEEN_KEY, '1')
              } catch {
                // sin almacenamiento: el aviso volverá a salir al recargar
              }
            }}
          >
            ✕
          </button>
        </aside>
      )}
            {shown('inmo') && (
              <li>
                <InmoBanner onOpen={() => onPick('inmo')} />
              </li>
            )}
            {shown('suiza') && (
              <li>
                <SuizaBanner onOpen={() => onPick('suiza')} />
              </li>
            )}
          </ul>
        </section>
      )}
    </main>
  )
}

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
const KEEP = new Set(['pase', 'pesca', 'bingo', 'roulette', 'crash', 'fish', 'plinko', 'frog', 'race', 'elevator', 'inmo', 'suiza', 'gacha', 'score', 'tower', 'heist', 'auction', 'loteria', 'trineo', 'regatta', 'hilo', 'bola'])
function savedScreen() {
  try {
    const screen = sessionStorage.getItem(SCREEN_KEY)
    return KEEP.has(screen) ? { screen } : { screen: 'lobby' }
  } catch {
    return { screen: 'lobby' }
  }
}

function JuegosScreens() {
  // screen: lobby | pase | bingo | roulette | crash | fish | loteria | trineo | plinko | frog | race | elevator | gacha | join | score
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
  if (screen === 'hilo') return (<Hilo onExit={exit} juegos={juegos} />)
  if (screen === 'bola') return (<Bola onExit={exit} juegos={juegos} />)
  if (screen === 'regatta') return (<Regata onExit={exit} juegos={juegos} />)
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

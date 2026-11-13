// El selector de juegos (la portada del casino). Una barra arriba con tu ficha, tres tarjetas con lo de hoy (pase,
// clasificación y bingo) y, debajo, los juegos en una rejilla de tarjetas iguales, con un filtro por tipo.
// Estilos en selector.css (clases hb-*).
import { lazy, Suspense, useEffect, useState } from 'react'
import { Building2, ChevronRight, CircleHelp, Gift, Landmark, LogOut, MessageCircle, Sparkles, Vault, X } from 'lucide-react'
import Avatar from '../comun/Avatar.jsx'
import { delta, eur, until } from '../comun/money.js'
import { useCountUp } from '../comun/useCountUp.js'
import { useAuth } from '../../hooks/useAuth'
import Logo from '../../Logo.jsx'
import { unclaimed } from '../season4/PaseParts.jsx'
import NavidadFx, { Guirnalda } from '../season5/NavidadFx.jsx'
import { navidadRgb } from '../season5/tinte.js'
import HalloweenFx from '../temas/halloween/HalloweenFx.jsx'
import { useHalloween } from '../temas/halloween/halloween.js'
import Tutorial, { TUTORIAL_KEY } from './Tutorial.jsx'
import { LIVE, PACE_GAMES, ROUND_GAMES } from './catalogo.jsx'
import './selector.css'

// Panel de la banca: solo lo abre el master, así que se carga al pulsar su botón.
const BancaPanel = lazy(() => import('../banca/BancaPanel'))

// Grupo de WhatsApp de Juegos: avisos de los Admin Abuse y de cuánto lleva el bote del Bingo.
const WHATSAPP_URL = 'https://chat.whatsapp.com/KLOlli4i1X94Mn6wJFFbwH'
const WHATSAPP_SEEN_KEY = 'juegos-whatsapp-visto' // quien cierra el aviso ya no lo vuelve a ver (el botón sigue arriba)
const stored = (key) => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

const TABS = [
  { id: 'todo', label: 'Todo' },
  { id: 'round', label: 'Todos a la vez' },
  { id: 'pace', label: 'A tu ritmo' },
  { id: 'live', label: 'Mesas' },
  { id: 'money', label: 'Tu dinero' },
]

// El color de cada tarjeta («r, g, b»), pasado a los colores de Navidad de la Season 5.
const navidadTint = (tint) => navidadRgb(tint.split(',').map(Number)).join(', ')

// Delta de hoy y distancia al siguiente puesto, solo con los datos del Score.
function standing(scores) {
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
  if (ahead) gap = `A ${eur(ahead.balance - mine.balance)} del puesto ${ahead.rank}`
  else if (behind) gap = `Vas primero, ${eur(mine.balance - behind.balance)} por delante`
  return { mine, count: list.length, today, gap }
}

// ---------- Lo de hoy ----------

// El pase: tu nivel (el anillo es lo que llevas del siguiente), las misiones del día y el regalo diario.
function PaseCard({ juegos, online, onOpen }) {
  const { pase, send } = juegos
  const [opening, setOpening] = useState(false)
  // Se pide al entrar en el selector y cada vez que una jugada lo dejó viejo (misión, bonus o nivel nuevo).
  const stale = !pase || pase.stale
  useEffect(() => {
    if (online && stale) send({ t: 'pase', a: 'estado' })
  }, [online, stale, send])
  const chest = Boolean(pase && !pase.streak.claimed)
  const owed = unclaimed(pase)
  const done = pase?.missions.filter((m) => m.done).length ?? 0
  const max = Boolean(pase) && pase.level >= pase.maxLevel
  const frac = pase ? (max ? 1 : pase.levelXp / pase.perLevel) : 0
  const openChest = () => {
    setOpening(true)
    send({ t: 'pase', a: 'racha' })
    setTimeout(() => setOpening(false), 1400)
  }
  return (
    <article className="hb-stat hb-stat--pase" data-tour="pase">
      <button type="button" className="hb-stat__main" onClick={onOpen} disabled={!pase}>
        <span className="hb-stat__big hb-stat__big--ring" style={{ '--f': frac }}>
          {pase?.level ?? '–'}
        </span>
        <span className="hb-stat__text">
          <small>Pase de Navidad</small>
          <b>{pase ? pase.title : 'Cargando…'}</b>
          {pase && <em>{max ? 'Nivel máximo' : `${pase.levelXp} / ${pase.perLevel} XP`}</em>}
        </span>
        <ChevronRight className="hb-stat__go" aria-hidden="true" />
      </button>
      <p className="hb-stat__foot">
        <span>
          {pase ? `Misiones de hoy: ${done} de 3` : ' '}
          {owed.count > 0 && (
            <>
              {' · '}
              <button type="button" className="hb-link" onClick={onOpen}>
                {owed.count} {owed.count === 1 ? 'premio' : 'premios'} por reclamar
              </button>
            </>
          )}
        </span>
        {chest && (
          <button type="button" className="hb-chip hb-chip--go" disabled={!online || opening} onClick={openChest}>
            <Gift size={14} aria-hidden="true" />
            Regalo diario · {eur(pase.streak.next.eur)}
          </button>
        )}
      </p>
    </article>
  )
}

function ScoreCard({ scores, resetAt, online, onOpen }) {
  const { mine, count, today, gap } = standing(scores)
  const top = scores?.players.slice(0, 3) ?? []
  const stale = !online && Boolean(scores)
  return (
    <article className="hb-stat" data-tour="score">
      <button type="button" className="hb-stat__main" disabled={!scores && !online} onClick={onOpen}>
        <span className="hb-stat__big">{mine ? `${mine.rank}.º` : '–'}</span>
        <span className="hb-stat__text">
          <small>Clasificación{count ? ` · ${count} jugando` : ''}</small>
          <b>{mine ? eur(mine.balance) : scores ? 'Juega para entrar' : 'Cargando…'}</b>
          {mine && <em className={today > 0 ? 'is-up' : today < 0 ? 'is-down' : ''}>{delta(today)} hoy</em>}
        </span>
        <ChevronRight className="hb-stat__go" aria-hidden="true" />
      </button>
      <p className="hb-stat__foot">
        <span>{stale ? 'Último dato guardado' : (gap ?? (resetAt ? `Se reinicia en ${until(resetAt)}` : ' '))}</span>
        {top.length > 0 && (
          <span className="hb-faces" role="img" aria-label={`Líderes: ${top.map((p) => p.name).join(', ')}`}>
            {top.map((p) => (
              <Avatar key={p.rank} name={p.name} src={p.avatar} size={22} />
            ))}
          </span>
        )}
      </p>
    </article>
  )
}

// El Bingo: el bote de la jaula y cuánto falta para la siguiente partida.
function BingoCard({ info, online, onOpen }) {
  const shown = useCountUp(info?.pot ?? 0, 1200)
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
    <article className="hb-stat">
      <button type="button" className="hb-stat__main" disabled={!online} onClick={onOpen}>
        <span className="hb-stat__big hb-stat__big--ball">B</span>
        <span className="hb-stat__text">
          <small>Bingo · bote en la jaula</small>
          <b>{eur(shown)}</b>
        </span>
        <ChevronRight className="hb-stat__go" aria-hidden="true" />
      </button>
      <p className="hb-stat__foot">
        <span>{when}</span>
        {info?.bote && <span className={`hb-chip ${open ? 'hb-chip--on' : ''}`}>{open ? 'Bote abierto' : 'Bote cerrado'}</span>}
      </p>
    </article>
  )
}

// ---------- Juegos ----------

// Tarjeta de un juego: la escena, el nombre y de qué va en dos palabras. La frase larga queda de descripción.
function Tile({ game, connected, onPick, mission, halloween }) {
  const { id, name, kind, blurb, art, live, tint, isNew } = game
  return (
    <button type="button" className="hb-tile" style={{ '--tint': halloween ? tint : navidadTint(tint) }} disabled={!connected} title={blurb} onClick={() => onPick(id)}>
      <span className="hb-tile__art" aria-hidden="true">
        {art}
      </span>
      {(isNew || mission) && (
        <span className="hb-tile__tags">
          {isNew && <em>Nuevo</em>}
          {mission && <em className={mission.done ? 'is-done' : 'is-mission'}>{mission.done ? '✓ Misión' : `Misión ${mission.progress}/${mission.goal}`}</em>}
        </span>
      )}
      <span className="hb-tile__name">{name}</span>
      <span className="hb-tile__kind">
        {live && <i aria-hidden="true" />}
        {kind}
      </span>
      <span className="hb-sr">{blurb}</span>
    </button>
  )
}

// Texto y tono del estado de una mesa.
function tableState(game, t) {
  if (!t || t.players === 0) return { tone: 'free', text: 'Mesa libre' }
  if (game === 'chess') {
    if (t.phase === 'playing') return { tone: 'busy', text: 'Partida en curso' }
    return t.players === 1 ? { tone: 'wait', text: 'Busca rival' } : { tone: 'on', text: 'Acordando la apuesta' }
  }
  if (game === 'poker' && t.phase === 'waiting' && t.players === 1) return { tone: 'wait', text: 'Espera rival' }
  if (t.phase !== 'waiting' && t.phase !== 'betting') return { tone: 'busy', text: 'Mano en curso' }
  return { tone: 'on', text: `${t.players} jugando` }
}

// La mesa que se ofrece: la elegida, o la que tiene gente y sitio (así quien llega se sienta con alguien).
function bestTable(tables, picked) {
  const chosen = tables.find((t) => t.code === picked)
  if (chosen) return chosen
  const open = tables.filter((t) => t.players < t.seats)
  return [...open].sort((a, b) => b.players - a.players)[0] ?? tables[0]
}

// Una mesa en vivo: quién está sentado, su estado y los botones de jugar y mirar (sin códigos).
function TableCard({ game, tables, loaded, online, onJoin }) {
  const { name, caption, seats } = LIVE[game]
  const [picked, setPicked] = useState(null)
  const table = bestTable(tables, picked)
  const state = !loaded ? { tone: 'free', text: 'Cargando…' } : online ? tableState(game, table) : { tone: 'free', text: 'Sin conexión' }
  const people = table?.people ?? []
  const total = table?.seats ?? seats
  const full = table ? table.players >= table.seats : false
  const watching = tables.reduce((sum, t) => sum + t.spectators, 0)
  const code = picked && table?.code === picked ? picked : undefined
  return (
    <article className="hb-table">
      <header>
        <h3>{name}</h3>
        <span className={`hb-chip hb-chip--${state.tone}`}>{state.text}</span>
      </header>
      <p className="hb-table__seats" role="img" aria-label={`${people.length} de ${total} asientos ocupados${people.length ? `: ${people.map((p) => p.name).join(', ')}` : ''}`}>
        {Array.from({ length: total }, (_, i) => (people[i] ? <Avatar key={i} name={people[i].name} src={people[i].avatar} size={30} /> : <i key={i} />))}
      </p>
      <p className="hb-table__meta">
        {caption}
        {watching > 0 && ` · ${watching} mirando`}
      </p>
      {tables.length > 1 && (
        <div className="hb-table__picker" role="group" aria-label={`Mesas de ${name}`}>
          {tables.map((t) => (
            <button key={t.code} type="button" aria-pressed={table?.code === t.code} onClick={() => setPicked(t.code)}>
              {t.label} · {t.players}/{t.seats}
            </button>
          ))}
        </div>
      )}
      <footer>
        <button type="button" className="hb-btn hb-btn--go" disabled={!online || full} onClick={() => onJoin(game, 'player', code)}>
          {full ? 'Mesa llena' : 'Jugar'}
        </button>
        <button type="button" className="hb-btn" disabled={!online} onClick={() => onJoin(game, 'spectator', code)}>
          Mirar
        </button>
      </footer>
    </article>
  )
}

// Las tres formas de guardar el dinero lejos de Hacienda.
const MONEY = [
  { id: 'gacha', name: 'Gacha', text: 'Cartas de Black Clover: colecciónalas, únelas o empéñalas.', Icon: Sparkles },
  { id: 'inmo', name: 'Inmobiliaria', text: 'Calles y 168 propiedades en las 7 islas que dan alquiler cada hora.', Icon: Building2 },
  { id: 'suiza', name: 'Cuenta en Suiza', text: 'Esconde saldo donde Hacienda no mira.', Icon: Vault },
]

function Section({ id, title, hint, tour, children }) {
  return (
    <section id={id} className="hb-sec" aria-labelledby={`${id}-t`} data-tour={tour}>
      <h2 id={`${id}-t`}>
        {title} <small>{hint}</small>
      </h2>
      {children}
    </section>
  )
}

export default function GameSelector({ juegos, onPick, onJoin, onScore, onGacha, onHome, onPase }) {
  const { me, lobby, conn, scores, send } = juegos
  const master = useAuth().usuario?.es_superadmin === true
  const halloween = useHalloween()
  const [bank, setBank] = useState(false)
  const [tour, setTour] = useState(false)
  const [tab, setTab] = useState('todo')
  const [waClosed, setWaClosed] = useState(() => stored(WHATSAPP_SEEN_KEY))
  const connected = conn === 'open' && Boolean(me)
  const online = connected && Boolean(lobby)
  const balance = useCountUp(me?.balance ?? 0, 900)
  const { mine, count } = standing(scores)

  // La guía se abre sola la primera vez (cuando ya está pintado el selector), siempre con todas las secciones a la vista.
  const hubReady = Boolean(me && lobby)
  useEffect(() => {
    if (!hubReady || stored(TUTORIAL_KEY)) return
    const timer = setTimeout(() => setTour(true), 600)
    return () => clearTimeout(timer)
  }, [hubReady])
  useEffect(() => {
    if (tour) setTab('todo')
  }, [tour])

  // El resumen del score se pide al entrar en el selector; después llega con cada sondeo del lobby (useJuegos).
  useEffect(() => {
    if (connected) send({ t: 'scores' })
  }, [connected, send])

  let status = { tone: 'off', text: 'Sin conexión · reintentando' }
  if (juegos.error) status = { tone: 'err', text: juegos.error }
  else if (online) status = { tone: 'on', text: `${lobby.online} ${lobby.online === 1 ? 'conectado' : 'conectados'}` }
  else if (conn === 'connecting' || (connected && !lobby)) status = { tone: 'wait', text: 'Conectando…' }

  // Misión del día de ese juego (si la hay), para la etiqueta de su tarjeta.
  const missionFor = (id) => juegos.pase?.missions.find((m) => m.game === id)
  // Lo que la banca ha quitado del selector esta temporada (Banca → Juegos): no se borra, solo no se enseña.
  const hidden = new Set(lobby?.hidden ?? [])
  const shown = (g) => !hidden.has(g.id ?? g)
  const roundGames = ROUND_GAMES.filter(shown)
  const paceGames = PACE_GAMES.filter(shown)
  const liveGames = Object.keys(LIVE).filter(shown)
  const money = MONEY.filter(shown)
  const sections = { round: roundGames.length, pace: paceGames.length, live: liveGames.length, money: money.length }
  const tabs = TABS.filter((t) => t.id === 'todo' || sections[t.id] > 0)
  const on = (id) => sections[id] > 0 && (tab === 'todo' || tab === id)
  const tablesOf = (game) => lobby?.tables.filter((t) => t.game === game) ?? []
  const tiles = (games) => (
    <ul className="hb-grid">
      {games.map((game) => (
        <li key={game.id} data-tour={game.id === 'elevator' ? 'elevator' : undefined}>
          <Tile game={game} connected={connected} onPick={onPick} mission={missionFor(game.id)} halloween={halloween} />
        </li>
      ))}
    </ul>
  )
  const closeWa = () => {
    setWaClosed(true)
    try {
      localStorage.setItem(WHATSAPP_SEEN_KEY, '1')
    } catch {
      // sin almacenamiento: el aviso volverá a salir al recargar
    }
  }

  return (
    <main className="app hb">
      {halloween ? <HalloweenFx /> : <NavidadFx />}
      {bank && (
        <Suspense fallback={null}>
          <BancaPanel onClose={() => setBank(false)} />
        </Suspense>
      )}
      {tour && <Tutorial onClose={() => setTour(false)} />}

      <header className="hb-bar">
        {!halloween && <Guirnalda />}
        <div className="hb-brand">
          <Logo className="hb-brand__logo" />
          <span>
            <h1>GcGames</h1>
            <small>{halloween ? 'Halloween' : 'Season 5 · Navidad'}</small>
          </span>
        </div>
        <p className={`hb-status hb-status--${status.tone}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {status.text}
        </p>
        <nav className="hb-actions" aria-label="Opciones">
          {master && (
            <button type="button" data-tour="bank" onClick={() => setBank(true)} aria-label="La banca (master)" title="La banca">
              <Landmark size={18} aria-hidden="true" />
            </button>
          )}
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Grupo de WhatsApp de Juegos" title="Grupo de WhatsApp">
            <MessageCircle size={18} aria-hidden="true" />
          </a>
          <button type="button" onClick={() => setTour(true)} aria-label="Tutorial" title="Tutorial">
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={onHome} aria-label="Salir" title="Salir">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </nav>
        {me && (
          <div className="hb-me" data-tour="me">
            <Avatar name={me.name} src={me.avatar} size={38} />
            <span>
              <b>{eur(balance)}</b>
              <small>
                {me.name}
                {mine && ` · ${mine.rank}.º de ${count}`}
              </small>
            </span>
          </div>
        )}
      </header>

      <div className="hb-today">
        <PaseCard juegos={juegos} online={connected} onOpen={onPase} />
        <ScoreCard scores={scores} resetAt={lobby?.resetAt} online={online} onOpen={onScore} />
        {!hidden.has('bingo') && <BingoCard info={lobby?.bingo} online={connected} onOpen={() => onPick('bingo')} />}
      </div>

      <div className="hb-tabs" role="group" aria-label="Qué juegos ver">
        {tabs.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {on('round') && (
        <Section id="hb-round" title="Todos a la vez" hint="la misma ronda para todo el casino" tour="round">
          {tiles(roundGames)}
        </Section>
      )}
      {on('pace') && (
        <Section id="hb-solo" title="A tu ritmo" hint="tú contra la casa, cuando quieras" tour="solo">
          {tiles(paceGames)}
        </Section>
      )}
      {on('live') && (
        <Section id="hb-live" title="Mesas en vivo" hint="con la gente del casino" tour="live">
          <div className="hb-tables">
            {liveGames.map((game) => (
              <TableCard key={game} game={game} tables={tablesOf(game)} loaded={Boolean(lobby)} online={online} onJoin={onJoin} />
            ))}
          </div>
        </Section>
      )}
      {on('money') && (
        <Section id="hb-money" title="Tu dinero a salvo" hint="Hacienda solo mira el saldo" tour="gacha">
          <ul className="hb-money">
            {money.map(({ id, name, text, Icon }) => (
              <li key={id}>
                <button type="button" disabled={!connected} onClick={() => (id === 'gacha' ? onGacha() : onPick(id))}>
                  <Icon size={22} aria-hidden="true" />
                  <span>
                    <b>{name}</b>
                    <small>{text}</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!waClosed && (
        <aside className="hb-note" aria-label="Grupo de WhatsApp de Juegos">
          <MessageCircle size={18} aria-hidden="true" />
          <p>Entérate antes que nadie de los Admin Abuse y de cuándo se abre el bote del Bingo.</p>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            Unirme al grupo
          </a>
          <button type="button" aria-label="Cerrar el aviso del grupo de WhatsApp" onClick={closeWa}>
            <X size={16} aria-hidden="true" />
          </button>
        </aside>
      )}
    </main>
  )
}

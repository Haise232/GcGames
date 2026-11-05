import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Coins, MessageSquare, Zap, X, Search, Users, Check, Clock, Trophy, Landmark, Ghost, UserPlus, KeyRound, Copy, Contact, Gamepad2 } from 'lucide-react'
import {
  ABUSE_MINUTES,
  GAME_GROUPS,
  POT_MINUTES,
  RAID_FLOORS,
  RAID_PCTS,
  abusePerks,
  abuseText,
  bancaCall,
  eur,
  type Abuse,
  type AbuseMode,
  type Bote,
  type AbuseScope,
  type Jugador,
  type Movimiento,
  type Pendiente,
  type UsuarioAdmin,
} from './banca'
import './banca-panel.css'
import { enFechas, preferencia, setPreferencia, type PreferenciaHalloween } from '../temas/halloween/halloween'

type Tab = 'dinero' | 'mensaje' | 'abuso' | 'bote' | 'hacienda' | 'cuentas' | 'usuarios' | 'juegos' | 'tema'
const ALL = 'todos'
const CHIPS = [100, 1000, 10000, 50000]
const MAX = 1_000_000
const TEMPLATES = ['¡Torneo de póker en 5 minutos!', '¡Felicidades al ganador de la semana!', 'La banca cierra en 10 minutos.', 'Hoy invita la casa 🎉']
const MODES: { id: AbuseMode; big: string; label: string }[] = [
  { id: 'x2', big: '×2', label: 'Probabilidad ×2' },
  { id: 'x3', big: '×3', label: 'Probabilidad ×3' },
  { id: 'gratis', big: '0 €', label: 'Todo gratis' },
]

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const ago = (at: number) => {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}
const potMinutes = (m: number | null) => (m === null ? 'Sin límite' : m < 60 ? `${m} min` : `${m / 60} h`)
const hours = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min` : clock(ms)
}
const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

// Secciones del panel, agrupadas en la barra lateral, con la frase que sale debajo del título.
const SECTIONS: { name: string; items: { id: Tab; label: string; desc: string; Icon: typeof Coins }[] }[] = [
  {
    name: 'Dinero',
    items: [
      { id: 'dinero', label: 'Dar dinero', desc: 'Reparte dinero a una persona o a todos, con un mensaje si quieres.', Icon: Coins },
      { id: 'mensaje', label: 'Mensaje', desc: 'Escribe a nombre de la banca: le sale a quien elijas al momento.', Icon: MessageSquare },
    ],
  },
  {
    name: 'Eventos',
    items: [
      { id: 'abuso', label: 'Admin Abuse', desc: 'Durante unos minutos, la banca multiplica lo que se gana o devuelve lo que se pierde.', Icon: Zap },
      { id: 'bote', label: 'Bote del bingo', desc: 'Abre el bote para que alguien se lo lleve cantando bingo.', Icon: Trophy },
      { id: 'hacienda', label: 'Hacienda', desc: 'Redada: cobra un porcentaje a todos los que tengan más de una cantidad.', Icon: Landmark },
    ],
  },
  {
    name: 'Gente',
    items: [
      { id: 'cuentas', label: 'Cuentas nuevas', desc: 'Acepta o rechaza a quien se acaba de registrar.', Icon: UserPlus },
      { id: 'usuarios', label: 'Usuarios', desc: 'Todas las cuentas con su email, y contraseñas temporales para quien olvide la suya.', Icon: Contact },
    ],
  },
  {
    name: 'Ajustes',
    items: [
      { id: 'juegos', label: 'Juegos', desc: 'Quita juegos del selector para esta temporada y vuelve a ponerlos cuando quieras. No se borra nada.', Icon: Gamepad2 },
      { id: 'tema', label: 'Tema', desc: 'El aspecto de temporada, solo en este navegador.', Icon: Ghost },
    ],
  },
]

// Últimos movimientos de la banca. Va en la barra lateral en pantallas anchas y al final de la sección en el móvil.
function History({ history, className }: { history: Movimiento[]; className: string }) {
  if (!history.length) return null
  return (
    <section className={`bp__history ${className}`} aria-label="Últimos movimientos">
      <h4>Últimos movimientos</h4>
      <ul>
        {history.map((h) => (
          <li key={h.id}>
            <span className={`bp-hist__icon bp-hist__icon--${h.tipo}`} aria-hidden="true">
              {h.tipo === 'dinero' ? '€' : h.tipo === 'hacienda_todos' ? 'H' : '✉'}
            </span>
            <span className="bp-hist__what">
              {h.tipo === 'hacienda_todos' ? (
                <>
                  Hacienda: <b>−{eur(h.importe ?? 0)}</b> a {h.para ?? '—'}
                </>
              ) : (
                <>
                  {h.tipo === 'dinero' ? <b>{eur(h.importe ?? 0)}</b> : <q>{h.texto}</q>} → {h.para ?? 'todos'}
                </>
              )}
            </span>
            <small>{ago(h.at)}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Face({ person, size = 34 }: { person: Pick<Jugador, 'name' | 'avatar'>; size?: number }) {
  return person.avatar ? (
    <img className="bp-face" src={person.avatar} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="bp-face bp-face--letter" style={{ width: size, height: size }} aria-hidden="true">
      {initial(person.name)}
    </span>
  )
}

// Panel del master: dar dinero, escribir a nombre de la banca y activar el Admin Abuse. El servidor comprueba que eres el
// master; aquí solo se enseña el botón a quien lo es.
export default function BancaPanel({ onClose, initialTab = 'dinero' }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [people, setPeople] = useState<Jugador[]>([])
  const [history, setHistory] = useState<Movimiento[]>([])
  const [to, setTo] = useState<string>(ALL)
  const [query, setQuery] = useState('')
  const [amount, setAmount] = useState(1000)
  const [gift, setGift] = useState('')
  const [text, setText] = useState('')
  const [abuse, setAbuse] = useState<Abuse | null>(null)
  const [mode, setMode] = useState<AbuseMode>('x2')
  const [scope, setScope] = useState<AbuseScope>('todo')
  const [minutes, setMinutes] = useState<number>(10)
  const [bote, setBote] = useState<Bote | null>(null)
  const [potFor, setPotFor] = useState<number | null>(60)
  const [potOnce, setPotOnce] = useState(true)
  const [raidPct, setRaidPct] = useState<number>(20)
  const [raidFloor, setRaidFloor] = useState<number>(100_000)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false) // dar a todos pide pulsar dos veces
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [, setTick] = useState(0)
  const [tema, setTema] = useState<PreferenciaHalloween>(() => preferencia())
  const [pending, setPending] = useState<Pendiente[]>([])
  const [users, setUsers] = useState<UsuarioAdmin[] | null>(null)
  const [userQuery, setUserQuery] = useState('')
  const [resetFor, setResetFor] = useState<string | null>(null) // a quién se le va a poner la temporal (pide confirmar)
  const [temp, setTemp] = useState<{ id: string; password: string; copied: boolean } | null>(null)
  const [hidden, setHidden] = useState<string[] | null>(null)

  const loadPeople = useCallback(async () => {
    const { banca } = await bancaCall({ t: 'banca_gente' })
    setPeople(banca?.gente ?? [])
    setHistory(banca?.historial ?? [])
  }, [])

  useEffect(() => {
    loadPeople().catch((e: Error) => setNote({ ok: false, text: e.message }))
    bancaCall({ t: 'banca' })
      .then(({ banca }) => setAbuse(banca?.abuso ?? null))
      .catch(() => {})
    bancaCall({ t: 'banca_bote' })
      .then(({ banca }) => setBote(banca?.bote ?? null))
      .catch(() => {})
    bancaCall({ t: 'banca_cuentas' })
      .then(({ banca }) => setPending(banca?.pendientes ?? []))
      .catch(() => {})
  }, [loadPeople])

  // Banca → Usuarios: se carga al abrir la pestaña.
  useEffect(() => {
    if (tab !== 'usuarios') return
    bancaCall({ t: 'banca_usuarios' })
      .then(({ banca }) => setUsers(banca?.usuarios ?? []))
      .catch((e: Error) => setNote({ ok: false, text: e.message }))
  }, [tab])

  // Banca → Juegos: se carga al abrir la pestaña.
  useEffect(() => {
    if (tab !== 'juegos') return
    bancaCall({ t: 'banca_juegos' })
      .then(({ banca }) => setHidden(banca?.ocultos ?? []))
      .catch((e: Error) => setNote({ ok: false, text: e.message }))
  }, [tab])

  // Quita un juego del selector o lo vuelve a poner (para todos, al momento).
  const toggleGame = async (id: string, name: string) => {
    if (!hidden) return
    const off = !hidden.includes(id)
    setBusy(true)
    setNote(null)
    try {
      const { banca } = await bancaCall({ t: 'banca_juegos', ocultos: off ? [...hidden, id] : hidden.filter((x) => x !== id) })
      setHidden(banca?.ocultos ?? [])
      setNote({ ok: true, text: off ? `${name} ya no sale en el selector.` : `${name} vuelve a salir en el selector.` })
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const shownUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    const list = users ?? []
    return q ? list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : list
  }, [users, userQuery])

  // Contraseña temporal: el primer clic pide confirmar; el segundo la genera y se enseña una sola vez.
  const resetPassword = async (u: UsuarioAdmin) => {
    if (resetFor !== u.id) {
      setResetFor(u.id)
      setTemp(null)
      return
    }
    setBusy(true)
    setResetFor(null)
    try {
      const { banca } = await bancaCall({ t: 'banca_password', id: u.id })
      if (!banca?.temporal) throw new Error('No se pudo poner la contraseña temporal.')
      setTemp({ id: u.id, password: banca.temporal, copied: false })
      setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, temporal: true } : x)) ?? list)
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const copyTemp = async () => {
    if (!temp) return
    try {
      await navigator.clipboard.writeText(temp.password)
      setTemp({ ...temp, copied: true })
    } catch {
      // sin portapapeles: se copia a mano
    }
  }

  // Acepta o rechaza una cuenta nueva; al aceptarla ya sale entre los jugadores.
  const decide = async (person: Pendiente, aceptar: boolean) => {
    setBusy(true)
    try {
      const { banca } = await bancaCall({ t: 'banca_cuentas', id: person.id, aceptar })
      setPending(banca?.pendientes ?? [])
      setNote({ ok: true, text: aceptar ? `${person.name} ya puede jugar.` : `Cuenta de ${person.name} rechazada.` })
      if (aceptar) await loadPeople()
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  // Mientras se mira la pestaña del bote, se relee cada poco: puede cerrarse solo al salir un bote.
  useEffect(() => {
    if (tab !== 'bote') return
    const timer = setInterval(() => {
      bancaCall({ t: 'banca_bote' })
        .then(({ banca }) => setBote(banca?.bote ?? null))
        .catch(() => {})
    }, 15000)
    return () => clearInterval(timer)
  }, [tab])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearInterval(timer)
    }
  }, [onClose])

  useEffect(() => setArmed(false), [to, amount, tab, raidPct, raidFloor])
  useEffect(() => setResetFor(null), [tab, userQuery])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people
  }, [people, query])
  const target = to === ALL ? null : (people.find((p) => p.id === to) ?? null)
  const targetName = target ? target.name : 'todos'
  const count = target ? 1 : people.length
  const active = abuse && abuse.hasta > Date.now() ? abuse : null
  const potOpen = bote?.abierto && (bote.hasta === null || bote.hasta > Date.now()) ? bote : null
  const inCirculation = people.reduce((sum, p) => sum + (p.balance ?? 0), 0)

  const run = async (msg: Record<string, unknown>, done: string) => {
    setBusy(true)
    setNote(null)
    try {
      const { banca } = await bancaCall(msg)
      if (msg.t === 'banca_abuso') setAbuse(banca?.abuso ?? null)
      if (msg.t === 'banca_bote') setBote(banca?.bote ?? null)
      if (msg.t === 'banca_mensaje') setText('')
      if (msg.t === 'banca_dar') setGift('')
      setNote({ ok: true, text: done })
      setArmed(false)
      await loadPeople().catch(() => {})
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const give = () => {
    if (!target && !armed) {
      setArmed(true)
      return
    }
    run({ t: 'banca_dar', para: to, importe: amount, texto: gift.trim() || undefined }, `Enviados ${eur(amount)} a ${targetName}.`)
  }
  const send = () => run({ t: 'banca_mensaje', para: to, texto: text.trim() }, `Mensaje enviado a ${targetName}.`)
  const startAbuse = () => run({ t: 'banca_abuso', modo: mode, ambito: scope, minutos: minutes }, '¡Admin Abuse activado! Todos lo están viendo.')
  const stopAbuse = () => run({ t: 'banca_abuso', modo: null }, 'Admin Abuse desactivado.')
  const openPot = () =>
    run({ t: 'banca_bote', minutos: potFor, una: potOnce }, 'Bote abierto: vale desde la próxima partida del bingo que cierre la venta.')
  const closePot = () => run({ t: 'banca_bote', cerrar: true }, 'Bote cerrado: nadie se lo lleva hasta que lo vuelvas a abrir.')
  const targets = people.filter((p) => (p.balance ?? 0) >= raidFloor)
  const raidTotal = targets.reduce((sum, p) => sum + Math.floor(((p.balance ?? 0) * raidPct) / 100), 0)
  const raid = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    run({ t: 'banca_hacienda', pct: raidPct, desde: raidFloor }, 'Redada hecha: lo cobrado ya está en la jaula del bingo.')
  }
  const setClamped = (n: number) => setAmount(Math.max(1, Math.min(MAX, Math.floor(n) || 1)))

  const current = SECTIONS.flatMap((g) => g.items).find((item) => item.id === tab) ?? SECTIONS[0].items[0]
  // Lo que se marca junto a cada sección: algo en marcha (punto) o cuántos hay (número).
  const badge = (id: Tab): ReactNode => {
    if (id === 'cuentas' && pending.length) return <em className="bp__badge bp__badge--hot">{pending.length}</em>
    if (id === 'abuso' && active) return <em className="bp__badge bp__badge--live" aria-label="en marcha" />
    if (id === 'bote' && potOpen) return <em className="bp__badge bp__badge--live" aria-label="abierto" />
    if (id === 'usuarios' && users) return <em className="bp__badge">{users.length}</em>
    if (id === 'juegos' && hidden?.length) return <em className="bp__badge">{hidden.length}</em>
    return null
  }
  // En el móvil las secciones son chips en una fila que se desliza: la elegida se pone a la vista.
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [tab])
  const pick = (id: Tab) => {
    setTab(id)
    setNote(null)
  }
  const closeButton = (where: 'side' | 'main') => (
    <button type="button" className={`bp__close bp__close--${where}`} onClick={onClose} aria-label="Cerrar la banca">
      <X size={18} />
    </button>
  )

  return createPortal(
    <div className="bp" role="dialog" aria-modal="true" aria-labelledby="bp-title">
      <div className="bp__backdrop" onClick={onClose} />
      <div className="bp__panel">
        <aside className="bp__side">
          <header className="bp__head">
            <div className="bp__vault" aria-hidden="true">
              <span>€</span>
            </div>
            <div className="bp__titles">
              <h2 id="bp-title">La banca</h2>
              <p>Solo la ve el master</p>
            </div>
            {closeButton('side')}
          </header>

          <nav ref={navRef} className="bp__nav" aria-label="Secciones de la banca">
            {SECTIONS.map((group) => (
              <div key={group.name} className="bp__group">
                <span className="bp__group-name">{group.name}</span>
                {group.items.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`bp__tab bp__tab--${id}`}
                    aria-current={tab === id ? 'page' : undefined}
                    onClick={() => pick(id)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{label}</span>
                    {badge(id)}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <History history={history} className="bp__history--side" />
        </aside>

        <section className="bp__main">
          <header className="bp__main-head">
            <div>
              <h3>{current.label}</h3>
              <p>{current.desc}</p>
            </div>
            {closeButton('main')}
          </header>

          <div className="bp__stats">
            <div>
              <small>Jugadores</small>
              <b>{people.length}</b>
            </div>
            <div>
              <small>Dinero en juego</small>
              <b>{eur(inCirculation)}</b>
            </div>
            <button type="button" className={active ? 'is-hot' : ''} onClick={() => pick('abuso')}>
              <small>Admin Abuse</small>
              <b>{active ? `${active.modo === 'gratis' ? 'Gratis' : active.modo === 'x3' ? '×3' : '×2'} · ${clock(active.hasta - Date.now())}` : 'Apagado'}</b>
            </button>
            <button type="button" className={potOpen ? 'is-hot' : ''} onClick={() => pick('bote')}>
              <small>Bote del bingo</small>
              <b>{potOpen ? `Abierto${potOpen.hasta ? ` · ${hours(potOpen.hasta - Date.now())}` : ''}` : 'Cerrado'}</b>
            </button>
          </div>

          <div className="bp__body">
            {(tab === 'dinero' || tab === 'mensaje') && (
              <section className="bp__who" aria-label="Para quién">
                <button type="button" className={`bp-all ${to === ALL ? 'is-on' : ''}`} onClick={() => setTo(ALL)}>
                  <span className="bp-all__icon">
                    <Users size={18} />
                  </span>
                  <span>
                    <b>Todos</b>
                    <small>{people.length} jugadores</small>
                  </span>
                  {to === ALL && <Check size={18} className="bp-check" />}
                </button>
                <label className="bp-search">
                  <Search size={14} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar a alguien…" />
                </label>
                <ul className="bp-people">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <button type="button" className={`bp-person ${to === p.id ? 'is-on' : ''}`} onClick={() => setTo(p.id)}>
                        <Face person={p} />
                        <span className="bp-person__name">{p.name}</span>
                        <span className="bp-person__money">{p.balance === null ? 'sin jugar' : eur(p.balance)}</span>
                      </button>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="bp-muted">Nadie con ese nombre.</li>}
                </ul>
              </section>
            )}

            <section className="bp__action">
              {tab === 'dinero' && (
                <>
                  <div className="bp-amount">
                    <small>Cantidad para {targetName}</small>
                    <label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX}
                        value={amount}
                        onChange={(e) => setClamped(Number(e.target.value))}
                        aria-label="Cantidad en euros"
                      />
                      <span>€</span>
                    </label>
                    {!target && people.length > 1 && <small>En total: {eur(amount * people.length)}</small>}
                  </div>
                  <div className="bp-chips" aria-label="Sumar a la cantidad">
                    {CHIPS.map((c, i) => (
                      <button key={c} type="button" className="bp-chip" style={{ '--chip': ['#e9e1cf', '#2f7be0', '#c2332c', '#1b1b1f'][i] } as CSSProperties} onClick={() => setClamped(amount + c)}>
                        +{c >= 1000 ? `${c / 1000}k` : c}
                      </button>
                    ))}
                    <button type="button" className="bp-chip bp-chip--reset" onClick={() => setAmount(100)}>
                      Borrar
                    </button>
                  </div>
                  <textarea className="bp-text" value={gift} onChange={(e) => setGift(e.target.value.slice(0, 300))} rows={2} placeholder="Mensaje opcional («¡Por ganar el torneo!»)" />
                  <Preview>
                    <p className="bp-prev__from">La banca</p>
                    <p className="bp-prev__big">
                      ¡Has recibido <b>{eur(amount)}</b> de la banca!
                    </p>
                    {gift.trim() && <p className="bp-prev__small">«{gift.trim()}»</p>}
                  </Preview>
                  <button type="button" className={`bp-go bp-go--gold ${armed ? 'is-armed' : ''}`} disabled={busy || amount < 1 || count === 0} onClick={give}>
                    {armed ? `Confirmar: ${eur(amount)} a cada uno (${count})` : `Dar ${eur(amount)} a ${targetName}`}
                  </button>
                </>
              )}

              {tab === 'mensaje' && (
                <>
                  <textarea className="bp-text" value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} rows={4} placeholder="Escribe el mensaje de la banca…" />
                  <div className="bp-templates">
                    {TEMPLATES.map((t) => (
                      <button key={t} type="button" onClick={() => setText(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="bp-count">{text.length}/300</p>
                  <Preview>
                    <p className="bp-prev__from">{target ? 'Mensaje de la banca' : 'Mensaje de la banca para todos'}</p>
                    <p className="bp-prev__big bp-prev__big--msg">{text.trim() || 'Tu mensaje aparecerá aquí.'}</p>
                  </Preview>
                  <button type="button" className="bp-go bp-go--teal" disabled={busy || !text.trim()} onClick={send}>
                    Enviar a {targetName}
                  </button>
                </>
              )}

              {tab === 'abuso' && (
                <>
                  {active && (
                    <div className="bp-live">
                      <span className="bp-live__dot" aria-hidden="true" />
                      <div>
                        <b>{abuseText(active).big}</b>
                        <small>
                          <Clock size={12} /> Quedan {clock(active.hasta - Date.now())}
                        </small>
                      </div>
                      <button type="button" disabled={busy} onClick={stopAbuse}>
                        Desactivar
                      </button>
                    </div>
                  )}
                  <div className="bp-modes" role="radiogroup" aria-label="Qué activa">
                    {MODES.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`bp-mode bp-mode--${m.id}`} onClick={() => setMode(m.id)}>
                        <b>{m.big}</b>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="bp-row">
                    <span className="bp-label">Dónde</span>
                    <div className="bp-seg" role="radiogroup">
                      {(
                        [
                          ['todo', 'Todos los juegos'],
                          ['poker', 'Solo póker'],
                        ] as const
                      ).map(([id, label]) => (
                        <button key={id} type="button" role="radio" aria-checked={scope === id} onClick={() => setScope(id)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bp-row">
                    <span className="bp-label">Cuánto dura</span>
                    <div className="bp-seg" role="radiogroup">
                      {ABUSE_MINUTES.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)}>
                          {m} min
                        </button>
                      ))}
                    </div>
                  </div>
                  <ul className="bp-perks">
                    {abusePerks({ modo: mode, ambito: scope }).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <button type="button" className={`bp-go bp-go--abuse bp-go--${mode}`} disabled={busy} onClick={startAbuse}>
                    <Zap size={18} /> {active ? 'CAMBIAR ADMIN ABUSE' : 'ACTIVAR ADMIN ABUSE'}
                  </button>
                </>
              )}

              {tab === 'bote' && (
                <>
                  <div className={`bp-live ${potOpen ? '' : 'bp-live--off'}`}>
                    <span className="bp-live__dot" aria-hidden="true" />
                    <div>
                      <b>{potOpen ? 'BOTE ABIERTO' : 'BOTE CERRADO'}</b>
                      <small>
                        {bote ? `En la jaula: ${eur(bote.pot)}` : 'Cargando…'}
                        {potOpen && (
                          <>
                            {' · '}
                            <Clock size={12} /> {potOpen.hasta ? `Quedan ${hours(potOpen.hasta - Date.now())}` : 'Sin límite'}
                            {potOpen.una ? ' · se cierra al salir' : ''}
                          </>
                        )}
                      </small>
                    </div>
                    {potOpen && (
                      <button type="button" disabled={busy} onClick={closePot}>
                        Cerrar
                      </button>
                    )}
                  </div>
                  <p className="bp-muted">
                    Mientras el bote está cerrado nadie se lo lleva, ni con la bola dorada ni cantando bingo antes de la bola 66:
                    la jaula sigue creciendo. Lo que decidas vale desde la próxima partida que cierre la venta; la que ya se
                    está jugando sigue como empezó.
                  </p>
                  <div className="bp-row">
                    <span className="bp-label">Abierto durante</span>
                    <div className="bp-seg" role="radiogroup">
                      {POT_MINUTES.map((m) => (
                        <button key={String(m)} type="button" role="radio" aria-checked={potFor === m} onClick={() => setPotFor(m)}>
                          {potMinutes(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="bp-check-row">
                    <input type="checkbox" checked={potOnce} onChange={(e) => setPotOnce(e.target.checked)} />
                    Cerrarlo en cuanto alguien se lo lleve (así no sale varias veces seguidas)
                  </label>
                  <button type="button" className="bp-go bp-go--gold" disabled={busy} onClick={openPot}>
                    <Trophy size={18} /> {potOpen ? 'Volver a abrir con estas opciones' : 'Abrir el bote'}
                  </button>
                  {bote && bote.botes.length > 0 && (
                    <ul className="bp-perks">
                      {bote.botes.map((b) => (
                        <li key={b.round}>
                          {eur(b.jackpot)} para {b.bingo.join(', ') || '—'}
                          {b.golden ? ' (bola dorada)' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {tab === 'hacienda' && (
                <>
                  <p className="bp-muted">
                    Hacienda ya cobra sola: al pasar de 100.000 €, 200.000 €… cada uno declara (o se la juega declarando de menos), y
                    a quien pasa de 100.000 € le pueden caer inspecciones sorpresa. Con la redada vas tú a por todos los que pasen
                    de cierta cantidad. Todo va a la jaula del bingo; a quien está sentado en una mesa no se le cobra.
                  </p>
                  <div className="bp-row">
                    <span className="bp-label">Cuánto se lleva</span>
                    <div className="bp-seg" role="radiogroup">
                      {RAID_PCTS.map((p) => (
                        <button key={p} type="button" role="radio" aria-checked={raidPct === p} onClick={() => setRaidPct(p)}>
                          {p} %
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bp-row">
                    <span className="bp-label">A quien tenga</span>
                    <div className="bp-seg" role="radiogroup">
                      {RAID_FLOORS.map((f) => (
                        <button key={f} type="button" role="radio" aria-checked={raidFloor === f} onClick={() => setRaidFloor(f)}>
                          {eur(f)} o más
                        </button>
                      ))}
                    </div>
                  </div>
                  <ul className="bp-perks">
                    {targets.length === 0 ? (
                      <li>Ahora mismo nadie llega a {eur(raidFloor)}.</li>
                    ) : (
                      targets.map((p) => (
                        <li key={p.id}>
                          {p.name}: −{eur(Math.floor(((p.balance ?? 0) * raidPct) / 100))}
                        </li>
                      ))
                    )}
                  </ul>
                  <button type="button" className="bp-go bp-go--hot" disabled={busy || targets.length === 0} onClick={raid}>
                    <Landmark size={18} />{' '}
                    {armed ? `¿Seguro? Pulsa otra vez (${eur(raidTotal)})` : `Mandar a Hacienda (${targets.length})`}
                  </button>
                </>
              )}

              {tab === 'cuentas' && (
                <>
                  <p className="bp-muted">Quien se registra no puede jugar hasta que aceptes su cuenta.</p>
                  {pending.length === 0 ? (
                    <p className="bp-muted">No hay cuentas esperando.</p>
                  ) : (
                    <ul className="bp-accounts">
                      {pending.map((p) => (
                        <li key={p.id}>
                          <Face person={{ name: p.name, avatar: null }} />
                          <span className="bp-accounts__who">
                            <b>{p.name}</b>
                            <small>
                              {p.email} · {ago(p.at)}
                            </small>
                          </span>
                          <button type="button" className="bp-accounts__no" disabled={busy} onClick={() => decide(p, false)}>
                            Rechazar
                          </button>
                          <button type="button" className="bp-accounts__ok" disabled={busy} onClick={() => decide(p, true)}>
                            <Check size={14} /> Aceptar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {tab === 'usuarios' && (
                <>
                  <p className="bp-muted">
                    Al poner una temporal se le cierran las sesiones abiertas y, al entrar con ella, tendrá que elegir otra antes de jugar.
                  </p>
                  <label className="bp-search">
                    <Search size={14} />
                    <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Buscar por nombre o email…" />
                  </label>
                  {users === null ? (
                    <p className="bp-muted">Cargando…</p>
                  ) : (
                    <ul className="bp-users">
                      {shownUsers.map((u) => (
                        <li key={u.id}>
                          <div className="bp-users__row">
                            <Face person={u} />
                            <span className="bp-users__who">
                              <b>
                                {u.name}
                                {u.master && <em className="bp-tag bp-tag--master">Master</em>}
                                {u.estado !== 'aprobado' && <em className={`bp-tag bp-tag--${u.estado}`}>{u.estado}</em>}
                                {u.temporal && <em className="bp-tag bp-tag--temp">Temporal</em>}
                              </b>
                              <a href={`mailto:${u.email}`}>{u.email}</a>
                              <small>{u.acceso ? `Último acceso ${ago(u.acceso)}` : 'Nunca ha entrado'}</small>
                            </span>
                            {!u.master && (
                              <button
                                type="button"
                                className={`bp-users__reset ${resetFor === u.id ? 'is-armed' : ''}`}
                                disabled={busy}
                                onClick={() => resetPassword(u)}
                              >
                                <KeyRound size={14} />
                                {resetFor === u.id ? '¿Seguro? Pulsa otra vez' : 'Contraseña temporal'}
                              </button>
                            )}
                          </div>
                          {temp?.id === u.id && (
                            <div className="bp-temp" role="status">
                              <span>Contraseña temporal de {u.name}:</span>
                              <code>{temp.password}</code>
                              <button type="button" onClick={copyTemp}>
                                {temp.copied ? <Check size={14} /> : <Copy size={14} />}
                                {temp.copied ? 'Copiada' : 'Copiar'}
                              </button>
                              <small>Pásasela por privado. No se vuelve a mostrar; al entrar, tendrá que cambiarla.</small>
                            </div>
                          )}
                        </li>
                      ))}
                      {shownUsers.length === 0 && <li className="bp-muted">Nadie con ese nombre o email.</li>}
                    </ul>
                  )}
                </>
              )}

              {tab === 'juegos' && (
                <>
                  <p className="bp-muted">
                    Un juego apagado desaparece del selector para todos y no sale en las misiones del pase. No se borra nada: partidas,
                    cartas, propiedades y dinero siguen ahí, y al encenderlo vuelve tal cual.
                  </p>
                  {hidden === null ? (
                    <p className="bp-muted">Cargando…</p>
                  ) : (
                    GAME_GROUPS.map((group) => (
                      <section key={group.name} className="bp-games">
                        <h4>{group.name}</h4>
                        <ul>
                          {group.games.map((g) => {
                            const on = !hidden.includes(g.id)
                            return (
                              <li key={g.id}>
                                <span className={on ? 'bp-games__name' : 'bp-games__name is-off'}>
                                  {g.name}
                                  {!on && <em className="bp-tag">Oculto</em>}
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={on}
                                  aria-label={`${g.name}: ${on ? 'visible' : 'oculto'}`}
                                  className="bp-switch"
                                  disabled={busy}
                                  onClick={() => toggleGame(g.id, g.name)}
                                >
                                  <i aria-hidden="true" />
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    ))
                  )}
                </>
              )}

              {tab === 'tema' && (
                <>
                  <p className="bp-muted">
                    El tema de Halloween se pone solo del 27/10 al 1/11 (hora de Canarias){enFechas() ? ' y ahora está en fechas' : ''}.
                    Aquí puedes verlo antes o quitarlo, pero solo en este navegador: a los demás les sigue mandando la fecha. Solo
                    cambia el aspecto, no los juegos.
                  </p>
                  <div className="bp-row">
                    <span className="bp-label">Halloween</span>
                    <div className="bp-seg" role="radiogroup">
                      {(
                        [
                          ['auto', 'Por fechas'],
                          ['on', 'Encendido'],
                          ['off', 'Apagado'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={tema === id}
                          onClick={() => {
                            setTema(id)
                            setPreferencia(id)
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {note && (
                <p role="status" className={`bp-note ${note.ok ? 'is-ok' : 'is-err'}`}>
                  {note.text}
                </p>
              )}
            </section>
          </div>

          <History history={history} className="bp__history--main" />
        </section>
      </div>
    </div>,
    document.body,
  )
}

// Así lo verá quien lo reciba (en pequeño).
function Preview({ children }: { children: ReactNode }) {
  return (
    <div className="bp-prev">
      <small className="bp-prev__label">Así lo verán</small>
      <div className="bp-prev__card">{children}</div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Avatar from '../comun/Avatar.jsx'
import Help from '../comun/Help.jsx'
import InmoCity, { hueOf } from './InmoCity.jsx'
import InmoIslas from './InmoIslas.jsx'
import Squares from './InmoSquares.jsx'
import { eur } from '../comun/money.js'
import { isMuted, playCash, playChip, playLose, playWin, setMuted } from '../comun/sound.js'
import { BOARD, GROUPS, HOUR, ISLANDS, ISLA_TIERS, ISLA_UPGRADE, MAX_ISLA_LEVEL, PARKING_MIN, MAX_LEVEL, PROPERTIES, RENT_CAP_MS, UPGRADES, cellOf, isIsland, RENT_RATE, SELL_NOW, SELL_OLD, accrued, levelName, rentPerHour, upgradeCost } from './inmo.js'
import './Inmobiliaria.css'

// La Inmobiliaria (reglas en inmo.js, servidor en api/_juegos/inmobiliaria.mjs): propiedades para todos, en dos sitios.
// La ciudad: alrededor, las 40 casillas; en el centro, la ciudad que se va construyendo entre todos. Las 7 islas: el mapa
// del archipiélago y las doce propiedades de cada isla. Al lado, tu cartera y la ficha de la propiedad que tocas, con
// comprar, poner casas y hotel (o mejorarla, en las islas) o venderla.

const REFRESH_MS = 60000 // respaldo de Realtime, solo con la pestaña visible
const ICON = { salida: '➜', caja: '📦', suerte: '❓', impuesto: '💸', carcel: '🚔', parking: '🅿️', 'a-carcel': '👮', estacion: '🚌', compania: '⚡' }
const STATION_ICON = { 5: '🚌', 15: '⚓', 25: '✈️', 35: '✈️' }

// Fila y columna de cada casilla en una rejilla de 11 × 11: la Salida abajo a la derecha y en sentido horario.
function place(i) {
  if (i <= 10) return { row: 11, col: 11 - i, side: 'bottom' }
  if (i <= 20) return { row: 21 - i, col: 1, side: 'left' }
  if (i <= 30) return { row: 1, col: i - 19, side: 'top' }
  return { row: i - 29, col: 11, side: 'right' }
}
const isCorner = (i) => i % 10 === 0

// Estado de la inmobiliaria: al entrar, cuando alguien compra o vende (aviso de Realtime «juegos-inmo», sin datos) y
// cada REFRESH_MS por si se pierde un aviso.
function useInmo(request) {
  const [data, setData] = useState(null)
  const [offset, setOffset] = useState(0)
  const load = useCallback(
    async (a = 'estado', extra = {}) => {
      const body = await request({ t: 'inmo', a, ...extra })
      if (body?.inmo) {
        setData(body.inmo)
        setOffset(body.inmo.now - Date.now())
      }
      return body
    },
    [request],
  )
  const debounce = useRef(null)
  useEffect(() => {
    load()
    const channel = supabase
      .channel('juegos-inmo')
      .on('broadcast', { event: 'cambio' }, () => {
        clearTimeout(debounce.current)
        debounce.current = setTimeout(() => load(), 250)
      })
      .subscribe()
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS)
    return () => {
      clearTimeout(debounce.current)
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [load])
  return { data, offset, load }
}

// Casas (verdes) u hotel (rojo) sobre la franja de color.
function Buildings({ level }) {
  if (!level) return null
  if (level >= MAX_LEVEL) return <i className="im-hotel" aria-label="Hotel" />
  return (
    <span className="im-houses" aria-label={levelName(level)}>
      {Array.from({ length: level }, (_, k) => (
        <i key={k} />
      ))}
    </span>
  )
}

// Lo que se lleva cada casilla especial encima: si hoy aún se puede usar (brilla), el bote o cuántos hay presos.
const DAILY = { salida: 'salida', suerte: 'suerte', caja: 'caja', 'a-carcel': 'trampa' }
function squareBadge(cell, board) {
  if (!board) return null
  if (DAILY[cell.kind]) return board.used[DAILY[cell.kind]] ? null : { ready: true }
  if (cell.kind === 'parking') return { text: eur(board.bote), ready: board.bote >= PARKING_MIN && !board.used.parking }
  if (cell.kind === 'carcel' && board.jailed.length) return { text: `${board.jailed.length} 🔒` }
  return null
}

function Cell({ cell, own, selected, onSelect, board }) {
  const { row, col, side } = place(cell.i)
  const group = cell.group && GROUPS[cell.group]
  const style = { gridRow: row, gridColumn: col, '--band': group?.color }
  if (!cell.price) {
    const badge = squareBadge(cell, board)
    return (
      <button
        type="button"
        className={`im-cell im-cell--deco im-cell--${side} ${isCorner(cell.i) ? 'is-corner' : ''} im-cell--${cell.kind} ${selected ? 'is-selected' : ''} ${badge?.ready ? 'is-ready' : ''}`}
        style={style}
        onClick={() => onSelect(cell.i)}
        aria-pressed={selected}
        title={cell.name}
      >
        <span className="im-cell__icon" aria-hidden="true">
          {ICON[cell.kind]}
        </span>
        <span className="im-cell__name">{cell.name}</span>
        {badge?.text && <span className="im-cell__badge">{badge.text}</span>}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`im-cell im-cell--${side} im-cell--${cell.kind} ${own ? 'is-owned' : ''} ${own?.owner.me ? 'is-mine' : ''} ${selected ? 'is-selected' : ''}`}
      style={own ? { ...style, '--oh': hueOf(own.owner.name) } : style}
      onClick={() => onSelect(cell.i)}
      aria-pressed={selected}
      aria-label={`${cell.name}: ${own ? `de ${own.owner.me ? 'ti' : own.owner.name}, ${levelName(own.level)}` : `libre, ${eur(cell.price)}`}`}
      title={cell.name}
    >
      {cell.kind === 'calle' ? (
        <span className="im-cell__band">
          <Buildings level={own?.level} />
        </span>
      ) : (
        <span className="im-cell__icon" aria-hidden="true">
          {cell.kind === 'estacion' ? STATION_ICON[cell.i] : cell.icon}
        </span>
      )}
      <span className="im-cell__name">{cell.name}</span>
      {own ? (
        <span className="im-cell__owner">
          <Avatar name={own.owner.name} src={own.owner.avatar} size={20} />
        </span>
      ) : (
        <span className="im-cell__price">{eur(cell.price)}</span>
      )}
    </button>
  )
}

// Ficha de la propiedad, como la tarjeta de título del juego de mesa: precio, alquiler en cada nivel y lo que se puede hacer.
function Deed({ i, own, mine, busy, balance, onBuy, onUpgrade, onSell }) {
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setConfirm(false), [i])
  const cell = cellOf(i)
  const group = GROUPS[cell.group]
  const isMine = own?.owner.me
  const island = cell.kind === 'isla'
  const levels = cell.kind === 'calle' ? Array.from({ length: MAX_LEVEL + 1 }, (_, lv) => lv) : island ? Array.from({ length: MAX_ISLA_LEVEL + 1 }, (_, lv) => lv) : [0]
  const owned = mine.filter((c) => cellOf(c.casilla).group === cell.group).length
  const nextCost = isMine ? upgradeCost(i, own.level) : null
  // Lo invertido con lv mejoras (para el alquiler de cada nivel).
  const investedAt = (lv) => cell.price + lv * (island ? upgradeCost(i, 0) : group.house)
  return (
    <section className={`im-deed ${island ? 'im-deed--isla' : ''}`} style={{ '--band': group.color }} aria-labelledby="deed-title">
      <header className="im-deed__head">
        <small>{cell.kind === 'calle' ? `Título de propiedad · ${group.name}` : island ? `${cell.icon} ${group.name}` : group.name}</small>
        <h2 id="deed-title">{cell.name}</h2>
      </header>
      <dl className="im-deed__rows">
        <div>
          <dt>Precio</dt>
          <dd>{eur(cell.price)}</dd>
        </div>
        {levels.map((lv) => (
          <div key={lv} className={own && own.level === lv ? 'is-now' : undefined}>
            <dt>
              {cell.kind === 'calle'
                ? `Alquiler con ${levelName(lv).toLowerCase()}`
                : island
                  ? lv === 0
                    ? 'Alquiler sin mejoras'
                    : `Con ${UPGRADES[cell.type][lv - 1].toLowerCase()}`
                  : 'Alquiler'}
            </dt>
            <dd>{eur(rentPerHour(investedAt(lv), cell.group, 1))}/h</dd>
          </div>
        ))}
        {island && (
          <div>
            <dt>Cada mejora</dt>
            <dd>{eur(upgradeCost(i, 0))}</dd>
          </div>
        )}
        {cell.kind === 'calle' && (
          <div>
            <dt>Cada casa y el hotel</dt>
            <dd>{eur(group.house)}</dd>
          </div>
        )}
      </dl>
      {cell.fact && <p className="im-deed__fact">{cell.fact}</p>}
      <p className="im-deed__note">
        {cell.kind === 'estacion'
          ? 'Con 2 estaciones el alquiler sube ×1,5; con 3, ×2; con las 4, ×3.'
          : island
            ? `Cuantas más tengas de ${group.name}, más rinden todas: con ${ISLA_TIERS.map(([n, k]) => `${n}, ×${k.toLocaleString('es-ES')}`).join('; con ')}; con la isla entera, ×2.`
            : 'Si tienes todas las de este color, el alquiler se dobla.'}
        {isMine && owned > 1 && cell.kind !== 'calle' && ` Tienes ${owned}.`}
      </p>
      <div className="im-deed__owner">
        {own ? (
          <>
            <Avatar name={own.owner.name} src={own.owner.avatar} size={28} />
            <span>
              {isMine ? 'Es tuya' : `Es de ${own.owner.name}`}
              {(cell.kind === 'calle' || island) && ` · ${levelName(own.level, i)}`}
              <small>
                Rinde {eur(own.perHour)}/h{own.full ? (island ? ' (con el bonus de la isla)' : ' (todo el color)') : ''} · invertido {eur(own.invested)}
              </small>
            </span>
          </>
        ) : (
          <span>Libre: el banco te la vende.</span>
        )}
      </div>
      <div className="im-deed__actions">
        {!own && (
          <button type="button" className="hub-btn hub-btn--primary" disabled={busy || balance < cell.price} onClick={() => onBuy(i)}>
            Comprar · {eur(cell.price)}
          </button>
        )}
        {isMine && nextCost !== null && (
          <button type="button" className="hub-btn hub-btn--primary" disabled={busy || balance < nextCost} onClick={() => onUpgrade(i)}>
            {island
              ? `Mejorar: ${UPGRADES[cell.type][own.level].toLowerCase()}`
              : own.level + 1 >= MAX_LEVEL
                ? 'Poner hotel'
                : `Poner ${own.level + 1 === 1 ? 'una casa' : `la casa ${own.level + 1}`}`}{' '}
            · {eur(nextCost)}
          </button>
        )}
        {isMine && (
          <button
            type="button"
            className={`hub-btn ${confirm ? 'im-sell-confirm' : ''}`}
            disabled={busy}
            onBlur={() => setConfirm(false)}
            onClick={() => {
              if (!confirm) return setConfirm(true)
              setConfirm(false)
              onSell(i)
            }}
          >
            {confirm ? `¿Vender por ${eur(own.sale)}?` : `Vender · ${eur(own.sale)}`}
          </button>
        )}
      </div>
    </section>
  )
}

// Qué hizo cada uno, dicho a otro y a ti.
const LOG_TEXT = {
  compra: ['compró', 'compraste'],
  casa: ['puso una casa en', 'pusiste una casa en'],
  hotel: ['puso un hotel en', 'pusiste un hotel en'],
  mejora: ['mejoró', 'mejoraste'],
  venta: ['vendió', 'vendiste'],
  salida: ['cobró la Salida', 'cobraste la Salida'],
  suerte: ['sacó una carta de Suerte', 'sacaste una carta de Suerte'],
  caja: ['sacó una carta de la Caja de comunidad', 'sacaste una carta de la Caja de comunidad'],
  parking: ['se llevó el bote del Parking', 'te llevaste el bote del Parking'],
  trampa: ['tentó a la suerte y se libró de la cárcel', 'tentaste a la suerte y te libraste'],
  carcel: ['acabó en la cárcel', 'acabaste en la cárcel'],
}

export default function Inmobiliaria({ onExit, juegos }) {
  const { data, offset, load } = useInmo(juegos.request)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('ciudad')
  const [island, setIsland] = useState('grancanaria')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [sound, setSound] = useState(() => !isMuted())
  const [t, setT] = useState(() => Date.now())
  const deed = useRef(null)
  const balance = juegos.me?.balance ?? 0

  // En el móvil la ficha queda debajo del tablero: al tocar una casilla se baja hasta ella.
  useEffect(() => {
    if (selected === null || !window.matchMedia('(max-width: 900px)').matches) return
    deed.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selected])

  useEffect(() => {
    const timer = setInterval(() => setT(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const now = t + offset

  const cells = useMemo(() => data?.cells ?? [], [data])
  // La ciudad y las islas, cada una con lo suyo (mismas filas en el servidor: las islas desde la casilla 200).
  const cityCells = useMemo(() => cells.filter((c) => !isIsland(c.casilla)), [cells])
  const islandCells = useMemo(() => cells.filter((c) => isIsland(c.casilla)), [cells])
  // Ver una propiedad desde fuera (el canal): la vista que toca y, en las islas, su isla.
  const show = (i) => {
    if (isIsland(i)) {
      setView('islas')
      setIsland(cellOf(i).group)
    } else setView('ciudad')
    setSelected(i)
  }
  const byCell = new Map(cells.map((c) => [c.casilla, c]))
  const mine = useMemo(() => cells.filter((c) => c.owner.me), [cells])
  const pending = mine.reduce((sum, c) => sum + accrued(c.perHour, c.since, now), 0)
  const perHour = mine.reduce((sum, c) => sum + c.perHour, 0)
  const worth = mine.reduce((sum, c) => sum + c.invested, 0)
  const capped = mine.some((c) => now - c.since >= RENT_CAP_MS)
  // Las propiedades tuyas con más de una hora de alquiler sin cobrar: en la ciudad llevan una moneda encima.
  const ready = mine
    .filter((c) => now - c.since >= HOUR)
    .map((c) => c.casilla)
    .join(',')
  const [burst, setBurst] = useState(0)
  const [drawn, setDrawn] = useState(null)
  const board = data?.board ?? null

  async function act(a, extra, ok) {
    setBusy(true)
    const body = await load(a, extra)
    setBusy(false)
    if (body?.error) {
      setMsg({ bad: true, text: body.error.message })
      playLose()
    } else if (body?.result) {
      setMsg({ text: ok(body.result) })
    }
  }

  const name = (i) => cellOf(i).name
  const buy = (i) => act('comprar', { casilla: i }, (r) => (playChip(), `¡${name(i)} es tuya! Pagaste ${eur(r.paid)}.`))
  const upgrade = (i) =>
    act('mejorar', { casilla: i }, (r) => {
      const top = isIsland(i) ? r.level >= MAX_ISLA_LEVEL : r.level >= MAX_LEVEL
      if (top) playWin(true)
      else playChip()
      return `${levelName(r.level, i)} en ${name(i)} por ${eur(r.paid)}.`
    })
  const sell = (i) => act('vender', { casilla: i }, (r) => (playCash(), `Vendiste ${name(i)} por ${eur(r.earned)}.`))
  // Las casillas especiales: lo que sale se cuenta en el mensaje y la carta se queda a la vista en el panel.
  const special = (a, extra = {}) =>
    act(a, extra, (r) => {
      if (a === 'carta') {
        setDrawn({ ...r, key: Date.now() })
        if (r.until) playLose()
        else if (r.amount < 0) playLose()
        else playCash(1 + Math.min(2, r.amount / 2000))
        return `Sacaste una carta de ${r.mazo === 'suerte' ? 'Suerte' : 'la Caja de comunidad'}.`
      }
      if (a === 'trampa') {
        if (r.escaped) {
          playWin(true)
          return `¡Te libraste! Cobras ${eur(r.amount)}.`
        }
        playLose()
        return 'A la cárcel: una hora sin cobrar alquiler.'
      }
      playCash(1 + Math.min(2, r.amount / 2000))
      return a === 'parking' ? `¡Te llevaste el bote del Parking: ${eur(r.amount)}!` : `Cobraste ${eur(r.amount)} de la Salida.`
    })
  const collect = () =>
    act('cobrar', {}, (r) => {
      if (r.collected > 0) {
        playCash(1 + Math.min(2, r.collected / 5000))
        setBurst((b) => b + 1)
      }
      return `Cobraste ${eur(r.collected)} de alquileres.`
    })

  return (
    <main className="app im-app">
      <header className="top">
        <h1>Inmobiliaria</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(balance)}</dd>
            </div>
            <div>
              <dt>Tu patrimonio</dt>
              <dd>{eur(worth)}</dd>
            </div>
          </dl>
          <div className="toggles">
            <button type="button" className="tg tg--back" onClick={onExit}>
              Juegos
            </button>
            <button
              type="button"
              className="tg tg--sound"
              aria-pressed={sound}
              onClick={() => {
                setMuted(sound)
                setSound(!sound)
              }}
            >
              Sonido
            </button>
            <Help className="tg tg--help" title="Cómo funciona la Inmobiliaria" wide>
              <p>
                Un tablero con {PROPERTIES.length} propiedades de Canarias, las mismas para todos: <b>cada una tiene un solo dueño</b> y entre
                todos se va construyendo la ciudad del centro. Compra al banco calles, estaciones y compañías.
              </p>
              <p>
                En las calles puedes poner <b>hasta 4 casas y un hotel</b>. Cada propiedad da un <b>alquiler cada hora</b> que paga el banco: un{' '}
                {(RENT_RATE * 100).toLocaleString('es-ES')} % de lo que llevas invertido en ella (compra y casas). Si tienes <b>todas las de un color</b>, el
                alquiler se dobla; las estaciones suben con cuántas tengas. El alquiler se acumula hasta {RENT_CAP_MS / 3600000} h: entra a cobrarlo.
              </p>
              <p>
                Las <b>casillas especiales</b> también se tocan, una vez al día: la Salida paga, Suerte y Caja de comunidad dan una carta, el Parking se
                lleva el bote de todos y «Vete a la cárcel» es a cara o cruz. Brillan cuando aún las puedes usar hoy.
              </p>
              <p>
                <b>Hacienda no ve las propiedades</b>, solo tu saldo: son una forma de guardar el dinero. Lo que cobras de alquiler sí es efectivo.
              </p>
              <p>
                Y fuera del tablero, <b>las 7 islas</b>: {ISLANDS.length} propiedades más, doce en cada isla, de una casa cueva en Artenara a la Isla de
                Lobos entera. Se compran igual y no llevan casas: cada una se mejora {MAX_ISLA_LEVEL} veces (una piscina, una estrella Michelin, una
                flota de barcos…), cada mejora por el {ISLA_UPGRADE * 100} % de su precio. Cuantas más tengas de una misma isla, más rinden todas:
                con {ISLA_TIERS.map(([n, k]) => `${n}, ×${k.toLocaleString('es-ES')}`).join('; con ')}, y con la isla entera, el doble.
              </p>
              <p>
                Al <b>vender</b>, el banco te da el {SELL_NOW * 100} % de lo que invertiste esta semana y el {SELL_OLD * 100} % de lo de semanas anteriores
                (el saldo se reinicia cada domingo). Las propiedades se quedan contigo entre semanas y siguen dando alquiler.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="im-layout fill">
        <div className="im-stage">
          <div className="im-views" role="tablist" aria-label="Qué ver">
            {[
              ['ciudad', '🏙️ La ciudad'],
              ['islas', '🏝️ Las 7 islas'],
            ].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'is-on' : undefined} onClick={() => setView(key)}>
                {label}
              </button>
            ))}
          </div>
          {view === 'ciudad' ? (
            <section className="im-board" aria-label="Tablero">
              {BOARD.map((cell) => (
                <Cell key={cell.i} cell={cell} own={byCell.get(cell.i)} selected={selected === cell.i} onSelect={setSelected} board={board} />
              ))}
              <InmoCity cells={cityCells} selected={selected} onSelect={setSelected} ready={ready} burst={burst} />
            </section>
          ) : (
            <InmoIslas island={island} onIsland={setIsland} cells={islandCells} selected={selected} onSelect={setSelected} />
          )}
        </div>

        <aside className="im-side">
          <section className="im-wallet" aria-label="Tu cartera">
            <div>
              <small>Alquiler por cobrar</small>
              <b>{eur(pending)}</b>
              <small>
                {mine.length ? `${mine.length} ${mine.length === 1 ? 'propiedad' : 'propiedades'} · ${eur(perHour)}/h` : 'Aún no tienes propiedades'}
                {capped && ' · ¡lleno! cóbralo'}
              </small>
              {board?.carcel && <small className="im-wallet__jail">🔒 En la cárcel: sin alquiler hasta las {new Date(board.carcel).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small>}
            </div>
            <button type="button" className="hub-btn hub-btn--primary" disabled={busy || pending <= 0} onClick={collect}>
              Cobrar
            </button>
          </section>

          {msg && (
            <p className={`im-msg ${msg.bad ? 'is-bad' : ''}`} role="status">
              {msg.text}
            </p>
          )}

          <span ref={deed} aria-hidden="true" />
          {selected !== null && !cellOf(selected).price ? (
            <Squares i={selected} board={board} now={now} busy={busy} balance={balance} drawn={drawn} onAct={special} />
          ) : selected !== null ? (
            <Deed
              i={selected}
              own={byCell.get(selected)}
              mine={mine}
              busy={busy}
              balance={balance}
              onBuy={buy}
              onUpgrade={upgrade}
              onSell={sell}
            />
          ) : (
            <p className="im-hint">{view === 'islas' ? 'Toca una propiedad de la isla para ver su ficha, comprarla o mejorarla.' : 'Toca una casilla del tablero para ver su ficha, comprarla o construir.'}</p>
          )}

          {data?.ranking?.length > 0 && (
            <section className="im-rank" aria-labelledby="rank-title">
              <h2 id="rank-title">Los dueños</h2>
              <ol>
                {data.ranking.map((o) => (
                  <li key={o.id} className={o.me ? 'is-me' : undefined}>
                    <Avatar name={o.name} src={o.avatar} size={24} />
                    <span>
                      {o.me ? 'Tú' : o.name}
                      <small>
                        {o.count} {o.count === 1 ? 'propiedad' : 'propiedades'} · {eur(o.perHour)}/h
                      </small>
                    </span>
                    <b>{eur(o.worth)}</b>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {data?.log?.length > 0 && (
            <section className="im-log" aria-labelledby="log-title">
              <h2 id="log-title">Últimos movimientos</h2>
              <ul>
                {data.log.slice(0, 10).map((l) => (
                  <li key={l.id}>
                    <i style={{ background: GROUPS[cellOf(l.casilla).group]?.color ?? '#c9a45a' }} aria-hidden="true" />
                    <span>
                      <b>{l.by.me ? 'Tú' : l.by.name}</b> {LOG_TEXT[l.type]?.[l.by.me ? 1 : 0] ?? l.type}{' '}
                      {cellOf(l.casilla).price ? (
                        <button type="button" onClick={() => show(l.casilla)}>{name(l.casilla)}</button>
                      ) : null}
                    </span>
                    <small>{eur(l.amount)}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  )
}

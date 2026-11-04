import { useEffect, useState } from 'react'
import Avatar from './Avatar.jsx'
import { delta, eur, until } from './money.js'
import './score.css'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const SHORT = ['Inicio', 'L', 'M', 'X', 'J', 'V', 'S', 'D']
const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 })
const REFRESH_MS = 30000
const WEEK_MS = 7 * 24 * 3600 * 1000

// Lo que tiene cada uno fuera del saldo (lo calcula el servidor): cartas, Inmobiliaria y Suiza. Hacienda no lo ve.
const ASSETS = [
  ['balance', 'Saldo de la semana', '💵'],
  ['cards', 'Cartas', '🃏'],
  ['inmo', 'Inmobiliaria', '🏠'],
  ['suiza', 'Suiza', '🏦'],
]
const assetsOf = (p) => (p.assets?.cards ?? 0) + (p.assets?.inmo ?? 0) + (p.assets?.suiza ?? 0)
const totalOf = (p) => p.balance + assetsOf(p)
const partOf = (p, key) => (key === 'balance' ? p.balance : (p.assets?.[key] ?? 0))

// El desglose de lo que tiene alguien: una barra con cada parte y la lista con su importe.
function Wealth({ player }) {
  const total = Math.max(1, totalOf(player))
  return (
    <div className="sb-wealth">
      <p className="sb-wealth__total">
        <small>En total</small>
        <b>{eur(totalOf(player))}</b>
      </p>
      <div className="sb-wealth__bar" aria-hidden="true">
        {ASSETS.map(([key]) => (
          <i key={key} className={`sb-wealth--${key}`} style={{ flexGrow: Math.max(0, partOf(player, key)) / total }} />
        ))}
      </div>
      <ul className="sb-wealth__list">
        {ASSETS.map(([key, label, icon]) => (
          <li key={key}>
            <i className={`sb-wealth--${key}`} aria-hidden="true" />
            <span>
              {icon} {label}
            </span>
            <b>{eur(partOf(player, key))}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Serie de la semana: el saldo inicial y cómo cerró cada día (null = día que aún no llegó).
const seriesOf = (player, starting) => [starting, ...player.days]

// Lo que ha ganado o perdido hoy: el saldo de hoy menos el de ayer (o el de salida, el lunes).
function todayOf(player, day, starting) {
  const now = player.days[day]
  if (now === null || now === undefined) return 0
  const before = day > 0 ? (player.days[day - 1] ?? starting) : starting
  return now - before
}

// Ticks redondos para el eje: 3 o 4 valores «bonitos» que cubren el rango.
function ticks(min, max) {
  const span = Math.max(max - min, 1000)
  const raw = span / 3
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)
  const out = []
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(v)
  if (out.at(-1) < max) out.push(out.at(-1) + step)
  return out
}

function Sparkline({ values, up }) {
  const known = values.filter((v) => v !== null)
  const lo = Math.min(...known)
  const hi = Math.max(...known)
  const x = (i) => 2 + (i * 92) / (values.length - 1)
  const y = (v) => (hi === lo ? 14 : 26 - ((v - lo) / (hi - lo)) * 24)
  const points = values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean)
  const lastIndex = values.findLastIndex((v) => v !== null)
  return (
    <svg className={`sb-spark ${up ? 'is-up' : 'is-down'}`} viewBox="0 0 96 28" aria-hidden="true">
      <polyline points={points.join(' ')} />
      <circle cx={x(lastIndex)} cy={y(values[lastIndex])} r="2.6" />
    </svg>
  )
}

// Evolución de un jugador en la semana, con la línea de los 15.000 € de salida como referencia y el área rellena.
function WeekChart({ player, starting }) {
  const [hover, setHover] = useState(null)
  const values = seriesOf(player, starting)
  const known = values.filter((v) => v !== null)
  const scale = ticks(Math.min(...known, starting), Math.max(...known, starting))
  const lo = scale[0]
  const hi = scale.at(-1)
  const W = 560
  const H = 220
  const left = 56
  const right = 16
  const top = 14
  const bottom = 30
  const x = (i) => left + (i * (W - left - right)) / (values.length - 1)
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom)
  const pts = values.map((v, i) => (v === null ? null : [x(i), y(v)])).filter(Boolean)
  const line = pts.map(([a, b]) => `${a},${b}`).join(' ')
  const area = pts.length > 1 ? `M${pts[0][0]},${H - bottom} L${line.replaceAll(' ', ' L')} L${pts.at(-1)[0]},${H - bottom} Z` : ''
  const lastIndex = values.findLastIndex((v) => v !== null)
  const shown = hover ?? lastIndex
  const value = values[shown]
  const up = values[lastIndex] >= starting

  return (
    <figure className={`sb-chart ${up ? 'is-up' : 'is-down'}`}>
      <figcaption className="sb-chart__head">
        <span>
          {shown === 0 ? 'Saldo de salida' : DAYS[shown - 1]}
          {hover === null && shown > 0 ? ' (hoy)' : ''}
        </span>
        {value !== null && (
          <b>
            {eur(value)} <small className={value >= starting ? 'up' : 'down'}>{delta(value - starting)}</small>
          </b>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución de ${player.name} esta semana`}>
        <defs>
          <linearGradient id="sb-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {scale.map((t) => (
          <g key={t} className="sb-chart__grid">
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} />
            <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {compact.format(t)}
            </text>
          </g>
        ))}
        <line className="sb-chart__base" x1={left} x2={W - right} y1={y(starting)} y2={y(starting)} />
        {SHORT.map((label, i) => (
          <text key={label} className="sb-chart__day" x={x(i)} y={H - 8} textAnchor="middle">
            {label}
          </text>
        ))}
        {hover !== null && values[hover] !== null && <line className="sb-chart__cross" x1={x(hover)} x2={x(hover)} y1={top} y2={H - bottom} />}
        {area && <path className="sb-chart__area" d={area} fill="url(#sb-area)" />}
        <polyline className="sb-chart__line" points={line} />
        {values.map((v, i) =>
          v === null ? null : <circle key={i} className={`sb-chart__dot ${i === shown ? 'is-on' : ''}`} cx={x(i)} cy={y(v)} r={i === shown ? 6 : 4} />,
        )}
        {/* Zonas de hover más anchas que los puntos. */}
        {values.map((v, i) => (
          <rect
            key={i}
            className="sb-chart__hit"
            x={x(i) - (W - left - right) / 14}
            width={(W - left - right) / 7}
            y={0}
            height={H}
            onPointerEnter={() => v !== null && setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
    </figure>
  )
}

// Podio de esta semana: 2.º, 1.º y 3.º, con los escalones a distinta altura.
function Podium({ players, starting, onPick }) {
  const top = [players[1], players[0], players[2]]
  return (
    <ol className="sb-podium" aria-label="Podio de esta semana">
      {top.map((p, i) => {
        const place = [2, 1, 3][i]
        if (!p) {
          return (
            <li key={place} className={`sb-podium__step sb-podium__step--${place} is-empty`}>
              <span className="sb-podium__seat" aria-hidden="true">
                ?
              </span>
              <span className="sb-podium__name">Libre</span>
              <span className="sb-podium__block">{place}</span>
            </li>
          )
        }
        return (
          <li key={place} className={`sb-podium__step sb-podium__step--${place} ${p.me ? 'is-me' : ''}`}>
            <button type="button" onClick={() => onPick(p.rank)} aria-label={`${place}.º ${p.name}, ${eur(p.balance)}`}>
              {place === 1 && (
                <span className="sb-podium__crown" aria-hidden="true">
                  ♛
                </span>
              )}
              <span className="sb-podium__avatar">
                <Avatar name={p.name} src={p.avatar} size={place === 1 ? 76 : 58} />
              </span>
              <span className="sb-podium__name">
                {p.name}
                {p.me && <small> · tú</small>}
                {p.pase > 0 && <i className="s4-lvl">Nv {p.pase}</i>}
              </span>
              <b className="sb-podium__money">{eur(p.balance)}</b>
              <small className={p.balance >= starting ? 'up' : 'down'}>{delta(p.balance - starting)}</small>
              <span className="sb-podium__block">{place}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// Tu tarjeta: puesto, saldo, cómo vas hoy y cuánto te falta para el siguiente (o cuánto le sacas al segundo).
function MyCard({ mine, players, day, starting }) {
  const today = todayOf(mine, day, starting)
  const ahead = players[mine.rank - 2]
  const behind = players[mine.rank]
  let chase = null
  if (ahead) chase = `Te faltan ${eur(ahead.balance - mine.balance + 1)} para pasar a ${ahead.name} (${ahead.rank}.º).`
  else if (behind) chase = `¡Vas primero! Le sacas ${eur(mine.balance - behind.balance)} a ${behind.name}.`
  else chase = '¡Vas primero!'
  return (
    <section className="sb-me" aria-label="Tu semana">
      <div className="sb-me__rank">
        <small>Tu puesto</small>
        <b>{mine.rank}.º</b>
        <small>de {players.length}</small>
      </div>
      <div className="sb-me__body">
        <p className="sb-me__money">
          {eur(mine.balance)} <small className={mine.balance >= starting ? 'up' : 'down'}>{delta(mine.balance - starting)}</small>
        </p>
        <p className="sb-me__chase">{chase}</p>
        {assetsOf(mine) > 0 && (
          <p className="sb-me__assets">
            Además tienes {eur(assetsOf(mine))} en activos: en total, {eur(totalOf(mine))}.
          </p>
        )}
      </div>
      <div className={`sb-me__today ${today > 0 ? 'is-up' : today < 0 ? 'is-down' : ''}`}>
        <small>Hoy</small>
        <b>{delta(today)}</b>
      </div>
    </section>
  )
}

function Scoreboard({ juegos, onExit }) {
  const { scores, send, conn, me } = juegos
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('semana')
  const [, tick] = useState(0)

  // Se pide al entrar y se refresca mientras la pantalla está abierta.
  useEffect(() => {
    if (conn !== 'open' || !me) return
    send({ t: 'scores' })
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') send({ t: 'scores' })
      tick((n) => n + 1)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [conn, me, send])

  const players = scores?.players ?? []
  const starting = scores?.starting ?? 15000
  const day = scores?.week?.day ?? 0
  const mine = players.find((p) => p.me)
  const focus = players.find((p) => p.rank === selected) ?? mine ?? players[0]
  const last = scores?.lastWeek
  // «Con activos» ordena por todo lo que tiene cada uno; el podio y los puestos oficiales siguen siendo los del saldo.
  const total = mode === 'total'
  const listed = total ? [...players].sort((a, b) => totalOf(b) - totalOf(a)) : players
  const valueOf = (p) => (total ? totalOf(p) : p.balance)
  const leader = Math.max(1, ...listed.map(valueOf))
  const resetAt = scores?.week?.resetAt
  const weekLeft = resetAt ? Math.min(1, Math.max(0, (resetAt - Date.now()) / WEEK_MS)) : 0

  return (
    <main className="app hub sb">
      <header className="sb-top">
        <button type="button" className="hub-btn hub-btn--ghost" onClick={onExit}>
          ← Juegos
        </button>
        <div className="sb-top__title">
          <h1>Score</h1>
          <p>
            {scores
              ? `${players.length} ${players.length === 1 ? 'jugador' : 'jugadores'} esta semana · todos empiezan con ${eur(starting)}`
              : 'Cargando la clasificación…'}
          </p>
        </div>
        {resetAt && (
          <div className="sb-reset" style={{ '--left': weekLeft }}>
            <small>Se reinicia en</small>
            <b>{until(resetAt)}</b>
            <i aria-hidden="true" />
          </div>
        )}
      </header>

      {scores && players.length === 0 && <p className="sb-empty">Nadie ha jugado todavía esta semana. ¡El primero que juegue se pone líder!</p>}

      {players.length > 0 && <Podium players={players} starting={starting} onPick={setSelected} />}

      {mine ? (
        <MyCard mine={mine} players={players} day={day} starting={starting} />
      ) : (
        scores &&
        players.length > 0 && <p className="sb-empty">Aún no estás en la clasificación: juega una mano o una tirada (mesas o solo) para entrar.</p>
      )}

      {players.length > 0 && (
        <div className="sb-grid">
          <section className="sb-board" aria-label="Clasificación de la semana">
            <div className="sb-board__head">
              <h2 className="hub-title">Clasificación</h2>
              <div className="sb-modes" role="tablist" aria-label="Ordenar por">
                {[
                  ['semana', 'Dinero de la semana'],
                  ['total', 'Con activos'],
                ].map(([key, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'is-on' : undefined} onClick={() => setMode(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {total && <p className="sb-modes__note">Saldo de la semana más cartas, Inmobiliaria y Suiza. El podio sigue siendo el del saldo.</p>}
            <ol className="sb-list">
              {listed.map((p, k) => {
                const pos = k + 1
                const up = p.balance >= starting
                const today = todayOf(p, day, starting)
                return (
                  <li key={p.rank} style={{ '--i': Math.min(p.rank, 20) }}>
                    <button
                      type="button"
                      className={`sb-row ${p.me ? 'sb-row--me' : ''} ${focus === p ? 'is-selected' : ''}`}
                      aria-pressed={focus === p}
                      onClick={() => setSelected(p.rank)}
                    >
                      <span className="sb-row__bar" style={{ '--w': Math.max(0.04, valueOf(p) / leader) }} aria-hidden="true" />
                      <span className={`sb-row__rank sb-row__rank--${pos}`}>{pos}</span>
                      <Avatar name={p.name} src={p.avatar} size={38} />
                      <span className="sb-row__name">
                        <span>
                          {p.name}
                          {p.me && <small> · tú</small>}
                          {p.pase > 0 && (
                            <i className="s4-lvl" title={`Nivel ${p.pase} del Pase de las Islas`}>
                              Nv {p.pase}
                            </i>
                          )}
                        </span>
                        {today !== 0 && <em className={today > 0 ? 'up' : 'down'}>hoy {delta(today)}</em>}
                      </span>
                      <Sparkline values={seriesOf(p, starting)} up={up} />
                      <span className="sb-row__money">
                        <b>{eur(valueOf(p))}</b>
                        {total ? (
                          <small className="sb-row__assets">
                            💵 {eur(p.balance)} · activos {eur(assetsOf(p))}
                          </small>
                        ) : (
                          <small className={up ? 'up' : 'down'}>
                            {delta(p.balance - starting)}
                            {assetsOf(p) > 0 && <em className="sb-row__plus"> · +{eur(assetsOf(p))} en activos</em>}
                          </small>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>

          <aside className="sb-side">
            {focus && (
              <section className="sb-card">
                <h2>
                  <Avatar name={focus.name} src={focus.avatar} size={30} />
                  {focus.me ? 'Tu semana' : `La semana de ${focus.name}`}
                </h2>
                <WeekChart player={focus} starting={starting} />
              </section>
            )}
            {focus && (
              <section className="sb-card">
                <h2>{focus.me ? 'Lo que tienes' : `Lo que tiene ${focus.name}`}</h2>
                <Wealth player={focus} />
              </section>
            )}
            <section className="sb-card">
              <h2>Podio de la semana pasada</h2>
              {last?.podium?.length ? (
                <ol className="sb-last">
                  {last.podium.map((p, i) => (
                    <li key={i} className={`sb-last__item sb-last__item--${i + 1}`}>
                      <span className={`sb-row__rank sb-row__rank--${i + 1}`} aria-label={`${i + 1}.º`}>
                        {i + 1}
                      </span>
                      <Avatar name={p.name} src={p.avatar} size={34} />
                      <span className="sb-last__name">{p.name}</span>
                      <b>{eur(p.balance)}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="sb-empty">Aún no hay podio: el primero se decide este domingo a las 23:59.</p>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  )
}

export default Scoreboard

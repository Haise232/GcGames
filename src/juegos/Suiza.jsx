import { useCallback, useEffect, useRef, useState } from 'react'
import Help from './Help.jsx'
import { eur } from './money.js'
import { isMuted, playCash, playChip, playClunk, playLose, setMuted } from './sound.js'
import { FEE_NOW, KEEP_OLD, MIN_DEPOSIT, accountNumber, withdrawal } from './suiza.js'
import './Suiza.css'

// La Cuenta en Suiza (reglas en suiza.js, servidor en api/_juegos/suiza.mjs): a la izquierda la cámara acorazada en
// los Alpes, que se abre y se traga (o escupe) los billetes; a la derecha la tarjeta de la cuenta y la ventanilla.

// Número que sube o baja poco a poco hasta su valor (el saldo de la tarjeta).
function useCounter(value, ms = 900) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms)
      const v = Math.round(a + (value - a) * (1 - (1 - k) ** 3))
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

const FLAKES = Array.from({ length: 36 }, (_, k) => ({ left: (k * 37) % 100, size: 2 + (k % 4), dur: 6 + (k % 7), delay: -((k * 1.3) % 9) }))

// La cámara: montañas nevadas, nieve, la puerta acorazada y los billetes que entran o salen.
function Vault({ flow }) {
  return (
    <div className={`sz-vault ${flow ? `is-${flow.type}` : ''}`}>
      <svg className="sz-alps" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path className="sz-alps__far" d="M0 140 L40 96 L70 118 L120 60 L160 104 L200 70 L250 120 L300 54 L345 100 L400 76 L400 200 L0 200 Z" />
        <path className="sz-alps__snow" d="M120 60 L108 76 L118 72 L126 80 L134 72 Z M300 54 L287 72 L298 68 L306 76 L314 68 Z M200 70 L190 82 L200 79 L210 84 Z" />
        <path className="sz-alps__near" d="M0 170 L60 128 L110 156 L170 118 L230 160 L290 126 L350 158 L400 140 L400 200 L0 200 Z" />
        <g className="sz-pines">
          {[18, 44, 90, 140, 196, 252, 318, 372].map((x, k) => (
            <path key={x} d={`M${x} ${186 - (k % 3) * 4} l9 0 l-4.5 -${16 + (k % 3) * 4} z`} />
          ))}
        </g>
      </svg>
      <div className="sz-snow" aria-hidden="true">
        {FLAKES.map((f, k) => (
          <i key={k} style={{ left: `${f.left}%`, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }} />
        ))}
      </div>

      <div className="sz-bank">
        <div className="sz-bank__sign">
          <span>Banco Alpino</span>
          <small>Zúrich · desde 1891</small>
        </div>
        <div className="sz-door" aria-hidden="true">
          <div className="sz-door__ring" />
          <div className="sz-door__bolts">
            {Array.from({ length: 12 }, (_, k) => (
              <i key={k} style={{ '--a': `${k * 30}deg` }} />
            ))}
          </div>
          <div className="sz-door__wheel">
            {[0, 60, 120].map((a) => (
              <i key={a} style={{ '--a': `${a}deg` }} />
            ))}
            <b />
          </div>
          <div className="sz-door__glow" />
        </div>
        {flow && (
          <div className="sz-bills" key={flow.key} aria-hidden="true">
            {Array.from({ length: Math.min(14, 4 + Math.floor(Math.log10(flow.amount + 1) * 2)) }, (_, k) => (
              <i key={k} style={{ '--k': k, '--x': `${(((k * 47) % 100) - 50) * 0.7}cqw`, '--r': `${((k * 73) % 60) - 30}deg` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const MOV_TEXT = { ingreso: 'Ingreso', retirada: 'Retirada' }
const fmtDate = (t) => new Date(t).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })

export default function Suiza({ onExit, juegos }) {
  const [data, setData] = useState(null)
  const [mode, setMode] = useState('ingresar')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [flow, setFlow] = useState(null)
  const [sound, setSound] = useState(() => !isMuted())
  const balance = juegos.me?.balance ?? 0
  const userId = juegos.me?.id ?? ''
  const request = juegos.request

  const load = useCallback(
    async (a = 'estado', extra = {}) => {
      const body = await request({ t: 'suiza', a, ...extra })
      if (body?.suiza) setData(body.suiza)
      return body
    },
    [request],
  )
  useEffect(() => {
    load()
  }, [load])

  const swiss = data?.balance ?? 0
  const shown = useCounter(swiss)
  const value = Number(amount) || 0
  const max = mode === 'ingresar' ? balance : swiss
  const preview = data && mode === 'retirar' && value > 0 && value <= swiss ? withdrawal(data, value, data.currentWeek) : null
  const invalid = value <= 0 || value > max || (mode === 'ingresar' && value < MIN_DEPOSIT)

  async function submit(e) {
    e.preventDefault()
    if (invalid || busy) return
    setBusy(true)
    const body = await load(mode, { importe: value })
    setBusy(false)
    if (body?.error) {
      setMsg({ bad: true, text: body.error.message })
      playLose()
      return
    }
    if (!body?.result) return
    setFlow({ type: mode === 'ingresar' ? 'in' : 'out', amount: value, key: Date.now() })
    setAmount('')
    if (mode === 'ingresar') {
      playChip()
      setTimeout(playClunk, 1100)
      setMsg({ text: `${eur(value)} a salvo en Suiza. Hacienda no los ve.` })
    } else {
      playCash(1 + Math.min(2, body.result.got / 10000))
      setMsg({ text: `Te llegan ${eur(body.result.got)} (el banco se queda ${eur(body.result.fee)}).` })
    }
  }
  useEffect(() => {
    if (!flow) return
    const timer = setTimeout(() => setFlow(null), 2200)
    return () => clearTimeout(timer)
  }, [flow])

  const quick = mode === 'ingresar' ? [MIN_DEPOSIT, 10000, Math.floor(balance / 2), balance] : [Math.floor(swiss / 4), Math.floor(swiss / 2), swiss]
  const quickLabel = (n, k) => (k === quick.length - 1 ? 'Todo' : mode === 'ingresar' && k === 2 ? 'La mitad' : mode === 'retirar' ? ['¼', 'La mitad'][k] : eur(n))

  return (
    <main className="app sz-app">
      <header className="top">
        <h1>Cuenta en Suiza</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(balance)}</dd>
            </div>
            <div>
              <dt>En Suiza</dt>
              <dd>{eur(swiss)}</dd>
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
            <Help className="tg tg--help" title="Cómo funciona la Cuenta en Suiza">
              <p>
                Una cuenta numerada donde guardar tu efectivo. <b>Hacienda solo mira el saldo de la semana</b>: lo que tengas en Suiza no cuenta para
                sus tramos ni para las inspecciones. Nadie más ve lo que tienes.
              </p>
              <p>
                Puedes ingresar desde {eur(MIN_DEPOSIT)}, pero no con una declaración de Hacienda pendiente: primero contéstala.
              </p>
              <p>
                Al retirar, lo que ingresaste <b>esta semana</b> sale con una comisión del {FEE_NOW * 100} %. Lo de <b>semanas anteriores</b> (el saldo
                se reinicia cada domingo) solo te devuelve el {KEEP_OLD * 100} %. Se saca primero lo de esta semana. Lo que se queda el banco va al bote
                del Bingo.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <div className="sz-layout fill">
        <Vault flow={flow} />

        <aside className="sz-side">
          <section className="sz-card" aria-label="Tu cuenta">
            <div className="sz-card__top">
              <span className="sz-card__chip" aria-hidden="true" />
              <span className="sz-card__bank">Banco Alpino · Zúrich</span>
            </div>
            <small>Saldo en la cuenta</small>
            <b className="sz-card__balance">{eur(shown)}</b>
            <span className="sz-card__number">{accountNumber(userId)}</span>
            <span className="sz-card__holder">{juegos.me?.name ?? 'Titular'}</span>
            {swiss > 0 && (
              <div className="sz-split" aria-label="De cuándo es el dinero">
                <span style={{ flexGrow: data.now || 0.0001 }} className="sz-split__now" />
                <span style={{ flexGrow: data.old || 0.0001 }} className="sz-split__old" />
              </div>
            )}
            {swiss > 0 && (
              <p className="sz-card__legend">
                <span>
                  <i className="sz-dot sz-dot--now" /> Esta semana {eur(data.now)} <em>(sale al {100 - FEE_NOW * 100} %)</em>
                </span>
                <span>
                  <i className="sz-dot sz-dot--old" /> Semanas anteriores {eur(data.old)} <em>(sale al {KEEP_OLD * 100} %)</em>
                </span>
              </p>
            )}
          </section>

          <form className="sz-desk" onSubmit={submit}>
            <div className="sz-tabs" role="tablist">
              {[
                ['ingresar', 'Ingresar'],
                ['retirar', 'Retirar'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  className={mode === key ? 'is-on' : undefined}
                  onClick={() => {
                    setMode(key)
                    setAmount('')
                    setMsg(null)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="sz-amount">
              <span>{mode === 'ingresar' ? '¿Cuánto quieres esconder?' : '¿Cuánto quieres sacar?'}</span>
              <span className="sz-amount__box">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                />
                <em>€</em>
              </span>
            </label>
            <div className="sz-quick">
              {quick.map((n, k) => (
                <button key={k} type="button" disabled={n <= 0} onClick={() => setAmount(String(n))}>
                  {quickLabel(n, k)}
                </button>
              ))}
            </div>
            <p className="sz-preview">
              {mode === 'ingresar'
                ? value > balance
                  ? 'No te llega el saldo de la semana.'
                  : value > 0 && value < MIN_DEPOSIT
                    ? `El mínimo son ${eur(MIN_DEPOSIT)}.`
                    : `Se queda en tu saldo: ${eur(Math.max(0, balance - value))}. Hacienda no verá lo que ingreses.`
                : value > swiss
                  ? 'No tienes tanto en Suiza.'
                  : preview
                    ? `Te llegan ${eur(preview.got)} · comisión ${eur(preview.fee)}`
                    : swiss > 0
                      ? 'Elige cuánto sacar.'
                      : 'Todavía no tienes nada en Suiza.'}
            </p>
            <button type="submit" className="hub-btn hub-btn--primary sz-go" disabled={invalid || busy}>
              {mode === 'ingresar' ? `Ingresar${value > 0 ? ` ${eur(value)}` : ''}` : `Retirar${value > 0 ? ` ${eur(value)}` : ''}`}
            </button>
          </form>

          {msg && (
            <p className={`sz-msg ${msg.bad ? 'is-bad' : ''}`} role="status">
              {msg.text}
            </p>
          )}

          {data?.movs?.length > 0 && (
            <section className="sz-movs" aria-labelledby="sz-movs-title">
              <h2 id="sz-movs-title">Movimientos</h2>
              <ul>
                {data.movs.map((m) => (
                  <li key={`${m.t}-${m.tipo}`} className={`is-${m.tipo}`}>
                    <span>
                      {MOV_TEXT[m.tipo]}
                      <small>{fmtDate(m.t)}</small>
                    </span>
                    <b>
                      {m.tipo === 'ingreso' ? '+' : '−'}
                      {eur(m.importe)}
                    </b>
                    {m.tipo === 'retirada' && <small className="sz-movs__net">te llegaron {eur(m.neto)}</small>}
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

// Banner del selector de juegos.
export function SuizaBanner({ onOpen }) {
  return (
    <button type="button" className="sz-banner" onClick={onOpen}>
      <span>
        <span className="sz-banner__new">Nuevo</span>
        <h3>Cuenta en Suiza</h3>
        <p>Esconde tu efectivo donde Hacienda no mira. Sácalo cuando quieras… con comisión.</p>
        <span className="sz-banner__cta">Abrir la cuenta</span>
      </span>
      <span className="sz-banner__door" aria-hidden="true">
        <i />
      </span>
    </button>
  )
}

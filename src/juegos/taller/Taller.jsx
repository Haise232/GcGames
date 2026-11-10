// El Taller de Papá Noel (Season 5): un tycoon. Inviertes saldo en puestos (elfos, carpintería, muñecas, bicis,
// consolas) que producen € cada hora aunque no estés, y en mejoras que multiplican la producción o agrandan el almacén.
// Lo producido se guarda en el almacén hasta que se llena: hay que pasarse a recoger. Todo se reinicia el domingo a las
// 23:59, como el saldo. Las cuentas las hace el servidor (taller.js); aquí el almacén se ve llenarse en directo.
import { useEffect, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import { HOUR, STATIONS, STATION_IDS, UPGRADES, UPGRADE_IDS, capHours, multOf, paybackHours, ratePerHour, stationCost, upgradeCost } from './taller.js'
import { eur, until } from '../comun/money.js'
import { buzz, playCash, playChip, playJingle } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import { FiestaHeader } from '../season4/FiestaParts.jsx'
import './Taller.css'

const fmtH = (h) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`)

// La nave del taller: vigas, ventanas con nieve, la cinta con los regalos y una fila por puesto con sus trabajadores.
function Nave({ units, rate }) {
  const speed = rate > 0 ? Math.max(1.2, 9 - Math.log10(rate + 1) * 2.4) : 0
  return (
    <div className="ta-nave" aria-hidden="true">
      <div className="ta-windows">
        {[0, 1, 2].map((i) => (
          <span key={i} />
        ))}
      </div>
      <div className="ta-rows">
        {STATION_IDS.map((id) => {
          const n = units[id] ?? 0
          return (
            <div key={id} className={`ta-row ${n ? 'is-on' : ''}`}>
              <span className="ta-row__name">
                {STATIONS[id].icon} {STATIONS[id].name}
              </span>
              <span className="ta-row__crew">
                {n === 0 ? <em>Sin abrir</em> : Array.from({ length: Math.min(n, 14) }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 5) * -0.3}s` }}>{STATIONS[id].icon}</i>)}
                {n > 14 && <b>+{n - 14}</b>}
              </span>
            </div>
          )
        })}
      </div>
      <div className={`ta-belt ${speed ? 'is-on' : ''}`} style={{ '--speed': `${speed}s` }}>
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} style={{ '--i': i }}>
            🎁
          </span>
        ))}
      </div>
    </div>
  )
}

function Taller({ onExit, juegos }) {
  const [v, setV] = useState(null) // la última vista del servidor
  const [at, setAt] = useState(0) // Date.now() de cuando llegó
  const [, setTick] = useState(0)
  const [asking, setAsking] = useState(false)
  const [ready, setReady] = useState(false)
  const [flash, setFlash] = useState(null)
  const lock = useRef(false)
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking) setBalance(serverBalance)
  }, [serverBalance, asking])
  const shownBank = useCountUp(balance)

  const take = (nv) => {
    setV(nv)
    setAt(Date.now())
    setBalance(nv.balance)
  }
  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_taller', a: 'sync' })
    if (body?.solo) take(body.solo)
  })
  useEffect(() => {
    resync().then(() => setReady(true))
    // El almacén se ve subir cada segundo; cada 2 minutos se pregunta al servidor por si acaso.
    const tick = setInterval(() => setTick((t) => t + 1), 1000)
    const poll = setInterval(() => resync(), 120000)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [])

  async function act(message) {
    if (lock.current) return null
    lock.current = true
    setAsking(true)
    const body = await request({ t: 'solo_taller', ...message })
    lock.current = false
    setAsking(false)
    const nv = body?.solo ?? null
    if (!nv) await resync()
    else take(nv)
    return nv
  }

  const units = v?.units ?? {}
  const upgrades = v?.upgrades ?? {}
  const rate = v?.rate ?? 0
  const cap = rate * (v?.cap ?? capHours(upgrades))
  const stored = v ? Math.min(cap, v.stored + (rate * (Date.now() - at)) / HOUR) : 0
  const full = cap > 0 && stored >= cap - 0.5
  const shownStored = useCountUp(Math.floor(stored), 300)
  const busy = asking || !ready
  // Horas que quedan hasta el reinicio del domingo: lo que tarde más en recuperarse, ya no compensa.
  const resetAt = juegos.lobby?.resetAt ?? null
  const hoursLeft = resetAt ? Math.max(0, (resetAt - Date.now()) / HOUR) : Infinity

  async function buy(station) {
    playChip()
    const nv = await act({ a: 'buy', station })
    if (nv) {
      setFlash(station)
      setTimeout(() => setFlash(null), 700)
    }
  }
  async function upgrade(id) {
    playChip()
    const nv = await act({ a: 'upgrade', upgrade: id })
    if (nv) {
      setFlash(id)
      setTimeout(() => setFlash(null), 700)
    }
  }
  async function collect() {
    if (busy || stored < 1) return
    const nv = await act({ a: 'collect' })
    if (!nv) return
    playJingle(6)
    playCash(Math.min(10, Math.max(1, Math.round(nv.amount / 500))))
    buzz([40, 30, 60])
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea, button:focus-visible')) return
    if (event.code === 'Space' || event.code === 'KeyR') {
      event.preventDefault()
      collect()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const help = (
    <>
      <p>
        Inviertes tu saldo en <b>puestos</b> del taller y producen euros cada hora, también cuando no estás. Cada puesto de más del mismo tipo cuesta un poco
        más que el anterior, así que conviene repartir.
      </p>
      <p>
        Lo producido se guarda en el <b>almacén</b>, que se llena en {capHours({})} horas (más con sus mejoras). Cuando está lleno, el taller para: pásate a{' '}
        <b>recoger</b> (<kbd>Espacio</kbd>) y lo tendrás en el saldo.
      </p>
      <p>
        Las <b>mejoras</b> multiplican toda la producción o agrandan el almacén. Ojo: el taller se reinicia el <b>domingo a las 23:59</b> con todo lo demás,
        así que solo rinde lo que dé tiempo a recuperar esa semana. Cada compra dice en cuánto se recupera.
      </p>
    </>
  )

  let status = 'Abre tu primer puesto: un elfo envolvedor cuesta poco y empieza a producir al momento.'
  if (juegos.error) status = juegos.error
  else if (!ready) status = 'Abriendo el taller…'
  else if (full) status = '¡El almacén está lleno y el taller se ha parado! Recoge para que sigan trabajando.'
  else if (rate > 0) status = `El taller produce ${eur(Math.round(rate))} cada hora. El almacén se llena en ${fmtH(Math.max(0, (cap - stored) / rate))}.`

  return (
    <main className="app fi-app ta-app">
      <FiestaHeader title="Taller de Papá Noel" balance={shownBank} betLabel="Invertido" bet={v?.invested ?? 0} onExit={onExit} help={help} helpTitle="Cómo funciona el Taller" />

      <div className="fi fill">
        <section className={`fi-stage ta-stage ${full ? 'is-full' : ''}`} aria-label="El taller">
          <div className="fi-top">
            <span className="fi-chip">
              <small>Por hora</small>
              <b>{eur(Math.round(rate))}</b>
            </span>
            <span className="fi-chip fi-chip--good">
              <small>Recogido</small>
              <b>{eur(v?.collected ?? 0)}</b>
            </span>
            <span className="fi-chip">
              <small>Mejoras</small>
              <b>×{multOf(upgrades).toLocaleString('es-ES', { maximumFractionDigits: 2 })}</b>
            </span>
          </div>

          <Nave units={units} rate={rate} />

          <div className="ta-store">
            <div className="ta-store__meter" role="progressbar" aria-label="Almacén" aria-valuemin={0} aria-valuemax={Math.round(cap)} aria-valuenow={Math.floor(stored)}>
              <i style={{ width: `${cap > 0 ? (stored / cap) * 100 : 0}%` }} />
              <span>
                📦 Almacén: <b>{eur(shownStored)}</b> de {eur(Math.round(cap))}
              </span>
            </div>
            <button type="button" className="ta-collect" disabled={busy || stored < 1} onClick={collect}>
              Recoger {eur(Math.floor(stored))}
              <kbd>Espacio</kbd>
            </button>
          </div>

          <p className={`fi-status ${full ? 'is-bad' : rate > 0 ? 'is-good' : ''}`} role="status">
            {status}
          </p>
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>Hasta el reinicio</small>
            <b>{resetAt ? until(resetAt) : '—'}</b>
            <span className="fi-prize__tag">Se reinicia con la semana</span>
          </div>

          <div className="fi-group">
            <h2>Puestos</h2>
            <ul className="ta-shop">
              {STATION_IDS.map((id) => {
                const n = units[id] ?? 0
                const cost = stationCost(id, n)
                const pay = paybackHours(id, n, upgrades)
                const late = pay > hoursLeft
                return (
                  <li key={id} className={flash === id ? 'is-flash' : undefined}>
                    <button type="button" disabled={busy || cost > balance} onClick={() => buy(id)}>
                      <span className="ta-shop__ico">{STATIONS[id].icon}</span>
                      <span className="ta-shop__body">
                        <b>
                          {STATIONS[id].name} <small>×{n}</small>
                        </b>
                        <small>
                          +{eur(Math.round(STATIONS[id].rate * multOf(upgrades)))}/h · se recupera en {fmtH(pay)}
                          {late && <em> · ya no da tiempo esta semana</em>}
                        </small>
                      </span>
                      <span className="ta-shop__cost">{eur(cost)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="fi-group">
            <h2>Mejoras</h2>
            <ul className="ta-shop">
              {UPGRADE_IDS.map((id) => {
                const lvl = upgrades[id] ?? 0
                const cost = upgradeCost(id, lvl)
                const next = UPGRADES[id].levels[lvl]
                let what = 'Al máximo'
                if (next?.mult) {
                  const gain = ratePerHour(units, { ...upgrades, [id]: lvl + 1 }) - rate
                  what = `Producción ×${next.mult.toLocaleString('es-ES')} · +${eur(Math.round(gain))}/h con lo que tienes`
                } else if (next?.cap) what = `Almacén de ${next.cap} h`
                return (
                  <li key={id} className={flash === id ? 'is-flash' : undefined}>
                    <button type="button" disabled={busy || cost === null || cost > balance} onClick={() => upgrade(id)}>
                      <span className="ta-shop__ico">{UPGRADES[id].icon}</span>
                      <span className="ta-shop__body">
                        <b>
                          {UPGRADES[id].name} <small>{lvl}/{UPGRADES[id].levels.length}</small>
                        </b>
                        <small>{cost === null ? UPGRADES[id].blurb : what}</small>
                      </span>
                      <span className="ta-shop__cost">{cost === null ? '✓' : eur(cost)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="fi-hint">Lo invertido no lo ve Hacienda; lo que recoges, sí (va al saldo).</p>
        </aside>
      </div>
    </main>
  )
}

export default Taller

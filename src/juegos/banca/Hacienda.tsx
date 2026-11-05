import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { eur, type Declaracion, type HaciendaDatos } from './banca'
import { isMuted, playCash, playHeartbeat, playLose, playSiren, playStamp, playWin } from '../comun/sound.js'
import './hacienda.css'

export type HaciendaResult = HaciendaDatos & { paid: number }
type Choice = 'pagar' | 'fraude' | 'soborno'
type Stage = 'arrive' | 'open' | 'ask' | 'check' | 'bribe' | 'done'

const ARRIVE_MS = 1100 // la carta cae y tiembla
const OPEN_MS = 800 // se abre y sale la notificación
const READ_MS = 1100 // lo que se tarda en leer antes del sello (avisos ya cobrados)
const CHECK_MS = 2600 // el inspector revisa los papeles tras declarar de menos
const BRIBE_MS = 3400 // el sobre cruza la mesa y el inspector se lo piensa
const JAIL_MIN = 5 // como hacienda.JAIL_MS
const COINS = 14
const DECIDE_MS = 90_000 // como hacienda.DECIDE_MS: el plazo para declarar
const BANNER_MS = 9000
const STEP = 100_000 // como hacienda.TAX_STEP

const sound = (fn: () => void) => {
  if (!isMuted()) fn()
}

const STAMP: Record<HaciendaDatos['kind'], string> = {
  tramo: 'PAGADO',
  auto: 'PAGADO',
  pillado: '¡PILLADO!',
  escapado: 'ARCHIVADO',
  sobornado: 'TRATO HECHO',
  cazado: 'DETENIDO',
  inspeccion: 'EMBARGADO',
  redada: 'EMBARGADO',
}

// Lo que pone la carta: encabezado, título, el motivo (por qué te cobran) y el tipo que se aplica.
function letterText(d: HaciendaResult | null, decl: Declaracion | null) {
  const tramo = d?.tramo ?? decl?.tramo ?? 1
  const passed = `Has superado los ${eur(tramo * STEP)} de saldo. Cada 100.000 € que pasas, Hacienda pide su parte (y cuanto más tienes, más pide).`
  if (!d) return { kicker: 'Declaración obligatoria', title: 'Te toca declarar', reason: passed, rate: decl?.rate ?? 0 }
  switch (d.kind) {
    case 'tramo':
      return { kicker: 'Declaración presentada', title: 'Gracias por contribuir', reason: passed, rate: d.rate }
    case 'auto':
      return { kicker: 'Cobro de oficio', title: 'Se acabó el plazo', reason: `${passed} No contestaste a tiempo y se ha cobrado sola.`, rate: d.rate }
    case 'pillado':
      return { kicker: 'Sanción por fraude', title: '¡Te han pillado!', reason: 'Declaraste de menos y el inspector lo ha descubierto. La sanción es pagar el doble.', rate: d.rate * 2 }
    case 'escapado':
      return { kicker: 'Expediente archivado', title: 'Se te ha escapado…', reason: 'Declaraste de menos y nadie se ha dado cuenta. Esta vez no pagas, pero ahora el inspector te tiene fichado 👀', rate: 0 }
    case 'sobornado':
      return {
        kicker: 'Expediente extraviado',
        title: 'Trato hecho 😉',
        reason: 'El inspector se ha guardado el sobre y tu declaración se ha perdido misteriosamente. Aquí no ha pasado nada.',
        rate: 0,
      }
    case 'cazado':
      return {
        kicker: 'Intento de soborno',
        title: '¡Inspector honrado!',
        reason: `Has intentado sobornar a un inspector honrado. Te denuncia: pagas el doble, pierdes el sobre y te vas ${JAIL_MIN} minutos a la cárcel.`,
        rate: d.rate * 2,
      }
    case 'inspeccion':
      return {
        kicker: 'Inspección sorpresa',
        title: 'Visita del inspector',
        reason: d.fraude
          ? 'Te libraste declarando de menos, pero el inspector ha vuelto a por ti y ha encontrado el fraude.'
          : 'Tienes más de 100.000 € y te ha tocado una inspección al azar. Mientras sigas rico, puede volver.',
        rate: d.rate,
      }
    case 'redada':
      return {
        kicker: 'Redada de Hacienda',
        title: 'Redada contra los ricos',
        reason: `La banca ha mandado a Hacienda a por todos los que tienen ${d.floor ? `${eur(d.floor)} o más` : 'demasiado dinero'}, y tú estabas en la lista.`,
        rate: d.rate,
      }
  }
}

// Motivo corto, para el banner.
function bannerReason(d: HaciendaDatos) {
  switch (d.kind) {
    case 'tramo':
    case 'auto':
      return `Por pasar de ${eur((d.tramo ?? 1) * STEP)} · ${d.rate} % de tu saldo`
    case 'pillado':
      return `Por declarar de menos · sanción del ${d.rate * 2} %`
    case 'inspeccion':
      return d.fraude ? `Inspección: te pillaron el fraude · ${d.rate} %` : `Inspección sorpresa · ${d.rate} % de tu saldo`
    case 'redada':
      return `Redada contra los ricos · ${d.rate} % de tu saldo`
    case 'escapado':
      return 'Fraude sin descubrir'
    case 'sobornado':
      return 'Sobre para el inspector · y aquí no ha pasado nada'
    case 'cazado':
      return `Intento de soborno · el doble, el sobre y ${JAIL_MIN} min de cárcel`
  }
}

// Cifra que cuenta hasta su valor.
function useCount(target: number, ms = 900, start = true) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!start) return
    const t0 = Date.now()
    const timer = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / ms)
      setShown(Math.round(target * (1 - (1 - k) ** 3)))
      if (k >= 1) clearInterval(timer)
    }, 30)
    return () => clearInterval(timer)
  }, [target, ms, start])
  return shown
}

// Escudo de Hacienda: un edificio con columnas.
function Crest() {
  return (
    <svg className="hz__crest" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 4 44 14v4H4v-4z" />
      <rect x="6" y="20" width="36" height="3" rx="1" />
      {[9, 17, 25, 33].map((x) => (
        <rect key={x} x={x} y="24" width="6" height="14" rx="1" />
      ))}
      <rect x="4" y="39" width="40" height="4" rx="1" />
      <circle cx="24" cy="11.5" r="2.4" className="hz__crest-dot" />
    </svg>
  )
}

// Hacienda a pantalla completa: cae una carta certificada, se abre, y o bien pide la declaración (pagar o declarar de
// menos, con su cuenta atrás) o enseña lo que ya se cobró y por qué. Al final cae el sello y las monedas vuelan al bote.
export function HaciendaIntro({
  declaracion,
  result,
  now,
  onDecide,
  onClose,
}: {
  declaracion: Declaracion | null
  result: HaciendaResult | null
  now: () => number
  onDecide: (choice: Choice) => Promise<HaciendaResult>
  onClose: (result: HaciendaResult | null) => void
}) {
  const [stage, setStage] = useState<Stage>('arrive')
  const [res, setRes] = useState<HaciendaResult | null>(result)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const deciding = useRef(false)
  const autoPaid = useRef(false) // el pago automático al acabar el plazo se intenta una sola vez
  const loud = result ? result.kind === 'inspeccion' || result.kind === 'redada' : false

  // La carta llega, se abre y se lee.
  useEffect(() => {
    if (loud) sound(playSiren)
    const open = setTimeout(() => {
      setStage('open')
      sound(playStamp)
    }, ARRIVE_MS)
    const next = setTimeout(() => setStage(result ? 'done' : 'ask'), ARRIVE_MS + OPEN_MS + (result ? READ_MS : 0))
    return () => {
      clearTimeout(open)
      clearTimeout(next)
    }
  }, [result, loud])

  // El sello, las monedas y el sonido del resultado.
  useEffect(() => {
    if (stage !== 'done' || !res) return
    sound(playStamp)
    const after = setTimeout(() => {
      if (res.kind === 'escapado' || res.kind === 'sobornado') sound(() => playWin(false))
      else if (res.kind === 'cazado') {
        sound(playSiren)
        sound(playLose)
      } else {
        if (res.kind === 'pillado') sound(playLose)
        sound(() => playCash(2))
      }
    }, 450)
    return () => clearTimeout(after)
  }, [stage, res])

  // Cuenta atrás de la declaración: al acabar, se paga.
  const left = declaracion ? Math.max(0, declaracion.hasta - now()) : 0
  useEffect(() => {
    if (stage !== 'ask') return
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [stage])

  const decide = async (choice: Choice) => {
    if (deciding.current) return
    deciding.current = true
    setError(null)
    const t0 = Date.now()
    let beat: ReturnType<typeof setInterval> | null = null
    if (choice !== 'pagar') {
      setStage(choice === 'fraude' ? 'check' : 'bribe')
      sound(playHeartbeat)
      beat = setInterval(() => sound(playHeartbeat), 700)
    }
    try {
      const out = await onDecide(choice)
      const wait = choice === 'fraude' ? CHECK_MS : choice === 'soborno' ? BRIBE_MS : 0
      await new Promise((r) => setTimeout(r, Math.max(0, wait - (Date.now() - t0))))
      setRes(out)
      setStage('done')
    } catch (e) {
      // Si el servidor ya la cobró solo (se acabó el plazo), no queda nada que contestar: la carta se cierra y llega la
      // del cobro de oficio. Antes se quedaba reintentando el pago automático sin parar.
      if (autoPaid.current || /ninguna declaración/i.test((e as Error).message)) {
        onClose(null)
        return
      }
      setError((e as Error).message)
      setStage('ask')
      deciding.current = false
    } finally {
      if (beat) clearInterval(beat)
    }
  }

  useEffect(() => {
    if (stage !== 'ask' || !declaracion || left > 0 || autoPaid.current) return
    autoPaid.current = true
    decide('pagar')
  })

  const paid = res?.paid ?? 0
  const shownPaid = useCount(paid, 1100, stage === 'done')
  const asked = declaracion?.amount ?? 0
  const { kicker, title, reason, rate } = letterText(res, declaracion)
  const kind = res?.kind ?? 'tramo'
  const red = res ? ['pillado', 'cazado', 'inspeccion', 'redada'].includes(res.kind) : false
  const free = res?.kind === 'escapado'
  const deal = res?.kind === 'sobornado'
  const bribed = res?.kind === 'sobornado' || res?.kind === 'cazado'
  const base = res?.base ?? declaracion?.base ?? 0
  const [number] = useState(() => `${Math.floor(Math.random() * 90000) + 10000}`)
  const [date] = useState(() => new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }))

  return (
    <div className={`hz hz--${stage} ${red || loud ? 'hz--alarm' : ''} ${free ? 'hz--free' : ''} ${deal ? 'hz--deal' : ''}`} role="alertdialog" aria-modal="true" aria-label={`Hacienda: ${title}. ${reason}`}>
      <div className="hz__lights" aria-hidden="true" />
      <div className="hz__tape" aria-hidden="true">
        <span>{'HACIENDA SOMOS TODOS · '.repeat(10)}</span>
        <span>{'HACIENDA SOMOS TODOS · '.repeat(10)}</span>
      </div>

      <div className="hz__env" aria-hidden="true">
        <div className="hz__env-back" />
        <div className="hz__env-flap" />
        <div className="hz__env-front">
          <small>CARTA CERTIFICADA · URGENTE</small>
          <b>HACIENDA</b>
          <span className="hz__wax">H</span>
        </div>
      </div>

      <div className="hz__letter">
        <span className="hz__watermark" aria-hidden="true">
          <Crest />
        </span>
        <header className="hz__head">
          <Crest />
          <div className="hz__org">
            <b>HACIENDA</b>
            <small>Ministerio de tus Ganancias</small>
          </div>
          <div className="hz__form">
            <small>Modelo</small>
            <b>100</b>
          </div>
        </header>
        <p className="hz__ref">
          Expediente nº {number} · {date}
        </p>

        <p className="hz__kicker">{kicker}</p>
        <h2 className="hz__title">{title}</h2>
        <div className="hz__reason">
          <b>Motivo</b>
          <p>{reason}</p>
        </div>

        {/* En la declaración el desglose va debajo de los botones: en un móvil pequeño, lo primero es poder contestar. */}
        {stage === 'done' && base > 0 && (
          <dl className="hz__table">
            <div>
              <dt>Saldo declarado</dt>
              <dd>{eur(base)}</dd>
            </div>
            <div>
              <dt>Tipo aplicado</dt>
              <dd>{free || deal ? '—' : `${rate} %`}</dd>
            </div>
            {bribed && (
              <div>
                <dt>Sobre al inspector</dt>
                <dd>{eur(res?.bribe ?? 0)}</dd>
              </div>
            )}
            <div>
              <dt>Destino</dt>
              <dd>🎱 Bote del bingo</dd>
            </div>
          </dl>
        )}

        {stage === 'ask' && declaracion && (
          <>
            <div className="hz__owe">
              <small>Total a ingresar</small>
              <b>−{eur(asked)}</b>
            </div>
            <div className="hz__choices">
              <button type="button" className="hz__pay" onClick={() => decide('pagar')} autoFocus>
                <b>Pagar {eur(asked)}</b>
                <small>Como un ciudadano ejemplar</small>
              </button>
              <button type="button" className="hz__fraud" onClick={() => decide('fraude')}>
                <b>Declarar de menos 🤫</b>
                <small>50 %: no pagas nada · 50 %: te pillan y pagas {eur(asked * 2)}</small>
              </button>
              <button type="button" className="hz__bribe-btn" onClick={() => decide('soborno')}>
                <b>Sobornar al inspector 💼</b>
                <small>
                  Le pasas {eur(declaracion.bribe)}: 50 % lo acepta y no pagas nada más · 50 % te denuncia: pagas{' '}
                  {eur(asked * 2 + declaracion.bribe)} y {JAIL_MIN} min de cárcel
                </small>
              </button>
            </div>
            <div className="hz__timer" aria-label="Tiempo para declarar">
              <i style={{ '--k': Math.min(1, left / DECIDE_MS) } as CSSProperties} />
              <span>{Math.ceil(left / 1000)} s para declarar · si no, se paga solo</span>
            </div>
            {error && <p className="hz__error">{error}</p>}
            <dl className="hz__table">
              <div>
                <dt>Saldo declarado</dt>
                <dd>{eur(declaracion.base)}</dd>
              </div>
              <div>
                <dt>Tipo aplicado</dt>
                <dd>{declaracion.rate} %</dd>
              </div>
              <div>
                <dt>Destino</dt>
                <dd>🎱 Bote del bingo</dd>
              </div>
            </dl>
          </>
        )}

        {stage === 'check' && (
          <div className="hz__check" aria-live="polite">
            <div className="hz__papers" aria-hidden="true">
              <i />
              <i />
              <i />
              <span className="hz__lupa">🔍</span>
            </div>
            <p>El inspector revisa tus papeles…</p>
          </div>
        )}

        {stage === 'bribe' && (
          <div className="hz__bribe" aria-live="polite">
            <div className="hz__desk" aria-hidden="true">
              <span className="hz__cash">
                <i />
                <b>€</b>
              </span>
              <span className="hz__agent">
                🕵️
                <span className="hz__think">🤔</span>
              </span>
            </div>
            <p>Le pasas el sobre por debajo de la mesa… el inspector cuenta los billetes</p>
          </div>
        )}

        {stage === 'done' && res && (
          <>
            <div className={`hz__owe ${free ? 'hz__owe--free' : ''}`}>
              <small>{free ? 'Pagas' : deal ? 'Solo el sobre' : 'Total cobrado'}</small>
              <b>{free ? eur(0) : `−${eur(shownPaid)}`}</b>
              {free && <span>te ahorras {eur(res.amount ?? 0)}</span>}
              <div className={`hz__stamp hz__stamp--${kind}`} aria-hidden="true">
                <span>{STAMP[kind]}</span>
              </div>
              {!free && paid > 0 && (
                <div className="hz__coins" aria-hidden="true">
                  {Array.from({ length: COINS }, (_, i) => (
                    <i key={i} style={{ '--i': i, '--x': `${((i * 37) % 13) - 6}` } as CSSProperties} />
                  ))}
                </div>
              )}
            </div>
            {res.kind === 'cazado' && (
              <div className="hz__cuffs" aria-hidden="true">
                <span>⛓️</span>
                <p>
                  Te vas <b>{JAIL_MIN} minutos a la cárcel</b>: mientras tanto no puedes jugar a nada.
                </p>
              </div>
            )}
            <button type="button" className="hz__ok" onClick={() => onClose(res)} autoFocus>
              {free
                ? 'Je, je 😏'
                : deal
                  ? 'Un placer hacer negocios 😉'
                  : res.kind === 'cazado'
                    ? 'Ir a la cárcel 🚔'
                    : res.kind === 'pillado'
                      ? 'Me lo merecía 🤡'
                      : 'Qué remedio 😮‍💨'}
            </button>
          </>
        )}

        <footer className="hz__foot" aria-hidden="true">
          <div>
            <span className="hz__sign">El Inspector</span>
            <small>Fdo.: el Inspector Jefe</small>
          </div>
          <span className="hz__barcode" />
        </footer>
      </div>
    </div>
  )
}

// Banner de arriba tras pagar: cuánto se ha llevado Hacienda y por qué, con las monedas saliendo hacia el bote.
export function HaciendaBanner({ result, onDone }: { result: HaciendaResult; onDone: () => void }) {
  useEffect(() => {
    sound(() => playCash(1))
    const timer = setTimeout(onDone, BANNER_MS)
    return () => clearTimeout(timer)
  }, [onDone])
  const shown = useCount(result.paid, 1200)
  return (
    <button type="button" className={`hzb hzb--${result.kind}`} onClick={onDone} aria-label={`Hacienda te ha cobrado ${eur(result.paid)}. ${bannerReason(result)}`}>
      <span className="hzb__shine" aria-hidden="true" />
      <span className="hzb__seal" aria-hidden="true">
        <Crest />
      </span>
      <span className="hzb__text">
        <small>Hacienda te ha cobrado</small>
        <b>−{eur(shown)}</b>
        <span className="hzb__why">{bannerReason(result)}</span>
      </span>
      <span className="hzb__pot" aria-hidden="true">
        <span className="hzb__ball">🎱</span>
        <small>al bote</small>
      </span>
      <span className="hzb__coins" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </span>
      <span className="hzb__timer" aria-hidden="true" />
    </button>
  )
}

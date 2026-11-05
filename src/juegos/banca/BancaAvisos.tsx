import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { BANK_TOPIC, abusePerks, abuseText, bancaCall, eur, type Abuse, type Aviso, type BoteAbierto, type Declaracion } from './banca'
import { HaciendaBanner, HaciendaIntro, type HaciendaResult } from './Hacienda'
import { CarcelScreen } from './Carcel'
import { isMuted, playCash, playSiren, playWin } from '../comun/sound.js'
import './banca.css'

// El Admin Abuse ya presentado (con su animación grande) en este navegador: se guarda su «desde».
const SEEN_KEY = 'gcgames-abuso-visto'
const POT_SEEN_KEY = 'gcgames-bote-visto' // lo mismo con la apertura del bote del bingo
const POLL_MS = 90000 // por si se pierde un aviso de Realtime (pestaña dormida, red que cae), se pregunta igualmente
const INTRO_MS = 11000 // la presentación se cierra sola pasado este rato (o antes, con «¡A jugar!»)

const readSeen = (key = SEEN_KEY) => {
  try {
    return Number(localStorage.getItem(key) ?? 0)
  } catch {
    return 0
  }
}
const writeSeen = (desde: number, key = SEEN_KEY) => {
  try {
    localStorage.setItem(key, String(desde))
  } catch {
    // sin almacenamiento: la animación puede repetirse al recargar
  }
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Avisos de la banca dentro de Juegos (en cualquier pantalla: selector, mesas o juegos). El dinero y los mensajes del
// master salen en el centro de la pantalla, uno detrás de otro, y el Admin Abuse y la apertura del bote del bingo se
// presentan a lo grande y dejan una cuenta atrás arriba mientras duren. Hacienda: la declaración pendiente y lo que ya
// cobró salen a pantalla completa (Hacienda.tsx).
export default function BancaAvisos() {
  const { usuario } = useAuth()
  const [queue, setQueue] = useState<Aviso[]>([])
  const [abuse, setAbuse] = useState<Abuse | null>(null)
  const [intro, setIntro] = useState<Abuse | null>(null)
  const [bote, setBote] = useState<BoteAbierto | null>(null)
  const [boteIntro, setBoteIntro] = useState<BoteAbierto | null>(null)
  const [declaracion, setDeclaracion] = useState<Declaracion | null>(null)
  const [banner, setBanner] = useState<HaciendaResult | null>(null) // lo último que cobró Hacienda, y por qué
  const [, setTick] = useState(0)
  const skew = useRef(0)
  const lastId = useRef(0)
  const [carcel, setCarcel] = useState<number | null>(null) // preso hasta entonces (hora del servidor)
  const carcelDone = useRef(0) // la última condena de la que ya se salió (con «Salir de la cárcel»)
  // Preso: la celda no se va hasta que acaba la condena y se pulsa «Salir». Cuando el servidor ya no la cuenta (se
  // cumplió), se queda la que había para enseñar que eres libre.
  const jail = useCallback((until: number | null) => {
    setCarcel((c) => {
      if (until) return until === carcelDone.current ? null : until
      return c !== null && c <= Date.now() + skew.current ? c : null
    })
  }, [])

  const load = useCallback(async () => {
    try {
      const { banca } = await bancaCall({ t: 'banca' })
      if (!banca) return
      if (typeof banca.ahora === 'number') skew.current = banca.ahora - Date.now()
      const fresh = (banca.avisos ?? []).filter((a) => a.id > lastId.current)
      if (fresh.length) {
        lastId.current = fresh[fresh.length - 1].id
        setQueue((q) => [...q, ...fresh])
        if (fresh.some((a) => a.tipo === 'hacienda')) window.dispatchEvent(new CustomEvent('juegos:saldo'))
      }
      // La declaración se queda puesta mientras está pendiente (una vez contestada, la cierra quien contesta).
      const decl = banca.hacienda ?? null
      setDeclaracion((d) => (decl ? (d && d.hasta === decl.hasta ? d : decl) : d && d.hasta > Date.now() + skew.current ? d : null))
      jail(banca.carcel ?? null)
      const ab = banca.abuso ?? null
      setAbuse(ab)
      if (ab && ab.desde > readSeen()) {
        writeSeen(ab.desde)
        setIntro(ab)
      }
      const open = banca.boteAbierto ?? null
      setBote(open)
      if (open && open.desde > readSeen(POT_SEEN_KEY)) {
        writeSeen(open.desde, POT_SEEN_KEY)
        setBoteIntro(open)
      }
    } catch {
      // sin conexión o sin cuenta aprobada: ya avisará la próxima vez
    }
  }, [jail])

  useEffect(() => {
    if (!usuario) return
    load()
    // Canal público, como el de las mesas de Juegos: el servidor avisa con la clave pública (auth.mjs, ping). Los canales
    // privados no reciben esos avisos.
    const channel = supabase
      .channel(BANK_TOPIC)
      .on('broadcast', { event: 'cambio' }, () => {
        load()
      })
      .subscribe()
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [usuario, load])

  // La cuenta atrás del Admin Abuse y del bote.
  const counting = Boolean(abuse) || Boolean(bote?.hasta) || Boolean(carcel)
  useEffect(() => {
    if (!counting) return
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [counting])

  useEffect(() => {
    if (!intro) return
    const timer = setTimeout(() => setIntro(null), INTRO_MS)
    return () => clearTimeout(timer)
  }, [intro])
  useEffect(() => {
    if (!boteIntro) return
    const timer = setTimeout(() => setBoteIntro(null), INTRO_MS)
    return () => clearTimeout(timer)
  }, [boteIntro])

  const current = queue[0] ?? null
  const next = () => {
    if (!current) return
    if (queue.length === 1) bancaCall({ t: 'banca_visto', hasta: current.id }).catch(() => {})
    setQueue((q) => q.slice(1))
  }
  const closeBanner = useCallback(() => setBanner(null), [])
  const decide = async (eleccion: 'pagar' | 'fraude' | 'soborno'): Promise<HaciendaResult> => {
    const { banca } = await bancaCall({ t: 'banca_declarar', eleccion })
    if (!banca?.declaracion) throw new Error('Hacienda no responde. Inténtalo de nuevo.')
    if (banca.declaracion.carcel) jail(banca.declaracion.carcel)
    // El saldo de la pantalla de Juegos se pone al día con la siguiente petición de juego.
    window.dispatchEvent(new CustomEvent('juegos:saldo'))
    return banca.declaracion
  }

  const now = Date.now() + skew.current
  const active = abuse && abuse.hasta > now ? abuse : null
  const potOpen = bote && (bote.hasta === null || bote.hasta > now) ? bote : null
  // Las dos presentaciones a la vez no caben: primero el Admin Abuse, luego el bote.
  const showBote = boteIntro && !intro
  const jailLeft = carcel ? carcel - now : 0
  // La celda (que tapa todo lo demás) espera a que se cierre la carta de Hacienda.
  const showJail = carcel !== null && !declaracion && current?.tipo !== 'hacienda'

  return createPortal(
    <>
      {active && !intro && (
        <button type="button" className="banca-pill" onClick={() => setIntro(active)} aria-label="Admin Abuse activo: ver detalles">
          <span className="banca-pill__bolt">⚡</span>
          <b>ADMIN ABUSE</b>
          <span>{active.modo === 'gratis' ? 'GRATIS' : active.modo === 'x3' ? '×3' : '×2'}</span>
          {active.ambito === 'poker' && <span className="banca-pill__scope">póker</span>}
          <span className="banca-pill__time">{clock(active.hasta - now)}</span>
        </button>
      )}

      {potOpen && !showBote && (
        <button
          type="button"
          className={`banca-pill banca-pill--bote ${active && !intro ? 'banca-pill--second' : ''}`}
          onClick={() => setBoteIntro(potOpen)}
          aria-label="Bote del bingo abierto: ver detalles"
        >
          <span className="banca-pill__bolt">🏆</span>
          <b>BOTE ABIERTO</b>
          <span>{eur(potOpen.pot)}</span>
          <span className="banca-pill__time">{potOpen.hasta === null ? 'sin límite' : clock(potOpen.hasta - now)}</span>
        </button>
      )}

      {intro && <AbuseIntro abuse={intro} left={intro.hasta - now} onClose={() => setIntro(null)} />}
      {showBote && <BoteIntro bote={boteIntro} left={boteIntro.hasta === null ? null : boteIntro.hasta - now} onClose={() => setBoteIntro(null)} />}

      {declaracion && !intro && !showBote && (
        <HaciendaIntro
          key={`decl-${declaracion.hasta}`}
          declaracion={declaracion}
          result={null}
          now={() => Date.now() + skew.current}
          onDecide={decide}
          onClose={(res) => {
            setDeclaracion(null)
            if (res && res.paid > 0) setBanner(res)
          }}
        />
      )}
      {current && !intro && !showBote && !declaracion && current.tipo === 'hacienda' && current.datos && (
        <HaciendaIntro
          key={current.id}
          declaracion={null}
          result={{ ...current.datos, paid: current.importe ?? 0 }}
          now={() => Date.now() + skew.current}
          onDecide={decide}
          onClose={(res) => {
            next()
            if (res && res.paid > 0) setBanner(res)
          }}
        />
      )}
      {showJail && (
        <CarcelScreen
          left={jailLeft}
          onExit={() => {
            carcelDone.current = carcel ?? 0
            setCarcel(null)
          }}
        />
      )}
      {banner && <HaciendaBanner key={`${banner.kind}-${banner.paid}`} result={banner} onDone={closeBanner} />}
      {current && !intro && !showBote && !declaracion && current.tipo !== 'hacienda' && (
        <AvisoCard key={current.id} aviso={current} left={queue.length - 1} onNext={next} />
      )}
    </>,
    document.body,
  )
}

// Presentación a pantalla completa: alarma, ADMIN ABUSE que cae de golpe, el multiplicador gigante, lo que ofrece y
// cuánto dura, con la cuenta atrás en vivo. Suena una sirena y una fanfarria (si el sonido de Juegos está activado).
function AbuseIntro({ abuse, left, onClose }: { abuse: Abuse; left: number; onClose: () => void }) {
  const text = abuseText(abuse)
  const perks = abusePerks(abuse)
  const minutes = Math.round((abuse.hasta - abuse.desde) / 60000)
  const ends = new Date(abuse.hasta).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const badge = abuse.modo === 'gratis' ? 'GRATIS' : abuse.modo === 'x3' ? '×3' : '×2'
  const tape = 'ADMIN ABUSE ⚠ '.repeat(12)

  useEffect(() => {
    if (isMuted()) return
    playSiren()
    const siren = setTimeout(playSiren, 700)
    const fanfare = setTimeout(() => playWin(true), 1500)
    return () => {
      clearTimeout(siren)
      clearTimeout(fanfare)
    }
  }, [])

  return (
    <div className={`banca-abuse banca-abuse--${abuse.modo}`} role="alertdialog" aria-modal="true" aria-label={`Admin Abuse: ${text.big}. Dura ${minutes} minutos.`}>
      <div className="banca-abuse__rays" aria-hidden="true" />
      <div className="banca-abuse__flash" aria-hidden="true" />
      <div className="banca-abuse__tape banca-abuse__tape--top" aria-hidden="true">
        <span>{tape}</span>
        <span>{tape}</span>
      </div>
      <div className="banca-abuse__tape banca-abuse__tape--bottom" aria-hidden="true">
        <span>{tape}</span>
        <span>{tape}</span>
      </div>
      <div className="banca-abuse__content">
        <p className="banca-abuse__kicker">⚠ La banca ha activado ⚠</p>
        <h2 className="banca-abuse__title" data-text="ADMIN ABUSE">
          ADMIN ABUSE
        </h2>
        <div className="banca-abuse__badge">
          <b>{badge}</b>
          <span>{abuse.ambito === 'poker' ? 'Solo en póker' : 'En todos los juegos'}</span>
        </div>
        <ul className="banca-abuse__perks">
          {perks.map((perk, i) => (
            <li key={perk} style={{ '--i': i } as CSSProperties}>
              {perk}
            </li>
          ))}
        </ul>
        <div className="banca-abuse__time">
          <span>
            Dura <b>{minutes} min</b> · hasta las {ends}
          </span>
          {left > 0 && <strong>{clock(left)}</strong>}
        </div>
        <button type="button" className="banca-abuse__go" onClick={onClose} autoFocus>
          ¡A jugar!
        </button>
      </div>
      <div className="banca-abuse__sparks" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
    </div>
  )
}

// La banca abre el bote del bingo: misma presentación que el Admin Abuse, en dorado, con lo que hay en la jaula.
function BoteIntro({ bote, left, onClose }: { bote: BoteAbierto; left: number | null; onClose: () => void }) {
  const ends = bote.hasta === null ? null : new Date(bote.hasta).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const minutes = bote.hasta === null ? null : Math.round((bote.hasta - bote.desde) / 60000)
  const tape = 'BOTE ABIERTO 🏆 '.repeat(12)
  const perks = [
    'Canta bingo con la bola 66 o antes y te llevas la jaula entera',
    'O ciérralo justo con la bola dorada',
    bote.una ? 'Solo para el primero: en cuanto alguien se lo lleve, se cierra' : 'Puede salir más de una vez mientras esté abierto',
  ]

  useEffect(() => {
    if (isMuted()) return
    playCash(3)
    const fanfare = setTimeout(() => playWin(true), 900)
    return () => clearTimeout(fanfare)
  }, [])

  return (
    <div className="banca-abuse banca-abuse--bote" role="alertdialog" aria-modal="true" aria-label={`La banca ha abierto el bote del bingo: ${eur(bote.pot)}.`}>
      <div className="banca-abuse__rays" aria-hidden="true" />
      <div className="banca-abuse__flash" aria-hidden="true" />
      <div className="banca-abuse__tape banca-abuse__tape--top" aria-hidden="true">
        <span>{tape}</span>
        <span>{tape}</span>
      </div>
      <div className="banca-abuse__tape banca-abuse__tape--bottom" aria-hidden="true">
        <span>{tape}</span>
        <span>{tape}</span>
      </div>
      <div className="banca-abuse__content">
        <p className="banca-abuse__kicker">🏆 La banca ha abierto 🏆</p>
        <h2 className="banca-abuse__title" data-text="EL BOTE">
          EL BOTE
        </h2>
        <div className="banca-abuse__badge">
          <b>{eur(bote.pot)}</b>
          <span>En la jaula del bingo</span>
        </div>
        <ul className="banca-abuse__perks">
          {perks.map((perk, i) => (
            <li key={perk} style={{ '--i': i } as CSSProperties}>
              {perk}
            </li>
          ))}
        </ul>
        <div className="banca-abuse__time">
          <span>{minutes === null ? <b>Sin límite de tiempo</b> : <>Abierto <b>{minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`}</b> · hasta las {ends}</>}</span>
          {left !== null && left > 0 && <strong>{clock(left)}</strong>}
        </div>
        <button type="button" className="banca-abuse__go" onClick={onClose} autoFocus>
          ¡A por el bote!
        </button>
      </div>
      <div className="banca-abuse__sparks" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
    </div>
  )
}

function AvisoCard({ aviso, left, onNext }: { aviso: Aviso; left: number; onNext: () => void }) {
  const money = aviso.tipo === 'dinero'
  return (
    <div className="banca-modal" role="dialog" aria-modal="true" aria-labelledby={`banca-aviso-${aviso.id}`}>
      <div className="banca-modal__backdrop" />
      <div className={`banca-card ${money ? 'banca-card--money' : ''}`}>
        {money && (
          <div className="banca-card__coins" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
        )}
        <div className="banca-card__seal" aria-hidden="true">
          {money ? '€' : '✉'}
        </div>
        <p className="banca-card__from">{money ? 'La banca' : aviso.todos ? 'Mensaje de la banca para todos' : 'Mensaje de la banca'}</p>
        {money ? (
          <h2 id={`banca-aviso-${aviso.id}`} className="banca-card__title">
            ¡Has recibido <span>{eur(aviso.importe ?? 0)}</span> de la banca!
          </h2>
        ) : (
          <h2 id={`banca-aviso-${aviso.id}`} className="banca-card__title banca-card__title--msg">
            {aviso.texto}
          </h2>
        )}
        {money && aviso.texto && <p className="banca-card__text">«{aviso.texto}»</p>}
        {money && <p className="banca-card__note">Ya está en tu saldo de Juegos de esta semana.</p>}
        <button type="button" className="banca-card__ok" onClick={onNext} autoFocus>
          {left > 0 ? `Siguiente (${left})` : money ? '¡Gracias, banca!' : 'Entendido'}
        </button>
      </div>
    </div>
  )
}

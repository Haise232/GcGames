import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { eur } from './money.js'
import './tutorial.css'

// Guía de Juegos: la primera vez que entras en la temporada se abre sola (y luego con el botón «Tutorial»). Cada paso
// ilumina una zona del selector (data-tour="…") y la explica con un dibujo. Si la zona no existe (p. ej. la banca, que
// solo ve el master), el paso se salta.
export const TUTORIAL_KEY = 'juegos-tutorial-season4'
export const START = 15000

const Art = {
  // Season 4: sol que se pone en el mar, con una palmera.
  island: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="tut-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5a1f7a" />
          <stop offset="0.6" stopColor="#ff6b5a" />
          <stop offset="1" stopColor="#ffcf6b" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill="url(#tut-sky)" />
      <circle className="tut-pulse" cx="68" cy="70" r="24" fill="#ffe36e" />
      <path d="M6 76 H114 A54 54 0 0 1 6 76 Z" fill="#16466e" />
      <path d="M20 84 q8 -4 16 0 M50 92 q8 -4 16 0 M80 86 q8 -4 16 0" stroke="#8fe3ff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M30 78 C 32 60, 36 46, 44 36" stroke="#1a0f2e" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M44 36 c 10 -8 22 -6 28 4 c -8 -4 -16 -2 -28 -4 Z M44 36 c -10 -8 -22 -4 -26 6 c 8 -4 16 -4 26 -6 Z M44 36 c 2 -12 12 -18 22 -16 c -10 2 -16 8 -22 16 Z" fill="#1a0f2e" />
      <text x="88" y="38" textAnchor="middle" fontSize="26" fontWeight="900" fill="#fff" stroke="#3a0f3e" strokeWidth="1.5">4</text>
    </svg>
  ),
  // Pase: cofre con estrella encima.
  pass: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <g className="tut-bob">
        <rect x="22" y="56" width="76" height="44" rx="6" fill="#b5622a" stroke="#5a2a0e" strokeWidth="3" />
        <path d="M22 56 C 22 34, 98 34, 98 56 Z" fill="#cf7a36" stroke="#5a2a0e" strokeWidth="3" />
        <rect x="22" y="66" width="76" height="6" fill="#ffd25e" />
        <rect x="53" y="60" width="14" height="14" rx="3" fill="#ffe8a0" stroke="#5a2a0e" strokeWidth="2.5" />
      </g>
      <path className="tut-twinkle" d="M60 6 L66 22 L82 24 L70 34 L74 50 L60 41 L46 50 L50 34 L38 24 L54 22 Z" fill="#ffe36e" stroke="#ff8a4c" strokeWidth="2" />
    </svg>
  ),
  // Torre y Atraco: baldosas de cristal que suben y la puerta de una cámara acorazada.
  solo3: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      {[0, 1, 2].map((r) => (
        <g key={r} className="tut-stack" style={{ animationDelay: `${r * 0.15}s` }}>
          <rect x="8" y={78 - r * 26} width="26" height="20" rx="4" fill="#8fd3ff" stroke="#fff" strokeWidth="2" opacity="0.9" />
          <rect x="38" y={78 - r * 26} width="26" height="20" rx="4" fill={r === 1 ? '#3a2f4a' : '#8fd3ff'} stroke="#fff" strokeWidth="2" opacity="0.9" />
        </g>
      ))}
      <path d="M45 66l6 6-6 6" fill="none" stroke="#ff6b7d" strokeWidth="3" strokeLinecap="round" />
      <circle cx="92" cy="60" r="24" fill="#c9d3db" stroke="#7b8794" strokeWidth="4" />
      <circle className="tut-spin" cx="92" cy="60" r="12" fill="none" stroke="#f2c14e" strokeWidth="5" strokeDasharray="6 5" />
      <circle cx="92" cy="60" r="4" fill="#f2c14e" />
    </svg>
  ),
  // Subasta y Puente: caja con diamante y dos carriles de paneles.
  live3: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <rect x="10" y="62" width="44" height="34" rx="5" fill="#c9893f" stroke="#7a4a06" strokeWidth="3" />
      <path d="M10 76h44" stroke="#7a4a06" strokeWidth="3" />
      <path className="tut-bob" d="M32 30l12 8-12 18-12-18z" fill="#7fe0ff" stroke="#fff" strokeWidth="2" />
      <rect x="70" y="20" width="18" height="18" rx="3" fill="#8fd3ff" stroke="#fff" strokeWidth="2" />
      <rect x="92" y="20" width="18" height="18" rx="3" fill="#8fd3ff" stroke="#fff" strokeWidth="2" opacity="0.4" />
      {[0, 1, 2].map((r) => (
        <g key={r} className="tut-stack" style={{ animationDelay: `${r * 0.15}s` }}>
          <rect x="70" y={46 + r * 22} width="18" height="16" rx="3" fill="#8fd3ff" stroke="#fff" strokeWidth="2" />
          <rect x="92" y={46 + r * 22} width="18" height="16" rx="3" fill="#8fd3ff" stroke="#fff" strokeWidth="2" opacity="0.6" />
        </g>
      ))}
    </svg>
  ),
  money: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className="tut-stack" style={{ animationDelay: `${i * 0.12}s` }}>
          <ellipse cx="60" cy={92 - i * 14} rx="34" ry="11" fill="#b97c0e" />
          <ellipse cx="60" cy={88 - i * 14} rx="34" ry="11" fill="#f2c14e" stroke="#b97c0e" strokeWidth="2" />
        </g>
      ))}
      <text x="60" y="51" textAnchor="middle" fontSize="16" fontWeight="900" fill="#7a4a06">€</text>
    </svg>
  ),
  podium: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <rect x="44" y="40" width="32" height="60" rx="4" fill="#f2c14e" />
      <rect x="10" y="60" width="32" height="40" rx="4" fill="#c9d3db" />
      <rect x="78" y="72" width="32" height="28" rx="4" fill="#d38a55" />
      <text x="60" y="76" textAnchor="middle" fontSize="22" fontWeight="900" fill="#7a4a06">1</text>
      <text x="26" y="86" textAnchor="middle" fontSize="18" fontWeight="900" fill="#3a434e">2</text>
      <text x="94" y="92" textAnchor="middle" fontSize="16" fontWeight="900" fill="#5a2c10">3</text>
      <path className="tut-bob" d="M52 30l4-10 4 8 4-8 4 10z" fill="#f2c14e" />
    </svg>
  ),
  elevator: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <rect x="34" y="10" width="52" height="100" fill="none" stroke="#3b5f86" strokeWidth="3" />
      <g className="tut-rocket">
        <line x1="54" y1="0" x2="54" y2="42" stroke="#9fb3c8" strokeWidth="2" />
        <line x1="66" y1="0" x2="66" y2="42" stroke="#9fb3c8" strokeWidth="2" />
        <rect x="40" y="42" width="40" height="46" rx="4" fill="#1b2b40" stroke="#ffd25e" strokeWidth="3" />
        <circle cx="52" cy="62" r="6" fill="#f1e9d6" />
        <circle cx="68" cy="60" r="6" fill="#f1e9d6" />
      </g>
      <text x="60" y="30" textAnchor="middle" fontSize="16" fill="#ffd25e" fontFamily="var(--display)">×3,4</text>
    </svg>
  ),
  tables: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="66" rx="50" ry="30" fill="#14394f" stroke="#c8a24b" strokeWidth="4" />
      <rect className="tut-card1" x="40" y="48" width="18" height="26" rx="3" fill="#fff" />
      <rect className="tut-card2" x="62" y="48" width="18" height="26" rx="3" fill="#fff" />
      <text x="49" y="66" textAnchor="middle" fontSize="11" fontWeight="900" fill="#c8102e">A</text>
      <text x="71" y="66" textAnchor="middle" fontSize="11" fontWeight="900" fill="#10141a">K</text>
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={20 + i * 20} cy={i % 2 ? 100 : 30} r="7" fill="#3d9f89" />
      ))}
    </svg>
  ),
  gacha: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      {[-16, 0, 16].map((r, i) => (
        <g key={i} transform={`rotate(${r} 60 100)`}>
          <rect x="44" y="24" width="32" height="48" rx="5" fill={['#8a4fd6', '#f2c14e', '#2f7be0'][i]} stroke="#fff" strokeWidth="3" />
        </g>
      ))}
      <path className="tut-twinkle" d="M60 34l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff" />
    </svg>
  ),
  bank: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <path d="M60 14 L104 36 H16 Z" fill="#f2c14e" />
      {[26, 46, 66, 86].map((x) => (
        <rect key={x} x={x} y="42" width="10" height="44" fill="#e9cf86" />
      ))}
      <rect x="14" y="88" width="92" height="12" rx="3" fill="#f2c14e" />
      <text x="60" y="33" textAnchor="middle" fontSize="12" fontWeight="900" fill="#7a4a06">€</text>
    </svg>
  ),
  go: (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="44" fill="#3fbf75" className="tut-pulse" />
      <path d="M48 38 L84 60 L48 82 Z" fill="#fff" />
    </svg>
  ),
}

const STEPS = [
  {
    art: 'island',
    title: '¡Bienvenidos a la Season 4: Islas!',
    text: `El casino se ha ido de vacaciones a Canarias: todo tiene aspecto nuevo, llegan Pez Gordo, Tesoro en la Arena y el Pase de las Islas, con misiones cada día, un cofre gratis y premios en euros en cada nivel. Como siempre, cada domingo a las 23:59 todos volvéis a empezar con ${eur(START)}. Te lo enseñamos en un minuto.`,
    hero: true,
  },
  {
    target: 'me',
    art: 'money',
    title: 'Tu saldo de la semana',
    text: `Aquí ves tu dinero, tu puesto y tu nivel del pase. Empiezas con ${eur(START)} y lo usas en todos los juegos. Cada domingo a las 23:59 todos vuelven a ${eur(START)}.`,
  },
  {
    target: 'pase',
    art: 'pass',
    title: 'El Pase de las Islas',
    text: 'Cada jugada te da experiencia y cada día tienes tres misiones nuevas que dan mucha más (y si haces las tres, un bonus en euros). Sube de nivel para cobrar premios y títulos. El pase dura toda la temporada: no se reinicia el domingo.',
  },
  {
    target: 'pase',
    art: 'gacha',
    title: 'El cofre diario',
    text: `Ábrelo gratis una vez al día. Si vuelves días seguidos la racha sube y el cofre da más: del día 1 al 7, de ${eur(300)} a ${eur(2100)}. Si te saltas un día, la racha empieza de nuevo.`,
  },
  {
    target: 'score',
    art: 'podium',
    title: 'La clasificación',
    text: 'Quien más dinero tenga el domingo gana la semana. Toca aquí para ver el podio, tu puesto, cuánto te falta para subir y la gráfica de cada uno. Ahora también se ve el nivel del pase de cada uno.',
  },
  {
    target: 'round',
    art: 'live3',
    title: 'Todos a la vez',
    text: 'Ascensor, Subasta, Ruleta, Cohete y Carrera: la misma ronda para todo el casino cada pocos segundos. Las tarjetas con pegatina son las de tus misiones de hoy.',
  },
  {
    target: 'elevator',
    art: 'elevator',
    title: 'El Ascensor',
    text: 'Cada minuto, todos suben a la vez. En cada planta el premio crece y tú decides cuándo bajarte (o dejas puesta una planta). En una planta al azar se rompe el cable y quien sigue dentro lo pierde. El último en bajarse antes de la caída se lleva además el bonus.',
  },
  {
    target: 'solo',
    art: 'solo3',
    title: 'A tu ritmo: Pez Gordo y la Arena',
    text: 'Nuevos: Pez Gordo (come plancton y peces más pequeños, huye de los tiburones y sal del agua cuando quieras: cuanto más pesas, más cobras) y Tesoro en la Arena (cava en la playa sin despertar a un cangrejo: cada hoyo bueno sube el premio). Y además La Torre, El Atraco, Plinko y Rana. Cada uno tiene su botón de Ayuda arriba a la derecha.',
  },
  {
    target: 'live',
    art: 'tables',
    title: 'Mesas en vivo',
    text: 'Blackjack, póker y ajedrez con la gente del casino. Siéntate a jugar o entra a mirar, chatea en la mesa e invita a tus amigos con un enlace. Y ojo al Bingo: el bote lo abre la banca a ratos y se avisa a todos a pantalla completa.',
  },
  {
    target: 'gacha',
    art: 'gacha',
    title: 'Tu dinero a salvo',
    text: 'Hacienda solo mira el saldo: guarda dinero en cartas del gacha, en calles de la Inmobiliaria o en la Cuenta en Suiza. Y si te quedas sin saldo, empeña una carta: el banco te presta dinero y la recuperas pagando.',
  },
  {
    target: 'bank',
    art: 'bank',
    title: 'La banca (solo tú)',
    text: 'Como master, desde aquí das dinero, mandas mensajes a todos y activas el Admin Abuse.',
  },
  {
    art: 'go',
    title: '¡A jugar!',
    text: 'Abre tu primer cofre y mira tus misiones de hoy. Puedes volver a ver esta guía cuando quieras con el botón «Tutorial» de arriba. ¡Suerte en la Season 4!',
    hero: true,
  },
]

const PAD = 10

export default function Tutorial({ onClose }) {
  const steps = STEPS.filter((s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`))
  const [i, setI] = useState(0)
  const [box, setBox] = useState(null)
  const step = steps[i]

  const close = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1')
    } catch {
      // sin almacenamiento: volverá a salir la próxima vez
    }
    onClose()
  }, [onClose])

  // Lleva la zona a la vista y mide dónde está (también al cambiar el tamaño de la ventana).
  useLayoutEffect(() => {
    if (!step.target) {
      setBox(null)
      return
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const measure = () => {
      const r = el.getBoundingClientRect()
      setBox({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 })
    }
    measure()
    const timer = setInterval(measure, 120) // sigue al scroll suave
    const stop = setTimeout(() => clearInterval(timer), 900)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearInterval(timer)
      clearTimeout(stop)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step.target])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI((n) => Math.min(steps.length - 1, n + 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, steps.length])

  const last = i === steps.length - 1
  // La tarjeta va debajo de la zona si cabe; si no, encima. Sin zona, en el centro.
  // Si no cabe ni debajo ni encima (zona muy alta), se pega abajo de la pantalla.
  const vh = window.innerHeight
  const CARD_H = 320
  const left = box ? Math.max(12, Math.min(box.x, window.innerWidth - 392)) : 0
  let cardStyle = null
  if (box) {
    if (box.y + box.h + CARD_H < vh) cardStyle = { top: box.y + box.h + 16, left }
    else if (box.y > CARD_H) cardStyle = { top: 'auto', bottom: vh - box.y + 16, left }
    else cardStyle = { top: 'auto', bottom: 16, left }
  }

  return createPortal(
    <div className={`tut ${step.hero ? 'tut--hero' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tut-title">
      {box ? (
        <span className="tut__hole" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-hidden="true" />
      ) : (
        <span className="tut__veil" aria-hidden="true" />
      )}
      {step.hero && (
        <span className="tut__confetti" aria-hidden="true">
          {Array.from({ length: 40 }, (_, k) => (
            <i key={k} style={{ '--x': `${(k * 37) % 100}vw`, '--t': `${((k * 0.21) % 2.4).toFixed(2)}s`, '--c': ['#ffe08a', '#ff6b7d', '#6dffb4', '#7fb8ff', '#c99bff'][k % 5] }} />
          ))}
        </span>
      )}
      <div key={i} className={`tut__card ${box ? 'is-pinned' : ''}`} style={cardStyle ?? undefined}>
        <div className="tut__art">{Art[step.art]}</div>
        {step.hero && i === 0 && <p className="tut__kicker">Bienvenido a GcGames</p>}
        <h2 id="tut-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="tut__dots" aria-label={`Paso ${i + 1} de ${steps.length}`}>
          {steps.map((_, k) => (
            <button key={k} type="button" className={k === i ? 'is-on' : ''} aria-label={`Ir al paso ${k + 1}`} onClick={() => setI(k)} />
          ))}
        </div>
        <div className="tut__btns">
          {i > 0 ? (
            <button type="button" className="tut__ghost" onClick={() => setI(i - 1)}>
              Atrás
            </button>
          ) : (
            <button type="button" className="tut__ghost" onClick={close}>
              Saltar
            </button>
          )}
          <button type="button" className="tut__next" onClick={() => (last ? close() : setI(i + 1))} autoFocus>
            {last ? '¡A jugar!' : i === 0 ? 'Empezar el tour' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

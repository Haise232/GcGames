import { useEffect, useId, useRef, useState } from 'react'
import { Eye, EyeOff, Check, Clock, Sparkles } from 'lucide-react'
import '@fontsource/abril-fatface/latin.css'
import '@fontsource-variable/instrument-sans/index.css'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { CrashScene, RaceScene, RouletteScene } from '../juegos/hub/HubArt.jsx'
import { FishScene } from '../juegos/season4/FishArt.jsx'
import PlayingCard from '../juegos/comun/PlayingCard.jsx'
import Logo from '../Logo.jsx'
import './entrada.css'

const EMAIL_KEY = 'gcgames-email' // el último email con el que se entró, para no tener que escribirlo otra vez
const PENDING_POLL_MS = 20000 // con la cuenta pendiente se mira cada este rato si ya la han aceptado

function savedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveEmail(email) {
  try {
    localStorage.setItem(EMAIL_KEY, email)
  } catch {
    // sin almacenamiento: no se recuerda
  }
}

// Los errores de Supabase Auth, en castellano.
function mensaje(error) {
  const text = String(error?.message ?? '')
  if (/invalid login credentials/i.test(text)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(text)) return 'Confirma tu email con el enlace que te hemos enviado.'
  if (/already registered|already been registered|already exists/i.test(text)) return 'Ya hay una cuenta con ese email. Entra con ella.'
  if (/password should be at least|weak password|password is too weak/i.test(text)) return 'La contraseña es demasiado débil: usa al menos 8 caracteres.'
  if (/invalid.*email|email.*invalid|unable to validate email/i.test(text)) return 'Ese email no parece válido.'
  if (/signups not allowed|signup is disabled/i.test(text)) return 'Ahora mismo no se pueden crear cuentas nuevas.'
  if (/rate limit|too many/i.test(text)) return 'Demasiados intentos. Espera un minuto y vuelve a probar.'
  if (/fetch|network|timeout|abort/i.test(text) || error?.name === 'AbortError') return 'Sin conexión. Comprueba tu internet.'
  return text || 'Algo ha fallado. Inténtalo de nuevo.'
}

// Lo fuerte que es una contraseña, de 1 a 4 (solo orienta: Supabase pide un mínimo de 6 caracteres).
function fuerza(password) {
  let score = password.length >= 8 ? 1 : 0
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++
  return Math.max(1, Math.min(4, score))
}
const FUERZA = ['', 'floja', 'normal', 'buena', 'muy buena']

// ---------- El escaparate: qué es GcGames y cómo se ve ----------

const PREVIEW = [
  { id: 'roulette', name: 'Ruleta', note: 'Cada 25 s', art: <RouletteScene />, bg: 'linear-gradient(#3b1616, #1a0a0c)' },
  { id: 'crash', name: 'Cohete', note: 'Retira a tiempo', art: <CrashScene />, bg: 'linear-gradient(#121f45, #070d22)' },
  { id: 'race', name: 'Carrera', note: 'Al podio', art: <RaceScene />, bg: 'linear-gradient(#2a2410, #120f05)' },
]

function Escaparate({ compacto = false }) {
  return (
    <section className={`gc-show ${compacto ? 'gc-show--compact' : ''}`} aria-label="Qué es GcGames">
      <div className="gc-show__brand">
        <Logo className="gc-show__logo" />
        <div>
          <p className="gc-show__eyebrow">Casino online · dinero ficticio</p>
          <h1>GcGames</h1>
        </div>
      </div>
      <p className="gc-show__lead">
        Mesas de blackjack, póker y ajedrez en vivo, ruletas y carreras para todos a la vez, cartas coleccionables y una semana para
        acabar en lo más alto del Score.
      </p>

      {/* .juegos-root: las escenas y las cartas del casino solo se pintan dentro de su contenedor. */}
      <div className="gc-show__stage juegos-root" aria-hidden="true">
        <figure className="gc-tile gc-tile--big" style={{ '--bg': 'linear-gradient(#1b8fa8, #06223d)' }}>
          <FishScene />
          <figcaption>
            <span className="gc-live">Nuevo</span>
            <b>Pez Gordo</b>
            <small>Come, crece y que no te coman</small>
          </figcaption>
        </figure>
        {PREVIEW.map((g) => (
          <figure key={g.id} className="gc-tile" style={{ '--bg': g.bg }}>
            {g.art}
            <figcaption>
              <b>{g.name}</b>
              <small>{g.note}</small>
            </figcaption>
          </figure>
        ))}
        <div className="gc-hand">
          <PlayingCard rank="A" suit="spades" index={0} />
          <PlayingCard rank="K" suit="hearts" index={1} />
          <span className="gc-chip gc-chip--a" />
          <span className="gc-chip gc-chip--b" />
          <span className="gc-chip gc-chip--c" />
        </div>
      </div>

      <ul className="gc-show__facts">
        <li>
          <b>15.000 €</b>
          <span>para cada uno, cada semana</span>
        </li>
        <li>
          <b>+15</b>
          <span>juegos en vivo y en solitario</span>
        </li>
        <li>
          <b>Domingo</b>
          <span>podio del Score y reinicio</span>
        </li>
      </ul>
    </section>
  )
}

function Marco({ children, compacto = false }) {
  return (
    <main className="entrada">
      <div className="entrada__layout">
        <Escaparate compacto={compacto} />
        <div className="entrada__card">{children}</div>
      </div>
    </main>
  )
}

export function Cargando() {
  return (
    <main className="entrada entrada--center" aria-busy="true">
      <div className="entrada__loading">
        <Logo className="entrada__loading-logo" />
        <span className="entrada__spinner" aria-label="Cargando" />
      </div>
    </main>
  )
}

function Spinner() {
  return <span className="entrada__btn-spin" aria-hidden="true" />
}

function Salir() {
  return (
    <button type="button" className="entrada__link" onClick={() => supabase.auth.signOut()}>
      Cerrar sesión
    </button>
  )
}

// Pantalla con un mensaje (cuenta rechazada, error…) y la salida.
export function Aviso({ titulo, children, accion }) {
  return (
    <Marco compacto>
      <h2 className="entrada__title">{titulo}</h2>
      <p className="entrada__text">{children}</p>
      <div className="entrada__actions">
        {accion && (
          <button type="button" className="entrada__btn" onClick={accion.onClick}>
            {accion.texto}
          </button>
        )}
        <Salir />
      </div>
    </Marco>
  )
}

// Cuenta creada pero sin aceptar: se comprueba sola cada poco y entra en cuanto el master la acepta.
export function Pendiente({ nombre }) {
  const { refresh } = useAuth()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const check = () => document.visibilityState === 'visible' && refresh()
    const timer = setInterval(check, PENDING_POLL_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [refresh])
  const comprobar = async () => {
    setBusy(true)
    await refresh()
    setBusy(false)
  }
  return (
    <Marco compacto>
      <h2 className="entrada__title">¡Ya casi, {nombre}!</h2>
      <p className="entrada__text">Tu cuenta está creada. Solo falta que el master la acepte; en cuanto lo haga, entrarás solo.</p>
      <ol className="entrada__steps">
        <li className="is-done">
          <Check size={16} aria-hidden="true" /> Cuenta creada
        </li>
        <li className="is-now">
          <Clock size={16} aria-hidden="true" /> El master la revisa
        </li>
        <li>
          <Sparkles size={16} aria-hidden="true" /> A jugar con 15.000 €
        </li>
      </ol>
      <div className="entrada__actions">
        <button type="button" className="entrada__btn" disabled={busy} onClick={comprobar}>
          {busy && <Spinner />}
          {busy ? 'Comprobando…' : 'Comprobar ahora'}
        </button>
        <Salir />
      </div>
    </Marco>
  )
}

// Campo de contraseña con botón para verla y aviso de mayúsculas activadas.
function Password({ id, inputRef, value, onChange, autoComplete, label, describedBy }) {
  const [visible, setVisible] = useState(false)
  const [caps, setCaps] = useState(false)
  const capsId = `${id}-caps`
  const onKey = (e) => setCaps(Boolean(e.getModifierState?.('CapsLock')))
  return (
    <div className="entrada__field">
      <label htmlFor={id}>{label}</label>
      <div className="entrada__pw">
        <input
          id={id}
          ref={inputRef}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          onBlur={() => setCaps(false)}
          autoComplete={autoComplete}
          minLength={6}
          required
          aria-describedby={[describedBy, caps ? capsId : null].filter(Boolean).join(' ') || undefined}
        />
        <button
          type="button"
          className="entrada__eye"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar la contraseña' : 'Ver la contraseña'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {caps && (
        <small id={capsId} className="entrada__caps">
          Tienes las mayúsculas activadas.
        </small>
      )}
    </div>
  )
}

export function Entrada() {
  const [modo, setModo] = useState('entrar') // entrar | registro | olvido
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState(savedEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [nota, setNota] = useState(null) // { ok, text }
  const nameRef = useRef(null)
  const emailRef = useRef(null)
  const pwRef = useRef(null)
  const ids = useId()

  // Al cambiar de pestaña, el foco va al primer campo que falta (con el email recordado, a la contraseña).
  useEffect(() => {
    const target = modo === 'registro' ? nameRef : modo === 'entrar' && emailRef.current?.value ? pwRef : emailRef
    target.current?.focus({ preventScroll: true })
  }, [modo])

  const cambiar = (m) => {
    setModo(m)
    setNota(null)
  }

  const enviar = async (e) => {
    e.preventDefault()
    setBusy(true)
    setNota(null)
    try {
      const correo = email.trim().toLowerCase()
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: correo, password })
        if (error) throw error
        saveEmail(correo)
      } else if (modo === 'registro') {
        const nom = nombre.trim().replace(/\s+/g, ' ')
        if (nom.length < 2) throw new Error('Pon tu nombre, como te conoce la gente.')
        if (password.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres.')
        const { data, error } = await supabase.auth.signUp({ email: correo, password, options: { data: { nombre: nom } } })
        if (error) throw error
        saveEmail(correo)
        // Sin sesión: el proyecto pide confirmar el email antes de entrar.
        if (!data.session) setNota({ ok: true, text: 'Te hemos enviado un email para confirmar la cuenta. Ábrelo y vuelve aquí.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: location.origin })
        if (error) throw error
        setNota({ ok: true, text: 'Si hay una cuenta con ese email, te llegará un enlace para elegir otra contraseña.' })
      }
    } catch (error) {
      setNota({ ok: false, text: mensaje(error) })
    } finally {
      setBusy(false)
    }
  }

  const nivel = modo === 'registro' && password ? fuerza(password) : 0
  const boton = { entrar: 'Entrar al casino', registro: 'Crear mi cuenta', olvido: 'Enviar el enlace' }[modo]
  const fuerzaId = `${ids}-fuerza`

  return (
    <Marco>
      {modo === 'olvido' ? (
        <header className="entrada__head">
          <h2 className="entrada__title">¿Olvidaste la contraseña?</h2>
          <p className="entrada__text">Escribe tu email y te mandamos un enlace para elegir una nueva.</p>
        </header>
      ) : (
        <>
          <div className="entrada__tabs" role="tablist" aria-label="Entrar o crear cuenta" data-active={modo}>
            <button type="button" role="tab" aria-selected={modo === 'entrar'} onClick={() => cambiar('entrar')}>
              Entrar
            </button>
            <button type="button" role="tab" aria-selected={modo === 'registro'} onClick={() => cambiar('registro')}>
              Crear cuenta
            </button>
          </div>
          <header className="entrada__head">
            <h2 className="entrada__title">{modo === 'entrar' ? 'Bienvenido de nuevo' : 'Únete a la mesa'}</h2>
            <p className="entrada__text">
              {modo === 'entrar'
                ? 'Tu saldo, tus cartas y tus inmuebles te están esperando.'
                : 'Empiezas con 15.000 € de mentira. El master acepta las cuentas nuevas.'}
            </p>
          </header>
        </>
      )}

      <form className="entrada__form" onSubmit={enviar}>
        {modo === 'registro' && (
          <div className="entrada__field">
            <label htmlFor={`${ids}-nombre`}>Nombre</label>
            <input
              id={`${ids}-nombre`}
              ref={nameRef}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              placeholder="Como te conoce la gente"
              maxLength={40}
              required
            />
          </div>
        )}
        <div className="entrada__field">
          <label htmlFor={`${ids}-email`}>Email</label>
          <input
            id={`${ids}-email`}
            ref={emailRef}
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete={modo === 'registro' ? 'email' : 'username'}
            placeholder="tu@email.com"
            required
          />
        </div>
        {modo !== 'olvido' && (
          <Password
            id={`${ids}-pw`}
            inputRef={pwRef}
            value={password}
            onChange={setPassword}
            label="Contraseña"
            autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
            describedBy={modo === 'registro' ? fuerzaId : undefined}
          />
        )}
        {modo === 'registro' && (
          <div className="entrada__strength" data-level={nivel} id={fuerzaId} aria-live="polite">
            <span className="entrada__bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <small>{password ? `Contraseña ${FUERZA[nivel]}` : 'Mínimo 6 caracteres; mejor 8 o más'}</small>
          </div>
        )}
        {modo === 'entrar' && (
          <button type="button" className="entrada__forgot" onClick={() => cambiar('olvido')}>
            ¿Has olvidado la contraseña?
          </button>
        )}

        {nota && (
          <p role={nota.ok ? 'status' : 'alert'} className={`entrada__note ${nota.ok ? 'is-ok' : 'is-err'}`}>
            {nota.text}
          </p>
        )}
        <button type="submit" className="entrada__btn" disabled={busy}>
          {busy && <Spinner />}
          {busy ? 'Un momento…' : boton}
        </button>
      </form>

      {modo === 'entrar' && (
        <p className="entrada__hint">
          ¿Primera vez?{' '}
          <button type="button" className="entrada__inline" onClick={() => cambiar('registro')}>
            Crea tu cuenta
          </button>
        </p>
      )}
      {modo === 'registro' && (
        <p className="entrada__hint">
          ¿Ya tienes cuenta?{' '}
          <button type="button" className="entrada__inline" onClick={() => cambiar('entrar')}>
            Entra
          </button>
        </p>
      )}
      {modo === 'olvido' && (
        <button type="button" className="entrada__link" onClick={() => cambiar('entrar')}>
          Volver a entrar
        </button>
      )}
      <p className="entrada__legal">Dinero ficticio: en GcGames no se apuesta ni se gana dinero real.</p>
    </Marco>
  )
}

// Al abrir el enlace del correo de «he olvidado la contraseña», o al entrar con una contraseña temporal que dio el master
// (obligatoria: no se puede jugar hasta elegir otra).
export function NuevaPassword({ obligatoria = false, nombre = '' }) {
  const { endRecovery, refresh } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [nota, setNota] = useState(null)
  const id = useId()

  const enviar = async (e) => {
    e.preventDefault()
    setBusy(true)
    setNota(null)
    if (password.length < 6) {
      setBusy(false)
      setNota({ ok: false, text: 'La contraseña tiene que tener al menos 6 caracteres.' })
      return
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setBusy(false)
      setNota({ ok: false, text: /same|different from the old/i.test(error.message) ? 'Tiene que ser distinta de la temporal.' : mensaje(error) })
      return
    }
    // Ya no es temporal: se quita la marca y se vuelve a leer el perfil para entrar al casino.
    await supabase.rpc('juegos_password_cambiada')
    await refresh()
    setBusy(false)
    endRecovery()
  }

  return (
    <Marco compacto>
      <header className="entrada__head">
        <h2 className="entrada__title">{obligatoria ? `Hola, ${nombre}: elige tu contraseña` : 'Elige una contraseña nueva'}</h2>
        <p className="entrada__text">
          {obligatoria
            ? 'Has entrado con una contraseña temporal que te dio el master. Antes de jugar, cámbiala por una tuya.'
            : 'La usarás a partir de ahora para entrar.'}
        </p>
      </header>
      <form className="entrada__form" onSubmit={enviar}>
        <Password id={`${id}-pw`} value={password} onChange={setPassword} label="Contraseña nueva" autoComplete="new-password" />
        {nota && (
          <p role="alert" className="entrada__note is-err">
            {nota.text}
          </p>
        )}
        <button type="submit" className="entrada__btn" disabled={busy}>
          {busy && <Spinner />}
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
      {obligatoria && <Salir />}
    </Marco>
  )
}

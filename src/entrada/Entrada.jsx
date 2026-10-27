import { useState } from 'react'
import '@fontsource/abril-fatface/latin.css'
import '@fontsource-variable/instrument-sans/index.css'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import './entrada.css'

// Los errores de Supabase Auth, en castellano.
function mensaje(error) {
  const text = String(error?.message ?? '')
  if (/invalid login credentials/i.test(text)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(text)) return 'Confirma tu email con el enlace que te hemos enviado.'
  if (/already registered|already been registered/i.test(text)) return 'Ya hay una cuenta con ese email. Entra con ella.'
  if (/password should be at least/i.test(text)) return 'La contraseña tiene que tener al menos 6 caracteres.'
  if (/rate limit|too many/i.test(text)) return 'Demasiados intentos. Espera un poco y vuelve a probar.'
  if (/fetch|network|timeout|abort/i.test(text) || error?.name === 'AbortError') return 'Sin conexión. Comprueba tu internet.'
  return text || 'Algo ha fallado. Inténtalo de nuevo.'
}

function Marco({ children }) {
  return (
    <main className="entrada">
      <div className="entrada__card">
        <header className="entrada__brand">
          <small>Casino</small>
          <h1>Juegos</h1>
        </header>
        {children}
      </div>
    </main>
  )
}

export function Cargando() {
  return (
    <main className="entrada" aria-busy="true">
      <span className="entrada__spinner" aria-label="Cargando" />
    </main>
  )
}

// Pantalla con un mensaje (cuenta pendiente, error…) y la salida.
export function Aviso({ titulo, children, accion }) {
  return (
    <Marco>
      <h2 className="entrada__title">{titulo}</h2>
      <p className="entrada__text">{children}</p>
      <div className="entrada__actions">
        {accion && (
          <button type="button" className="entrada__btn" onClick={accion.onClick}>
            {accion.texto}
          </button>
        )}
        <button type="button" className="entrada__link" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </div>
    </Marco>
  )
}

export function Entrada() {
  const [modo, setModo] = useState('entrar') // entrar | registro | olvido
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [nota, setNota] = useState(null) // { ok, text }

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
      } else if (modo === 'registro') {
        const nom = nombre.trim()
        if (nom.length < 2) throw new Error('Pon tu nombre (como te conoce la gente).')
        const { data, error } = await supabase.auth.signUp({ email: correo, password, options: { data: { nombre: nom } } })
        if (error) throw error
        // Sin sesión: el proyecto pide confirmar el email antes de entrar.
        if (!data.session) setNota({ ok: true, text: 'Te hemos enviado un email para confirmar la cuenta.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: location.origin })
        if (error) throw error
        setNota({ ok: true, text: 'Si hay una cuenta con ese email, te llegará un enlace para cambiar la contraseña.' })
      }
    } catch (error) {
      setNota({ ok: false, text: mensaje(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Marco>
      {modo !== 'olvido' && (
        <div className="entrada__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={modo === 'entrar'} onClick={() => cambiar('entrar')}>
            Entrar
          </button>
          <button type="button" role="tab" aria-selected={modo === 'registro'} onClick={() => cambiar('registro')}>
            Crear cuenta
          </button>
        </div>
      )}
      {modo === 'olvido' && <h2 className="entrada__title">Cambiar la contraseña</h2>}

      <form className="entrada__form" onSubmit={enviar}>
        {modo === 'registro' && (
          <label>
            <span>Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={40} required />
          </label>
        )}
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {modo !== 'olvido' && (
          <label>
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          </label>
        )}
        {nota && (
          <p role="status" className={`entrada__note ${nota.ok ? 'is-ok' : 'is-err'}`}>
            {nota.text}
          </p>
        )}
        <button type="submit" className="entrada__btn" disabled={busy}>
          {busy ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : modo === 'registro' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>
      </form>

      {modo === 'registro' && <p className="entrada__hint">Las cuentas nuevas las acepta el master antes de poder jugar.</p>}
      {modo === 'entrar' && (
        <>
          <p className="entrada__hint">¿Jugabas en TopCode? Entra con el mismo email y contraseña: tu saldo y tus cartas siguen aquí.</p>
          <button type="button" className="entrada__link" onClick={() => cambiar('olvido')}>
            He olvidado la contraseña
          </button>
        </>
      )}
      {modo === 'olvido' && (
        <button type="button" className="entrada__link" onClick={() => cambiar('entrar')}>
          Volver
        </button>
      )}
    </Marco>
  )
}

// Al abrir el enlace del correo de «he olvidado la contraseña».
export function NuevaPassword() {
  const { endRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [nota, setNota] = useState(null)

  const enviar = async (e) => {
    e.preventDefault()
    setBusy(true)
    setNota(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setNota({ ok: false, text: mensaje(error) })
    else endRecovery()
  }

  return (
    <Marco>
      <h2 className="entrada__title">Nueva contraseña</h2>
      <form className="entrada__form" onSubmit={enviar}>
        <label>
          <span>Contraseña nueva</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
        </label>
        {nota && (
          <p role="status" className={`entrada__note ${nota.ok ? 'is-ok' : 'is-err'}`}>
            {nota.text}
          </p>
        )}
        <button type="submit" className="entrada__btn" disabled={busy}>
          {busy ? 'Un momento…' : 'Guardar'}
        </button>
      </form>
    </Marco>
  )
}

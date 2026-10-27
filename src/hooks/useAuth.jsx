import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Sesión de Supabase y el perfil de la tabla usuarios (nombre, avatar, estado de la cuenta y si eres el master).
// estado: loading | out (sin sesión) | ready (con perfil) | error (con sesión, pero el perfil no se pudo leer)
const AuthContext = createContext({ session: null, usuario: null, estado: 'loading', recovery: false, refresh: async () => {} })

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [estado, setEstado] = useState('loading')
  const [recovery, setRecovery] = useState(false)
  const fetchId = useRef(0)

  const loadPerfil = useCallback(async () => {
    const id = ++fetchId.current
    try {
      const { data, error } = await supabase.rpc('get_mi_perfil')
      if (id !== fetchId.current) return
      const perfil = data?.[0] ?? null
      setUsuario(perfil)
      setEstado(error || !perfil ? 'error' : 'ready')
    } catch {
      if (id === fetchId.current) setEstado('error')
    }
  }, [])

  useEffect(() => {
    // El callback no puede esperar llamadas a Supabase: corre dentro del lock de auth y se quedaría bloqueado. El
    // perfil se pide fuera, con setTimeout.
    const { data } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (!sess) {
        fetchId.current++
        setUsuario(null)
        setEstado('out')
        return
      }
      if (event === 'TOKEN_REFRESHED') return
      setTimeout(loadPerfil, 0)
    })
    return () => data.subscription.unsubscribe()
  }, [loadPerfil])

  const value = { session, usuario, estado, recovery, endRecovery: () => setRecovery(false), refresh: loadPerfil }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) throw new Error('Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY')

export const supabase = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // el enlace del correo para cambiar la contraseña trae la sesión en la URL
    storageKey: 'juegos-session',
    // Sin `lock` propio: supabase-js usa el LockManager del navegador y renueva la sesión de una en una, también entre
    // pestañas (varias renovaciones a la vez con el mismo token hacen que Supabase cierre la sesión).
  },
  global: {
    // Auth no se corta: si se aborta una renovación que el servidor ya hizo, el reintento llega con el token viejo y
    // Supabase cierra la sesión. El resto, 8 s como mucho.
    fetch: (input, options) => {
      const auth = String(input instanceof Request ? input.url : input).includes('/auth/v1/')
      const timeout = AbortSignal.timeout(auth ? 30_000 : 8000)
      const signal = options?.signal && 'any' in AbortSignal ? AbortSignal.any([options.signal, timeout]) : options?.signal ?? timeout
      return fetch(input, { ...options, signal })
    },
  },
})

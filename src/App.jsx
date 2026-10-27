import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Aviso, Cargando, Entrada, NuevaPassword } from './entrada/Entrada'

const Juegos = lazy(() => import('./juegos/Juegos'))

function Casino() {
  const { estado, usuario, recovery, refresh } = useAuth()
  if (recovery) return <NuevaPassword />
  if (estado === 'loading') return <Cargando />
  if (estado === 'out') return <Entrada />
  if (estado === 'error') {
    return (
      <Aviso titulo="No se pudo cargar tu cuenta" accion={{ texto: 'Reintentar', onClick: refresh }}>
        Estás conectado, pero no hemos podido comprobar el estado de tu cuenta. Revisa tu conexión.
      </Aviso>
    )
  }
  if (usuario.estado_acceso === 'rechazado') {
    return <Aviso titulo="Cuenta rechazada">El master no ha aceptado esta cuenta.</Aviso>
  }
  if (usuario.estado_acceso !== 'aprobado') {
    return (
      <Aviso titulo="Cuenta pendiente" accion={{ texto: 'Ya me han aceptado', onClick: refresh }}>
        Hola, {usuario.nombre}. El master tiene que aceptar tu cuenta antes de que puedas jugar.
      </Aviso>
    )
  }
  return (
    <Suspense fallback={<Cargando />}>
      <Juegos />
    </Suspense>
  )
}

// Los enlaces de invitación de cuando Juegos estaba en TopCode (/juegos?juego=…&mesa=…) llevan a la misma mesa.
function Antiguo() {
  const { search } = useLocation()
  return <Navigate to={`/${search}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Casino />} />
      <Route path="/juegos" element={<Antiguo />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

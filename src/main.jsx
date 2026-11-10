import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import App from './App'

// Tras un despliegue nuevo, una pestaña abierta antes pide trozos de JS que ya no existen: se recarga una vez para coger
// la versión nueva (si vuelve a fallar enseguida, no se insiste).
const RELOAD_KEY = 'juegos:recarga-version'
window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0
    if (Date.now() - last < 30000) return
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // sin sessionStorage: se recarga igual
  }
  event.preventDefault()
  window.location.reload()
})

// Versión nueva publicada: el service worker (vite-plugin-pwa, autoUpdate) la descarga y toma el control, pero la página
// abierta seguía con la vieja hasta recargar a mano, y la app instalada en el móvil podía no enterarse nunca. Ahora:
// - cada 15 minutos (y al volver a la app) se pregunta si hay versión nueva;
// - cuando la nueva toma el control se recarga, al momento si estás en el selector y, si estás jugando, en cuanto
//   salgas de la pestaña o de la app (para no cortarte a mitad de partida).
// Solo si ya había una versión controlando la página: en la primera visita no hace falta recargar.
const UPDATE_EVERY_MS = 15 * 60000
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloading = false
  const reload = () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  }
  const inLobby = () => {
    try {
      const screen = sessionStorage.getItem('juegos-pantalla')
      return !screen || screen === 'lobby'
    } catch {
      return true
    }
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (document.visibilityState === 'hidden' || inLobby()) reload()
    else document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && reload())
  })
  navigator.serviceWorker.ready.then((registration) => {
    const check = () => registration.update().catch(() => {})
    setInterval(check, UPDATE_EVERY_MS)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
)

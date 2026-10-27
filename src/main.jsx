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

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
)

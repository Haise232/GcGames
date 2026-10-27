import { useState } from 'react'

// Enlace para que otra persona entre directamente a esta mesa (/?juego=poker&mesa=ABCD).
export function inviteLink(game, code) {
  const url = new URL('/', location.origin)
  url.searchParams.set('juego', game)
  if (code) url.searchParams.set('mesa', code)
  return url.toString()
}

// Botón «Invitar»: en el móvil abre el menú de compartir; si no, copia el enlace.
function Invite({ game, code, name }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = inviteLink(game, code)
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: `${name} en Juegos`, text: `¿Te echas una partida de ${name.toLowerCase()}?`, url })
        return
      } catch {
        // Cancelado o no disponible: se copia el enlace.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copia el enlace para invitar:', url)
    }
  }

  return (
    <button type="button" onClick={share} aria-live="polite">
      {copied ? 'Enlace copiado' : 'Invitar'}
    </button>
  )
}

export default Invite

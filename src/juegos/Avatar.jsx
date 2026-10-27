import { useState } from 'react'
import './Avatar.css'

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => [...word][0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

// Tono estable por nombre para quien no tiene foto.
const hueOf = (name = '') => [...name].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) % 360, 17)

// Foto de perfil; si no hay o no carga, las iniciales sobre un color propio.
function Avatar({ name, src, size = 32, className = '' }) {
  const [broken, setBroken] = useState(false)
  const style = { '--size': `${size}px`, '--hue': hueOf(name) }
  if (src && !broken) {
    return (
      <img
        className={`avatar ${className}`}
        style={style}
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span className={`avatar avatar--initials ${className}`} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export default Avatar

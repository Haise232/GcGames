import logo from './assets/logo.svg'

// Logo de GcGames: una ficha de casino con el monograma Gc (src/assets/logo.svg; los iconos de public/ salen de él).
export default function Logo({ className = '', size }) {
  return <img className={className} src={logo} width={size} height={size} alt="" aria-hidden="true" draggable="false" />
}

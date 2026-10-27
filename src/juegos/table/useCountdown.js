import { useEffect, useState } from 'react'

// Tiempo restante según el plazo que informó el servidor (relativo: no depende de que los relojes coincidan).
export function useCountdown(deadlineIn, total, at) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadlineIn === null) return
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [deadlineIn, at])
  if (deadlineIn === null) return null
  const left = Math.max(0, at + deadlineIn - now)
  return { seconds: Math.ceil(left / 1000), fraction: total > 0 ? left / total : 0 }
}

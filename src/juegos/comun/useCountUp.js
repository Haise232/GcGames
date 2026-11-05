import { useEffect, useRef, useState } from 'react'

// Hace que una cifra suba o baje contando hasta su nuevo valor.
export function useCountUp(target, ms = 700, initial = target) {
  const [shown, setShown] = useState(initial)
  const shownRef = useRef(initial)

  useEffect(() => {
    const from = shownRef.current
    if (from === target) return
    const start = performance.now()
    let frame
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms)) // el primer fotograma puede llevar una hora anterior a start
      const value = Math.round(from + (target - from) * (1 - (1 - t) ** 3))
      shownRef.current = value
      setShown(value)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, ms])

  return shown
}

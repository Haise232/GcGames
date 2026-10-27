import { useCallback, useLayoutEffect, useRef } from 'react'

// useEffectEvent de React 19 para React 18: una función estable que siempre ve los últimos props y estado.
export function useEffectEvent(fn) {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args) => ref.current(...args), [])
}

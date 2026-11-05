// Tipos de halloween.js para los ficheros TypeScript (el panel de la banca).
export type PreferenciaHalloween = 'auto' | 'on' | 'off'
export function enFechas(ahora?: Date): boolean
export function preferencia(): PreferenciaHalloween
export function setPreferencia(valor: PreferenciaHalloween): void
export function halloweenActivo(ahora?: Date, search?: string, pref?: PreferenciaHalloween): boolean
export function useHalloween(): boolean

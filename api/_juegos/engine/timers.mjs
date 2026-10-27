// Copiado del proyecto de juegos (Rule) con scripts/export-topcode.mjs: no editar aquí.
// Un temporizador por sala, con nombre, para que la sala se pueda guardar y retomar.
// - realTimers (servidor Node con WebSocket): un setTimeout de verdad.
// - storedTimers (funciones de Vercel): solo queda anotado en room.pending y lo dispara room.wake() cuando vence.
export const realTimers = {
  live: true,
  set(room, ms) {
    room.timer = setTimeout(() => {
      room.timer = null
      const pending = room.pending
      room.pending = null
      if (pending) room.fire(pending)
    }, ms)
  },
  clear(room) {
    clearTimeout(room.timer)
    room.timer = null
  },
}

export const storedTimers = { live: false, set() {}, clear() {} }

// Métodos comunes de las salas. Cada sala define `onTimer`: { nombre: function (arg) { … } }.
export const timerMethods = {
  later(name, ms, arg = null) {
    this.timers.clear(this)
    this.pending = { name, arg, at: this.now() + ms }
    this.timers.set(this, ms)
  },

  clearTimer() {
    this.timers.clear(this)
    this.pending = null
  },

  fire({ name, arg }) {
    this.onTimer[name].call(this, arg)
    this.broadcast()
  },

  // Dispara lo que ya venció (varios pasos seguidos si la petición llegó tarde). Devuelve si cambió algo.
  wake() {
    let fired = 0
    while (this.pending && this.pending.at <= this.now() && fired < 50) {
      const pending = this.pending
      this.pending = null
      this.fire(pending)
      fired++
    }
    return fired > 0
  },
}

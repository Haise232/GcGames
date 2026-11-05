// Efectos de sonido sintetizados con Web Audio, sin archivos externos.
let ctx = null
let master = null
let muted = false

export const isMuted = () => muted

export function setMuted(value) {
  muted = value
  if (master) master.gain.value = value ? 0 : 1
}

// El contexto se crea en el primer gesto del usuario, como exigen los navegadores.
function audio() {
  if (muted) return null
  try {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(ac, { freq, to, at = 0, dur, type = 'triangle', peak = 0.12 }) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  const start = ac.currentTime + at
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur)
  gain.gain.setValueAtTime(peak, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.connect(gain).connect(master)
  osc.start(start)
  osc.stop(start + dur)
}

export function playChip() {
  const ac = audio()
  if (ac) tone(ac, { freq: 900, dur: 0.06, type: 'square', peak: 0.05 })
}

// Tictac de la bola: empieza rápido y se va espaciando hasta que se detiene.
export function playSpin(ms) {
  const ac = audio()
  if (!ac) return
  let gap = 0.045
  for (let at = 0; at < ms / 1000 - 0.1; at += gap) {
    tone(ac, { freq: 1400, at, dur: 0.03, type: 'square', peak: 0.04 })
    gap *= 1.09
  }
}

export function playZap() {
  const ac = audio()
  if (ac) tone(ac, { freq: 1800, to: 180, dur: 0.28, type: 'sawtooth', peak: 0.07 })
}

export function playWin(big) {
  const ac = audio()
  if (!ac) return
  const notes = big ? [523, 659, 784, 1047, 1319, 1568, 2093, 1568, 2093] : [523, 659, 784, 1047]
  notes.forEach((freq, i) => tone(ac, { freq, at: i * 0.09, dur: 0.22 }))
}

export function playLose() {
  const ac = audio()
  if (ac) tone(ac, { freq: 190, to: 110, dur: 0.3, type: 'sine', peak: 0.12 })
}

// Golpe seco de un rodillo al detenerse.
export function playClunk() {
  const ac = audio()
  if (ac) tone(ac, { freq: 240, to: 90, dur: 0.12, type: 'square', peak: 0.09 })
}

// Toque de la bola de Plinko contra un clavo: más agudo cuanto más abajo.
export function playPeg(row = 0) {
  const ac = audio()
  if (ac) tone(ac, { freq: 1100 + row * 60, dur: 0.035, type: 'sine', peak: 0.035 })
}

// Roce de una carta al caer sobre el tapete.
export function playCard() {
  const ac = audio()
  if (ac) tone(ac, { freq: 2600, to: 700, dur: 0.07, type: 'sawtooth', peak: 0.03 })
}

// Aviso de turno: dos notas claras, para que se oiga aunque mires otra cosa.
export function playTurn() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 880, dur: 0.16, type: 'sine', peak: 0.14 })
  tone(ac, { freq: 1320, at: 0.13, dur: 0.24, type: 'sine', peak: 0.14 })
}

// Despegue del cohete: un silbido que sube.
export function playLaunch() {
  const ac = audio()
  if (ac) tone(ac, { freq: 220, to: 880, dur: 0.6, type: 'sawtooth', peak: 0.05 })
}

// Explosión del cohete: un golpe grave que se apaga.
export function playBoom() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 140, to: 40, dur: 0.5, type: 'sawtooth', peak: 0.14 })
  tone(ac, { freq: 90, to: 30, dur: 0.7, type: 'square', peak: 0.06, at: 0.04 })
}

// Vibración corta en móvil (cae, cobra…). Respeta el interruptor de Sonido.
export function buzz(pattern) {
  if (muted) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // sin vibración en este navegador
  }
}

// Despegue de la rana: un «boing» que sube de tono con cada nenúfar (y gana un tictac grave cuando hay tensión).
export function playHop(mult = 1) {
  const ac = audio()
  if (!ac) return
  const base = 300 + mult * 55
  tone(ac, { freq: base, to: base * 1.8, dur: 0.14, type: 'sine', peak: 0.1 })
  if (mult >= 7) tone(ac, { freq: 70, to: 55, at: 0.02, dur: 0.18, type: 'sine', peak: 0.12 })
}

// Aterrizaje sobre el nenúfar: toquecito, más agudo cuanto más lejos.
export function playLand(mult = 1) {
  const ac = audio()
  if (ac) tone(ac, { freq: 520 + mult * 90, dur: 0.09, type: 'triangle', peak: 0.09 })
}

// Caída al agua: chapuzón (ruido grave que baja) y burbujas.
export function playSplash() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 700, to: 120, dur: 0.35, type: 'sawtooth', peak: 0.06 })
  tone(ac, { freq: 300, to: 600, at: 0.12, dur: 0.07, type: 'sine', peak: 0.07 })
  tone(ac, { freq: 380, to: 760, at: 0.24, dur: 0.07, type: 'sine', peak: 0.06 })
}

// Cobro: monedas que suben tanto más cuanto mayor es el multiplicador.
export function playCash(mult = 1) {
  const ac = audio()
  if (!ac) return
  const n = Math.min(7, 2 + Math.floor(mult / 2))
  for (let i = 0; i < n; i++) tone(ac, { freq: 988 * 2 ** (i / 6), at: i * 0.06, dur: 0.12, type: 'square', peak: 0.04 })
}

// ---- Carrera de coches ----
// Sorteo del circuito: un clic por tarjeta que pasa y una fanfarria corta al elegirlo.
export function playReelTick() {
  const ac = audio()
  if (ac) tone(ac, { freq: 1500, dur: 0.025, type: 'square', peak: 0.035 })
}

export function playReveal() {
  const ac = audio()
  if (!ac) return
  ;[392, 523, 659, 784, 1047].forEach((freq, i) => tone(ac, { freq, at: i * 0.07, dur: i === 4 ? 0.5 : 0.16, type: i === 4 ? 'triangle' : 'square', peak: 0.05 }))
}

// Pitido del semáforo (luz n de 5) y «¡ya!» al apagarse.
export function playBeep(n = 1) {
  const ac = audio()
  if (ac) tone(ac, { freq: 440 + n * 18, dur: 0.22, type: 'square', peak: 0.07 })
}

export function playGo() {
  const ac = audio()
  if (ac) tone(ac, { freq: 880, dur: 0.55, type: 'square', peak: 0.08 })
}

// Un coche pasa rozando: silbido grave que baja (efecto Doppler barato).
export function playPass() {
  const ac = audio()
  if (ac) tone(ac, { freq: 520, to: 150, dur: 0.38, type: 'sawtooth', peak: 0.035 })
}

// Claxon de meta + aplauso (ruido filtrado en ráfagas).
export function playCheer() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 392, dur: 0.5, type: 'square', peak: 0.05 })
  tone(ac, { freq: 494, dur: 0.5, type: 'square', peak: 0.04 })
  try {
    const len = Math.floor(ac.sampleRate * 1.6)
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) {
      const t = i / ac.sampleRate
      data[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(t * 38)) * Math.min(1, t * 8) * Math.exp(-t * 1.6)
    }
    const src = ac.createBufferSource()
    src.buffer = buf
    const filter = ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2400
    const gain = ac.createGain()
    gain.gain.value = 0.22
    src.connect(filter).connect(gain).connect(master)
    src.start()
  } catch {
    // sin ruido en este navegador
  }
}

// Motor continuo: dos osciladores y un filtro; set(tono 0..1, volumen 0..1). Devuelve null si está en silencio.
export function startEngine() {
  const ac = audio()
  if (!ac) return null
  try {
    const out = ac.createGain()
    out.gain.value = 0
    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    const a = ac.createOscillator()
    const b = ac.createOscillator()
    a.type = 'sawtooth'
    b.type = 'square'
    a.frequency.value = 60
    b.frequency.value = 30
    const bg = ac.createGain()
    bg.gain.value = 0.5
    a.connect(filter)
    b.connect(bg).connect(filter)
    filter.connect(out).connect(master)
    a.start()
    b.start()
    let dead = false
    return {
      set(pitch, vol) {
        if (dead) return
        const t = ac.currentTime
        a.frequency.setTargetAtTime(55 + pitch * 190, t, 0.06)
        b.frequency.setTargetAtTime(27 + pitch * 94, t, 0.06)
        filter.frequency.setTargetAtTime(380 + pitch * 1500, t, 0.08)
        out.gain.setTargetAtTime(vol * 0.07, t, 0.12)
      },
      stop() {
        if (dead) return
        dead = true
        try {
          out.gain.setTargetAtTime(0, ac.currentTime, 0.05)
          a.stop(ac.currentTime + 0.3)
          b.stop(ac.currentTime + 0.3)
        } catch {
          // ya parado
        }
      },
    }
  } catch {
    return null
  }
}

// Motor agresivo de la carrera frenética: dientes de sierra desafinados + subgrave, saturación, silbido de turbo y chirrido de
// neumáticos. set(tono 0..1, volumen 0..1, turbo 0..1, chirrido 0..1). Devuelve null si está en silencio.
export function startEngine2() {
  const ac = audio()
  if (!ac) return null
  try {
    const out = ac.createGain()
    out.gain.value = 0
    const shaper = ac.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1
      curve[i] = Math.tanh(x * 3.2)
    }
    shaper.curve = curve
    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 700
    filter.Q.value = 3
    const a = ac.createOscillator()
    const b = ac.createOscillator()
    const c = ac.createOscillator()
    a.type = 'sawtooth'
    b.type = 'sawtooth'
    c.type = 'square'
    const pre = ac.createGain()
    pre.gain.value = 0.35
    const cg = ac.createGain()
    cg.gain.value = 0.6
    a.connect(pre)
    b.connect(pre)
    c.connect(cg).connect(pre)
    pre.connect(shaper).connect(filter).connect(out).connect(master)
    // silbido del turbo
    const whistle = ac.createOscillator()
    whistle.type = 'sine'
    const wg = ac.createGain()
    wg.gain.value = 0
    whistle.connect(wg).connect(master)
    // chirrido: ruido de banda estrecha
    const len = ac.sampleRate
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const noise = ac.createBufferSource()
    noise.buffer = buf
    noise.loop = true
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1700
    bp.Q.value = 7
    const sg = ac.createGain()
    sg.gain.value = 0
    noise.connect(bp).connect(sg).connect(master)
    a.start()
    b.start()
    c.start()
    whistle.start()
    noise.start()
    let dead = false
    return {
      set(pitch, vol, turbo = 0, screech = 0) {
        if (dead) return
        const t = ac.currentTime
        const f = 48 + pitch * 230
        a.frequency.setTargetAtTime(f, t, 0.03)
        b.frequency.setTargetAtTime(f * 1.012, t, 0.03)
        c.frequency.setTargetAtTime(f * 0.5, t, 0.03)
        filter.frequency.setTargetAtTime(420 + pitch * 2300, t, 0.05)
        out.gain.setTargetAtTime(vol * 0.075, t, 0.1)
        whistle.frequency.setTargetAtTime(1900 + turbo * 2600, t, 0.08)
        wg.gain.setTargetAtTime(turbo * vol * 0.018, t, 0.06)
        bp.frequency.setTargetAtTime(1300 + screech * 900 + pitch * 300, t, 0.05)
        sg.gain.setTargetAtTime(screech * vol * 0.05, t, 0.05)
      },
      stop() {
        if (dead) return
        dead = true
        const t = ac.currentTime
        try {
          out.gain.setTargetAtTime(0, t, 0.05)
          wg.gain.setTargetAtTime(0, t, 0.05)
          sg.gain.setTargetAtTime(0, t, 0.05)
          for (const n of [a, b, c, whistle, noise]) n.stop(t + 0.4)
        } catch {
          // ya parado
        }
      },
    }
  } catch {
    return null
  }
}

// Ovación final: la grada rugiendo, con ráfagas de aplausos y un claxon doble.
export function playOvation() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 392, dur: 0.6, type: 'square', peak: 0.05 })
  tone(ac, { freq: 523, dur: 0.6, type: 'square', peak: 0.04 })
  tone(ac, { freq: 659, at: 0.18, dur: 0.7, type: 'square', peak: 0.04 })
  try {
    const dur = 3.2
    const len = Math.floor(ac.sampleRate * dur)
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) {
      const t = i / ac.sampleRate
      const env = Math.min(1, t * 5) * Math.exp(-t * 0.7)
      const clap = 0.55 + 0.45 * Math.sin(t * 46) * Math.sin(t * 17 + 1)
      data[i] = (Math.random() * 2 - 1) * env * clap
    }
    const src = ac.createBufferSource()
    src.buffer = buf
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 0.7
    const gain = ac.createGain()
    gain.gain.value = 0.32
    src.connect(bp).connect(gain).connect(master)
    src.start()
  } catch {
    // sin ruido en este navegador
  }
}

// Aviso de última vuelta: tres pitidos que suben.
export function playLastLap() {
  const ac = audio()
  if (!ac) return
  for (let i = 0; i < 3; i++) tone(ac, { freq: 660 * 2 ** (i / 6), at: i * 0.11, dur: 0.1, type: 'square', peak: 0.06 })
}

// ---- Laberinto ----
// Puerta que se abre: crujido de bisagra (sierra que baja y vuelve a subir).
export function playCreak() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 180, to: 120, dur: 0.25, type: 'sawtooth', peak: 0.035 })
  tone(ac, { freq: 140, to: 260, at: 0.2, dur: 0.3, type: 'sawtooth', peak: 0.03 })
}

// Rugido del monstruo: grave, áspero y que se hunde.
// Latido grave (bum-bum) del presagio de la carta mítica.
export function playHeartbeat() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 70, to: 45, dur: 0.16, type: 'sine', peak: 0.3 })
  tone(ac, { freq: 64, to: 40, at: 0.22, dur: 0.2, type: 'sine', peak: 0.24 })
}

export function playGrowl() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 110, to: 55, dur: 0.6, type: 'sawtooth', peak: 0.12 })
  tone(ac, { freq: 75, to: 40, at: 0.05, dur: 0.7, type: 'square', peak: 0.06 })
}

// Trampa: chasquido metálico y golpe seco.
export function playClank() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 1800, to: 900, dur: 0.08, type: 'square', peak: 0.06 })
  tone(ac, { freq: 160, to: 60, at: 0.06, dur: 0.3, type: 'triangle', peak: 0.14 })
}

// Pasillo vacío: dos pasos que resuenan.
export function playSteps() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 140, to: 90, dur: 0.08, type: 'triangle', peak: 0.1 })
  tone(ac, { freq: 130, to: 85, at: 0.28, dur: 0.08, type: 'triangle', peak: 0.08 })
}

// ---- Sobornos ----
// Sobre que se desliza por la mesa: ráfaga corta de ruido filtrado.
export function playRustle() {
  const ac = audio()
  if (!ac) return
  const len = Math.floor(ac.sampleRate * 0.22)
  const buffer = ac.createBuffer(1, len, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.5
  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const gain = ac.createGain()
  src.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = 3200
  gain.gain.value = 0.12
  src.connect(filter).connect(gain).connect(master)
  src.start()
}

// Sello de «contrato adjudicado»: golpe seco y un tintineo.
export function playStamp() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 190, to: 60, dur: 0.16, type: 'triangle', peak: 0.2 })
  tone(ac, { freq: 1568, at: 0.06, dur: 0.18, type: 'sine', peak: 0.05 })
}

// Largas: dos notas que se hunden («mmm... ya le llamaremos»).
export function playStall() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 330, to: 300, dur: 0.18, type: 'triangle', peak: 0.09 })
  tone(ac, { freq: 262, to: 200, at: 0.2, dur: 0.3, type: 'triangle', peak: 0.09 })
}

// Sirena de policía: tres alternancias rápidas.
export function playSiren() {
  const ac = audio()
  if (!ac) return
  for (let i = 0; i < 4; i++) tone(ac, { freq: i % 2 ? 700 : 960, at: i * 0.17, dur: 0.17, type: 'square', peak: 0.05 })
}

// Caja registradora al blanquear: tic y «ding» doble.
export function playRegister() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 2200, dur: 0.03, type: 'square', peak: 0.04 })
  tone(ac, { freq: 1319, at: 0.07, dur: 0.35, type: 'sine', peak: 0.1 })
  tone(ac, { freq: 1760, at: 0.15, dur: 0.45, type: 'sine', peak: 0.09 })
}

// ---- Ascensor ----
// «Ding» de llegada a una planta: campanita de dos notas, más aguda cuanto más alto.
export function playDing(floor = 0) {
  const ac = audio()
  if (!ac) return
  const base = 660 * 2 ** (Math.min(floor, 16) / 48)
  tone(ac, { freq: base * 1.5, dur: 0.6, type: 'sine', peak: 0.09 })
  tone(ac, { freq: base, at: 0.18, dur: 0.9, type: 'sine', peak: 0.08 })
}

// Puertas que se deslizan: un soplido grave que sube (al abrir) o baja (al cerrar).
export function playDoors(open = true) {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: open ? 90 : 160, to: open ? 160 : 90, dur: 0.4, type: 'sawtooth', peak: 0.018 })
  tone(ac, { freq: 60, dur: 0.12, at: 0.36, type: 'triangle', peak: 0.05 })
}

// El cable que se rompe: chasquido agudo, latigazo y el golpe de la caída.
export function playSnap() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 2600, to: 400, dur: 0.12, type: 'square', peak: 0.07 })
  tone(ac, { freq: 900, to: 60, at: 0.1, dur: 0.9, type: 'sawtooth', peak: 0.06 })
  tone(ac, { freq: 90, to: 30, at: 0.9, dur: 0.6, type: 'triangle', peak: 0.25 })
}

// Ajedrez: la pieza de piedra se arrastra por el tablero.
export function playStone() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 180, to: 120, dur: 0.12, type: 'triangle', peak: 0.12 })
  tone(ac, { freq: 95, to: 70, at: 0.05, dur: 0.16, type: 'sine', peak: 0.1 })
}

// Ajedrez: una pieza revienta en pedazos al ser capturada.
export function playSmash() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 2400, to: 700, dur: 0.07, type: 'square', peak: 0.05 })
  tone(ac, { freq: 1300, to: 400, at: 0.03, dur: 0.12, type: 'sawtooth', peak: 0.05 })
  tone(ac, { freq: 120, to: 38, at: 0.02, dur: 0.55, type: 'sawtooth', peak: 0.14 })
  tone(ac, { freq: 70, to: 30, at: 0.08, dur: 0.6, type: 'square', peak: 0.05 })
}

// ---- Apnea ----
// Una ráfaga de ruido filtrado (aire que entra o sale): sube o baja de tono entre `from` y `to`, con subida y bajada suaves.
function breath(ac, { from, to, dur, peak = 0.14, at = 0 }) {
  const len = Math.floor(ac.sampleRate * dur)
  const buffer = ac.createBuffer(1, len, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const gain = ac.createGain()
  const start = ac.currentTime + at
  src.buffer = buffer
  filter.type = 'bandpass'
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(from, start)
  filter.frequency.exponentialRampToValueAtTime(to, start + dur)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + dur * 0.35)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(filter).connect(gain).connect(master)
  src.start(start)
}

// Burbujas al pasar cada diez metros: unos «blup» que suben.
export function playBubbles() {
  const ac = audio()
  if (!ac) return
  ;[0, 0.09, 0.2, 0.27].forEach((at, i) => tone(ac, { freq: 260 + i * 70, to: 520 + i * 90, at, dur: 0.07, type: 'sine', peak: 0.06 }))
}

// Respirar hondo antes de tirarse: aire que entra, cada vez más agudo.
export function playInhale() {
  const ac = audio()
  if (!ac) return
  breath(ac, { from: 500, to: 2400, dur: 0.7, peak: 0.16 })
}

// La bocanada al salir a la superficie: un aire largo que entra de golpe y un suspiro de alivio que baja.
export function playSurfaceGasp() {
  const ac = audio()
  if (!ac) return
  breath(ac, { from: 700, to: 3000, dur: 0.55, peak: 0.28 })
  breath(ac, { from: 2200, to: 500, dur: 0.8, peak: 0.12, at: 0.6 })
  tone(ac, { freq: 220, to: 330, at: 0.05, dur: 0.4, type: 'sine', peak: 0.04 })
}

// Latido de la apnea cuando falta el aire: seco y corto; con `level` (1 a 3) suena más fuerte y más agudo.
export function playPulse(level = 1) {
  const ac = audio()
  if (!ac) return
  const k = Math.min(3, Math.max(1, level))
  tone(ac, { freq: 62 + k * 8, to: 42, dur: 0.13, type: 'sine', peak: 0.12 + k * 0.07 })
  tone(ac, { freq: 56 + k * 8, to: 38, at: 0.17, dur: 0.15, type: 'sine', peak: 0.09 + k * 0.05 })
}

// Sin aire: un último burbujeo que se apaga.
export function playGasp() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 420, to: 120, dur: 0.5, type: 'sine', peak: 0.09 })
  tone(ac, { freq: 300, to: 90, at: 0.3, dur: 0.6, type: 'triangle', peak: 0.07 })
}

// ---- Regata ----
// Bocina de salida: dos notas graves y largas, como la de un barco.
export function playHorn() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 196, dur: 0.7, type: 'sawtooth', peak: 0.09 })
  tone(ac, { freq: 247, dur: 0.7, type: 'sawtooth', peak: 0.07 })
}

// Trueno: un golpe de ruido grave que rueda y un bajo que se hunde.
export function playThunder() {
  const ac = audio()
  if (!ac) return
  breath(ac, { from: 500, to: 70, dur: 1.5, peak: 0.4 })
  tone(ac, { freq: 70, to: 32, at: 0.05, dur: 1.1, type: 'sine', peak: 0.2 })
}

// Remolino: un silbido que gira (sube y baja varias veces).
export function playWhirl() {
  const ac = audio()
  if (!ac) return
  for (let i = 0; i < 3; i++) {
    tone(ac, { freq: 240, to: 760, at: i * 0.5, dur: 0.25, type: 'sine', peak: 0.06 })
    tone(ac, { freq: 760, to: 240, at: i * 0.5 + 0.25, dur: 0.25, type: 'sine', peak: 0.06 })
  }
}

// El Kraken atrapa un velero: rugido grave y un chapoteo enorme.
export function playKraken() {
  const ac = audio()
  if (!ac) return
  tone(ac, { freq: 90, to: 38, dur: 1.1, type: 'sawtooth', peak: 0.14 })
  tone(ac, { freq: 60, to: 30, at: 0.08, dur: 1.2, type: 'square', peak: 0.06 })
  breath(ac, { from: 900, to: 150, dur: 0.9, peak: 0.2, at: 0.1 })
}

// Foto finish: el clic del obturador y un destello agudo.
export function playShutter() {
  const ac = audio()
  if (!ac) return
  breath(ac, { from: 3000, to: 5000, dur: 0.12, peak: 0.25 })
  tone(ac, { freq: 1500, to: 700, at: 0.08, dur: 0.1, type: 'square', peak: 0.04 })
}

// Un velero se suelta (o pasa al frente): un arpegio corto que sube.
export function playSurge() {
  const ac = audio()
  if (!ac) return
  ;[0, 0.07, 0.14].forEach((at, i) => tone(ac, { freq: 420 * 2 ** (i / 4), at, dur: 0.1, type: 'triangle', peak: 0.06 }))
}

// El sonido de cada clima al abrirse las apuestas.
export function playClima(id) {
  const ac = audio()
  if (!ac) return
  if (id === 'despejado') {
    tone(ac, { freq: 1900, to: 1400, dur: 0.25, type: 'sine', peak: 0.05 })
    tone(ac, { freq: 2100, to: 1500, at: 0.3, dur: 0.3, type: 'sine', peak: 0.045 })
  } else if (id === 'viento') {
    breath(ac, { from: 300, to: 2000, dur: 1.4, peak: 0.28 })
  } else if (id === 'niebla') {
    tone(ac, { freq: 98, to: 92, dur: 1.4, type: 'sawtooth', peak: 0.08 })
    tone(ac, { freq: 123, to: 116, dur: 1.4, type: 'sawtooth', peak: 0.05 })
  } else if (id === 'tormenta') {
    playThunder()
  } else if (id === 'remolino') {
    playWhirl()
  } else if (id === 'kraken') {
    playKraken()
  } else if (id === 'calima') {
    breath(ac, { from: 250, to: 600, dur: 1.6, peak: 0.16 })
    tone(ac, { freq: 82, dur: 1.4, type: 'sine', peak: 0.07 })
  } else if (id === 'arcoiris') {
    ;[523, 659, 784, 1047, 1319].forEach((freq, i) => tone(ac, { freq, at: i * 0.1, dur: 0.35, type: 'triangle', peak: 0.06 }))
  }
}

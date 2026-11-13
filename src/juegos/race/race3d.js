// La Carrera en 3D (three.js). Se carga aparte (import dinámico desde RaceStage.jsx) para no engordar el resto de la app.
//
// mountRace3D(host, P) monta un <canvas> WebGL y la rotulación de TV dentro de `host` y devuelve { destroy }.
// P.current son las mismas props que RaceScene (la escena 2D de reserva): getNow, round, race, seats, bets, mySeat, circuit,
// muted, reduced, onEvent. Las posiciones salen SIEMPRE de raceMotion.computeCars(race, getNow() - salida), es decir, de
// race.progress() con el reloj del servidor: todos ven la misma carrera y la escena nunca decide quién gana. Solo la
// repetición del foto-finish enseña un instante pasado, a cámara lenta, y vuelve al directo.
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DynamicDrawUsage,
  Euler,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CAR_INFO, CARS, CIRCUITS, GRID_MS, ROUND_MS, progress, startOf } from './race.js'
import { LANE_GAP, LAYOUTS, LEN, TRACK_W, WORLD_H, WORLD_W, at, laps, poles, setCircuit, theme, track } from './raceArt.js'
import { DRAG_M, LANE, clamp, computeCars, gridBack, lightsAt, makeState, raceInfo, shownProgress, smooth } from './raceMotion.js'
import { playBeep, playGo, playLastLap, playOvation, playPass, startEngine2 } from '../comun/sound.js'

const TAU = Math.PI * 2
const REPLAY_MS = 2200 // repetición del foto-finish
const START_SHOT_MS = 2600 // plano de la salida
const SHOT_MS = 3400 // cada plano de la carrera
const FINISH_ZONE = 3400 // distancia a la meta (unidades) a la que la cámara se va a la línea
const PODIUM_AFTER = 1600 // tras cruzar el ganador, la cámara de meta sigue este rato y luego rodea al ganador
const GOLD = '#ffd75a'
const CROWD = ['#ff5a5a', '#ffd35a', '#5ad2ff', '#f1e9d6', '#a97bff', '#ffffff', '#ff8a4c', '#7be07b']
const CONFETTI = [...CAR_INFO.map((c) => c.color), GOLD, '#ffffff']

// Cielo, niebla y luces de cada decorado (raceArt: theme.outside).
const LOOKS = {
  city: {
    sky: ['#040816', '#13234a', '#3a2a5e'], fog: '#101a38', fogFar: 9500, hemi: ['#7d93d8', '#120e1c', 0.65],
    sun: ['#a8bcff', 0.5, [-0.5, 1, 0.35]], night: true, stars: true,
  },
  dunes: {
    sky: ['#3a3f86', '#f39456', '#ffd9a0'], fog: '#e9a46e', fogFar: 11000, hemi: ['#ffe0b0', '#6a4424', 0.8],
    sun: ['#ffc785', 1.35, [-1, 0.42, 0.25]], night: false,
  },
  lava: {
    sky: ['#0d0408', '#3d110e', '#9a3518'], fog: '#2c0d0a', fogFar: 8500, hemi: ['#ff9b74', '#1a0808', 0.55],
    sun: ['#ff8a50', 0.8, [0.4, 0.6, -0.8]], night: true, stars: true,
  },
  jungle: {
    sky: ['#3f8fd8', '#a9dcf2', '#fff1c9'], fog: '#b8dccd', fogFar: 10500, hemi: ['#eafff2', '#2f4b22', 0.85],
    sun: ['#fff1d2', 1.25, [-0.6, 1, 0.5]], night: false,
  },
  snow: {
    sky: ['#7aa6d6', '#d6e6f4', '#ffffff'], fog: '#d6e4f0', fogFar: 9000, hemi: ['#ffffff', '#7d8ea0', 0.9],
    sun: ['#ffffff', 1.1, [-0.4, 1, 0.6]], night: false,
  },
}

const CAM_NAME = {
  orbit: 'Vista aérea',
  drone: 'Dron',
  grid: 'Parrilla',
  start: 'Salida',
  chase: 'Persecución',
  side: 'Cámara lateral',
  heli: 'Helicóptero',
  onboard: 'A bordo',
  trackside: 'Pie de pista',
  finish: 'Línea de meta',
  photo: 'Foto-finish',
  podium: 'Ganador',
}
const SEQ = ['chase', 'side', 'heli', 'onboard', 'trackside', 'chase', 'heli', 'side']

const fmtGap = (ms) => `+${(ms / 1000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
const short = (name) => name.slice(0, 3).toUpperCase()

// ---------- utilidades ----------
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}
const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _v = new Vector3()
const _s = new Vector3()
const mat = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone()

// Una pieza de un modelo: la geometría colocada y pintada de un color (por vértice), lista para fundirse con otras.
function part(geo, color, m) {
  let g = geo.index ? geo.toNonIndexed() : geo
  if (m) g.applyMatrix4(m)
  const c = new Color(color)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new BufferAttribute(arr, 3))
  if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2))
  return g
}
const merge = (parts) => mergeGeometries(parts, false)

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 4
  return t
}
const radialTex = (stops) =>
  canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    stops.forEach(([o, c]) => gr.addColorStop(o, c))
    g.fillStyle = gr
    g.fillRect(0, 0, w, w)
  })

function noiseTex(base, speck, amount, size = 128, seed = 7) {
  const R = rng(seed)
  return canvasTex(
    size,
    size,
    (g, w, h) => {
      g.fillStyle = base
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < w * h * amount; i++) {
        g.fillStyle = `rgba(${speck},${0.05 + R() * 0.12})`
        g.fillRect(Math.floor(R() * w), Math.floor(R() * h), 1 + (R() < 0.2 ? 1 : 0), 1)
      }
    },
    true,
  )
}

// Una cinta a lo largo de la pista, de `lat0` a `lat1` (desplazamientos laterales), a la altura `y`.
// `vScale`: unidades de recorrido por repetición de la textura.
function ribbon(lat0, lat1, y, vScale) {
  const pos = []
  const uv = []
  const idx = []
  const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
  if (track.open) {
    const x0 = -3000
    const x1 = track.W + 3000
    const n = Math.ceil((x1 - x0) / 400)
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n
      pos.push(x, y, track.y0 + lat0, x, y, track.y0 + lat1)
      uv.push(0, (x - x0) / vScale, 1, (x - x0) / vScale)
    }
    for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  } else {
    const n = track.M
    for (let i = 0; i <= n; i++) {
      const d = (i / n) * track.L
      at(i / n, lat0, o)
      pos.push(o.x, y, o.y)
      at(i / n, lat1, o)
      pos.push(o.x, y, o.y)
      uv.push(0, d / vScale, 1, d / vScale)
    }
    for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // Que miren hacia arriba aunque la cinta vaya en el otro sentido.
  const nrm = g.attributes.normal
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0)
  return g
}

// Una pared vertical a lo largo de la pista, en `lat`, de `y0` a `y1`.
function wall(lat, y0, y1, vScale) {
  const pos = []
  const uv = []
  const idx = []
  const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
  const pts = []
  if (track.open) {
    const x0 = -3000
    const x1 = track.W + 3000
    const n = Math.ceil((x1 - x0) / 400)
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, track.y0 + lat, ((x1 - x0) * i) / n])
  } else {
    const n = track.M
    for (let i = 0; i <= n; i++) {
      at(i / n, lat, o)
      pts.push([o.x, o.y, (i / n) * track.L])
    }
  }
  pts.forEach(([x, z, d]) => {
    pos.push(x, y0, z, x, y1, z)
    uv.push(d / vScale, 0, d / vScale, 1)
  })
  for (let i = 0; i < pts.length - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// ---------- partículas (humo, polvo, chispas, confeti) ----------
const PART_VS = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vC;
uniform float uScale;
void main() {
  vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const PART_FS = `
varying vec4 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - r));
  #include <colorspace_fragment>
}`
class Fx {
  constructor(n, additive) {
    this.n = n
    this.i = 0
    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.col = new Float32Array(n * 4)
    this.size = new Float32Array(n)
    this.a0 = new Float32Array(n)
    this.life = new Float32Array(n)
    this.max = new Float32Array(n)
    this.grow = new Float32Array(n)
    this.grav = new Float32Array(n)
    this.drag = new Float32Array(n)
    this.live = 0
    const g = new BufferGeometry()
    this.aPos = new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage)
    this.aCol = new BufferAttribute(this.col, 4).setUsage(DynamicDrawUsage)
    this.aSize = new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage)
    g.setAttribute('position', this.aPos)
    g.setAttribute('aColor', this.aCol)
    g.setAttribute('aSize', this.aSize)
    this.mat = new ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: PART_VS,
      fragmentShader: PART_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : undefined,
    })
    this.points = new Points(g, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    this._c = new Color()
  }
  spawn(x, y, z, vx, vy, vz, color, a, size, life, grow = 0, grav = 0, drag = 1) {
    const i = this.i
    this.i = (i + 1) % this.n
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    this._c.set(color)
    this.col[i * 4] = this._c.r
    this.col[i * 4 + 1] = this._c.g
    this.col[i * 4 + 2] = this._c.b
    this.col[i * 4 + 3] = a
    this.a0[i] = a
    this.size[i] = size
    this.life[i] = life
    this.max[i] = life
    this.grow[i] = grow
    this.grav[i] = grav
    this.drag[i] = drag
    this.live = this.n
  }
  update(dt) {
    if (!this.live) return
    let alive = 0
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      if (this.life[i] <= 0) {
        this.size[i] = 0
        this.col[i * 4 + 3] = 0
        continue
      }
      alive++
      const k = Math.pow(this.drag[i], dt)
      this.vel[i * 3] *= k
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt
      this.vel[i * 3 + 2] *= k
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] = Math.max(0.5, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt)
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      this.size[i] += this.grow[i] * dt
      const f = this.life[i] / this.max[i]
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, f * 2.2)
    }
    this.live = alive
    this.aPos.needsUpdate = true
    this.aCol.needsUpdate = true
    this.aSize.needsUpdate = true
  }
  clear() {
    this.life.fill(0)
    this.size.fill(0)
    this.col.fill(0)
    this.live = 0
    this.aCol.needsUpdate = true
    this.aSize.needsUpdate = true
  }
}

// ---------- el coche ----------
function carGeometry(info) {
  const paint = info.color
  const accent = info.accent
  const dark = '#15171c'
  const glass = '#1a2433'
  const body = new BoxGeometry(60, 10, 28, 4, 1, 1)
  // Morro bajo y en cuña: los vértices de arriba bajan hacia delante.
  const p = body.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    if (y > 0 && x > 6) p.setY(i, y - (x - 6) * 0.2)
    if (y < 0) p.setZ(i, p.getZ(i) * 0.94)
  }
  body.computeVertexNormals()
  const cabin = new BoxGeometry(26, 9, 22)
  const c = cabin.attributes.position
  for (let i = 0; i < c.count; i++) {
    if (c.getY(i) > 0) {
      c.setX(i, c.getX(i) * 0.7 - 3)
      c.setZ(i, c.getZ(i) * 0.82)
    }
  }
  cabin.computeVertexNormals()
  return merge([
    part(body, paint, mat(0, 9, 0)),
    part(cabin, glass, mat(-5, 18.5, 0)),
    part(new BoxGeometry(17, 0.8, 5), accent, mat(-6, 23.2, 0)),
    part(new BoxGeometry(18, 0.8, 5), accent, mat(-20, 14.3, 0)),
    part(new BoxGeometry(14, 0.8, 5), accent, mat(14, 12.3, 0, 0, 1, 1, 1, 0, -0.2)),
    part(new BoxGeometry(5, 1.6, 31), dark, mat(-27.5, 23, 0)),
    part(new BoxGeometry(5, 4, 1.4), paint, mat(-27.5, 25, 15.6)),
    part(new BoxGeometry(5, 4, 1.4), paint, mat(-27.5, 25, -15.6)),
    part(new BoxGeometry(3, 8, 1.6), dark, mat(-25, 18, 8)),
    part(new BoxGeometry(3, 8, 1.6), dark, mat(-25, 18, -8)),
    part(new BoxGeometry(6, 1.6, 31), dark, mat(29, 4.2, 0)),
    part(new BoxGeometry(60.4, 2.2, 28.4), dark, mat(0, 4.4, 0)),
  ])
}
function wheelGeometry() {
  return merge([
    part(new CylinderGeometry(7, 7, 6, 12), '#111216', mat(0, 0, 0, 0, 1, 1, 1, Math.PI / 2)),
    part(new CylinderGeometry(4, 4, 6.4, 6), '#9aa3ad', mat(0, 0, 0, 0, 1, 1, 1, Math.PI / 2)),
  ])
}

// Cartel del coche: dorsal con su color (y «TÚ» o una estrella si es tuyo o le apuestas).
function drawTag(g, car, mine, bet) {
  const info = CAR_INFO[car]
  g.clearRect(0, 0, 160, 80)
  const w = mine || bet ? 132 : 64
  const x = (160 - w) / 2
  g.fillStyle = 'rgba(8,12,20,0.82)'
  g.beginPath()
  if (g.roundRect) g.roundRect(x, 8, w, 52, 26)
  else g.rect(x, 8, w, 52)
  g.fill()
  g.fillStyle = info.color
  g.beginPath()
  g.arc(x + 32, 34, 21, 0, TAU)
  g.fill()
  g.fillStyle = '#fff'
  g.font = '800 30px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(car + 1), x + 32, 35)
  if (mine || bet) {
    g.font = '800 24px system-ui, sans-serif'
    g.fillStyle = mine ? '#ffffff' : GOLD
    g.fillText(mine ? 'TÚ' : '★', x + 92, 35)
  }
  // Flechita hacia el coche.
  g.fillStyle = 'rgba(8,12,20,0.82)'
  g.beginPath()
  g.moveTo(80 - 9, 59)
  g.lineTo(80 + 9, 59)
  g.lineTo(80, 72)
  g.fill()
}

// ---------- montaje ----------
export function mountRace3D(host, P) {
  const R0 = rng(1)
  const coarse = window.matchMedia('(pointer: coarse)').matches
  let prCap = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
  const renderer = new WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance', alpha: false })
  renderer.setPixelRatio(prCap)
  renderer.outputColorSpace = SRGBColorSpace
  const canvas = renderer.domElement
  canvas.className = 'r3d__gl'

  // Rotulación (HTML encima del lienzo): torre de posiciones, cámara, semáforo, carteles y ganador.
  const root = document.createElement('div')
  root.className = 'r3d'
  root.innerHTML = `
    <div class="r3d__speed"></div>
    <div class="r3d__vig"></div>
    <div class="r3d__tower"><div class="r3d__lap"></div><div class="r3d__rows"></div></div>
    <div class="r3d__cam"><i></i><span>En directo</span><b></b></div>
    <div class="r3d__lights">${'<i></i>'.repeat(5)}</div>
    <div class="r3d__pop"><b></b><small></small></div>
    <div class="r3d__photo"><b>Foto-finish</b><i></i></div>
    <div class="r3d__win"></div>
    <div class="r3d__lower"><b></b><small></small></div>`
  root.prepend(canvas)
  host.appendChild(root)
  const $ = (s) => root.querySelector(s)
  const elSpeed = $('.r3d__speed')
  const elLap = $('.r3d__lap')
  const elRows = $('.r3d__rows')
  const elCam = $('.r3d__cam b')
  const elLights = [...root.querySelectorAll('.r3d__lights i')]
  const elLightsBox = $('.r3d__lights')
  const elPop = $('.r3d__pop')
  const elPhoto = $('.r3d__photo')
  const elWin = $('.r3d__win')
  const elLower = $('.r3d__lower')
  const rows = CAR_INFO.map((info, car) => {
    const r = document.createElement('div')
    r.className = 'r3d__row'
    r.style.setProperty('--car', info.color)
    r.innerHTML = `<span class="r3d__pos"></span><i></i><span class="r3d__name" data-short="${short(info.name)}">${info.name}</span><span class="r3d__gap"></span>`
    elRows.appendChild(r)
    return { el: r, pos: r.querySelector('.r3d__pos'), gap: r.querySelector('.r3d__gap'), rank: -1, gapText: '', cls: '' }
  })

  const scene = new Scene()
  const camera = new PerspectiveCamera(50, 16 / 9, 2, 60000)
  camera.position.set(0, 400, 800)
  const hemi = new HemisphereLight('#ffffff', '#222222', 0.7)
  const sun = new DirectionalLight('#ffffff', 1)
  const amb = new AmbientLight('#ffffff', 0.12)
  scene.add(hemi, sun, sun.target, amb)

  // Cielo: una esfera con degradado que sigue a la cámara, y estrellas por la noche.
  const skyMat = new ShaderMaterial({
    uniforms: { top: { value: new Color() }, mid: { value: new Color() }, bot: { value: new Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h * 1.6, 0.0, 1.0), 0.7)) : mix(mid, bot, clamp(-h * 6.0, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
    side: BackSide,
    depthWrite: false,
    fog: false,
  })
  const sky = new Mesh(new SphereGeometry(30000, 24, 12), skyMat)
  sky.renderOrder = -10
  scene.add(sky)
  const starGeo = new BufferGeometry()
  {
    const s = []
    for (let i = 0; i < 700; i++) {
      const a = R0() * TAU
      const h = 0.08 + R0() * 0.9
      const r = Math.sqrt(1 - h * h)
      s.push(Math.cos(a) * r * 28000, h * 28000, Math.sin(a) * r * 28000)
    }
    starGeo.setAttribute('position', new BufferAttribute(new Float32Array(s), 3))
  }
  const stars = new Points(starGeo, new PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }))
  stars.renderOrder = -9
  scene.add(stars)

  // ----- recursos compartidos -----
  const disposables = new Set()
  const keep = (x) => (disposables.add(x), x)
  const shadowTex = keep(radialTex([[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]))
  const glowTex = keep(radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]))
  const wheelGeo = keep(wheelGeometry())
  const planeGeo = keep(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
  const shadowMat = keep(new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }))
  const lightMat = keep(new MeshBasicMaterial({ color: '#fff4d6' }))
  const headGeo = keep(merge([part(new BoxGeometry(1.2, 2.6, 6), '#ffffff', mat(30.2, 8.6, 9)), part(new BoxGeometry(1.2, 2.6, 6), '#ffffff', mat(30.2, 8.6, -9))]))
  const tailGeo = keep(merge([part(new BoxGeometry(1.2, 2.4, 8), '#ffffff', mat(-30.2, 11, 8.5)), part(new BoxGeometry(1.2, 2.4, 8), '#ffffff', mat(-30.2, 11, -8.5))]))
  const beamTex = keep(
    canvasTex(64, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0)
      gr.addColorStop(0, 'rgba(255,240,200,0.55)')
      gr.addColorStop(1, 'rgba(255,240,200,0)')
      g.fillStyle = gr
      g.beginPath()
      g.moveTo(w * 0.4, h)
      g.lineTo(w * 0.6, h)
      g.lineTo(w, 0)
      g.lineTo(0, 0)
      g.fill()
    }),
  )

  // ----- los coches -----
  const cars = CAR_INFO.map((info, car) => {
    const g = new Group()
    g.rotation.order = 'YXZ'
    const body = new Group()
    g.add(body)
    const geo = keep(carGeometry(info))
    const paintMat = keep(new MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: new Color('#555555') }))
    body.add(new Mesh(geo, paintMat))
    const wheels = []
    for (const [x, z] of [
      [19, 14.6],
      [19, -14.6],
      [-19, 14.6],
      [-19, -14.6],
    ]) {
      const w = new Mesh(wheelGeo, keep(new MeshLambertMaterial({ vertexColors: true })))
      w.position.set(x, 7, z)
      w.rotation.order = 'YXZ'
      body.add(w)
      wheels.push(w)
    }
    body.add(new Mesh(headGeo, lightMat))
    const tailMat = keep(new MeshBasicMaterial({ color: '#5a0a0a' }))
    body.add(new Mesh(tailGeo, tailMat))
    const beam = new Mesh(keep(new PlaneGeometry(70, 150).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).translate(105, 0.8, 0)), keep(new MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.6 })))
    g.add(beam)
    const shadow = new Mesh(planeGeo, shadowMat)
    shadow.scale.set(84, 1, 48)
    shadow.position.y = 0.6
    shadow.renderOrder = 1
    g.add(shadow)
    const glow = new Mesh(planeGeo, keep(new MeshBasicMaterial({ map: glowTex, color: info.color, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.7 })))
    glow.scale.set(110, 1, 70)
    glow.position.y = 0.8
    glow.renderOrder = 2
    g.add(glow)
    const tagCanvas = document.createElement('canvas')
    tagCanvas.width = 160
    tagCanvas.height = 80
    const tagTex = keep(new CanvasTexture(tagCanvas))
    tagTex.colorSpace = SRGBColorSpace
    const tag = new Sprite(keep(new SpriteMaterial({ map: tagTex, sizeAttenuation: false, depthTest: false, transparent: true })))
    tag.center.set(0.5, 0)
    tag.position.y = 34
    tag.renderOrder = 20
    g.add(tag)
    scene.add(g)
    return { g, body, wheels, tailMat, beam, glow, tag, tagCanvas, tagTex, tagKey: '', spin: 0 }
  })

  // Semáforo de la salida (pórtico con cinco luces) y bandera de meta: se colocan al construir el circuito.
  const gantry = new Group()
  const lightOff = keep(new MeshBasicMaterial({ color: '#2a0606' }))
  const lightOn = keep(new MeshBasicMaterial({ color: '#ff2a1a' }))
  const lamps = []
  {
    const dark = keep(new MeshLambertMaterial({ color: '#1d2129' }))
    const beam = new Mesh(keep(new BoxGeometry(14, 22, TRACK_W + 60)), dark)
    beam.position.y = 120
    gantry.add(beam)
    for (const z of [-(TRACK_W / 2 + 30), TRACK_W / 2 + 30]) {
      const post = new Mesh(keep(new BoxGeometry(10, 120, 10)), dark)
      post.position.set(0, 60, z)
      gantry.add(post)
    }
    const ball = keep(new SphereGeometry(7, 12, 8))
    for (let k = 0; k < 5; k++) {
      const m = new Mesh(ball, lightOff)
      m.position.set(-8, 120, (k - 2) * 26)
      gantry.add(m)
      const halo = new Sprite(keep(new SpriteMaterial({ map: glowTex, color: '#ff3020', transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 })))
      halo.scale.set(70, 70, 1)
      halo.position.set(-12, 120, (k - 2) * 26)
      gantry.add(halo)
      lamps.push({ m, halo })
    }
  }
  scene.add(gantry)

  const smoke = new Fx(coarse ? 420 : 700, false)
  const sparks = new Fx(coarse ? 260 : 420, true)
  const confetti = new Fx(coarse ? 260 : 420, false)
  scene.add(smoke.points, sparks.points, confetti.points)

  // ----- el circuito (se reconstruye al cambiar) -----
  let world = null
  let worldGeos = []
  let built = -1
  let look = LOOKS.city
  let finishU = 0
  const fin = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
  const embers = { on: false }

  function buildWorld(i) {
    if (world) {
      scene.remove(world)
      worldGeos.forEach((x) => x.dispose())
      worldGeos = []
    }
    setCircuit(i)
    built = i
    const own = (x) => (worldGeos.push(x), x)
    const T = theme
    look = LOOKS[T.outside] || LOOKS.city
    const R = rng(1000 + i * 7919)
    const W = WORLD_W
    const H = WORLD_H
    const open = !!track.open
    world = new Group()
    const add = (m) => (world.add(m), m)

    // Cielo, niebla y luces.
    skyMat.uniforms.top.value.set(look.sky[0])
    skyMat.uniforms.mid.value.set(look.sky[1])
    skyMat.uniforms.bot.value.set(look.fog)
    scene.fog = new Fog(look.fog, 900, look.fogFar)
    hemi.color.set(look.hemi[0])
    hemi.groundColor.set(look.hemi[1])
    hemi.intensity = look.hemi[2] * Math.PI * 0.6
    sun.color.set(look.sun[0])
    sun.intensity = look.sun[1] * Math.PI * 0.55
    sun.position.set(...look.sun[2]).multiplyScalar(1000)
    stars.visible = !!look.stars
    embers.on = T.outside === 'lava'
    cars.forEach((c) => {
      c.glow.visible = look.night
      c.beam.visible = look.night
    })

    // Suelo.
    const groundTex = own(noiseTex(T.ground[0], T.speck, 0.5, 128, 11 + i))
    const gw = open ? W + 12000 : W + 16000
    const gh = open ? 16000 : H + 16000
    groundTex.repeat.set(gw / 260, gh / 260)
    const ground = add(new Mesh(own(new PlaneGeometry(gw, gh).rotateX(-Math.PI / 2)), own(new MeshLambertMaterial({ map: groundTex }))))
    ground.position.set(open ? W / 2 : W / 2, 0, open ? track.y0 : H / 2)

    // Escapatoria, asfalto, bordillos, líneas y valla.
    const runoff = add(new Mesh(own(ribbon(-(TRACK_W / 2 + 44), TRACK_W / 2 + 44, 0.4, 400)), own(new MeshLambertMaterial({ color: T.runoff }))))
    runoff.renderOrder = 0
    const asphalt = own(
      canvasTex(
        256,
        256,
        (g, w, h) => {
          g.fillStyle = T.asphalt
          g.fillRect(0, 0, w, h)
          const r = rng(5)
          for (let k = 0; k < 9000; k++) {
            const v = r() < 0.5 ? 255 : 0
            g.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.06})`
            g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1)
          }
          // Huellas de goma por el centro de la trazada.
          const gr = g.createLinearGradient(0, 0, w, 0)
          gr.addColorStop(0.25, 'rgba(0,0,0,0)')
          gr.addColorStop(0.5, 'rgba(0,0,0,0.18)')
          gr.addColorStop(0.75, 'rgba(0,0,0,0)')
          g.fillStyle = gr
          g.fillRect(0, 0, w, h)
          // Líneas blancas de los bordes.
          g.fillStyle = 'rgba(245,245,240,0.9)'
          g.fillRect(4, 0, 5, h)
          g.fillRect(w - 9, 0, 5, h)
          if (open) {
            // Rectas de aceleración: carriles separados por líneas discontinuas.
            for (let l = 1; l < 6; l++) {
              const x = w * (0.5 + ((l - 3) * LANE_GAP) / TRACK_W)
              g.fillStyle = 'rgba(245,245,240,0.55)'
              g.fillRect(x - 1.5, 0, 3, h / 2)
            }
          }
        },
        true,
      ),
    )
    add(
      new Mesh(
        own(ribbon(-TRACK_W / 2, TRACK_W / 2, 0.8, 520)),
        own(new MeshPhongMaterial({ map: asphalt, shininess: T.wet ? 60 : 8, specular: new Color(T.wet ? '#3a4250' : '#111111') })),
      ),
    )
    const kerbTex = own(
      canvasTex(
        16,
        64,
        (g, w, h) => {
          g.fillStyle = T.kerb[0]
          g.fillRect(0, 0, w, h / 2)
          g.fillStyle = T.kerb[1]
          g.fillRect(0, h / 2, w, h / 2)
        },
        true,
      ),
    )
    const kerbMat = own(new MeshLambertMaterial({ map: kerbTex }))
    add(new Mesh(own(ribbon(-(TRACK_W / 2 + 14), -TRACK_W / 2 + 1, 1.0, 56)), kerbMat))
    add(new Mesh(own(ribbon(TRACK_W / 2 - 1, TRACK_W / 2 + 14, 1.0, 56)), kerbMat))
    // Valla: neón de noche, guardarraíl de día.
    const neon = `rgb(${look.night ? T.neon : '230,232,236'})`
    const fenceMat = look.night
      ? own(new MeshBasicMaterial({ color: new Color(neon), side: 2 }))
      : own(new MeshLambertMaterial({ map: own(canvasTex(64, 8, (g, w, h) => ((g.fillStyle = '#e8eaee'), g.fillRect(0, 0, w, h), (g.fillStyle = T.kerb[0]), g.fillRect(0, 0, w / 2, h)), true)), side: 2 }))
    for (const s of [-1, 1]) {
      add(new Mesh(own(wall(s * (TRACK_W / 2 + 40), 0, look.night ? 6 : 12, 64)), fenceMat))
      if (look.night) {
        const glowRib = add(
          new Mesh(
            own(ribbon(s * (TRACK_W / 2 + 18), s * (TRACK_W / 2 + 70), 0.9, 4000)),
            own(
              new MeshBasicMaterial({
                map: own(
                  canvasTex(64, 4, (g, w, h) => {
                    // De dentro (0) a fuera (1); la valla queda en 0,42.
                    const gr = g.createLinearGradient(0, 0, w, 0)
                    gr.addColorStop(0, `rgba(${T.neon},0)`)
                    gr.addColorStop(0.42, `rgba(${T.neon},0.6)`)
                    gr.addColorStop(1, `rgba(${T.neon},0)`)
                    g.fillStyle = gr
                    g.fillRect(0, 0, w, h)
                  }),
                ),
                transparent: true,
                depthWrite: false,
                blending: AdditiveBlending,
              }),
            ),
          ),
        )
        glowRib.renderOrder = 1
      }
    }

    // Línea de salida/meta (cuadros) y casillas de la parrilla.
    const checker = own(
      canvasTex(
        16,
        128,
        (g, w, h) => {
          // Dos cuadros a lo largo de la pista y dieciséis de lado a lado.
          g.fillStyle = '#f6f6f1'
          g.fillRect(0, 0, w, h)
          g.fillStyle = '#0c0f13'
          for (let r = 0; r < 16; r++) for (let c = 0; c < 2; c++) if ((r + c) % 2 === 0) g.fillRect(c * 8, r * 8, 8, 8)
        },
        false,
      ),
    )
    const lineMat = own(new MeshBasicMaterial({ map: checker }))
    const lineAt = (u, wide) => {
      const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
      at(u, 0, o)
      const m = add(new Mesh(planeGeo, lineMat))
      m.scale.set(wide, 1, TRACK_W)
      m.position.set(o.x, 1.3, o.y)
      m.rotation.y = -Math.atan2(o.ty, o.tx)
      return o
    }
    finishU = open ? 1 : 0
    lineAt(0, 22)
    if (open) lineAt(1, 26)
    at(finishU, 0, fin)
    const gridMat = own(new MeshBasicMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.85 }))
    for (let c = 0; c < CARS; c++) {
      const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
      const lat = open ? (LANE[c] - 2.5) * LANE_GAP : c & 1 ? 26 : -26
      at(-gridBack(c) / LEN + 4 / LEN, lat, o)
      const m = add(new Mesh(planeGeo, gridMat))
      m.scale.set(3, 1, 30)
      m.position.set(o.x + o.tx * 30, 1.2, o.y + o.ty * 30)
      m.rotation.y = -Math.atan2(o.ty, o.tx)
    }
    // Pórtico del semáforo sobre la salida.
    {
      const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
      at(40 / LEN, 0, o)
      gantry.position.set(o.x, 0, o.y)
      gantry.rotation.y = -Math.atan2(o.ty, o.tx)
    }
    // Arco de meta en las rectas de aceleración.
    if (open) {
      const arch = new Group()
      const archMat = own(new MeshLambertMaterial({ color: '#20242c' }))
      for (const z of [-(TRACK_W / 2 + 30), TRACK_W / 2 + 30]) {
        const post = new Mesh(own(new BoxGeometry(12, 140, 12)), archMat)
        post.position.set(0, 70, z)
        arch.add(post)
      }
      const banner = new Mesh(own(new BoxGeometry(6, 30, TRACK_W + 72)), own(new MeshBasicMaterial({ map: checker })))
      banner.position.y = 132
      arch.add(banner)
      arch.position.set(fin.x, 0, fin.y)
      add(arch)
    }

    // ----- decorado -----
    // ¿Está (x, z) lejos de la pista? Distancia a la línea central.
    const distTo = (x, z) => {
      if (open) return Math.abs(z - track.y0)
      let best = 1e9
      const { M, px, py } = track
      for (let k = 0; k < M; k += 3) {
        const d = (px[k] - x) ** 2 + (py[k] - z) ** 2
        if (d < best) best = d
      }
      return Math.sqrt(best)
    }
    const inside = (x, z) => {
      if (open) return false
      const { M, px, py } = track
      let c = false
      for (let a = 0, b = M - 1; a < M; b = a++) {
        if (py[a] > z !== py[b] > z && x < ((px[b] - px[a]) * (z - py[a])) / (py[b] - py[a] || 1e-9) + px[a]) c = !c
      }
      return c
    }
    const lake = LAYOUTS[i].lake
    const inLake = (x, z) => lake && ((x - lake[0]) / (lake[2] + 60)) ** 2 + ((z - lake[1]) / (lake[3] + 60)) ** 2 < 1
    // Puntos al azar en una zona, lejos de la pista (min) y opcionalmente cerca (max).
    const scatter = (n, x0, x1, z0, z1, min, max = Infinity, where = null) => {
      const out = []
      for (let k = 0; k < n * 6 && out.length < n; k++) {
        const x = x0 + R() * (x1 - x0)
        const z = z0 + R() * (z1 - z0)
        const d = distTo(x, z)
        if (d < min || d > max || inLake(x, z)) continue
        if (where === 'in' && !inside(x, z)) continue
        if (where === 'out' && inside(x, z)) continue
        out.push([x, z])
      }
      return out
    }
    const instanced = (geo, material, list, f) => {
      if (!list.length) return null
      const im = new InstancedMesh(own(geo), material, list.length)
      list.forEach((p, k) => im.setMatrixAt(k, f(p, k)))
      im.instanceMatrix.needsUpdate = true
      return add(im)
    }
    const lambertV = own(new MeshLambertMaterial({ vertexColors: true }))
    const [leaf, leafDark] = T.leaf

    // Palmeras, pinos y árboles redondos (una geometría fundida por especie).
    const palmGeo = () =>
      merge([
        part(new CylinderGeometry(2.6, 4.2, 90, 5), '#8a6a45', mat(4, 45, 0, 0, 1, 1, 1, 0, -0.1)),
        ...[0, 1, 2, 3, 4, 5].map((k) => part(new ConeGeometry(9, 52, 4), k & 1 ? leaf : leafDark, mat(9 + Math.cos((k / 6) * TAU) * 20, 86, Math.sin((k / 6) * TAU) * 20, -(k / 6) * TAU, 1, 1, 0.35, 0, -1.95))),
      ])
    const pineGeo = () =>
      merge([
        part(new CylinderGeometry(3, 4, 22, 5), '#5a4030', mat(0, 11, 0)),
        part(new ConeGeometry(30, 50, 7), leafDark, mat(0, 42, 0)),
        part(new ConeGeometry(22, 40, 7), leaf, mat(0, 66, 0)),
      ])
    const roundGeo = () =>
      merge([
        part(new CylinderGeometry(3, 4.5, 26, 5), '#5f4630', mat(0, 13, 0)),
        part(new DodecahedronGeometry(26, 0), leaf, mat(0, 42, 0)),
        part(new DodecahedronGeometry(18, 0), leafDark, mat(10, 54, 6)),
      ])
    const treeMatrix = ([x, z]) => {
      const s = 0.75 + R() * 0.6
      return mat(x, 0, z, R() * TAU, s, s * (0.85 + R() * 0.3), s)
    }
    const species = T.trees === 'pine' ? pineGeo : T.trees === 'round' ? roundGeo : palmGeo

    // Farolas y charcos de luz.
    {
      const poleGeo = merge([
        part(new CylinderGeometry(1.6, 2.4, 110, 5), '#3a3f48', mat(0, 55, 0)),
        part(new BoxGeometry(34, 2.4, 3), '#3a3f48', mat(-15, 108, 0)),
      ])
      const headMat = own(new MeshBasicMaterial({ color: new Color(`rgb(${T.lamp})`) }))
      // El brazo de cada farola apunta a la pista.
      const list = poles.map((p) => ({ x: p.x, z: p.y, dx: p.side * p.ty, dz: -p.side * p.tx }))
      instanced(poleGeo, lambertV, list, (p) => mat(p.x, 0, p.z, Math.atan2(p.dz, -p.dx)))
      instanced(new BoxGeometry(12, 3, 6), headMat, list, (p) => mat(p.x + p.dx * 30, 106, p.z + p.dz * 30, Math.atan2(p.dz, -p.dx)))
      if (look.night) {
        const poolMat = own(new MeshBasicMaterial({ map: glowTex, color: new Color(`rgb(${T.lamp})`), transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending }))
        const pool = instanced(planeGeo.clone(), poolMat, list, (p) => mat(p.x + p.dx * 60, 1.6, p.z + p.dz * 60, 0, 200, 1, 200))
        if (pool) pool.renderOrder = 2
      }
    }

    // Lago (o mar en la avenida de la playa).
    const waterMat = own(
      new MeshPhongMaterial({
        color: T.water[0],
        emissive: new Color(T.water[1]).multiplyScalar(look.night ? 0.35 : 0.1),
        shininess: 120,
        specular: new Color('#9fdfff'),
        transparent: true,
        opacity: 0.92,
      }),
    )
    if (lake) {
      const m = add(new Mesh(own(new CircleGeometry(1, 40).rotateX(-Math.PI / 2)), waterMat))
      m.scale.set(lake[2], 1, lake[3])
      m.position.set(lake[0], 0.7, lake[1])
      m.rotation.y = -lake[4]
      const rim = add(new Mesh(own(new CircleGeometry(1, 40).rotateX(-Math.PI / 2)), own(new MeshLambertMaterial({ color: new Color(T.ground[0]).lerp(new Color('#e8d7a8'), 0.45) }))))
      rim.scale.set(lake[2] + 26, 1, lake[3] + 22)
      rim.position.set(lake[0], 0.5, lake[1])
      rim.rotation.y = -lake[4]
      instanced(palmGeo(), lambertV, Array.from({ length: 9 }, (_, k) => [lake[0] + Math.cos((k / 9) * TAU) * (lake[2] + 50), lake[1] + Math.sin((k / 9) * TAU) * (lake[3] + 40)]), treeMatrix)
    }

    // Gradas con público (fuera de la recta de meta) y carpas de boxes (dentro).
    const crowd = []
    const stands = []
    {
      const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }
      const side = open ? -1 : 1
      const from = open ? finishU - 1600 / LEN : -0.045
      const to = open ? finishU + 700 / LEN : 0.05
      const step = 130 / LEN
      for (let u = from; u < to; u += step) {
        at(u, side * (TRACK_W / 2 + 120), o)
        stands.push([o.x, o.y, -Math.atan2(o.ty, o.tx), o.tx, o.ty])
      }
      const standGeo = merge([
        part(new BoxGeometry(128, 14, 60), '#59606c', mat(0, 7, 0)),
        part(new BoxGeometry(128, 14, 40), '#4b525d', mat(0, 21, side * 10)),
        part(new BoxGeometry(128, 14, 20), '#3f4550', mat(0, 35, side * 20)),
        part(new BoxGeometry(128, 3, 70), '#d8d8d8', mat(0, 70, side * 6)),
        part(new BoxGeometry(3, 36, 3), '#9aa0a8', mat(-60, 52, side * 30)),
        part(new BoxGeometry(3, 36, 3), '#9aa0a8', mat(60, 52, side * 30)),
      ])
      instanced(standGeo, lambertV, stands, ([x, z, ry]) => mat(x, 0, z, ry))
      const cr = rng(77 + i)
      stands.forEach(([x, z, ry, tx, ty]) => {
        const nx = -ty * side
        const nz = tx * side
        for (let row = 0; row < 3; row++) {
          for (let k = 0; k < 11; k++) {
            if (cr() < 0.12) continue
            const along = -56 + k * 11 + (cr() - 0.5) * 3
            const back = -20 + row * 20
            crowd.push({ x: x + tx * along + nx * back, z: z + ty * along + nz * back, y: 17 + row * 14, ry, c: CROWD[Math.floor(cr() * CROWD.length)], ph: cr() * TAU })
          }
        }
      })
    }
    const crowdMesh = crowd.length ? add(new InstancedMesh(own(new BoxGeometry(6, 9, 5)), own(new MeshLambertMaterial()), crowd.length)) : null
    if (crowdMesh) {
      crowd.forEach((p, k) => {
        crowdMesh.setMatrixAt(k, mat(p.x, p.y, p.z, p.ry))
        crowdMesh.setColorAt(k, new Color(p.c))
      })
      crowdMesh.instanceMatrix.setUsage(DynamicDrawUsage)
    }

    // Lo de fuera según el tema.
    const outside = T.outside
    const cx = open ? W / 2 : W / 2
    const cz = open ? track.y0 : H / 2
    if (outside === 'city') {
      const winTex = own(
        canvasTex(64, 128, (g, w, h) => {
          g.fillStyle = '#1b2230'
          g.fillRect(0, 0, w, h)
          const r = rng(31)
          for (let y = 4; y < h - 4; y += 8) {
            for (let x = 4; x < w - 4; x += 8) {
              const lit = r() < (look.night ? 0.45 : 0.15)
              g.fillStyle = lit ? (r() < 0.3 ? '#ffd9a0' : '#cfe6ff') : '#0c1018'
              g.fillRect(x, y, 5, 5)
            }
          }
        }),
      )
      const bMat = own(new MeshLambertMaterial({ map: winTex, emissiveMap: winTex, emissive: new Color(look.night ? '#ffffff' : '#000000'), emissiveIntensity: 0.9 }))
      let list
      if (open) {
        list = []
        for (let x = -2500; x < W + 2500; x += 170 + R() * 120) list.push([x, track.y0 - (TRACK_W / 2 + 330 + R() * 250)])
        for (let x = -2500; x < W + 2500; x += 230 + R() * 140) list.push([x, track.y0 - (TRACK_W / 2 + 720 + R() * 300)])
      } else list = scatter(150, -1400, W + 1400, -1400, H + 1400, TRACK_W / 2 + 280, Infinity, 'out')
      instanced(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), bMat, list, ([x, z]) => {
        const far = open ? 1 : Math.min(1.8, 0.7 + distTo(x, z) / 900)
        const h = (120 + R() * 380) * far
        return mat(x, 0, z, R() * 0.3, 90 + R() * 90, h, 90 + R() * 90)
      })
      if (open) {
        // La playa: arena, paseo con palmeras y el mar.
        const sandMat = own(new MeshLambertMaterial({ color: '#d9c08a' }))
        const sand = add(new Mesh(own(new PlaneGeometry(W + 12000, 900).rotateX(-Math.PI / 2)), sandMat))
        sand.position.set(W / 2, 0.3, track.y0 + TRACK_W / 2 + 560)
        const sea = add(new Mesh(own(new PlaneGeometry(W + 30000, 14000).rotateX(-Math.PI / 2)), waterMat))
        sea.position.set(W / 2, 0.6, track.y0 + TRACK_W / 2 + 1000 + 7000)
        const promenade = []
        for (let x = -2500; x < W + 2500; x += 210) promenade.push([x + R() * 40, track.y0 + TRACK_W / 2 + 120 + R() * 30])
        for (let x = -2500; x < W + 2500; x += 330) promenade.push([x + R() * 80, track.y0 - (TRACK_W / 2 + 150 + R() * 40)])
        instanced(palmGeo(), lambertV, promenade, treeMatrix)
      } else {
        instanced(species(), lambertV, scatter(70, 0, W, 0, H, TRACK_W / 2 + 90, 520, 'in'), treeMatrix)
        // Mar al sur del paseo marítimo.
        const sea = add(new Mesh(own(new PlaneGeometry(40000, 14000).rotateX(-Math.PI / 2)), waterMat))
        sea.position.set(W / 2, 0.6, H + 1500 + 7000)
        instanced(palmGeo(), lambertV, Array.from({ length: 40 }, (_, k) => [-1600 + k * 150 + R() * 40, H + 1380 + R() * 40]), treeMatrix)
      }
    } else if (outside === 'dunes') {
      const duneMat = own(new MeshLambertMaterial({ color: new Color(T.ground[0]).lerp(new Color('#f0c27a'), 0.55) }))
      const list = open ? [] : scatter(60, -3000, W + 3000, -3000, H + 3000, TRACK_W / 2 + 500, Infinity, 'out')
      if (open) for (let x = -3000; x < W + 3000; x += 500 + R() * 400) list.push([x, track.y0 + (R() < 0.5 ? -1 : 1) * (TRACK_W / 2 + 700 + R() * 1400)])
      instanced(new SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), duneMat, list, ([x, z]) => mat(x, 0, z, R() * TAU, 260 + R() * 420, 50 + R() * 120, 160 + R() * 260))
      const trees = open ? [] : scatter(40, 0, W, 0, H, TRACK_W / 2 + 90, 600, 'in')
      if (open) for (let x = -2000; x < W + 2000; x += 600 + R() * 500) trees.push([x, track.y0 + (R() < 0.5 ? -1 : 1) * (TRACK_W / 2 + 160 + R() * 200)])
      instanced(palmGeo(), lambertV, trees, treeMatrix)
    } else if (outside === 'lava' || outside === 'snow') {
      const snow = outside === 'snow'
      const rockGeo = merge([part(new DodecahedronGeometry(1, 0), snow ? '#e8eef5' : '#2b2224', null)])
      const rocks = open ? [] : scatter(110, -1600, W + 1600, -1600, H + 1600, TRACK_W / 2 + 140, Infinity)
      if (open) for (let x = -2500; x < W + 2500; x += 120 + R() * 200) rocks.push([x, track.y0 + (R() < 0.5 ? -1 : 1) * (TRACK_W / 2 + 160 + R() * 900)])
      instanced(rockGeo, lambertV, rocks, ([x, z]) => {
        const s = 20 + R() * 70
        return mat(x, s * 0.2, z, R() * TAU, s * (1 + R()), s * (0.5 + R() * 0.5), s)
      })
      if (!snow) {
        // Ríos de lava: cintas que serpentean, con brillo.
        const lavaMat = own(new MeshBasicMaterial({ color: '#ff5a14' }))
        const lavaGlow = own(new MeshBasicMaterial({ map: glowTex, color: '#ff6a20', transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.5 }))
        for (let r = 0; r < (open ? 10 : 5); r++) {
          const pts = []
          let x = open ? -1000 + R() * (W + 2000) : R() < 0.5 ? -800 : W + 800
          let z = open ? track.y0 + (R() < 0.5 ? -1 : 1) * (TRACK_W / 2 + 500 + R() * 900) : -800 + R() * (H + 1600)
          let a = R() * TAU
          for (let k = 0; k < 26; k++) {
            pts.push([x, z])
            a += (R() - 0.5) * 0.8
            x += Math.cos(a) * 70
            z += Math.sin(a) * 70
          }
          const pos = []
          const idx = []
          pts.forEach(([px, pz], k) => {
            const [qx, qz] = pts[Math.min(k + 1, pts.length - 1)]
            const [rx, rz] = pts[Math.max(k - 1, 0)]
            let dx = qx - rx
            let dz = qz - rz
            const l = Math.hypot(dx, dz) || 1
            dx /= l
            dz /= l
            const w = 14 + Math.sin(k * 0.7) * 6
            pos.push(px - dz * w, 0.9, pz + dx * w, px + dz * w, 0.9, pz - dx * w)
          })
          for (let k = 0; k < pts.length - 1; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2)
          const g = own(new BufferGeometry())
          g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
          g.setIndex(idx)
          if (pts.every(([px, pz]) => distTo(px, pz) > TRACK_W / 2 + 80)) {
            add(new Mesh(g, lavaMat))
            const gl = instanced(planeGeo.clone(), lavaGlow, pts.filter((_, k) => k % 3 === 0), ([px, pz]) => mat(px, 1.1, pz, 0, 120, 1, 120))
            if (gl) gl.renderOrder = 2
          }
        }
        // El volcán al fondo, con el cráter encendido.
        const vx = open ? W * 0.55 : W / 2
        const vz = open ? track.y0 - 5200 : -3800
        add(new Mesh(own(new ConeGeometry(2600, 2200, 9, 1, true)), own(new MeshLambertMaterial({ color: '#1e1517' })))).position.set(vx, 1100, vz)
        const crater = add(new Sprite(own(new SpriteMaterial({ map: glowTex, color: '#ff5a20', transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.9, fog: false }))))
        crater.scale.set(1400, 900, 1)
        crater.position.set(vx, 2200, vz)
        embers.at = [vx, vz]
      } else instanced(pineGeo(), lambertV, open ? [] : scatter(120, -1200, W + 1200, -1200, H + 1200, TRACK_W / 2 + 100), treeMatrix)
      if (!snow) instanced(roundGeo(), lambertV, open ? [] : scatter(30, 0, W, 0, H, TRACK_W / 2 + 90, 600, 'in'), treeMatrix)
    } else {
      // Selva: muchos árboles y colinas verdes.
      const trees = open ? [] : scatter(240, -1500, W + 1500, -1500, H + 1500, TRACK_W / 2 + 100)
      if (open) for (let x = -2500; x < W + 2500; x += 70 + R() * 90) trees.push([x, track.y0 + (R() < 0.5 ? -1 : 1) * (TRACK_W / 2 + 130 + R() * 700)])
      const half = Math.floor(trees.length / 2)
      instanced(palmGeo(), lambertV, trees.slice(0, half), treeMatrix)
      instanced(roundGeo(), lambertV, trees.slice(half), treeMatrix)
    }
    // Colinas lejanas cerrando el horizonte.
    {
      const hillMat = own(new MeshLambertMaterial({ color: new Color(T.ground[1]).lerp(new Color(look.fog), 0.25) }))
      const list = []
      const rad = open ? 9000 : 6500
      for (let k = 0; k < 26; k++) list.push([cx + Math.cos((k / 26) * TAU) * rad * (open ? 2.2 : 1), cz + Math.sin((k / 26) * TAU) * rad])
      instanced(new SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2), hillMat, list, ([x, z]) => mat(x, 0, z, R() * TAU, 1600 + R() * 1400, 500 + R() * 900, 1300 + R() * 900))
    }

    world.userData.crowd = crowd
    world.userData.crowdMesh = crowdMesh
    scene.add(world)
    smoke.clear()
    sparks.clear()
    confetti.clear()
  }

  // ----- estado -----
  const S = makeState()
  const S2 = makeState()
  const order = [0, 1, 2, 3, 4, 5]
  const keys = new Float64Array(CARS)
  const rank = new Int8Array(CARS)
  const prevRank = new Int8Array(CARS).fill(-1)
  const betOn = new Float64Array(CARS)
  let rinfo = null
  let rinfoFor = null
  let ev = null
  let evRound = null
  let popup = null
  let lastPopup = -1e9
  let lastPass = 0
  let engine = null
  let engineTry = 0
  let hype = 0
  let shot = { key: '', type: '', focus: 0, anchor: null, t0: 0 }
  const camPos = new Vector3(0, 400, 800)
  const camLook = new Vector3()
  const camPosT = new Vector3()
  const camLookT = new Vector3()
  let fov = 50
  let fovT = 50
  let snap = true
  let shake = 0
  let raf = 0
  let last = 0
  let dead = false
  let emaDt = 0.016
  let perfAt = 0
  let lowFx = coarse
  let vw = 1
  let vh = 1
  let hudKey = ''
  let winKey = ''
  let lowerKey = ''
  let towerAt = 0
  const o = { x: 0, y: 0, tx: 1, ty: 0, k: 0 }

  const resize = () => {
    const r = host.getBoundingClientRect()
    vw = Math.max(1, Math.round(r.width))
    vh = Math.max(1, Math.round(r.height))
    renderer.setSize(vw, vh, false)
    camera.aspect = vw / vh
    camera.updateProjectionMatrix()
    root.classList.toggle('is-compact', vw < 560)
    snap = true
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(host)

  const emit = (e) => P.current.onEvent?.(e)
  const pos3 = (i, out, y = 0) => out.set(S.x[i], y, S.y[i])

  // ----- el director: qué plano toca (sale del reloj de la carrera, así que todos ven el mismo) -----
  function direct(ms, msRound, race, info, p) {
    const open = !!track.open
    if (ms < -GRID_MS) {
      const idx = Math.floor(msRound / 7000)
      return { type: idx % 2 ? 'drone' : 'orbit', focus: order[0], key: `b${idx}` }
    }
    if (ms < 0 || !race) return { type: 'grid', focus: order[0], key: 'grid' }
    if (info.photo && ms >= info.t0 && ms < info.t0 + REPLAY_MS && !p.reduced) return { type: 'photo', focus: info.order[0], key: 'photo' }
    if (ms >= info.t0) {
      if (ms < info.t0 + (info.photo ? REPLAY_MS : PODIUM_AFTER)) return { type: 'finish', focus: info.order[0], key: 'fin' }
      return { type: 'podium', focus: info.order[0], key: 'podium' }
    }
    if (ms < START_SHOT_MS) return { type: 'start', focus: order[0], key: 'start' }
    const lead = order[0]
    const left = (1 - shownProgress(race, lead, ms)) * LEN * laps
    if (left < FINISH_ZONE) return { type: 'finish', focus: lead, key: 'fin' }
    const idx = Math.floor((ms - START_SHOT_MS) / SHOT_MS)
    let type = SEQ[(idx + (p.round ?? 0)) % SEQ.length]
    if (open && type === 'heli' && idx % 2) type = 'side'
    let focus = lead
    if (idx % 3 === 2) {
      // Una pelea: el coche que tiene a otro más cerca por delante.
      let best = 1e9
      for (let r = 1; r < 4; r++) {
        const d = keys[order[r - 1]] - keys[order[r]]
        if (d < best) {
          best = d
          focus = order[r]
        }
      }
    } else if (idx % 4 === 3) {
      const mine = p.mySeat != null && p.mySeat >= 0 ? p.mySeat : betOn.indexOf(Math.max(...betOn))
      if (mine >= 0 && betOn[mine] + (p.mySeat === mine ? 1 : 0) > 0) focus = mine
    }
    return { type, focus, key: `r${idx}` }
  }

  // Coloca la cámara (objetivo) según el plano. `el`: ms desde que empezó el plano.
  function aim(sh, ms, msRound, race, info, el) {
    const f = sh.focus
    const tx = Math.cos(S.h[f])
    const tz = Math.sin(S.h[f])
    const fx = S.x[f]
    const fz = S.y[f]
    const spd = S.spd[f]
    let fovWant = 50
    switch (sh.type) {
      case 'orbit': {
        if (track.open) {
          at(-200 / LEN, 0, o)
          const a = msRound / 9000
          camPosT.set(o.x + Math.cos(a) * 620, 210, o.y + Math.sin(a) * 620)
          camLookT.set(o.x + 200, 10, o.y)
        } else {
          const a = msRound / 16000 + 0.6
          camPosT.set(WORLD_W / 2 + Math.cos(a) * 2500, 1500, WORLD_H / 2 + Math.sin(a) * 2000)
          camLookT.set(WORLD_W / 2, 0, WORLD_H / 2)
        }
        fovWant = 48
        break
      }
      case 'drone': {
        if (track.open) {
          const k = (msRound % 7000) / 7000
          at(-0.02 + k * 1.05, 0, o)
          camPosT.set(o.x - 300, 150, o.y - 260)
          camLookT.set(o.x + 900, 0, o.y + 40)
        } else {
          camPosT.set(fx - tx * 330, 200, fz - tz * 330)
          camLookT.set(fx + tx * 260, 0, fz + tz * 260)
        }
        fovWant = 55
        break
      }
      case 'grid': {
        at(300 / LEN, 0, o)
        const k = smooth(clamp((ms + GRID_MS) / GRID_MS, 0, 1))
        camPosT.set(o.x + o.ty * 60, 70 - 30 * k, o.y - o.tx * 60)
        at(-260 / LEN, 0, o)
        camLookT.set(o.x, 30 + 40 * k, o.y)
        fovWant = 46 - 10 * k
        break
      }
      case 'start': {
        at(-520 / LEN, 0, o)
        camPosT.set(o.x - o.ty * 40, 120 + el * 0.04, o.y + o.tx * 40)
        pos3(f, camLookT, 0)
        fovWant = 52
        break
      }
      case 'chase': {
        camPosT.set(fx - tx * 115, 42, fz - tz * 115)
        camLookT.set(fx + tx * 90, 14, fz + tz * 90)
        fovWant = 58 + Math.min(16, spd / 110)
        break
      }
      case 'onboard': {
        camPosT.set(fx - tx * 4, 25, fz - tz * 4)
        camLookT.set(fx + tx * 200, 14, fz + tz * 200)
        fovWant = 72 + Math.min(12, spd / 140)
        break
      }
      case 'side': {
        const s = sh.side ?? 1
        camPosT.set(fx - tz * 200 * s + tx * 40, 36, fz + tx * 200 * s + tz * 40)
        camLookT.set(fx + tx * 30, 10, fz + tz * 30)
        fovWant = 42
        break
      }
      case 'heli': {
        let x = 0
        let z = 0
        for (let r = 0; r < 4; r++) {
          x += S.x[order[r]]
          z += S.y[order[r]]
        }
        x /= 4
        z /= 4
        camPosT.set(x - tx * 260 + tz * 260, 380, z - tz * 260 - tx * 260)
        camLookT.set(x + tx * 60, 0, z + tz * 60)
        fovWant = 46
        break
      }
      case 'trackside': {
        if (!sh.anchor) {
          const side = sh.side ?? 1
          at(S.u[f] + Math.max(spd, 600) * 1.9 / LEN, side * (TRACK_W / 2 + 90), o)
          sh.anchor = [o.x, o.y]
        }
        camPosT.set(sh.anchor[0], 26, sh.anchor[1])
        camLookT.set(fx, 10, fz)
        const d = Math.hypot(fx - sh.anchor[0], fz - sh.anchor[1])
        fovWant = clamp((Math.atan(110 / Math.max(d, 1)) * 2 * 180) / Math.PI, 14, 60)
        break
      }
      case 'finish': {
        // Del lado contrario a las gradas (fuera en los circuitos, dentro en las rectas), que si no tapan la meta.
        at(finishU + 60 / LEN, (track.open ? 1 : -1) * (TRACK_W / 2 + 75), o)
        camPosT.set(o.x, 40, o.y)
        const crossed = ms >= info.t0
        if (crossed) camLookT.set(fin.x, 12, fin.y)
        else camLookT.set(fx, 12, fz)
        const d = crossed ? 240 : Math.hypot(fx - o.x, fz - o.y)
        fovWant = clamp((Math.atan(130 / Math.max(d, 1)) * 2 * 180) / Math.PI, 18, 55)
        break
      }
      case 'photo': {
        at(finishU, (track.open ? 1 : -1) * (TRACK_W / 2 + 75), o)
        camPosT.set(o.x, 26, o.y)
        camLookT.set(fin.x, 10, fin.y)
        fovWant = 26
        break
      }
      case 'podium': {
        const a = el / 2600
        camPosT.set(fx + Math.cos(a) * 120, 42, fz + Math.sin(a) * 120)
        camLookT.set(fx, 14, fz)
        fovWant = 46
        break
      }
    }
    // Pantallas estrechas: más ángulo para que quepa lo mismo a lo ancho.
    if (camera.aspect < 1.2) fovWant = Math.min(90, fovWant * (1 + (1.2 - camera.aspect) * 0.55))
    fovT = fovWant
  }

  // ----- eventos de la carrera: semáforo, salida, meta, última vuelta y adelantamientos -----
  function events(ms, race, info, p, gapMs, nowReal) {
    const live = !!race
    if (!ev) {
      ev = {
        lights: lightsAt(ms),
        started: ms >= 0,
        fin: new Uint8Array(CARS),
        raceSeen: live,
        lastLap: laps < 2 || (live && ms > 0 && shownProgress(race, order[0], ms) * laps >= laps - 1),
      }
      if (race) for (let i = 0; i < CARS; i++) ev.fin[i] = ms >= race.finish[i] ? 1 : 0
      return
    }
    const n = lightsAt(ms)
    if (n !== ev.lights) {
      if (n > ev.lights && gapMs < 1500) {
        emit({ type: 'lights', n })
        if (!p.muted) playBeep(n)
      }
      ev.lights = n
    }
    if (!ev.started && ms >= 0) {
      ev.started = true
      if (live && gapMs < 2500) {
        emit({ type: 'start' })
        if (!p.muted) playGo()
        if (!p.reduced) shake = Math.max(shake, 1)
        showPop('¡Salida!', '', '#58e07c', nowReal)
      }
    }
    if (!race) return
    if (!ev.raceSeen) {
      ev.raceSeen = true
      for (let i = 0; i < CARS; i++) ev.fin[i] = ms >= race.finish[i] ? 1 : 0
    }
    for (let pl = 0; pl < CARS; pl++) {
      const car = info.order[pl]
      if (!ev.fin[car] && ms >= race.finish[car]) {
        ev.fin[car] = 1
        emit({ type: 'finish', car, place: pl })
        if (pl === 0) {
          emit({ type: 'winner', car, photo: info.photo })
          if (!p.muted) playOvation()
          popup = null
          elPop.classList.remove('is-on')
          if (!p.reduced) {
            shake = Math.max(shake, 0.8)
            celebrate(car)
          }
        }
      }
    }
    const leadLaps = ms > 0 ? shownProgress(race, order[0], ms) * laps : 0
    const racing = ms > 300 && ms < info.t0 - 150
    if (racing && !ev.lastLap && laps > 1 && leadLaps >= laps - 1) {
      ev.lastLap = true
      showPop('¡Última vuelta!', '', '#ff5a3c', nowReal)
      if (!p.muted) playLastLap()
    } else if (laps < 2 || leadLaps >= laps - 1) ev.lastLap = true
    // Adelantamientos.
    if (racing && prevRank[0] >= 0) {
      let mover = -1
      let moverRank = 9
      for (let c = 0; c < CARS; c++) {
        if (rank[c] < prevRank[c] && rank[c] < moverRank) {
          mover = c
          moverRank = rank[c]
        }
      }
      if (mover >= 0) {
        const gap = nowReal - lastPopup
        if (moverRank === 0 && gap > 600) showPop('¡Cambio de líder!', `${CAR_INFO[mover].name} toma la cabeza`, CAR_INFO[mover].color, nowReal)
        else if ((moverRank <= 2 || p.mySeat === mover || betOn[mover] > 0) && gap > 1300) showPop('¡Adelantamiento!', `${CAR_INFO[mover].name} sube al ${moverRank + 1}.º`, CAR_INFO[mover].color, nowReal)
        if (moverRank <= 2 && nowReal - lastPass > 1400 && !p.muted) {
          playPass()
          lastPass = nowReal
        }
      }
    }
    for (let c = 0; c < CARS; c++) prevRank[c] = racing ? rank[c] : -1
  }

  function showPop(text, sub, color, nowReal) {
    popup = { text, sub, color, t: nowReal }
    lastPopup = nowReal
    elPop.querySelector('b').textContent = text
    elPop.querySelector('small').textContent = sub
    elPop.style.setProperty('--c', color)
    elPop.classList.remove('is-on')
    void elPop.offsetWidth
    elPop.classList.add('is-on')
  }

  function celebrate(car) {
    const n = lowFx ? 120 : 260
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU
      const r = Math.random() * 140
      confetti.spawn(
        fin.x + Math.cos(a) * r,
        150 + Math.random() * 120,
        fin.y + Math.sin(a) * r,
        (Math.random() - 0.5) * 120,
        40 + Math.random() * 120,
        (Math.random() - 0.5) * 120,
        CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        1,
        7 + Math.random() * 5,
        3 + Math.random() * 2,
        0,
        90,
        0.5,
      )
    }
    if (look.night) {
      for (let b = 0; b < 4; b++) {
        const bx = fin.x + (Math.random() - 0.5) * 900
        const bz = fin.y + (Math.random() - 0.5) * 900
        const by = 500 + Math.random() * 300
        const col = b === 0 ? CAR_INFO[car].color : CONFETTI[Math.floor(Math.random() * CONFETTI.length)]
        for (let k = 0; k < (lowFx ? 30 : 60); k++) {
          const a = Math.random() * TAU
          const e = Math.random() * Math.PI - Math.PI / 2
          const v = 160 + Math.random() * 60
          sparks.spawn(bx, by, bz, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v, Math.sin(a) * Math.cos(e) * v, col, 1, 22, 1.4 + Math.random() * 0.6, -6, 40, 0.6)
        }
      }
    }
  }

  // ----- sonido del motor (el del coche que pilotas o el del líder) -----
  function audio(ms, info, p, nowReal) {
    if (p.muted || document.hidden) {
      if (engine) {
        engine.stop()
        engine = null
      }
      return
    }
    if (!engine && nowReal - engineTry > 1500) {
      engineTry = nowReal
      engine = startEngine2()
    }
    if (!engine) return
    const car = p.mySeat != null && p.mySeat >= 0 ? p.mySeat : order[0]
    const spd = S.spd[car]
    const GEAR = 300
    const g0 = clamp(Math.floor(spd / GEAR), 0, 5)
    const frac = clamp((spd - g0 * GEAR) / GEAR, 0, 1)
    let pitch = clamp(0.28 + 0.5 * frac + 0.035 * g0, 0, 1)
    let vol = ms < -GRID_MS ? 0.3 : ms < 0 ? 0.5 : 0.95
    if (ms < 0 && ms > -1800) pitch = 0.55 + 0.35 * Math.abs(Math.sin(ms / 70)) * ((ms + 1800) / 1800 + 0.3)
    if (ms < -GRID_MS) pitch = 0.18
    if (info) vol *= 1 - smooth(clamp((ms - info.t0 - 1000) / 4000, 0, 1)) * 0.85
    engine.set(pitch, vol, ms > 0 ? S.thr[car] : 0, clamp((S.slip[car] - 3.8) / 2.4, 0, 1))
  }

  // ----- rotulación -----
  function hud(ms, race, info, p, sh, nowReal) {
    // Torre de posiciones (4 veces por segundo los huecos; el orden en cada fotograma).
    const showTower = race && ms > -GRID_MS
    root.classList.toggle('has-tower', !!showTower)
    if (showTower) {
      const updateGaps = nowReal - towerAt > 240
      if (updateGaps) towerAt = nowReal
      const avg = (LEN * laps) / (race.finish.reduce((a, b) => a + b, 0) / CARS)
      for (let r = 0; r < CARS; r++) {
        const c = order[r]
        const row = rows[c]
        if (row.rank !== r) {
          row.rank = r
          row.el.style.transform = `translateY(${r * 100}%)`
          row.pos.textContent = String(r + 1)
        }
        const cls = `${ms >= race.finish[c] ? 'is-in ' : ''}${p.mySeat === c ? 'is-me ' : ''}${betOn[c] > 0 ? 'is-bet ' : ''}${r === 0 ? 'is-lead' : ''}`
        if (cls !== row.cls) {
          row.cls = cls
          row.el.className = `r3d__row ${cls}`
        }
        if (updateGaps) {
          let gap = ''
          if (ms >= race.finish[c]) gap = r === 0 || c === info.order[0] ? '🏁' : fmtGap(race.finish[c] - info.t0)
          else if (ms > 0 && r > 0) gap = fmtGap(((keys[order[0]] - keys[c]) * LEN * laps) / avg / 0.9)
          if (gap !== row.gapText) {
            row.gapText = gap
            row.gap.textContent = gap
          }
        }
      }
      let lap
      if (ms < 0) lap = track.open ? `${DRAG_M} m` : 'Parrilla'
      else if (track.open) lap = `${Math.round(clamp(shownProgress(race, order[0], ms), 0, 1) * DRAG_M)} / ${DRAG_M} m`
      else lap = `Vuelta ${clamp(Math.floor(shownProgress(race, order[0], ms) * laps) + 1, 1, laps)}/${laps}`
      if (ms >= info.t0) lap = 'Final'
      if (elLap.textContent !== lap) elLap.textContent = lap
    }
    // Cámara.
    const camText = CAM_NAME[sh.type] + (['chase', 'onboard', 'side', 'trackside', 'podium'].includes(sh.type) ? ` · ${CAR_INFO[sh.focus].name}` : '')
    if (elCam.textContent !== camText) elCam.textContent = camText
    // Semáforo.
    const n = lightsAt(ms)
    const lightsOn = ms > -GRID_MS && ms < 700
    elLightsBox.classList.toggle('is-on', lightsOn)
    elLightsBox.classList.toggle('is-go', ms >= 0)
    elLights.forEach((el, k) => el.classList.toggle('is-lit', ms < 0 && k < n))
    lamps.forEach((l, k) => {
      const on = ms < 0 && k < n
      l.m.material = on ? lightOn : lightOff
      l.halo.material.opacity = on ? 0.9 : 0
    })
    if (popup && nowReal - popup.t > 1900) {
      popup = null
      elPop.classList.remove('is-on')
    }
    // Foto-finish.
    root.classList.toggle('is-photo', sh.type === 'photo')
    // Ganador y podio.
    const wk = race && ms >= info.t0 && sh.type !== 'photo' ? `${p.round}:${info.order.filter((c) => ms >= race.finish[c]).length}` : ''
    if (wk !== winKey) {
      winKey = wk
      if (!wk) elWin.classList.remove('is-on')
      else {
        const w = info.order[0]
        const podium = info.order
          .slice(0, 3)
          .filter((c) => ms >= race.finish[c])
          .map((c, k) => `<li style="--car:${CAR_INFO[c].color}"><span>${k + 1}.º</span><i></i><b>${CAR_INFO[c].name}</b><small>${k === 0 ? '' : fmtGap(race.finish[c] - info.t0) + ' s'}</small></li>`)
          .join('')
        elWin.style.setProperty('--car', CAR_INFO[w].color)
        elWin.innerHTML = `<p>Gana <b>${CAR_INFO[w].name}</b>${info.photo ? '<small>por foto-finish</small>' : ''}</p><ol>${podium}</ol>`
        elWin.classList.add('is-on')
      }
    }
    // Rótulo del circuito antes de la carrera.
    const lk = !race || ms < -GRID_MS ? `${built}` : ''
    if (lk !== lowerKey) {
      lowerKey = lk
      elLower.classList.toggle('is-on', !!lk)
      if (lk) {
        const c = CIRCUITS[built]
        elLower.style.setProperty('--c', c.color)
        elLower.querySelector('b').textContent = c.name
        elLower.querySelector('small').textContent = c.drag ? `${c.tag}` : `${c.tag} · ${c.laps} vueltas`
      }
    }
  }

  function tags(p) {
    const seat = p.mySeat
    for (let c = 0; c < CARS; c++) {
      const key = `${seat === c ? 1 : 0}${betOn[c] > 0 ? 1 : 0}`
      const car = cars[c]
      if (key !== car.tagKey) {
        car.tagKey = key
        drawTag(car.tagCanvas.getContext('2d'), c, seat === c, betOn[c] > 0)
        car.tagTex.needsUpdate = true
      }
      // Tamaño fijo en píxeles, sea cual sea la distancia.
      const px = vw < 560 ? 34 : 42
      const s = (px / vh) * 2 * Math.tan(((camera.fov * Math.PI) / 180) / 2)
      car.tag.scale.set(s * 2, s, 1)
    }
  }

  // ----- un fotograma -----
  function frame(nowReal) {
    raf = requestAnimationFrame(frame)
    const p = P.current
    const dtReal = last ? (nowReal - last) / 1000 : 0.016
    last = nowReal
    const dt = Math.min(0.05, dtReal)
    const gapMs = dtReal * 1000

    // Rendimiento: si va lento, menos píxeles y menos partículas.
    emaDt += (dt - emaDt) * 0.05
    if (nowReal - perfAt > 2500) {
      perfAt = nowReal
      if (emaDt > 0.026 && prCap > 1) {
        prCap = Math.max(1, prCap - 0.25)
        renderer.setPixelRatio(prCap)
        lowFx = true
      }
    }

    if ((p.circuit ?? 0) !== built) {
      buildWorld(p.circuit ?? 0)
      ev = null
      snap = true
    }
    const now = p.getNow()
    const round = p.round ?? 0
    const race = p.race
    const ms = now - startOf(round)
    const msRound = now - round * ROUND_MS
    if (race && race !== rinfoFor) {
      rinfo = raceInfo(race)
      rinfoFor = race
    }
    const info = race ? rinfo : null
    if (evRound !== round) {
      evRound = round
      ev = null
      prevRank.fill(-1)
      winKey = 'x'
    }

    betOn.fill(0)
    for (const b of p.bets || []) {
      if (!b || !Array.isArray(b.cars)) continue
      b.cars.forEach((c) => {
        if (c >= 0 && c < CARS) betOn[c] += b.amount
      })
    }

    computeCars(S, race, ms)
    for (let i = 0; i < CARS; i++) {
      if (!race || ms < 0) keys[i] = -gridBack(i)
      else keys[i] = ms >= race.finish[i] ? 10 + (1e6 - race.finish[i]) / 1e6 : shownProgress(race, i, ms) * 0.9 + progress(race.finish[i], race.wobble[i], ms) * 0.1
      order[i] = i
    }
    if (!race || ms < 0) {
      // En la vuelta de formación manda quién va delante de verdad.
      for (let i = 0; i < CARS; i++) keys[i] = S.u[i]
    }
    order.sort((a, b) => keys[b] - keys[a])
    for (let r = 0; r < CARS; r++) rank[order[r]] = r

    events(ms, race, info, p, gapMs, nowReal)

    // Plano.
    const want = direct(ms, msRound, race, info, p)
    if (want.key !== shot.key || want.type !== shot.type) {
      shot = { ...want, anchor: null, t0: nowReal, side: Math.floor(msRound / 1000) % 2 ? 1 : -1 }
      snap = true
    } else if (want.focus !== shot.focus && shot.type !== 'trackside') shot.focus = want.focus
    const el = nowReal - shot.t0

    // Repetición: los coches de hace un momento, a cámara lenta.
    let showMs = ms
    if (shot.type === 'photo') {
      showMs = info.t0 - 260 + el * 0.2
      computeCars(S2, race, showMs)
    }
    const SS = shot.type === 'photo' ? S2 : S

    // Coches.
    for (let i = 0; i < CARS; i++) {
      const c = cars[i]
      c.g.position.set(SS.x[i], 0, SS.y[i])
      c.g.rotation.y = -SS.h[i]
      const roll = clamp(SS.k[i] * SS.spd[i] * 0.02, -0.08, 0.08)
      const pitch = clamp((SS.acc[i] / 4000) * 0.06, -0.05, 0.05)
      c.body.rotation.set(-roll, 0, -pitch)
      c.body.position.y = Math.sin(nowReal / 90 + i) * 0.25 * Math.min(1, SS.spd[i] / 400)
      c.spin -= (SS.spd[i] * dt * (shot.type === 'photo' ? 0.2 : 1)) / 7
      for (const w of c.wheels) w.rotation.z = c.spin
      const steer = clamp(SS.k[i] * 30, -0.35, 0.35)
      c.wheels[0].rotation.y = steer
      c.wheels[1].rotation.y = steer
      c.tailMat.color.set(SS.brake[i] > 0.2 || (ms < 0 && ms > -GRID_MS) ? '#ff2a1a' : '#6a0c0c')
      c.tag.visible = !(shot.type === 'onboard' && shot.focus === i) && shot.type !== 'photo'
    }
    tags(p)

    // Humo, polvo y salpicaduras.
    if (!p.reduced && shot.type !== 'photo') {
      const T = theme
      const dusty = T.outside === 'dunes'
      const wet = T.wet
      const rate = lowFx ? 0.5 : 1
      for (let i = 0; i < CARS; i++) {
        const tx = Math.cos(S.h[i])
        const tz = Math.sin(S.h[i])
        const bx = S.x[i] - tx * 30
        const bz = S.y[i] - tz * 30
        const burn = ms < 0 && ms > -1800 ? (ms + 1800) / 1800 : ms >= 0 && ms < 700 ? 1 - ms / 700 : 0
        if (burn > 0 && Math.random() < burn * rate * 0.9) {
          for (const s of [-1, 1]) smoke.spawn(bx - tz * 14 * s, 6, bz + tx * 14 * s, -tx * 30 + (Math.random() - 0.5) * 40, 18 + Math.random() * 20, -tz * 30 + (Math.random() - 0.5) * 40, '#e9e9ee', 0.5, 26, 1.6 + Math.random(), 50, 0, 0.5)
        }
        const spd = S.spd[i]
        if (spd > 350 && Math.random() < rate * clamp(spd / 2400, 0, 0.6) * (dusty ? 1.6 : wet ? 1.1 : 0.5)) {
          const col = dusty ? '#d9b27a' : wet ? '#c9d6e6' : '#9a9aa2'
          smoke.spawn(bx + (Math.random() - 0.5) * 20, 5, bz + (Math.random() - 0.5) * 20, -tx * spd * 0.05, 8 + Math.random() * 10, -tz * spd * 0.05, col, dusty ? 0.45 : 0.3, dusty ? 30 : 20, 0.8 + Math.random() * 0.6, dusty ? 40 : 24, 0, 0.4)
        }
        if (S.slip[i] > 4.5 && Math.random() < rate * 0.5) smoke.spawn(bx, 5, bz, 0, 12, 0, '#d8d8de', 0.35, 22, 1.2, 30, 0, 0.5)
      }
      if (embers.on && embers.at && Math.random() < rate * 0.6) {
        sparks.spawn(embers.at[0] + (Math.random() - 0.5) * 300, 2200, embers.at[1] + (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 60, 80 + Math.random() * 80, (Math.random() - 0.5) * 60, '#ff7a30', 0.9, 40, 4, 0, -4, 0.9)
      }
    }
    smoke.update(dt)
    sparks.update(dt)
    confetti.update(dt)

    // Público: se levanta y bota más cuanto más se acerca el final.
    const racing = race && ms > 0
    const hypeT = race && info && ms >= info.t0 ? Math.max(0, 1 - (ms - info.t0) / 4000) : racing ? 0.2 + 0.6 * clamp(shownProgress(race, order[0], ms), 0, 1) : 0.05
    hype += (hypeT - hype) * (1 - Math.exp(-dt * 2))
    const crowd = world?.userData.crowd
    const cm = world?.userData.crowdMesh
    if (cm && !p.reduced && hype > 0.08 && Math.floor(nowReal / 50) % 2 === 0) {
      for (let k = 0; k < crowd.length; k++) {
        const c = crowd[k]
        const jump = Math.max(0, Math.sin(nowReal / 140 + c.ph)) * 6 * hype
        cm.setMatrixAt(k, _m.compose(_v.set(c.x, c.y + jump, c.z), _q.setFromEuler(_e.set(0, c.ry, 0)), _s.set(1, 1, 1)))
      }
      cm.instanceMatrix.needsUpdate = true
    }

    // Cámara.
    aim(shot, ms, msRound, race, info, el)
    if (snap || dt > 0.2) {
      camPos.copy(camPosT)
      camLook.copy(camLookT)
      fov = fovT
      snap = false
    } else {
      const smoothK = shot.type === 'onboard' ? 18 : shot.type === 'chase' ? 7 : 4
      camPos.lerp(camPosT, 1 - Math.exp(-dt * smoothK))
      camLook.lerp(camLookT, 1 - Math.exp(-dt * (smoothK + 2)))
      fov += (fovT - fov) * (1 - Math.exp(-dt * 3))
    }
    camera.position.copy(camPos)
    // Temblor: en la salida, al llegar y a mucha velocidad en los planos cercanos.
    const fast = shot.type === 'chase' || shot.type === 'onboard' ? clamp((S.spd[shot.focus] - 900) / 900, 0, 1) : 0
    if (!p.reduced) {
      const amp = shake * 4 + fast * 0.8
      if (amp > 0.01) camera.position.add(_v.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp))
    }
    shake *= Math.exp(-dt * 3)
    camera.lookAt(camLook)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    sky.position.copy(camera.position)
    stars.position.copy(camera.position)
    const scale = (vh * renderer.getPixelRatio() * camera.projectionMatrix.elements[5]) / 2
    smoke.mat.uniforms.uScale.value = scale
    sparks.mat.uniforms.uScale.value = scale
    confetti.mat.uniforms.uScale.value = scale

    // Líneas de velocidad (solo en los planos de persecución).
    elSpeed.style.opacity = p.reduced ? '0' : String((fast * 0.8).toFixed(2))

    hud(ms, race, info, p, shot, nowReal)
    audio(ms, info, p, nowReal)
    renderer.render(scene, camera)
  }

  // Pausa con la pestaña oculta: ni se pinta ni suena.
  const onVisibility = () => {
    cancelAnimationFrame(raf)
    if (document.hidden) {
      if (engine) {
        engine.stop()
        engine = null
      }
      return
    }
    last = 0
    snap = true
    if (!dead) raf = requestAnimationFrame(frame)
  }
  document.addEventListener('visibilitychange', onVisibility)
  const onLost = (e) => {
    e.preventDefault()
    P.current.onFail?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  buildWorld(P.current.circuit ?? 0)
  if (!document.hidden) raf = requestAnimationFrame(frame)

  return {
    destroy() {
      dead = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      if (engine) engine.stop()
      engine = null
      // Liberar todo lo de la GPU.
      worldGeos.forEach((x) => x.dispose())
      scene.traverse((obj) => {
        obj.geometry?.dispose?.()
        const m = obj.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m?.dispose?.()
      })
      disposables.forEach((x) => x.dispose?.())
      renderer.dispose()
      renderer.forceContextLoss()
      root.remove()
    },
  }
}

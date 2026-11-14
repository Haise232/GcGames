// El Cohete en 3D (three.js). Se carga aparte (import dinámico desde Crash.jsx) para no engordar el resto de la app; si no
// hay WebGL, la pantalla usa la escena 2D de siempre (crashScene.js), que expone lo mismo: draw(frame), resize() y destroy().
//
// Noche de Navidad en las islas: la plataforma en una isla nevada con palmeras y luces, el Teide al fondo, el pueblo
// iluminado en el horizonte y la luna llena sobre el mar. En la cuenta atrás la cámara rodea la torre, se retiran los
// brazos y prende el motor; al despegar, una cámara desde tierra lo sigue, luego otra lo persigue entre las nubes, la
// aurora, la luna, la curvatura de la Tierra y un planeta con anillos. La explosión: bola de fuego, onda, chispas y
// restos ardiendo. Retirar a tiempo suelta una cápsula con paracaídas.
//
// Nada de lo que se ve decide nada: la altura sale del reloj del servidor (frame.t) y la explosión de frame.boom.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FLIGHT_MS, MAX_MULT, fmtMult, msFor, multiplierAt } from './crash.js'

const TAU = Math.PI * 2
const ALT_H = 5200 // altura del mundo a 25×
const PAD_TOP = 4 // la losa de la plataforma
const ROCKET_BASE = 7 // el cohete sobre su soporte
const CAM_CLEARANCE = 4 // altura mínima de la cámara sobre el suelo
const LOG_MAX = Math.log(MAX_MULT / 100)
const TICKS = [100, 150, 200, 300, 500, 1000, 1500, 2000, 2500]
// Hitos del vuelo (altitud 0–1, escala logarítmica del multiplicador) y su rótulo.
const MILESTONES = [
  [0.2, 'Atravesando las nubes'],
  [0.4, 'Aurora a la vista'],
  [0.62, 'Rumbo a la luna'],
  [0.85, 'Espacio profundo'],
]
const BULBS = ['#ff3b4a', '#ffd34a', '#3ddc84', '#4aa8ff', '#ffffff', '#ff7ad1']

const clamp01 = (k) => Math.min(1, Math.max(0, k))
const smooth = (a, b, x) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const mix = (a, b, k) => a + (b - a) * k
const altitudeOf = (mult) => clamp01(Math.log(mult / 100) / LOG_MAX)
// Altura y deriva del cohete según la altitud: arranca despacio y gira un poco hacia +x (como un lanzamiento de verdad).
const rocketY = (a) => ROCKET_BASE + ALT_H * a ** 1.6
const rocketX = (a) => 900 * a * a
const tierColor = (mult) => (mult < 200 ? '#ffe27a' : mult < 500 ? '#ffa046' : mult < 1000 ? '#ff5c96' : '#be78ff')

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

// Ruido de valor (para el terreno).
function makeNoise(seed) {
  const R = rng(seed)
  const perm = Array.from({ length: 256 }, () => R())
  const h = (x, y) => perm[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 256]
  return (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    return mix(mix(h(xi, yi), h(xi + 1, yi), u), mix(h(xi, yi + 1), h(xi + 1, yi + 1), u), v)
  }
}

// Una pieza pintada de un color por vértice, lista para fundirse con otras.
function part(geo, color, m) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (m) g.applyMatrix4(m)
  const c = new Color(color)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3)
  g.setAttribute('color', new BufferAttribute(arr, 3))
  g.deleteAttribute('uv')
  return g
}
const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _v = new Vector3()
const _s = new Vector3()
const at = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(s, s, s)).clone()

function canvasTexture(size, paint) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  paint(c.getContext('2d'), size)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}
const glowTexture = () =>
  canvasTexture(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, s, s)
  })
const cloudTexture = () =>
  canvasTexture(256, (g, s) => {
    const R = rng(7)
    for (let i = 0; i < 22; i++) {
      const x = s * (0.22 + R() * 0.56)
      const y = s * (0.35 + R() * 0.3)
      const r = s * (0.1 + R() * 0.16)
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, 'rgba(255,255,255,0.5)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, s, s)
    }
  })
const moonTexture = () => {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#e9e4d6'
  g.fillRect(0, 0, 512, 256)
  const R = rng(11)
  for (let i = 0; i < 26; i++) {
    const x = R() * 512
    const y = 30 + R() * 196
    const r = 10 + R() * 46
    g.fillStyle = `rgba(150, 142, 128, ${0.25 + R() * 0.3})`
    g.beginPath()
    g.ellipse(x, y, r, r * 0.8, 0, 0, TAU)
    g.fill()
  }
  for (let i = 0; i < 140; i++) {
    const x = R() * 512
    const y = R() * 256
    const r = 1 + R() * 5
    g.strokeStyle = 'rgba(120, 112, 100, 0.45)'
    g.lineWidth = 1
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    g.stroke()
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

const NOISE_GLSL = `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
`

// ---------- partículas: un montón de puntos con tamaño, color y transparencia propios ----------
const STRIDE = 20 // x y z vx vy vz life max s0 s1 r0 g0 b0 r1 g1 b1 drag grav alpha fadeIn
function makeParticles(cap, additive) {
  const data = new Float32Array(cap * STRIDE)
  const pos = new Float32Array(cap * 3)
  const col = new Float32Array(cap * 3)
  const size = new Float32Array(cap)
  const alpha = new Float32Array(cap)
  const geo = new BufferGeometry()
  const attr = (arr, n) => new BufferAttribute(arr, n).setUsage(DynamicDrawUsage)
  geo.setAttribute('position', attr(pos, 3))
  geo.setAttribute('aColor', attr(col, 3))
  geo.setAttribute('aSize', attr(size, 1))
  geo.setAttribute('aAlpha', attr(alpha, 1))
  geo.setDrawRange(0, 0)
  const material = new ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale;
      varying vec3 vColor; varying float vAlpha;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, aSize * uScale / -mv.z); vColor = aColor; vAlpha = aAlpha; }`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard;
        float a = ${additive ? '(1.0 - d) * (1.0 - d)' : 'smoothstep(1.0, 0.15, d) * 0.9'};
        gl_FragColor = vec4(vColor, a * vAlpha); }`,
    transparent: true,
    depthWrite: false,
    ...(additive ? { blending: AdditiveBlending } : {}),
  })
  const points = new Points(geo, material)
  points.frustumCulled = false
  let n = 0

  function spawn(p) {
    if (n >= cap) return
    const o = n * STRIDE
    data[o] = p.x
    data[o + 1] = p.y
    data[o + 2] = p.z
    data[o + 3] = p.vx ?? 0
    data[o + 4] = p.vy ?? 0
    data[o + 5] = p.vz ?? 0
    data[o + 6] = 0
    data[o + 7] = p.life
    data[o + 8] = p.s0
    data[o + 9] = p.s1 ?? p.s0
    data.set(p.c0, o + 10)
    data.set(p.c1 ?? p.c0, o + 13)
    data[o + 16] = p.drag ?? 0
    data[o + 17] = p.grav ?? 0
    data[o + 18] = p.alpha ?? 1
    data[o + 19] = p.fadeIn ?? 0
    n++
  }

  function update(dt) {
    let i = 0
    while (i < n) {
      const o = i * STRIDE
      data[o + 6] += dt
      if (data[o + 6] >= data[o + 7]) {
        n--
        if (i !== n) data.copyWithin(o, n * STRIDE, n * STRIDE + STRIDE)
        continue
      }
      const drag = Math.exp(-data[o + 16] * dt)
      data[o + 3] *= drag
      data[o + 4] = data[o + 4] * drag + data[o + 17] * dt
      data[o + 5] *= drag
      data[o] += data[o + 3] * dt
      data[o + 1] += data[o + 4] * dt
      data[o + 2] += data[o + 5] * dt
      const k = data[o + 6] / data[o + 7]
      pos[i * 3] = data[o]
      pos[i * 3 + 1] = data[o + 1]
      pos[i * 3 + 2] = data[o + 2]
      col[i * 3] = mix(data[o + 10], data[o + 13], k)
      col[i * 3 + 1] = mix(data[o + 11], data[o + 14], k)
      col[i * 3 + 2] = mix(data[o + 12], data[o + 15], k)
      size[i] = mix(data[o + 8], data[o + 9], Math.sqrt(k))
      const fin = data[o + 19] > 0 ? Math.min(1, data[o + 6] / data[o + 19]) : 1
      alpha[i] = data[o + 18] * fin * (1 - k) * (1 - k * 0.3)
      i++
    }
    geo.setDrawRange(0, n)
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[name].needsUpdate = true
  }

  return {
    points,
    spawn,
    update,
    clear: () => {
      n = 0
      geo.setDrawRange(0, 0)
    },
    get count() {
      return n
    },
  }
}

// ---------- el cohete ----------
function buildRocket() {
  const g = new Group()
  const ivory = new MeshStandardMaterial({ color: '#f4ecda', roughness: 0.42, metalness: 0.15 })
  const red = new MeshStandardMaterial({ color: '#c8302a', roughness: 0.38, metalness: 0.2 })
  const brass = new MeshStandardMaterial({ color: '#d4ab52', roughness: 0.28, metalness: 0.85 })
  const dark = new MeshStandardMaterial({ color: '#2b2d33', roughness: 0.55, metalness: 0.7, side: DoubleSide })
  const add = (geo, mat, y = 0) => {
    const m = new Mesh(geo, mat)
    m.position.y = y
    g.add(m)
    return m
  }
  add(new CylinderGeometry(1.6, 1.9, 2, 40), red, 1)
  add(new CylinderGeometry(1.6, 1.6, 10, 40), ivory, 7)
  add(new CylinderGeometry(1.63, 1.63, 0.6, 40), red, 5.4)
  add(new CylinderGeometry(1.63, 1.63, 0.25, 40), red, 4.8)
  const nose = []
  for (let i = 0; i <= 16; i++) {
    const y = (i / 16) * 5.4
    nose.push(new Vector2(Math.max(0.001, 1.6 * Math.sqrt(1 - (y / 5.4) ** 2)), y))
  }
  add(new LatheGeometry(nose, 40), red, 12)
  add(new TorusGeometry(1.62, 0.14, 10, 48).rotateX(Math.PI / 2), brass, 12)
  add(new TorusGeometry(1.62, 0.1, 10, 48).rotateX(Math.PI / 2), brass, 2)
  add(new CylinderGeometry(0.75, 1.15, 1.3, 28, 1, true), dark, -0.6)
  add(new SphereGeometry(0.25, 12, 8), brass, 17.4)
  // Aletas.
  const fin = new Shape()
  fin.moveTo(0, 0)
  fin.lineTo(0, 4.2)
  fin.lineTo(2.5, 0.6)
  fin.lineTo(2.7, -1.3)
  fin.lineTo(1.6, -0.9)
  fin.closePath()
  const finGeo = new ExtrudeGeometry(fin, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 })
  finGeo.translate(0, 0, -0.11)
  for (let i = 0; i < 4; i++) {
    const m = new Mesh(finGeo, red)
    const a = (i / 4) * TAU + Math.PI / 4
    m.position.set(Math.cos(a) * 1.55, 0.2, Math.sin(a) * 1.55)
    m.rotation.y = -a
    g.add(m)
  }
  // Ojos de buey: tres alrededor, con el cristal encendido.
  const glass = new MeshBasicMaterial({ color: new Color('#6fc3ff').multiplyScalar(1.6) })
  for (const [a, y] of [[0, 9.4], [TAU / 3, 9.4], [(2 * TAU) / 3, 9.4]]) {
    const ring = new Mesh(new TorusGeometry(0.55, 0.13, 8, 24), brass)
    const pane = new Mesh(new CircleGeometry(0.5, 20), glass)
    for (const [m, r] of [[ring, 1.6], [pane, 1.62]]) {
      m.position.set(Math.sin(a) * r, y, Math.cos(a) * r)
      m.lookAt(Math.sin(a) * 10, y, Math.cos(a) * 10)
      g.add(m)
    }
  }
  g.rotation.order = 'ZYX'
  return g
}

// La llama: dos conos aditivos con ruido que se mueve, apuntando hacia abajo desde la tobera.
function buildFlame(core, edge, layer) {
  const geo = new ConeGeometry(1, 1, 28, 10, true)
  geo.rotateX(Math.PI)
  geo.translate(0, -0.5, 0) // la base en la tobera (y = 0) y la punta abajo (y = -1)
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uCore: { value: new Color(...core) }, uEdge: { value: new Color(...edge) }, uSeed: { value: layer } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; varying float vA;
      void main(){ vT = -position.y; vA = atan(position.x, position.z);
        vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime; uniform float uPower; uniform vec3 uCore; uniform vec3 uEdge; uniform float uSeed;
      varying float vT; varying vec3 vN; varying vec3 vV; varying float vA;
      void main(){
        float fres = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float n = noise(vec2(vA * 3.0 + uSeed * 7.0, vT * 9.0 - uTime * 18.0));
        float n2 = noise(vec2(vA * 7.0, vT * 20.0 - uTime * 31.0));
        float a = pow(1.0 - vT, 1.4) * fres * (0.55 + 0.6 * n + 0.25 * n2) * smoothstep(0.0, 0.05, vT);
        vec3 c = mix(uCore, uEdge, smoothstep(0.0, 0.75, vT + (1.0 - fres) * 0.5));
        gl_FragColor = vec4(c * uPower, clamp(a * uPower, 0.0, 1.0)); }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
  return new Mesh(geo, material)
}

// ---------- montaje ----------
export function createScene3D(host, { reduced = false, onFail } = {}) {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const prCap = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
  const renderer = new WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance', alpha: false })
  renderer.setPixelRatio(prCap)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const canvas = renderer.domElement
  canvas.className = 'c3d__gl'
  const onLost = (event) => {
    event.preventDefault()
    onFail?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  // Rotulación encima del lienzo: telemetría, altímetro, gráfica, rótulos y destello.
  const root = document.createElement('div')
  root.className = 'c3d'
  root.innerHTML = `
    <div class="c3d__vig"></div>
    <div class="c3d__flash"></div>
    <div class="c3d__tele"><b><i></i>GC-<span class="c3d__id"></span> · En directo</b><span class="c3d__tl1"></span><span class="c3d__tl2"></span></div>
    <div class="c3d__alt" aria-hidden="true">
      <div class="c3d__rail"><div class="c3d__fill"></div></div>
      <div class="c3d__ticks"></div>
      <div class="c3d__marks"></div>
      <div class="c3d__ship"><span></span></div>
    </div>
    <canvas class="c3d__graph" aria-hidden="true"></canvas>
    <div class="c3d__cap"></div>
    <div class="c3d__tag"><b>¡Tú!</b><span></span></div>
    <div class="c3d__fade"></div>`
  root.prepend(canvas)
  host.appendChild(root)
  const $ = (s) => root.querySelector(s)
  const el = {
    id: $('.c3d__id'),
    tl1: $('.c3d__tl1'),
    tl2: $('.c3d__tl2'),
    alt: $('.c3d__alt'),
    ticks: $('.c3d__ticks'),
    marks: $('.c3d__marks'),
    graph: $('.c3d__graph'),
    cap: $('.c3d__cap'),
    tag: $('.c3d__tag'),
    tagText: $('.c3d__tag span'),
    flash: $('.c3d__flash'),
    fade: $('.c3d__fade'),
  }
  for (const tick of TICKS) {
    const t = document.createElement('span')
    t.style.setProperty('--y', altitudeOf(tick))
    t.textContent = fmtMult(tick).replace(',00', '')
    el.ticks.appendChild(t)
  }
  for (const [mult, label] of [[1000, 'Luna'], [2000, 'Planeta']]) {
    const t = document.createElement('em')
    t.style.setProperty('--y', altitudeOf(mult))
    t.textContent = label
    el.ticks.appendChild(t)
  }
  const graph = el.graph.getContext('2d')

  const scene = new Scene()
  const camera = new PerspectiveCamera(50, 16 / 10, 0.5, 40000)
  camera.position.set(0, 14, 46)
  const disposables = []
  const keep = (x) => {
    disposables.push(x)
    return x
  }

  // Colores de la noche y del espacio (en el espacio de trabajo lineal).
  const COL = {
    nightTop: new Color('#0b1640'),
    nightHor: new Color('#5a3456'),
    spaceTop: new Color('#020309'),
    spaceHor: new Color('#07112c'),
    fogNight: new Color('#2a2448'),
    fogSpace: new Color('#050a1c'),
  }
  const moonYaw = -0.3
  const moonDir = new Vector3()
  const setMoonDir = (elev) => moonDir.set(Math.sin(moonYaw) * Math.cos(elev), Math.sin(elev), -Math.cos(moonYaw) * Math.cos(elev))
  setMoonDir(0.05)

  // Luces: la luna, el cielo, los focos de la plataforma y la llama.
  const hemi = new HemisphereLight('#7084c8', '#140c1c', 0.75)
  const moonLight = new DirectionalLight('#c4d4ff', 1.5)
  moonLight.position.copy(moonDir).multiplyScalar(100).add(new Vector3(0, 60, 0))
  const amb = new AmbientLight('#ffffff', 0.08)
  const flameLight = new PointLight('#ff8a3d', 0, 160, 0)
  const flood1 = new PointLight('#ffe2b0', 1.6, 70, 0)
  const flood2 = new PointLight('#ffe2b0', 1.2, 70, 0)
  flood1.position.set(16, 18, 12)
  flood2.position.set(-14, 16, -14)
  const boomLight = new PointLight('#ffb070', 0, 600, 0)
  // En lo alto, el sol de frente ilumina el cohete (si no, a contraluz con la luna se vería negro).
  const sunLight = new DirectionalLight('#fff1dc', 0)
  scene.add(sunLight, sunLight.target)
  scene.add(hemi, moonLight, amb, flameLight, flood1, flood2, boomLight)
  scene.fog = new Fog(COL.fogNight.clone(), 260, 2600)

  // ---------- cielo (sigue a la cámara) ----------
  // Va en su propia escena y se pinta antes que el mundo (sin profundidad): así el mar y la isla tapan lo que toca.
  const skyScene = new Scene()
  const skyGroup = new Group()
  skyScene.add(skyGroup)
  const domeMat = keep(
    new ShaderMaterial({
      uniforms: {
        uAlt: { value: 0 },
        uTime: { value: 0 },
        uMoon: { value: moonDir },
        uNightTop: { value: COL.nightTop },
        uNightHor: { value: COL.nightHor },
        uSpaceTop: { value: COL.spaceTop },
        uSpaceHor: { value: COL.spaceHor },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `${NOISE_GLSL}
        uniform float uAlt; uniform float uTime; uniform vec3 uMoon; uniform vec3 uNightTop; uniform vec3 uNightHor; uniform vec3 uSpaceTop; uniform vec3 uSpaceHor;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir); float h = d.y; float a = uAlt;
          vec3 top = mix(uNightTop, uSpaceTop, smoothstep(0.0, 0.6, a));
          vec3 hor = mix(uNightHor, uSpaceHor, smoothstep(0.0, 0.7, a));
          vec3 col = h >= 0.0 ? mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.45)) : mix(hor, top * 0.5, clamp(-h * 3.0, 0.0, 1.0));
          float az = atan(d.x, -d.z);
          col += vec3(1.0, 0.45, 0.25) * exp(-abs(h) * 16.0) * 0.12 * (1.0 - smoothstep(0.0, 0.45, a));
          col += vec3(0.2, 0.45, 1.0) * exp(-abs(h + 0.03) * 30.0) * 0.3 * smoothstep(0.3, 0.8, a);
          float md = max(dot(d, normalize(uMoon)), 0.0);
          col += vec3(0.6, 0.7, 1.0) * (pow(md, 80.0) * 0.5 + pow(md, 8.0) * 0.04);
          float ak = smoothstep(0.16, 0.4, a) * (1.0 - 0.6 * smoothstep(0.85, 1.0, a));
          if (ak > 0.0 && h > 0.0) {
            float wave = sin(az * 3.0 + noise(vec2(az * 3.0, uTime * 0.12)) * 4.0 + uTime * 0.15);
            float curtain = noise(vec2(az * 24.0 + uTime * 0.35, uTime * 0.12));
            float base = 0.05 + wave * 0.03;
            float vert = smoothstep(base, base + 0.04, h) * (1.0 - smoothstep(base + 0.08, base + 0.42, h));
            float intensity = vert * (0.45 + 0.55 * wave) * (0.3 + 0.9 * curtain);
            vec3 ac = mix(vec3(0.1, 1.0, 0.5), vec3(1.0, 0.18, 0.45), smoothstep(base + 0.1, base + 0.38, h));
            col += ac * intensity * ak * 0.6;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  )
  const dome = new Mesh(keep(new SphereGeometry(20000, 48, 24)), domeMat)
  dome.renderOrder = -10
  skyGroup.add(dome)

  // Estrellas.
  const starMat = keep(
    new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.4 }, uPR: { value: prCap } },
      vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uPR; varying float vTw;
        void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vTw = 0.6 + 0.4 * sin(uTime * 1.7 + aPhase);
          gl_PointSize = aSize * uPR; }`,
      fragmentShader: `uniform float uOpacity; varying float vTw;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float a = pow(1.0 - d, 2.2);
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * 1.6, a * vTw * uOpacity); }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      fog: false,
    }),
  )
  {
    const R = rng(3)
    const N = 1600
    const p = new Float32Array(N * 3)
    const s = new Float32Array(N)
    const ph = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const u = R() * 2 - 1
      const th = R() * TAU
      const y = u < -0.2 ? u * 0.5 : u
      const r = Math.sqrt(1 - y * y)
      p.set([r * Math.cos(th) * 15000, y * 15000, r * Math.sin(th) * 15000], i * 3)
      s[i] = 1.2 + R() ** 3 * 3.6
      ph[i] = R() * TAU
    }
    const geo = keep(new BufferGeometry())
    geo.setAttribute('position', new BufferAttribute(p, 3))
    geo.setAttribute('aSize', new BufferAttribute(s, 1))
    geo.setAttribute('aPhase', new BufferAttribute(ph, 1))
    const stars = new Points(geo, starMat)
    stars.renderOrder = -9
    stars.frustumCulled = false
    skyGroup.add(stars)
  }

  // La Tierra que se curva abajo cuando se sube mucho: océano, ciudades y el borde azul de la atmósfera.
  const RE = 6000
  const earthMat = keep(
    new ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main(){ vL = normalize(position); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${NOISE_GLSL}
        uniform float uOpacity; varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main(){
          vec3 V = normalize(cameraPosition - vW); float f = 1.0 - max(dot(normalize(vN), V), 0.0);
          vec2 uv = vec2(atan(vL.x, vL.z) * 3.0, vL.y * 6.0);
          float land = smoothstep(0.52, 0.6, noise(uv * 2.0) * 0.7 + noise(uv * 6.0) * 0.3);
          vec3 col = mix(vec3(0.003, 0.012, 0.045), vec3(0.012, 0.02, 0.016), land);
          float cloud = smoothstep(0.55, 0.8, noise(uv * 3.0 + 7.0) * 0.6 + noise(uv * 11.0) * 0.4);
          col = mix(col, vec3(0.05, 0.06, 0.09), cloud * 0.7);
          float city = step(0.86, noise(uv * 60.0)) * land * noise(uv * 9.0) * (1.0 - cloud);
          col += vec3(1.0, 0.62, 0.25) * city * 1.2;
          col += vec3(0.12, 0.32, 1.0) * pow(f, 14.0) * 0.9;
          gl_FragColor = vec4(col, uOpacity);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  )
  const earth = new Mesh(keep(new SphereGeometry(RE, 96, 48)), earthMat)
  earth.renderOrder = -7
  earth.visible = false
  skyGroup.add(earth)

  // La luna (en el horizonte al empezar; crece y sube según te acercas) y un planeta con anillos al final.
  const moonTex = keep(moonTexture())
  const moon = new Mesh(
    keep(new SphereGeometry(1, 48, 24)),
    keep(new MeshBasicMaterial({ map: moonTex, color: new Color('#ffffff').multiplyScalar(0.9), depthTest: false, depthWrite: false, fog: false })),
  )
  moon.renderOrder = -8
  skyGroup.add(moon)
  const glowTex = keep(glowTexture())
  const moonGlow = new Sprite(keep(new SpriteMaterial({ map: glowTex, color: '#9fb4ff', transparent: true, opacity: 0.16, blending: AdditiveBlending, depthTest: false, depthWrite: false, fog: false })))
  moonGlow.renderOrder = -8.5
  skyGroup.add(moonGlow)
  const planet = new Group()
  {
    const body = new Mesh(
      keep(new SphereGeometry(1, 48, 24)),
      keep(
        new ShaderMaterial({
          vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `${NOISE_GLSL} varying vec3 vP; varying vec3 vN;
            void main(){ float b = sin(vP.y * 14.0 + noise(vP.xz * 4.0) * 2.0) * 0.5 + 0.5;
              vec3 c = mix(vec3(0.55, 0.28, 0.1), vec3(0.95, 0.72, 0.4), b);
              float lit = clamp(dot(normalize(vN), normalize(vec3(-0.6, 0.4, 0.7))) * 0.9 + 0.15, 0.05, 1.0);
              gl_FragColor = vec4(c * lit, 1.0);
              #include <colorspace_fragment>
            }`,
          depthTest: false,
          depthWrite: false,
          fog: false,
        }),
      ),
    )
    const ring = new Mesh(
      keep(new RingGeometry(1.35, 2.3, 96, 1)),
      keep(new MeshBasicMaterial({ color: new Color('#e9cf86'), transparent: true, opacity: 0.6, side: DoubleSide, depthTest: false, depthWrite: false, fog: false })),
    )
    ring.rotation.x = Math.PI / 2.3
    body.renderOrder = -8
    ring.renderOrder = -7.9
    planet.add(body, ring)
    planet.rotation.z = -0.35
  }
  planet.visible = false
  skyGroup.add(planet)

  // ---------- el mundo: mar, isla, Teide, pueblo, plataforma ----------
  const seaMat = keep(
    new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMoon: { value: moonDir },
        uFlame: { value: 0 },
        uFogColor: { value: scene.fog.color },
        uFogNear: { value: 260 },
        uFogFar: { value: 2600 },
      },
      vertexShader: 'varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: `${NOISE_GLSL}
        uniform float uTime; uniform vec3 uMoon; uniform float uFlame; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
        varying vec3 vW;
        void main(){
          vec2 p = vW.xz * 0.06;
          float nx = noise(p + vec2(uTime * 0.3, 0.0)) - noise(p * 2.3 - vec2(0.0, uTime * 0.4));
          float nz = noise(p.yx * 1.7 + vec2(0.0, uTime * 0.25)) - noise(p * 3.1 + uTime * 0.2);
          vec3 N = normalize(vec3(nx * 0.35, 1.0, nz * 0.35));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 col = mix(vec3(0.004, 0.018, 0.045), vec3(0.06, 0.07, 0.16), fres);
          vec3 R = reflect(-V, N);
          vec3 m = normalize(uMoon);
          col += vec3(0.85, 0.9, 1.0) * (pow(max(dot(R, m), 0.0), 220.0) * 6.0 + pow(max(dot(R, m), 0.0), 12.0) * 0.06);
          float pad = exp(-length(vW.xz) / 70.0);
          col += vec3(1.0, 0.45, 0.15) * uFlame * pad * (0.25 + fres);
          float dist = length(cameraPosition - vW);
          col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  )
  const sea = new Mesh(keep(new PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2)), seaMat)
  scene.add(sea)
  const ground = [sea]

  const noise = makeNoise(42)
  const islandHeight = (x, z) => {
    const r = Math.hypot(x, z)
    const ang = Math.atan2(z, x)
    const edge = 80 + 10 * Math.sin(ang * 3 + 1) + 6 * Math.sin(ang * 7 + 2) + 3 * Math.sin(ang * 13)
    const k = r / edge
    let h = 3.6 * (1 - smooth(0.62, 1.02, k)) - 4 * smooth(1.0, 1.4, k)
    const back = smooth(-12, -45, z)
    h += (5 + 8 * noise(x * 0.05, z * 0.05)) * noise(x * 0.03 + 3, z * 0.03) * back * (1 - smooth(0.45, 0.9, k))
    h += (noise(x * 0.3, z * 0.3) - 0.5) * 0.5
    const p = 1 - smooth(17, 26, r)
    return mix(h, 3, p)
  }
  {
    const geo = new PlaneGeometry(260, 260, 110, 110).rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const sand = new Color('#8f7f60')
    const grass = new Color('#21402f')
    const rock = new Color('#38384a')
    const snow = new Color('#dfe8f5')
    const concrete = new Color('#55565c')
    const c = new Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = islandHeight(x, z)
      pos.setY(i, h)
      const r = Math.hypot(x, z)
      c.copy(grass).lerp(rock, smooth(4, 9, h))
      c.lerp(sand, 1 - smooth(0.4, 1.8, h))
      if (noise(x * 0.12 + 9, z * 0.12) > 0.55 - smooth(4, 10, h) * 0.4 && h > 1.6) c.lerp(snow, 0.85)
      if (r < 24) c.lerp(concrete, 1 - smooth(18, 24, r))
      c.toArray(colors, i * 3)
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const island = new Mesh(keep(geo), keep(new MeshLambertMaterial({ vertexColors: true })))
    scene.add(island)
    ground.push(island)
  }

  // El Teide nevado, a lo lejos, con su isla.
  {
    const geo = new ConeGeometry(560, 470, 72, 16)
    geo.translate(0, 235, 0)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const c = new Color()
    const dark = new Color('#1d2440')
    const snow = new Color('#e8f0fb')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const a = Math.atan2(z, x)
      const ridge = 1 + 0.08 * Math.sin(a * 9) + 0.12 * (noise(a * 4 + 10, y * 0.01) - 0.5)
      const flat = y > 420 ? 0.7 : 1 // la cumbre achatada
      pos.setX(i, x * ridge)
      pos.setZ(i, z * ridge)
      pos.setY(i, Math.min(y, 440) * flat + (y > 420 ? 440 * 0.3 : 0))
      const snowLine = 300 + 40 * Math.sin(a * 5) + 30 * noise(a * 6, 2)
      c.copy(dark).lerp(snow, smooth(snowLine - 20, snowLine + 15, pos.getY(i)))
      c.toArray(colors, i * 3)
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const teide = new Mesh(keep(geo), keep(new MeshLambertMaterial({ vertexColors: true })))
    teide.position.set(640, -6, -1500)
    scene.add(teide)
    ground.push(teide)
  }

  // El pueblo en el horizonte: una franja de luces cálidas.
  const townMat = keep(
    new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
      vertexShader: `attribute float aPhase; uniform float uTime; uniform float uScale; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, 3.2 * uScale / -mv.z); vA = 0.7 + 0.3 * sin(uTime * 2.0 + aPhase); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
        gl_FragColor = vec4(vec3(2.4, 1.4, 0.55), (1.0 - d) * vA); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  )
  {
    const R = rng(9)
    const N = 420
    const p = new Float32Array(N * 3)
    const ph = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const u = R()
      const x = -1150 + u * 700
      const hill = 26 * Math.sin(u * Math.PI) * R()
      p.set([x, 2 + hill, -1250 - R() * 120 + u * 140], i * 3)
      ph[i] = R() * TAU
    }
    const geo = keep(new BufferGeometry())
    geo.setAttribute('position', new BufferAttribute(p, 3))
    geo.setAttribute('aPhase', new BufferAttribute(ph, 1))
    const town = new Points(geo, townMat)
    scene.add(town)
    const land = new Mesh(keep(new SphereGeometry(1, 32, 12, 0, TAU, 0, Math.PI / 2)), keep(new MeshLambertMaterial({ color: '#141a30' })))
    land.scale.set(420, 40, 120)
    land.position.set(-800, -4, -1230)
    scene.add(land)
    ground.push(land, town)
  }

  // Plataforma, torre, focos, palmeras y árbol de Navidad.
  const bulbs = [] // [x, y, z, color]
  {
    const parts = []
    parts.push(part(new CylinderGeometry(13, 14, 1.2, 48), '#6a6b72', at(0, PAD_TOP - 0.6, 0)))
    parts.push(part(new CylinderGeometry(3.4, 3.4, 0.3, 32), '#2a2a2e', at(0, PAD_TOP + 0.05, 0)))
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4
      parts.push(part(new BoxGeometry(0.6, 3.4, 0.6), '#9a3b2c', at(Math.cos(a) * 2.6, PAD_TOP + 1.6, Math.sin(a) * 2.6, 0, -a, 0.35 * Math.sign(Math.cos(a)))))
    }
    // La torre de servicio: cuatro postes, travesaños y cruces.
    const tx = -7
    const H = 28
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) parts.push(part(new BoxGeometry(0.45, H, 0.45), '#b8432f', at(tx + dx, PAD_TOP + H / 2, dz)))
    for (let y = 2; y < H; y += 3) {
      parts.push(part(new BoxGeometry(4.4, 0.25, 0.25), '#b8432f', at(tx, PAD_TOP + y, -2)))
      parts.push(part(new BoxGeometry(4.4, 0.25, 0.25), '#b8432f', at(tx, PAD_TOP + y, 2)))
      parts.push(part(new BoxGeometry(0.25, 0.25, 4.4), '#b8432f', at(tx - 2, PAD_TOP + y, 0)))
      parts.push(part(new BoxGeometry(0.25, 0.25, 4.4), '#b8432f', at(tx + 2, PAD_TOP + y, 0)))
      parts.push(part(new BoxGeometry(0.18, 4.3, 0.18), '#9a3726', at(tx, PAD_TOP + y + 1.5, -2, 0, 0, 0.93)))
      parts.push(part(new BoxGeometry(0.18, 4.3, 0.18), '#9a3726', at(tx, PAD_TOP + y + 1.5, 2, 0, 0, -0.93)))
      parts.push(part(new BoxGeometry(0.18, 4.3, 0.18), '#9a3726', at(tx - 2, PAD_TOP + y + 1.5, 0, 0.93, 0, 0)))
    }
    parts.push(part(new BoxGeometry(5, 0.5, 5), '#3a3a40', at(tx, PAD_TOP + H, 0)))
    parts.push(part(new CylinderGeometry(0.1, 0.1, 4, 6), '#cccccc', at(tx, PAD_TOP + H + 2, 0)))
    for (let y = 1; y < H; y += 1.6) {
      bulbs.push([tx + 2.3, PAD_TOP + y, 2.3, BULBS[Math.floor(y) % BULBS.length]])
      bulbs.push([tx - 2.3, PAD_TOP + y, 2.3, BULBS[(Math.floor(y) + 3) % BULBS.length]])
    }
    // Focos sobre postes.
    for (const [x, z, h] of [[16, 12, 18], [-14, -14, 16]]) {
      parts.push(part(new CylinderGeometry(0.25, 0.35, h, 8), '#555a66', at(x, PAD_TOP + h / 2 - 1, z)))
      parts.push(part(new BoxGeometry(2.4, 1.2, 0.6), '#30333a', at(x, PAD_TOP + h - 1, z, 0, Math.atan2(x, z), 0)))
    }
    // Palmeras.
    const R = rng(5)
    for (const [px, pz, ph, lean] of [[-32, 24, 13, -0.4], [36, 20, 12, 0.5], [-46, -6, 14, -0.6], [30, -30, 11, 0.3], [-22, -44, 13, 0.2], [50, 2, 12, 0.7], [-14, 60, 10, -0.2]]) {
      const base = islandHeight(px, pz) - 0.3
      const dir = new Vector3(Math.cos(lean * 3), 0, Math.sin(lean * 3))
      const top = new Vector3(px, base + ph, pz).addScaledVector(dir, ph * 0.18)
      const curve = new CatmullRomCurve3([new Vector3(px, base, pz), new Vector3(px, base + ph * 0.5, pz).addScaledVector(dir, ph * 0.04), top])
      parts.push(part(new TubeGeometry(curve, 10, 0.38, 6), '#4a3626'))
      for (let f = 0; f < 8; f++) {
        const a = (f / 8) * TAU + R()
        const frond = new PlaneGeometry(1.4, 6.5, 1, 6)
        const fp = frond.attributes.position
        for (let i = 0; i < fp.count; i++) {
          const y = fp.getY(i) + 3.25
          fp.setY(i, y)
          fp.setZ(i, -0.045 * y * y)
        }
        frond.rotateX(-Math.PI / 2 + 0.35)
        parts.push(part(frond, '#1f5a35', at(top.x, top.y, top.z, 0, a, 0)))
      }
      // Guirnalda en espiral por el tronco.
      for (let i = 0; i < 14; i++) {
        const p = curve.getPoint(i / 14)
        const a = i * 1.3
        bulbs.push([p.x + Math.cos(a) * 0.55, p.y, p.z + Math.sin(a) * 0.55, BULBS[(i + f2(px)) % BULBS.length]])
      }
    }
    // El árbol de Navidad junto a la plataforma.
    const tX = 15
    const tZ = -10
    for (let i = 0; i < 4; i++) parts.push(part(new ConeGeometry(4.2 - i * 0.9, 4, 14), '#1d5a32', at(tX, PAD_TOP - 1 + 2.4 + i * 2.2, tZ)))
    parts.push(part(new CylinderGeometry(0.5, 0.6, 2, 8), '#4a3020', at(tX, PAD_TOP - 0.6, tZ)))
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * 9.5
      const r = 4 * (1 - y / 11) + 0.2
      const a = i * 2.4
      bulbs.push([tX + Math.cos(a) * r, PAD_TOP + 0.6 + y, tZ + Math.sin(a) * r, BULBS[i % BULBS.length]])
    }
    const world = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    scene.add(new Mesh(keep(world), keep(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }))))
    // La estrella del árbol.
    const star = new Mesh(keep(new IcosahedronGeometry(0.6, 0)), keep(new MeshBasicMaterial({ color: new Color('#ffd34a').multiplyScalar(4) })))
    star.position.set(tX, PAD_TOP + 11.8, tZ)
    scene.add(star)
    // Lámparas de los focos.
    const lampMat = keep(new MeshBasicMaterial({ color: new Color('#fff1d2').multiplyScalar(5) }))
    for (const [x, z, h] of [[16, 12, 18], [-14, -14, 16]]) {
      const lamp = new Mesh(keep(new PlaneGeometry(2, 0.8)), lampMat)
      lamp.position.set(x, PAD_TOP + h - 1, z)
      lamp.lookAt(0, 10, 0)
      lamp.position.addScaledVector(new Vector3(-x, 0, -z).normalize(), 0.35)
      scene.add(lamp)
    }
  }
  function f2(x) {
    return Math.abs(Math.round(x)) % 6
  }
  const bulbMesh = new InstancedMesh(keep(new SphereGeometry(0.18, 8, 6)), keep(new MeshBasicMaterial({ color: '#ffffff' })), bulbs.length)
  const bulbBase = bulbs.map((b) => new Color(b[3]).multiplyScalar(3.2))
  bulbs.forEach((b, i) => {
    bulbMesh.setMatrixAt(i, at(b[0], b[1], b[2]))
    bulbMesh.setColorAt(i, bulbBase[i])
  })
  scene.add(bulbMesh)
  const bulbTmp = new Color()

  // Brazos de la torre (se retiran en la cuenta atrás) y la baliza roja.
  const armMat = keep(new MeshLambertMaterial({ color: '#8e3324' }))
  const arms = [16, 23].map((y) => {
    const pivot = new Group()
    pivot.position.set(-5, y, 0)
    const arm = new Mesh(keep(new BoxGeometry(3.6, 0.8, 1.6)), armMat)
    arm.position.x = 1.8
    pivot.add(arm)
    scene.add(pivot)
    return pivot
  })
  const beacon = new Mesh(keep(new SphereGeometry(0.4, 12, 8)), keep(new MeshBasicMaterial({ color: '#ff2a2a' })))
  beacon.position.set(-7, PAD_TOP + 32.2, 0)
  scene.add(beacon)

  // El cohete, su llama y su brillo.
  const rocket = buildRocket()
  scene.add(rocket)
  const flameOuter = buildFlame([2.2, 1.2, 0.4], [1.6, 0.32, 0.06], 1)
  const flameInner = buildFlame([4.2, 3.8, 3.2], [3.0, 1.4, 0.35], 2)
  flameOuter.position.y = -1.2
  flameInner.position.y = -1.2
  rocket.add(flameOuter, flameInner)
  const nozzleGlow = new Sprite(keep(new SpriteMaterial({ map: glowTex, color: new Color(1.4, 0.6, 0.2), transparent: true, blending: AdditiveBlending, depthWrite: false })))
  nozzleGlow.position.y = -2.2
  rocket.add(nozzleGlow)
  keep(flameOuter.geometry)
  keep(flameOuter.material)
  keep(flameInner.geometry)
  keep(flameInner.material)

  // Cápsula con paracaídas (al retirar).
  const pod = new Group()
  {
    const capsule = new Mesh(keep(new SphereGeometry(0.9, 16, 12)), keep(new MeshStandardMaterial({ color: '#f4ecda', roughness: 0.4 })))
    const ring = new Mesh(keep(new TorusGeometry(0.9, 0.12, 8, 24).rotateX(Math.PI / 2)), keep(new MeshStandardMaterial({ color: '#d4ab52', metalness: 0.8, roughness: 0.3 })))
    const canopyGeo = new SphereGeometry(4, 16, 6, 0, TAU, 0, Math.PI / 2.2)
    const cc = new Float32Array(canopyGeo.attributes.position.count * 3)
    const red = new Color('#d8322b')
    const white = new Color('#f4ecda')
    for (let i = 0; i < canopyGeo.attributes.position.count; i++) {
      const a = Math.atan2(canopyGeo.attributes.position.getZ(i), canopyGeo.attributes.position.getX(i))
      ;(Math.floor(((a + Math.PI) / TAU) * 12) % 2 ? red : white).toArray(cc, i * 3)
    }
    canopyGeo.setAttribute('color', new BufferAttribute(cc, 3))
    const canopy = new Mesh(keep(canopyGeo), keep(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })))
    canopy.position.y = 6
    const lines = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU
      lines.push(0, 0.6, 0, Math.cos(a) * 3.8, 6.6, Math.sin(a) * 3.8)
    }
    const lineGeo = keep(new BufferGeometry())
    lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(lines), 3))
    const cords = new LineSegments(lineGeo, keep(new LineBasicMaterial({ color: '#d9d2c2', transparent: true, opacity: 0.7 })))
    pod.add(capsule, ring, canopy, cords)
    pod.userData = { canopy, cords }
  }
  pod.visible = false
  scene.add(pod)

  // Restos de la explosión.
  const DEBRIS = 22
  const debrisMesh = new InstancedMesh(keep(new BoxGeometry(1, 1, 1)), keep(new MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 })), DEBRIS)
  const debris = Array.from({ length: DEBRIS }, (_, i) => ({ p: new Vector3(), v: new Vector3(), r: new Euler(), w: new Vector3(), s: new Vector3(), life: 0 }))
  const debrisColors = ['#f4ecda', '#c8302a', '#d4ab52', '#f4ecda', '#2b2d33']
  debris.forEach((_, i) => debrisMesh.setColorAt(i, new Color(debrisColors[i % debrisColors.length])))
  debrisMesh.visible = false
  debrisMesh.frustumCulled = false
  scene.add(debrisMesh)
  const shock = new Mesh(keep(new RingGeometry(0.85, 1, 72)), keep(new MeshBasicMaterial({ color: new Color(3, 2.2, 1.4), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })))
  shock.visible = false
  scene.add(shock)
  const flashSprite = new Sprite(keep(new SpriteMaterial({ map: glowTex, color: new Color(1.8, 1.1, 0.6), transparent: true, blending: AdditiveBlending, depthWrite: false })))
  flashSprite.visible = false
  scene.add(flashSprite)

  // Nubes: una capa que el cohete atraviesa (y que se ve debajo al pasarla).
  const cloudTex = keep(cloudTexture())
  const clouds = []
  {
    const R = rng(21)
    for (let i = 0; i < 46; i++) {
      const m = new SpriteMaterial({ map: cloudTex, color: '#56628e', transparent: true, opacity: 0.32 + R() * 0.2, depthWrite: false })
      keep(m)
      const s = new Sprite(m)
      const y = 380 + R() * 420
      const ax = rocketX(Math.pow((y - ROCKET_BASE) / ALT_H, 1 / 1.6))
      s.position.set(ax + (R() - 0.5) * 700, y, (R() - 0.6) * 600)
      const sc = 110 + R() * 160
      s.scale.set(sc * 1.8, sc, 1)
      m.rotation = R() * TAU
      clouds.push(s)
      scene.add(s)
    }
  }

  // Estelas de velocidad alrededor del cohete.
  const STREAKS = 110
  const streakPos = new Float32Array(STREAKS * 6)
  const streakSeed = Array.from({ length: STREAKS }, () => ({ x: 0, y: 0, z: 0 }))
  const streakGeo = keep(new BufferGeometry())
  streakGeo.setAttribute('position', new BufferAttribute(streakPos, 3).setUsage(DynamicDrawUsage))
  const streakMat = keep(new LineBasicMaterial({ color: new Color(1.2, 1.35, 1.8), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }))
  const streaks = new LineSegments(streakGeo, streakMat)
  streaks.frustumCulled = false
  scene.add(streaks)
  {
    const R = rng(17)
    for (const s of streakSeed) {
      const a = R() * TAU
      const r = 14 + R() * 70
      s.x = Math.cos(a) * r
      s.z = Math.sin(a) * r
      s.y = (R() - 0.5) * 320
    }
  }

  // Nieve que cae en la isla.
  const SNOW = reduced ? 0 : 700
  const snowPos = new Float32Array(Math.max(1, SNOW) * 3)
  {
    const R = rng(33)
    for (let i = 0; i < SNOW; i++) snowPos.set([(R() - 0.5) * 160, R() * 70, (R() - 0.5) * 160], i * 3)
  }
  const snowGeo = keep(new BufferGeometry())
  snowGeo.setAttribute('position', new BufferAttribute(snowPos, 3).setUsage(DynamicDrawUsage))
  const snowMat = keep(
    new ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uOpacity: { value: 0.8 } },
      vertexShader: 'uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, 0.45 * uScale / -mv.z); }',
      fragmentShader: 'uniform float uOpacity; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(vec3(1.0), (1.0 - d) * uOpacity); }',
      transparent: true,
      depthWrite: false,
    }),
  )
  const snowPts = new Points(snowGeo, snowMat)
  snowPts.frustumCulled = false
  if (SNOW) scene.add(snowPts)

  // Partículas: humo (mezcla normal) y fuego/chispas (aditivo).
  const smoke = makeParticles(reduced ? 900 : 2600, false)
  const fire = makeParticles(reduced ? 700 : 2200, true)
  scene.add(smoke.points, fire.points)
  keep(smoke.points.geometry)
  keep(smoke.points.material)
  keep(fire.points.geometry)
  keep(fire.points.material)

  // ---------- postproceso: el brillo (bloom) de la llama, las luces y la explosión ----------
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(prCap)
  composer.addPass(new RenderPass(skyScene, camera))
  const worldPass = new RenderPass(scene, camera)
  worldPass.clear = false
  composer.addPass(worldPass)
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.85, 0.55, 0.85)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  let w = 1
  let h = 1
  function resize() {
    const rect = host.getBoundingClientRect()
    w = Math.max(1, Math.round(rect.width))
    h = Math.max(1, Math.round(rect.height))
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const gr = el.graph.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.graph.width = Math.max(1, Math.round(gr.width * dpr))
    el.graph.height = Math.max(1, Math.round(gr.height * dpr))
    graph.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()

  // ---------- estado de la animación ----------
  const R = Math.random
  let lastReal = performance.now()
  let elapsed = 0
  let lastRound = null
  let lastState = null
  let boomAt = null // instante real (s) de la explosión, si se ha visto
  let boomAnimated = false
  const boomPos = new Vector3()
  const camBoom = new Vector3()
  const groundCam = new Vector3(0, 14, 46)
  let groundSet = false
  const camPos = new Vector3(0, 14, 46)
  const camLook = new Vector3(0, 12, 0)
  const lastNozzle = new Vector3()
  let hadNozzle = false
  let podRound = null
  let podT = 0
  const podVel = new Vector3()
  let milestone = 0
  let capTimer = 0
  let tagShown = false
  let marksKey = ''
  let shownTele = ''
  let fadeFrom = null // instante real en que empezó el fundido de entrada
  const tmp = new Vector3()
  const tmp2 = new Vector3()
  const buf = new Vector2()
  let ignitionShown = false

  // La cámara nunca baja del suelo de la isla ni del mar (ni con el temblor ni al alejarse de una explosión baja).
  function keepAbove(p) {
    const ground = Math.hypot(p.x, p.z) < 130 ? Math.max(0, islandHeight(p.x, p.z)) : 0
    if (p.y < ground + CAM_CLEARANCE) p.y = ground + CAM_CLEARANCE
  }

  function caption(text, cls = '') {
    el.cap.textContent = text
    el.cap.className = `c3d__cap c3d__cap--on ${cls}`
    capTimer = 2.4
  }

  function resetRound() {
    smoke.clear()
    fire.clear()
    rocket.visible = true
    debrisMesh.visible = false
    shock.visible = false
    flashSprite.visible = false
    boomLight.intensity = 0
    pod.visible = false
    podRound = null
    boomAt = null
    boomAnimated = false
    groundSet = false
    hadNozzle = false
    milestone = 0
    ignitionShown = false
    el.tag.classList.remove('c3d__tag--on')
    tagShown = false
    fadeFrom = performance.now()
  }

  function explode(when, pos, animate) {
    boomAt = when
    boomPos.copy(pos)
    camBoom.copy(camPos)
    rocket.visible = false
    if (!animate) {
      // Llegaste con la ronda ya explotada: solo queda el humo.
      for (let i = 0; i < 40; i++) {
        smoke.spawn({ x: pos.x + (R() - 0.5) * 30, y: pos.y + (R() - 0.5) * 30, z: pos.z + (R() - 0.5) * 30, vx: (R() - 0.5) * 2, vy: R() * 2, life: 8 + R() * 6, s0: 18, s1: 34, c0: [0.25, 0.22, 0.24], alpha: 0.5, fadeIn: 0.5 })
      }
      return
    }
    boomAnimated = true
    const n = reduced ? 0.5 : 1
    for (let i = 0; i < 150 * n; i++) {
      tmp.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(8 + R() * 40)
      fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: tmp.x, vy: tmp.y, vz: tmp.z, drag: 2.4, life: 0.5 + R() * 1, s0: 4 + R() * 5, s1: 8 + R() * 7, c0: [1.6, 0.85, 0.3], c1: [0.7, 0.1, 0.03] })
    }
    for (let i = 0; i < 110 * n; i++) {
      tmp.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(35 + R() * 90)
      fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: tmp.x, vy: tmp.y, vz: tmp.z, drag: 1.1, grav: -40, life: 0.8 + R() * 1.6, s0: 1.2, s1: 0.5, c0: [2.6, 1.9, 1.1], c1: [1.4, 0.35, 0.08] })
    }
    for (let i = 0; i < 90 * n; i++) {
      tmp.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(4 + R() * 14)
      smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: tmp.x, vy: tmp.y + 2, vz: tmp.z, drag: 0.8, life: 4 + R() * 4, s0: 6, s1: 18 + R() * 12, c0: [0.5, 0.28, 0.18], c1: [0.14, 0.13, 0.15], alpha: 0.75, fadeIn: 0.25 })
    }
    debrisMesh.visible = true
    debris.forEach((d) => {
      d.p.copy(pos)
      d.v.set(R() - 0.5, R() - 0.3, R() - 0.5).normalize().multiplyScalar(15 + R() * 35)
      d.r.set(R() * TAU, R() * TAU, R() * TAU)
      d.w.set((R() - 0.5) * 12, (R() - 0.5) * 12, (R() - 0.5) * 12)
      d.s.set(0.4 + R() * 1.6, 0.2 + R() * 0.6, 0.4 + R() * 1.4)
      d.life = 0
    })
    shock.visible = true
    shock.position.copy(pos)
    flashSprite.visible = true
    flashSprite.position.copy(pos)
    boomLight.position.copy(pos)
    el.flash.classList.remove('c3d__flash--on')
    void el.flash.offsetWidth
    el.flash.classList.add('c3d__flash--on')
  }

  function drawGraph(state, end, mult, auto, cashed) {
    const gw = el.graph.clientWidth
    const gh = el.graph.clientHeight
    if (!gw || !gh) return
    graph.clearRect(0, 0, gw, gh)
    const pad = 8
    const xMax = Math.max(6000, end * 1.1)
    const yMax = Math.max(200, mult * 1.2, auto ? auto * 1.1 : 0)
    const X = (ms) => pad + (ms / xMax) * (gw - pad * 2)
    const Y = (m) => gh - pad - ((m - 100) / (yMax - 100)) * (gh - pad * 2)
    graph.strokeStyle = 'rgba(241, 233, 214, 0.12)'
    graph.lineWidth = 1
    for (const tick of [200, 500, 1000, 2000]) {
      if (tick > yMax) break
      graph.beginPath()
      graph.moveTo(pad, Y(tick))
      graph.lineTo(gw - pad, Y(tick))
      graph.stroke()
    }
    if (auto && state !== 'waiting') {
      graph.setLineDash([4, 4])
      graph.strokeStyle = 'rgba(233, 207, 134, 0.85)'
      graph.beginPath()
      graph.moveTo(pad, Y(auto))
      graph.lineTo(gw - pad, Y(auto))
      graph.stroke()
      graph.setLineDash([])
    }
    if (state === 'waiting') return
    const color = state === 'boom' ? '#ff6b5e' : tierColor(mult)
    const area = graph.createLinearGradient(0, 0, 0, gh)
    area.addColorStop(0, `${color}66`)
    area.addColorStop(1, `${color}00`)
    graph.beginPath()
    graph.moveTo(X(0), Y(100))
    const steps = 40
    for (let i = 0; i <= steps; i++) {
      const ms = (end * i) / steps
      graph.lineTo(X(ms), Y(i === steps ? mult : multiplierAt(ms)))
    }
    graph.lineTo(X(end), Y(100))
    graph.closePath()
    graph.fillStyle = area
    graph.fill()
    graph.beginPath()
    for (let i = 0; i <= steps; i++) {
      const ms = (end * i) / steps
      const y = Y(i === steps ? mult : multiplierAt(ms))
      if (i) graph.lineTo(X(ms), y)
      else graph.moveTo(X(ms), y)
    }
    graph.strokeStyle = color
    graph.lineWidth = 2.5
    graph.lineJoin = 'round'
    graph.stroke()
    if (cashed && msFor(cashed) <= end) {
      graph.fillStyle = '#f1e9d6'
      graph.beginPath()
      graph.arc(X(msFor(cashed)), Y(cashed), 4, 0, TAU)
      graph.fill()
    }
    graph.fillStyle = color
    graph.beginPath()
    graph.arc(X(end), Y(mult), state === 'boom' ? 5 : 3.5, 0, TAU)
    graph.fill()
  }

  function updateMarks(auto, cashed, flags) {
    const key = `${auto}|${cashed}|${(flags ?? []).map((f) => `${f.name}:${f.mult}`).join(',')}`
    if (key === marksKey) return
    marksKey = key
    el.marks.textContent = ''
    const items = []
    const add = (mult, text, cls) => items.push({ y: altitudeOf(mult), text, cls })
    const others = (flags ?? []).filter((f) => f.mult).slice(0, 6)
    for (const f of others) add(f.mult, `${f.name} ${fmtMult(f.mult)}`, 'c3d__mark--other')
    if (auto) add(auto, `Auto ${fmtMult(auto)}`, 'c3d__mark--auto')
    if (cashed) add(cashed, `Tú ${fmtMult(cashed)}`, 'c3d__mark--me')
    // Las que caen juntas se separan un poco hacia arriba para no taparse.
    items.sort((p, q) => p.y - q.y)
    items.forEach((item, i) => {
      if (i && item.y - items[i - 1].y < 0.055) item.y = items[i - 1].y + 0.055
      const m = document.createElement('span')
      m.className = `c3d__mark ${item.cls}`
      m.style.setProperty('--y', item.y)
      m.textContent = item.text
      el.marks.appendChild(m)
    })
  }

  // frame: { t, round, boom, auto, cashed, flags } → { state, mult, flown }
  function draw(frame) {
    const { t, round, boom, auto, cashed, flags } = frame
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - lastReal) / 1000))
    lastReal = now
    elapsed += dt
    if (round !== lastRound) {
      lastRound = round
      resetRound()
      el.id.textContent = String(round % 10000).padStart(4, '0')
    }

    const flown = t - frame.launch
    const boomMs = boom !== null && boom !== undefined ? msFor(boom) : null
    const state = flown < 0 ? 'waiting' : boomMs !== null && flown >= boomMs ? 'boom' : flown >= FLIGHT_MS ? 'landing' : 'flying'
    const end = Math.max(0, boomMs !== null ? Math.min(flown, boomMs) : Math.min(flown, FLIGHT_MS))
    const mult = state === 'boom' ? boom : multiplierAt(end)
    const a = state === 'waiting' ? 0 : clamp01(end / FLIGHT_MS)
    const speedK = state === 'flying' ? smooth(0, 0.6, a) : 0

    // Posición del cohete.
    const ry = rocketY(a)
    const rx = rocketX(a)
    const tilt = Math.atan2(1800 * a, 8320 * Math.max(0.02, a) ** 0.6) * (a > 0 ? 1 : 0)
    rocket.position.set(rx, ry, 0)
    rocket.rotation.set(0, elapsed * 0.25 * (state === 'waiting' ? 0 : 1), -tilt)
    if (!reduced && state === 'flying') {
      rocket.position.x += Math.sin(elapsed * 23) * 0.06 * (1 - a)
      rocket.position.z += Math.cos(elapsed * 19) * 0.06 * (1 - a)
    }
    const nozzle = tmp.set(0, -1.6, 0).applyEuler(rocket.rotation).add(rocket.position)

    // ---- cuenta atrás: brazos, vapor, ignición ----
    const tminus = state === 'waiting' ? -flown : 0
    const armK = state === 'waiting' ? smooth(4200, 2400, tminus) : 1
    arms.forEach((p, i) => (p.rotation.y = armK * (1.35 + i * 0.15)))
    const ignition = state === 'waiting' ? smooth(900, 0, tminus) : 0
    let power = 0
    if (state === 'waiting') power = ignition * 0.75
    else if (state === 'flying' || state === 'landing') power = 1 + speedK * 0.4
    flameOuter.visible = flameInner.visible = power > 0.01 && rocket.visible
    nozzleGlow.visible = flameOuter.visible
    const flick = reduced ? 1 : 1 + Math.sin(elapsed * 41) * 0.06 + Math.sin(elapsed * 67) * 0.05
    const vac = smooth(0.35, 1, a) // en el vacío el penacho se abre
    flameOuter.scale.set(1.15 + vac * 1.6, (5 + power * 8 + speedK * 10) * flick * Math.max(0.25, power), 1.15 + vac * 1.6)
    flameInner.scale.set(0.7 + vac * 0.6, (2.5 + power * 4) * flick * Math.max(0.3, power), 0.7 + vac * 0.6)
    flameOuter.material.uniforms.uPower.value = Math.min(1, power) * (1 - vac * 0.35)
    flameInner.material.uniforms.uPower.value = Math.min(1, power)
    flameOuter.material.uniforms.uTime.value = elapsed
    flameInner.material.uniforms.uTime.value = elapsed
    nozzleGlow.scale.setScalar((4 + power * 5) * flick)
    nozzleGlow.material.opacity = Math.min(1, power)
    flameLight.position.copy(nozzle)
    flameLight.intensity = rocket.visible ? power * (3.2 - smooth(40, 400, ry) * 2.2) * flick : 0
    seaMat.uniforms.uFlame.value = flameLight.intensity * (1 - smooth(20, 300, ry)) * 0.35

    // Vapor en la cuenta atrás, nube de humo al encender y estela al subir.
    if (!reduced && state === 'waiting' && rocket.visible) {
      if (R() < dt * (3 + (1 - armK) * 6)) smoke.spawn({ x: (R() - 0.5) * 3, y: ROCKET_BASE + 2 + R() * 10, z: 1.6, vx: (R() - 0.5) * 2, vy: 1 + R(), vz: 2 + R() * 2, life: 2 + R(), s0: 1.5, s1: 6, c0: [0.75, 0.78, 0.85], alpha: 0.35, fadeIn: 0.3 })
      if (ignition > 0) {
        const k = Math.ceil(ignition * 6)
        for (let i = 0; i < k; i++) {
          const ang = R() * TAU
          smoke.spawn({ x: Math.cos(ang) * 3, y: PAD_TOP + 0.6, z: Math.sin(ang) * 3, vx: Math.cos(ang) * (12 + R() * 14), vy: 2 + R() * 4, vz: Math.sin(ang) * (12 + R() * 14), drag: 1.2, life: 3 + R() * 2.5, s0: 3, s1: 12 + R() * 8, c0: [0.85, 0.5, 0.3], c1: [0.48, 0.48, 0.54], alpha: 0.6, fadeIn: 0.15 })
        }
      }
    }
    if ((state === 'flying' || state === 'landing') && rocket.visible) {
      const nearGround = 1 - smooth(10, 120, ry)
      const per = reduced ? 2 : 4
      const from = hadNozzle ? lastNozzle : nozzle
      for (let i = 0; i < per; i++) {
        const k = (i + R()) / per
        const x = mix(from.x, nozzle.x, k)
        const y = mix(from.y, nozzle.y, k)
        const z = mix(from.z, nozzle.z, k)
        fire.spawn({ x, y: y - 1, z, vx: (R() - 0.5) * 6, vy: -30 - R() * 30, vz: (R() - 0.5) * 6, drag: 3, life: 0.2 + R() * 0.2, s0: 2 + vac * 3, s1: 0.8, c0: [1.8, 0.9, 0.3], c1: [0.8, 0.12, 0.03] })
        const lit = 1 - smooth(0, 0.5, a)
        smoke.spawn({
          x: x + (R() - 0.5) * 1.5,
          y: y - 2,
          z: z + (R() - 0.5) * 1.5,
          vx: (R() - 0.5) * 3,
          vy: -4 - R() * 4,
          vz: (R() - 0.5) * 3,
          drag: 0.6,
          life: 3.5 + R() * 3,
          s0: 3 + vac * 2,
          s1: 18 + R() * 14 + vac * 20,
          c0: [mix(0.45, 0.8, lit * 0.6), mix(0.46, 0.5, lit * 0.6), mix(0.55, 0.36, lit * 0.6)],
          c1: [0.26, 0.28, 0.36],
          alpha: 0.55 * (1 - vac * 0.6),
          fadeIn: 0.12,
        })
      }
      // Al despegar, la nube rueda por la plataforma.
      if (nearGround > 0 && !reduced) {
        for (let i = 0; i < 4 * nearGround; i++) {
          const ang = R() * TAU
          smoke.spawn({ x: Math.cos(ang) * 4, y: PAD_TOP + 0.8, z: Math.sin(ang) * 4, vx: Math.cos(ang) * (14 + R() * 16), vy: 2 + R() * 4, vz: Math.sin(ang) * (14 + R() * 16), drag: 1.1, life: 4 + R() * 3, s0: 4, s1: 14 + R() * 8, c0: [0.8, 0.5, 0.32], c1: [0.42, 0.42, 0.48], alpha: 0.6, fadeIn: 0.1 })
        }
      }
      lastNozzle.copy(nozzle)
      hadNozzle = true
    }

    // ---- explosión ----
    if (state === 'boom' && boomAt === null) {
      const fresh = lastState === 'flying' || lastState === 'landing' || (lastState === 'waiting' && boom <= 101)
      explode(elapsed, rocket.position, fresh && flown - boomMs < 1500)
    }
    if (boomAt !== null) {
      const since = elapsed - boomAt
      if (boomAnimated) {
        const k = clamp01(since / 0.8)
        shock.visible = k < 1
        shock.scale.setScalar(3 + k * 60)
        shock.quaternion.copy(camera.quaternion)
        shock.material.opacity = (1 - k) ** 1.5
        flashSprite.visible = since < 0.6
        flashSprite.scale.setScalar(40 + since * 90)
        flashSprite.material.opacity = Math.max(0, 1 - since / 0.6)
        boomLight.intensity = Math.max(0, 5 * (1 - since / 0.7))
        let alive = false
        debris.forEach((d, i) => {
          d.life += dt
          d.v.y -= 30 * dt
          d.v.multiplyScalar(Math.exp(-0.5 * dt))
          d.p.addScaledVector(d.v, dt)
          d.r.x += d.w.x * dt
          d.r.y += d.w.y * dt
          d.r.z += d.w.z * dt
          const fade = 1 - smooth(3, 5, d.life)
          if (fade > 0) alive = true
          debrisMesh.setMatrixAt(i, _m.compose(d.p, _q.setFromEuler(d.r), tmp2.copy(d.s).multiplyScalar(Math.max(0.001, fade))))
          // Los restos caen ardiendo y dejando humo.
          if (!reduced && d.life < 2.2 && R() < 0.7) {
            fire.spawn({ x: d.p.x, y: d.p.y, z: d.p.z, life: 0.3 + R() * 0.3, s0: 2.2, s1: 0.8, c0: [3, 1.6, 0.5], c1: [1, 0.15, 0.05] })
            if (R() < 0.5) smoke.spawn({ x: d.p.x, y: d.p.y, z: d.p.z, vy: 1, life: 2 + R() * 1.5, s0: 2, s1: 9, c0: [0.3, 0.27, 0.28], alpha: 0.5, fadeIn: 0.1 })
          }
        })
        debrisMesh.instanceMatrix.needsUpdate = true
        debrisMesh.visible = alive
      }
    }
    if (lastState === 'boom' && state !== 'boom') rocket.visible = true

    // ---- cápsula al retirar ----
    if (cashed && podRound !== round && (state === 'flying' || state === 'landing') && flown - msFor(cashed) < 1500 && flown >= msFor(cashed)) {
      podRound = round
      pod.visible = true
      podT = 0
      pod.position.copy(rocket.position).add(tmp2.set(0, 17, 0).applyEuler(rocket.rotation))
      const vUp = state === 'flying' ? (ALT_H * 1.6 * a ** 0.6) / (FLIGHT_MS / 1000) : 0
      podVel.set(6, vUp * 0.97, 9)
      for (let i = 0; i < 70; i++) {
        tmp2.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(10 + R() * 30)
        fire.spawn({ x: pod.position.x, y: pod.position.y, z: pod.position.z, vx: tmp2.x + podVel.x, vy: tmp2.y + podVel.y, vz: tmp2.z + podVel.z, drag: 2, life: 0.8 + R() * 0.8, s0: 2.2, s1: 1, c0: [3.4, 2.6, 0.8], c1: [1.6, 0.9, 0.1] })
      }
      el.tagText.textContent = fmtMult(cashed)
      tagShown = true
      el.tag.classList.add('c3d__tag--on')
    }
    if (pod.visible) {
      podT += dt
      const open = smooth(0.25, 0.8, podT)
      podVel.y -= 12 * dt
      podVel.multiplyScalar(Math.exp(-(0.12 + open * 0.5) * dt))
      pod.position.addScaledVector(podVel, dt)
      pod.userData.canopy.scale.set(open, open * 0.9 + 0.1, open)
      pod.userData.cords.visible = open > 0.1
      pod.rotation.z = Math.sin(podT * 2) * 0.12
      if (podT > 12) pod.visible = false
      if (tagShown) {
        tmp2.copy(pod.position).project(camera)
        const on = tmp2.z < 1 && Math.abs(tmp2.x) < 1.1 && Math.abs(tmp2.y) < 1.1 && podT < 4
        el.tag.style.transform = `translate(${((tmp2.x + 1) / 2) * w}px, ${((1 - tmp2.y) / 2) * h}px)`
        el.tag.classList.toggle('c3d__tag--on', on)
        if (podT >= 4) tagShown = false
      }
    } else if (tagShown) {
      el.tag.classList.remove('c3d__tag--on')
      tagShown = false
    }

    // ---- cámara ----
    const shakeAmp = reduced
      ? 0
      : state === 'flying'
        ? 0.9 * (1 - smooth(0, 3000, flown)) + 0.18 * speedK
        : state === 'waiting'
          ? ignition * 0.35
          : boomAt !== null && boomAnimated
            ? 2.6 * Math.max(0, 1 - (elapsed - boomAt) / 0.9)
            : 0
    let fov = 50
    if (state === 'waiting') {
      const th = reduced ? 0.15 : Math.sin(elapsed * 0.11) * 0.55
      const push = smooth(3500, 600, tminus)
      const rad = 50 - push * 16
      camPos.set(Math.sin(th) * rad, 12 + 4 * Math.cos(elapsed * 0.07) - push * 2, Math.cos(th) * rad)
      camLook.set(-1.5, 12 + push * 0, 0)
      groundCam.copy(camPos)
      groundSet = true
    } else if (state === 'flying' || state === 'landing') {
      if (!groundSet) {
        groundCam.set(18, 10, 44)
        groundSet = true
      }
      const b = smooth(700, 3400, flown)
      const phi = 0.35 + a * 0.55
      const dist = 42 + 26 * speedK
      const offY = mix(-12, 9, smooth(0.25, 0.75, a))
      tmp2.set(rocket.position.x + Math.sin(phi) * dist, rocket.position.y + offY, rocket.position.z + Math.cos(phi) * dist)
      camPos.lerpVectors(groundCam, tmp2, b)
      camLook.copy(rocket.position)
      camLook.y += mix(10, mix(9, 3, smooth(0.25, 0.75, a)), b)
      fov = mix(mix(50, 26, smooth(200, 1800, flown)), 50 + 8 * speedK, b)
    } else if (state === 'boom') {
      const since = boomAt === null ? 0 : elapsed - boomAt
      if (!boomAnimated && since === 0) {
        camBoom.set(boomPos.x + 40, boomPos.y + 4, boomPos.z + 60)
      }
      tmp2.copy(camBoom).sub(boomPos).normalize()
      camPos.copy(camBoom).addScaledVector(tmp2, 12 * (1 - Math.exp(-since * 0.8)) + Math.min(since, 12) * 2)
      camPos.y = Math.max(camPos.y, boomPos.y + 10) // una explosión en la plataforma se mira un poco desde arriba
      camLook.copy(boomPos)
    }
    keepAbove(camPos)
    camera.position.copy(camPos)
    if (shakeAmp > 0) camera.position.add(tmp2.set((R() - 0.5) * shakeAmp, (R() - 0.5) * shakeAmp, (R() - 0.5) * shakeAmp))
    keepAbove(camera.position)
    camera.lookAt(camLook)
    tmp2.copy(camPos).sub(rocket.position).setY(0).normalize()
    sunLight.position.copy(rocket.position).addScaledVector(tmp2, 100).add(_v.set(tmp2.z * 60, 70, -tmp2.x * 60))
    sunLight.target.position.copy(rocket.position)
    sunLight.target.updateMatrixWorld()
    sunLight.intensity = mix(0.35, 2.4, smooth(0.12, 0.55, a))
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const scale = (renderer.getDrawingBufferSize(buf).y / 2) / Math.tan(MathUtils.degToRad(camera.fov / 2))
    smoke.points.material.uniforms.uScale.value = scale
    fire.points.material.uniforms.uScale.value = scale
    townMat.uniforms.uScale.value = scale
    snowMat.uniforms.uScale.value = scale

    // ---- cielo y entorno según la altura de la cámara ----
    const camA = clamp01(Math.pow(Math.max(0, camera.position.y - ROCKET_BASE) / ALT_H, 1 / 1.6))
    skyGroup.position.copy(camera.position)
    domeMat.uniforms.uAlt.value = camA
    domeMat.uniforms.uTime.value = elapsed
    starMat.uniforms.uOpacity.value = 0.35 + 0.65 * smooth(0, 0.5, camA)
    starMat.uniforms.uTime.value = elapsed
    scene.fog.color.copy(COL.fogNight).lerp(COL.fogSpace, smooth(0, 0.5, camA))
    hemi.intensity = 0.75 * (1 - smooth(0.2, 0.7, camA)) + 0.25
    seaMat.uniforms.uTime.value = elapsed
    townMat.uniforms.uTime.value = elapsed
    // La luna: en el horizonte al principio; sube y crece al acercarte.
    const moonK = smooth(0.3, 1, camA)
    const moonEl = mix(0.035, 0.2, moonK)
    setMoonDir(moonEl)
    const moonR = mix(330, 1250, moonK ** 1.4)
    moon.scale.setScalar(moonR)
    moon.position.copy(moonDir).multiplyScalar(9000)
    moon.rotation.y = 0.6
    moonGlow.position.copy(moon.position)
    moonGlow.scale.setScalar(moonR * 3.2)
    moonLight.position.copy(moonDir).multiplyScalar(200).add(camera.position)
    moonLight.target.position.copy(camera.position)
    moonLight.target.updateMatrixWorld()
    // La Tierra curvada debajo.
    const earthK = smooth(0.42, 1, camA)
    earth.visible = earthK > 0.001
    if (earth.visible) {
      const dip = MathUtils.degToRad(mix(34, 7, earthK))
      const hgt = RE / Math.cos(dip) - RE
      earth.position.set(0, -RE - hgt, 0)
      earthMat.uniforms.uOpacity.value = smooth(0, 0.25, earthK)
    }
    // El planeta asoma por detrás de la Tierra al final.
    const planetK = smooth(0.72, 1, camA)
    planet.visible = planetK > 0.001
    if (planet.visible) {
      const el2 = mix(-0.2, 0.08, planetK)
      const yaw = -1.2
      planet.position.set(Math.sin(yaw) * Math.cos(el2), Math.sin(el2), -Math.cos(yaw) * Math.cos(el2)).multiplyScalar(9000)
      planet.scale.setScalar(mix(500, 900, planetK))
      planet.rotation.y = elapsed * 0.02
    }
    // Al subir, la niebla se cierra sobre el suelo y luego se esconde: debajo asoma la Tierra.
    const fogFar = mix(2600, 1000, smooth(0.2, 0.42, camA))
    scene.fog.far = fogFar
    seaMat.uniforms.uFogFar.value = fogFar
    seaMat.uniforms.uFogNear.value = Math.min(260, fogFar * 0.5)
    scene.fog.near = Math.min(260, fogFar * 0.5)
    for (const g of ground) g.visible = camA < 0.44

    // Nieve.
    if (SNOW) {
      const snowK = 1 - smooth(40, 160, camera.position.y)
      snowPts.visible = snowK > 0.01
      if (snowPts.visible) {
        snowMat.uniforms.uOpacity.value = 0.75 * snowK
        for (let i = 0; i < SNOW; i++) {
          let y = snowPos[i * 3 + 1] - dt * (4 + (i % 5))
          if (y < 0) y += 70
          snowPos[i * 3 + 1] = y
          snowPos[i * 3] += Math.sin(elapsed * 0.7 + i) * dt * 0.8
        }
        snowGeo.attributes.position.needsUpdate = true
      }
    }

    // Estelas de velocidad.
    const streakK = state === 'flying' && !reduced ? smooth(0.15, 0.6, a) : 0
    streaks.visible = streakK > 0.01
    if (streaks.visible) {
      const v = (ALT_H * 1.6 * Math.max(0.05, a) ** 0.6) / (FLIGHT_MS / 1000)
      const len = 4 + v * 0.03
      streakMat.opacity = 0.16 * streakK
      for (let i = 0; i < STREAKS; i++) {
        const s = streakSeed[i]
        s.y -= v * 1.2 * dt
        if (s.y < -170) s.y += 340
        const x = rocket.position.x + s.x
        const y = rocket.position.y + s.y
        const z = rocket.position.z + s.z
        streakPos.set([x, y, z, x, y + len, z], i * 6)
      }
      streakGeo.attributes.position.needsUpdate = true
    }

    // Luces de Navidad que titilan y baliza.
    for (let i = 0; i < bulbs.length; i++) {
      const k = reduced ? 1 : 0.55 + 0.45 * Math.max(0, Math.sin(elapsed * 2.2 + i * 1.7))
      bulbMesh.setColorAt(i, bulbTmp.copy(bulbBase[i]).multiplyScalar(k))
    }
    bulbMesh.instanceColor.needsUpdate = true
    beacon.material.color.setRGB(Math.sin(elapsed * 5) > 0 ? 5 : 0.4, 0.1, 0.1)

    smoke.update(dt)
    fire.update(dt)

    // ---- rotulación ----
    if (state === 'flying' && lastState === 'waiting') caption('¡Despegue!', 'c3d__cap--go')
    if (state === 'flying') {
      while (milestone < MILESTONES.length && a >= MILESTONES[milestone][0]) {
        caption(MILESTONES[milestone][1])
        milestone++
      }
    } else if (state === 'waiting' && tminus <= 900 && !ignitionShown) {
      ignitionShown = true
      if (tminus > 300) caption('Ignición', 'c3d__cap--go')
    }
    if (capTimer > 0) {
      capTimer -= dt
      if (capTimer <= 0) el.cap.classList.remove('c3d__cap--on')
    }
    let tele
    if (state === 'waiting') {
      const s = Math.ceil(tminus / 1000)
      tele = [`T−${String(s).padStart(2, '0')}`, tminus < 900 ? 'Ignición' : armK > 0.5 ? 'Brazos retirados' : 'Cargando combustible']
    } else if (state === 'boom') {
      tele = ['Señal perdida', `Explotó en ${fmtMult(boom)}`]
    } else {
      const km = 420 * a ** 1.6
      const kmh = 28000 * a ** 0.9
      tele = [`Alt ${km.toLocaleString('es-ES', { maximumFractionDigits: km < 10 ? 2 : 1, minimumFractionDigits: km < 10 ? 2 : 1 })} km`, `Vel ${Math.round(kmh).toLocaleString('es-ES')} km/h`]
    }
    const teleKey = tele.join('|')
    if (teleKey !== shownTele) {
      shownTele = teleKey
      el.tl1.textContent = tele[0]
      el.tl2.textContent = tele[1]
    }
    el.alt.style.setProperty('--a', a)
    el.alt.dataset.state = state
    el.alt.style.setProperty('--tone', state === 'boom' ? '#ff6b5e' : tierColor(mult))
    updateMarks(auto, cashed, state === 'boom' ? flags : [])
    drawGraph(state, end, mult, auto, cashed)
    if (fadeFrom !== null) {
      const k = clamp01((now - fadeFrom) / 600)
      el.fade.style.opacity = String(1 - k)
      if (k >= 1) fadeFrom = null
    }

    composer.render(dt)
    lastState = state
    return { state, mult, flown }
  }

  function destroy() {
    canvas.removeEventListener('webglcontextlost', onLost)
    const all = []
    scene.traverse((obj) => all.push(obj))
    skyScene.traverse((obj) => all.push(obj))
    all.forEach((obj) => {
      obj.geometry?.dispose?.()
      const m = obj.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m?.dispose?.()
    })
    disposables.forEach((x) => x.dispose?.())
    composer.dispose?.()
    bloom.dispose?.()
    renderer.dispose()
    root.remove()
  }

  return { draw, resize, destroy }
}

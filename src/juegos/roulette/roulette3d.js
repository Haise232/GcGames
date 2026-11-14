// La rueda de la Ruleta en 3D (three.js). Se carga aparte (import dinámico desde Roulette.jsx); si no hay WebGL, la
// pantalla usa la rueda SVG de siempre. Expone lo mismo que necesita la pantalla: draw(frame), resize() y destroy().
//
// Una rueda europea sobre el tapete: cuenco de madera con su pista, rombos de latón, rotor con las 37 casillas y la torreta
// cromada. La rueda gira siempre con el reloj del servidor (todos la ven igual); tras el «no va más» la bola corre por la
// pista, baja por los rombos, rebota entre las casillas y se queda en la suya, y la cámara acaba en primer plano del
// número. Los números relámpago se marcan con un haz de luz, una etiqueta y rayos al lanzar la bola.
//
// frame: { t, spin: { number, launch, land } | null, rest: número donde descansa la bola | null, lucky: { n: ×N } }
// Nada de lo que se ve decide nada: el número lo da el servidor y los tiempos salen de su reloj.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SEGMENT, WHEEL, colorOf } from './roulette.js'

const TAU = Math.PI * 2
const SEG = (SEGMENT * Math.PI) / 180
const WHEEL_TURN_MS = 9000 // la rueda nunca se para: una vuelta cada 9 s (igual que la SVG)
const BALL_REVS = 5
const BALL_R = 0.3
const POCKET_R = 7.6 // radio donde descansa la bola
const TRACK_R = 11.7 // radio de la pista por la que corre
const COLORS = { red: '#c0262d', black: '#16171c', green: '#13804a' }
const NAMES = { red: 'Rojo', black: 'Negro', green: 'Verde' }

const clamp01 = (k) => Math.min(1, Math.max(0, k))
const mix = (a, b, k) => a + (b - a) * k
const smooth = (a, b, x) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
// Punto a `a` radianes en el sentido de las agujas (visto desde arriba, 0 = al fondo) y radio r.
const polar = (a, r, y = 0, out = new Vector3()) => out.set(Math.sin(a) * r, y, -Math.cos(a) * r)

// Perfil del cuenco: (radio, altura) desde el borde del rotor hasta el canto exterior.
const BOWL = [
  [9.45, -0.12],
  [10.2, 0.12],
  [11.0, 0.36],
  [11.55, 0.5],
  [11.85, 0.62],
  [12.0, 0.95],
  [12.05, 1.4],
  [12.25, 1.55],
  [13.3, 1.5],
  [13.65, 1.15],
  [13.7, -0.7],
]
// Altura de la superficie bajo la bola (cuenco por fuera, casillas por dentro).
function surfaceY(r) {
  if (r < 8.3) return -0.12
  if (r < 9.45) return mix(0.12, -0.12, (r - 8.3) / 1.15)
  for (let i = 1; i < BOWL.length; i++) {
    if (r <= BOWL[i][0]) return mix(BOWL[i - 1][1], BOWL[i][1], (r - BOWL[i - 1][0]) / (BOWL[i][0] - BOWL[i - 1][0]))
  }
  return 1.5
}

// Recorrido de la bola según el avance del giro p (0 lanzada, 1 en su casilla): radio y salto.
function ballPath(p) {
  if (p < 0.6) return { r: TRACK_R, hop: 0 }
  if (p < 0.8) {
    const k = smooth(0.6, 0.8, p)
    const r = mix(TRACK_R, 8.9, k)
    // Golpe contra un rombo a medio camino.
    const hop = Math.max(0, Math.sin(clamp01((p - 0.68) / 0.05) * Math.PI)) * 0.55
    return { r, hop }
  }
  if (p < 0.93) {
    const k = (p - 0.8) / 0.13
    const r = mix(8.6, POCKET_R, k) + Math.sin(k * Math.PI * 3) * 0.35 * (1 - k)
    const hop = Math.abs(Math.sin(k * Math.PI * 4)) * 0.6 * (1 - k) ** 1.4
    return { r, hop }
  }
  return { r: POCKET_R, hop: 0 }
}

// Anillo con UV propias: u a lo largo de la vuelta (empezando media casilla antes del cero) y v de dentro afuera.
function ringGeometry(r0, r1, y0, y1, v0, v1, segs = 37 * 6) {
  const pos = []
  const uv = []
  const index = []
  for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * TAU - SEG / 2
    for (let k = 0; k <= 1; k++) {
      const r = k ? r1 : r0
      pos.push(Math.sin(a) * r, k ? y1 : y0, -Math.cos(a) * r)
      uv.push(j / segs, k ? v1 : v0)
    }
  }
  for (let j = 0; j < segs; j++) {
    const a = j * 2
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

// La tira de las casillas: abajo (v < 0.45) el fondo de la casilla; arriba, el número sobre su color.
function pocketTexture() {
  const W = 4096
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const w = W / WHEEL.length
  WHEEL.forEach((n, i) => {
    const x = i * w
    const col = COLORS[colorOf(n)]
    // Fondo de la casilla (más oscuro) y banda del número.
    g.fillStyle = col
    g.fillRect(x, 0, w + 1, H)
    g.fillStyle = 'rgba(0,0,0,0.38)'
    g.fillRect(x, H * 0.55, w + 1, H * 0.45)
    const grad = g.createLinearGradient(0, 0, 0, H * 0.5)
    grad.addColorStop(0, 'rgba(255,255,255,0.10)')
    grad.addColorStop(1, 'rgba(0,0,0,0.12)')
    g.fillStyle = grad
    g.fillRect(x, 0, w + 1, H * 0.5)
    // Separadores dorados en la banda del número.
    g.fillStyle = '#d9b45a'
    g.fillRect(x - 2, 0, 4, H * 0.5)
    g.save()
    g.translate(x + w / 2, H * 0.25)
    g.fillStyle = '#f6efdf'
    g.font = `700 ${Math.round(w * 0.56)}px Georgia, 'Times New Roman', serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(n), 0, 4)
    g.restore()
  })
  g.fillStyle = '#d9b45a'
  g.fillRect(0, H * 0.5 - 3, W, 6)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function feltTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#0d4a36'
  g.fillRect(0, 0, 512, 512)
  const img = g.getImageData(0, 0, 512, 512)
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (Math.random() - 0.5) * 18
    img.data[i] += k
    img.data[i + 1] += k
    img.data[i + 2] += k
  }
  g.putImageData(img, 0, 0)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

function labelTexture(text) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(20, 14, 2, 0.85)'
  g.beginPath()
  g.roundRect(18, 28, 220, 72, 36)
  g.fill()
  g.strokeStyle = '#ffd34a'
  g.lineWidth = 5
  g.stroke()
  g.fillStyle = '#ffd34a'
  g.font = "800 52px system-ui, sans-serif"
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 128, 66)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

const glowTexture = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.3, 'rgba(255,255,255,0.45)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

export function createWheel3D(host, { reduced = false, onFail } = {}) {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const prCap = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
  const renderer = new WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance', alpha: true })
  renderer.setPixelRatio(prCap)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  const canvas = renderer.domElement
  canvas.className = 'r3w__gl'
  const onLost = (event) => {
    event.preventDefault()
    onFail?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  const root = document.createElement('div')
  root.className = 'r3w'
  root.innerHTML = `
    <div class="r3w__vig"></div>
    <div class="r3w__flash"></div>
    <div class="r3w__lucky"></div>
    <div class="r3w__result"><b></b><span></span></div>`
  root.prepend(canvas)
  host.appendChild(root)
  const elLucky = root.querySelector('.r3w__lucky')
  const elResult = root.querySelector('.r3w__result')
  const elResultN = root.querySelector('.r3w__result b')
  const elResultName = root.querySelector('.r3w__result span')
  const elFlash = root.querySelector('.r3w__flash')

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  scene.environmentIntensity = 0.4
  const camera = new PerspectiveCamera(38, 1, 0.1, 400)
  const disposables = [envTex, pmrem]
  const keep = (x) => {
    disposables.push(x)
    return x
  }

  // Luces: un foco cálido encima de la mesa (con sombras), relleno frío y luz de ambiente.
  const spot = new SpotLight('#fff1d6', 900, 80, 0.62, 0.55, 2)
  spot.position.set(4, 34, 10)
  spot.castShadow = true
  spot.shadow.mapSize.set(1024, 1024)
  spot.shadow.bias = -0.0004
  spot.shadow.radius = 4
  scene.add(spot, spot.target)
  scene.add(new HemisphereLight('#c9d6ff', '#20140c', 0.35), new AmbientLight('#ffffff', 0.05))
  const hitLight = new PointLight('#ffd34a', 0, 14, 2)
  scene.add(hitLight)

  // Tapete y su viñeta de luz.
  const feltTex = keep(feltTexture())
  const felt = new Mesh(keep(new PlaneGeometry(140, 140).rotateX(-Math.PI / 2)), keep(new MeshStandardMaterial({ map: feltTex, roughness: 0.95, metalness: 0 })))
  felt.position.y = -0.7
  felt.receiveShadow = true
  scene.add(felt)
  const gold = keep(new MeshStandardMaterial({ color: '#d4ab52', metalness: 1, roughness: 0.25 }))
  const printRing = new Mesh(keep(new RingGeometry(16.6, 16.85, 128).rotateX(-Math.PI / 2)), keep(new MeshBasicMaterial({ color: new Color('#c8a24b').multiplyScalar(0.55) })))
  printRing.position.y = -0.69
  scene.add(printRing)

  // El cuenco: madera oscura por fuera, pista pulida por dentro y canto de latón.
  const wood = keep(new MeshPhysicalMaterial({ color: '#4a2412', roughness: 0.35, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18 }))
  const trackMat = keep(new MeshPhysicalMaterial({ color: '#8a5a33', roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }))
  const chrome = keep(new MeshStandardMaterial({ color: '#e8ecf2', metalness: 1, roughness: 0.08 }))
  const lathe = (pts, mat) => {
    const m = new Mesh(keep(new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), 128)), mat)
    m.receiveShadow = true
    scene.add(m)
    return m
  }
  lathe(BOWL.slice(0, 7), trackMat)
  lathe(BOWL.slice(6), wood)
  const rim = new Mesh(keep(new TorusGeometry(12.2, 0.09, 8, 160).rotateX(Math.PI / 2)), gold)
  rim.position.y = 1.52
  scene.add(rim)
  const rim2 = new Mesh(keep(new TorusGeometry(13.62, 0.07, 8, 160).rotateX(Math.PI / 2)), gold)
  rim2.position.y = 1.22
  scene.add(rim2)
  // Rombos de latón en la bajada de la pista.
  const diamondGeo = keep(new OctahedronGeometry(1, 0))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + SEG * 2
    const d = new Mesh(diamondGeo, gold)
    polar(a, 10.6, 0.36, d.position)
    d.scale.set(0.22, 0.16, 0.55)
    d.rotation.y = -a
    d.castShadow = true
    scene.add(d)
  }

  // El rotor (gira): casillas con sus números, separadores de latón, cono de madera y torreta cromada.
  const rotor = new Group()
  scene.add(rotor)
  const pocketTex = keep(pocketTexture())
  const pocketMat = keep(new MeshStandardMaterial({ map: pocketTex, roughness: 0.4, metalness: 0.05, side: DoubleSide }))
  const pockets = new Mesh(keep(ringGeometry(6.9, 8.3, -0.14, -0.12, 0.02, 0.44)), pocketMat)
  const numbers = new Mesh(keep(ringGeometry(8.3, 9.45, 0.14, -0.12, 0.52, 0.98)), pocketMat)
  pockets.receiveShadow = true
  numbers.receiveShadow = true
  rotor.add(pockets, numbers)
  const fretGeo = keep(new BoxGeometry(0.07, 0.42, 1.45))
  for (let i = 0; i < WHEEL.length; i++) {
    const a = (i + 0.5) * SEG
    const f = new Mesh(fretGeo, gold)
    polar(a, 7.6, 0.07, f.position)
    f.rotation.y = -a
    f.castShadow = true
    rotor.add(f)
  }
  const innerRim = new Mesh(keep(new TorusGeometry(6.9, 0.08, 8, 160).rotateX(Math.PI / 2)), gold)
  innerRim.position.y = 0.05
  const midRim = new Mesh(keep(new TorusGeometry(8.3, 0.06, 8, 160).rotateX(Math.PI / 2)), gold)
  midRim.position.y = 0.13
  rotor.add(innerRim, midRim)
  const cone = new Mesh(
    keep(new LatheGeometry([[6.9, -0.05], [6.2, 0.2], [4.6, 0.65], [2.8, 1.05], [1.3, 1.3], [0.9, 1.34]].map(([r, y]) => new Vector2(r, y)), 96)),
    wood,
  )
  cone.receiveShadow = true
  rotor.add(cone)
  for (const [r, y] of [[5.8, 0.36], [3.6, 0.9]]) {
    const ring = new Mesh(keep(new TorusGeometry(r, 0.05, 6, 128).rotateX(Math.PI / 2)), gold)
    ring.position.y = y
    rotor.add(ring)
  }
  {
    const turret = new Group()
    const add = (geo, y, x = 0, z = 0) => {
      const m = new Mesh(keep(geo), chrome)
      m.position.set(x, y, z)
      m.castShadow = true
      turret.add(m)
      return m
    }
    add(new CylinderGeometry(1.0, 1.15, 0.4, 48), 1.5)
    add(new CylinderGeometry(0.28, 0.4, 1.9, 32), 2.6)
    add(new SphereGeometry(0.45, 32, 16), 3.65)
    add(new SphereGeometry(0.22, 16, 8), 4.15)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU
      const arm = add(new CylinderGeometry(0.11, 0.11, 3.6, 16), 2.15)
      arm.rotation.z = Math.PI / 2
      arm.rotation.y = a
      const tip = add(new SphereGeometry(0.28, 20, 12), 2.15)
      polar(a + Math.PI / 2, 1.8, 2.15, tip.position)
    }
    rotor.add(turret)
  }

  // La bola.
  const ball = new Mesh(keep(new SphereGeometry(BALL_R, 32, 16)), keep(new MeshPhysicalMaterial({ color: '#fbfbf6', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 })))
  ball.castShadow = true
  scene.add(ball)
  const ballGlow = new Sprite(keep(new SpriteMaterial({ map: keep(glowTexture()), color: new Color(1.6, 1.4, 0.9), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 })))
  ballGlow.scale.setScalar(2.4)
  scene.add(ballGlow)

  // Resplandor de la casilla ganadora (va en el rotor).
  const hitGlow = new Mesh(
    keep(new RingGeometry(6.95, 9.4, 6, 1, -SEG / 2, SEG).rotateX(-Math.PI / 2)),
    keep(new MeshBasicMaterial({ color: new Color(1.3, 1.0, 0.35), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })),
  )
  hitGlow.position.y = 0.2
  hitGlow.visible = false
  rotor.add(hitGlow)

  // Relámpagos: un haz de luz y su etiqueta sobre cada número; los rayos al lanzar la bola.
  const beamMat = keep(
    new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform float uOpacity; varying float vY;
        void main(){ float k = clamp(vY / 7.0, 0.0, 1.0); float a = (1.0 - k) * (1.0 - k) * smoothstep(0.0, 1.2, vY) * (0.75 + 0.25 * sin(uTime * 9.0 + vY * 3.0));
          gl_FragColor = vec4(vec3(1.5, 1.2, 0.45), a * uOpacity * 0.7); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    }),
  )
  const beamGeo = keep(new CylinderGeometry(0.18, 0.45, 7, 24, 1, true))
  beamGeo.translate(0, 3.5, 0)
  const luckyGroup = new Group()
  rotor.add(luckyGroup)
  let luckyKey = ''
  let luckyLabels = []
  let bolts = []
  const boltMat = keep(new MeshBasicMaterial({ color: new Color(2.2, 2, 1.1), transparent: true, blending: AdditiveBlending, depthWrite: false }))

  function setLucky(lucky) {
    const key = Object.entries(lucky ?? {})
      .map(([n, x]) => `${n}:${x}`)
      .join(',')
    if (key === luckyKey) return
    luckyKey = key
    for (const l of luckyLabels) {
      l.material.map.dispose()
      l.material.dispose()
    }
    luckyLabels = []
    luckyGroup.clear()
    elLucky.textContent = ''
    for (const [n, x] of Object.entries(lucky ?? {})) {
      const a = WHEEL.indexOf(Number(n)) * SEG
      const beam = new Mesh(beamGeo, beamMat)
      polar(a, 7.8, 0, beam.position)
      luckyGroup.add(beam)
      const label = new Sprite(new SpriteMaterial({ map: labelTexture(`⚡ ×${x}`), transparent: true, depthTest: false }))
      polar(a, 7.8, 5.2, label.position)
      label.scale.set(3.6, 1.8, 1)
      label.renderOrder = 5
      luckyGroup.add(label)
      luckyLabels.push(label)
      const chip = document.createElement('span')
      chip.className = `r3w__chip r3w__chip--${colorOf(Number(n))}`
      chip.innerHTML = `<b>${n}</b>×${x}`
      elLucky.appendChild(chip)
    }
  }

  function clearBolts() {
    for (const b of bolts) {
      scene.remove(b)
      b.geometry.dispose()
    }
    bolts = []
  }
  function makeBolts(rotorAngle) {
    clearBolts()
    for (const n of Object.keys(lastLucky ?? {})) {
      const a = WHEEL.indexOf(Number(n)) * SEG + rotorAngle
      const end = polar(a, 7.8, 0.2)
      const start = end.clone().add(new Vector3((Math.random() - 0.5) * 6, 16, (Math.random() - 0.5) * 6))
      const pts = []
      const steps = 9
      for (let i = 0; i <= steps; i++) {
        const p = start.clone().lerp(end, i / steps)
        if (i > 0 && i < steps) p.add(new Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6))
        pts.push(p)
      }
      const bolt = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, false, 'catmullrom', 0.05), 40, 0.045, 5), boltMat)
      scene.add(bolt)
      bolts.push(bolt)
    }
  }

  // Postproceso: un brillo suave para el latón, los relámpagos y la casilla ganadora.
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(prCap)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.45, 0.98)
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
  }
  resize()

  // ---------- animación ----------
  let lastReal = performance.now()
  let elapsed = 0
  let lastLucky = null
  let lastSpinKey = null
  let boltUntil = 0
  let boltNext = 0
  let shownResult = null
  const camPos = new Vector3(0, 26, 22)
  const camLook = new Vector3(0, 0, 0)
  const wantPos = new Vector3()
  const wantLook = new Vector3()
  const wantUp = new Vector3(0, 1, 0)
  const ballPos = new Vector3()
  const tmp = new Vector3()

  function draw(frame) {
    const { t, spin, rest, lucky } = frame
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - lastReal) / 1000))
    lastReal = now
    elapsed += dt

    const disc = reduced ? 0 : ((t % WHEEL_TURN_MS) / WHEEL_TURN_MS) * TAU
    rotor.rotation.y = -disc

    // Bola: en su pista mientras gira, cayendo a la casilla al final; si no, descansando en la del último número.
    let ballAngle = null
    let p = 1
    let r = POCKET_R
    let hop = 0
    const launched = spin && t >= spin.launch
    if (launched) {
      const pocket = disc + WHEEL.indexOf(spin.number) * SEG
      const u = reduced ? 0 : Math.max(0, (spin.land - t) / Math.max(1, spin.land - spin.launch))
      // Respecto a la rueda la bola va al revés y frena hasta quedarse en su casilla.
      ballAngle = pocket + BALL_REVS * TAU * u * u
      p = 1 - u
      ;({ r, hop } = ballPath(p))
    } else if (rest !== null && rest !== undefined) {
      ballAngle = disc + WHEEL.indexOf(rest) * SEG
    }
    ball.visible = ballAngle !== null
    if (ball.visible) {
      polar(ballAngle, r, surfaceY(r) + BALL_R + hop, ballPos)
      ball.position.copy(ballPos)
      ball.rotation.x += dt * (launched && p < 0.93 ? 14 : 0)
    }
    const landed = launched && t >= spin.land
    const running = launched && !landed
    ballGlow.position.copy(ballPos)
    ballGlow.material.opacity = running ? 0.2 * (1 - p) : 0

    // Relámpagos.
    const shownLucky = launched ? lucky : {}
    setLucky(shownLucky)
    lastLucky = shownLucky
    const anyLucky = Object.keys(shownLucky ?? {}).length > 0
    beamMat.uniforms.uTime.value = elapsed
    beamMat.uniforms.uOpacity.value = anyLucky && !landed ? 1 : 0
    for (const l of luckyLabels) l.visible = !landed
    const spinKey = spin ? `${spin.launch}` : null
    if (launched && spinKey !== lastSpinKey) {
      lastSpinKey = spinKey
      // Solo con la bola recién lanzada: si entras a mitad de giro no hay rayos.
      if (anyLucky && !reduced && t - spin.launch < 1500) {
        boltUntil = elapsed + 1.1
        elFlash.classList.remove('r3w__flash--on')
        void elFlash.offsetWidth
        elFlash.classList.add('r3w__flash--on')
      }
    }
    if (!launched) lastSpinKey = null
    if (elapsed < boltUntil) {
      if (elapsed >= boltNext) {
        makeBolts(-rotor.rotation.y)
        boltNext = elapsed + 0.09
      }
      boltMat.opacity = 0.6 + Math.random() * 0.4
    } else if (bolts.length) clearBolts()

    // Casilla ganadora.
    hitGlow.visible = landed
    if (landed) {
      const pulse = reduced ? 0.7 : 0.55 + 0.3 * Math.sin(elapsed * 4)
      hitGlow.rotation.y = -WHEEL.indexOf(spin.number) * SEG
      hitGlow.material.opacity = pulse * smooth(0, 0.5, (t - spin.land) / 1000)
      hitLight.position.copy(ballPos).add(tmp.set(0, 1.4, 0))
      hitLight.intensity = 3 * pulse
    } else hitLight.intensity = 0
    const result = landed ? spin.number : null
    if (result !== shownResult) {
      shownResult = result
      if (result === null) elResult.classList.remove('r3w__result--on')
      else {
        const tone = colorOf(result)
        elResult.dataset.tone = tone
        elResultN.textContent = String(result)
        elResultName.textContent = NAMES[tone]
        elResult.classList.add('r3w__result--on')
      }
    }

    // Cámara: vista general que rodea despacio la mesa; con la bola en marcha se acerca un poco y, al caer, plano casi
    // cenital sobre la casilla (con «arriba» hacia fuera, para que el número se lea derecho), girando con la rueda.
    const orbit = reduced ? 0 : Math.sin(elapsed * 0.08) * 0.35
    polar(orbit + Math.PI, 23, 25, wantPos)
    wantLook.set(0, -0.5, 0)
    wantUp.set(0, 1, 0)
    let landK = 0
    if (running) {
      const k = smooth(0, 0.3, p)
      polar(orbit + Math.PI, 19, 21, tmp)
      wantPos.lerp(tmp, k)
      wantLook.lerp(ballPos, smooth(0.5, 0.95, p) * 0.35)
    } else if (landed && ball.visible) {
      const k = smooth(0, 1.1, (t - spin.land) / 1000)
      landK = k
      polar(ballAngle, POCKET_R + 3.2, 9.5, tmp)
      wantPos.lerp(tmp, k)
      wantLook.lerp(ballPos, k)
      polar(ballAngle, 1, 0, tmp)
      wantUp.lerp(tmp, k).normalize()
    }
    const follow = 1 - Math.exp(-dt * (landed ? 2.6 + 9 * landK : 2.2)) // ya encima, la cámara va pegada a la rueda
    camPos.lerp(wantPos, follow)
    camLook.lerp(wantLook, follow)
    camera.up.lerp(wantUp, follow).normalize()
    camera.position.copy(camPos)
    camera.lookAt(camLook)

    composer.render(dt)
    return { landed }
  }

  function destroy() {
    canvas.removeEventListener('webglcontextlost', onLost)
    clearBolts()
    for (const l of luckyLabels) {
      l.material.map.dispose()
      l.material.dispose()
    }
    scene.traverse((obj) => {
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

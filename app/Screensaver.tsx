'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// ============================================================
// 時間帯
// ============================================================
type TimeOfDay = 'morning' | 'daytime' | 'evening' | 'night'

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 17) return 'daytime'
  if (hour >= 17 && hour < 20) return 'evening'
  return 'night'
}

function getTimeTheme(tod: TimeOfDay) {
  switch (tod) {
    case 'morning':
      return { bg: 0xfff8e7, fog: 0xfff8e7, ambient: 0xffeebb, ambientI: 0.7, main: 0xffe8a0, mainI: 1.2, fill: 0xaaddff, fillI: 0.3, customers: 2, greeting: '☀️ おはようございます', floor: 0xf5f0e8, sky: 0xffd4a0, grassColor: 0x8fbc6a }
    case 'daytime':
      return { bg: 0xf0f4f8, fog: 0xf0f4f8, ambient: 0xffffff, ambientI: 0.8, main: 0xffffff, mainI: 1.0, fill: 0x88aaff, fillI: 0.4, customers: 6, greeting: '🛒 いらっしゃいませ', floor: 0xf5f0e8, sky: 0x87ceeb, grassColor: 0x5da840 }
    case 'evening':
      return { bg: 0x2d1b4e, fog: 0x2d1b4e, ambient: 0xff9966, ambientI: 0.5, main: 0xff8844, mainI: 0.8, fill: 0xff6633, fillI: 0.3, customers: 4, greeting: '🌇 こんばんは', floor: 0xe8ddd0, sky: 0xff6644, grassColor: 0x4a7a30 }
    case 'night':
      return { bg: 0x0a0a1a, fog: 0x0a0a1a, ambient: 0x334466, ambientI: 0.3, main: 0xffffcc, mainI: 0.4, fill: 0x4466aa, fillI: 0.2, customers: 1, greeting: '🌙 夜間営業中', floor: 0xd0ccc5, sky: 0x111133, grassColor: 0x1a3310 }
  }
}

// ============================================================
// 店舗レイアウト定数
// ============================================================
const STORE = { xMin: -5, xMax: 5, zMin: -4, zMax: 4, wallH: 4 } as const

// 棚の位置・サイズ（AABB衝突判定用）
const SHELF_DEFS = [
  { x: -3.2, z: -1.5 }, { x: -3.2, z: 1.5 },
  { x: -1.0, z: -1.5 }, { x: -1.0, z: 1.5 },
  { x: 1.2, z: -1.5 },
]
const SHELF_HALF = { x: 0.7, z: 0.35 } // 棚の衝突半径
const COUNTER_CENTER = { x: 4.0, z: 0 }
const COUNTER_HALF = { x: 0.5, z: 1.4 } // 回転後のサイズ

// 通路のウェイポイント（棚の間の安全な歩行ルート）
const WAYPOINTS = [
  { x: -2.1, z: 0 },   // 左棚の間の通路
  { x: 0.1, z: 0 },    // 中央通路
  { x: 2.3, z: 0 },    // 右通路（カウンター手前）
  { x: -2.1, z: -3.0 }, // 左奥
  { x: -2.1, z: 3.0 },  // 左手前
  { x: 0.1, z: -3.0 },  // 中央奥
  { x: 0.1, z: 3.0 },   // 中央手前
  { x: 2.3, z: -2.5 },  // 右奥
  { x: 2.3, z: 2.5 },   // 右手前
  { x: -4.0, z: 0 },    // 壁際左
]

// ============================================================
// ヘルパー：衝突チェック
// ============================================================
function isInsideAABB(px: number, pz: number, cx: number, cz: number, hx: number, hz: number, margin = 0.4): boolean {
  return px > cx - hx - margin && px < cx + hx + margin && pz > cz - hz - margin && pz < cz + hz + margin
}

function isCollidingWithObstacles(px: number, pz: number): boolean {
  for (const s of SHELF_DEFS) {
    if (isInsideAABB(px, pz, s.x, s.z, SHELF_HALF.x, SHELF_HALF.z)) return true
  }
  if (isInsideAABB(px, pz, COUNTER_CENTER.x, COUNTER_CENTER.z, COUNTER_HALF.x, COUNTER_HALF.z)) return true
  return false
}

// ============================================================
// ボクセルキャラクター
// ============================================================
function createPerson(color: number, headColor: number): THREE.Group {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color })
  const skinMat = new THREE.MeshLambertMaterial({ color: headColor })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), bodyMat)
  body.position.y = 0.55
  group.add(body)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat)
  head.position.y = 1.15
  group.add(head)

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.25), bodyMat)
  legL.position.set(-0.12, 0.2, 0)
  group.add(legL)

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.25), bodyMat)
  legR.position.set(0.12, 0.2, 0)
  group.add(legR)

  return group
}

// エプロンつき店員
function createShopkeeper(): THREE.Group {
  const group = createPerson(0x2563eb, 0xfdbcb4)
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.5, 0.05),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  )
  apron.position.set(0, 0.55, 0.18)
  group.add(apron)
  return group
}

// 買い物袋
function createShoppingBag(color: number): THREE.Group {
  const bag = new THREE.Group()
  const bagMat = new THREE.MeshLambertMaterial({ color })
  const bagBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.14), bagMat)
  bagBody.position.y = 0.5
  bag.add(bagBody)
  // 持ち手
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 })
  const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), handleMat)
  handleL.position.set(-0.05, 0.68, 0)
  bag.add(handleL)
  const handleR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), handleMat)
  handleR.position.set(0.05, 0.68, 0)
  bag.add(handleR)
  return bag
}

// ============================================================
// 棚
// ============================================================
function createShelf(): THREE.Group {
  const group = new THREE.Group()
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 })

  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.6), woodMat)
  pillarL.position.set(-0.6, 1.0, 0)
  group.add(pillarL)
  const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.6), woodMat)
  pillarR.position.set(0.6, 1.0, 0)
  group.add(pillarR)

  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.6), woodMat)
    shelf.position.y = 0.4 + i * 0.7
    group.add(shelf)
  }

  const itemColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da, 0xfcbad3, 0xa8d8ea]
  for (let row = 0; row < 3; row++) {
    const count = 2 + Math.floor(Math.random() * 3)
    for (let j = 0; j < count; j++) {
      const c = itemColors[Math.floor(Math.random() * itemColors.length)]
      const w = 0.12 + Math.random() * 0.12
      const h = 0.15 + Math.random() * 0.2
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.15 + Math.random() * 0.1),
        new THREE.MeshLambertMaterial({ color: c })
      )
      item.position.set(-0.4 + j * 0.3, 0.43 + row * 0.7 + h / 2, (Math.random() - 0.5) * 0.2)
      group.add(item)
    }
  }
  return group
}

// ============================================================
// カウンター
// ============================================================
function createCounter(): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: 0xdeb887 })
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.8), mat)
  top.position.y = 1.0
  group.add(top)
  const front = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 0.08), mat)
  front.position.set(0, 0.5, 0.36)
  group.add(front)
  const reg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), new THREE.MeshLambertMaterial({ color: 0x333333 }))
  reg.position.set(0.5, 1.22, 0)
  group.add(reg)
  return group
}

// ============================================================
// 大きな窓（ガラス面は PlaneGeometry）
// ============================================================
function createLargeWindow(skyColor: number, width: number): THREE.Group {
  const group = new THREE.Group()
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x666666 })

  // 外枠
  const thickness = 0.08
  const hTop = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, thickness), frameMat)
  hTop.position.y = 3.0
  group.add(hTop)
  const hBot = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, thickness), frameMat)
  hBot.position.y = 0.6
  group.add(hBot)
  const vL = new THREE.Mesh(new THREE.BoxGeometry(thickness, 2.48, thickness), frameMat)
  vL.position.set(-width / 2, 1.8, 0)
  group.add(vL)
  const vR = new THREE.Mesh(new THREE.BoxGeometry(thickness, 2.48, thickness), frameMat)
  vR.position.set(width / 2, 1.8, 0)
  group.add(vR)
  // 中間仕切り
  const dividers = 3
  for (let i = 1; i < dividers; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.48, thickness), frameMat)
    d.position.set(-width / 2 + (width / dividers) * i, 1.8, 0)
    group.add(d)
  }

  // ガラス
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.1, 2.32),
    new THREE.MeshPhongMaterial({ color: skyColor, transparent: true, opacity: 0.2, shininess: 100 })
  )
  glass.position.set(0, 1.8, -0.02)
  group.add(glass)

  return group
}

// ============================================================
// 外の風景：木
// ============================================================
function createTree(trunkColor: number, leafColor: number): THREE.Group {
  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.2, 0.2),
    new THREE.MeshLambertMaterial({ color: trunkColor })
  )
  trunk.position.y = 0.6
  tree.add(trunk)

  // 三段の葉
  const leafMat = new THREE.MeshLambertMaterial({ color: leafColor })
  for (let i = 0; i < 3; i++) {
    const size = 1.0 - i * 0.25
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(size, 0.5, size), leafMat)
    leaf.position.y = 1.3 + i * 0.45
    tree.add(leaf)
  }
  return tree
}

// ============================================================
// 外の風景：車
// ============================================================
function createCar(bodyColor: number): THREE.Group {
  const car = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor })

  // ボディ下部
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.7), bodyMat)
  lower.position.y = 0.3
  car.add(lower)

  // ボディ上部（キャビン）
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xaaddff, transparent: true, opacity: 0.7 })
  )
  upper.position.set(-0.1, 0.65, 0)
  car.add(upper)

  // タイヤ
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
  const wheelGeo = new THREE.BoxGeometry(0.2, 0.25, 0.15)
  const positions = [
    [-0.5, 0.12, 0.35], [-0.5, 0.12, -0.35],
    [0.5, 0.12, 0.35], [0.5, 0.12, -0.35],
  ]
  positions.forEach(([wx, wy, wz]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.position.set(wx, wy, wz)
    car.add(w)
  })

  return car
}

// ============================================================
// Walker 型
// ============================================================
type Walker = {
  group: THREE.Group
  legL: THREE.Mesh
  legR: THREE.Mesh
  bag: THREE.Group | null
  target: THREE.Vector3
  speed: number
  phase: number
  isWaiting: boolean
  waitTimer: number
  hasBag: boolean
}

// 外を走る車の型
type OutsideCar = {
  group: THREE.Group
  speed: number
  direction: number // 1 or -1
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function Screensaver({ onDismiss }: { onDismiss: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const [timeStr, setTimeStr] = useState('')
  const [textPos, setTextPos] = useState({ x: 0, y: 0 })
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const tod = getTimeOfDay()
    const theme = getTimeTheme(tod)
    setGreeting(theme.greeting)

    // --- Three.js ---
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(theme.bg)
    scene.fog = new THREE.Fog(theme.fog, 12, 35)

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.set(3, 2.5, 3)
    camera.lookAt(0, 0.8, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // ================ 床 ================
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(STORE.xMax - STORE.xMin, STORE.zMax - STORE.zMin),
      new THREE.MeshLambertMaterial({ color: theme.floor })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set((STORE.xMax + STORE.xMin) / 2, 0, (STORE.zMax + STORE.zMin) / 2)
    floor.receiveShadow = true
    scene.add(floor)

    // ================ 四方の壁 ================
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0, side: THREE.DoubleSide })
    const wallWidth = STORE.xMax - STORE.xMin  // 10
    const wallDepth = STORE.zMax - STORE.zMin  // 8

    // 奥壁 (z = zMin) — 窓なし、全面
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(wallWidth, STORE.wallH), wallMat)
    backWall.position.set(0, STORE.wallH / 2, STORE.zMin)
    scene.add(backWall)

    // 左壁 (x = xMin) — 窓なし、全面
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(wallDepth, STORE.wallH), wallMat)
    leftWall.position.set(STORE.xMin, STORE.wallH / 2, 0)
    leftWall.rotation.y = Math.PI / 2
    scene.add(leftWall)

    // --- 手前壁 (z = zMax) — 窓部分をくり抜き ---
    // 窓: 幅6, 中心x=-1, 下端y=0.6, 上端y=3.0
    const fwCx = -1, fwW = 6, fwBot = 0.6, fwTop = 3.0
    // 上部パネル（窓の上〜天井）
    const fwUpperH = STORE.wallH - fwTop
    if (fwUpperH > 0) {
      const fwUpper = new THREE.Mesh(new THREE.PlaneGeometry(wallWidth, fwUpperH), wallMat)
      fwUpper.position.set(0, fwTop + fwUpperH / 2, STORE.zMax)
      fwUpper.rotation.y = Math.PI
      scene.add(fwUpper)
    }
    // 下部パネル（床〜窓の下端）
    if (fwBot > 0) {
      const fwLower = new THREE.Mesh(new THREE.PlaneGeometry(wallWidth, fwBot), wallMat)
      fwLower.position.set(0, fwBot / 2, STORE.zMax)
      fwLower.rotation.y = Math.PI
      scene.add(fwLower)
    }
    // 左パネル（窓の左側）
    const fwLeftW = (wallWidth / 2) - (fwW / 2) + fwCx  // STORE.xMin 側
    if (fwLeftW > 0) {
      const fwLeft = new THREE.Mesh(new THREE.PlaneGeometry(fwLeftW, fwTop - fwBot), wallMat)
      fwLeft.position.set(STORE.xMin + fwLeftW / 2, fwBot + (fwTop - fwBot) / 2, STORE.zMax)
      fwLeft.rotation.y = Math.PI
      scene.add(fwLeft)
    }
    // 右パネル（窓の右側）
    const fwRightEdge = fwCx + fwW / 2
    const fwRightW = (wallWidth / 2) - fwRightEdge
    if (fwRightW > 0) {
      const fwRight = new THREE.Mesh(new THREE.PlaneGeometry(fwRightW, fwTop - fwBot), wallMat)
      fwRight.position.set(fwRightEdge + fwRightW / 2, fwBot + (fwTop - fwBot) / 2, STORE.zMax)
      fwRight.rotation.y = Math.PI
      scene.add(fwRight)
    }

    // --- 右壁 (x = xMax) — 窓部分をくり抜き ---
    // 窓: 幅5, 中心z=0, 下端y=0.6, 上端y=3.0
    const rwCz = 0, rwW = 5, rwBot = 0.6, rwTop = 3.0
    // 上部パネル
    const rwUpperH = STORE.wallH - rwTop
    if (rwUpperH > 0) {
      const rwUpper = new THREE.Mesh(new THREE.PlaneGeometry(wallDepth, rwUpperH), wallMat)
      rwUpper.position.set(STORE.xMax, rwTop + rwUpperH / 2, 0)
      rwUpper.rotation.y = -Math.PI / 2
      scene.add(rwUpper)
    }
    // 下部パネル
    if (rwBot > 0) {
      const rwLower = new THREE.Mesh(new THREE.PlaneGeometry(wallDepth, rwBot), wallMat)
      rwLower.position.set(STORE.xMax, rwBot / 2, 0)
      rwLower.rotation.y = -Math.PI / 2
      scene.add(rwLower)
    }
    // 上パネル（z小さい側）
    const rwTopZ = rwCz - rwW / 2 // 窓の上端z (z小さい側)
    const rwLeftW = (wallDepth / 2) + rwTopZ  // STORE.zMin 側のパネル幅
    if (rwLeftW > 0) {
      const rwLeft = new THREE.Mesh(new THREE.PlaneGeometry(rwLeftW, rwTop - rwBot), wallMat)
      rwLeft.position.set(STORE.xMax, rwBot + (rwTop - rwBot) / 2, STORE.zMin + rwLeftW / 2)
      rwLeft.rotation.y = -Math.PI / 2
      scene.add(rwLeft)
    }
    // 下パネル（z大きい側）
    const rwBotZ = rwCz + rwW / 2
    const rwRightW = (wallDepth / 2) - rwBotZ
    if (rwRightW > 0) {
      const rwRight = new THREE.Mesh(new THREE.PlaneGeometry(rwRightW, rwTop - rwBot), wallMat)
      rwRight.position.set(STORE.xMax, rwBot + (rwTop - rwBot) / 2, rwBotZ + rwRightW / 2)
      rwRight.rotation.y = -Math.PI / 2
      scene.add(rwRight)
    }

    // ================ 天井（内側から見えるが、カメラの邪魔にならないよう半透明） ================
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(wallWidth, wallDepth),
      new THREE.MeshLambertMaterial({ color: 0xf8f4ef, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
    )
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.set(0, STORE.wallH, 0)
    scene.add(ceiling)

    // ================ 窓（手前壁と右壁に大きな窓） ================
    // 手前壁の窓（メインの大窓）
    const frontWindow = createLargeWindow(theme.sky, 6)
    frontWindow.position.set(-1, 0, STORE.zMax - 0.05)
    frontWindow.rotation.y = Math.PI
    scene.add(frontWindow)

    // 右壁の窓
    const rightWindow = createLargeWindow(theme.sky, 5)
    rightWindow.position.set(STORE.xMax - 0.05, 0, 0)
    rightWindow.rotation.y = -Math.PI / 2
    scene.add(rightWindow)

    // ================ 外の地面（窓の外側） ================
    const outsideGround = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshLambertMaterial({ color: theme.grassColor })
    )
    outsideGround.rotation.x = -Math.PI / 2
    outsideGround.position.set(0, -0.01, 0)
    scene.add(outsideGround)

    // 道路（手前側）
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 2.5),
      new THREE.MeshLambertMaterial({ color: 0x444444 })
    )
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0.005, STORE.zMax + 3)
    scene.add(road)
    // 白線
    for (let i = -8; i < 8; i += 2) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      )
      line.rotation.x = -Math.PI / 2
      line.position.set(i, 0.01, STORE.zMax + 3)
      scene.add(line)
    }

    // 歩道
    const sidewalk = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 1.2),
      new THREE.MeshLambertMaterial({ color: 0xccccbb })
    )
    sidewalk.rotation.x = -Math.PI / 2
    sidewalk.position.set(0, 0.005, STORE.zMax + 1.1)
    scene.add(sidewalk)

    // ================ 外の木 ================
    const treePositions = [
      { x: -4, z: STORE.zMax + 1.5 },
      { x: 0, z: STORE.zMax + 1.5 },
      { x: 4, z: STORE.zMax + 1.5 },
      { x: STORE.xMax + 2, z: -2 },
      { x: STORE.xMax + 2, z: 2 },
      { x: -3, z: STORE.zMax + 5.5 },
      { x: 3, z: STORE.zMax + 5.5 },
    ]
    treePositions.forEach(pos => {
      const leafColors = [0x2d8c2d, 0x3da33d, 0x228822, 0x44aa33]
      const tree = createTree(0x6b4226, leafColors[Math.floor(Math.random() * leafColors.length)])
      tree.position.set(pos.x, 0, pos.z)
      tree.scale.setScalar(0.8 + Math.random() * 0.5)
      scene.add(tree)
    })

    // ================ 外の車（行き交う） ================
    const carColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xffffff, 0x333333]
    const outsideCars: OutsideCar[] = []

    for (let i = 0; i < 4; i++) {
      const car = createCar(carColors[Math.floor(Math.random() * carColors.length)])
      const dir = i % 2 === 0 ? 1 : -1
      car.position.set((Math.random() - 0.5) * 16, 0, STORE.zMax + 2.5 + dir * 0.6)
      car.rotation.y = dir > 0 ? 0 : Math.PI
      car.scale.setScalar(0.7)
      scene.add(car)
      outsideCars.push({ group: car, speed: 0.02 + Math.random() * 0.03, direction: dir })
    }

    // 右壁の外にも車を走らせる道路
    const road2 = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 20),
      new THREE.MeshLambertMaterial({ color: 0x444444 })
    )
    road2.rotation.x = -Math.PI / 2
    road2.position.set(STORE.xMax + 4, 0.005, 0)
    scene.add(road2)

    for (let i = 0; i < 2; i++) {
      const car = createCar(carColors[Math.floor(Math.random() * carColors.length)])
      const dir = i % 2 === 0 ? 1 : -1
      car.position.set(STORE.xMax + 3.5 + dir * 0.6, 0, (Math.random() - 0.5) * 12)
      car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
      car.scale.setScalar(0.7)
      scene.add(car)
      outsideCars.push({ group: car, speed: 0.015 + Math.random() * 0.025, direction: dir })
    }

    // ================ 店内の棚 ================
    SHELF_DEFS.forEach(pos => {
      const shelf = createShelf()
      shelf.position.set(pos.x, 0, pos.z)
      shelf.castShadow = true
      scene.add(shelf)
    })

    // ================ レジカウンター ================
    const counter = createCounter()
    counter.position.set(COUNTER_CENTER.x, 0, COUNTER_CENTER.z)
    counter.rotation.y = Math.PI / 2
    scene.add(counter)

    // ================ 店員 ================
    const shopkeeper = createShopkeeper()
    shopkeeper.position.set(4.7, 0, 0)
    shopkeeper.rotation.y = -Math.PI / 2
    scene.add(shopkeeper)

    // ================ お客さん ================
    const allColors = [
      { body: 0xef4444, head: 0xfdbcb4 },
      { body: 0x22c55e, head: 0xf5d0c5 },
      { body: 0xf59e0b, head: 0xfdbcb4 },
      { body: 0x8b5cf6, head: 0xf5d0c5 },
      { body: 0xec4899, head: 0xfdbcb4 },
      { body: 0x06b6d4, head: 0xf5d0c5 },
    ]
    const custColors = allColors.slice(0, theme.customers)

    const bagColors = [0xf5e6ca, 0xc5e1a5, 0xffccbc, 0xb3e5fc, 0xfff9c4]

    const walkers: Walker[] = []

    // ウェイポイントからランダムに選ぶ
    const getRandomWaypoint = () => {
      const wp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)]
      return new THREE.Vector3(wp.x + (Math.random() - 0.5) * 0.6, 0, wp.z + (Math.random() - 0.5) * 0.6)
    }

    // 安全な初期位置
    const getSafeStart = () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const pos = getRandomWaypoint()
        if (!isCollidingWithObstacles(pos.x, pos.z)) return pos
      }
      return new THREE.Vector3(0, 0, 0)
    }

    custColors.forEach((c, i) => {
      const person = createPerson(c.body, c.head)
      const startPos = getSafeStart()
      person.position.copy(startPos)
      scene.add(person)

      const legL = person.children[2] as THREE.Mesh
      const legR = person.children[3] as THREE.Mesh

      // 一部のお客さんが買い物袋を持つ
      const hasBag = Math.random() < 0.5
      let bag: THREE.Group | null = null
      if (hasBag) {
        bag = createShoppingBag(bagColors[Math.floor(Math.random() * bagColors.length)])
        bag.position.set(0.35, 0, 0)
        person.add(bag)
      }

      walkers.push({
        group: person, legL, legR, bag,
        target: getRandomWaypoint(),
        speed: 0.005 + Math.random() * 0.007,
        phase: i * 1.2,
        isWaiting: false, waitTimer: 0,
        hasBag,
      })
    })

    // ================ 天井蛍光灯（夜・夕方） ================
    if (tod === 'night' || tod === 'evening') {
      const lightGeo = new THREE.BoxGeometry(3, 0.05, 0.2)
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffee })
      for (let i = 0; i < 3; i++) {
        const l = new THREE.Mesh(lightGeo, lightMat)
        l.position.set(-2 + i * 2.5, STORE.wallH - 0.1, 0)
        scene.add(l)
      }
    }

    // ================ ライティング ================
    scene.add(new THREE.AmbientLight(theme.ambient, theme.ambientI))

    const mainLight = new THREE.DirectionalLight(theme.main, theme.mainI)
    mainLight.position.set(5, 8, 3)
    mainLight.castShadow = true
    mainLight.shadow.mapSize.set(1024, 1024)
    scene.add(mainLight)

    const fillLight = new THREE.PointLight(theme.fill, theme.fillI, 20)
    fillLight.position.set(-4, 4, -2)
    scene.add(fillLight)

    const regLight = new THREE.PointLight(0xffffcc, tod === 'night' ? 0.8 : 0.4, 8)
    regLight.position.set(COUNTER_CENTER.x, 2.5, 0)
    scene.add(regLight)

    // ================ アニメーション ================
    let animId: number
    const clock = new THREE.Clock()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // カメラを店内でゆっくり旋回（壁の内側に収める）
      const camR = 3.5
      const camAngle = t * 0.08
      camera.position.x = Math.sin(camAngle) * camR
      camera.position.z = Math.cos(camAngle) * camR
      camera.position.y = 2.5 + Math.sin(t * 0.04) * 0.5
      camera.lookAt(0, 0.8, 0)

      // 店員アニメ
      shopkeeper.rotation.y = -Math.PI / 2 + Math.sin(t * 1.2) * 0.08
      shopkeeper.position.y = Math.sin(t * 2) * 0.02

      // 外の車
      outsideCars.forEach((c, idx) => {
        if (idx < 4) {
          // 手前の道路（x方向に移動）
          c.group.position.x += c.speed * c.direction
          if (c.group.position.x > 14) c.group.position.x = -14
          if (c.group.position.x < -14) c.group.position.x = 14
        } else {
          // 右の道路（z方向に移動）
          c.group.position.z += c.speed * c.direction
          if (c.group.position.z > 10) c.group.position.z = -10
          if (c.group.position.z < -10) c.group.position.z = 10
        }
      })

      // 木を風で揺らす
      // (木は scene の children にあるので直接取得は面倒だが、微小な揺れで十分)

      // お客さん
      walkers.forEach((w) => {
        if (w.isWaiting) {
          w.waitTimer -= 1 / 60
          if (w.waitTimer <= 0) {
            w.isWaiting = false
            w.target = getRandomWaypoint()
          }
          w.legL.rotation.x *= 0.9
          w.legR.rotation.x *= 0.9

          // 待機中、バッグを揺らす
          if (w.bag) {
            w.bag.rotation.z = Math.sin(t * 2 + w.phase) * 0.05
          }
          return
        }

        const dx = w.target.x - w.group.position.x
        const dz = w.target.z - w.group.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist < 0.3) {
          if (Math.random() < 0.45) {
            w.isWaiting = true
            w.waitTimer = 2 + Math.random() * 4
            // 待機中にランダムで袋を追加（まだ持ってない場合）
            if (!w.hasBag && Math.random() < 0.3) {
              const bag = createShoppingBag(bagColors[Math.floor(Math.random() * bagColors.length)])
              bag.position.set(0.35, 0, 0)
              w.group.add(bag)
              w.bag = bag
              w.hasBag = true
            }
          } else {
            w.target = getRandomWaypoint()
          }
        } else {
          // 次の位置を計算し、衝突チェック
          const nx = w.group.position.x + (dx / dist) * w.speed
          const nz = w.group.position.z + (dz / dist) * w.speed

          if (!isCollidingWithObstacles(nx, nz) &&
              nx > STORE.xMin + 0.5 && nx < STORE.xMax - 1.0 &&
              nz > STORE.zMin + 0.5 && nz < STORE.zMax - 0.5) {
            w.group.position.x = nx
            w.group.position.z = nz
          } else {
            // 衝突 → 新しい目標
            w.target = getRandomWaypoint()
          }

          w.group.rotation.y = Math.atan2(dx, dz)
        }

        // 歩行アニメ
        const wc = t * 6 + w.phase
        w.legL.rotation.x = Math.sin(wc) * 0.5
        w.legR.rotation.x = Math.sin(wc + Math.PI) * 0.5
        w.group.position.y = Math.abs(Math.sin(wc)) * 0.04

        // バッグの揺れ
        if (w.bag) {
          w.bag.rotation.z = Math.sin(wc * 0.8) * 0.15
        }
      })

      renderer.render(scene, camera)
    }

    animate()

    // 時計
    const clockInterval = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    setTimeStr(new Date().toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit' }))

    // テキスト位置（画面焼け防止）
    const moveText = () => setTextPos({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 16 })
    moveText()
    const textMoveInterval = setInterval(moveText, 8000)

    // リサイズ
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      clearInterval(clockInterval)
      clearInterval(textMoveInterval)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      scene.clear()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
      rendererRef.current = null
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[10000] cursor-none" onClick={onDismiss} onTouchStart={onDismiss}>
      <div ref={containerRef} className="absolute inset-0" />

      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-transform duration-[3000ms] ease-in-out"
        style={{ transform: `translate(${textPos.x}%, ${textPos.y}%)` }}
      >
        <div className="text-8xl font-mono font-bold text-white/70 tracking-[0.15em] select-none drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]">
          {timeStr}
        </div>
        <div className="mt-3 text-xl font-bold text-white/50 tracking-widest select-none">
          {greeting}
        </div>
        <div className="mt-1 text-base font-bold text-white/25 tracking-[0.5em] select-none">
          OHSHIMA LAB STORE
        </div>
        <div className="mt-10 flex flex-col items-center screensaver-pulse">
          <div className="w-24 h-24 rounded-full border-4 border-white/50 flex items-center justify-center bg-white/10 shadow-[0_0_40px_rgba(255,255,255,0.15)]">
            <span className="text-5xl select-none">👆</span>
          </div>
          <div className="mt-4 text-3xl font-bold text-white/80 tracking-wider select-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
            タッチして購入を開始
          </div>
          <div className="mt-1 text-base text-white/40 select-none">
            Tap to start shopping
          </div>
        </div>
      </div>
    </div>
  )
}

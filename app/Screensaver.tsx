'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

// ============================================================
// 時間帯
// ============================================================
type TimeOfDay = 'morning' | 'daytime' | 'evening' | 'night'

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 16) return 'daytime'
  if (hour >= 16 && hour < 18) return 'evening'
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

const SHELF_DEFS = [
  { x: -3.2, z: -1.5 }, { x: -3.2, z: 1.5 },
  { x: -1.0, z: -1.5 }, { x: -1.0, z: 1.5 },
  { x: 1.2, z: -1.5 },
]
const SHELF_HALF = { x: 0.7, z: 0.35 }
const COUNTER_CENTER = { x: 4.0, z: 0 }
const COUNTER_HALF = { x: 0.5, z: 1.4 }

const WAYPOINTS = [
  { x: -2.1, z: 0 },
  { x: 0.1, z: 0 },
  { x: 2.3, z: 0 },
  { x: -2.1, z: -3.0 },
  { x: -2.1, z: 3.0 },
  { x: 0.1, z: -3.0 },
  { x: 0.1, z: 3.0 },
  { x: 2.3, z: -2.5 },
  { x: 2.3, z: 2.5 },
  { x: -4.0, z: 0 },
]

const ROBOT_COLLISION_RADIUS = 0.45
const EMOTE_NAMES = ['Jump', 'Wave', 'ThumbsUp', 'Yes', 'Punch']

// ============================================================
// Walker の状態（排他的列挙型）
// ============================================================
type WalkerState =
  | { type: 'walking' }
  | { type: 'waiting'; waitTimer: number; emoteTimer: number }
  | { type: 'fighting'; fightTimer: number; opponent: Walker }
  | { type: 'dead'; deadTimer: number }
  | { type: 'dancing'; danceTimer: number }
  | { type: 'fleeing'; partner: Walker; chaseTimer: number }
  | { type: 'chasing'; partner: Walker; chaseTimer: number }

// ============================================================
// Walker 型
// ============================================================
type Walker = {
  group: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Record<string, THREE.AnimationAction>
  activeAction: THREE.AnimationAction | null
  target: THREE.Vector3
  speed: number
  phase: number
  state: WalkerState
}

type OutsideCar = { group: THREE.Group; speed: number; direction: number }

// ============================================================
// ヘルパー関数
// ============================================================

/** AABB 衝突判定 */
function isInsideAABB(px: number, pz: number, cx: number, cz: number, hx: number, hz: number, margin = 0.4): boolean {
  return px > cx - hx - margin && px < cx + hx + margin && pz > cz - hz - margin && pz < cz + hz + margin
}

/** 棚・カウンターとの衝突チェック */
function isCollidingWithObstacles(px: number, pz: number): boolean {
  for (const s of SHELF_DEFS) {
    if (isInsideAABB(px, pz, s.x, s.z, SHELF_HALF.x, SHELF_HALF.z)) return true
  }
  if (isInsideAABB(px, pz, COUNTER_CENTER.x, COUNTER_CENTER.z, COUNTER_HALF.x, COUNTER_HALF.z)) return true
  return false
}

/** 店舗境界チェック（壁の内側か） */
function isInBounds(x: number, z: number): boolean {
  return x > STORE.xMin + 0.5 && x < STORE.xMax - 1.0 &&
         z > STORE.zMin + 0.5 && z < STORE.zMax - 0.5
}

/** 移動可能判定（境界内 & 障害物なし） */
function canMoveTo(x: number, z: number): boolean {
  return isInBounds(x, z) && !isCollidingWithObstacles(x, z)
}

/** ウェイポイントからランダムに選ぶ */
function getRandomWaypoint(): THREE.Vector3 {
  const wp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)]
  return new THREE.Vector3(wp.x + (Math.random() - 0.5) * 0.6, 0, wp.z + (Math.random() - 0.5) * 0.6)
}

/** 安全な初期位置 */
function getSafeStart(): THREE.Vector3 {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pos = getRandomWaypoint()
    if (!isCollidingWithObstacles(pos.x, pos.z)) return pos
  }
  return new THREE.Vector3(0, 0, 0)
}

/** 座標をクランプして安全な位置に */
function clampToStore(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.max(STORE.xMin + 0.8, Math.min(STORE.xMax - 1.3, x)),
    0,
    Math.max(STORE.zMin + 0.8, Math.min(STORE.zMax - 0.8, z))
  )
}

/** 指定地点から最も遠いウェイポイントを取得 */
function getFarthestWaypoint(fromX: number, fromZ: number): THREE.Vector3 {
  const sorted = WAYPOINTS
    .map(wp => ({ wp, dist: Math.hypot(wp.x - fromX, wp.z - fromZ) }))
    .sort((a, b) => b.dist - a.dist)
  const wp = sorted[0].wp
  return new THREE.Vector3(wp.x + (Math.random() - 0.5) * 0.5, 0, wp.z + (Math.random() - 0.5) * 0.5)
}

/** ターゲットに向かって移動し、成否を返す */
function moveToward(w: Walker, targetX: number, targetZ: number): boolean {
  const dx = targetX - w.group.position.x
  const dz = targetZ - w.group.position.z
  const dist = Math.hypot(dx, dz)
  if (dist < 0.1) return false

  const nx = w.group.position.x + (dx / dist) * w.speed
  const nz = w.group.position.z + (dz / dist) * w.speed

  if (canMoveTo(nx, nz)) {
    w.group.position.x = nx
    w.group.position.z = nz
  } else {
    w.target = getRandomWaypoint()
  }
  w.group.rotation.y = Math.atan2(dx, dz)
  return true
}

/** 2体を互いに向き合わせる */
function faceEachOther(a: Walker, b: Walker) {
  a.group.rotation.y = Math.atan2(
    b.group.position.x - a.group.position.x,
    b.group.position.z - a.group.position.z
  )
  b.group.rotation.y = Math.atan2(
    a.group.position.x - b.group.position.x,
    a.group.position.z - b.group.position.z
  )
}

/** 2体間の距離 */
function distBetween(a: Walker, b: Walker): number {
  return Math.hypot(
    a.group.position.x - b.group.position.x,
    a.group.position.z - b.group.position.z
  )
}

/** Walker が「フリー」（イベントに参加していない）か */
function isFree(w: Walker): boolean {
  return w.state.type === 'walking' || w.state.type === 'waiting'
}

// ============================================================
// ロボットモデルの色を変更する
// ============================================================
function tintRobot(model: THREE.Group, bodyColor: number) {
  const color = new THREE.Color(bodyColor)
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      if (mesh.material && !Array.isArray(mesh.material)) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        const hsl = { h: 0, s: 0, l: 0 }
        mat.color.getHSL(hsl)
        if (hsl.s < 0.3 && hsl.l > 0.15 && hsl.l < 0.85) {
          mat.color.lerp(color, 0.6)
        }
        mesh.material = mat
      }
    }
  })
}

// ============================================================
// アニメーション切り替え
// ============================================================
function fadeToAction(walker: Walker, actionName: string, duration = 0.3) {
  const newAction = walker.actions[actionName]
  if (!newAction || newAction === walker.activeAction) return

  const prev = walker.activeAction
  walker.activeAction = newAction

  if (prev) prev.fadeOut(duration)
  newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play()
}

// ============================================================
// エプロンつき店員（ピクセルキャラ）
// ============================================================
function createShopkeeper(): THREE.Group {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2563eb })
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xfdbcb4 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), bodyMat)
  body.position.y = 0.55
  group.add(body)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat)
  head.position.y = 1.15
  group.add(head)

  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 })
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMat)
  eyeL.position.set(-0.1, 1.2, 0.2)
  group.add(eyeL)
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMat)
  eyeR.position.set(0.1, 1.2, 0.2)
  group.add(eyeR)

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.25), bodyMat)
  legL.position.set(-0.12, 0.2, 0)
  group.add(legL)

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.25), bodyMat)
  legR.position.set(0.12, 0.2, 0)
  group.add(legR)

  // エプロン
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.5, 0.05),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  )
  apron.position.set(0, 0.55, 0.18)
  group.add(apron)

  return group
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

  const shelfColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xe67e22]
  for (let row = 0; row < 4; row++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), woodMat)
    board.position.set(0, 0.3 + row * 0.5, 0)
    group.add(board)

    for (let col = 0; col < 3; col++) {
      const c = shelfColors[Math.floor(Math.random() * shelfColors.length)]
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.3, 0.2),
        new THREE.MeshLambertMaterial({ color: c })
      )
      item.position.set(-0.35 + col * 0.35, 0.3 + row * 0.5 + 0.2, 0)
      item.castShadow = true
      group.add(item)
    }
  }
  return group
}

// ============================================================
// レジカウンター
// ============================================================
function createCounter(): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: 0xdeb887 })
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.8), mat)
  top.position.y = 1.0
  group.add(top)
  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), mat)
  leg1.position.set(-1.1, 0.5, -0.3)
  group.add(leg1)
  const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), mat)
  leg2.position.set(1.1, 0.5, -0.3)
  group.add(leg2)
  const leg3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), mat)
  leg3.position.set(-1.1, 0.5, 0.3)
  group.add(leg3)
  const leg4 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), mat)
  leg4.position.set(1.1, 0.5, 0.3)
  group.add(leg4)

  const register = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.3, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x333333 })
  )
  register.position.set(0, 1.2, 0)
  group.add(register)
  return group
}

// ============================================================
// 大きな窓
// ============================================================
function createLargeWindow(skyColor: number, width: number): THREE.Group {
  const group = new THREE.Group()
  const h = 2.4, bottom = 0.6
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x888888 })
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: skyColor, transparent: true, opacity: 0.18,
    roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide,
  })

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.1, h - 0.1), glassMat)
  glass.position.y = bottom + h / 2
  group.add(glass)

  const frameT = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.06), frameMat)
  frameT.position.y = bottom + h
  group.add(frameT)
  const frameB = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.06), frameMat)
  frameB.position.y = bottom
  group.add(frameB)
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.06), frameMat)
  frameL.position.set(-width / 2, bottom + h / 2, 0)
  group.add(frameL)
  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.06), frameMat)
  frameR.position.set(width / 2, bottom + h / 2, 0)
  group.add(frameR)

  const divisions = Math.floor(width / 1.5)
  for (let i = 1; i < divisions; i++) {
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.04), frameMat)
    divider.position.set(-width / 2 + (width / divisions) * i, bottom + h / 2, 0)
    group.add(divider)
  }
  return group
}

// ============================================================
// 木
// ============================================================
function createTree(trunkColor: number, leafColor: number): THREE.Group {
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 1.2, 6),
    new THREE.MeshLambertMaterial({ color: trunkColor })
  )
  trunk.position.y = 0.6
  group.add(trunk)
  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshLambertMaterial({ color: leafColor })
  )
  leaves.position.y = 1.6
  group.add(leaves)
  return group
}

// ============================================================
// 車
// ============================================================
function createCar(color: number): THREE.Group {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.9), bodyMat)
  body.position.y = 0.35
  group.add(body)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.4, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xaaddff, transparent: true, opacity: 0.7 })
  )
  cabin.position.set(-0.1, 0.7, 0)
  group.add(cabin)
  const wheelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8)
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
  const offsets = [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]]
  offsets.forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.15, z)
    group.add(wheel)
  })
  return group
}

// ============================================================
// Walker 状態遷移ヘルパー
// ============================================================

/** Walker を「歩行」状態にする */
function startWalking(w: Walker, speedOverride?: number) {
  const isRunning = Math.random() < 0.3
  w.speed = speedOverride ?? (isRunning ? 0.01 + Math.random() * 0.005 : 0.005 + Math.random() * 0.007)
  w.target = getRandomWaypoint()
  w.state = { type: 'walking' }
  fadeToAction(w, isRunning ? 'Running' : 'Walking', 0.3)
}

/** Walker を「待機」状態にする */
function startWaiting(w: Walker) {
  w.state = { type: 'waiting', waitTimer: 2 + Math.random() * 5, emoteTimer: 1 + Math.random() * 2 }
  fadeToAction(w, 'Idle', 0.3)
}

/** 喧嘩を開始する（2体セット） */
function startFight(a: Walker, b: Walker) {
  a.state = { type: 'fighting', fightTimer: 1.0, opponent: b }
  b.state = { type: 'fighting', fightTimer: 1.0, opponent: a }
  faceEachOther(a, b)
  fadeToAction(a, 'Punch', 0.15)
  fadeToAction(b, 'Punch', 0.15)
}

/** 追いかけっこを開始する（2体セット） */
function startChase(a: Walker, b: Walker) {
  const [runner, chaser] = Math.random() < 0.5 ? [a, b] : [b, a]

  runner.speed = 0.012 + Math.random() * 0.003
  runner.target = getFarthestWaypoint(chaser.group.position.x, chaser.group.position.z)
  runner.state = { type: 'fleeing', partner: chaser, chaseTimer: 10 + Math.random() * 5 }
  fadeToAction(runner, 'Running', 0.2)

  chaser.speed = 0.014 + Math.random() * 0.003
  chaser.target = runner.group.position.clone()
  chaser.state = { type: 'chasing', partner: runner, chaseTimer: 12 + Math.random() * 5 }
  fadeToAction(chaser, 'Running', 0.2)
}

/** 追いかけっこ終了（仲直り） */
function endChase(runner: Walker, chaser: Walker | null) {
  if (chaser) {
    faceEachOther(runner, chaser)
    chaser.state = { type: 'waiting', waitTimer: 2, emoteTimer: 5 }
    fadeToAction(chaser, 'Wave', 0.2)
  }
  runner.state = { type: 'waiting', waitTimer: 2, emoteTimer: 5 }
  fadeToAction(runner, 'Wave', 0.2)
}

// ============================================================
// イベント処理
// ============================================================

/** フラッシュモブダンスの発動 */
function triggerFlashMob(walkers: Walker[]) {
  const freeWalkers = walkers.filter(w => isFree(w))
  if (freeWalkers.length < 2) return

  if (Math.random() < 0.2) {
    // 全員ダンス（20%）
    const dur = 6 + Math.random() * 2
    freeWalkers.forEach(w => {
      w.state = { type: 'dancing', danceTimer: dur }
      fadeToAction(w, 'Dance', 0.3)
    })
  } else {
    // グループダンス
    const leader = freeWalkers[Math.floor(Math.random() * freeWalkers.length)]
    const nearby = freeWalkers.filter(w => w !== leader && distBetween(w, leader) < 3.0)
    const dancers = [leader, ...nearby.slice(0, 2)]
    const dur = 4 + Math.random() * 2
    dancers.forEach(w => {
      w.state = { type: 'dancing', danceTimer: dur }
      fadeToAction(w, 'Dance', 0.3)
    })
  }
}

/** 衝突判定 → 喧嘩 or 追いかけっこ */
function handleCollisions(walkers: Walker[]) {
  for (let i = 0; i < walkers.length; i++) {
    for (let j = i + 1; j < walkers.length; j++) {
      const a = walkers[i], b = walkers[j]
      if (!isFree(a) || !isFree(b)) continue
      if (distBetween(a, b) < ROBOT_COLLISION_RADIUS) {
        if (Math.random() < 0.5) {
          startFight(a, b)
        } else {
          startChase(a, b)
        }
      }
    }
  }
}

// ============================================================
// Walker 毎フレーム更新
// ============================================================
function updateWalker(w: Walker, dt: number) {
  w.mixer.update(dt)

  switch (w.state.type) {
    // ----- Death -----
    case 'dead': {
      w.state.deadTimer -= dt
      if (w.state.deadTimer <= 0) {
        fadeToAction(w, 'Standing', 0.3)
        w.state = { type: 'waiting', waitTimer: 1.5, emoteTimer: 99 }
        setTimeout(() => {
          if (w.state.type === 'waiting') {
            startWalking(w)
          }
        }, 1500)
      }
      break
    }

    // ----- 喧嘩中 -----
    case 'fighting': {
      const st = w.state
      st.fightTimer -= dt

      // 相手を向き続ける
      w.group.rotation.y = Math.atan2(
        st.opponent.group.position.x - w.group.position.x,
        st.opponent.group.position.z - w.group.position.z
      )

      if (st.fightTimer <= 0) {
        const opponent = st.opponent

        // 先に fightTimer が切れた方が「勝者」→ 相手を Death に
        if (opponent.state.type === 'fighting') {
          opponent.state = { type: 'dead', deadTimer: 30 }
          fadeToAction(opponent, 'Death', 0.2)
        }

        // 勝者はランダム方向に歩き出す
        const angle = Math.random() * Math.PI * 2
        w.group.rotation.y = angle
        const escapeDist = 2 + Math.random() * 2
        w.target = clampToStore(
          w.group.position.x + Math.sin(angle) * escapeDist,
          w.group.position.z + Math.cos(angle) * escapeDist
        )
        w.state = { type: 'walking' }
        w.speed = 0.005 + Math.random() * 0.007
        fadeToAction(w, 'Walking', 0.3)
      }
      break
    }

    // ----- ダンス中 -----
    case 'dancing': {
      w.state.danceTimer -= dt
      if (w.state.danceTimer <= 0) {
        startWalking(w)
      }
      break
    }

    // ----- 逃走中 -----
    case 'fleeing': {
      const st = w.state
      st.chaseTimer -= dt
      const caught = st.partner ? distBetween(w, st.partner) < 0.5 : false

      if (caught || st.chaseTimer <= 0) {
        endChase(w, st.partner)
      } else {
        // ターゲットに到着したら遠いウェイポイントに切替
        const fdist = Math.hypot(w.target.x - w.group.position.x, w.target.z - w.group.position.z)
        if (fdist < 0.5) {
          w.target = getFarthestWaypoint(w.group.position.x, w.group.position.z)
        } else {
          moveToward(w, w.target.x, w.target.z)
        }
      }
      break
    }

    // ----- 追跡中 -----
    case 'chasing': {
      const st = w.state
      st.chaseTimer -= dt

      if (st.chaseTimer <= 0 || st.partner.state.type !== 'fleeing') {
        startWalking(w)
      } else {
        // 相手の現在位置をリアルタイム追跡
        w.target.set(st.partner.group.position.x, 0, st.partner.group.position.z)
        moveToward(w, w.target.x, w.target.z)
      }
      break
    }

    // ----- 待機中 -----
    case 'waiting': {
      const st = w.state
      st.waitTimer -= dt
      if (st.waitTimer <= 0) {
        startWalking(w)
        break
      }

      // 待機中にバリエーション行動
      st.emoteTimer -= dt
      if (st.emoteTimer <= 0) {
        st.emoteTimer = 3 + Math.random() * 5
        const actions = ['Wave', 'ThumbsUp', 'Yes', 'Jump', 'Dance', 'Sitting']
        const action = actions[Math.floor(Math.random() * actions.length)]
        if (action === 'Dance') {
          fadeToAction(w, 'Dance', 0.3)
          st.waitTimer = Math.max(st.waitTimer, 3)
        } else if (action === 'Sitting') {
          fadeToAction(w, 'Sitting', 0.3)
          st.waitTimer = Math.max(st.waitTimer, 4)
        } else {
          fadeToAction(w, action, 0.2)
        }
      }
      break
    }

    // ----- 通常歩行 -----
    case 'walking': {
      const dx = w.target.x - w.group.position.x
      const dz = w.target.z - w.group.position.z
      const dist = Math.hypot(dx, dz)

      if (dist < 0.3) {
        // 到着 → 45%で待機、55%で次のウェイポイント
        if (Math.random() < 0.45) {
          startWaiting(w)
        } else {
          w.target = getRandomWaypoint()
        }
      } else {
        moveToward(w, w.target.x, w.target.z)
      }
      break
    }
  }
}

// ============================================================
// シーン構築ヘルパー
// ============================================================

/** 壁の構築（窓くり抜き含む） */
function buildWalls(scene: THREE.Scene) {
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0, side: THREE.DoubleSide })
  const wallWidth = STORE.xMax - STORE.xMin
  const wallDepth = STORE.zMax - STORE.zMin

  // 奥壁 (z = zMin)
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(wallWidth, STORE.wallH), wallMat)
  backWall.position.set(0, STORE.wallH / 2, STORE.zMin)
  scene.add(backWall)

  // 左壁 (x = xMin)
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(wallDepth, STORE.wallH), wallMat)
  leftWall.position.set(STORE.xMin, STORE.wallH / 2, 0)
  leftWall.rotation.y = Math.PI / 2
  scene.add(leftWall)

  // 手前壁 (z = zMax) — 窓くり抜き
  buildWallWithHole(scene, wallMat, {
    axis: 'z', pos: STORE.zMax, totalSize: wallWidth, rotY: Math.PI,
    holeCenterU: -1, holeWidth: 6, holeBot: 0.6, holeTop: 3.0
  })

  // 右壁 (x = xMax) — 窓くり抜き
  buildWallWithHole(scene, wallMat, {
    axis: 'x', pos: STORE.xMax, totalSize: wallDepth, rotY: -Math.PI / 2,
    holeCenterU: 0, holeWidth: 5, holeBot: 0.6, holeTop: 3.0
  })

  // 天井
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(wallWidth, wallDepth),
    new THREE.MeshLambertMaterial({ color: 0xf8f4ef, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(0, STORE.wallH, 0)
  scene.add(ceiling)
}

/** 窓付き壁の構築（1軸方向の汎用化） */
function buildWallWithHole(
  scene: THREE.Scene,
  wallMat: THREE.Material,
  opts: { axis: 'x' | 'z'; pos: number; totalSize: number; rotY: number; holeCenterU: number; holeWidth: number; holeBot: number; holeTop: number }
) {
  const { pos, totalSize, rotY, holeCenterU, holeWidth, holeBot, holeTop } = opts
  const holeH = holeTop - holeBot

  // 上部パネル
  const upperH = STORE.wallH - holeTop
  if (upperH > 0) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, upperH), wallMat)
    if (opts.axis === 'z') {
      panel.position.set(0, holeTop + upperH / 2, pos)
    } else {
      panel.position.set(pos, holeTop + upperH / 2, 0)
    }
    panel.rotation.y = rotY
    scene.add(panel)
  }

  // 下部パネル
  if (holeBot > 0) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, holeBot), wallMat)
    if (opts.axis === 'z') {
      panel.position.set(0, holeBot / 2, pos)
    } else {
      panel.position.set(pos, holeBot / 2, 0)
    }
    panel.rotation.y = rotY
    scene.add(panel)
  }

  // 左側パネル
  const leftW = (totalSize / 2) - (holeWidth / 2) + holeCenterU
  if (leftW > 0) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(leftW, holeH), wallMat)
    if (opts.axis === 'z') {
      panel.position.set(STORE.xMin + leftW / 2, holeBot + holeH / 2, pos)
    } else {
      panel.position.set(pos, holeBot + holeH / 2, STORE.zMin + leftW / 2)
    }
    panel.rotation.y = rotY
    scene.add(panel)
  }

  // 右側パネル
  const rightEdge = holeCenterU + holeWidth / 2
  const rightW = (totalSize / 2) - rightEdge
  if (rightW > 0) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(rightW, holeH), wallMat)
    if (opts.axis === 'z') {
      panel.position.set(rightEdge + rightW / 2, holeBot + holeH / 2, pos)
    } else {
      panel.position.set(pos, holeBot + holeH / 2, rightEdge + rightW / 2)
    }
    panel.rotation.y = rotY
    scene.add(panel)
  }
}

/** 外の景色（地面・道路・歩道・木）を構築 */
function buildExterior(scene: THREE.Scene, theme: ReturnType<typeof getTimeTheme>) {
  // 地面
  const outsideGround = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshLambertMaterial({ color: theme.grassColor })
  )
  outsideGround.rotation.x = -Math.PI / 2
  outsideGround.position.set(0, -0.01, 0)
  scene.add(outsideGround)

  // 手前の道路
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

  // 右の道路
  const road2 = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 20),
    new THREE.MeshLambertMaterial({ color: 0x444444 })
  )
  road2.rotation.x = -Math.PI / 2
  road2.position.set(STORE.xMax + 4, 0.005, 0)
  scene.add(road2)

  // 木
  const treePositions = [
    { x: -4, z: STORE.zMax + 1.5 }, { x: 0, z: STORE.zMax + 1.5 }, { x: 4, z: STORE.zMax + 1.5 },
    { x: STORE.xMax + 2, z: -2 }, { x: STORE.xMax + 2, z: 2 },
    { x: -3, z: STORE.zMax + 5.5 }, { x: 3, z: STORE.zMax + 5.5 },
  ]
  const leafColors = [0x2d8c2d, 0x3da33d, 0x228822, 0x44aa33]
  treePositions.forEach(pos => {
    const tree = createTree(0x6b4226, leafColors[Math.floor(Math.random() * leafColors.length)])
    tree.position.set(pos.x, 0, pos.z)
    tree.scale.setScalar(0.8 + Math.random() * 0.5)
    scene.add(tree)
  })
}

/** 外の車を生成して返す */
function createOutsideCars(scene: THREE.Scene): OutsideCar[] {
  const carColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xffffff, 0x333333]
  const cars: OutsideCar[] = []

  // 手前の道路
  for (let i = 0; i < 4; i++) {
    const car = createCar(carColors[Math.floor(Math.random() * carColors.length)])
    const dir = i % 2 === 0 ? 1 : -1
    car.position.set((Math.random() - 0.5) * 16, 0, STORE.zMax + 2.5 + dir * 0.6)
    car.rotation.y = dir > 0 ? 0 : Math.PI
    car.scale.setScalar(0.7)
    scene.add(car)
    cars.push({ group: car, speed: 0.02 + Math.random() * 0.03, direction: dir })
  }

  // 右の道路
  for (let i = 0; i < 2; i++) {
    const car = createCar(carColors[Math.floor(Math.random() * carColors.length)])
    const dir = i % 2 === 0 ? 1 : -1
    car.position.set(STORE.xMax + 3.5 + dir * 0.6, 0, (Math.random() - 0.5) * 12)
    car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
    car.scale.setScalar(0.7)
    scene.add(car)
    cars.push({ group: car, speed: 0.015 + Math.random() * 0.025, direction: dir })
  }

  return cars
}

/** 車のアニメーション更新 */
function updateCars(cars: OutsideCar[]) {
  cars.forEach((c, idx) => {
    if (idx < 4) {
      c.group.position.x += c.speed * c.direction
      if (c.group.position.x > 14) c.group.position.x = -14
      if (c.group.position.x < -14) c.group.position.x = 14
    } else {
      c.group.position.z += c.speed * c.direction
      if (c.group.position.z > 10) c.group.position.z = -10
      if (c.group.position.z < -10) c.group.position.z = 10
    }
  })
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function Screensaver({ onDismiss }: { onDismiss: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const [timeStr, setTimeStr] = useState('')
  const [textPos, setTextPos] = useState({ x: 0, y: 0 })

  const tod = getTimeOfDay()
  const theme = getTimeTheme(tod)
  const greeting = theme.greeting

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (rendererRef.current) return

    // ================ シーン・カメラ・レンダラー ================
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

    // ================ 壁・天井・窓 ================
    buildWalls(scene)

    // 窓オブジェクト
    const frontWindow = createLargeWindow(theme.sky, 6)
    frontWindow.position.set(-1, 0, STORE.zMax - 0.05)
    frontWindow.rotation.y = Math.PI
    scene.add(frontWindow)

    const rightWindow = createLargeWindow(theme.sky, 5)
    rightWindow.position.set(STORE.xMax - 0.05, 0, 0)
    rightWindow.rotation.y = -Math.PI / 2
    scene.add(rightWindow)

    // ================ 外の景色 ================
    buildExterior(scene, theme)
    const outsideCars = createOutsideCars(scene)

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

    // ================ 店員（ピクセルキャラ） ================
    const shopkeeper = createShopkeeper()
    shopkeeper.position.set(4.7, 0, 0)
    shopkeeper.rotation.y = -Math.PI / 2
    scene.add(shopkeeper)
    const shopkeeperLegL = shopkeeper.children[4] as THREE.Mesh
    const shopkeeperLegR = shopkeeper.children[5] as THREE.Mesh

    // ================ ロボットモデルのロード ================
    const ROBOT_SCALE = 0.2
    const walkers: Walker[] = []

    const loader = new GLTFLoader()
    loader.load('/models/RobotExpressive.glb', (gltf) => {
      const originalModel = gltf.scene
      const animations = gltf.animations

      const setupAnimations = (model: THREE.Group) => {
        const mixer = new THREE.AnimationMixer(model)
        const actions: Record<string, THREE.AnimationAction> = {}
        const stateNames = ['Idle', 'Walking', 'Running', 'Dance', 'Death', 'Sitting', 'Standing']
        for (const clip of animations) {
          const action = mixer.clipAction(clip)
          actions[clip.name] = action
          if (EMOTE_NAMES.includes(clip.name) || stateNames.indexOf(clip.name) >= 4) {
            action.clampWhenFinished = true
            action.loop = THREE.LoopOnce
          }
        }
        return { mixer, actions }
      }

      const allColors = [0xef4444, 0x22c55e, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x06b6d4]
      const custColors = allColors.slice(0, theme.customers)

      custColors.forEach((color, i) => {
        const robotClone = SkeletonUtils.clone(originalModel) as THREE.Group
        robotClone.scale.setScalar(ROBOT_SCALE)
        tintRobot(robotClone, color)

        const startPos = getSafeStart()
        robotClone.position.copy(startPos)
        scene.add(robotClone)

        const { mixer, actions } = setupAnimations(robotClone)

        let activeAction: THREE.AnimationAction | null = null
        if (actions['Walking']) {
          activeAction = actions['Walking']
          activeAction.play()
        }

        const walker: Walker = {
          group: robotClone,
          mixer,
          actions,
          activeAction,
          target: getRandomWaypoint(),
          speed: 0.005 + Math.random() * 0.007,
          phase: i * 1.2,
          state: { type: 'walking' },
        }

        // エモート終了時に前の状態に戻す（特殊状態中は除く）
        mixer.addEventListener('finished', () => {
          if (!isFree(walker)) return
          if (walker.state.type === 'waiting') {
            fadeToAction(walker, 'Idle', 0.3)
          } else {
            fadeToAction(walker, 'Walking', 0.3)
          }
        })

        walkers.push(walker)
      })
    })

    // ================ 天井蛍光灯（夜・夕方） ================
    const fluorLights: THREE.Mesh[] = []
    if (tod === 'night' || tod === 'evening') {
      const lightGeo = new THREE.BoxGeometry(3, 0.05, 0.2)
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffee })
      for (let i = 0; i < 3; i++) {
        const l = new THREE.Mesh(lightGeo, lightMat.clone())
        l.position.set(-2 + i * 2.5, STORE.wallH - 0.1, 0)
        scene.add(l)
        fluorLights.push(l)
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

    // ================ アニメーションループ ================
    let animId: number
    const clock = new THREE.Clock()
    const mainLightBaseI = theme.mainI

    // イベントタイマー
    let flashMobTimer = 30 + Math.random() * 30
    let flickerTimer = 20 + Math.random() * 40
    let flickerActive = false
    let flickerDuration = 0
    let flickerPhase = 0

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      const delta = clock.getDelta()
      const dt = delta > 0 ? delta : 1 / 60

      // カメラを店内でゆっくり旋回
      const camR = 3.5
      const camAngle = t * 0.08
      camera.position.x = Math.sin(camAngle) * camR
      camera.position.z = Math.cos(camAngle) * camR
      camera.position.y = 2.5 + Math.sin(t * 0.04) * 0.5
      camera.lookAt(0, 0.8, 0)

      // 店員アニメ
      shopkeeper.rotation.y = -Math.PI / 2 + Math.sin(t * 1.2) * 0.08
      shopkeeper.position.y = Math.sin(t * 2) * 0.02
      shopkeeperLegL.rotation.x = Math.sin(t * 1.5) * 0.15
      shopkeeperLegR.rotation.x = Math.sin(t * 1.5 + Math.PI) * 0.15

      // 外の車
      updateCars(outsideCars)

      // 🎵 フラッシュモブダンス
      flashMobTimer -= dt
      if (flashMobTimer <= 0 && walkers.length >= 2) {
        triggerFlashMob(walkers)
        flashMobTimer = 25 + Math.random() * 35
      }

      // 💡 夜間: 蛍光灯チカチカ
      if (tod === 'night' && fluorLights.length > 0) {
        if (flickerActive) {
          flickerDuration -= dt
          flickerPhase += dt * 25
          const on = Math.sin(flickerPhase) > 0
          fluorLights.forEach(fl => {
            (fl.material as THREE.MeshBasicMaterial).opacity = on ? 1.0 : 0.1
          })
          regLight.intensity = on ? 0.8 : 0.1

          if (flickerDuration <= 0) {
            flickerActive = false
            fluorLights.forEach(fl => { (fl.material as THREE.MeshBasicMaterial).opacity = 1.0 })
            regLight.intensity = 0.8
            walkers.forEach(w => {
              if (isFree(w)) fadeToAction(w, 'Jump', 0.15)
            })
            flickerTimer = 30 + Math.random() * 60
          }
        } else {
          flickerTimer -= dt
          if (flickerTimer <= 0) {
            flickerActive = true
            flickerDuration = 1.5 + Math.random() * 1.5
            flickerPhase = 0
          }
        }
      }

      // 🌇 夕方: ゴールデンアワーの光
      if (tod === 'evening') {
        const pulse = Math.sin(t * 0.3) * 0.5 + 0.5
        mainLight.intensity = mainLightBaseI * (0.7 + pulse * 0.5)
        mainLight.color.setHex(0xff8844)
        mainLight.color.lerp(new THREE.Color(0xffcc88), pulse * 0.4)
      }

      // 衝突判定 → 喧嘩 or 追いかけっこ
      handleCollisions(walkers)

      // 各 Walker の更新
      walkers.forEach(w => updateWalker(w, dt))

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

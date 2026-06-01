import * as THREE from 'three';
import { scene, camera, controls, modeListEl } from './scene.js';
import { props, propMeshes, resizeProp } from './props.js';
import { GRAVITY, RAPIER } from './physics.js';
import { config } from './config.js';

const gg = config.gravityGun;

// ── spring constants ──────────────────────────────────────────────────────────
const PICK_RANGE    = gg.pickRange;
const HOLD_DIST_MIN = gg.holdDistMin;
const HOLD_DIST_MAX = gg.holdDistMax;
const HOLD_SPRING   = gg.holdSpring;
const HOLD_DAMPING  = gg.holdDamping;
const HOLD_MAX_VEL  = gg.holdMaxVel;

// ── tunable config (exported so configmenu.js can modify live) ───────────────
export const cfg = {
  LAUNCH_SPEED: gg.launchSpeed,
  TRANS_X:      gg.translateSensitivity.x,
  TRANS_Y:      gg.translateSensitivity.y,
  TRANS_Z:      gg.translateSensitivity.z,
  ROT_X:        gg.rotateSensitivity.x,
  ROT_Y:        gg.rotateSensitivity.y,
  ROT_Z:        gg.rotateSensitivity.z,
  SCALE_X:      gg.scaleSensitivity.x,
  SCALE_Y:      gg.scaleSensitivity.y,
  SCALE_Z:      gg.scaleSensitivity.z,
  SCALE_MIN:    gg.scaleMin,
  SCALE_MAX:    gg.scaleMax,
};


// ── transform gizmos ─────────────────────────────────────────────────────────
function _gizmoAdd(g) {
  g.traverse(o => { if (o.material) o.material.depthTest = false; o.renderOrder = 999; });
  g.visible = false;
  scene.add(g);
  return g;
}

function _makeTranslateGizmo() {
  const g = new THREE.Group();
  const shaftLen = 0.30, headLen = 0.10;
  const _up = new THREE.Vector3(0, 1, 0);
  for (const [dir, color] of [
    [new THREE.Vector3(1,0,0), 0xff4444],
    [new THREE.Vector3(0,1,0), 0x44ff44],
    [new THREE.Vector3(0,0,1), 0x4488ff],
  ]) {
    const mat = new THREE.MeshBasicMaterial({ color });
    const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, shaftLen, 6), mat);
    shaft.quaternion.copy(q);
    shaft.position.copy(dir).multiplyScalar(shaftLen / 2);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, headLen, 6), mat);
    head.quaternion.copy(q);
    head.position.copy(dir).multiplyScalar(shaftLen + headLen / 2);
    g.add(shaft, head);
  }
  return g;
}

function _makeRotateGizmo() {
  const g = new THREE.Group();
  const rings = [
    { color: 0xff4444, axis: new THREE.Vector3(1, 0, 0), baseEuler: new THREE.Euler(0, Math.PI / 2, 0) },
    { color: 0x44ff44, axis: new THREE.Vector3(0, 1, 0), baseEuler: new THREE.Euler(-Math.PI / 2, 0, 0) },
    { color: 0x4488ff, axis: new THREE.Vector3(0, 0, 1), baseEuler: new THREE.Euler(0, 0, 0) },
  ];
  g.userData.rings = [];
  for (const { color, axis, baseEuler } of rings) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.008, 8, 48, Math.PI), new THREE.MeshBasicMaterial({ color }));
    m.userData.axis = axis;
    m.userData.baseQuat = new THREE.Quaternion().setFromEuler(baseEuler);
    g.userData.rings.push(m);
    g.add(m);
  }
  const viewRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.008, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  g.userData.viewRing = viewRing;
  g.add(viewRing);
  return g;
}

function _makeScaleGizmo() {
  const g = new THREE.Group();
  const shaftLen = 0.35;
  const _up = new THREE.Vector3(0, 1, 0);
  for (const [dir, color] of [
    [new THREE.Vector3(1,0,0), 0xff4444],
    [new THREE.Vector3(0,1,0), 0x44ff44],
    [new THREE.Vector3(0,0,1), 0x4488ff],
  ]) {
    const mat = new THREE.MeshBasicMaterial({ color });
    const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, shaftLen, 6), mat);
    shaft.quaternion.copy(q);
    shaft.position.copy(dir).multiplyScalar(shaftLen / 2);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat);
    box.position.copy(dir).multiplyScalar(0.38);
    g.add(shaft, box);
  }
  return g;
}

const _rotGizmo = _gizmoAdd(_makeRotateGizmo());
if (_rotGizmo.userData.viewRing) _rotGizmo.userData.viewRing.renderOrder = 998;
const _gizmos = {
  translate: _gizmoAdd(_makeTranslateGizmo()),
  rotate:    _rotGizmo,
  scale:     _gizmoAdd(_makeScaleGizmo()),
};

// ── modes ────────────────────────────────────────────────────────────────────
const MODES = ['freeze', 'shoot', 'translate', 'rotate', 'scale', 'paint', 'sun', 'animate'];
// selection modes: M1 picks target in place, no physics carry
const SELECTION_MODES = new Set(['rotate', 'scale', 'paint', 'animate']);

export const gunState = {
  held:        null,
  holdDist:    3.5,
  heldRot:     null,
  mode:        0,
  editing:     false,
  posOffset:   new THREE.Vector3(),
  absHoldPos:  null,
  rotOffset:   new THREE.Euler(),
  scaleVec:    new THREE.Vector3(1, 1, 1),
  scaleDirty:  false,
  frozen:      false,
  flying:      false,
};

export function isFlyMode() { return gunState.flying; }
export function toggleFly() { gunState.flying = !gunState.flying; updateHud(); }

let _mapReady = false;
export function setMapReady() { _mapReady = true; }

const _gunListeners = [];
export function onGunEvent(cb) { _gunListeners.push(cb); }
function _emitGun() { for (const cb of _gunListeners) cb(); }

// ── undo stack ────────────────────────────────────────────────────────────────
const _undoStack = [];
export function pushUndo(fn, label = 'action') {
  _undoStack.push({ fn, label });
  if (_undoStack.length > 30) _undoStack.shift();
}

let _toastEl = null, _toastTimer = null;
function _showToast(msg) {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.style.cssText = [
      'position:fixed', 'bottom:44px', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.72)', 'color:#fff', 'padding:5px 18px',
      'border-radius:4px', 'font:13px/1.6 ui-monospace,monospace',
      'pointer-events:none', 'z-index:99', 'transition:opacity 0.35s',
    ].join(';');
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.style.opacity = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toastEl.style.opacity = '0'; }, 1800);
}

function _applyUndo() {
  const entry = _undoStack.pop();
  if (!entry) { _showToast('nothing to undo'); return; }
  entry.fn();
  _showToast(`undo: ${entry.label}`);
}

const pickRay    = new THREE.Raycaster();
pickRay.far      = PICK_RANGE;
const _camToBody = new THREE.Vector3();



// ── grab / select / release ───────────────────────────────────────────────────
function tryGrab() {
  if (!_mapReady || !controls.isLocked || propMeshes.length === 0) return;
  const mode = MODES[gunState.mode];
  const isSel = SELECTION_MODES.has(mode);

  // grab modes: block if already holding
  if (!isSel && gunState.held) return;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  pickRay.set(camera.position, dir);
  const hit = pickRay.intersectObjects(propMeshes, true)[0];

  function propFromHit(h) {
    let obj = h.object;
    while (obj && obj.userData.propIndex === undefined) obj = obj.parent;
    return obj ? props[obj.userData.propIndex] : null;
  }

  if (isSel) {
    // click on same object → deselect; click elsewhere or miss → deselect old, select new
    if (gunState.held) {
      const clickedSame = hit && propFromHit(hit) === gunState.held;
      releaseHeld();
      if (clickedSame) return;
    }
    if (!hit) return;
    const prop = propFromHit(hit);
    if (!prop) return;
    const r = prop.body.rotation();
    gunState.heldRot   = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    gunState.posOffset.set(0, 0, 0);
    gunState.absHoldPos  = null;
    gunState.rotOffset.set(0, 0, 0);
    gunState.scaleVec.copy(prop.savedScale);
    gunState.scaleDirty = false;
    gunState.frozen     = prop.body.isKinematic(); // preserve frozen state if body was already locked
    prop.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    gunState.held = prop;
  } else {
    if (!hit) return;
    const prop = propFromHit(hit);
    if (!prop) return;
    const t = prop.body.translation();
    _camToBody.set(t.x, t.y, t.z).sub(camera.position);
    gunState.holdDist = Math.min(_camToBody.length(), HOLD_DIST_MAX);
    const r = prop.body.rotation();
    gunState.heldRot   = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    gunState.posOffset.set(0, 0, 0);
    gunState.absHoldPos  = null;
    gunState.rotOffset.set(0, 0, 0);
    gunState.scaleVec.copy(prop.savedScale);
    gunState.scaleDirty = false;
    const _wasKinematic = prop.body.isKinematic();
    gunState.frozen = _wasKinematic;
    if (!_wasKinematic) {
      prop.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      prop.body.setAngularDamping(1.0);
    }
    gunState.held = prop;
  }
  updateHud();
  _emitGun();
}

export function releaseHeld() {
  if (!gunState.held) return;
  exitEditing();
  const mode = MODES[gunState.mode];
  if (SELECTION_MODES.has(mode)) {
    const animPlaying = mode === 'animate' && _isAnyAnimActive(gunState.held);
    if (!gunState.frozen && !animPlaying) {
      gunState.held.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      gunState.held.body.setAngularDamping(0.2);
    }
    // frozen or animating → body stays kinematic
  } else if (!gunState.frozen) {
    gunState.held.body.setAngularDamping(0.2);
  }
  gunState.held    = null;
  gunState.heldRot = null;
  gunState.frozen  = false;
  updateHud();
  _emitGun();
}

// ── shoot ────────────────────────────────────────────────────────────────────
function launchHeld() {
  if (!gunState.held) return;
  const body = gunState.held.body;
  body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  body.setAngularDamping(0.2);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  body.setLinvel({ x: dir.x * cfg.LAUNCH_SPEED, y: dir.y * cfg.LAUNCH_SPEED, z: dir.z * cfg.LAUNCH_SPEED }, true);
  body.setAngvel({ x: (Math.random()-0.5)*20, y: (Math.random()-0.5)*20, z: (Math.random()-0.5)*20 }, true);
  gunState.held    = null;
  gunState.heldRot = null;
  gunState.frozen  = false;
  updateHud();
  _emitGun();
}

// ── freeze ───────────────────────────────────────────────────────────────────
function toggleFreeze() {
  if (!gunState.held) return;
  if (gunState.frozen) {
    gunState.held.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    gunState.frozen = false;
  } else {
    gunState.held.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    gunState.frozen = true;
  }
  updateHud();
}

// ── editing sub-state ────────────────────────────────────────────────────────
let _preEditState = null;

export function enterEditing() {
  if (gunState.editing || !gunState.held) return;
  const mode = MODES[gunState.mode];
  if (mode === 'translate') {
    const p = gunState.held.body.translation();
    _preEditState = { pos: { x: p.x, y: p.y, z: p.z } };
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const base = dir.multiplyScalar(gunState.holdDist).add(camera.position);
    if (!gunState.absHoldPos) gunState.absHoldPos = base.clone();
    else gunState.absHoldPos.copy(base);
  } else if (mode === 'rotate') {
    _preEditState = { rot: gunState.heldRot ? gunState.heldRot.clone() : null };
  } else if (mode === 'scale') {
    _preEditState = { savedScale: gunState.held.savedScale.clone() };
  } else {
    _preEditState = null;
  }
  gunState.editing = true;
  updateHud();
}

export function exitEditing() {
  if (!gunState.editing) return;
  gunState.editing = false;
  const snap = _preEditState;
  _preEditState = null;

  if (MODES[gunState.mode] === 'scale' && gunState.scaleDirty && gunState.held) {
    const prop = gunState.held;
    // resizeProp takes absolute scale (scaleVec) and handles savedScale + mesh.scale internally
    resizeProp(prop, gunState.scaleVec);
    gunState.scaleDirty = false;
    if (snap) {
      const undoProp = prop;
      const undoSaved = snap.savedScale; // pre-edit savedScale
      pushUndo(() => {
        resizeProp(undoProp, undoSaved);
        if (gunState.held === undoProp) gunState.scaleVec.copy(undoSaved);
      }, 'scale');
    }
  }

  if (MODES[gunState.mode] === 'translate' && gunState.absHoldPos) {
    if (snap) {
      const undoProp = gunState.held;
      const undoPos  = snap.pos;
      pushUndo(() => {
        undoProp.body.setTranslation(undoPos, true);
        undoProp.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }, 'move');
    }
    gunState.absHoldPos.add(gunState.posOffset);
    const _eyePos = new THREE.Vector3();
    camera.getWorldPosition(_eyePos);
    const _d = new THREE.Vector3();
    camera.getWorldDirection(_d);
    const depth = gunState.absHoldPos.clone().sub(_eyePos).dot(_d);
    gunState.holdDist = Math.max(HOLD_DIST_MIN, Math.min(HOLD_DIST_MAX, depth));
  }

  if (MODES[gunState.mode] === 'rotate' && snap?.rot && gunState.held) {
    const undoProp = gunState.held;
    const undoRot  = snap.rot;
    pushUndo(() => {
      const q = { x: undoRot.x, y: undoRot.y, z: undoRot.z, w: undoRot.w };
      undoProp.body.setRotation(q, true);
      undoProp.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (gunState.held === undoProp && gunState.heldRot) gunState.heldRot.copy(undoRot);
    }, 'rotate');
  }

  gunState.posOffset.set(0, 0, 0);
  gunState.rotOffset.set(0, 0, 0);
  updateHud();
}

// ── per-mode mouse/wheel edit handlers (used by configmenu sliders) ──────────
const _yaw    = new THREE.Quaternion();
const _pitch  = new THREE.Quaternion();
const _roll   = new THREE.Quaternion();
const _worldY  = new THREE.Vector3(0, 1, 0);
const _camRight = new THREE.Vector3();
const _camFwd   = new THREE.Vector3();

function clampScale(v) { return Math.max(cfg.SCALE_MIN, Math.min(cfg.SCALE_MAX, v)); }

// ── mode cycling ─────────────────────────────────────────────────────────────
function cycleMode(dir = 1) {
  if (!controls.isLocked) return;
  if (gunState.editing) exitEditing();

  const prevMode = MODES[gunState.mode];
  gunState.mode  = (gunState.mode + dir + MODES.length) % MODES.length;
  const nextMode = MODES[gunState.mode];

  if (gunState.held) {
    const wasSel = SELECTION_MODES.has(prevMode);
    const isSel  = SELECTION_MODES.has(nextMode);
    if (wasSel && !isSel) {
      // selection → grab mode
      const animPlaying = prevMode === 'animate' && _isAnyAnimActive(gunState.held);
      if (gunState.frozen || animPlaying) {
        // stay kinematic — object remains frozen or animating
        gunState.held.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      } else {
        gunState.held.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        gunState.held.body.setAngularDamping(1.0);
        const t = gunState.held.body.translation();
        _camToBody.set(t.x, t.y, t.z).sub(camera.position);
        gunState.holdDist = Math.min(_camToBody.length(), HOLD_DIST_MAX);
      }
    } else if (!wasSel && isSel) {
      gunState.held.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    }
  }

  gunState.posOffset.set(0, 0, 0);
  gunState.absHoldPos = null;
  gunState.rotOffset.set(0, 0, 0);
  if (gunState.held) gunState.scaleVec.copy(gunState.held.savedScale);
  else gunState.scaleVec.set(1, 1, 1);
  gunState.scaleDirty = false;
  updateHud();
  _emitGun();
}

// ── HUD update ───────────────────────────────────────────────────────────────
function fmt(v) { return v.toFixed(2).padStart(6); }

const X = '<span style="color:#ff4444">X</span>';
const Y = '<span style="color:#44ff44">Y</span>';
const Z = '<span style="color:#4488ff">Z</span>';
function xyzHtml(label, xv, yv, zv, editing) {
  return `[${label}${editing ? ' ●' : ''}]<br>${X}:${fmt(xv)}  ${Y}:${fmt(yv)}  ${Z}:${fmt(zv)}`;
}

function _modeName(m) { return m.toUpperCase(); }

function updateHud() {
  if (!modeListEl) return;
  const modeHtml = MODES.map((m, i) => {
    const active = i === gunState.mode;
    const name = _modeName(m);
    let label = active ? `[${name}]` : name;
    if (active && m === 'freeze' && gunState.held) {
      label += `  ${gunState.frozen ? 'locked' : 'free'}`;
    }
    return `<div class="ml-item${active ? ' ml-active' : ''}">${label}</div>`;
  }).join('');

  const keyModes = [
    { key: 'V', name: 'FLY',   active: gunState.flying },
    { key: 'Q', name: 'SPAWN', active: false },
    { key: 'Z', name: 'UNDO',  active: false },
  ];
  const keyHtml = keyModes.map(k =>
    `<div class="ml-item${k.active ? ' ml-active' : ''}"><span style="color:#888;font-size:9px">${k.key}</span> ${k.active ? `[${k.name}]` : k.name}</div>`
  ).join('');

  modeListEl.innerHTML = modeHtml
    + '<div style="border-top:1px solid #555;margin-top:2px;padding-top:2px"></div>'
    + keyHtml;
}

// ── preset animations ─────────────────────────────────────────────────────────
function _initAnimState(prop) {
  if (!prop.animState) prop.animState = { anim1: false, anim2: false, anim3: false, alpha: 0, origin: null };
}

function _applyAnimations(prop, dt, body) {
  const s = prop.animState;
  if (!s || (!s.anim1 && !s.anim2 && !s.anim3)) return false;
  const now  = Date.now();
  const orig = s.origin || body.translation();
  let px = orig.x, py = orig.y, pz = orig.z;
  let rx = 0, ry = 0, rz = 0;
  if (s.anim1) { rx = now * 0.0005; ry = now * 0.002; rz = now * 0.001; }
  if (s.anim2) { py = orig.y + Math.sin(now * 0.002) * 3; }
  if (s.anim3) {
    s.alpha += dt * Math.PI * 0.3;
    px = orig.x + Math.sin(s.alpha) * 3;
    pz = orig.z + Math.cos(s.alpha) * 3;
  }
  body.setNextKinematicTranslation({ x: px, y: py, z: pz });
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
  body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  return true;
}

// ── keyframe recording ────────────────────────────────────────────────────────
const ANIM_SEG = 1.5;

function _interpAnim(anim) {
  const kfs = anim.keyframes, N = kfs.length;
  const SEG = anim.totalTime / N, t = anim.time % anim.totalTime;
  const seg = Math.min(Math.floor(t / SEG), N - 1);
  const alpha = SEG > 0 ? (t - seg * SEG) / SEG : 0;
  const a = kfs[seg], b = kfs[(seg + 1) % N];
  const pos = { x: a.pos.x+(b.pos.x-a.pos.x)*alpha, y: a.pos.y+(b.pos.y-a.pos.y)*alpha, z: a.pos.z+(b.pos.z-a.pos.z)*alpha };
  const qa = new THREE.Quaternion(a.quat.x, a.quat.y, a.quat.z, a.quat.w);
  qa.slerp(new THREE.Quaternion(b.quat.x, b.quat.y, b.quat.z, b.quat.w), alpha);
  return { pos, quat: { x: qa.x, y: qa.y, z: qa.z, w: qa.w } };
}

function _initAnimRec(prop) {
  if (!prop.animRec) prop.animRec = { keyframes: [], playing: false, time: 0, totalTime: 0, speed: 1 };
}

function _stepRec(prop, dt, body) {
  const anim = prop.animRec;
  if (!anim || !anim.playing || anim.keyframes.length < 2) return false;
  anim.time = (anim.time + dt * (anim.speed || 1)) % anim.totalTime;
  const { pos, quat } = _interpAnim(anim);
  body.setNextKinematicTranslation(pos);
  body.setNextKinematicRotation(quat);
  return true;
}

function _isAnyAnimActive(prop) {
  const s = prop.animState;
  if (s && (s.anim1 || s.anim2 || s.anim3)) return true;
  const r = prop.animRec;
  return !!(r && r.playing && r.keyframes.length >= 2);
}

export function updateAnimations(dt) {
  for (const prop of props) {
    if (prop === gunState.held) continue;
    if (!_isAnyAnimActive(prop)) continue;
    _applyAnimations(prop, dt, prop.body);
    _stepRec(prop, dt, prop.body);
  }
}

// ── main update (called every frame from main.js) ────────────────────────────
export function updateGravityGun(dt) {
  const _curMode = MODES[gunState.mode];

  // sync gizmos
  const _camPos = new THREE.Vector3();
  camera.getWorldPosition(_camPos);
  for (const [k, g] of Object.entries(_gizmos)) {
    g.visible = !!(gunState.held && k === _curMode);
    if (g.visible) {
      g.position.copy(gunState.held.mesh.position);
      if (k === 'translate' || k === 'rotate') g.quaternion.identity();
      else g.quaternion.copy(gunState.held.mesh.quaternion);

      if (k === 'rotate' && g.userData.rings) {
        const camDir = _camPos.clone().sub(g.position).normalize();
        if (g.userData.viewRing) {
          g.userData.viewRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), camDir);
        }
        const _alignQ = new THREE.Quaternion();
        for (const ring of g.userData.rings) {
          const axis = ring.userData.axis;
          const baseQuat = ring.userData.baseQuat;
          // arc midpoint direction after base rotation (torus local +Y)
          const arcMid = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuat);
          // project camDir onto ring plane, normalize
          const proj = camDir.clone().sub(axis.clone().multiplyScalar(camDir.dot(axis)));
          const pLen = proj.length();
          if (pLen < 0.001) { ring.quaternion.copy(baseQuat); continue; }
          proj.divideScalar(pLen);
          // signed angle from arcMid to proj around axis
          const angle = Math.atan2(arcMid.clone().cross(proj).dot(axis), arcMid.dot(proj));
          _alignQ.setFromAxisAngle(axis, angle);
          ring.quaternion.copy(_alignQ).multiply(baseQuat);
        }
      }
    }
  }

  if (!gunState.held) return;
  const body = gunState.held.body;

  // ── selection modes: hold kinematic in place, apply rotation from heldRot ──
  if (SELECTION_MODES.has(_curMode)) {
    if (_curMode === 'animate') {
      _initAnimState(gunState.held);
      _initAnimRec(gunState.held);
      const pa = _applyAnimations(gunState.held, dt, body);
      const pr = _stepRec(gunState.held, dt, body);
      if (!pa && !pr) {
        const p = body.translation();
        body.setNextKinematicTranslation(p);
        if (gunState.heldRot) body.setNextKinematicRotation({ x: gunState.heldRot.x, y: gunState.heldRot.y, z: gunState.heldRot.z, w: gunState.heldRot.w });
      }
    } else {
      const p = body.translation();
      body.setNextKinematicTranslation(p);
      if (gunState.heldRot) {
        body.setNextKinematicRotation({
          x: gunState.heldRot.x, y: gunState.heldRot.y,
          z: gunState.heldRot.z, w: gunState.heldRot.w,
        });
      }
      // live scale preview — absolute per-axis, matches resizeProp exactly
      if (_curMode === 'scale' && gunState.scaleDirty) {
        gunState.held.mesh.scale.set(
          gunState.scaleVec.x,
          gunState.scaleVec.y,
          gunState.scaleVec.z,
        );
      }
    }
    if (gunState.editing) updateHud();
    return;
  }

  // ── frozen: hold in place kinematically ──
  if (gunState.frozen) {
    const p = body.translation();
    body.setNextKinematicTranslation(p);
    return;
  }

  // ── linear spring ──
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let target;
  if (_curMode === 'translate' && gunState.absHoldPos) {
    target = gunState.absHoldPos.clone().add(gunState.posOffset);
  } else {
    target = new THREE.Vector3().copy(dir).multiplyScalar(gunState.holdDist).add(camera.position);
  }

  const pos  = body.translation();
  const vel  = body.linvel();
  const mass = body.mass();
  const ex = target.x - pos.x, ey = target.y - pos.y, ez = target.z - pos.z;
  const ix = (HOLD_SPRING * ex - HOLD_DAMPING * vel.x) * mass * dt;
  const iy = (HOLD_SPRING * ey - HOLD_DAMPING * vel.y + GRAVITY) * mass * dt;
  const iz = (HOLD_SPRING * ez - HOLD_DAMPING * vel.z) * mass * dt;
  body.applyImpulse({ x: ix, y: iy, z: iz }, true);

  const nv = body.linvel();
  const spd = Math.sqrt(nv.x * nv.x + nv.y * nv.y + nv.z * nv.z);
  if (spd > HOLD_MAX_VEL) {
    const s = HOLD_MAX_VEL / spd;
    body.setLinvel({ x: nv.x * s, y: nv.y * s, z: nv.z * s }, true);
  }

  // ── rotation control ──
  // setAngvel instead of torque impulse: stable for all mass/inertia ratios.
  // torque * dt / I is enormous for lightweight objects (wheel, teapot), causing
  // violent oscillation even when analytically overdamped.
  if (!gunState.heldRot) return;
  const q    = body.rotation();
  const qCur = new THREE.Quaternion(q.x, q.y, q.z, q.w).normalize();
  const qErr = gunState.heldRot.clone().normalize().multiply(qCur.clone().invert());
  if (qErr.w < 0) qErr.negate();
  const aerx = 2 * qErr.x, aery = 2 * qErr.y, aerz = 2 * qErr.z;
  const ROT_SPEED = 12, MAX_ROT_AV = 10;
  let wx = aerx * ROT_SPEED, wy = aery * ROT_SPEED, wz = aerz * ROT_SPEED;
  const wMag = Math.sqrt(wx*wx + wy*wy + wz*wz);
  if (wMag > MAX_ROT_AV) { const sc = MAX_ROT_AV / wMag; wx *= sc; wy *= sc; wz *= sc; }
  body.setAngvel({ x: wx, y: wy, z: wz }, true);

  if (gunState.editing) updateHud();
}

// ── event listeners ──────────────────────────────────────────────────────────

addEventListener('mousedown', e => {
  if (!controls.isLocked) return;
  if (e.button === 0) {
    const isSel = SELECTION_MODES.has(MODES[gunState.mode]);
    if (isSel) {
      tryGrab();
    } else {
      gunState.held ? releaseHeld() : tryGrab();
    }
  } else if (e.button === 2) {
    const mode = MODES[gunState.mode];
    if (mode === 'freeze') toggleFreeze();
    else if (mode === 'shoot') launchHeld();
  }
});

addEventListener('wheel', e => {
  if (!controls.isLocked) return;
  if (!gunState.held) {
    cycleMode(e.deltaY > 0 ? 1 : -1);
  } else if (!SELECTION_MODES.has(MODES[gunState.mode])) {
    gunState.holdDist = Math.max(HOLD_DIST_MIN, Math.min(HOLD_DIST_MAX, gunState.holdDist - e.deltaY * 0.005));
  }
});

addEventListener('contextmenu', e => e.preventDefault());

addEventListener('keydown', e => {
  if (e.code === 'KeyZ' && !e.ctrlKey && !e.metaKey && !e.repeat && controls.isLocked) {
    e.preventDefault();
    _applyUndo();
  }
  if (e.code === 'KeyV' && !e.repeat && controls.isLocked) {
    e.preventDefault();
    toggleFly();
  }
});

// initial render
updateHud();

import * as THREE from 'three';
import { camera, controls } from './scene.js';
import { spawnCube, spawnSphere, spawnCone, spawnCylinder, spawnWheel, spawnTeapot, spawnCapsule, spawnDodecahedron, spawnIcosahedron, spawnOctahedron, spawnTorusKnot, spawnModel, snapToGround, propHalfHeight, props, removeProp } from './props.js';
import { gunState, pushUndo, releaseHeld } from './gravitygun.js';

// ── primitives (static) ──────────────────────────────────────────────────────
const PRIMITIVES = [
  { label: 'Cube',        spawn: p => spawnCube(p, 1.2) },
  { label: 'Plank',       spawn: p => spawnCube(p, { x: 2.4, y: 0.15, z: 0.6 }, 0xddaa77) },
  { label: 'Beam',        spawn: p => spawnCube(p, { x: 0.2, y: 2.0, z: 0.2 }, 0xaa8855) },
  { label: 'Sphere',      spawn: p => spawnSphere(p, 0.7) },
  { label: 'Cone',        spawn: p => spawnCone(p) },
  { label: 'Cylinder',    spawn: p => spawnCylinder(p) },
  { label: 'Capsule',     spawn: p => spawnCapsule(p) },
  { label: 'Wheel',       spawn: p => spawnWheel(p) },
  { label: 'Teapot',      spawn: p => spawnTeapot(p) },
  { label: 'Dodecahedron',spawn: p => spawnDodecahedron(p) },
  { label: 'Icosahedron', spawn: p => spawnIcosahedron(p) },
  { label: 'Octahedron',  spawn: p => spawnOctahedron(p) },
  { label: 'Torus Knot',  spawn: p => spawnTorusKnot(p) },
];

// ── dynamic list (primitives + scanned models) ───────────────────────────────
let SPAWN_ITEMS = [];
let selectableIndices = [];

function rebuildItems(modelFiles) {
  SPAWN_ITEMS = [
    { label: '── Primitives ──', separator: true },
    ...PRIMITIVES,
  ];
  if (modelFiles.length > 0) {
    SPAWN_ITEMS.push({ label: '── Models ──', separator: true });
    for (const f of modelFiles) {
      SPAWN_ITEMS.push({
        label: f.replace(/\.gltf$/i, '').replace(/\.glb$/i, '').replace(/_/g, ' '),
        spawn: p => spawnModel(p, f),
        async: true,
      });
    }
  }
  selectableIndices = SPAWN_ITEMS
    .map((item, i) => item.separator ? -1 : i)
    .filter(i => i >= 0);
  selectedSlot = Math.min(selectedSlot, selectableIndices.length - 1);
}

async function scanModels() {
  try {
    const res = await fetch('assets/models/');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => /\.(gltf|glb)$/i.test(h))
      .map(h => h.split('/').pop());
  } catch { return []; }
}

export let spawnMenuOpen = false;
let selectedSlot = 0;

rebuildItems([]);
scanModels().then(files => rebuildItems(files));

// ── DOM refs ──────────────────────────────────────────────────────────────────
const menuEl = document.getElementById('spawnmenu');
const listEl = document.getElementById('spawnmenu-list');

function renderMenu() {
  listEl.innerHTML = '';
  const activeIndex = selectableIndices[selectedSlot];
  SPAWN_ITEMS.forEach((item, i) => {
    const div = document.createElement('div');
    if (item.separator) {
      div.className = 'spawn-separator';
      div.textContent = item.label;
    } else {
      div.className = 'spawn-item' + (i === activeIndex ? ' sel' : '');
      div.textContent = (i === activeIndex ? '▶ ' : '  ') + item.label;
    }
    listEl.appendChild(div);
  });
  const selEl = listEl.querySelector('.sel');
  if (selEl) selEl.scrollIntoView({ block: 'nearest' });
}

function openMenu() {
  if (!controls.isLocked || gunState.held) return;
  spawnMenuOpen = true;
  renderMenu();
  menuEl.style.display = 'flex';
}

async function closeMenu(doSpawn) {
  if (!spawnMenuOpen) return;
  spawnMenuOpen = false;
  menuEl.style.display = 'none';
  if (doSpawn && controls.isLocked) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const pos = camera.position.clone().addScaledVector(dir, 2.5);
    const item = SPAWN_ITEMS[selectableIndices[selectedSlot]];
    if (item.async) {
      await item.spawn(pos);
    } else {
      item.spawn(pos);
    }
    const spawnedProp = props[props.length - 1];
    const hh = propHalfHeight(spawnedProp);
    snapToGround(pos, hh, spawnedProp.body);
    spawnedProp.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    pushUndo(() => {
      if (gunState.held === spawnedProp) releaseHeld();
      removeProp(spawnedProp);
    }, 'spawn');
  }
}

// ── input ─────────────────────────────────────────────────────────────────────
addEventListener('keydown', e => {
  if (e.code === 'KeyQ' && controls.isLocked && !e.repeat) openMenu();
});

addEventListener('keyup', e => {
  if (e.code === 'KeyQ') closeMenu(true);
});

// capture phase — intercepts before gravitygun.js wheel handler
addEventListener('wheel', e => {
  if (!spawnMenuOpen) return;
  e.stopImmediatePropagation();
  const len = selectableIndices.length;
  selectedSlot = ((selectedSlot + (e.deltaY > 0 ? 1 : -1)) % len + len) % len;
  renderMenu();
}, { capture: true });

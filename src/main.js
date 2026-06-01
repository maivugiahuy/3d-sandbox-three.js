import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { scene, camera, renderer, pool, overlay, statusEl, hud, controls, keys } from './scene.js';
import { world, eventQueue, updatePlayer, playerBody, velocity } from './physics.js';
import { buildMapCollider, removeMap, updateBuoyancy, syncProps } from './props.js';
import { gunState, setMapReady, updateGravityGun, updateAnimations, isFlyMode } from  './gravitygun.js';
import './spawnmenu.js';
import { configMenuOpen } from './configmenu.js';

let mapReady = false;

overlay.addEventListener('click', () => { if (mapReady) controls.lock(); });

const loader = new GLTFLoader();
const mapSelect = document.getElementById('map-select');

function finishMapLoad(root) {
  scene.add(root);
  buildMapCollider(root);
  playerBody.setTranslation({ x: 0, y: 10, z: 0 }, true);
  velocity.set(0, 0, 0);
  mapReady = true;
  setMapReady();
  statusEl.textContent = 'Ready — click to play';
}

function loadMap(filename) {
  mapReady = false;
  removeMap();

  if (filename === '__physics_test__') {
    finishMapLoad(buildPhysicsTestMap());
    return;
  }

  statusEl.textContent = `Loading map…`;
  loader.load(
    `assets/maps/${filename}`,
    gltf => {
      const root = gltf.scene;
      const rebuildMat = m => {
        if (!m) return m;
        const wasTransparent = !!m.transparent;
        const next = new THREE.MeshStandardMaterial({
          map:      m.map      || null,
          alphaMap: m.alphaMap || null,
          color:    new THREE.Color(0xffffff),
          alphaTest:   m.alphaTest > 0 ? m.alphaTest : (wasTransparent ? 0.5 : 0),
          transparent: false,
          opacity:     1,
          side:        THREE.DoubleSide,
          roughness:   0.95,
          metalness:   0.0,
          vertexColors: false,
        });
        next.envMapIntensity = 0;
        return next;
      };
      root.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          o.material = Array.isArray(o.material) ? o.material.map(rebuildMat) : rebuildMat(o.material);
        }
      });
      finishMapLoad(root);
    },
    xhr => {
      statusEl.textContent = xhr.total
        ? `Loading map… ${(xhr.loaded / xhr.total * 100).toFixed(0)}%`
        : `Loading map… ${(xhr.loaded / 1024 / 1024).toFixed(1)} MB`;
    },
    err => {
      statusEl.textContent = `Failed to load ${filename} — serve over http.`;
      console.error(err);
    }
  );
}

function buildPhysicsTestMap() {
  const root = new THREE.Group();
  const mat = c => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.1 });
    m.envMapIntensity = 0;
    return m;
  };
  function box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(x, y, z);
    if (rx) mesh.rotation.x = rx;
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }

  // ground plane
  box(120, 0.5, 120, 0x888888, 0, -0.25, 0);

  // ── ramps (different angles) ──
  box(6, 0.3, 10, 0x66aa66, -15, 1.2, -10, -Math.PI * 0.08);    // gentle 15°
  box(6, 0.3, 10, 0x55aa55, -15, 2.8, -22, -Math.PI * 0.14);    // medium 25°
  box(6, 0.3, 8,  0x449944, -15, 4.5, -33, -Math.PI * 0.22);    // steep 40°

  // ── stairs ──
  for (let i = 0; i < 8; i++) {
    box(4, 0.4, 1, 0xaa8866, 0, i * 0.4 + 0.2, -5 - i);
  }

  // ── platforms at heights ──
  box(4, 0.4, 4, 0x6688aa, 10, 3, -10);    // low
  box(3, 0.4, 3, 0x5577aa, 10, 6, -20);    // mid
  box(2.5, 0.4, 2.5, 0x4466aa, 10, 10, -30);   // high

  // ── walls for bounce testing ──
  box(0.5, 6, 12, 0xcc6644, 20, 3, -15);
  box(12, 6, 0.5, 0xcc6644, 14, 3, -9);

  // ── half-pipe / bowl ──
  const pipeSegs = 12;
  for (let i = 0; i < pipeSegs; i++) {
    const angle = (i / pipeSegs) * Math.PI;
    const r = 6;
    const px = -30 + Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    const seg = box(0.4, 1.5, 14, 0x9966cc, px, py, -20, 0, 0, angle);
  }

  // ── see-saw / balance beam ──
  box(10, 0.3, 2, 0xddaa44, 0, 1.5, 15);
  box(1, 1.5, 2, 0xcccc44, 0, 0.75, 15);   // pivot

  // ── narrow bridge ──
  box(1, 0.3, 20, 0xaa7744, -8, 5, 10);
  box(4, 0.4, 4, 0x8899aa, -8, 5, 0);       // start platform
  box(4, 0.4, 4, 0x8899aa, -8, 5, 20);      // end platform

  // ── funnel / slopes converging ──
  box(8, 0.3, 6, 0x77aa77, 25, 1.5, 5, 0, 0, Math.PI * 0.12);
  box(8, 0.3, 6, 0x77aa77, 35, 1.5, 5, 0, 0, -Math.PI * 0.12);

  // ── pillars for obstacle course ──
  for (let i = 0; i < 5; i++) {
    box(1, 4, 1, 0xbbbbbb, 15 + i * 3, 2, 15);
  }

  // ── drop tower ──
  box(4, 0.3, 4, 0x7788cc, 30, 15, -30);
  box(0.3, 15, 0.3, 0x999999, 28, 7.5, -28);  // support pole

  return root;
}

async function populateMapList() {
  try {
    const res = await fetch('assets/maps/');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const maps = [...doc.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => /\.(glb|gltf)$/i.test(h))
      .map(h => h.split('/').pop());
    mapSelect.innerHTML = '';
    const testOpt = document.createElement('option');
    testOpt.value = '__physics_test__';
    testOpt.textContent = 'physic_test';
    mapSelect.appendChild(testOpt);
    maps.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f.replace(/\.glb$/i, '').replace(/\.gltf$/i, '');
      mapSelect.appendChild(opt);
    });
    const defaultMap = maps.find(f => /^gm_construct\.(glb|gltf)$/i.test(f))
      || maps[0] || '__physics_test__';
    mapSelect.value = defaultMap;
    loadMap(defaultMap);
  } catch {
    statusEl.textContent = 'Could not scan maps folder';
  }
}

mapSelect.addEventListener('change', () => loadMap(mapSelect.value));
populateMapList();

const clock = new THREE.Clock();

function update(dt) {
  if (!mapReady || (!controls.isLocked && !configMenuOpen)) return;
  updateGravityGun(dt);
  updateAnimations(dt);
  updatePlayer(dt, keys, gunState.held, isFlyMode());
  world.timestep = dt;
  world.step(eventQueue);
  updateBuoyancy(gunState.held, dt);
  syncProps();
}

let _pFrames = 0, _pLast = performance.now();
function _flushHud() {
  hud.textContent = `FPS ${(_pFrames * 1000 / (performance.now() - _pLast)).toFixed(1)}`;
  _pFrames = 0; _pLast = performance.now();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  pool.material.uniforms['time'].value += dt * 0.25;
  renderer.render(scene, camera);
  _pFrames++;
  if (performance.now() - _pLast >= 500) _flushHud();
});

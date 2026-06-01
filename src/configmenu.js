import * as THREE from 'three';
import { controls, overlay, skyParams, updateSun } from './scene.js';
import { cfg, gunState, enterEditing, exitEditing, onGunEvent, pushUndo } from './gravitygun.js';

const MODES = ['freeze', 'shoot', 'translate', 'rotate', 'scale', 'paint', 'sun', 'animate'];
const MENU_MODES = ['translate', 'rotate', 'scale', 'paint', 'sun', 'animate'];

export let configMenuOpen = false;
let _altDown = false;

const menuEl  = document.getElementById('configmenu');
const titleEl = document.getElementById('configmenu-title');
const listEl  = document.getElementById('configmenu-list');

let _rotEuler = new THREE.Euler(0, 0, 0, 'YXZ');

// ── paint state ───────────────────────────────────────────────────────────────
let _paintTab    = 'color';
let _colorHex    = '#ff6633';
let _roughness   = 0.9;
let _metalness   = 0.0;
let _texFiles    = [];
const _texCache  = new Map();
const _texLoader = new THREE.TextureLoader();

async function fetchTexList() {
  try {
    const res  = await fetch('assets/textures/');
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => /\.(jpe?g|png|webp|bmp)$/i.test(h))
      .map(h => h.split('/').pop());
  } catch { return []; }
}

// Apply material to a prop mesh — handles both plain Mesh (primitives)
// and Group wrappers (models, where each child mesh needs the material).
function setPropMaterial(mesh, mat) {
  if (mesh.isMesh) {
    mesh.material = mat;
    mesh.castShadow = mesh.receiveShadow = true;
  } else {
    mesh.traverse(o => {
      if (o.isMesh) {
        o.material = mat;
        o.castShadow = o.receiveShadow = true;
      }
    });
  }
}

function applyColorMat() {
  if (!gunState.held) return;
  setPropMaterial(gunState.held.mesh, new THREE.MeshStandardMaterial({
    color: new THREE.Color(_colorHex),
    roughness: _roughness, metalness: _metalness, envMapIntensity: 0,
  }));
}

function applyTexMat(filename) {
  if (!gunState.held) return;
  const path = `assets/textures/${filename}`;
  let tex = _texCache.get(path);
  if (!tex) {
    tex = _texLoader.load(path);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    _texCache.set(path, tex);
  }
  const isPng = /\.png$/i.test(filename);
  setPropMaterial(gunState.held.mesh, new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.9, metalness: 0, envMapIntensity: 0,
    transparent: isPng, alphaTest: isPng ? 0.01 : 0,
  }));
}

// ── slider builder ────────────────────────────────────────────────────────────
function makeSlider(label, initVal, min, max, step, onChange) {
  const row    = document.createElement('div');  row.className = 'cfg-row';
  const AXIS_COLORS = { X: '#ff4444', Y: '#44ff44', Z: '#4488ff' };
  const lbl    = document.createElement('span'); lbl.className = 'cfg-lbl'; lbl.textContent = label;
  if (AXIS_COLORS[label]) lbl.style.color = AXIS_COLORS[label];
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = min; slider.max = max;
  slider.step = step; slider.value = initVal;
  const valEl  = document.createElement('span'); valEl.className = 'cfg-val';
  valEl.textContent = initVal.toFixed(2);
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    onChange(v);
    valEl.textContent = v.toFixed(2);
  });
  row.appendChild(lbl); row.appendChild(slider); row.appendChild(valEl);
  listEl.appendChild(row);
}

// ── paint menu ────────────────────────────────────────────────────────────────
function buildColorTab() {
  const row = document.createElement('div'); row.className = 'cfg-row';
  const lbl = document.createElement('span'); lbl.className = 'cfg-lbl'; lbl.textContent = 'Color';
  const colorIn = document.createElement('input');
  colorIn.type = 'color'; colorIn.value = _colorHex; colorIn.className = 'paint-color-in';
  colorIn.addEventListener('input', () => { _colorHex = colorIn.value; applyColorMat(); });
  row.appendChild(lbl); row.appendChild(colorIn);
  listEl.appendChild(row);
}

function buildTextureTab() {
  const wrap = document.createElement('div'); wrap.className = 'tex-list';
  if (_texFiles.length === 0) {
    wrap.innerHTML = '<div class="cfg-empty">no textures in assets/textures/</div>';
  } else {
    _texFiles.forEach(f => {
      const item = document.createElement('div'); item.className = 'tex-item';
      item.textContent = f;
      item.addEventListener('click', () => {
        wrap.querySelectorAll('.tex-item').forEach(el => el.classList.remove('sel'));
        item.classList.add('sel');
        applyTexMat(f);
      });
      wrap.appendChild(item);
    });
  }
  listEl.appendChild(wrap);
}

function buildPaintMenu() {
  titleEl.textContent = 'PAINT';
  listEl.innerHTML = '';

  const tabs = document.createElement('div'); tabs.className = 'paint-tabs';
  ['color', 'texture'].forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'paint-tab' + (_paintTab === tab ? ' active' : '');
    btn.textContent = tab.toUpperCase();
    btn.addEventListener('mousedown', e => { e.stopPropagation(); });
    btn.addEventListener('click', () => { _paintTab = tab; buildPaintMenu(); });
    tabs.appendChild(btn);
  });
  listEl.appendChild(tabs);

  if (_paintTab === 'color') buildColorTab();
  else buildTextureTab();
}

async function openPaintMenu() {
  if (gunState.held) {
    const undoMesh = gunState.held.mesh;
    // snapshot current materials (per-child for Group-wrapped models)
    const snapshot = [];
    if (undoMesh.isMesh) {
      snapshot.push([undoMesh, undoMesh.material]);
    } else {
      undoMesh.traverse(o => { if (o.isMesh) snapshot.push([o, o.material]); });
    }
    pushUndo(() => {
      for (const [obj, mat] of snapshot) {
        obj.material = mat;
        obj.castShadow = obj.receiveShadow = true;
      }
    }, 'paint');
  }
  titleEl.textContent = 'PAINT';
  listEl.innerHTML = '<div class="cfg-empty">loading…</div>';
  menuEl.style.display = 'block';
  _texFiles = await fetchTexList();
  buildPaintMenu();
}

// ── sun menu ──────────────────────────────────────────────────────────────────
function buildSunMenu() {
  titleEl.textContent = 'SUN';
  listEl.innerHTML = '';
  const snapElev = skyParams.elevation;
  const snapAzim = skyParams.azimuth;
  pushUndo(() => {
    skyParams.elevation = snapElev;
    skyParams.azimuth   = snapAzim;
    updateSun();
    if (configMenuOpen && MODES[gunState.mode] === 'sun') buildSunMenu();
  }, 'sun');
  makeSlider('Elevation', skyParams.elevation, -5, 90, 0.5,
    v => { skyParams.elevation = v; updateSun(); });
  makeSlider('Azimuth',   skyParams.azimuth,    0, 360, 1,
    v => { skyParams.azimuth   = v; updateSun(); });
}

// ── XYZ transform menu ────────────────────────────────────────────────────────
function buildXYZMenu() {
  listEl.innerHTML = '';
  const mode = MODES[gunState.mode];
  titleEl.textContent = mode.toUpperCase() + ' — XYZ';

  if (mode === 'translate') {
    const o = gunState.posOffset;
    makeSlider('X', o.x, -10, 10, 0.01, v => { gunState.posOffset.x = v; });
    makeSlider('Y', o.y, -10, 10, 0.01, v => { gunState.posOffset.y = v; });
    makeSlider('Z', o.z, -10, 10, 0.01, v => { gunState.posOffset.z = v; });

  } else if (mode === 'rotate') {
    gunState.rotOffset.set(0, 0, 0);
    const _rotBase = gunState.heldRot ? gunState.heldRot.clone() : new THREE.Quaternion();
    const _rotDelta = new THREE.Quaternion();
    const applyRot = () => {
      _rotEuler.set(gunState.rotOffset.x, gunState.rotOffset.y, gunState.rotOffset.z, 'XYZ');
      _rotDelta.setFromEuler(_rotEuler);
      gunState.heldRot.copy(_rotDelta).multiply(_rotBase);
    };
    makeSlider('X', 0, -Math.PI, Math.PI, 0.01, v => { gunState.rotOffset.x = v; applyRot(); });
    makeSlider('Y', 0, -Math.PI, Math.PI, 0.01, v => { gunState.rotOffset.y = v; applyRot(); });
    makeSlider('Z', 0, -Math.PI, Math.PI, 0.01, v => { gunState.rotOffset.z = v; applyRot(); });

  } else if (mode === 'scale') {
    if (gunState.held) gunState.scaleVec.copy(gunState.held.savedScale);
    const s = gunState.scaleVec;
    makeSlider('X', s.x, cfg.SCALE_MIN, cfg.SCALE_MAX, 0.05, v => { gunState.scaleVec.x = v; gunState.scaleDirty = true; });
    makeSlider('Y', s.y, cfg.SCALE_MIN, cfg.SCALE_MAX, 0.05, v => { gunState.scaleVec.y = v; gunState.scaleDirty = true; });
    makeSlider('Z', s.z, cfg.SCALE_MIN, cfg.SCALE_MAX, 0.05, v => { gunState.scaleVec.z = v; gunState.scaleDirty = true; });
  }
}

// ── animate menu ──────────────────────────────────────────────────────────────
let _animTab = 'preset'; // 'preset' | 'record'
const ANIM_SEG_UI = 1.5;

function makeButton(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'cfg-btn';
  btn.textContent = label;
  btn.addEventListener('mousedown', e => e.stopPropagation());
  btn.addEventListener('click', onClick);
  listEl.appendChild(btn);
  return btn;
}

function buildAnimMenu() {
  titleEl.textContent = 'ANIMATE';
  listEl.innerHTML = '';
  const prop = gunState.held;
  if (!prop) return;
  if (!prop.animState) prop.animState = { anim1: false, anim2: false, anim3: false, alpha: 0, origin: null };
  if (!prop.animRec) prop.animRec = { keyframes:[], playing:false, time:0, totalTime:0, speed:1 };

  // tabs
  const tabs = document.createElement('div'); tabs.className = 'paint-tabs';
  for (const [id, label] of [['preset','PRESET'],['record','RECORD']]) {
    const btn = document.createElement('button');
    btn.className = 'paint-tab' + (_animTab === id ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', () => { _animTab = id; buildAnimMenu(); });
    tabs.appendChild(btn);
  }
  listEl.appendChild(tabs);

  if (_animTab === 'preset') {
    const s = prop.animState;
    for (const [key, label] of [['anim1','Spin'],['anim2','Bob'],['anim3','Orbit']]) {
      const btn = makeButton(s[key] ? `■  ${label}` : `▶  ${label}`, () => {
        if (!s[key]) {
          const p = prop.body.translation();
          if (!s.origin) s.origin = { x: p.x, y: p.y, z: p.z };
          s[key] = true;
        } else { s[key] = false; }
        buildAnimMenu();
      });
      if (s[key]) btn.classList.add('cfg-btn-active');
    }
  } else {
    const anim = prop.animRec;
    const info = document.createElement('div'); info.className = 'cfg-empty';
    listEl.appendChild(info);
    let playBtn;
    const refresh = () => {
      info.textContent = `${anim.keyframes.length} keyframe(s)  ${anim.playing ? '▶ playing' : '■ stopped'}`;
      if (playBtn) { playBtn.textContent = anim.playing ? '■  Stop' : '▶  Play'; playBtn.classList.toggle('cfg-btn-active', anim.playing); }
    };
    makeButton('⏺  Record keyframe', () => {
      const p = prop.body.translation(), r = prop.body.rotation();
      anim.keyframes.push({ pos:{x:p.x,y:p.y,z:p.z}, quat:{x:r.x,y:r.y,z:r.z,w:r.w} });
      anim.totalTime = anim.keyframes.length * ANIM_SEG_UI;
      refresh();
    });
    playBtn = makeButton(anim.playing ? '■  Stop' : '▶  Play', () => {
      if (anim.keyframes.length < 2) return;
      anim.playing = !anim.playing;
      if (anim.playing) anim.time = 0;
      refresh();
    });
    if (anim.playing) playBtn.classList.add('cfg-btn-active');
    makeButton('✕  Clear', () => { anim.keyframes=[]; anim.playing=false; anim.time=0; anim.totalTime=0; refresh(); });
    makeSlider('Speed', anim.speed, 0.1, 4, 0.1, v => { anim.speed = v; });
    refresh();
  }
}

// ── open / close / sync ───────────────────────────────────────────────────────
function openMenu() {
  if (configMenuOpen) return;
  const mode = MODES[gunState.mode];
  if (!MENU_MODES.includes(mode)) return;
  if (mode !== 'sun' && !gunState.held) return;
  configMenuOpen = true;
  menuEl.style.display = 'block';
  if (mode === 'sun') {
    buildSunMenu();
  } else if (mode === 'animate') {
    buildAnimMenu();
  } else if (mode === 'paint') {
    openPaintMenu();
  } else {
    enterEditing();
    buildXYZMenu();
  }
}

function closeMenu() {
  if (!configMenuOpen) return;
  exitEditing();
  configMenuOpen = false;
  menuEl.style.display = 'none';
  if (_altDown) {
    _altDown = false;
    controls.lock();
  }
}

function syncMenu() {
  const mode = MODES[gunState.mode];
  const shouldShow = MENU_MODES.includes(mode) && (mode === 'sun' || !!(gunState.held));
  if (shouldShow) {
    if (!configMenuOpen) {
      openMenu();
    } else {
      // mode changed while menu open — commit old editing, rebuild for new mode
      exitEditing();
      if (mode === 'sun')        buildSunMenu();
      else if (mode === 'animate') buildAnimMenu();
      else if (mode === 'paint')   openPaintMenu();
      else { enterEditing(); buildXYZMenu(); }
    }
  } else {
    closeMenu();
  }
}

onGunEvent(syncMenu);

// keep overlay hidden while menu open
new MutationObserver(() => {
  if (configMenuOpen && overlay.style.display !== 'none')
    overlay.style.display = 'none';
}).observe(overlay, { attributes: true, attributeFilter: ['style'] });

// ── Alt: unlock cursor for slider interaction ─────────────────────────────────
addEventListener('keydown', e => {
  if ((e.code === 'AltLeft' || e.code === 'AltRight') && configMenuOpen && !_altDown) {
    e.preventDefault();
    _altDown = true;
    controls.unlock();
    overlay.style.display = 'none';
  }
});

addEventListener('keyup', e => {
  if ((e.code === 'AltLeft' || e.code === 'AltRight') && _altDown) {
    _altDown = false;
    if (configMenuOpen) controls.lock();
  }
});

// ── block game input only while cursor is unlocked (alt held) ─────────────────
addEventListener('keydown', e => {
  if (!configMenuOpen) return;
  if (['KeyR', 'KeyQ'].includes(e.code)) e.stopImmediatePropagation();
}, { capture: true });

addEventListener('mousedown', e => {
  if (!configMenuOpen || !_altDown) return;
  e.stopImmediatePropagation();
}, { capture: true });

addEventListener('wheel', e => {
  if (!configMenuOpen || !_altDown) return;
  e.stopImmediatePropagation();
}, { capture: true });

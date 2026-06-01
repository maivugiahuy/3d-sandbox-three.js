import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { world, RAPIER, GRAVITY } from './physics.js';
import { scene } from './scene.js';
import { config } from './config.js';

const wb = config.water.poolBounds;
export const WATER_Y    = config.water.y;
export const POOL_X_MIN = wb.xMin;
export const POOL_X_MAX = wb.xMax;
export const POOL_Z_MIN = wb.zMin;
export const POOL_Z_MAX = wb.zMax;

export const props      = [];
export const propMeshes = [];

export function propHalfHeight(prop) {
  const box = new THREE.Box3().setFromObject(prop.mesh);
  const size = box.getSize(new THREE.Vector3());
  return size.y / 2;
}

export function snapToGround(pos, halfHeight = 0.5, excludeBody = null) {
  const ray = new RAPIER.Ray(
    { x: pos.x, y: pos.y + 50, z: pos.z },
    { x: 0, y: -1, z: 0 }
  );
  // exclude the just-spawned body so the ray doesn't hit the object itself
  const hit = world.castRay(ray, 200, true, undefined, undefined, undefined, excludeBody);
  if (hit) {
    const groundY = pos.y + 50 - hit.timeOfImpact;
    pos.y = groundY + halfHeight;
  }
  return pos;
}

export function addProp(mesh, body, col, meta = {}) {
  mesh.userData.propIndex = props.length;
  props.push({ mesh, body, collider: col, savedScale: new THREE.Vector3(1, 1, 1), ...meta });
  propMeshes.push(mesh);
  scene.add(mesh);
}

export function removeProp(prop) {
  const idx = props.indexOf(prop);
  if (idx === -1) return;
  props.splice(idx, 1);
  propMeshes.splice(idx, 1);
  for (let i = idx; i < props.length; i++) props[i].mesh.userData.propIndex = i;
  scene.remove(prop.mesh);
  world.removeCollider(prop.collider, true);
  world.removeRigidBody(prop.body);
  if (prop.mesh.geometry) {
    prop.mesh.geometry.dispose();
  } else {
    prop.mesh.traverse(o => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material?.dispose();
      }
    });
  }
}

// newAbsScale is the ABSOLUTE per-axis scale from the base geometry (savedScale values).
// Geometry is never rebuilt — mesh.scale carries all scaling permanently.
// Physics collider is rebuilt: cuboid for cube (exact), convexHull for everything else.
export function resizeProp(prop, newAbsScale) {
  world.removeCollider(prop.collider, true);
  const sx = newAbsScale.x, sy = newAbsScale.y, sz = newAbsScale.z;
  let desc;

  if (prop.shape === 'cube') {
    // Exact per-axis cuboid; prop.size is the immutable base size
    desc = RAPIER.ColliderDesc.cuboid(
      prop.size.x * sx / 2,
      prop.size.y * sy / 2,
      prop.size.z * sz / 2,
    );
  } else if (prop.shape === 'model') {
    // Model mesh is a Group (no .geometry). Rescale stored base hull verts.
    const base = prop.hullVerts;
    const verts = new Float32Array(base.length);
    for (let i = 0; i < base.length; i += 3) {
      verts[i]     = base[i]     * sx;
      verts[i + 1] = base[i + 1] * sy;
      verts[i + 2] = base[i + 2] * sz;
    }
    desc = RAPIER.ColliderDesc.convexHull(verts)
        || RAPIER.ColliderDesc.cuboid(0.5 * sx, 0.5 * sy, 0.5 * sz);
  } else {
    // Scale base-geometry vertices by newAbsScale → convex hull
    const posAttr = prop.mesh.geometry.getAttribute('position');
    const verts = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      verts[i * 3]     = posAttr.getX(i) * sx;
      verts[i * 3 + 1] = posAttr.getY(i) * sy;
      verts[i * 3 + 2] = posAttr.getZ(i) * sz;
    }
    const baseR = prop.radius ?? prop.teapotSize ?? prop.torusR ?? prop.tkR ?? 0.5;
    const avgS  = (sx + sy + sz) / 3;
    desc = RAPIER.ColliderDesc.convexHull(verts)
        || RAPIER.ColliderDesc.ball(baseR * avgS);
  }

  desc.setDensity(prop.density).setRestitution(prop.restitution).setFriction(prop.friction);
  prop.collider = world.createCollider(desc, prop.body);
  prop.savedScale.copy(newAbsScale);
  prop.mesh.scale.set(sx, sy, sz);
}

export function spawnCube(pos, size = 1.2, color = 0xff6633) {
  const sx = (size && typeof size === 'object') ? size.x : size;
  const sy = (size && typeof size === 'object') ? size.y : size;
  const sz = (size && typeof size === 'object') ? size.z : size;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05)
      .setAngularDamping(0.2)
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setDensity(8).setRestitution(0.15).setFriction(0.8),
    body
  );
  addProp(mesh, body, col, {
    shape: 'cube', size: { x: sx, y: sy, z: sz },
    density: 8, restitution: 0.15, friction: 0.8,
  });
}

export function spawnSphere(pos, r = 0.7, color = 0x33aaff) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r, 24, 16),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05)
      .setAngularDamping(0.2)
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.ball(r)
      .setDensity(8).setRestitution(0.45).setFriction(0.6),
    body
  );
  addProp(mesh, body, col, {
    shape: 'sphere', radius: r,
    density: 8, restitution: 0.45, friction: 0.6,
  });
}

let currentMapBody = null;
let currentMapRoot = null;

export function buildMapCollider(root) {
  const mapBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  currentMapBody = mapBody;
  currentMapRoot = root;
  let n = 0;
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const geom = o.geometry.clone();
    geom.applyMatrix4(o.matrixWorld);
    const posAttr = geom.getAttribute('position');
    if (!posAttr) return;
    const positions = new Float32Array(posAttr.array);
    let indices;
    if (geom.index) {
      indices = new Uint32Array(geom.index.array);
    } else {
      indices = new Uint32Array(posAttr.count);
      for (let i = 0; i < posAttr.count; i++) indices[i] = i;
    }
    try {
      world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices), mapBody);
      n++;
    } catch (e) { console.warn('trimesh fail:', o.name, e); }
    geom.dispose();
  });
  console.log(`Map colliders: ${n}`);
}

export function removeMap() {
  if (currentMapRoot) {
    scene.remove(currentMapRoot);
    currentMapRoot.traverse(o => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material?.dispose();
      }
    });
    currentMapRoot = null;
  }
  if (currentMapBody) {
    world.removeRigidBody(currentMapBody);
    currentMapBody = null;
  }
}

export function spawnCone(pos, r = 0.5, h = 1.2, color = 0xff9922) {
  const geom = new THREE.ConeGeometry(r, h, 20);
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.cone(h / 2, r)
      .setDensity(8).setRestitution(0.15).setFriction(0.8), body
  );
  addProp(mesh, body, col, { shape: 'cone', radius: r, height: h, density: 8, restitution: 0.15, friction: 0.8 });
}

export function spawnCylinder(pos, r = 0.5, h = 1.2, color = 0x22cc88) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 20),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.cylinder(h / 2, r).setDensity(8).setRestitution(0.15).setFriction(0.8), body
  );
  addProp(mesh, body, col, { shape: 'cylinder', radius: r, height: h, density: 8, restitution: 0.15, friction: 0.8 });
}

export function spawnWheel(pos, color = 0x222222) {
  const R = 0.55, tube = 0.18;
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(R, tube, 12, 32),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.cylinder(tube, R + tube)
      .setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
      .setDensity(8).setRestitution(0.3).setFriction(0.9), body
  );
  addProp(mesh, body, col, { shape: 'wheel', torusR: R, torusTube: tube, density: 8, restitution: 0.3, friction: 0.9 });
}

export function spawnCapsule(pos, r = 0.35, h = 1.0, color = 0xcc44ff) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(r, h, 8, 16),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.capsule(h / 2, r).setDensity(8).setRestitution(0.2).setFriction(0.8), body
  );
  addProp(mesh, body, col, { shape: 'capsule', radius: r, height: h, density: 8, restitution: 0.2, friction: 0.8 });
}

export function spawnDodecahedron(pos, r = 0.6, color = 0xff4488) {
  const g = new THREE.DodecahedronGeometry(r);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    (RAPIER.ColliderDesc.convexHull(new Float32Array(g.getAttribute('position').array))
      || RAPIER.ColliderDesc.ball(r))
      .setDensity(8).setRestitution(0.2).setFriction(0.7), body
  );
  addProp(mesh, body, col, { shape: 'dodecahedron', radius: r, density: 8, restitution: 0.2, friction: 0.7 });
}

export function spawnIcosahedron(pos, r = 0.6, color = 0x44ccff) {
  const g = new THREE.IcosahedronGeometry(r);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    (RAPIER.ColliderDesc.convexHull(new Float32Array(g.getAttribute('position').array))
      || RAPIER.ColliderDesc.ball(r))
      .setDensity(8).setRestitution(0.25).setFriction(0.6), body
  );
  addProp(mesh, body, col, { shape: 'icosahedron', radius: r, density: 8, restitution: 0.25, friction: 0.6 });
}

export function spawnOctahedron(pos, r = 0.6, color = 0xffcc00) {
  const g = new THREE.OctahedronGeometry(r);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    (RAPIER.ColliderDesc.convexHull(new Float32Array(g.getAttribute('position').array))
      || RAPIER.ColliderDesc.ball(r))
      .setDensity(8).setRestitution(0.3).setFriction(0.6), body
  );
  addProp(mesh, body, col, { shape: 'octahedron', radius: r, density: 8, restitution: 0.3, friction: 0.6 });
}

export function spawnTorusKnot(pos, color = 0xff6644) {
  const R = 0.4, tube = 0.15;
  const g = new THREE.TorusKnotGeometry(R, tube, 64, 8);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    (RAPIER.ColliderDesc.convexHull(new Float32Array(g.getAttribute('position').array))
      || RAPIER.ColliderDesc.ball(R))
      .setDensity(8).setRestitution(0.2).setFriction(0.7), body
  );
  addProp(mesh, body, col, { shape: 'torusknot', tkR: R, tkTube: tube, density: 8, restitution: 0.2, friction: 0.7 });
}

export function spawnTeapot(pos, color = 0xcc8844) {
  const size = 0.5;
  const mesh = new THREE.Mesh(
    new TeapotGeometry(size, 8),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.castShadow = true; mesh.receiveShadow = true;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05).setAngularDamping(0.2)
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.ball(size * 1.1)
      .setDensity(8).setRestitution(0.15).setFriction(0.8), body
  );
  addProp(mesh, body, col, { shape: 'teapot', teapotSize: size, density: 8, restitution: 0.15, friction: 0.8 });
}

const modelLoader = new GLTFLoader();
const modelCache = new Map();

function loadModelGLTF(path) {
  if (modelCache.has(path)) return Promise.resolve(modelCache.get(path));
  return new Promise((resolve, reject) => {
    modelLoader.load(path, gltf => {
      modelCache.set(path, gltf);
      resolve(gltf);
    }, undefined, reject);
  });
}

export async function spawnModel(pos, filename) {
  const path = `assets/models/${filename}`;
  const gltf = await loadModelGLTF(path);
  const root = gltf.scene.clone(true);

  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  const wrapper = new THREE.Group();
  wrapper.add(root);
  wrapper.position.set(pos.x, pos.y, pos.z);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.05)
      .setAngularDamping(0.2)
  );

  const allVerts = [];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const geom = o.geometry.clone();
    geom.applyMatrix4(o.matrixWorld);
    const pa = geom.getAttribute('position');
    if (pa) {
      for (let i = 0; i < pa.count; i++) {
        allVerts.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      }
    }
    geom.dispose();
  });

  const hullVerts = new Float32Array(allVerts);
  const hullDesc = RAPIER.ColliderDesc.convexHull(hullVerts);
  const fallback = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
  const col = world.createCollider(
    (hullDesc || fallback).setDensity(8).setRestitution(0.2).setFriction(0.7),
    body
  );

  addProp(wrapper, body, col, {
    shape: 'model', modelFile: filename, hullVerts,
    density: 8, restitution: 0.2, friction: 0.7,
  });
}

export function updateBuoyancy(held, dt) {
  for (const p of props) {
    const bt = p.body.translation();
    const inPool = bt.x >= POOL_X_MIN && bt.x <= POOL_X_MAX
                && bt.z >= POOL_Z_MIN && bt.z <= POOL_Z_MAX;
    if (p === held) continue;
    if (bt.y < WATER_Y && inPool) {
      const vel    = p.body.linvel();
      const offset = (WATER_Y - 0.4) - bt.y;
      const targetVelY = GRAVITY * dt + offset * 8.0;
      p.body.setLinvel({
        x: vel.x * 0.85,
        y: Math.min(targetVelY, 1.5),
        z: vel.z * 0.85,
      }, true);
      p.body.setAngularDamping(4.0);
    } else {
      p.body.setAngularDamping(0.2);
    }
  }
}

export function syncProps() {
  for (const p of props) {
    const pt = p.body.translation();
    const pr = p.body.rotation();
    p.mesh.position.set(pt.x, pt.y, pt.z);
    p.mesh.quaternion.set(pr.x, pr.y, pr.z, pr.w);
  }
}

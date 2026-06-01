import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { config } from './config.js';

const env = config.environment;
const w = config.water;

export const overlay     = document.getElementById('overlay');
export const statusEl    = document.getElementById('status');
export const hud         = document.getElementById('hud');
export const modeHud     = document.getElementById('modehud');
export const modeListEl  = document.getElementById('modelist');

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(parseInt(env.fogColor), env.fogNear, env.fogFar);

export const camera = new THREE.PerspectiveCamera(config.player.fov, innerWidth / innerHeight, 0.1, 5000);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xaaaaaa, env.hemisphereIntensity));
export const sunLight = new THREE.DirectionalLight(0xffffff, env.sunIntensity);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(env.shadowMapSize, env.shadowMapSize);
sunLight.shadow.camera.near = env.shadowCameraNear;
sunLight.shadow.camera.far = env.shadowCameraFar;
sunLight.shadow.camera.left   = -env.shadowCameraSize;
sunLight.shadow.camera.right  =  env.shadowCameraSize;
sunLight.shadow.camera.top    =  env.shadowCameraSize;
sunLight.shadow.camera.bottom = -env.shadowCameraSize;
sunLight.shadow.bias = env.shadowBias;
sunLight.shadow.normalBias = env.shadowNormalBias;
sunLight.shadow.camera.updateProjectionMatrix();
scene.add(sunLight);
scene.add(sunLight.target);

export const sky = new Sky();
sky.scale.setScalar(450000);
scene.add(sky);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
export const sunVec = new THREE.Vector3();
export const skyParams = {
  turbidity: env.turbidity, rayleigh: env.rayleigh, mieCoefficient: env.mieCoefficient,
  mieDirectionalG: env.mieDirectionalG, elevation: env.sunElevation, azimuth: env.sunAzimuth,
  exposure: env.exposure,
};

const poolGeo = new THREE.PlaneGeometry(w.poolSize.width, w.poolSize.height);
export const pool = new Water(poolGeo, {
  textureWidth: w.textureSize, textureHeight: w.textureSize,
  waterNormals: new THREE.TextureLoader().load(
    'assets/textures/waternormals.jpg',
    t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  ),
  sunDirection: new THREE.Vector3(),
  sunColor: 0xffffff, waterColor: 0x001e0f, distortionScale: w.distortionScale,
  fog: scene.fog !== undefined,
});
pool.rotation.x = -Math.PI / 2;
pool.position.set(w.poolPosition.x, w.y, w.poolPosition.z);
scene.add(pool);

export function updateSun() {
  const phi   = THREE.MathUtils.degToRad(90 - skyParams.elevation);
  const theta = THREE.MathUtils.degToRad(skyParams.azimuth);
  sunVec.setFromSphericalCoords(1, phi, theta);
  const u = sky.material.uniforms;
  u['turbidity'].value       = skyParams.turbidity;
  u['rayleigh'].value        = skyParams.rayleigh;
  u['mieCoefficient'].value  = skyParams.mieCoefficient;
  u['mieDirectionalG'].value = skyParams.mieDirectionalG;
  u['sunPosition'].value.copy(sunVec);
  pool.material.uniforms['sunDirection'].value.copy(sunVec);
  scene.environment = pmremGenerator.fromScene(sky).texture;
  scene.environmentIntensity = 0;
  sunLight.position.copy(sunVec).multiplyScalar(1000);
  renderer.toneMappingExposure = skyParams.exposure;
}
updateSun();

export const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());
controls.addEventListener('lock',   () => overlay.style.display = 'none');
controls.addEventListener('unlock', () => overlay.style.display = 'flex');

export const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup',   e => { keys[e.code] = false; });

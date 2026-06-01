import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { camera, controls, sunLight, sunVec } from './scene.js';
import { config } from './config.js';

await RAPIER.init();
export { RAPIER };

const p = config.player;
const ph = config.physics;

export const world      = new RAPIER.World({ x: 0, y: -ph.gravity, z: 0 });
export const eventQueue = new RAPIER.EventQueue(true);

export const CAPSULE_RADIUS      = p.capsuleRadius;
export const CAPSULE_HALF_HEIGHT = p.capsuleHalfHeight;
export const EYE_OFFSET          = p.eyeOffset;
export const GRAVITY             = ph.gravity;
export const JUMP_SPEED          = p.jumpSpeed;
export const MOVE_SPEED          = p.moveSpeed;
export const SPRINT_MULT         = p.sprintMultiplier;
export const MAX_STEP            = p.maxStepHeight;
export const COYOTE_TIME         = p.coyoteTime;
export const JUMP_BUFFER         = p.jumpBuffer;

export const velocity    = new THREE.Vector3();
export const playerState = { onGround: false, coyoteTimer: 0, jumpBufferTimer: 0 };

export let playerBody, playerCollider, characterController;

export function initPlayer(startY = 10) {
  characterController = world.createCharacterController(p.controllerSkinWidth);
  characterController.setApplyImpulsesToDynamicBodies(true);
  characterController.setSlideEnabled(true);
  characterController.setMaxSlopeClimbAngle(Math.PI * (p.maxSlopeClimb / 180));
  characterController.setMinSlopeSlideAngle(Math.PI * (p.minSlopeSlide / 180));
  characterController.enableAutostep(MAX_STEP, p.autostepMinWidth, true);
  characterController.enableSnapToGround(p.snapToGroundDist);

  playerBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, startY, 0)
  );
  playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS),
    playerBody
  );
}
initPlayer(80);

addEventListener('keydown', e => {
  if (e.code === 'Space') playerState.jumpBufferTimer = JUMP_BUFFER;
});

const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();

const FLY_SPEED = p.flySpeed;

export function updatePlayer(dt, keys, held, fly = false) {
  const player = controls.getObject();

  if (fly) {
    const flyDir = new THREE.Vector3();
    camera.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, camera.up).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    if (keys['KeyW']) flyDir.add(_fwd);
    if (keys['KeyS']) flyDir.sub(_fwd);
    if (keys['KeyD']) flyDir.add(_right);
    if (keys['KeyA']) flyDir.sub(_right);
    if (keys['Space']) flyDir.add(up);
    if (keys['ControlLeft'] || keys['ControlRight']) flyDir.sub(up);
    if (flyDir.lengthSq() > 0) flyDir.normalize();

    const speed = FLY_SPEED * (keys['ShiftLeft'] || keys['ShiftRight'] ? SPRINT_MULT : 1);
    flyDir.multiplyScalar(speed * dt);

    const t = playerBody.translation();
    playerBody.setNextKinematicTranslation({ x: t.x + flyDir.x, y: t.y + flyDir.y, z: t.z + flyDir.z });

    const pos = playerBody.translation();
    player.position.set(pos.x, pos.y + EYE_OFFSET, pos.z);
    velocity.set(0, 0, 0);

    sunLight.position.copy(sunVec).multiplyScalar(1000).add(player.position);
    sunLight.target.position.copy(player.position);
    sunLight.target.updateMatrixWorld();
    return;
  }

  camera.getWorldDirection(_fwd);
  _fwd.y = 0; _fwd.normalize();
  _right.crossVectors(_fwd, camera.up).normalize();

  const input = new THREE.Vector3();
  if (keys['KeyW']) input.add(_fwd);
  if (keys['KeyS']) input.sub(_fwd);
  if (keys['KeyD']) input.add(_right);
  if (keys['KeyA']) input.sub(_right);
  if (input.lengthSq() > 0) input.normalize();

  const speed = MOVE_SPEED * (keys['ShiftLeft'] || keys['ShiftRight'] ? SPRINT_MULT : 1);
  velocity.x = input.x * speed;
  velocity.z = input.z * speed;

  playerState.coyoteTimer     = Math.max(0, playerState.coyoteTimer     - dt);
  playerState.jumpBufferTimer = Math.max(0, playerState.jumpBufferTimer - dt);

  if (playerState.onGround && velocity.y < 0) velocity.y = 0;
  else velocity.y -= GRAVITY * dt;

  const desired = { x: velocity.x * dt, y: velocity.y * dt, z: velocity.z * dt };
  characterController.computeColliderMovement(
    playerCollider,
    desired,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    col => !held || col.handle !== held.collider.handle
  );
  playerState.onGround = characterController.computedGrounded();
  if (playerState.onGround) playerState.coyoteTimer = COYOTE_TIME;

  if (playerState.jumpBufferTimer > 0 && playerState.coyoteTimer > 0) {
    velocity.y = JUMP_SPEED;
    playerState.jumpBufferTimer = 0;
    playerState.coyoteTimer = 0;
  }

  const move = characterController.computedMovement();
  const t = playerBody.translation();
  playerBody.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y, z: t.z + move.z });

  const pos = playerBody.translation();
  player.position.set(pos.x, pos.y + EYE_OFFSET, pos.z);

  sunLight.position.copy(sunVec).multiplyScalar(1000).add(player.position);
  sunLight.target.position.copy(player.position);
  sunLight.target.updateMatrixWorld();

  if (pos.y < -100) {
    playerBody.setTranslation({ x: 0, y: 10, z: 0 }, true);
    velocity.set(0, 0, 0);
  }
}

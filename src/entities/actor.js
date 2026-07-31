/**
 * A character in the world: a 3D model, a facing, and a walk cycle.
 *
 * Facing is now in *world* space — the model turns to look where it is walking,
 * and eases into the turn. The old sprite version had to derive a facing in
 * camera space (screen-left meant the "left" sprite row), which is exactly the
 * sort of thing that gave the characters away as a separate medium.
 */
import * as THREE from 'three';
import { CHARS, buildCharacter, buildDog, poseCharacter } from './model.js';
import { T } from '../core/tex.js';

export class Actor {
  /**
   * @param {string} kind key into CHARS, or 'dog'
   * @param {{x:number,y:number,z:number,dir?:string,speed?:number,scale?:number}} opts
   */
  constructor(kind, opts = {}) {
    this.kind = kind;
    const scale = opts.scale ?? 1;

    this.model = kind === 'dog' ? buildDog() : buildCharacter(CHARS[kind] ?? CHARS.townsman);
    this.model.scale.multiplyScalar(scale);
    this.height = (this.model.userData.height ?? 1.7) * scale;

    this.group = new THREE.Group();
    this.group.add(this.model);

    // Contact shadow. The sun casts a real one; this darkens the point of
    // contact so the figure never looks like it is hovering.
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95 * scale, 0.7 * scale),
      new THREE.MeshBasicMaterial({
        map: T.blob(), transparent: true, depthWrite: false, opacity: 0.55,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.shadow.renderOrder = 1;
    this.shadow.userData.dynamic = true;
    this.group.add(this.shadow);

    this.pos = new THREE.Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    this.speed = opts.speed ?? 4.6;
    this.radius = opts.radius ?? 0.42;
    this.phase = 0;
    this.moving = false;
    /** When set, animate() leaves the pose alone (screenshots, cutscenes). */
    this.frozen = false;

    // 0 = facing +Z, which is toward the default camera.
    this.yaw = DIR_YAW[opts.dir ?? 'down'] ?? 0;
    this.targetYaw = this.yaw;
    this.model.rotation.y = this.yaw;
    this.syncTransform();
  }

  /** Kept for compatibility with the tint system; models are lit for real now. */
  setTint() {}

  /** Turn to face a world-space direction. */
  face(dx, dz) {
    if (dx * dx + dz * dz < 1e-6) return;
    this.targetYaw = Math.atan2(dx, dz);
  }

  /** Face another point in the world (used when someone talks to you). */
  facePoint(x, z) {
    this.face(x - this.pos.x, z - this.pos.z);
  }

  /**
   * Advance the walk cycle by distance travelled, and ease the turn.
   * Keeping the stride tied to distance rather than time means it stays in step
   * with the character's speed at any frame rate.
   */
  animate(distance, dt, t = 0) {
    if (this.frozen) return;
    this.moving = distance > 1e-4;
    if (this.moving) {
      const stride = 0.42 * (this.model.scale.x || 1);
      this.phase += distance / stride;
    } else {
      this.phase = 0;
    }

    // shortest-arc turn
    let delta = this.targetYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.yaw += delta * (1 - Math.exp(-dt * 14));
    this.model.rotation.y = this.yaw;

    poseCharacter(this.model, this.phase, this.moving, t);
  }

  syncTransform() {
    this.group.position.copy(this.pos);
  }
}

/** Spawn facings, expressed the old compass way for the level data. */
const DIR_YAW = {
  down: 0,
  up: Math.PI,
  right: Math.PI / 2,
  left: -Math.PI / 2,
};

export { DIR_YAW };

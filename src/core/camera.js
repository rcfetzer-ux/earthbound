/**
 * Fixed-pitch oblique follow camera — the "2.5D" of the brief.
 *
 * The original renders the world on a ~30° oblique grid with no perspective at
 * all. A narrow-FOV perspective camera at a similar pitch keeps that reading
 * while letting buildings have real volume. Yaw can be nudged left/right so you
 * can peek around corners, and it eases back to a canonical angle.
 */
import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _wanted = new THREE.Vector3();

export class FollowCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(32, aspect, 0.5, 400);
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.yaw = 0;              // radians, 0 = looking north (-Z)
    this.desiredYaw = 0;
    this.pitch = THREE.MathUtils.degToRad(33);
    this.distance = 33;
    this.height = 2.0;         // look-at height above the character's feet
    this.first = true;
    this.shake = 0;
  }

  setMode(mode) {
    if (mode === 'interior') {
      this.pitch = THREE.MathUtils.degToRad(47);
      this.distance = 19;
      this.camera.fov = 30;
      this.height = 1.5;
    } else {
      this.pitch = THREE.MathUtils.degToRad(33);
      this.distance = 33;
      this.camera.fov = 32;
      this.height = 2.0;
    }
    this.camera.updateProjectionMatrix();
  }

  nudgeYaw(delta) {
    this.desiredYaw = THREE.MathUtils.clamp(this.desiredYaw + delta, -Math.PI * 0.75, Math.PI * 0.75);
  }

  resetYaw() { this.desiredYaw = 0; }

  /** Direction the camera considers "screen up", projected onto the ground. */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /**
   * Pull the camera in when something solid sits between it and the player.
   *
   * A fixed-distance camera in a town this dense will sooner or later end up
   * inside the building across the street. The ray is cast every few frames
   * (the merged town meshes have no BVH) and the resulting distance is eased, so
   * the correction reads as the camera leaning in rather than snapping.
   */
  _resolveOcclusion(look, wanted, occluders) {
    if (!occluders?.length) return wanted;
    this._ray = this._ray ?? new THREE.Raycaster();
    this._occFrame = (this._occFrame ?? 0) + 1;
    const dir = _v1.subVectors(wanted, look);
    const want = dir.length();
    dir.divideScalar(want || 1);

    if (this._occFrame % 3 === 0) {
      this._ray.set(look, dir);
      this._ray.near = 0;
      this._ray.far = want;
      const hits = this._ray.intersectObjects(occluders, false);
      this._occTarget = hits.length ? Math.max(9, hits[0].distance - 1.4) : want;
    }
    const target = this._occTarget ?? want;
    // snap in quickly, ease back out slowly
    const k = target < (this._occDist ?? want) ? 0.5 : 0.06;
    this._occDist = (this._occDist ?? want) + (target - (this._occDist ?? want)) * k;
    return _v2.copy(look).addScaledVector(dir, Math.min(want, this._occDist));
  }

  update(dt, focus, occluders = null) {
    this.target.copy(focus);
    if (this.first) {
      this.smoothTarget.copy(this.target);
      this.yaw = this.desiredYaw;
      this.first = false;
    }
    // critically-damped-ish follow
    const k = 1 - Math.exp(-dt * 7.5);
    this.smoothTarget.lerp(this.target, k);
    this.yaw += (this.desiredYaw - this.yaw) * (1 - Math.exp(-dt * 6));

    const look = this.smoothTarget.clone();
    look.y += this.height;

    const d = this.distance;
    const horiz = Math.cos(this.pitch) * d;
    const vert = Math.sin(this.pitch) * d;
    _wanted.set(
      look.x + Math.sin(this.yaw) * horiz,
      look.y + vert,
      look.z + Math.cos(this.yaw) * horiz,
    );
    this.camera.position.copy(this._resolveOcclusion(look, _wanted, occluders));

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(look);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Sprite actor: a pixel character on a Y-axis billboard.
 *
 * The quad yaws to face the camera but never pitches, so characters stay
 * bolt-upright in the world (the Paper Mario / "2.5D" reading) while the town
 * around them is honest geometry.
 */
import * as THREE from 'three';
import { CELL_W, CELL_H, PX, characterSheet, dogSheet } from './sprites.js';
import { T } from '../core/tex.js';

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
/** Walk cycle: neutral, step, neutral, other step. */
const CYCLE = [0, 1, 2, 3];

export class Actor {
  /**
   * @param {string} kind key into CHARS, or 'dog'
   * @param {{x:number,y:number,z:number,dir?:string,speed?:number,scale?:number}} opts
   */
  constructor(kind, opts = {}) {
    const sheet = kind === 'dog' ? dogSheet() : characterSheet(kind);
    this.kind = kind;
    this.sheet = sheet;

    const tex = sheet.texture.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1 / sheet.cols, 1 / sheet.rows);
    this.tex = tex;

    const scale = opts.scale ?? 1;
    this.w = CELL_W * PX * scale;
    this.h = CELL_H * PX * scale;

    this.material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      depthWrite: true,
      fog: true,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.material);
    this.mesh.renderOrder = 2;
    this.mesh.userData.dynamic = true;

    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.mesh.position.y = this.h / 2;

    // fake shadow: a soft blob decal that hugs the ground
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(this.w * 0.78, this.w * 0.5),
      new THREE.MeshBasicMaterial({
        map: T.blob(), transparent: true, depthWrite: false, opacity: 1.0,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.035;
    this.shadow.renderOrder = 1;
    this.shadow.userData.dynamic = true;
    this.group.add(this.shadow);

    this.pos = new THREE.Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    this.dir = opts.dir ?? 'down';
    this.speed = opts.speed ?? 4.6;
    this.radius = opts.radius ?? 0.42;
    this.moved = 0;
    this.frame = 0;
    this.moving = false;
    this.setFrame(0, this.dir);
    this.syncTransform();
  }

  setTint(color) { this.material.color.set(color); }

  setFrame(frame, dir) {
    const row = DIR_ROW[dir] ?? 0;
    this.tex.offset.set(frame / this.sheet.cols, 1 - (row + 1) / this.sheet.rows);
  }

  /** Choose a facing row from a movement vector expressed in camera space. */
  faceFromCamera(vx, vz, camYaw) {
    // rotate world delta into camera space so "left" means screen-left
    const cos = Math.cos(-camYaw);
    const sin = Math.sin(-camYaw);
    const sx = vx * cos - vz * sin;
    const sz = vx * sin + vz * cos;
    if (Math.abs(sx) > Math.abs(sz) * 1.15) this.dir = sx > 0 ? 'right' : 'left';
    else this.dir = sz > 0 ? 'down' : 'up';
  }

  /** Advance the walk cycle by distance travelled (keeps steps tied to speed). */
  animate(distance, dt) {
    if (distance > 1e-4) {
      this.moved += distance;
      const stride = 0.62;
      this.frame = CYCLE[Math.floor(this.moved / stride) % CYCLE.length];
      this.moving = true;
    } else {
      this.moved = 0;
      this.frame = 0;
      this.moving = false;
    }
    void dt;
    this.setFrame(this.frame, this.dir);
  }

  billboard(camYaw) {
    this.mesh.rotation.y = camYaw;
  }

  syncTransform() {
    this.group.position.copy(this.pos);
  }
}

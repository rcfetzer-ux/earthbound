/**
 * Walkable-ground + solid-obstacle model.
 *
 * Onett is terraced: flat shelves of land joined by stairs and ramps, with
 * cliff faces in between. Rather than a heightmap, the ground is described as a
 * set of rectangular platforms (some sloped). A point is walkable only if some
 * platform covers it, which makes cliff edges free — step off the shelf and the
 * move is simply rejected.
 */

export class Ground {
  constructor() {
    this.plats = [];
  }

  /** Flat shelf. Coordinates are min/max on each axis. */
  flat(x0, z0, x1, z1, y, tag = '') {
    this.plats.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0: y, y1: y, axis: 'x', pri: 0, tag });
    return this;
  }

  /**
   * Sloped shelf (stairs / hillside). `axis` is the direction the slope runs
   * along; y goes from y0 at the min edge to y1 at the max edge.
   *
   * Ramps get a higher priority than flats so a stair laid across a shelf wins
   * the height query — step onto it and you start climbing instead of walking
   * through it.
   */
  ramp(x0, z0, x1, z1, y0, y1, axis = 'z', tag = 'ramp') {
    this.plats.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, axis, pri: 1, tag });
    return this;
  }

  /** Height of a specific platform at a point. */
  static heightOf(p, x, z) {
    if (p.y0 === p.y1) return p.y0;
    const t = p.axis === 'x'
      ? (x - p.x0) / Math.max(1e-6, p.x1 - p.x0)
      : (z - p.z0) / Math.max(1e-6, p.z1 - p.z0);
    return p.y0 + (p.y1 - p.y0) * Math.min(1, Math.max(0, t));
  }

  /**
   * Sample walkable height near a reference height.
   * @returns {number|null} null when the point is off the walkable set
   */
  sample(x, z, refY = 0) {
    let best = null;
    let bestScore = Infinity;
    let bestPri = -1;
    for (const p of this.plats) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const y = Ground.heightOf(p, x, z);
      // Highest priority wins (stairs over shelves); within one priority,
      // prefer the surface closest to where the character already is.
      const score = Math.abs(y - refY);
      if (p.pri > bestPri || (p.pri === bestPri && score < bestScore)) {
        bestPri = p.pri;
        bestScore = score;
        best = y;
      }
    }
    return best;
  }

  /** Any platform at all under this point (ignores height preference). */
  covered(x, z) {
    for (const p of this.plats) {
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return true;
    }
    return false;
  }
}

export class Solids {
  constructor() {
    this.rects = [];
    this.circles = [];
  }

  /** Axis-aligned box, given as centre + half extents. */
  box(cx, cz, hw, hd, tag = '') {
    this.rects.push({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, tag });
    return this;
  }

  /** Box given as min/max bounds. */
  bounds(x0, z0, x1, z1, tag = '') {
    this.rects.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), tag });
    return this;
  }

  circle(cx, cz, r, tag = '') {
    this.circles.push({ x: cx, z: cz, r, tag });
    return this;
  }

  /** True when a disc of radius r at (x,z) overlaps anything solid. */
  hit(x, z, r) {
    for (const b of this.rects) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return b;
    }
    for (const c of this.circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = r + c.r;
      if (dx * dx + dz * dz < rr * rr) return c;
    }
    return null;
  }
}

/**
 * Move a disc through the world, sliding along walls and refusing to walk off
 * ledges or up sheer faces.
 *
 * @returns {{x:number,z:number,y:number,blocked:boolean}}
 */
export function moveActor(ground, solids, x, z, y, dx, dz, radius, maxStep = 0.62, blockers = null) {
  const tryMove = (nx, nz) => {
    if (solids.hit(nx, nz, radius)) return null;
    // Other characters are solid too — you shuffle around them, not through
    // them. Only those on roughly the same level count.
    if (blockers) {
      for (const b of blockers) {
        if (Math.abs(b.y - y) > 1.2) continue;
        const bx = nx - b.x;
        const bz = nz - b.z;
        const rr = radius + b.r;
        if (bx * bx + bz * bz < rr * rr) return null;
      }
    }
    const ny = ground.sample(nx, nz, y);
    if (ny === null) return null;
    if (Math.abs(ny - y) > maxStep) return null;
    return ny;
  };

  let blocked = false;
  let cx = x;
  let cz = z;
  let cy = y;

  // full move first, then each axis on its own (gives wall-sliding)
  let ny = tryMove(x + dx, z + dz);
  if (ny !== null) {
    cx = x + dx; cz = z + dz; cy = ny;
  } else {
    blocked = true;
    ny = tryMove(x + dx, z);
    if (ny !== null) { cx = x + dx; cy = ny; }
    const ny2 = tryMove(cx, z + dz);
    if (ny2 !== null) { cz = z + dz; cy = ny2; }
  }
  return { x: cx, z: cz, y: cy, blocked };
}

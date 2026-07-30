/**
 * Low-resolution render pipeline.
 *
 * The scene is drawn into a small offscreen target (≈480×320 — a bit above SNES
 * and a bit under N64), colour-quantized with an ordered dither, then blown up
 * to the window with nearest-neighbour sampling so every texel stays a hard
 * little square.
 */
import * as THREE from 'three';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2  uRes;        // low-res buffer size, in pixels
uniform float uLevels;     // colour steps per channel
uniform float uSat;
uniform float uVignette;
uniform float uFlash;      // white/black flash amount (screen transitions)
uniform vec3  uFlashColor;
varying vec2 vUv;

// 4x4 ordered dither, evaluated in low-res pixel space so the pattern enlarges
// together with the pixels.
//
// Built arithmetically from the 2x2 kernel rather than looked up in an array:
// some mobile GL drivers are fussy about indexing local arrays with a
// non-constant, and this is cheaper anyway.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}

float bayer4(vec2 p) {
  return bayer2(p * 0.5) * 0.25 + bayer2(p);
}

// Linear → display sRGB. The scene is rendered into a linear buffer, so the
// transfer happens here, before dithering, which means the dither pattern lands
// in the space the player actually sees.
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, pow(max(c, vec3(0.0)), vec3(0.41666)) * 1.055 - 0.055,
             step(vec3(0.0031308), c));
}

void main() {
  vec3 c = toSRGB(texture2D(tDiffuse, vUv).rgb);

  // gentle saturation lift — the original art is very chalky-bright
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);

  // dither, then quantize
  float d = bayer4(vUv * uRes) - 0.5;
  c += d / uLevels;
  c = floor(c * uLevels + 0.5) / uLevels;

  // barely-there vignette; keeps the edges of the frame from feeling flat
  vec2 q = vUv - 0.5;
  float vig = 1.0 - uVignette * dot(q, q);
  c *= vig;

  c = mix(c, uFlashColor, uFlash);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class PixelRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{internalHeight?:number, levels?:number}} opts
   */
  constructor(canvas, opts = {}) {
    this.internalHeight = opts.internalHeight ?? 320;
    this.maxInternalWidth = opts.maxInternalWidth ?? 640;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x79c8ee, 1);

    this.target = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      samples: 0,
      type: THREE.UnsignedByteType,
    });
    // Keep the offscreen buffer linear; the post pass does the sRGB transfer so
    // dithering and quantization happen in display space.
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.target.texture.generateMipmaps = false;

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.Camera();
    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uLevels: { value: opts.levels ?? 28 },
        uSat: { value: 1.14 },
        uVignette: { value: 0.14 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    this.size = new THREE.Vector2(1, 1);
    this.resize();
  }

  get aspect() {
    return this.lowW / this.lowH;
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);

    // Pick a low-res buffer that matches the window's aspect ratio.
    const lowH = this.internalHeight;
    const lowW = Math.min(this.maxInternalWidth, Math.round(lowH * (w / h)));
    this.lowW = lowW;
    this.lowH = lowH;
    this.target.setSize(lowW, lowH);
    this.postMaterial.uniforms.uRes.value.set(lowW, lowH);
    this.size.set(w, h);
    return { w, h, lowW, lowH };
  }

  /**
   * Adaptive quality.
   *
   * The look depends on a small render target, so when a machine can't keep up
   * the honest lever is to make that target smaller still — it stays in style,
   * unlike dropping shadows or fog. Steps down at most twice, and never back up
   * (no oscillating).
   */
  adapt(dtSeconds) {
    if (this._qStep === undefined) { this._qStep = 0; this._acc = 0; this._frames = 0; }
    if (this._qStep >= 2) return;
    this._acc += dtSeconds;
    this._frames++;
    if (this._acc < 2.5) return;
    const avg = this._acc / this._frames;
    this._acc = 0;
    this._frames = 0;
    if (avg > 1 / 30) {
      this._qStep++;
      this.internalHeight = Math.max(200, Math.round(this.internalHeight * 0.78));
      this.resize();
    }
  }

  /** Screen flash used for door transitions / hits. */
  setFlash(amount, color = 0xffffff) {
    this.postMaterial.uniforms.uFlash.value = amount;
    this.postMaterial.uniforms.uFlashColor.value.set(color);
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }
}

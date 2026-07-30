/**
 * Procedural audio: a tiny WebAudio tracker plus a sound-effect bank.
 *
 * Both the music and the effects are synthesised from scratch — pulse waves,
 * triangles, filtered noise — in the spirit of the original's soundtrack
 * (bouncy, jazzy, slightly off-kilter chord changes) without reproducing any of
 * its actual melodies. Every tune below is an original composition.
 *
 * Pattern format: one token per 16th note.
 *   "C4"  start a note
 *   "-"   hold the previous note
 *   "."   rest
 */

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function freq(note) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return 0;
  const semi = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const octave = parseInt(m[3], 10);
  const midi = semi + (octave + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const p = (s) => s.trim().split(/\s+/);

// --- instrument voices -----------------------------------------------------

const VOICES = {
  lead:   { wave: 'pulse25', gain: 0.16, attack: 0.008, decay: 0.09, release: 0.08, vibrato: 5.2, vibratoDepth: 3.5, glide: 0 },
  lead2:  { wave: 'pulse50', gain: 0.10, attack: 0.01, decay: 0.12, release: 0.1, vibrato: 4.0, vibratoDepth: 2.0 },
  bass:   { wave: 'triangle', gain: 0.30, attack: 0.006, decay: 0.06, release: 0.05, sub: true },
  chord:  { wave: 'pulse12', gain: 0.052, attack: 0.012, decay: 0.14, release: 0.12 },
  bell:   { wave: 'sine', gain: 0.11, attack: 0.004, decay: 0.5, release: 0.4, fm: 3.0, fmDepth: 2.4 },
  organ:  { wave: 'pulse50', gain: 0.07, attack: 0.03, decay: 0.2, release: 0.18 },
  pluck:  { wave: 'sawtooth', gain: 0.09, attack: 0.004, decay: 0.16, release: 0.1, filter: 2400 },
};

// --- songs -----------------------------------------------------------------
// Chord movement is deliberately jazzy: major 7ths, a flat-VI, a walking bass.

const SONGS = {
  /** Onett by night: bouncy, syncopated, a little too cheerful for the hour. */
  town: {
    bpm: 138,
    swing: 0.16,
    tracks: [
      { voice: 'lead', pattern: p(`
        . . F5 - A5 - . C6 - . A5 - G5 - . .
        . . D5 - F5 - . A5 - . G5 - F5 - . .
        . . G5 - Bb5 - . D6 - . C6 - Bb5 - . .
        . . E5 - G5 - . C6 - - - . . . . .
      `) },
      { voice: 'lead2', pattern: p(`
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . Bb5 - A5 - G5 - . .
      `) },
      { voice: 'bass', pattern: p(`
        F2 - A2 - C3 - A2 - F2 - G2 - A2 - C3 -
        Bb2 - D3 - F3 - D3 - Bb2 - C3 - D3 - F3 -
        G2 - Bb2 - D3 - Bb2 - G2 - A2 - Bb2 - D3 -
        C3 - E3 - G3 - E3 - C3 - Bb2 - A2 - G2 -
      `) },
      { voice: 'chord', pattern: p(`
        . . A4 . . . C5 . . . A4 . . . E5 .
        . . D5 . . . F5 . . . D5 . . . A4 .
        . . Bb4 . . . D5 . . . Bb4 . . . F5 .
        . . E5 . . . G5 . . . E5 . . . Bb4 .
      `) },
      { voice: 'chord', pattern: p(`
        . . C5 . . . E5 . . . C5 . . . G5 .
        . . F5 . . . A5 . . . F5 . . . C5 .
        . . D5 . . . F5 . . . D5 . . . A5 .
        . . G5 . . . Bb5 . . . G5 . . . D5 .
      `) },
    ],
    drums: p(`
      K . h s . h K . K . h s . h s h
      K . h s . h K . K . h s . h s h
      K . h s . h K . K . h s . h s h
      K . h s . h K . K . h K s h s h
    `),
  },

  /** Home: warm, slow, unhurried. */
  home: {
    bpm: 92,
    swing: 0.08,
    tracks: [
      { voice: 'bell', pattern: p(`
        C5 - - - E5 - - - G5 - - - . . . .
        B4 - - - D5 - - - F5 - - - . . . .
        A4 - - - C5 - - - E5 - - - . . . .
        F4 - - - A4 - - - G4 - - - . . . .
      `) },
      { voice: 'bass', pattern: p(`
        C3 - - - - - - - G2 - - - - - - -
        G2 - - - - - - - D3 - - - - - - -
        A2 - - - - - - - E3 - - - - - - -
        F2 - - - - - - - G2 - - - - - - -
      `) },
      { voice: 'organ', pattern: p(`
        E4 - - - - - - - D4 - - - - - - -
        D4 - - - - - - - F4 - - - - - - -
        C4 - - - - - - - E4 - - - - - - -
        A3 - - - - - - - B3 - - - - - - -
      `) },
    ],
    drums: p(`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `),
  },

  /** Shops: brisk, fussy, and slightly too pleased with itself. */
  shop: {
    bpm: 146,
    swing: 0.2,
    tracks: [
      { voice: 'pluck', pattern: p(`
        G4 . B4 . D5 . B4 . G4 . B4 . D5 . E5 .
        F4 . A4 . C5 . A4 . F4 . A4 . C5 . D5 .
        E4 . G4 . B4 . G4 . E4 . G4 . B4 . C5 .
        D4 . F4 . A4 . C5 . B4 . A4 . G4 . . .
      `) },
      { voice: 'lead', pattern: p(`
        . . D5 - . . G5 - . . F5 - D5 - . .
        . . C5 - . . F5 - . . E5 - C5 - . .
        . . B4 - . . E5 - . . D5 - B4 - . .
        . . A4 - . . D5 - - - . . . . .
      `) },
      { voice: 'bass', pattern: p(`
        G2 - - - D3 - - - G2 - - - B2 - D3 -
        F2 - - - C3 - - - F2 - - - A2 - C3 -
        E2 - - - B2 - - - E2 - - - G2 - B2 -
        D2 - - - A2 - - - G2 - - - D3 - - -
      `) },
    ],
    drums: p(`
      K . h . s . h . K . h . s . h h
      K . h . s . h . K . h . s . h h
      K . h . s . h . K . h . s . h h
      K . h . s . h . K . h . s h s h
    `),
  },

  /** Arcade: minor, insistent, all bleeps. */
  arcade: {
    bpm: 158,
    swing: 0,
    tracks: [
      { voice: 'lead', pattern: p(`
        A4 . A4 . C5 . A4 . E5 . . . D5 . C5 .
        A4 . A4 . C5 . A4 . G5 . . . E5 . D5 .
        F4 . F4 . A4 . F4 . C5 . . . Bb4 . A4 .
        G4 . G4 . B4 . D5 . E5 . D5 . C5 . B4 .
      `) },
      { voice: 'bass', pattern: p(`
        A1 - A1 - A1 - A1 - A1 - A1 - E2 - G2 -
        A1 - A1 - A1 - A1 - A1 - A1 - C2 - E2 -
        F1 - F1 - F1 - F1 - F1 - F1 - C2 - E2 -
        G1 - G1 - G1 - G1 - D2 - D2 - G1 - B1 -
      `) },
      { voice: 'chord', pattern: p(`
        . . E5 . . . E5 . . . A5 . . . E5 .
        . . E5 . . . E5 . . . A5 . . . G5 .
        . . C5 . . . C5 . . . F5 . . . C5 .
        . . D5 . . . D5 . . . G5 . . . B5 .
      `) },
    ],
    drums: p(`
      K . h K s . h . K . h K s . h h
      K . h K s . h . K . h K s . h h
      K . h K s . h . K . h K s . h h
      K . h K s . h . K K . h s h s h
    `),
  },

  /** Hotel lobby: lounge chords, brushed and lazy. */
  hotel: {
    bpm: 104,
    swing: 0.24,
    tracks: [
      { voice: 'bell', pattern: p(`
        E5 - - - . . D5 - - - . . C5 - - -
        D5 - - - . . C5 - - - . . B4 - - -
        C5 - - - . . B4 - - - . . A4 - - -
        B4 - - - . . A4 - - - . . G4 - - -
      `) },
      { voice: 'bass', pattern: p(`
        A2 - - - E3 - - - A2 - - - G2 - - -
        F2 - - - C3 - - - F2 - - - E2 - - -
        D2 - - - A2 - - - D2 - - - C2 - - -
        G2 - - - D3 - - - G2 - - - E2 - - -
      `) },
      { voice: 'chord', pattern: p(`
        . . C5 . . . E5 . . . C5 . . . G4 .
        . . A4 . . . C5 . . . A4 . . . E4 .
        . . F4 . . . A4 . . . F4 . . . C5 .
        . . B4 . . . D5 . . . B4 . . . F5 .
      `) },
    ],
    drums: p(`
      . . h . s . h . . . h . s . h .
      . . h . s . h . . . h . s . h .
      . . h . s . h . . . h . s . h .
      . . h . s . h . . . h . s h s h
    `),
  },

  /** Hospital: sparse, clean, a little uneasy. */
  hospital: {
    bpm: 84,
    swing: 0,
    tracks: [
      { voice: 'bell', pattern: p(`
        G5 - - - - - - - E5 - - - - - - -
        F5 - - - - - - - D5 - - - - - - -
        E5 - - - - - - - C5 - - - - - - -
        D5 - - - - - - - . . . . . . . .
      `) },
      { voice: 'organ', pattern: p(`
        C4 - - - - - - - - - - - - - - -
        Bb3 - - - - - - - - - - - - - - -
        A3 - - - - - - - - - - - - - - -
        G3 - - - - - - - - - - - - - - -
      `) },
      { voice: 'bass', pattern: p(`
        C2 - - - - - - - - - - - - - - -
        Bb1 - - - - - - - - - - - - - - -
        A1 - - - - - - - - - - - - - - -
        G1 - - - - - - - - - - - - - - -
      `) },
    ],
    drums: p(`
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
      . . . . . . . . . . . . . . . .
    `),
  },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.songId = null;
    this.waves = {};
    this._timer = null;
    this.musicVolume = 0.5;
    this.sfxVolume = 0.65;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    // A gentle master shelf keeps the square waves from getting shrill.
    const shelf = this.ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 5200;
    shelf.gain.value = -7;
    this.master.connect(shelf);

    // A short reverb-ish delay glues the chiptune together.
    const delay = this.ctx.createDelay(0.4);
    delay.delayTime.value = 0.17;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.22;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.2;
    shelf.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.ctx.destination);
    shelf.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.noiseBuffer = this._makeNoise();
    this.ready = true;
  }

  _makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Pulse waves of a given duty cycle, built as PeriodicWaves. */
  _wave(kind) {
    if (this.waves[kind]) return this.waves[kind];
    const duty = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 }[kind];
    if (duty === undefined) return null;
    const n = 28;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let h = 1; h < n; h++) {
      // Fourier series of a pulse train of the given duty cycle.
      imag[h] = (2 / (h * Math.PI)) * Math.sin(Math.PI * h * duty);
    }
    const w = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this.waves[kind] = w;
    return w;
  }

  _osc(voiceName, f, time, dur, velocity = 1) {
    const v = VOICES[voiceName];
    const ctx = this.ctx;
    const g = ctx.createGain();
    let dest = this.musicGain;

    if (v.filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = v.filter;
      lp.Q.value = 1.2;
      lp.connect(dest);
      dest = lp;
    }
    g.connect(dest);

    const osc = ctx.createOscillator();
    const wave = this._wave(v.wave);
    if (wave) osc.setPeriodicWave(wave);
    else osc.type = v.wave;
    osc.frequency.value = f;
    osc.connect(g);

    if (v.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = v.vibrato;
      const lg = ctx.createGain();
      lg.gain.value = v.vibratoDepth ?? 3;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(time);
      lfo.stop(time + dur + 0.2);
    }
    if (v.fm) {
      const mod = ctx.createOscillator();
      mod.frequency.value = f * v.fm;
      const mg = ctx.createGain();
      mg.gain.value = f * v.fmDepth * 0.25;
      mod.connect(mg);
      mg.connect(osc.frequency);
      mod.start(time);
      mod.stop(time + dur + 0.2);
    }
    if (v.sub) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = f / 2;
      const sg = ctx.createGain();
      sg.gain.value = 0.5;
      sub.connect(sg);
      sg.connect(g);
      sub.start(time);
      sub.stop(time + dur + 0.1);
    }

    const peak = v.gain * velocity;
    const a = v.attack ?? 0.01;
    const d = v.decay ?? 0.1;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + a);
    g.gain.linearRampToValueAtTime(peak * 0.72, time + a + d);
    g.gain.setTargetAtTime(0.0001, time + Math.max(dur - 0.02, a + 0.01), (v.release ?? 0.08) * 0.5);
    osc.start(time);
    osc.stop(time + dur + 0.3);
  }

  _drum(kind, time) {
    const ctx = this.ctx;
    if (kind === 'K') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(148, time);
      o.frequency.exponentialRampToValueAtTime(48, time + 0.11);
      g.gain.setValueAtTime(0.42, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(time);
      o.stop(time + 0.2);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (kind === 's') {
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 0.9;
      g.gain.setValueAtTime(0.19, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    } else {
      bp.type = 'highpass';
      bp.frequency.value = 7200;
      g.gain.setValueAtTime(0.075, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
    }
    src.connect(bp);
    bp.connect(g);
    g.connect(this.musicGain);
    src.start(time);
    src.stop(time + 0.2);
  }

  playMusic(id) {
    if (!this.ready || this.songId === id) return;
    const song = SONGS[id];
    if (!song) return;
    this.songId = id;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.song = song;
    this._held = song.tracks.map(() => null);
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._schedule(), 25);
  }

  stopMusic() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.songId = null;
  }

  /** Look-ahead scheduler: keeps ~150ms of notes queued at all times. */
  _schedule() {
    if (!this.ready || !this.song || this.muted) return;
    const song = this.song;
    const stepDur = 60 / song.bpm / 4;
    const horizon = this.ctx.currentTime + 0.18;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      const swing = (this.step % 2 === 1) ? stepDur * (song.swing ?? 0) : 0;
      const t = this.nextTime + swing;

      song.tracks.forEach((track, ti) => {
        const len = track.pattern.length;
        const tok = track.pattern[this.step % len];
        if (tok === '.' || tok === '-') return;
        // hold: count following '-' tokens to get the note length
        let dur = stepDur;
        for (let k = 1; k < 16; k++) {
          if (track.pattern[(this.step + k) % len] === '-') dur += stepDur;
          else break;
        }
        const f = freq(tok);
        if (f) this._osc(track.voice, f, t, dur * 0.92, 1);
        void ti;
      });

      if (song.drums) {
        const dtok = song.drums[this.step % song.drums.length];
        if (dtok && dtok !== '.') this._drum(dtok, t);
      }

      this.step++;
      this.nextTime += stepDur;
    }
  }

  // --- sound effects ------------------------------------------------------

  sfx(name) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.005;
    const beep = (f0, f1, dur, type = 'square', vol = 0.2) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, now);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g);
      g.connect(this.sfxGain);
      o.start(now);
      o.stop(now + dur + 0.02);
    };
    const noise = (dur, f, q, vol, sweepTo = null) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, now);
      if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, now + dur);
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxGain);
      src.start(now);
      src.stop(now + dur + 0.02);
    };

    switch (name) {
      case 'step':      noise(0.075, 480 + Math.random() * 260, 1.4, 0.075); break;
      case 'stepGrass': noise(0.09, 1500 + Math.random() * 700, 0.7, 0.055); break;
      case 'stepWood':  noise(0.07, 320 + Math.random() * 140, 2.2, 0.085); break;
      case 'bump':      beep(150, 70, 0.1, 'square', 0.16); noise(0.08, 240, 1.0, 0.09); break;
      case 'door':      noise(0.2, 900, 0.8, 0.11, 260); beep(320, 200, 0.12, 'triangle', 0.1); break;
      case 'doorGlass': beep(1180, 1180, 0.07, 'sine', 0.14); beep(1560, 1560, 0.16, 'sine', 0.1); noise(0.16, 2400, 1.2, 0.05, 900); break;
      case 'stairs':    beep(520, 520, 0.05, 'square', 0.1); setTimeout(() => this.sfx('_stairs2'), 70); break;
      case '_stairs2':  beep(700, 700, 0.06, 'square', 0.1); break;
      case 'text':      beep(1720, 1720, 0.028, 'square', 0.05); break;
      case 'select':    beep(880, 1320, 0.09, 'square', 0.14); break;
      case 'cancel':    beep(560, 320, 0.1, 'square', 0.12); break;
      case 'enter': {
        // little arpeggio when a new place is entered
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          const t = now + i * 0.065;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.15, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          o.connect(g);
          g.connect(this.sfxGain);
          o.start(t);
          o.stop(t + 0.32);
        });
        break;
      }
      default: break;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.85;
  }
}

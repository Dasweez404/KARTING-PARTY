// Sons synthétisés avec la Web Audio API (aucun fichier audio nécessaire).

const SCALES = {
  prairie: [0, 4, 7, 9], plage: [0, 2, 4, 7], desert: [0, 3, 5, 7], neige: [0, 4, 7, 11],
  automne: [0, 3, 7, 10], volcan: [0, 1, 5, 7], ville: [0, 3, 7, 10], espace: [0, 4, 7, 11],
};
const ROOTS = { prairie: 60, plage: 62, desert: 57, neige: 64, automne: 59, volcan: 55, ville: 58, espace: 63 };

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('kp-muted') === '1';
    this.musicTimer = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.18; this.musicBus.connect(this.master);
    // bruit blanc réutilisable
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('kp-muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur, { type = 'square', vol = 0.3, slide = null, delay = 0, bus = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, { vol = 0.4, freq = 1200, q = 0.8 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t); s.stop(t + dur);
  }

  play(name, vol = 1) {
    if (!this.ctx || vol <= 0.02) return;
    switch (name) {
      case 'count': this.tone(440, 0.25, { vol: 0.3 * vol }); break;
      case 'go': this.tone(880, 0.6, { vol: 0.35 * vol }); break;
      case 'itemBox': for (let i = 0; i < 6; i++) this.tone(600 + i * 120, 0.06, { vol: 0.12 * vol, delay: i * 0.12 }); break;
      case 'itemReady': this.tone(1200, 0.15, { type: 'triangle', vol: 0.25 * vol }); break;
      case 'boost': this.tone(220, 0.5, { type: 'sawtooth', vol: 0.18 * vol, slide: 880 }); break;
      case 'drift': this.tone(150, 0.08, { type: 'triangle', vol: 0.15 * vol }); break;
      case 'hit': this.tone(500, 0.5, { type: 'square', vol: 0.2 * vol, slide: 80 }); break;
      case 'shieldBreak': this.tone(1500, 0.3, { type: 'triangle', vol: 0.2 * vol, slide: 300 }); break;
      case 'wall': this.noiseBurst(0.12, { vol: 0.25 * vol, freq: 600 }); break;
      case 'explosion': this.noiseBurst(0.7, { vol: 0.6 * vol, freq: 900 }); this.tone(90, 0.5, { type: 'sine', vol: 0.4 * vol, slide: 30 }); break;
      case 'drop': this.tone(300, 0.12, { type: 'triangle', vol: 0.2 * vol, slide: 150 }); break;
      case 'missile': this.noiseBurst(0.4, { vol: 0.3 * vol, freq: 3000 }); break;
      case 'shield': this.tone(400, 0.4, { type: 'sine', vol: 0.25 * vol, slide: 1200 }); break;
      case 'lightning': this.noiseBurst(0.9, { vol: 0.6 * vol, freq: 5000 }); this.tone(1800, 0.6, { type: 'sawtooth', vol: 0.15 * vol, slide: 100 }); break;
      case 'lap': [660, 880].forEach((f, i) => this.tone(f, 0.18, { vol: 0.25 * vol, delay: i * 0.14 })); break;
      case 'finalLap': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, { vol: 0.25 * vol, delay: i * 0.12 })); break;
      case 'finish': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.28, { vol: 0.25 * vol, delay: i * 0.15 })); break;
      case 'click': this.tone(900, 0.05, { type: 'triangle', vol: 0.15 }); break;
    }
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    f.type = 'lowpass'; f.frequency.value = 600;
    g.gain.value = 0.07;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(); o2.start();
    this.engine = { o, o2, f, g };
  }

  setEngine(ratio, boosting) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const base = 55 + ratio * 120 + (boosting ? 40 : 0);
    this.engine.o.frequency.setTargetAtTime(base, t, 0.05);
    this.engine.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    this.engine.f.frequency.setTargetAtTime(400 + ratio * 900, t, 0.1);
  }

  stopEngine() {
    if (!this.engine) return;
    this.engine.o.stop(); this.engine.o2.stop();
    this.engine.g.disconnect();
    this.engine = null;
  }

  // Petite boucle musicale procédurale, différente selon le décor
  startMusic(theme) {
    this.stopMusic();
    if (!this.ctx) return;
    const scale = SCALES[theme] || SCALES.prairie, root = ROOTS[theme] || 60;
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const prog = [0, 5, 3, 4];
    let step = 0;
    const bpm = 132, stepDur = 60 / bpm / 2;
    let next = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => {
      while (next < this.ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 16) % prog.length;
        const chordRoot = root + [0, 5, 3, 7][prog[bar] % 4] - 12;
        const delay = next - this.ctx.currentTime;
        if (step % 4 === 0) this.tone(midi(chordRoot - 12), stepDur * 1.8, { type: 'triangle', vol: 0.5, delay, bus: this.musicBus });
        if (step % 2 === 1 || step % 16 === 0) {
          const n = scale[(step * 3 + bar) % scale.length] + (step % 8 < 4 ? 12 : 24);
          this.tone(midi(chordRoot + n - 12), stepDur * 0.9, { type: 'square', vol: 0.18, delay, bus: this.musicBus });
        }
        step++;
        next += stepDur;
      }
    }, 60);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}

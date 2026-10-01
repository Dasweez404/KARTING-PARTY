import * as THREE from 'three';
import { KARTS, ITEMS, LAPS, TRACKS } from './data.js';
import { Track } from './track.js';
import { Kart } from './kart.js';
import { BotDriver } from './ai.js';
import { ItemSystem } from './items.js';

const $ = (id) => document.getElementById(id);

export function formatTime(t) {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export function ordinal(n) { return n === 1 ? '1er' : `${n}e`; }

export class Race {
  constructor({ renderer, trackId, player, opponents, difficulty, audio, input, onFinish }) {
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;
    this.onFinish = onFinish;
    this.difficulty = difficulty;
    this.def = TRACKS[trackId];
    this.trackId = trackId;

    const scene = (this.scene = new THREE.Scene());
    this.track = new Track(trackId, this.def);
    const th = this.track.theme;
    scene.background = new THREE.Color(th.sky);
    scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    scene.add(this.track.group);

    // Lumières
    scene.add(new THREE.HemisphereLight(th.night ? '#8899ff' : '#ffffff', th.ground, th.ambient));
    const sun = (this.sun = new THREE.DirectionalLight(th.night ? '#ffd0a0' : '#ffffff', th.light * 1.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);

    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 3000);

    // Karts : le joueur part en dernière position
    this.karts = [];
    const all = [...opponents.map((o) => ({ ...o, isPlayer: false })), { ...player, isPlayer: true }];
    all.forEach((cfg, i) => {
      const kartDef = KARTS.find((k) => k.id === cfg.kartId) || KARTS[0];
      const kart = new Kart({ name: cfg.name, color: cfg.color, kartDef, isPlayer: cfg.isPlayer, speedMult: difficulty.speedMult });
      const row = Math.floor(i / 2);
      const idx = this.track.n - 5 - row * Math.round(7 / this.track.spacing);
      const lat = (i % 2 ? 1 : -1) * this.track.half * 0.45;
      const p = this.track.pointAt(idx, lat);
      kart.place(p.x, p.z, this.track.headingAt(idx));
      kart.idx = idx; kart.lap = 0; kart.progress = idx / this.track.n;
      kart.lateral = lat;
      scene.add(kart.mesh);
      this.karts.push(kart);
      if (cfg.isPlayer) this.player = kart;
      else kart.bot = new BotDriver(kart, difficulty.botSkill);
      kart.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    });
    this.items = new ItemSystem(this);
    this.ranking = [...this.karts];
    this.updateRanking();

    this.time = 0;          // temps total depuis le début (compte à rebours inclus)
    this.raceTime = 0;      // chrono de course
    this.state = 'countdown';
    this.countdown = 4.0;
    this.started = false;
    this.lastCount = null;
    this.finishTimer = 0;
    this.paused = false;
    this.lapTimes = [];
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.shake = 0;

    this.setupHud();
    this.audio.startEngine();
    this.audio.startMusic(this.def.theme);
  }

  // ---------- HUD ----------
  setupHud() {
    $('hud').classList.remove('hidden');
    $('hud-track').textContent = this.def.name;
    $('countdown').textContent = '';
    $('message').textContent = '';
    $('flash').style.opacity = 0;
    // Mini-carte
    const mc = $('minimap'), size = mc.width;
    const ext = this.track.extent + 10;
    this.mapScale = (size / 2 - 8) / ext;
    const bg = document.createElement('canvas');
    bg.width = bg.height = size;
    const g = bg.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = () => {
      g.beginPath();
      this.track.pts.forEach((p, i) => {
        const x = size / 2 + p.x * this.mapScale, y = size / 2 + p.z * this.mapScale;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.closePath();
    };
    path(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 10; g.stroke();
    path(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.stroke();
    const s = this.track.pts[0];
    g.fillStyle = '#ffeb3b';
    g.fillRect(size / 2 + s.x * this.mapScale - 3, size / 2 + s.z * this.mapScale - 3, 6, 6);
    this.mapBg = bg;
  }

  drawMinimap() {
    const mc = $('minimap'), g = mc.getContext('2d'), size = mc.width;
    g.clearRect(0, 0, size, size);
    g.drawImage(this.mapBg, 0, 0);
    const pt = (x, z) => [size / 2 + x * this.mapScale, size / 2 + z * this.mapScale];
    for (const t of this.items.traps) {
      const [x, y] = pt(t.x, t.z);
      g.fillStyle = t.type === 'mine' ? '#212121' : '#ffd600';
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const k of [...this.karts].sort((a) => (a.isPlayer ? 1 : -1))) {
      const [x, y] = pt(k.x, k.z);
      g.beginPath();
      g.arc(x, y, k.isPlayer ? 6 : 4.5, 0, Math.PI * 2);
      g.fillStyle = k.color; g.fill();
      g.lineWidth = k.isPlayer ? 2.5 : 1.5; g.strokeStyle = k.isPlayer ? '#fff' : '#000'; g.stroke();
    }
  }

  updateHud() {
    const p = this.player;
    $('hud-pos').innerHTML = `${p.rank}<sup>${p.rank === 1 ? 'er' : 'e'}</sup><small>/${this.karts.length}</small>`;
    $('hud-pos').className = 'pos-' + Math.min(p.rank, 4);
    $('hud-lap').textContent = `Tour ${Math.min(LAPS, Math.max(1, p.lap))}/${LAPS}`;
    $('hud-time').textContent = formatTime(this.raceTime);
    $('hud-speed').textContent = Math.round(Math.abs(p.speed) * 3.6);
    const slot = $('item-slot');
    if (p.roulette > 0) {
      const keys = Object.keys(ITEMS);
      slot.textContent = ITEMS[keys[Math.floor(this.time * 14) % keys.length]].icon;
      slot.className = 'rolling';
      $('item-count').textContent = '';
    } else if (p.item) {
      slot.textContent = ITEMS[p.item].icon;
      slot.className = 'ready';
      $('item-count').textContent = p.itemCount > 1 ? `×${p.itemCount}` : '';
    } else {
      slot.textContent = '';
      slot.className = '';
      $('item-count').textContent = '';
    }
    const dc = p.driftCharge;
    $('drift-meter').style.width = `${Math.min(100, (dc / 2.3) * 100)}%`;
    $('drift-meter').className = dc >= 2.3 ? 'lvl2' : dc >= 1.0 ? 'lvl1' : '';
    $('drift-bar').style.opacity = p.drifting ? 1 : 0;
    this.drawMinimap();
  }

  message(text, dur = 1.6, cls = '') {
    const m = $('message');
    m.textContent = text;
    m.className = cls;
    m.style.opacity = 1;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { m.style.opacity = 0; }, dur * 1000);
  }

  // ---------- logique ----------
  updateRanking() {
    this.ranking = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    this.ranking.forEach((k, i) => { k.rank = i + 1; });
  }

  kartAhead(k) {
    return k.rank > 1 ? this.ranking[k.rank - 2] : null;
  }

  kartBehindWithin(k, dist) {
    return this.karts.some((o) => o !== k && o.progress < k.progress && (o.x - k.x) ** 2 + (o.z - k.z) ** 2 < dist * dist);
  }

  lightning(user) {
    for (const k of this.karts) if (k !== user && !k.finished) k.hit('shrink');
    this.sound('lightning', this.player.x, this.player.z, true);
    const f = $('flash');
    f.style.transition = 'none'; f.style.opacity = 0.85;
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.8s'; f.style.opacity = 0; });
    if (user === this.player) this.message('⚡ Éclair ! Tout le monde rapetisse !');
    else this.message(`⚡ Éclair de ${user.name} !`);
  }

  onHit(victim, attacker, type) {
    if (victim === this.player) {
      this.shake = 0.5;
      if (attacker && attacker !== victim) this.message(`Touché par ${attacker.name} !`, 1.4, 'bad');
    } else if (attacker === this.player) {
      this.message(`Bien joué ! ${victim.name} est touché`, 1.4, 'good');
    }
  }

  sound(name, x, z, global = false) {
    const d = Math.hypot(x - this.player.x, z - this.player.z);
    this.audio.play(name, global ? 1 : Math.max(0, 1 - d / 90));
  }

  collide() {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      const ra = a.shrinkTime > 0 ? 0.6 : 1.1, rb = b.shrinkTime > 0 ? 0.6 : 1.1;
      const R = ra + rb;
      if (d2 > 0.0001 && d2 < R * R) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, over = R - d;
        const wa = a.weight * (a.shrinkTime > 0 ? 0.3 : 1), wb = b.weight * (b.shrinkTime > 0 ? 0.3 : 1);
        const fa = wb / (wa + wb), fb = wa / (wa + wb);
        a.x -= nx * over * fa; a.z -= nz * over * fa;
        b.x += nx * over * fb; b.z += nz * over * fb;
        // un kart rétréci se fait écraser
        if (a.shrinkTime > 0 && b.shrinkTime <= 0 && a.spinTime <= 0) a.spinTime = 0.8;
        if (b.shrinkTime > 0 && a.shrinkTime <= 0 && b.spinTime <= 0) b.spinTime = 0.8;
        if ((a.isPlayer || b.isPlayer) && over > 0.3) this.audio.play('wall', 0.5);
      }
    }
  }

  update(dt) {
    if (this.paused) return;
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const track = this.track;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const c = Math.ceil(this.countdown - 1);
      if (c !== this.lastCount) {
        this.lastCount = c;
        if (c >= 1 && c <= 3) { $('countdown').textContent = c; this.audio.play('count'); $('countdown').className = 'pop'; }
        else if (c === 0) {
          $('countdown').textContent = 'GO !'; this.audio.play('go');
          this.state = 'racing'; this.started = true;
          // Départ canon : accélérer pile au bon moment
          for (const k of this.karts) {
            if (k.isPlayer ? this.startCharge > 0.15 && this.startCharge < 1.3 : Math.random() < 0.4) k.boost(1.0);
          }
        }
        void $('countdown').offsetWidth;
      }
      const inp = this.input.read();
      this.startCharge = inp.up ? (this.startCharge || 0) + dt : 0;
      this.input.consumeItem();
      for (const k of this.karts) k.syncMesh(dt, 0, this.time);
    } else {
      this.raceTime += dt;
      if (this.raceTime > 1 && this.raceTime - dt <= 1 && $('countdown').textContent === 'GO !') $('countdown').textContent = '';
      // Joueur
      const p = this.player;
      if (!p.finished) {
        const inp = this.input.read();
        if (this.input.consumeItem() && p.item) this.items.use(p);
        p.update(dt, inp, track, this.time);
      } else {
        this.input.consumeItem();
        p.update(dt, p.bot.think(dt, track, this, this.time), track, this.time);
      }
      // Bots
      for (const k of this.karts) {
        if (k.isPlayer) continue;
        k.update(dt, k.bot.think(dt, track, this, this.time), track, this.time);
      }
      this.collide();
      this.items.update(dt, this.time);
      track.update(dt, this.time);
      this.updateRanking();

      // Évènements des karts
      for (const k of this.karts) {
        for (const e of k.events) {
          if (e === 'lap') this.onLap(k);
          else if (k.isPlayer) this.audio.play(e);
          else if (e === 'hit') this.sound('hit', k.x, k.z);
        }
        k.events.length = 0;
      }

      if (this.state === 'finished') {
        this.finishTimer += dt;
        const allDone = this.karts.every((k) => k.finished);
        if (allDone || this.finishTimer > 9) this.end();
      }
    }

    this.audio.setEngine(Math.abs(this.player.speed) / this.player.maxSpeed, this.player.boostTime > 0);
    this.updateCamera(dt);
    this.updateHud();
  }

  onLap(k) {
    if (k.lap > LAPS && !k.finished) {
      k.finished = true;
      k.finishTime = this.raceTime;
      if (k.isPlayer) {
        this.lapTimes.push(this.raceTime - this.lapStart);
        this.state = 'finished';
        k.bot = new BotDriver(k, 0.85);
        this.updateRanking();
        const r = k.rank;
        this.audio.play('finish');
        this.message(r === 1 ? '🏆 VICTOIRE ! 🏆' : `Arrivée : ${ordinal(r)} !`, 4, r <= 3 ? 'good' : '');
        $('countdown').textContent = 'ARRIVÉE';
        $('countdown').className = 'pop finish';
      }
      return;
    }
    if (k.isPlayer && k.lap === 1) this.lapStart = this.raceTime;
    if (k.isPlayer && k.lap >= 2) {
      const lt = this.raceTime - this.lapStart;
      this.lapTimes.push(lt);
      this.lapStart = this.raceTime;
      if (k.lap === LAPS) { this.audio.play('finalLap'); this.message('🏁 Dernier tour !', 2, 'good'); }
      else { this.audio.play('lap'); this.message(`Tour ${k.lap}/${LAPS} — ${formatTime(lt)}`, 1.6); }
    }
  }

  end() {
    if (this.state === 'done') return;
    this.state = 'done';
    // Estimation du temps des retardataires
    const L = this.track.length;
    for (const k of this.karts) {
      if (!k.finished) {
        const remaining = (LAPS + 1 - k.progress) * L;
        const avg = Math.max(12, (k.progress * L) / Math.max(1, this.raceTime));
        k.finishTime = this.raceTime + remaining / avg;
        k.finished = true;
      }
    }
    this.updateRanking();
    const results = this.ranking.map((k) => ({ name: k.name, color: k.color, kart: k.def.name, isPlayer: k.isPlayer, time: k.finishTime, rank: k.rank }));
    this.onFinish(results, { bestLap: Math.min(...this.lapTimes), total: this.player.finishTime });
  }

  updateCamera(dt) {
    const p = this.player;
    const fwdX = Math.sin(p.heading), fwdZ = Math.cos(p.heading);
    let desired, look;
    if (this.state === 'countdown' && this.countdown > 1.2) {
      // travelling d'introduction
      const u = Math.max(0, (this.countdown - 1.2) / 2.8);
      const ang = p.heading + Math.PI * u * 1.2;
      const dist = 7.5 + u * 10;
      desired = new THREE.Vector3(p.x - Math.sin(ang) * dist, 3.2 + u * 6, p.z - Math.cos(ang) * dist);
      look = new THREE.Vector3(p.x, 1.2, p.z);
      this.camPos.copy(desired); this.camLook.copy(look);
    } else {
      const back = 7.5 + Math.max(0, p.speed) * 0.04;
      desired = new THREE.Vector3(p.x - fwdX * back, 3.8, p.z - fwdZ * back);
      look = new THREE.Vector3(p.x + fwdX * 5, 1.3, p.z + fwdZ * 5);
      const a = 1 - Math.exp(-dt * 7);
      this.camPos.lerp(desired, a);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 12));
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.camLook);
    const fov = 70 + (p.boostTime > 0 ? 10 : 0) + Math.max(0, p.speed) * 0.12;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
    // ombre centrée sur le joueur
    this.sun.position.set(p.x + 40, 80, p.z + 25);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.items.dispose();
    this.audio.stopEngine();
    this.audio.stopMusic();
    clearTimeout(this.msgTimer);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    $('hud').classList.add('hidden');
  }
}

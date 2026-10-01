import * as THREE from 'three';
import { ITEMS, ITEM_ODDS } from './data.js';

export function rollItem(rank, total) {
  const f = total > 1 ? (rank - 1) / (total - 1) : 0;
  const keys = Object.keys(ITEMS);
  const weights = keys.map((k) => ITEM_ODDS.front[k] * (1 - f) + ITEM_ODDS.back[k] * f);
  let sum = weights.reduce((a, b) => a + b, 0), r = Math.random() * sum;
  for (let i = 0; i < keys.length; i++) {
    r -= weights[i];
    if (r <= 0) return keys[i];
  }
  return 'turbo';
}

function bananaMesh() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.2, 6, 10, Math.PI * 1.1), new THREE.MeshLambertMaterial({ color: '#ffd600' }));
  m.rotation.set(0, 0, Math.PI * 0.95);
  m.position.y = 0.55;
  m.castShadow = true;
  g.add(m);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshLambertMaterial({ color: '#5d4037' }));
  tip.position.set(0.5, 0.45, 0); g.add(tip);
  return g;
}

function mineMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.4, metalness: 0.6 }));
  body.position.y = 0.7; body.castShadow = true; g.add(body);
  const spikeG = new THREE.ConeGeometry(0.15, 0.4, 5);
  const spikeM = new THREE.MeshStandardMaterial({ color: '#90a4ae', metalness: 0.7, roughness: 0.3 });
  for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7]]) {
    const s = new THREE.Mesh(spikeG, spikeM);
    s.position.set(x * 0.75, 0.7 + y * 0.75, z * 0.75);
    s.lookAt(x * 10, 0.7 + y * 10, z * 10); s.rotateX(Math.PI / 2);
    g.add(s);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff1744' }));
  light.position.y = 1.45; g.add(light);
  g.userData.light = light;
  return g;
}

function missileMesh() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#e53935', roughness: 0.4, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 10), red);
  body.rotation.x = Math.PI / 2; g.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 10), new THREE.MeshStandardMaterial({ color: '#fafafa' }));
  tip.rotation.x = Math.PI / 2; tip.position.z = 1.1; g.add(tip);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.4), red);
    fin.position.z = -0.6;
    fin.rotation.z = (i * Math.PI) / 2;
    fin.translateY(0.3);
    g.add(fin);
  }
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 8), new THREE.MeshBasicMaterial({ color: '#ffab00' }));
  fire.rotation.x = -Math.PI / 2; fire.position.z = -1.25; g.add(fire);
  g.userData.fire = fire;
  g.position.y = 1;
  const wrap = new THREE.Group(); wrap.add(g);
  return wrap;
}

export class ItemSystem {
  constructor(race) {
    this.race = race;
    this.scene = race.scene;
    this.track = race.track;
    this.traps = [];
    this.missiles = [];
    this.fx = [];
  }

  update(dt, time) {
    const { karts } = this.race;
    const track = this.track;

    // Boîtes d'objets
    for (const k of karts) {
      if (k.roulette > 0) {
        k.roulette -= dt;
        if (k.roulette <= 0) {
          k.item = k.pendingItem;
          k.itemCount = k.item === 'triple' ? 3 : 1;
          k.pendingItem = null;
          k.itemReadyAt = time;
          k.events.push('itemReady');
        }
      }
      for (const b of track.itemBoxes) {
        if (!b.mesh.visible) continue;
        if ((b.x - k.x) ** 2 + (b.z - k.z) ** 2 < 2.6 ** 2 && Math.abs(b.y + 1 - k.y) < 3) {
          b.mesh.visible = false;
          b.respawn = 2.5;
          this.burst(b.x, b.y + 1.3, b.z, '#ffffff', 0.6);
          if (!k.item && k.roulette <= 0) {
            k.pendingItem = rollItem(k.rank || karts.length, karts.length);
            k.roulette = k.isPlayer ? 1.2 : 0.8;
            k.events.push('itemBox');
          }
        }
      }
      // Pads de turbo
      for (const p of track.boostPads) {
        if ((p.x - k.x) ** 2 + (p.z - k.z) ** 2 < 2.8 ** 2 && Math.abs(p.y - k.y) < 1.5 && k.boostTime < 0.9) k.boost(1.1);
      }
    }

    // Pièges
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      t.age += dt;
      if (t.type === 'mine') {
        t.mesh.userData.light.visible = Math.floor(time * 4) % 2 === 0;
        t.mesh.rotation.y += dt;
      }
      const r = t.type === 'mine' ? 2.4 : 1.9;
      for (const k of karts) {
        if (k === t.owner && t.age < 1.0) continue;
        if (k.hopY > 1.2 || Math.abs(k.y - t.y) > 1.5) continue;
        if ((t.x - k.x) ** 2 + (t.z - k.z) ** 2 < r * r) {
          const landed = k.hit(t.type === 'mine' ? 'flip' : 'spin');
          if (t.type === 'mine') this.explosion(t.x, t.y, t.z);
          else this.burst(t.x, t.y + 0.6, t.z, '#ffd600', 0.8);
          if (landed) this.race.onHit(k, t.owner, t.type);
          this.removeTrap(i);
          break;
        }
      }
    }

    // Missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      m.age += dt;
      let tx, tz;
      const tg = m.target;
      const ahead = tg ? track.wrap(tg.idx - Math.floor(m.loc.mainIdx)) : Infinity;
      if (tg && !tg.finished && (ahead < 12 || ahead > track.n - 4) && Math.abs(tg.y - m.y) < 4) { tx = tg.x; tz = tg.z; }
      else {
        const nx = track.advance(m.loc.path, m.loc.i, 14, (b) => !!(tg && tg.loc && tg.loc.path === b));
        const p = track.pointAt(nx.path, nx.i, tg && tg.loc && tg.loc.path === nx.path ? tg.lateral * 0.5 : 0);
        tx = p.x; tz = p.z;
      }
      const want = Math.atan2(tx - m.x, tz - m.z);
      let d = want - m.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.heading += Math.max(-6 * dt, Math.min(6 * dt, d));
      m.x += Math.sin(m.heading) * m.speed * dt;
      m.z += Math.cos(m.heading) * m.speed * dt;
      m.loc = track.locate(m.x, m.z, m.y, m.loc);
      if (!m.loc.inside) m.life = 0;
      m.y += (m.loc.ground - m.y) * Math.min(1, dt * 12);
      m.mesh.position.set(m.x, m.y, m.z);
      m.mesh.rotation.y = m.heading;
      m.mesh.children[0].rotation.z += dt * 10;
      m.mesh.children[0].userData.fire.scale.setScalar(0.8 + Math.random() * 0.5);
      let done = m.life <= 0;
      for (const k of karts) {
        if (k === m.owner && m.age < 1.5) continue;
        if ((m.x - k.x) ** 2 + (m.z - k.z) ** 2 < 2.4 ** 2 && Math.abs(m.y - k.y) < 3) {
          if (k.hit('flip')) this.race.onHit(k, m.owner, 'missile');
          done = true;
          break;
        }
      }
      // Les missiles détruisent les pièges
      for (let j = this.traps.length - 1; j >= 0 && !done; j--) {
        const t = this.traps[j];
        if ((m.x - t.x) ** 2 + (m.z - t.z) ** 2 < 2 ** 2 && Math.abs(m.y - t.y) < 3) { this.removeTrap(j); done = true; }
      }
      if (done) {
        this.explosion(m.x, m.y, m.z);
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }

    // Effets visuels
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const u = f.t / f.dur;
      f.mesh.scale.setScalar(f.size * (0.3 + u * 1.7));
      f.mesh.material.opacity = Math.max(0, 0.9 * (1 - u));
      if (u >= 1) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); this.fx.splice(i, 1); }
    }
  }

  removeTrap(i) {
    this.scene.remove(this.traps[i].mesh);
    this.traps.splice(i, 1);
  }

  burst(x, y, z, color, size = 1) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, t: 0, dur: 0.35, size });
  }

  explosion(x, y, z) {
    this.burst(x, y + 1, z, '#ff6d00', 2.5);
    this.burst(x, y + 1.5, z, '#ffd600', 1.5);
    this.race.sound('explosion', x, z);
  }

  // Utilisation d'un objet par un kart
  use(k) {
    if (!k.item || k.disabled) return false;
    const item = k.item;
    const back = (dist) => ({ x: k.x - Math.sin(k.heading) * dist, z: k.z - Math.cos(k.heading) * dist });
    switch (item) {
      case 'turbo':
      case 'triple':
        k.boost(1.4);
        break;
      case 'banane':
      case 'mine': {
        const p = back(2.8);
        const loc = this.track.locate(p.x, p.z, k.y, k.loc);
        const y = loc.ground;
        const mesh = item === 'mine' ? mineMesh() : bananaMesh();
        mesh.position.set(p.x, y, p.z);
        this.scene.add(mesh);
        this.traps.push({ type: item, x: p.x, y, z: p.z, mesh, owner: k, age: 0, loc: { path: loc.path, i: loc.i, lateral: loc.lateral } });
        if (this.traps.length > 40) this.removeTrap(0);
        this.race.sound('drop', k.x, k.z);
        break;
      }
      case 'missile': {
        const mesh = missileMesh();
        const target = this.race.kartAhead(k);
        const m = {
          x: k.x + Math.sin(k.heading) * 2.5, z: k.z + Math.cos(k.heading) * 2.5,
          y: k.y, heading: k.heading, speed: Math.max(55, k.speed + 25), loc: k.loc, target, owner: k, life: 6, age: 0, mesh,
        };
        mesh.position.set(m.x, m.y, m.z);
        this.scene.add(mesh);
        this.missiles.push(m);
        this.race.sound('missile', k.x, k.z);
        break;
      }
      case 'bouclier':
        k.shieldTime = 10;
        this.race.sound('shield', k.x, k.z);
        break;
      case 'eclair':
        this.race.lightning(k);
        break;
    }
    k.itemCount--;
    if (k.itemCount <= 0) { k.item = null; k.itemCount = 0; }
    return true;
  }

  dispose() {
    for (const t of this.traps) this.scene.remove(t.mesh);
    for (const m of this.missiles) this.scene.remove(m.mesh);
    for (const f of this.fx) this.scene.remove(f.mesh);
    this.traps = []; this.missiles = []; this.fx = [];
  }
}

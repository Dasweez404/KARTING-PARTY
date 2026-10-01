import * as THREE from 'three';

const DRIFT_LVL1 = 1.0;
const DRIFT_LVL2 = 2.3;

function nameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(text, 128, 32);
  g.fillStyle = color; g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(4, 1, 1);
  sp.position.y = 3.2;
  return sp;
}

export function buildKartModel(type, color) {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: '#b0b0b0', roughness: 0.3, metalness: 0.8 });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; root.add(m); return m;
  };
  let wheelR = 0.38, wheelW = 0.34, track = 0.85, front = 0.95, rear = -0.9;

  if (type === 'light') {
    box(1.2, 0.25, 2.3, body, 0, 0.4, 0);
    box(0.9, 0.2, 0.5, body, 0, 0.45, 1.25);
    wheelR = 0.33; track = 0.75;
  } else if (type === 'racer') {
    box(1.3, 0.32, 3.1, body, 0, 0.42, 0.1);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 4), body);
    nose.rotation.x = Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.position.set(0, 0.42, 2.1); nose.castShadow = true; root.add(nose);
    box(1.9, 0.08, 0.5, body, 0, 1.15, -1.45);
    box(0.1, 0.55, 0.3, dark, 0.6, 0.85, -1.45); box(0.1, 0.55, 0.3, dark, -0.6, 0.85, -1.45);
    front = 1.15; rear = -1.05;
  } else if (type === 'heavy') {
    box(1.9, 0.55, 2.7, body, 0, 0.55, 0);
    box(2.1, 0.3, 0.35, metal, 0, 0.45, 1.45);
    box(2.1, 0.3, 0.35, metal, 0, 0.45, -1.4);
    wheelR = 0.48; wheelW = 0.45; track = 1.05;
  } else if (type === 'drift') {
    box(1.45, 0.3, 2.6, body, 0, 0.42, 0);
    box(0.2, 0.25, 2.2, dark, 0.8, 0.38, 0); box(0.2, 0.25, 2.2, dark, -0.8, 0.38, 0);
    const wing = box(1.7, 0.07, 0.45, body, 0, 1.05, -1.3); wing.rotation.x = -0.25;
    box(0.08, 0.5, 0.2, dark, 0.45, 0.8, -1.3); box(0.08, 0.5, 0.2, dark, -0.45, 0.8, -1.3);
  } else {
    box(1.5, 0.35, 2.6, body, 0, 0.45, 0);
    box(1.1, 0.3, 0.7, body, 0, 0.55, 1.2);
    box(1.6, 0.15, 0.3, dark, 0, 0.4, 1.55);
  }
  // Siège + pilote
  box(0.7, 0.6, 0.15, dark, 0, 0.85, -0.55);
  const torso = box(0.62, 0.65, 0.45, new THREE.MeshStandardMaterial({ color: '#37474f', roughness: 0.7 }), 0, 1.0, -0.3);
  torso.rotation.x = -0.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10), body);
  head.position.set(0, 1.55, -0.25); head.castShadow = true; root.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.12), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1, metalness: 0.5 }));
  visor.position.set(0, 1.58, 0.05); root.add(visor);
  // Volant
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12), dark);
  wheelS.position.set(0, 1.0, 0.25); wheelS.rotation.x = -0.6; root.add(wheelS);

  // Roues
  const wheels = [];
  const wgeom = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 12);
  wgeom.rotateZ(Math.PI / 2);
  for (const [x, z] of [[track, front], [-track, front], [track, rear], [-track, rear]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, wheelR, z);
    const w = new THREE.Mesh(wgeom, dark);
    w.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.45, wheelR * 0.45, wheelW + 0.02, 8).rotateZ(Math.PI / 2), metal);
    w.add(hub);
    pivot.add(w);
    root.add(pivot);
    wheels.push({ pivot, w, front: z > 0 });
  }
  root.userData.wheels = wheels;
  root.userData.wheelR = wheelR;
  root.userData.rear = rear;
  return root;
}

export class Kart {
  constructor({ name, color, kartDef, isPlayer = false, speedMult = 1 }) {
    this.name = name;
    this.color = color;
    this.def = kartDef;
    this.isPlayer = isPlayer;
    const s = kartDef.stats;
    this.maxSpeed = (25 + s.speed * 9) * speedMult;
    this.accel = 9 + s.accel * 13;
    this.turnRate = 1.55 + s.handling * 0.95;
    this.weight = 0.5 + s.weight;
    this.driftBonus = kartDef.driftBonus || 1;

    this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.heading = 0; this.speed = 0;
    this.airborne = false; this.loc = null; this.ground = 0; this.pitch = 0;
    this.idx = -1; this.lap = 0; this.checkpoint = true; this.progress = 0;
    this.lateral = 0; this.offroad = false;
    this.finished = false; this.finishTime = 0; this.rank = 0;
    this.item = null; this.itemCount = 0; this.roulette = 0;
    this.boostTime = 0; this.shieldTime = 0; this.spinTime = 0; this.flipTime = 0; this.shrinkTime = 0;
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0;
    this.hopY = 0; this.hopV = 0;
    this.invuln = 0;
    this.prevDrift = false;
    this.steerVisual = 0;
    this.slideYaw = 0;
    this.events = [];
    this.rubber = 1; // ajustement de vitesse des bots

    this.mesh = new THREE.Group();
    this.visual = new THREE.Group();
    this.model = buildKartModel(kartDef.shape, color);
    this.visual.add(this.model);
    this.mesh.add(this.visual);

    // Bulle bouclier
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 20, 14),
      new THREE.MeshLambertMaterial({ color: '#4fc3f7', emissive: '#29b6f6', transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.shieldMesh.position.y = 0.9;
    this.shieldMesh.visible = false;
    this.visual.add(this.shieldMesh);

    // Flamme de turbo
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 1.6, 8),
      new THREE.MeshBasicMaterial({ color: '#ffab00', transparent: true, opacity: 0.85 }),
    );
    this.flame.rotation.x = -Math.PI / 2;
    this.flame.position.set(0, 0.5, this.model.userData.rear - 0.9);
    this.flame.visible = false;
    this.visual.add(this.flame);

    // Étincelles de dérapage
    this.sparks = [];
    for (const sx of [0.8, -0.8]) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      sp.position.set(sx, 0.2, this.model.userData.rear - 0.3);
      sp.visible = false;
      this.visual.add(sp);
      this.sparks.push(sp);
    }

    if (!isPlayer) this.mesh.add(nameSprite(name, color));
  }

  place(x, z, heading, y = 0) {
    this.x = x; this.z = z; this.heading = heading; this.y = y; this.ground = y;
    this.syncMesh(0);
  }

  get disabled() { return this.spinTime > 0 || this.flipTime > 0; }

  // Effet d'une attaque. Retourne true si le coup a porté.
  hit(kind) {
    if (this.invuln > 0) return false;
    if (this.shieldTime > 0) {
      this.shieldTime = 0;
      this.invuln = 0.6;
      this.events.push('shieldBreak');
      return false;
    }
    this.drifting = false; this.driftCharge = 0; this.boostTime = 0;
    if (kind === 'spin') {
      this.spinTime = 1.0; this.speed *= 0.35;
    } else if (kind === 'flip') {
      this.flipTime = 1.4; this.speed *= 0.1; this.hopV = 9;
    } else if (kind === 'shrink') {
      this.shrinkTime = 4; this.spinTime = 0.6; this.speed *= 0.5;
    }
    this.invuln = kind === 'shrink' ? 0.2 : 1.6;
    this.events.push('hit');
    return true;
  }

  boost(t = 1.4) {
    this.boostTime = Math.max(this.boostTime, t);
    this.events.push('boost');
  }

  update(dt, input, track, raceTime) {
    // Timers
    this.invuln = Math.max(0, this.invuln - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.boostTime = Math.max(0, this.boostTime - dt);
    this.shrinkTime = Math.max(0, this.shrinkTime - dt);
    if (this.spinTime > 0) this.spinTime = Math.max(0, this.spinTime - dt);
    if (this.flipTime > 0) this.flipTime = Math.max(0, this.flipTime - dt);

    // Vitesse maximale du moment
    let vmax = this.maxSpeed * this.rubber;
    const curPath = this.loc ? this.loc.path : track.main;
    this.offroad = Math.abs(this.lateral) > curPath.half + (curPath === track.main ? 1.4 : 0.8);
    if (this.offroad && this.boostTime <= 0) vmax *= 0.5;
    if (this.shrinkTime > 0) vmax *= 0.65;
    if (this.boostTime > 0) vmax *= 1.38;

    let steer = 0;
    if (!this.disabled) {
      steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      if (input.steer !== undefined) steer = input.steer;
      // Accélération
      if (this.airborne) {
        this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.5 * dt);
      } else if (input.up || this.boostTime > 0) {
        const a = this.boostTime > 0 ? this.accel * 2.5 : this.accel;
        if (this.speed < vmax) this.speed += a * dt * (1 - 0.55 * Math.max(0, this.speed) / vmax);
      } else if (input.down) {
        if (this.speed > 0) this.speed -= 28 * dt;
        else this.speed = Math.max(-9, this.speed - 10 * dt);
      } else {
        this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 7 * dt);
      }
      if (this.speed > vmax) this.speed = Math.max(vmax, this.speed - (this.speed - vmax) * 2.2 * dt - 4 * dt);

      // Dérapage
      const driftPressed = input.drift && !this.prevDrift;
      if (!this.drifting && input.drift && steer !== 0 && this.speed > 11 && this.hopY <= 0.01 && !this.airborne && (driftPressed || this.prevDrift)) {
        this.drifting = true; this.driftDir = Math.sign(steer); this.driftCharge = 0;
        this.hopV = 4.5;
        this.events.push('drift');
      }
      if (this.drifting && (!input.drift || this.speed < 8)) {
        if (this.driftCharge >= DRIFT_LVL2) this.boost(1.5);
        else if (this.driftCharge >= DRIFT_LVL1) this.boost(0.8);
        this.drifting = false; this.driftCharge = 0;
      }
      this.prevDrift = !!input.drift;

      // Direction
      let sf = Math.min(1, Math.abs(this.speed) / 9) * Math.sign(this.speed || 1) * (1 - Math.min(0.25, Math.abs(this.speed) / 160));
      if (this.airborne) sf *= 0.4;
      if (this.drifting) {
        // Dérapage : virage modéré, dosé avec la direction (0.2 en contre-braquant, 0.95 en braquant à fond)
        const k = 0.575 + 0.375 * steer * this.driftDir;
        this.heading += this.driftDir * this.turnRate * k * sf * dt;
        if (!this.airborne) this.driftCharge += dt * (0.7 + 0.6 * Math.max(0, steer * this.driftDir)) * this.driftBonus * (this.offroad ? 0.3 : 1);
      } else {
        this.heading += steer * this.turnRate * sf * dt;
      }
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 25 * dt);
      this.drifting = false;
      this.prevDrift = !!input.drift;
    }

    // Déplacement
    const px = this.x, pz = this.z;
    let mx = Math.sin(this.heading) * this.speed * dt;
    let mz = Math.cos(this.heading) * this.speed * dt;
    if (this.drifting) {
      // glissement vers l'extérieur du virage
      const rx = -Math.cos(this.heading), rz = Math.sin(this.heading);
      const slide = this.driftDir * this.speed * 0.16 * dt;
      mx += rx * slide; mz += rz * slide;
    }
    this.x += mx; this.z += mz;

    // Petit saut visuel (dérapage, coups)
    this.hopV -= 30 * dt;
    this.hopY = Math.max(0, this.hopY + this.hopV * dt);
    if (this.hopY === 0 && this.hopV < 0) this.hopV = 0;

    // Position dans le réseau de routes
    let loc = track.locate(this.x, this.z, this.y, this.loc);
    // Face abrupte (arrière d'un tremplin) : on la traite comme un mur
    if (loc.ground - this.y > 1.0 && this.loc) {
      this.x = px; this.z = pz;
      this.speed *= -0.3;
      loc = track.locate(this.x, this.z, this.y, this.loc);
    }
    // Murs
    const path = loc.path;
    const lim = path.wallDist - 1.0;
    if (!loc.inside && Math.abs(loc.lateral) > lim) {
      const k = loc.i, nm = path.normals[k];
      const over = Math.abs(loc.lateral) - lim;
      const sgn = Math.sign(loc.lateral);
      this.x -= nm.x * over * sgn; this.z -= nm.z * over * sgn;
      loc.lateral = sgn * lim;
      if (Math.abs(this.speed) > 6) this.events.push('wall');
      this.speed *= 0.75;
      // réaligne doucement la direction sur la piste
      let d = track.headingAt(path, k) - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < Math.PI / 2) this.heading += d * 0.15;
    }
    this.loc = loc;
    this.lateral = loc.lateral;
    this.ground = loc.ground;

    // Gravité, tremplins et bosses
    const G = 28;
    const prevGround = this.prevGround ?? loc.ground;
    this.prevGround = loc.ground;
    if (this.airborne) {
      this.vy -= G * dt;
      this.y += this.vy * dt;
      if (this.y <= loc.ground) {
        if (this.vy < -7) this.events.push('land');
        this.y = loc.ground;
        this.airborne = false;
        this.vy = Math.max(-14, Math.min(14, (loc.ground - prevGround) / dt));
      }
    } else {
      const groundRate = (loc.ground - this.y) / dt;
      // seul un vrai rebord (le sol plonge d'un coup) fait décoller, pas une simple descente
      if (this.vy - groundRate > 4 && Math.abs(this.speed) > 8) {
        // le sol se dérobe : décollage !
        this.airborne = true;
        this.vy -= G * dt;
        this.y += this.vy * dt;
        if (this.y <= loc.ground) { this.y = loc.ground; this.airborne = false; }
      } else {
        // une petite marche (changement de route) ne doit pas créer de vitesse verticale parasite
        const cap = Math.abs(this.speed) * 0.32 + 1;
        this.vy = Math.abs(groundRate) > cap ? 0 : groundRate;
        this.y = loc.ground;
      }
    }

    // Tours (sur l'indice de la boucle principale)
    const n = track.n;
    const prevIdx = this.idx;
    this.idx = Math.floor(loc.mainIdx) % n;
    if (prevIdx >= 0) {
      if (this.idx > n * 0.45 && this.idx < n * 0.55) this.checkpoint = true;
      if (prevIdx > n * 0.75 && this.idx < n * 0.25 && this.checkpoint) {
        this.lap++;
        this.checkpoint = false;
        this.events.push('lap');
      } else if (prevIdx < n * 0.25 && this.idx > n * 0.75) {
        this.lap--;
        this.checkpoint = true;
      }
    }
    this.progress = this.lap + loc.mainIdx / n;

    this.syncMesh(dt, steer, raceTime);
  }

  syncMesh(dt, steer = 0, time = 0) {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    const targetPitch = -Math.atan2(this.vy, Math.max(4, Math.abs(this.speed)));
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * (this.airborne ? 3 : 10));
    const v = this.visual;
    const targetSlide = this.drifting ? this.driftDir * 0.38 : 0;
    this.slideYaw += (targetSlide - this.slideYaw) * Math.min(1, dt * 8);
    let yaw = this.slideYaw, roll = this.drifting ? -this.driftDir * 0.06 : 0, pitch = this.pitch;
    if (this.spinTime > 0) yaw += this.spinTime * 14;
    if (this.flipTime > 0) pitch += (1.4 - this.flipTime) / 1.4 * Math.PI * 2;
    v.rotation.set(pitch, yaw, roll);
    v.position.y = this.hopY + 0.12;
    const sc = this.shrinkTime > 0 ? 0.55 : 1;
    v.scale.setScalar(v.scale.x + (sc - v.scale.x) * Math.min(1, dt * 6));

    // Roues
    this.steerVisual += (steer - this.steerVisual) * Math.min(1, dt * 10);
    const wr = this.model.userData.wheelR;
    for (const w of this.model.userData.wheels) {
      w.w.rotation.x += (this.speed * dt) / wr;
      if (w.front) w.pivot.rotation.y = this.steerVisual * 0.4;
    }
    // Effets
    this.shieldMesh.visible = this.shieldTime > 0;
    if (this.shieldMesh.visible) this.shieldMesh.material.opacity = 0.25 + Math.sin(time * 8) * 0.08;
    this.flame.visible = this.boostTime > 0;
    if (this.flame.visible) {
      const f = 0.8 + Math.random() * 0.5;
      this.flame.scale.set(f, f * (1 + Math.random() * 0.4), f);
    }
    const lvl = this.driftCharge >= DRIFT_LVL2 ? 2 : this.driftCharge >= DRIFT_LVL1 ? 1 : 0;
    for (const sp of this.sparks) {
      sp.visible = this.drifting && Math.random() < 0.85;
      if (sp.visible) {
        sp.material.color.set(lvl === 2 ? '#ff9100' : lvl === 1 ? '#40c4ff' : '#ffffff');
        sp.scale.setScalar((0.6 + Math.random() * 0.8) * (1 + lvl * 0.4));
        sp.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      }
    }
    // Clignotement d'invulnérabilité
    this.model.visible = !(this.invuln > 0 && this.spinTime <= 0 && this.flipTime <= 0 && Math.floor(time * 20) % 2 === 0);
  }
}

// Pilotage des bots : suivi de trajectoire, gestion des virages, dérapages, objets.

export class BotDriver {
  constructor(kart, skill) {
    this.kart = kart;
    this.skill = skill * (0.97 + Math.random() * 0.06);
    this.lane = (Math.random() - 0.5) * 0.7;
    this.laneTarget = this.lane;
    this.laneTimer = 2 + Math.random() * 4;
    this.itemHold = 0;
    this.lastItem = null;
    this.wobble = Math.random() * 10;
    this.stuck = 0;
    this.reverseTime = 0;
  }

  think(dt, track, race, time) {
    const k = this.kart;
    const input = { up: true, down: false, steer: 0, drift: false };
    const sp = track.spacing;

    // Changement de couloir de temps en temps
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2 + Math.random() * 5;
      this.laneTarget = (Math.random() - 0.5) * 0.8;
    }
    let lane = this.laneTarget;

    // Viser une boîte d'objet si on n'a rien
    if (!k.item && k.roulette <= 0) {
      for (const b of track.itemBoxes) {
        if (!b.mesh.visible) continue;
        const nb = track.nearest(b.x, b.z, k.idx);
        const ahead = track.wrap(nb.idx - k.idx);
        if (ahead > 4 && ahead < 45 / sp) { lane = nb.lateral / track.half; break; }
      }
    }
    // Éviter les pièges devant
    for (const t of race.items.traps) {
      const nt = track.nearest(t.x, t.z, k.idx);
      const ahead = track.wrap(nt.idx - k.idx);
      if (ahead > 0 && ahead < 30 / sp && this.skill > 0.8 * Math.random() + 0.2) {
        const tl = nt.lateral / track.half;
        if (Math.abs(tl - lane) < 0.35) lane = tl > 0 ? tl - 0.5 : tl + 0.5;
      }
    }
    this.lane += (Math.max(-0.85, Math.min(0.85, lane)) - this.lane) * Math.min(1, dt * 2);

    // Point visé
    const la = Math.round((7 + Math.max(0, k.speed) * 0.42) / sp);
    const lat = this.lane * track.half + Math.sin(time * 0.7 + this.wobble) * 0.8;
    const p = track.pointAt(k.idx + la, lat);
    const want = Math.atan2(p.x - k.x, p.z - k.z);
    let d = want - k.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    input.steer = Math.max(-1, Math.min(1, d * 2.6));

    // Courbure à venir -> freinage / dérapage
    let kmax = 0, kNear = 0;
    const steps = Math.round(40 / sp);
    for (let i = 2; i < steps; i += 2) {
      const c = Math.abs(track.curvature[track.wrap(k.idx + i)]);
      kmax = Math.max(kmax, c);
      if (i < steps / 2) kNear = Math.max(kNear, c);
    }
    const turnCap = k.turnRate * (0.9 + 0.2 * this.skill);
    if (kmax * k.speed > turnCap && k.boostTime <= 0) input.up = false;
    if (kmax * k.speed > turnCap * 1.35) input.down = true;
    if (Math.abs(d) > 0.9 && k.speed > 12) { input.up = false; }

    // Dérapage dans les grandes courbes
    if (this.skill > 0.85 && kNear > 0.02 && k.speed > 15 && Math.abs(input.steer) > 0.45) input.drift = true;
    if (k.drifting && kNear > 0.012) input.drift = true;

    // Coincé contre un mur ? marche arrière
    if (Math.abs(k.speed) < 2 && !k.disabled && race.started) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 1.2) { this.reverseTime = 0.9; this.stuck = 0; }
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      input.up = false; input.down = true; input.steer = -input.steer; input.drift = false;
    }

    // Élastique : les bots restent dans la course
    const player = race.player;
    if (player && !player.finished) {
      const gap = player.progress - k.progress;
      k.rubber = this.skill * (gap > 0 ? 1 + Math.min(0.14, gap * 0.5) : 1 - Math.min(0.1, -gap * 0.35));
    } else {
      k.rubber = this.skill;
    }

    // Objets
    if (!k.item) this.lastItem = null;
    if (race.started && k.item) {
      if (this.lastItem !== k.item) {
        this.itemHold = 0.6 + Math.random() * 2.5;
        this.lastItem = k.item;
      }
      this.itemHold -= dt;
      if (this.itemHold <= 0) {
        let use;
        switch (k.item) {
          case 'turbo': case 'triple': use = kmax < 0.02 || k.offroad; break;
          case 'banane': case 'mine': use = race.kartBehindWithin(k, 30) || this.itemHold < -6; break;
          case 'missile': use = !!race.kartAhead(k) || this.itemHold < -8; break;
          default: use = true;
        }
        if (use && race.items.use(k)) this.itemHold = 0.5 + Math.random();
      }
    }
    return input;
  }
}

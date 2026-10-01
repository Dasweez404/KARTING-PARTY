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
    this.choices = new Map();
    this.choiceLap = -99;
  }

  // Décide une fois par tour si le bot prend un embranchement
  choose(branch) {
    if (this.choiceLap !== this.kart.lap) { this.choices = new Map(); this.choiceLap = this.kart.lap; }
    if (!this.choices.has(branch)) {
      const p = branch.kind === 'shortcut' ? 0.15 + 0.7 * this.skill : 0.5;
      this.choices.set(branch, Math.random() < p);
    }
    return this.choices.get(branch);
  }

  think(dt, track, race, time) {
    const k = this.kart;
    const input = { up: true, down: false, steer: 0, drift: false };
    const sp = track.spacing;
    const choose = (b) => this.choose(b);
    const loc = track.routeLoc(k.loc || { path: track.main, i: k.idx, mainIdx: k.idx }, k.x, k.z, k.y, choose);

    // Changement de couloir de temps en temps
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2 + Math.random() * 5;
      this.laneTarget = (Math.random() - 0.5) * 0.8;
    }
    let lane = this.laneTarget;
    const onRoute = (path) => path === track.main || path === loc.path || choose(path);

    // Viser une boîte d'objet si on n'a rien
    if (!k.item && k.roulette <= 0) {
      for (const b of track.itemBoxes) {
        if (!b.mesh.visible || !onRoute(b.path)) continue;
        const ahead = track.ahead(loc.path, loc.i, b.path, b.i);
        if (ahead > 4 && ahead < 45 / sp) { lane = b.lateral / b.path.half; break; }
      }
    }
    // Éviter les pièges devant
    for (const t of race.items.traps) {
      if (!t.loc) continue;
      const ahead = track.ahead(loc.path, loc.i, t.loc.path, t.loc.i);
      if (ahead > 0 && ahead < 30 / sp && this.skill > 0.8 * Math.random() + 0.2) {
        const tl = t.loc.lateral / t.loc.path.half;
        if (Math.abs(tl - lane) < 0.35) lane = tl > 0 ? tl - 0.5 : tl + 0.5;
      }
    }
    this.lane += (Math.max(-0.8, Math.min(0.8, lane)) - this.lane) * Math.min(1, dt * 2);

    // Point visé, en suivant la route choisie
    // Encore sur la boucle mais engagé vers un embranchement : on rejoint d'abord son axe,
    // sinon on couperait droit dans le "V" entre les deux murs.
    const joining = k.loc && loc.path !== k.loc.path && Math.abs(loc.lateral) > loc.path.half * 0.5;
    const la = joining ? Math.round(4 / sp) : Math.round((7 + Math.max(0, k.speed) * 0.42) / sp);
    const tgt = track.advance(loc.path, loc.i, la, choose);
    const lat = joining ? 0 : this.lane * tgt.path.half + Math.sin(time * 0.7 + this.wobble) * 0.6;
    const p = track.pointAt(tgt.path, tgt.i, lat);
    const want = Math.atan2(p.x - k.x, p.z - k.z);
    let d = want - k.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    input.steer = Math.max(-1, Math.min(1, d * 2.6));

    // Courbure à venir -> freinage / dérapage
    let kmax = 0, kNear = 0;
    const steps = Math.round(40 / sp);
    for (let i = 2; i < steps; i += 2) {
      const l = track.advance(loc.path, loc.i, i, choose);
      const c = Math.abs(l.path.curvature[track.clampI(l.path, l.i)]);
      kmax = Math.max(kmax, c);
      if (i < steps / 2) kNear = Math.max(kNear, c);
    }
    const turnCap = k.turnRate * (0.9 + 0.2 * this.skill);
    if (kmax * k.speed > turnCap && k.boostTime <= 0) input.up = false;
    if (kmax * k.speed > turnCap * 1.35) input.down = true;
    if (Math.abs(d) > 0.9 && k.speed > 12) { input.up = false; }

    // Dérapage dans les grandes courbes
    if (this.skill > 0.85 && kNear > 0.02 && k.speed > 15 && Math.abs(input.steer) > 0.5) input.drift = true;
    if (k.drifting && kNear > 0.012 && input.steer * k.driftDir > -0.2) input.drift = true;

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

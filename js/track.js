import * as THREE from 'three';
import { THEMES } from './data.js';
import { buildNetwork, rng, hashStr } from './shape.js';

export { rng };

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roadTexture(lines) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const r = rng(42);
    for (let i = 0; i < 1800; i++) {
      const v = 200 + Math.floor(r() * 55);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    if (!lines) return;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(w / 2 - 2, 0, 4, h / 2);
  });
}

function stripeTexture(c1, c2) {
  return canvasTex(16, 64, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = c2; g.fillRect(0, h / 2, w, h / 2);
  });
}

function checkerTexture() {
  return canvasTex(64, 16, (g, w, h) => {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  });
}

function windowsTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    const cols = ['#ffe082', '#80deea', '#ff80ab', '#fff59d'];
    for (let y = 4; y < h - 4; y += 10) for (let x = 4; x < w - 4; x += 10) {
      if (r() < 0.55) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, 6, 6); }
    }
  });
}

function itemBoxTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#ff5252'); grd.addColorStop(0.33, '#ffd740');
    grd.addColorStop(0.66, '#69f0ae'); grd.addColorStop(1, '#40c4ff');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#333'; g.lineWidth = 4;
    g.strokeText('?', w / 2, h / 2 + 2); g.fillText('?', w / 2, h / 2 + 2);
  }, false);
}

export class Track {
  constructor(id, def) {
    this.id = id;
    this.def = def;
    this.theme = THEMES[def.theme];
    const net = buildNetwork(def, id);
    this.main = net.main;
    this.branches = net.branches;
    this.paths = net.paths;
    this.paths.forEach((p, i) => { p.id = i; });
    // raccourcis vers la boucle principale (compatibilité)
    const m = this.main;
    this.pts = m.pts; this.normals = m.normals; this.tangents = m.tangents; this.curvature = m.curvature;
    this.n = m.n; this.spacing = m.spacing; this.length = m.length;
    this.half = m.half; this.wallDist = m.wallDist;
    this.group = new THREE.Group();
    this.rand = rng(hashStr(id));
    let maxR = 0;
    for (const p of this.paths) for (const q of p.pts) maxR = Math.max(maxR, Math.hypot(q.x, q.z));
    this.extent = maxR;
    this.itemBoxes = [];
    this.boostPads = [];
    this.build();
  }

  // ---------- requêtes géométriques ----------
  wrap(i) { return ((i % this.n) + this.n) % this.n; }

  clampI(path, i) {
    i = Math.round(i);
    return path.closed ? ((i % path.n) + path.n) % path.n : Math.max(0, Math.min(path.n - 1, i));
  }

  // Point le plus proche sur un chemin : indice, décalage latéral et position le long du segment
  nearestOn(path, x, z, hint) {
    const n = path.n;
    let best = 0, bestD = Infinity;
    if (hint === undefined || hint < 0 || !path.closed) {
      for (let i = 0; i < n; i++) {
        const p = path.pts[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let k = -25; k <= 25; k++) {
        const i = (hint + k + n) % n;
        const p = path.pts[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    const p = path.pts[best], nm = path.normals[best], tg = path.tangents[best];
    const dx = x - p.x, dz = z - p.z;
    return { i: best, lateral: dx * nm.x + dz * nm.z, along: dx * tg.x + dz * tg.z };
  }

  heightAt(path, i, along = 0) {
    const n = path.n;
    i = this.clampI(path, i);
    const h0 = path.heights[i];
    const j = along >= 0 ? i + 1 : i - 1;
    if (!path.closed && (j < 0 || j >= n)) return h0;
    const h1 = path.heights[(j + n) % n];
    return h0 + (h1 - h0) * Math.min(1, Math.abs(along) / path.spacing);
  }

  // Le point (x, z, y) est-il dans le couloir (entre les murs) d'un chemin ?
  insideInfo(path, x, z, y, hint) {
    const r = this.nearestOn(path, x, z, hint);
    if (!path.closed && ((r.i === 0 && r.along < -0.5) || (r.i === path.n - 1 && r.along > 0.5))) return null;
    const h = this.heightAt(path, r.i, r.along);
    if (y !== undefined && Math.abs(y - h) > 4.5) return null;
    r.ground = h;
    return r;
  }

  mainIdxOf(path, i) {
    if (path === this.main) return i;
    return this.wrap(path.startIdx + (i / (path.n - 1)) * path.span);
  }

  // Localise un kart dans le réseau. "prev" sert d'indice de départ et donne une préférence au chemin courant.
  locate(x, z, y, prev) {
    let best = null, bestScore = Infinity;
    for (const path of this.paths) {
      const hint = path === this.main && prev ? Math.round(prev.mainIdx) : undefined;
      const r = this.insideInfo(path, x, z, y, hint);
      if (!r) continue;
      const inside = Math.abs(r.lateral) <= path.wallDist - 0.9;
      let score = Math.abs(r.lateral) / path.wallDist;
      if (!inside) score += 10 + Math.abs(r.lateral);
      if (prev && prev.path === path && inside) score -= 5;
      if (score < bestScore) { bestScore = score; best = { path, i: r.i, lateral: r.lateral, along: r.along, ground: r.ground, inside }; }
    }
    if (!best) {
      const path = prev ? prev.path : this.main;
      const r = this.nearestOn(path, x, z, path === this.main && prev ? Math.round(prev.mainIdx) : undefined);
      best = { path, i: r.i, lateral: r.lateral, along: r.along, ground: this.heightAt(path, r.i, r.along), inside: false };
    }
    best.mainIdx = this.mainIdxOf(best.path, best.i);
    return best;
  }

  // Avance de "steps" échantillons le long du réseau ; choose(branch) décide si on prend un embranchement.
  advance(path, i, steps, choose) {
    if (path !== this.main) {
      const j = i + steps;
      if (j <= path.n - 1) return { path, i: j };
      return this.advance(this.main, path.endIdx, j - (path.n - 1), choose);
    }
    const target = i + steps;
    if (choose) {
      for (const b of this.branches) {
        let s = b.startIdx;
        while (s < i) s += this.n;
        if (s <= target && choose(b)) return this.advance(b, 0, target - s, choose);
      }
    }
    return { path, i: this.wrap(target) };
  }

  // Position "virtuelle" sur la route choisie : un kart encore sur la boucle principale mais engagé
  // dans la zone de séparation d'un embranchement choisi est considéré comme déjà sur l'embranchement.
  routeLoc(loc, x, z, y, choose) {
    if (loc.path !== this.main || !choose) return loc;
    for (const b of this.branches) {
      const into = this.wrap(Math.round(loc.mainIdx) - b.startIdx);
      if (into < b.span * 0.6 && choose(b)) {
        // seulement si le kart est réellement dans le couloir de l'embranchement (sinon il a raté l'entrée)
        const r = this.insideInfo(b, x, z, y);
        if (r && Math.abs(r.lateral) < b.wallDist - 1.2) return { path: b, i: r.i, lateral: r.lateral, mainIdx: loc.mainIdx };
      }
    }
    return loc;
  }

  // Nombre d'échantillons entre a et b s'ils sont sur le même chemin (sinon Infinity)
  ahead(pathA, iA, pathB, iB) {
    if (pathA !== pathB) {
      if (pathA !== this.main && pathB === this.main) {
        const d = this.wrap(iB - pathA.endIdx);
        return d < this.n / 2 ? pathA.n - 1 - iA + d : Infinity;
      }
      return Infinity;
    }
    return pathA.closed ? this.wrap(iB - iA) : iB - iA;
  }

  pointAt(path, i, lateral = 0) {
    const k = this.clampI(path, i);
    const p = path.pts[k], nm = path.normals[k];
    return { x: p.x + nm.x * lateral, z: p.z + nm.z * lateral, y: path.heights[k] };
  }

  headingAt(path, i) {
    const t = path.tangents[this.clampI(path, i)];
    return Math.atan2(t.x, t.z);
  }

  // ---------- construction de la scène ----------
  // Ruban le long d'un chemin. yA/yB : hauteur des deux bords ; skip(k) : omettre le quad k→k+1.
  ribbon(path, offA, offB, opts = {}) {
    const n = path.n, rows = path.closed ? n + 1 : n;
    const from = opts.range ? opts.range[0] : 0, to = opts.range ? opts.range[1] : rows - 1;
    const pos = [], uv = [], col = [], idx = [];
    const yOff = opts.y ?? 0;
    for (let r = from; r <= to; r++) {
      const k = path.closed ? ((r % n) + n) % n : r;
      const p = path.pts[k], nm = path.normals[k], h = path.heights[k];
      const yA = opts.yA ? opts.yA(h, k) : h + yOff, yB = opts.yB ? opts.yB(h, k) : h + yOff;
      pos.push(p.x + nm.x * offA, yA, p.z + nm.z * offA, p.x + nm.x * offB, yB, p.z + nm.z * offB);
      const v = (r * path.spacing) / (opts.vScale || 8);
      uv.push(0, v, 1, v);
      if (opts.colorFn) { const c = opts.colorFn(k); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      if (r < to && !(opts.skip && opts.skip(k))) {
        const a = (r - from) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (opts.colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Le point latéral "off" du segment k→k+1 de "path" est-il dans la zone d'un autre chemin ?
  overlapsOther(path, k, off, field = 'wallDist', margin = 0.2) {
    const n = path.n, k2 = path.closed ? (k + 1) % n : Math.min(n - 1, k + 1);
    const a = path.pts[k], b = path.pts[k2], na = path.normals[k], nb = path.normals[k2];
    const x = (a.x + b.x) / 2 + ((na.x + nb.x) / 2) * off, z = (a.z + b.z) / 2 + ((na.z + nb.z) / 2) * off;
    const y = (path.heights[k] + path.heights[k2]) / 2;
    for (const o of this.paths) {
      if (o === path) continue;
      const r = this.insideInfo(o, x, z, y);
      if (r && Math.abs(r.lateral) < o[field] - margin) return true;
    }
    return false;
  }

  build() {
    const th = this.theme, G = this.group;

    // Sol
    if (!th.noGround) {
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(this.extent + (th.water ? 90 : 700), 64),
        new THREE.MeshLambertMaterial({ color: th.ground }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      G.add(ground);
      if (th.water) {
        const water = new THREE.Mesh(
          new THREE.CircleGeometry(2500, 32),
          new THREE.MeshPhongMaterial({ color: th.water, shininess: 80, specular: '#ffffff' }),
        );
        water.rotation.x = -Math.PI / 2; water.position.y = -0.4;
        G.add(water);
      }
    }

    const rainbow = th.road === 'rainbow';
    const roadTex = roadTexture(true), dirtTex = roadTexture(false);
    const curbMat = new THREE.MeshLambertMaterial({ map: stripeTexture(th.walls[0], th.walls[1]) });
    const shMat = new THREE.MeshLambertMaterial({ color: th.shoulder, side: THREE.DoubleSide });
    const wallTex = stripeTexture(th.walls[0], th.walls[1]);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide });
    if (th.night) { wallMat.emissive = new THREE.Color('#ffffff'); wallMat.emissiveMap = wallTex; wallMat.emissiveIntensity = 0.6; }
    const cliffMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(th.cliff || th.shoulder).multiplyScalar(th.cliff ? 1 : 0.72), side: THREE.DoubleSide,
    });
    const hazard = new THREE.MeshLambertMaterial({ map: stripeTexture('#ffd600', '#212121'), polygonOffset: true, polygonOffsetFactor: -4 });

    for (const path of this.paths) {
      const isMain = path === this.main;
      const half = path.half;
      const curbW = isMain ? 1.4 : 0.8;
      // Route
      let roadMat;
      if (path.kind === 'shortcut') {
        roadMat = new THREE.MeshLambertMaterial({ map: dirtTex, color: new THREE.Color(th.shoulder).multiplyScalar(0.85) });
      } else {
        roadMat = new THREE.MeshLambertMaterial({ map: roadTex, color: rainbow ? '#ffffff' : th.road, vertexColors: rainbow });
        if (rainbow) roadMat.emissive = new THREE.Color('#222');
      }
      if (!isMain) { roadMat.polygonOffset = true; roadMat.polygonOffsetFactor = -2; }
      const colorFn = rainbow && path.kind !== 'shortcut' ? (k) => new THREE.Color().setHSL(((k * path.spacing) / 200) % 1, 0.85, 0.55) : undefined;
      const road = new THREE.Mesh(this.ribbon(path, half, -half, { y: 0.08, colorFn, vScale: 16 }), roadMat);
      road.receiveShadow = true;
      G.add(road);

      // Vibreurs, bas-côtés, murs, talus
      for (const s of [1, -1]) {
        const curb = new THREE.Mesh(this.ribbon(path, s * half, s * (half + curbW), {
          y: 0.1, vScale: 6, skip: (k) => this.overlapsOther(path, k, s * (half + curbW / 2), 'half', -0.5),
        }), curbMat);
        curb.receiveShadow = true;
        G.add(curb);
        G.add(new THREE.Mesh(this.ribbon(path, s * (half + curbW), s * path.wallDist, {
          y: 0.05, skip: isMain ? undefined : (k) => this.overlapsOther(path, k, s * (half + path.wallDist) / 2, 'wallDist', 0),
        }), shMat));
        const wallSkip = (k) => this.overlapsOther(path, k, s * path.wallDist);
        G.add(new THREE.Mesh(this.ribbon(path, s * path.wallDist, s * path.wallDist, {
          yA: (h) => h, yB: (h) => h + 1.3, vScale: 5, skip: wallSkip,
        }), wallMat));
        G.add(new THREE.Mesh(this.ribbon(path, s * path.wallDist, s * path.wallDist, {
          yA: (h) => (th.noGround ? h - 3 : -0.5), yB: (h) => h + 0.04, skip: wallSkip,
        }), cliffMat));
      }
      // Dessous de la route pour l'espace (route flottante)
      if (th.noGround) {
        G.add(new THREE.Mesh(this.ribbon(path, path.wallDist, -path.wallDist, { y: -3 }), cliffMat));
      }
      // Tremplins : bandes jaunes et noires
      for (const rp of path.ramps) {
        const range = [rp.from, rp.top];
        if (path.closed || (range[0] >= 0 && range[1] < path.n)) {
          G.add(new THREE.Mesh(this.ribbon(path, half, -half, { y: 0.12, range, vScale: 3 }), hazard));
        }
      }
    }

    // Ligne de départ + portique
    const m = this.main, sp = m.pts[0], h0 = m.heights[0], half = m.half;
    const start = new THREE.Mesh(new THREE.PlaneGeometry(this.def.width, 2.5), new THREE.MeshLambertMaterial({ map: checkerTexture(), polygonOffset: true, polygonOffsetFactor: -4 }));
    start.material.map.repeat.set(2, 1);
    start.rotation.x = -Math.PI / 2;
    start.rotation.z = this.headingAt(m, 0);
    start.position.set(sp.x, h0 + 0.12, sp.z);
    G.add(start);
    const arch = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: '#eeeeee' });
    for (const s of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), postMat);
      post.position.set(s * (half + 2), 3.5, 0);
      arch.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(this.def.width + 5, 1.6, 0.4), new THREE.MeshLambertMaterial({ map: checkerTexture() }));
    banner.material.map.repeat.set(6, 1);
    banner.position.y = 7;
    arch.add(banner);
    arch.position.set(sp.x, h0, sp.z);
    arch.rotation.y = this.headingAt(m, 0);
    G.add(arch);

    // Panneaux indiquant les embranchements
    for (const b of this.branches) this.addSign(b);

    // Ciel
    const r = this.rand;
    if (th.stars || th.night) {
      const sg = new THREE.BufferGeometry(), sv = [];
      const count = th.stars ? 2500 : 600;
      for (let i = 0; i < count; i++) {
        const R = 1500;
        if (th.stars) {
          const u = r() * Math.PI * 2, v = Math.acos(r() * 2 - 1);
          sv.push(R * Math.sin(v) * Math.cos(u), R * Math.cos(v) * 0.8, R * Math.sin(v) * Math.sin(u));
        } else {
          const u = r() * Math.PI * 2, v = r() * 1.2;
          sv.push(R * Math.cos(v) * Math.cos(u), 200 + R * Math.sin(v), R * Math.cos(v) * Math.sin(u));
        }
      }
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
      G.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: th.stars ? 2.2 : 1.5, sizeAttenuation: false, fog: false })));
    }

    this.buildScenery();
    this.buildItemBoxes();
    this.buildBoostPads();
  }

  addSign(b) {
    const m = this.main;
    const i = this.wrap(b.startIdx - 12);
    const side = (() => {
      // de quel côté part l'embranchement ?
      const q = b.pts[Math.min(b.n - 1, Math.round(b.n * 0.3))];
      const r = this.nearestOn(m, q.x, q.z);
      return Math.sign(r.lateral) || 1;
    })();
    const p = this.pointAt(m, i, side * (m.half + 3));
    const label = b.kind === 'shortcut' ? 'RACCOURCI' : 'ROUTE HAUTE';
    const tex = canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = b.kind === 'shortcut' ? '#2e7d32' : '#1565c0'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const arrow = side > 0 ? '➜' : '⬅';
      g.fillText(side > 0 ? `${label} ${arrow}` : `${arrow} ${label}`, w / 2, h / 2 + 2);
    }, false);
    const sign = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(5, 1.9, 0.2), [
      new THREE.MeshLambertMaterial({ color: '#555' }), new THREE.MeshLambertMaterial({ color: '#555' }),
      new THREE.MeshLambertMaterial({ color: '#555' }), new THREE.MeshLambertMaterial({ color: '#555' }),
      new THREE.MeshLambertMaterial({ map: tex, emissive: this.theme.night ? '#ffffff' : '#000000', emissiveMap: tex, emissiveIntensity: 0.5 }),
      new THREE.MeshLambertMaterial({ color: '#555' }),
    ]);
    board.position.y = 3.6;
    sign.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), new THREE.MeshLambertMaterial({ color: '#777' }));
    post.position.y = 1.5;
    sign.add(post);
    sign.position.set(p.x, p.y, p.z);
    // face aux pilotes qui arrivent
    sign.rotation.y = this.headingAt(m, i) + Math.PI;
    this.group.add(sign);
  }

  // Distance au bord le plus proche, exprimée comme si tous les chemins avaient la largeur de la boucle principale
  distToTrack(x, z) {
    let best = Infinity;
    for (const path of this.paths) {
      let d2 = Infinity;
      for (let i = 0; i < path.n; i += 2) {
        const p = path.pts[i];
        d2 = Math.min(d2, (p.x - x) ** 2 + (p.z - z) ** 2);
      }
      best = Math.min(best, Math.sqrt(d2) - (path.wallDist - this.wallDist));
    }
    return best;
  }

  buildScenery() {
    const th = this.theme, r = this.rand;
    const PROTOS = sceneryProtos(th);
    const instances = new Map(); // clé de partie -> {part, matrices, colors}
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3();
    const eul = new THREE.Euler();

    const place = (type, x, z, scale, rotY, y = 0) => {
      const proto = PROTOS[type];
      if (!proto) return;
      proto.parts.forEach((part, pi) => {
        const key = type + ':' + pi;
        if (!instances.has(key)) instances.set(key, { part, items: [] });
        const color = Array.isArray(part.color) ? part.color[Math.floor(r() * part.color.length)] : null;
        const sc = part.scale ? [scale * part.scale[0], scale * part.scale[1], scale * part.scale[2]] : [scale, scale, scale];
        const lp = part.pos || [0, 0, 0];
        const cos = Math.cos(rotY), sin = Math.sin(rotY);
        pv.set(x + (lp[0] * cos + lp[2] * sin) * scale, y + lp[1] * scale, z + (-lp[0] * sin + lp[2] * cos) * scale);
        eul.set(part.rot ? part.rot[0] : 0, rotY + (part.rot ? part.rot[1] : 0), part.rot ? part.rot[2] : 0, 'YXZ');
        q.setFromEuler(eul);
        s.set(...sc);
        m.compose(pv, q, s);
        instances.get(key).items.push({ m: m.clone(), color });
      });
    };

    const ringR0 = this.extent + 40;
    for (const [type, count] of Object.entries(th.scenery)) {
      const proto = PROTOS[type];
      if (!proto) continue;
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 40) {
        tries++;
        let x, z;
        if (proto.far) {
          const a = r() * Math.PI * 2, d = ringR0 + proto.far + r() * 160;
          x = Math.cos(a) * d; z = Math.sin(a) * d;
        } else {
          const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (this.extent + 70);
          x = Math.cos(a) * d; z = Math.sin(a) * d;
          if (this.distToTrack(x, z) < this.wallDist + (proto.clear || 3)) continue;
          if (th.water && Math.hypot(x, z) > this.extent + 80) continue;
        }
        const sc = proto.scale[0] + r() * (proto.scale[1] - proto.scale[0]);
        const y = proto.yRange ? proto.yRange[0] + r() * (proto.yRange[1] - proto.yRange[0]) : 0;
        place(type, x, z, sc, r() * Math.PI * 2, y);
        placed++;
      }
    }
    // Lampadaires le long de la piste (ville)
    if (th.scenery.lamp) {
      for (let i = 0; i < this.n; i += Math.round(36 / this.spacing)) {
        const side = (i / Math.round(36 / this.spacing)) % 2 ? 1 : -1;
        const p = this.pointAt(this.main, i, side * (this.wallDist - 0.8));
        place('lamp', p.x, p.z, 1, 0, p.y);
      }
    }

    for (const { part, items } of instances.values()) {
      const mat = part.material.clone();
      const hasColors = items.some((it) => it.color);
      if (hasColors) mat.color.set('#ffffff');
      const mesh = new THREE.InstancedMesh(part.geom, mat, items.length);
      items.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        if (hasColors) mesh.setColorAt(i, new THREE.Color(it.color || part.material.color));
      });
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
  }

  inZone(i) {
    return this.branches.some((b) => i > b.startIdx - 15 && i < b.endIdx + 15)
      || this.main.ramps.some((rp) => this.wrap(i - rp.from + 10) < rp.to - rp.from + 20);
  }

  freeIndex(f) {
    let i = Math.round(f * this.n);
    for (let k = 0; k < this.n && this.inZone(i); k++) i = this.wrap(i + 1);
    return i;
  }

  addBoxRow(path, i, count, spread) {
    const tex = this.boxTex || (this.boxTex = itemBoxTexture());
    const mat = this.boxMat || (this.boxMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.92, emissive: '#555', emissiveMap: tex }));
    const geom = this.boxGeom || (this.boxGeom = new THREE.BoxGeometry(1.6, 1.6, 1.6));
    for (let k = 0; k < count; k++) {
      const lat = (k - (count - 1) / 2) * spread;
      const p = this.pointAt(path, i, lat);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(p.x, p.y + 1.3, p.z);
      mesh.rotation.set(0.5, k, 0.5);
      this.group.add(mesh);
      this.itemBoxes.push({ x: p.x, y: p.y, z: p.z, path, i, lateral: lat, mesh, respawn: 0 });
    }
  }

  buildItemBoxes() {
    for (const f of [0.17, 0.48, 0.79]) this.addBoxRow(this.main, this.freeIndex(f), 5, this.half * 0.38);
    for (const b of this.branches) {
      if (b.kind === 'alt') this.addBoxRow(b, Math.round(b.n * 0.5), 3, b.half * 0.55);
    }
  }

  buildBoostPads() {
    const tex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#ffab00'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff176';
      for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.moveTo(8, 28 + i * 30); g.lineTo(w / 2, 4 + i * 30); g.lineTo(w - 8, 28 + i * 30);
        g.lineTo(w - 8, 38 + i * 30); g.lineTo(w / 2, 14 + i * 30); g.lineTo(8, 38 + i * 30);
        g.fill();
      }
    }, false);
    const mat = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -4 });
    const pad = (path, i, lat) => {
      const p = this.pointAt(path, i, lat);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = this.headingAt(path, i) + Math.PI;
      mesh.position.set(p.x, p.y + 0.13, p.z);
      this.group.add(mesh);
      this.boostPads.push({ x: p.x, y: p.y, z: p.z, path, i, lateral: lat });
    };
    for (const f of [0.33, 0.63, 0.92]) pad(this.main, this.freeIndex(f), (this.rand() - 0.5) * this.half);
    // élan avant le tremplin du raccourci
    for (const b of this.branches) {
      if (b.kind === 'shortcut' && b.ramps[0]) pad(b, b.ramps[0].from - 4, 0);
    }
  }

  update(dt, time) {
    for (const b of this.itemBoxes) {
      if (b.respawn > 0) {
        b.respawn -= dt;
        if (b.respawn <= 0) { b.mesh.visible = true; b.mesh.scale.setScalar(0.1); }
      }
      if (b.mesh.visible) {
        b.mesh.rotation.y += dt * 1.5;
        b.mesh.rotation.x += dt * 0.7;
        b.mesh.position.y = b.y + 1.3 + Math.sin(time * 2 + b.x) * 0.2;
        const sc = Math.min(1, b.mesh.scale.x + dt * 2);
        b.mesh.scale.setScalar(sc);
      }
    }
  }
}

// ---------- prototypes de décor (assemblés à partir de primitives) ----------
function sceneryProtos(th) {
  const L = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  const E = (color, intensity = 1) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity });
  const trunk = L('#7b5134');
  const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const winTex = th.scenery.building ? windowsTexture() : null;
  if (winTex) winTex.repeat.set(1, 3);
  return {
    tree: { scale: [0.8, 1.6], parts: [
      { geom: cyl(0.3, 0.45, 2.4), material: trunk, pos: [0, 1.2, 0] },
      { geom: new THREE.IcosahedronGeometry(2, 0), material: L('#2e7d32'), color: ['#2e7d32', '#388e3c', '#43a047', '#558b2f'], pos: [0, 3.6, 0] },
    ] },
    autumnTree: { scale: [0.8, 1.7], parts: [
      { geom: cyl(0.3, 0.45, 2.4), material: trunk, pos: [0, 1.2, 0] },
      { geom: new THREE.IcosahedronGeometry(2.1, 0), material: L('#e65100'), color: ['#e65100', '#ef6c00', '#f9a825', '#c62828', '#d84315'], pos: [0, 3.6, 0] },
    ] },
    pine: { scale: [0.9, 1.8], parts: [
      { geom: cyl(0.25, 0.35, 1.6), material: trunk, pos: [0, 0.8, 0] },
      { geom: new THREE.ConeGeometry(2, 4.5, 7), material: L('#1b5e20'), pos: [0, 3.6, 0] },
      { geom: new THREE.ConeGeometry(1.05, 1.8, 7), material: L('#ffffff'), pos: [0, 5.3, 0] },
    ] },
    palm: { scale: [0.9, 1.4], parts: [
      { geom: cyl(0.22, 0.35, 6.5, 6), material: L('#a1887f'), pos: [0.4, 3.2, 0], rot: [0, 0, -0.12] },
      { geom: new THREE.ConeGeometry(3.2, 1.2, 6), material: L('#43a047'), pos: [0.8, 6.4, 0], scale: [1, 0.6, 1] },
      { geom: new THREE.SphereGeometry(0.35, 6, 4), material: L('#6d4c41'), pos: [0.8, 6.0, 0.4] },
    ] },
    umbrella: { scale: [1, 1.3], clear: 2, parts: [
      { geom: cyl(0.07, 0.07, 2.6, 5), material: L('#ffffff'), pos: [0, 1.3, 0] },
      { geom: new THREE.ConeGeometry(1.8, 0.8, 8), material: L('#e53935'), color: ['#e53935', '#fdd835', '#1e88e5', '#ec407a', '#43a047'], pos: [0, 2.7, 0] },
    ] },
    rock: { scale: [0.6, 2.2], parts: [
      { geom: new THREE.DodecahedronGeometry(1.3, 0), material: L(th.night ? '#4e423d' : '#8d8d8d'), pos: [0, 0.5, 0], scale: [1.2, 0.8, 1] },
    ] },
    flower: { scale: [0.7, 1.3], clear: 1, parts: [
      { geom: cyl(0.05, 0.05, 0.6, 4), material: L('#33691e'), pos: [0, 0.3, 0] },
      { geom: new THREE.IcosahedronGeometry(0.3, 0), material: L('#ffeb3b'), color: ['#ffeb3b', '#f06292', '#ffffff', '#ba68c8', '#ff7043'], pos: [0, 0.65, 0] },
    ] },
    cactus: { scale: [0.8, 1.5], parts: [
      { geom: cyl(0.5, 0.55, 4.5, 8), material: L('#558b2f'), pos: [0, 2.25, 0] },
      { geom: cyl(0.32, 0.32, 1.8, 7), material: L('#558b2f'), pos: [1.0, 2.9, 0] },
      { geom: cyl(0.25, 0.25, 1.1, 6), material: L('#558b2f'), pos: [0.6, 2.1, 0], rot: [0, 0, Math.PI / 2] },
      { geom: cyl(0.3, 0.3, 1.4, 7), material: L('#558b2f'), pos: [-0.95, 2.3, 0] },
      { geom: cyl(0.22, 0.22, 1.0, 6), material: L('#558b2f'), pos: [-0.55, 1.7, 0], rot: [0, 0, Math.PI / 2] },
    ] },
    mesa: { scale: [1, 1.8], clear: 24, parts: [
      { geom: cyl(8, 11, 14, 7), material: L('#b5532a'), color: ['#b5532a', '#a0451f', '#c2683a'], pos: [0, 7, 0] },
    ] },
    snowman: { scale: [0.9, 1.3], parts: [
      { geom: new THREE.SphereGeometry(1.0, 10, 8), material: L('#ffffff'), pos: [0, 0.9, 0] },
      { geom: new THREE.SphereGeometry(0.7, 10, 8), material: L('#ffffff'), pos: [0, 2.2, 0] },
      { geom: new THREE.SphereGeometry(0.48, 10, 8), material: L('#ffffff'), pos: [0, 3.2, 0] },
      { geom: new THREE.ConeGeometry(0.12, 0.6, 6), material: L('#ff6d00'), pos: [0, 3.2, 0.6], rot: [Math.PI / 2, 0, 0] },
      { geom: cyl(0.35, 0.35, 0.5, 8), material: L('#212121'), pos: [0, 3.75, 0] },
    ] },
    mushroom: { scale: [0.9, 2], clear: 4, parts: [
      { geom: cyl(0.6, 0.8, 2.6, 8), material: L('#fff3e0'), pos: [0, 1.3, 0] },
      { geom: new THREE.SphereGeometry(2.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), material: L('#e53935'), color: ['#e53935', '#8e24aa', '#fb8c00'], pos: [0, 2.4, 0] },
      { geom: new THREE.SphereGeometry(0.35, 6, 4), material: L('#ffffff'), pos: [0.9, 4.15, 0.6] },
      { geom: new THREE.SphereGeometry(0.3, 6, 4), material: L('#ffffff'), pos: [-0.8, 4.2, -0.5] },
    ] },
    lava: { scale: [0.8, 2.2], clear: 4, parts: [
      { geom: new THREE.CylinderGeometry(4, 4.5, 0.2, 10), material: E('#ff5a00', 1.2), pos: [0, 0.06, 0] },
      { geom: new THREE.TorusGeometry(4.4, 0.7, 5, 12), material: L('#1e1715'), pos: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0] },
    ] },
    volcano: { scale: [1, 1], far: 60, parts: [
      { geom: new THREE.CylinderGeometry(18, 110, 120, 12), material: L('#2b1d18'), pos: [0, 60, 0] },
      { geom: new THREE.CylinderGeometry(16, 17, 2, 12), material: E('#ff6d00', 1.5), pos: [0, 120.5, 0] },
    ] },
    mountain: { scale: [0.8, 1.6], far: 40, parts: [
      { geom: new THREE.ConeGeometry(55, 80, 6), material: L(th.mountainColor), pos: [0, 40, 0] },
      ...(th.name === 'Neige' || th.name === 'Prairie' ? [{ geom: new THREE.ConeGeometry(17, 25, 6), material: L('#ffffff'), pos: [0, 68, 0] }] : []),
    ] },
    building: { scale: [0.6, 1.6], clear: 10, parts: [
      { geom: new THREE.BoxGeometry(10, 1, 10), material: new THREE.MeshLambertMaterial({ color: '#555577', map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.9 }),
        color: ['#4a4a6a', '#3a3a55', '#5a4a6a', '#2f3f5f'], pos: [0, 15, 0], scale: [1, 30, 1] },
    ] },
    lamp: { scale: [1, 1], parts: [
      { geom: cyl(0.12, 0.15, 6, 5), material: L('#555'), pos: [0, 3, 0] },
      { geom: new THREE.SphereGeometry(0.45, 8, 6), material: E('#ffe082', 1.5), pos: [0, 6.1, 0] },
    ] },
    crystal: { scale: [0.8, 2.4], clear: 4, yRange: [0, 8], parts: [
      { geom: new THREE.OctahedronGeometry(1.5, 0), material: E('#b388ff', 0.6), color: ['#b388ff', '#40c4ff', '#ff4081', '#69f0ae', '#ffd740'], pos: [0, 2, 0], scale: [0.6, 1.8, 0.6] },
    ] },
    planet: { scale: [10, 30], far: 120, yRange: [60, 180], parts: [
      { geom: new THREE.SphereGeometry(1, 20, 14), material: E('#7e57c2', 0.35), color: ['#7e57c2', '#ef5350', '#26c6da', '#ffca28', '#66bb6a'], pos: [0, 0, 0] },
    ] },
  };
}

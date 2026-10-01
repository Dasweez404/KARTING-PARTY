import * as THREE from 'three';
import { THEMES } from './data.js';
import { buildCenterline, OFFROAD } from './shape.js';

// Petit générateur pseudo-aléatoire déterministe (pour que chaque circuit ait toujours le même décor).
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

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

function roadTexture(rainbow) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = rainbow ? '#ffffff' : '#ffffff';
    g.fillRect(0, 0, w, h);
    const r = rng(42);
    for (let i = 0; i < 1800; i++) {
      const v = 200 + Math.floor(r() * 55);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
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
    const cl = buildCenterline(def);
    Object.assign(this, cl);
    this.half = def.width / 2;
    this.wallDist = this.half + OFFROAD;
    this.group = new THREE.Group();
    this.rand = rng(hashStr(id));
    let maxR = 0;
    for (const p of this.pts) maxR = Math.max(maxR, Math.hypot(p.x, p.z));
    this.extent = maxR;
    this.itemBoxes = [];
    this.boostPads = [];
    this.animated = [];
    this.build();
  }

  // ---------- requêtes géométriques ----------
  nearest(x, z, hint) {
    const n = this.n;
    let best = -1, bestD = Infinity;
    if (hint === undefined || hint < 0) {
      for (let i = 0; i < n; i++) {
        const p = this.pts[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let k = -25; k <= 25; k++) {
        const i = (hint + k + n) % n;
        const p = this.pts[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    const p = this.pts[best], nm = this.normals[best];
    const lateral = (x - p.x) * nm.x + (z - p.z) * nm.z;
    return { idx: best, lateral };
  }

  pointAt(idx, lateral = 0) {
    const i = ((Math.round(idx) % this.n) + this.n) % this.n;
    const p = this.pts[i], nm = this.normals[i];
    return { x: p.x + nm.x * lateral, z: p.z + nm.z * lateral };
  }

  headingAt(idx) {
    const i = ((Math.round(idx) % this.n) + this.n) % this.n;
    const t = this.tangents[i];
    return Math.atan2(t.x, t.z);
  }

  wrap(i) { return ((i % this.n) + this.n) % this.n; }

  // ---------- construction de la scène ----------
  ribbon(offA, offB, y, opts = {}) {
    const n = this.n;
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const k = i % n, p = this.pts[k], nm = this.normals[k];
      const yA = opts.vertical ? opts.y0 : y, yB = opts.vertical ? opts.y1 : y;
      const oA = offA, oB = opts.vertical ? offA : offB;
      pos.push(p.x + nm.x * oA, yA, p.z + nm.z * oA, p.x + nm.x * oB, yB, p.z + nm.z * oB);
      const v = (i * this.spacing) / (opts.vScale || 8);
      uv.push(0, v, 1, v);
      if (opts.colorFn) { const c = opts.colorFn(k); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      if (i < n) {
        const a = i * 2;
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

  build() {
    const th = this.theme, G = this.group, r = this.rand;
    const half = this.half;

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

    // Route
    const rainbow = th.road === 'rainbow';
    const roadMat = new THREE.MeshLambertMaterial({
      map: roadTexture(rainbow), color: rainbow ? '#ffffff' : th.road, vertexColors: rainbow,
    });
    if (rainbow) { roadMat.emissive = new THREE.Color('#222'); }
    const colorFn = rainbow ? (k) => new THREE.Color().setHSL((k / this.n) * 6 % 1, 0.85, 0.55) : undefined;
    const road = new THREE.Mesh(this.ribbon(half, -half, 0.08, { colorFn, vScale: 16 }), roadMat);
    road.receiveShadow = true;
    G.add(road);

    // Bordures (vibreurs)
    const curbMat = new THREE.MeshLambertMaterial({ map: stripeTexture(th.walls[0], th.walls[1]) });
    for (const s of [1, -1]) {
      const curb = new THREE.Mesh(this.ribbon(s * half, s * (half + 1.4), 0.1, { vScale: 6 }), curbMat);
      curb.receiveShadow = true;
      G.add(curb);
    }
    // Bas-côtés
    const shMat = new THREE.MeshLambertMaterial({ color: th.shoulder, side: THREE.DoubleSide });
    for (const s of [1, -1]) {
      G.add(new THREE.Mesh(this.ribbon(s * (half + 1.4), s * this.wallDist, 0.05), shMat));
    }
    // Murs
    const wallTex = stripeTexture(th.walls[0], th.walls[1]);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide });
    if (th.night) { wallMat.emissive = new THREE.Color('#ffffff'); wallMat.emissiveMap = wallTex; wallMat.emissiveIntensity = 0.6; }
    for (const s of [1, -1]) {
      const wall = new THREE.Mesh(this.ribbon(s * this.wallDist, 0, 0, { vertical: true, y0: 0, y1: 1.3, vScale: 5 }), wallMat);
      G.add(wall);
    }

    // Ligne de départ + portique
    const start = new THREE.Mesh(new THREE.PlaneGeometry(this.def.width, 2.5), new THREE.MeshLambertMaterial({ map: checkerTexture() }));
    start.material.map.repeat.set(2, 1);
    const sp = this.pts[0];
    start.rotation.x = -Math.PI / 2;
    start.rotation.z = this.headingAt(0);
    start.position.set(sp.x, 0.12, sp.z);
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
    arch.position.set(sp.x, 0, sp.z);
    arch.rotation.y = this.headingAt(0);
    G.add(arch);

    // Ciel
    if (th.stars) {
      const sg = new THREE.BufferGeometry(), sv = [];
      for (let i = 0; i < 2500; i++) {
        const u = r() * Math.PI * 2, v = Math.acos(r() * 2 - 1), R = 1500;
        sv.push(R * Math.sin(v) * Math.cos(u), R * Math.cos(v) * 0.8, R * Math.sin(v) * Math.sin(u));
      }
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
      G.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false })));
    } else if (th.night) {
      const sg = new THREE.BufferGeometry(), sv = [];
      for (let i = 0; i < 600; i++) {
        const u = r() * Math.PI * 2, v = r() * 1.2, R = 1500;
        sv.push(R * Math.cos(v) * Math.cos(u), 200 + R * Math.sin(v), R * Math.cos(v) * Math.sin(u));
      }
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
      G.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.5, sizeAttenuation: false, fog: false })));
    }

    this.buildScenery();
    this.buildItemBoxes();
    this.buildBoostPads();
  }

  distToTrack(x, z) {
    let best = Infinity;
    for (let i = 0; i < this.n; i += 2) {
      const p = this.pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
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
        const p = this.pointAt(i, side * (this.wallDist + 1.5));
        place('lamp', p.x, p.z, 1, 0);
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

  buildItemBoxes() {
    const tex = itemBoxTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.92, emissive: '#555', emissiveMap: tex });
    const geom = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    for (const f of [0.17, 0.48, 0.79]) {
      const idx = Math.round(f * this.n);
      for (let k = 0; k < 5; k++) {
        const lat = (k - 2) * (this.half * 0.38);
        const p = this.pointAt(idx, lat);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(p.x, 1.3, p.z);
        mesh.rotation.set(0.5, k, 0.5);
        this.group.add(mesh);
        this.itemBoxes.push({ x: p.x, z: p.z, mesh, respawn: 0 });
      }
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
    tex.center.set(0.5, 0.5);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    for (const f of [0.33, 0.63, 0.92]) {
      const idx = Math.round(f * this.n);
      const lat = (this.rand() - 0.5) * this.half;
      const p = this.pointAt(idx, lat);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), mat);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = this.headingAt(idx) + Math.PI;
      pad.position.set(p.x, 0.13, p.z);
      this.group.add(pad);
      this.boostPads.push({ x: p.x, z: p.z, idx, heading: this.headingAt(idx) });
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
        b.mesh.position.y = 1.3 + Math.sin(time * 2 + b.x) * 0.2;
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

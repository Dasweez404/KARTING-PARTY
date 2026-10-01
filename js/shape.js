// Génération géométrique pure (sans Three.js) du réseau de routes d'un circuit :
// boucle principale avec relief + embranchements (raccourcis, routes alternatives) + tremplins.

export const OFFROAD = 8;        // largeur d'herbe/sable entre la route principale et le mur
export const BRANCH_OFFROAD = 3; // bas-côtés plus étroits sur les embranchements
export const RAMP_RISE = 6;      // nombre d'échantillons de montée d'un tremplin
export const RAMP_FALL = 4;
export const RAMP_HEIGHT = 2.4;

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Rééchantillonne une polyligne dense à pas constant.
function resample(raw, closed, spacing) {
  const N = raw.length, segs = closed ? N : N - 1;
  const cum = [0];
  for (let i = 1; i <= segs; i++) {
    const a = raw[i - 1], b = raw[i % N];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cum[segs];
  const n = closed ? Math.round(length / spacing) : Math.max(2, Math.round(length / spacing) + 1);
  const pts = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = closed ? (i / n) * length : (i / (n - 1)) * length;
    while (j < segs - 1 && cum[j + 1] < d) j++;
    const a = raw[j], b = raw[(j + 1) % N];
    const u = Math.min(1, (d - cum[j]) / (cum[j + 1] - cum[j] || 1));
    pts.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });
  }
  return { pts, length };
}

// Calcule tangentes, normales (vers la droite du pilote) et courbure.
function finishPath(pts, closed, length) {
  const n = pts.length;
  const at = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const tangents = [], normals = [], curvature = [];
  for (let i = 0; i < n; i++) {
    const p = at(i - 1), q = at(i + 1);
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    tangents.push({ x: dx / l, z: dz / l });
    normals.push({ x: -dz / l, z: dx / l });
  }
  const spacing = length / (closed ? n : n - 1);
  const tat = (i) => closed ? tangents[(i + n) % n] : tangents[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n; i++) {
    const a = tat(i - 2), b = tat(i + 2);
    curvature.push((a.x * b.z - a.z * b.x) / (4 * spacing));
  }
  return { pts, tangents, normals, curvature, n, closed, length, spacing, heights: new Array(n).fill(0), ramps: [] };
}

export function buildCenterline(def, spacing = 2) {
  const DENSE = 6000;
  const raw = [];
  for (let i = 0; i < DENSE; i++) {
    const t = (i / DENSE) * Math.PI * 2;
    let f = 1;
    for (const [k, a, ph] of def.harm) f += a * Math.sin(k * t + ph);
    const r = def.R * f;
    raw.push({ x: Math.cos(t) * r * def.sx, z: Math.sin(t) * r * def.sz });
  }
  const { pts, length } = resample(raw, true, spacing);
  const tmp = finishPath(pts, true, length);
  // Ligne de départ au milieu de la plus longue portion droite
  const n = tmp.n, W = Math.round(60 / tmp.spacing);
  let best = 0, bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -W; k <= W; k++) s += Math.abs(tmp.curvature[(i + k + n) % n]);
    if (s < bestScore) { bestScore = s; best = i; }
  }
  const rot = pts.slice(best).concat(pts.slice(0, best));
  return finishPath(rot, true, length);
}

function cubicBranch(main, s, e, side, O, spacing = 2) {
  const A = main.pts[s], B = main.pts[e], tA = main.tangents[s], tB = main.tangents[e];
  const nA = main.normals[s], nB = main.normals[e];
  const L = Math.hypot(B.x - A.x, B.z - A.z) * 0.4;
  const P1 = { x: A.x + tA.x * L + nA.x * side * O, z: A.z + tA.z * L + nA.z * side * O };
  const P2 = { x: B.x - tB.x * L + nB.x * side * O, z: B.z - tB.z * L + nB.z * side * O };
  const raw = [];
  for (let i = 0; i <= 400; i++) {
    const t = i / 400, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    raw.push({ x: a * A.x + b * P1.x + c * P2.x + d * B.x, z: a * A.z + b * P1.z + c * P2.z + d * B.z });
  }
  const { pts, length } = resample(raw, false, spacing);
  return finishPath(pts, false, length);
}

// Vérifie qu'un embranchement ne quitte la route principale qu'à ses extrémités
// et ne touche rien d'autre ensuite.
function branchClear(br, main, s, e, others) {
  const need = br.wallDist + main.wallDist + 1.5;
  const bn = br.n, span = e - s;
  const clear = new Array(bn), nearest = new Array(bn);
  for (let j = 0; j < bn; j++) {
    const p = br.pts[j];
    let best = Infinity, bi = 0;
    for (let k = 0; k < main.n; k += 2) {
      const q = main.pts[k];
      const d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
      if (d < best) { best = d; bi = k; }
    }
    clear[j] = Math.sqrt(best) >= need;
    nearest[j] = bi;
  }
  let j1 = clear.indexOf(true), j2 = clear.lastIndexOf(true);
  if (j1 < 0 || j1 > 0.35 * (bn - 1) || j2 < 0.65 * (bn - 1)) return false;
  for (let j = j1; j <= j2; j++) if (!clear[j]) return false;
  for (let j = 0; j < j1; j++) if (nearest[j] < s - 12 || nearest[j] > s + span * 0.5) return false;
  for (let j = j2 + 1; j < bn; j++) if (nearest[j] < e - span * 0.5 || nearest[j] > e + 12) return false;
  for (let j = 0; j < bn; j++) if (Math.abs(br.curvature[j]) > 1 / (br.wallDist + 1)) return false;
  for (const o of others) {
    const need2 = br.wallDist + o.wallDist + 2;
    for (let j = 0; j < bn; j += 2) for (let k = 0; k < o.n; k += 2) {
      if ((br.pts[j].x - o.pts[k].x) ** 2 + (br.pts[j].z - o.pts[k].z) ** 2 < need2 * need2) return false;
    }
  }
  return true;
}

function addRamp(path, top, height = RAMP_HEIGHT) {
  for (let j = -RAMP_RISE; j <= RAMP_FALL; j++) {
    const i = path.closed ? (top + j + path.n) % path.n : top + j;
    if (i < 0 || i >= path.n) continue;
    const f = j <= 0 ? (j + RAMP_RISE) / RAMP_RISE : 1 - j / RAMP_FALL;
    path.heights[i] += height * f;
  }
  path.ramps.push({ from: top - RAMP_RISE, top, to: top + RAMP_FALL });
}

function makeBranchPath(main, s, e, side, O, width, kind) {
  const br = cubicBranch(main, s, e, side, O);
  br.half = width / 2;
  br.wallDist = br.half + BRANCH_OFFROAD;
  br.kind = kind;
  br.startIdx = s; br.endIdx = e; br.span = e - s;
  return br;
}

// Construit le réseau complet d'un circuit.
export function buildNetwork(def, id = def.name) {
  const main = buildCenterline(def);
  main.half = def.width / 2;
  main.wallDist = main.half + OFFROAD;
  main.kind = 'main';
  const n = main.n, r = rng(hashStr(id));
  const branches = [];
  const lo = Math.round(0.1 * n), hi = Math.round(0.9 * n);
  const sp = main.spacing;

  // 1) Raccourci : chemin de terre étroit qui coupe un virage, avec un tremplin
  let best = null;
  for (let s = lo; s < hi; s += 6) {
    for (const f of [0.1, 0.14, 0.18, 0.22, 0.27, 0.32]) {
      const e = s + Math.round(f * n);
      if (e > hi) continue;
      for (const O of [0, 6, -6]) {
        const br = makeBranchPath(main, s, e, 1, O, 9, 'shortcut');
        const mainLen = (e - s) * sp, saving = mainLen - br.length;
        if (br.length > 0.8 * mainLen || saving > 110 || br.length < 50) continue;
        if (best && saving <= best.saving) continue;
        if (!branchClear(br, main, s, e, [])) continue;
        best = { br, saving };
      }
    }
  }
  if (best) branches.push(best.br);

  // 2) Route alternative surélevée : la route se divise en deux voies de longueur proche
  const zones = () => branches.map((b) => [b.startIdx - 15, b.endIdx + 15]);
  let alt = null;
  for (let s = lo; s < hi && !alt; s += 5) {
    for (const f of [0.12, 0.16, 0.2, 0.25, 0.3]) {
      const e = s + Math.round(f * n);
      if (e > hi || zones().some(([a, b]) => !(e < a || s > b))) continue;
      for (const O of [45, 35, 25, 60]) {
        for (const side of [1, -1]) {
          const br = makeBranchPath(main, s, e, side, O, def.width * 0.8, 'alt');
          const ratio = br.length / ((e - s) * sp);
          if (ratio < 0.92 || ratio > 1.25) continue;
          if (!branchClear(br, main, s, e, branches)) continue;
          alt = br; break;
        }
        if (alt) break;
      }
      if (alt) break;
    }
  }
  if (alt) branches.push(alt);

  // 3) Relief de la boucle principale
  const relief = def.relief ?? 6;
  const harm = [[1, 0.35], [2, 0.4], [3, 0.25], [5, 0.12]].map(([k, w]) => [k, relief * w * (0.6 + 0.8 * r()), r() * Math.PI * 2]);
  const h = main.heights;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    let v = 0;
    for (const [k, a, ph] of harm) v += a * Math.sin(Math.PI * 2 * k * u + ph);
    const d = Math.min(i, n - i) * sp;
    h[i] = v * (1 - Math.exp(-((d / 70) ** 2))); // grille de départ à plat
  }
  let maxSlope = 0;
  for (let i = 0; i < n; i++) maxSlope = Math.max(maxSlope, Math.abs(h[(i + 1) % n] - h[i]) / sp);
  const k = maxSlope > 0.13 ? 0.13 / maxSlope : 1;
  let minH = Infinity;
  for (let i = 0; i < n; i++) { h[i] *= k; minH = Math.min(minH, h[i]); }
  for (let i = 0; i < n; i++) h[i] -= minH;

  // 4) Hauteurs des embranchements : même profil que la portion de boucle qu'ils remplacent (+ pont pour la route haute)
  for (const br of branches) {
    const own = [], wts = [], nearH = [];
    const bridge = Math.min(7, br.length * 0.04);
    for (let j = 0; j < br.n; j++) {
      const t = j / (br.n - 1);
      own.push(h[(br.startIdx + Math.round(t * br.span)) % n] + (br.kind === 'alt' ? bridge * Math.sin(Math.PI * t) ** 2 : 0));
      const p = br.pts[j];
      let best = Infinity, bi = 0;
      for (let k = 0; k < n; k++) {
        const d = (p.x - main.pts[k].x) ** 2 + (p.z - main.pts[k].z) ** 2;
        if (d < best) { best = d; bi = k; }
      }
      // tant que les deux couloirs se touchent, l'embranchement suit exactement la hauteur de la boucle
      // (sinon un kart passerait d'une route à l'autre avec une marche) ; il s'en écarte ensuite progressivement
      const u = Math.max(0, Math.min(1, (Math.sqrt(best) - (main.wallDist + br.wallDist + 1)) / 25));
      wts.push(1 - u * u * (3 - 2 * u));
      nearH.push(h[bi]);
    }
    for (let pass = 0; pass < 6; pass++) {
      for (let j = 1; j < br.n - 1; j++) own[j] = (own[j - 1] + own[j] * 2 + own[j + 1]) / 4;
    }
    for (let j = 0; j < br.n; j++) br.heights[j] = wts[j] * nearH[j] + (1 - wts[j]) * own[j];
    for (let pass = 0; pass < 4; pass++) {
      const hh = br.heights.slice();
      for (let j = 1; j < br.n - 1; j++) if (wts[j] < 0.98) br.heights[j] = (hh[j - 1] + hh[j] * 2 + hh[j + 1]) / 4;
    }
    // limiteur de pente sur la partie libre de l'embranchement
    const maxStep = 0.2 * br.spacing;
    for (let pass = 0; pass < 60; pass++) {
      for (let j = 1; j < br.n - 1; j++) {
        if (wts[j] >= 0.98) continue;
        const a = br.heights[j - 1], c = br.heights[j + 1];
        const lo = Math.max(a, c) - maxStep, hi = Math.min(a, c) + maxStep;
        br.heights[j] = lo <= hi ? Math.max(lo, Math.min(hi, br.heights[j])) : (a + c) / 2;
      }
    }
    if (br.kind === 'shortcut') addRamp(br, Math.round(br.n * 0.55));
  }

  // 5) Tremplin sur la boucle principale, dans une portion droite hors embranchements
  const banned = (i) => i < 0.2 * n || i > 0.8 * n || branches.some((b) => i > b.startIdx - 30 && i < b.endIdx + 30);
  let rampAt = -1, rampScore = Infinity;
  for (let i = 0; i < n; i++) {
    if (banned(i)) continue;
    let s = 0;
    for (let j = -15; j <= 15; j++) s += Math.abs(main.curvature[(i + j + n) % n]);
    if (s < rampScore) { rampScore = s; rampAt = i; }
  }
  if (rampAt >= 0) addRamp(main, rampAt);

  return { main, branches, paths: [main, ...branches] };
}

// Vérifie que la boucle principale ne se chevauche pas (utilisé par le test).
export function validateCenterline(def, cl) {
  const half = def.width / 2;
  const needed = 2 * (half + OFFROAD) + 6;
  const skip = Math.ceil((needed * 2.5) / cl.spacing);
  let minDist = Infinity, maxCurv = 0;
  for (let i = 0; i < cl.n; i++) {
    maxCurv = Math.max(maxCurv, Math.abs(cl.curvature[i]));
    for (let j = i + skip; j < cl.n; j++) {
      if (cl.n - (j - i) < skip) continue;
      const d = Math.hypot(cl.pts[i].x - cl.pts[j].x, cl.pts[i].z - cl.pts[j].z);
      if (d < minDist) minDist = d;
    }
  }
  const minRadius = 1 / maxCurv;
  return { ok: minDist > needed && minRadius > half + OFFROAD + 2, minDist, needed, minRadius, length: cl.length };
}

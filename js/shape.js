// Génération géométrique pure (sans Three.js) de la ligne centrale d'un circuit.

export const OFFROAD = 8; // largeur d'herbe/sable entre la route et le mur

// Retourne { pts: [{x,z}], tangents: [{x,z}], normals: [{x,z}], curvature: [], length, spacing }
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
  // longueur cumulée
  const cum = [0];
  for (let i = 1; i <= DENSE; i++) {
    const a = raw[i - 1], b = raw[i % DENSE];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cum[DENSE];
  const n = Math.round(length / spacing);
  const pts = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * length;
    while (cum[j + 1] < d) j++;
    const a = raw[j], b = raw[(j + 1) % DENSE];
    const u = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    pts.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });
  }
  const tangents = [], normals = [], curvature = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], q = pts[(i + 1) % n];
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    tangents.push({ x: dx / l, z: dz / l });
    normals.push({ x: -dz / l, z: dx / l }); // vers la droite du pilote
  }
  for (let i = 0; i < n; i++) {
    const a = tangents[(i - 2 + n) % n], b = tangents[(i + 2) % n];
    const cross = a.x * b.z - a.z * b.x;
    curvature.push(cross / (4 * (length / n)));
  }
  // Ligne de départ au milieu de la plus longue portion droite
  const W = Math.round(60 / (length / n));
  let best = 0, bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -W; k <= W; k++) s += Math.abs(curvature[(i + k + n) % n]);
    if (s < bestScore) { bestScore = s; best = i; }
  }
  const rot = (arr) => arr.slice(best).concat(arr.slice(0, best));
  return {
    pts: rot(pts), tangents: rot(tangents), normals: rot(normals), curvature: rot(curvature),
    length, spacing: length / n, n,
  };
}

// Vérifie que le circuit ne se chevauche pas (utilisé par le test).
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

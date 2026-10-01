import { TRACKS } from '../js/data.js';
import { buildCenterline, validateCenterline, buildNetwork } from '../js/shape.js';

let fail = 0;
for (const [id, def] of Object.entries(TRACKS)) {
  const t0 = Date.now();
  const r = validateCenterline(def, buildCenterline(def));
  const net = buildNetwork(def, id);
  const kinds = net.branches.map((b) => `${b.kind}(${b.length.toFixed(0)}m/${((b.endIdx - b.startIdx) * net.main.spacing).toFixed(0)}m)`);
  const hmax = Math.max(...net.main.heights);
  const slope = (p) => {
    let m = 0;
    for (let i = 0; i < p.n - 1; i++) {
      if (p.ramps.some((r) => i >= r.from - 1 && i <= r.to)) continue;
      m = Math.max(m, Math.abs(p.heights[i + 1] - p.heights[i]) / p.spacing);
    }
    return m;
  };
  const maxSlope = Math.max(...net.paths.map(slope));
  const ok = r.ok && net.branches.length === 2 && net.main.ramps.length === 1 && maxSlope < 0.3;
  console.log(`${ok ? 'OK ' : 'BAD'} ${id.padEnd(10)} len=${r.length.toFixed(0)} minDist=${r.minDist.toFixed(1)}/${r.needed} relief=${hmax.toFixed(1)}m pente=${maxSlope.toFixed(2)} ${kinds.join(' ')} ${Date.now() - t0}ms`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);

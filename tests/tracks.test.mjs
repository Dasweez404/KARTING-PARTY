import { TRACKS } from '../js/data.js';
import { buildCenterline, validateCenterline } from '../js/shape.js';
let fail = 0;
for (const [id, def] of Object.entries(TRACKS)) {
  const r = validateCenterline(def, buildCenterline(def));
  console.log(`${r.ok ? 'OK ' : 'BAD'} ${id.padEnd(10)} len=${r.length.toFixed(0)} minDist=${r.minDist.toFixed(1)}/${r.needed} minR=${r.minRadius.toFixed(1)}`);
  if (!r.ok) fail++;
}
process.exit(fail ? 1 : 0);

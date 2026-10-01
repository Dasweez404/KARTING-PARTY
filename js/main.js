import * as THREE from 'three';
import { KARTS, COLORS, CUPS, TRACKS, THEMES, DIFFICULTIES, BOTS, POINTS, LAPS } from './data.js';
import { Race, formatTime, ordinal } from './race.js';
import { Track } from './track.js';
import { buildKartModel } from './kart.js';
import { Input } from './input.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

// ---------- moteur ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const input = new Input();
const audio = new Audio();

const state = {
  mode: 'cup',          // 'cup' | 'single'
  kartId: 'equilibre',
  color: store.get('kp-color', COLORS[0]),
  name: store.get('kp-name', ''),
  difficulty: DIFFICULTIES[1],
  race: null,
  champ: null,
  lastTrack: null,
};
const savedKart = store.get('kp-kart', null);
if (KARTS.some((k) => k.id === savedKart)) state.kartId = savedKart;

// ---------- décor du menu ----------
const menu = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 3000), t: 0 };
function buildMenuScene(trackId) {
  menu.scene = new THREE.Scene();
  const track = new Track(trackId, TRACKS[trackId]);
  const th = track.theme;
  menu.scene.background = new THREE.Color(th.sky);
  menu.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar * 1.4);
  menu.scene.add(track.group);
  menu.scene.add(new THREE.HemisphereLight('#ffffff', th.ground, th.ambient + 0.2));
  const sun = new THREE.DirectionalLight('#ffffff', th.light * 1.4);
  sun.position.set(100, 200, 50);
  menu.scene.add(sun);
  // quelques karts sur la grille
  for (let i = 0; i < 6; i++) {
    const m = buildKartModel(KARTS[i % KARTS.length].shape, BOTS[i].color);
    const idx = track.n - 6 - Math.floor(i / 2) * 4;
    const p = track.pointAt(track.main, idx, (i % 2 ? 1 : -1) * track.half * 0.45);
    m.position.set(p.x, p.y + 0.1, p.z);
    m.rotation.y = track.headingAt(track.main, idx);
    menu.scene.add(m);
  }
  menu.track = track;
}
buildMenuScene('collines');

// ---------- aperçu du kart ----------
const preview = (() => {
  const c = $('kart-preview');
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#445', 1.2));
  const d = new THREE.DirectionalLight('#ffffff', 1.6); d.position.set(3, 6, 4); scene.add(d);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.2, 40), new THREE.MeshStandardMaterial({ color: '#2a2f55', roughness: 0.6 }));
  floor.position.y = -0.1; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(40, c.width / c.height, 0.1, 100);
  cam.position.set(4.6, 3.0, 5.2); cam.lookAt(0, 0.6, 0);
  let model = null;
  return {
    set(shape, color) {
      if (model) scene.remove(model);
      model = buildKartModel(shape, color);
      scene.add(model);
    },
    render(dt) {
      if (!model) return;
      model.rotation.y += dt * 0.8;
      r.setSize(c.clientWidth || 420, c.clientHeight || 300, false);
      cam.aspect = (c.clientWidth || 420) / (c.clientHeight || 300);
      cam.updateProjectionMatrix();
      r.render(scene, cam);
    },
  };
})();

// ---------- navigation ----------
let currentScreen = 'title';
function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  if (name) $('screen-' + name).classList.remove('hidden');
  currentScreen = name;
}

function trophySummary() {
  const t = store.get('kp-trophies', {});
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const parts = [];
  for (const cup of CUPS) {
    for (const d of DIFFICULTIES) {
      const r = t[`${cup.id}-${d.id}`];
      if (r && r <= 3) parts.push(medals[r]);
    }
  }
  $('trophy-summary').textContent = parts.length ? `Trophées : ${parts.join(' ')}` : '';
}

function buildKartScreen() {
  const list = $('kart-list');
  list.innerHTML = '';
  for (const k of KARTS) {
    const b = document.createElement('button');
    b.textContent = k.name;
    b.className = k.id === state.kartId ? 'selected' : '';
    b.onclick = () => { audio.play('click'); state.kartId = k.id; buildKartScreen(); };
    list.appendChild(b);
  }
  const kart = KARTS.find((k) => k.id === state.kartId);
  $('kart-desc').textContent = kart.desc;
  const labels = { speed: 'Vitesse', accel: 'Accélération', handling: 'Maniabilité', weight: 'Poids' };
  $('kart-stats').innerHTML = Object.entries(labels).map(([key, label]) =>
    `<div class="stat"><span>${label}</span><div class="bar"><div style="width:${Math.round(kart.stats[key] * 100)}%"></div></div></div>`).join('');
  const cl = $('color-list');
  cl.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.style.background = c;
    b.className = c === state.color ? 'selected' : '';
    b.setAttribute('aria-label', 'Couleur ' + c);
    b.onclick = () => { audio.play('click'); state.color = c; buildKartScreen(); };
    cl.appendChild(b);
  }
  $('player-name').value = state.name;
  preview.set(kart.shape, state.color);
}

function buildSelectScreen() {
  const dl = $('difficulty-list');
  dl.innerHTML = '';
  for (const d of DIFFICULTIES) {
    const b = document.createElement('button');
    b.innerHTML = `${d.name}<small>${d.desc}</small>`;
    b.className = d.id === state.difficulty.id ? 'selected' : '';
    b.onclick = () => { audio.play('click'); state.difficulty = d; buildSelectScreen(); };
    dl.appendChild(b);
  }
  const list = $('cup-list');
  list.innerHTML = '';
  const trophies = store.get('kp-trophies', {});
  const best = store.get('kp-best', {});
  if (state.mode === 'cup') {
    $('select-title').textContent = 'Choisis une coupe';
    for (const cup of CUPS) {
      const b = document.createElement('button');
      b.className = 'cup';
      const r = trophies[`${cup.id}-${state.difficulty.id}`];
      b.innerHTML = `<span class="cup-icon">${cup.icon}</span><span class="cup-name">${cup.name}</span>
        <ol>${cup.tracks.map((t) => `<li>${TRACKS[t].name}</li>`).join('')}</ol>
        <span class="cup-trophy">${r ? `Meilleur résultat : ${ordinal(r)} ${r <= 3 ? ['🥇', '🥈', '🥉'][r - 1] : ''}` : ''}</span>`;
      b.onclick = () => startChampionship(cup);
      list.appendChild(b);
    }
  } else {
    $('select-title').textContent = 'Choisis un circuit';
    for (const cup of CUPS) for (const id of cup.tracks) {
      const t = TRACKS[id], th = THEMES[t.theme];
      const b = document.createElement('button');
      b.className = 'track-card';
      const ground = th.noGround ? th.shoulder : th.ground;
      b.innerHTML = `<div class="swatch" style="background:linear-gradient(180deg, ${th.sky} 0 50%, ${ground} 50% 100%)"></div>
        <span class="tname">${t.name}</span><span class="tinfo">${cup.icon} ${th.name}${best[id] ? ` · record ${formatTime(best[id])}` : ''}</span>`;
      b.onclick = () => startSingle(id);
      list.appendChild(b);
    }
  }
}

// ---------- courses ----------
function makeOpponents() {
  return BOTS.map((b) => ({ name: b.name, color: b.color, kartId: KARTS[Math.floor(Math.random() * KARTS.length)].id }));
}

function playerCfg() {
  return { name: state.name || 'Toi', color: state.color, kartId: state.kartId };
}

function startRace(trackId, opponents) {
  audio.init();
  show(null);
  $('loading').classList.remove('hidden');
  // laisse le navigateur afficher l'écran de chargement
  setTimeout(() => {
    if (state.race) state.race.dispose();
    state.lastTrack = trackId;
    state.lastOpponents = opponents;
    state.race = new Race({
      renderer, trackId, player: playerCfg(), opponents, difficulty: state.difficulty, audio, input,
      onFinish: (results, info) => onRaceFinished(results, info),
    });
    $('loading').classList.add('hidden');
  }, 30);
}

function startChampionship(cup) {
  audio.play('click');
  const opponents = makeOpponents();
  const standings = {};
  for (const o of [...opponents, { ...playerCfg(), isPlayer: true }]) {
    standings[o.name] = { name: o.name, color: o.color, points: 0, isPlayer: !!o.isPlayer };
  }
  state.champ = { cup, index: 0, opponents, standings };
  startRace(cup.tracks[0], opponents);
}

function startSingle(trackId) {
  audio.play('click');
  state.champ = null;
  startRace(trackId, makeOpponents());
}

function onRaceFinished(results, info) {
  const race = state.race;
  // records
  const best = store.get('kp-best', {});
  const me = results.find((r) => r.isPlayer);
  if (isFinite(info.total) && (!best[race.trackId] || info.total < best[race.trackId])) {
    best[race.trackId] = info.total;
    store.set('kp-best', best);
  }
  const ch = state.champ;
  const tbl = $('results-table');
  tbl.innerHTML = results.map((r) => {
    const gain = ch ? `<span class="pts-gain">+${POINTS[r.rank - 1]}</span>` : '';
    return `<tr class="${r.isPlayer ? 'me' : ''}"><td class="rank r${r.rank}">${r.rank}</td>
      <td><span class="dot" style="background:${r.color}"></span>${escapeHtml(r.name)}</td>
      <td class="r">${formatTime(r.time)}</td><td class="r">${gain}</td></tr>`;
  }).join('');
  $('results-sub').textContent = `${race.def.name} — ${state.difficulty.name} — ${ordinal(me.rank)} place` +
    (isFinite(info.bestLap) ? ` · meilleur tour ${formatTime(info.bestLap)}` : '');
  const nav = $('results-nav');
  nav.innerHTML = '';
  const btn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.textContent = label; b.className = cls; b.onclick = () => { audio.play('click'); fn(); };
    nav.appendChild(b);
  };

  if (ch) {
    for (const r of results) ch.standings[r.name].points += POINTS[r.rank - 1];
    const sorted = Object.values(ch.standings).sort((a, b) => b.points - a.points);
    $('standings-wrap').classList.remove('hidden');
    $('standings-table').innerHTML = sorted.map((s, i) => `<tr class="${s.isPlayer ? 'me' : ''}"><td class="rank r${i + 1}">${i + 1}</td>
      <td><span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)}</td><td class="r">${s.points} pts</td></tr>`).join('');
    $('results-title').textContent = `${ch.cup.name} — Course ${ch.index + 1}/${ch.cup.tracks.length}`;
    const last = ch.index >= ch.cup.tracks.length - 1;
    btn('Abandonner', '', () => quitToMenu());
    if (last) btn('Podium final 🏆', 'primary', () => showPodium(sorted));
    else btn(`Course suivante : ${TRACKS[ch.cup.tracks[ch.index + 1]].name} →`, 'primary', () => {
      ch.index++;
      startRace(ch.cup.tracks[ch.index], ch.opponents);
    });
  } else {
    $('standings-wrap').classList.add('hidden');
    $('results-title').textContent = me.rank === 1 ? 'Victoire !' : 'Résultats';
    btn('Menu', '', () => quitToMenu());
    btn('Autre circuit', '', () => { disposeRace(); buildSelectScreen(); show('select'); });
    btn('Rejouer ↺', 'primary', () => startRace(race.trackId, makeOpponents()));
  }
  $('hud').classList.add('hidden');
  show('results');
}

function showPodium(sorted) {
  const ch = state.champ;
  const myRank = sorted.findIndex((s) => s.isPlayer) + 1;
  const key = `${ch.cup.id}-${state.difficulty.id}`;
  const trophies = store.get('kp-trophies', {});
  if (!trophies[key] || myRank < trophies[key]) { trophies[key] = myRank; store.set('kp-trophies', trophies); }
  $('podium-title').textContent = `${ch.cup.name} ${state.difficulty.name}`;
  $('podium-trophy').textContent = myRank === 1 ? '🏆' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🏁';
  $('podium-text').textContent = myRank === 1 ? 'Champion ! Tu remportes la coupe !'
    : myRank <= 3 ? `Bravo, tu montes sur le podium (${ordinal(myRank)}) !` : `Tu termines ${ordinal(myRank)}. Retente ta chance !`;
  const order = [1, 0, 2];
  const heights = [120, 160, 90];
  const colors = ['#e0e0e0', '#ffd700', '#ff9e57'];
  $('podium').innerHTML = order.map((i, j) => {
    const s = sorted[i];
    return `<div class="step"><div class="name"><span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)}<br><small>${s.points} pts</small></div>
      <div class="block" style="height:${heights[j]}px;background:${colors[j]}">${i + 1}</div></div>`;
  }).join('');
  disposeRace();
  audio.play('finish');
  show('podium');
}

function disposeRace() {
  if (state.race) { state.race.dispose(); state.race = null; }
}

function quitToMenu() {
  disposeRace();
  state.champ = null;
  trophySummary();
  show('title');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function togglePause() {
  const r = state.race;
  if (!r || r.state === 'done') return;
  if (r.paused) { r.paused = false; show(null); }
  else { r.paused = true; updateMuteLabel(); show('pause'); }
}
input.onPause = togglePause;

function updateMuteLabel() {
  $('btn-mute').textContent = audio.muted ? '🔇 Son : coupé' : '🔊 Son : activé';
}
input.onMute = () => { audio.toggleMute(); updateMuteLabel(); };

// ---------- actions des boutons ----------
const actions = {
  'mode-cup': () => { state.mode = 'cup'; buildKartScreen(); show('kart'); },
  'mode-single': () => { state.mode = 'single'; buildKartScreen(); show('kart'); },
  help: () => show('help'),
  'back-title': () => quitToMenu(),
  'back-kart': () => { buildKartScreen(); show('kart'); },
  'kart-next': () => {
    state.name = $('player-name').value.trim().slice(0, 14);
    store.set('kp-name', state.name);
    store.set('kp-color', state.color);
    store.set('kp-kart', state.kartId);
    buildSelectScreen();
    show('select');
  },
  resume: () => togglePause(),
  restart: () => {
    if (!state.race) return;
    startRace(state.lastTrack, state.lastOpponents);
  },
  'toggle-mute': () => { audio.toggleMute(); updateMuteLabel(); },
  quit: () => quitToMenu(),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  audio.init();
  if (el.dataset.action !== 'mode-cup' && el.dataset.action !== 'mode-single') audio.play('click');
  actions[el.dataset.action]?.();
});
$('btn-pause').addEventListener('click', () => togglePause());
$('player-name').addEventListener('keydown', (e) => e.stopPropagation());
$('player-name').addEventListener('keyup', (e) => e.stopPropagation());

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  menu.camera.aspect = innerWidth / innerHeight;
  menu.camera.updateProjectionMatrix();
  if (state.race) state.race.resize();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.race && !state.race.paused && state.race.state !== 'done') togglePause();
});

// ---------- boucle principale ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.race) {
    state.race.update(dt);
    if (state.race) state.race.render();
  } else {
    menu.t += dt;
    const a = menu.t * 0.05, R = menu.track.extent * 0.9;
    menu.camera.position.set(Math.cos(a) * R, 70 + Math.sin(menu.t * 0.2) * 10, Math.sin(a) * R);
    menu.camera.lookAt(0, 0, 0);
    menu.track.update(dt, menu.t);
    renderer.render(menu.scene, menu.camera);
    if (currentScreen === 'kart') preview.render(dt);
  }
  requestAnimationFrame(frame);
}

trophySummary();
show('title');
requestAnimationFrame(frame);

// accès de débogage / tests automatisés
window.__kp = { state, startSingle, startChampionship, CUPS, LAPS };

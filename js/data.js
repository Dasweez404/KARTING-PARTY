// Données du jeu : karts, objets, décors, circuits, championnats, pilotes.

export const KARTS = [
  {
    id: 'equilibre', name: 'Équilibré', desc: 'Bon partout, idéal pour débuter.',
    stats: { speed: 0.6, accel: 0.6, handling: 0.6, weight: 0.5 }, shape: 'standard',
  },
  {
    id: 'plume', name: 'Plume', desc: 'Léger et nerveux : accélère et tourne vite.',
    stats: { speed: 0.45, accel: 0.95, handling: 0.85, weight: 0.15 }, shape: 'light',
  },
  {
    id: 'bolide', name: 'Bolide', desc: 'Vitesse de pointe énorme, mais long à lancer.',
    stats: { speed: 0.9, accel: 0.35, handling: 0.45, weight: 0.6 }, shape: 'racer',
  },
  {
    id: 'mastodonte', name: 'Mastodonte', desc: 'Lourd : bouscule les autres sans broncher.',
    stats: { speed: 0.78, accel: 0.4, handling: 0.4, weight: 1.0 }, shape: 'heavy',
  },
  {
    id: 'drifteur', name: 'Drifteur', desc: 'Maniabilité record, turbos de dérapage rapides.',
    stats: { speed: 0.55, accel: 0.65, handling: 1.0, weight: 0.35 }, shape: 'drift', driftBonus: 1.5,
  },
];

export const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#ec407a', '#ffffff', '#212121'];

export const ITEMS = {
  turbo:   { name: 'Turbo',        icon: '🚀' },
  triple:  { name: 'Triple turbo', icon: '🔥' },
  banane:  { name: 'Banane',       icon: '🍌' },
  missile: { name: 'Missile',      icon: '🎯' },
  bouclier:{ name: 'Bouclier',     icon: '🛡️' },
  mine:    { name: 'Mine',         icon: '💣' },
  eclair:  { name: 'Éclair',       icon: '⚡' },
};

// Probabilités selon la position : "front" pour le leader, "back" pour le dernier.
export const ITEM_ODDS = {
  front: { banane: 35, mine: 20, bouclier: 20, turbo: 15, missile: 10, triple: 0, eclair: 0 },
  back:  { banane: 3, mine: 2, bouclier: 10, turbo: 15, missile: 30, triple: 28, eclair: 12 },
};

export const DIFFICULTIES = [
  { id: '50', name: '50cc', desc: 'Tranquille', speedMult: 0.82, botSkill: 0.78 },
  { id: '100', name: '100cc', desc: 'Sportif', speedMult: 0.92, botSkill: 0.9 },
  { id: '150', name: '150cc', desc: 'Expert', speedMult: 1.0, botSkill: 1.0 },
];

export const THEMES = {
  prairie: {
    name: 'Prairie', sky: '#8fd3ff', fog: '#bfe6ff', fogNear: 120, fogFar: 650,
    ground: '#5dbb4a', road: '#5a5f66', shoulder: '#c9b27a', walls: ['#e53935', '#ffffff'],
    light: 1.0, ambient: 0.75, night: false,
    scenery: { tree: 90, rock: 25, flower: 60, mountain: 14 }, mountainColor: '#3f8f3a',
  },
  plage: {
    name: 'Plage', sky: '#7fd8ff', fog: '#c5efff', fogNear: 150, fogFar: 700,
    ground: '#f2d79b', road: '#6d6a68', shoulder: '#e9c47a', walls: ['#00acc1', '#ffffff'],
    light: 1.1, ambient: 0.8, night: false, water: '#1ca3d8',
    scenery: { palm: 70, rock: 20, umbrella: 30 }, mountainColor: '#6aa84f',
  },
  desert: {
    name: 'Désert', sky: '#ffc98a', fog: '#ffd9a8', fogNear: 100, fogFar: 600,
    ground: '#d9925b', road: '#7a5f4c', shoulder: '#e8b27c', walls: ['#8d4a2a', '#f3d2a2'],
    light: 1.15, ambient: 0.7, night: false,
    scenery: { cactus: 70, rock: 40, mesa: 16 }, mountainColor: '#b8643a',
  },
  neige: {
    name: 'Neige', sky: '#cfe3f5', fog: '#e8f1fa', fogNear: 80, fogFar: 520,
    ground: '#f4f8fb', road: '#6b7380', shoulder: '#c9d8e6', walls: ['#1e88e5', '#ffffff'],
    light: 0.95, ambient: 0.85, night: false,
    scenery: { pine: 110, snowman: 14, rock: 15, mountain: 16 }, mountainColor: '#e9f1f8',
  },
  automne: {
    name: 'Forêt', sky: '#ffd8a8', fog: '#ffe7c4', fogNear: 90, fogFar: 520,
    ground: '#7a8f3d', road: '#5d5650', shoulder: '#a5763f', walls: ['#d84315', '#fff3e0'],
    light: 1.0, ambient: 0.75, night: false,
    scenery: { autumnTree: 120, mushroom: 22, rock: 15 }, mountainColor: '#8d6e3f',
  },
  volcan: {
    name: 'Volcan', sky: '#3b1410', fog: '#4a1a10', fogNear: 60, fogFar: 450,
    ground: '#2e2724', road: '#3c3a3a', shoulder: '#5a2a1a', walls: ['#ff6d00', '#212121'],
    light: 0.6, ambient: 0.55, night: true,
    scenery: { rock: 70, lava: 30, volcano: 1, mountain: 10 }, mountainColor: '#3a2d29',
  },
  ville: {
    name: 'Ville néon', sky: '#0b0b2a', fog: '#141238', fogNear: 80, fogFar: 520,
    ground: '#1d1d2b', road: '#2a2a35', shoulder: '#33334a', walls: ['#00e5ff', '#ff2bd6'],
    light: 0.45, ambient: 0.6, night: true,
    scenery: { building: 120, lamp: 40 }, mountainColor: '#20203a',
  },
  espace: {
    name: 'Espace', sky: '#06021a', fog: '#0a0428', fogNear: 150, fogFar: 800,
    ground: '#0d0624', road: 'rainbow', shoulder: '#2a1450', walls: ['#ffffff', '#b388ff'],
    light: 0.7, ambient: 0.8, night: true, stars: true, noGround: true,
    scenery: { crystal: 60, planet: 10 }, mountainColor: '#2a1450',
  },
};

// Circuits générés par une courbe polaire : r(θ) = R * (1 + Σ a·sin(kθ + φ)).
export const TRACKS = {
  collines:   { name: 'Prairie des Collines', theme: 'prairie', R: 120, sx: 1.4, sz: 0.9, width: 17, relief: 10, harm: [[2, 0.288, 0.3], [3, 0.192, 1.2]] },
  corail:     { name: 'Plage Corail',         theme: 'plage',   R: 132, sx: 1.2, sz: 1.0, width: 17, relief: 5, harm: [[2, 0.306, 2], [3, 0.357, 0.4], [5, 0.102, 1]] },
  rousse:     { name: 'Forêt Rousse',         theme: 'automne', R: 128, sx: 1.0, sz: 1.15, width: 16, relief: 10, harm: [[3, 0.27, 0], [4, 0.095, 2.1]] },
  poussiere:  { name: 'Canyon Poussière',     theme: 'desert',  R: 140, sx: 1.3, sz: 0.85, width: 16, relief: 12, harm: [[2, 0.35, 1.4], [4, 0.175, 0.5], [5, 0.07, 2.5]] },
  givre:      { name: 'Sommet Givré',         theme: 'neige',   R: 132, sx: 1.1, sz: 1.1, width: 16, relief: 16, harm: [[3, 0.23, 0.9], [5, 0.081, 0.2]] },
  lagune:     { name: 'Lagune Tropicale',     theme: 'plage',   R: 144, sx: 1.35, sz: 0.95, width: 16, relief: 6, harm: [[2, 0.205, 0], [4, 0.267, 1.3], [6, 0.062, 0]] },
  neon:       { name: 'Ville Néon',           theme: 'ville',   R: 136, sx: 1.2, sz: 1.0, width: 16, relief: 10, harm: [[4, 0.217, 0.7], [2, 0.155, 2.4]] },
  cratere:    { name: 'Cratère Ardent',       theme: 'volcan',  R: 140, sx: 1.0, sz: 1.2, width: 15, relief: 14, harm: [[3, 0.225, 2], [5, 0.105, 0.6], [2, 0.12, 1]] },
  infini:     { name: 'Désert Infini',        theme: 'desert',  R: 160, sx: 1.5, sz: 0.8, width: 16, relief: 12, harm: [[2, 0.225, 0.2], [3, 0.18, 2.2], [6, 0.038, 1.1]] },
  glacier:    { name: 'Glacier Éternel',      theme: 'neige',   R: 152, sx: 1.25, sz: 1.0, width: 15, relief: 15, harm: [[4, 0.176, 0.4], [3, 0.135, 1.6], [6, 0.041, 0]] },
  metropole:  { name: 'Métropole Nocturne',   theme: 'ville',   R: 156, sx: 1.1, sz: 1.15, width: 15, relief: 10, harm: [[5, 0.152, 1], [3, 0.266, 0.2], [2, 0.152, 2.7]] },
  arcenciel:  { name: 'Route Arc-en-ciel',    theme: 'espace',  R: 168, sx: 1.3, sz: 1.0, width: 15, relief: 18, harm: [[3, 0.224, 1.1], [5, 0.098, 2.4], [7, 0.028, 0.5]] },
};

export const CUPS = [
  { id: 'tournesol', name: 'Coupe Tournesol', icon: '🌻', tracks: ['collines', 'corail', 'rousse'] },
  { id: 'mirage',    name: 'Coupe Mirage',    icon: '🌵', tracks: ['poussiere', 'givre', 'lagune'] },
  { id: 'braise',    name: 'Coupe Braise',    icon: '🌋', tracks: ['neon', 'cratere', 'infini'] },
  { id: 'etoile',    name: 'Coupe Étoile',    icon: '⭐', tracks: ['glacier', 'metropole', 'arcenciel'] },
];

export const BOTS = [
  { name: 'Turbo Tom',   color: '#1e88e5' },
  { name: 'Lulu Laser',  color: '#ec407a' },
  { name: 'Max Piston',  color: '#43a047' },
  { name: 'Zoé Zoom',    color: '#fdd835' },
  { name: 'Bob Boulon',  color: '#fb8c00' },
  { name: 'Nina Nitro',  color: '#8e24aa' },
  { name: 'Rico Rapido', color: '#00acc1' },
];

export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
export const LAPS = 3;

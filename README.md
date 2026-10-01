# 🏎️ Karting Party

Jeu de karting 3D qui tourne directement dans le navigateur (Three.js, aucun serveur de jeu) : affronte 7 bots, ramasse des gadgets, dérape pour obtenir des turbos et remporte les championnats.

## Jouer

Le jeu est un site statique. En local :

```bash
npm start          # ou : python3 -m http.server 8000
```

puis ouvre <http://localhost:8000>.

**En ligne** : le workflow `.github/workflows/pages.yml` publie le jeu sur GitHub Pages à chaque push sur `main`. Il faut l'activer une fois dans *Settings → Pages → Source : GitHub Actions*.

## Commandes

| Touche | Action |
| --- | --- |
| ↑ / W / Z | Accélérer |
| ↓ / S | Freiner, marche arrière |
| ← → / Q D / A | Tourner |
| Maj / C (maintenir) | Déraper, relâcher pour un turbo (bleu puis orange) |
| Espace / E | Utiliser l'objet |
| Échap / P | Pause |
| M | Couper le son |

Les manettes et les écrans tactiles (boutons à l'écran) sont aussi supportés. Accélère pendant le « 1 » du compte à rebours pour un départ canon.

## Contenu

- **5 karts** avec des stats différentes (vitesse, accélération, maniabilité, poids) : Équilibré, Plume, Bolide, Mastodonte, Drifteur, et 10 couleurs.
- **7 gadgets** : Turbo, Triple turbo, Banane, Mine, Missile à tête chercheuse, Bouclier, Éclair. Plus tu es loin dans le classement, meilleurs sont les objets.
- **12 circuits** dans **8 décors** : prairie, plage, désert, neige, forêt d'automne, volcan, ville néon, espace arc-en-ciel.
- **4 championnats** de 3 courses (barème 15-12-10-8-6-4-2-1), en 50cc, 100cc ou 150cc, avec podium final et trophées sauvegardés.
- **Course libre** sur n'importe quel circuit, avec record par circuit.
- Bots qui suivent la trajectoire, freinent dans les virages, dérapent, évitent les pièges et utilisent leurs objets.
- Musique et effets sonores générés en direct (Web Audio), aucun fichier audio.

## Structure

```
index.html        écrans et HUD
css/style.css     interface
js/data.js        karts, objets, décors, circuits, coupes
js/shape.js       génération de la ligne centrale des circuits
js/track.js       construction 3D du circuit et du décor
js/kart.js        modèle 3D et physique des karts
js/items.js       boîtes d'objets, pièges, missiles
js/ai.js          pilotage des bots
js/race.js        déroulement d'une course, caméra, HUD
js/main.js        menus, championnats, boucle principale
vendor/           Three.js r169 (licence MIT)
tests/            vérification que les circuits ne se chevauchent pas
```

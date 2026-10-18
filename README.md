# Hapax Simulator — V8 MIDI

Simulateur non officiel du Squarp Hapax : édition de notes et sortie Web MIDI.
Ouvrir https://fredjordanfs.github.io/HapaxSimulator/ dans Chrome ou Edge.

La vérification par rapport au manuel hapaxOS 3.10, les corrections et les fonctions
encore partielles sont détaillées dans [l'état de conformité](docs/HAPAX-CONFORMANCE.md).
Le bouton Play de la façade relance la séquence ; Stop désactive aussi REC.
Le bouton PLAY/STOP ajouté en bas reste un interrupteur. `2ND` puis `UNDO` permet
de rétablir une édition de notes. Dans la fenêtre BPM, l'encodeur principal règle
le tempo. Les flèches ↑/↓ changent l'octave et ←/→ changent de page ; le zoom +/−
et le snapshot ne sont pas encore simulés.

## Régler une piste depuis la façade

Maintenir une piste 1–16 pendant une demi-seconde ouvre **TRACK SETTINGS** sur
l'écran gauche. Relâcher : le menu reste ouvert pour faciliter le réglage tactile.
Les huit encodeurs correspondent aux réglages primaires du manuel hapaxOS 3.10,
§6.2–6.3, p. 89–91 ; l'écran droit détaille le réglage sélectionné.

| Encodeur | Action dans les réglages de piste |
| --- | --- |
| 1 | PC : OFF ou 0–127. Appuyer alterne PC, MSB et LSB. |
| 2 | TRIG : FREE conserve la position, RESTART repart au début lors du changement de pattern. |
| 3 | LENGTH : 1–512 pas, soit 32 pages. Tourner par 16 pas ; appuyer alterne pas/barre. |
| 4 | RUN : FORWARD, REVERSE, PING-PONG, RANDOM BAR, RANDOM BEAT, RANDOM 1/16. |
| 5 | OUTPUT : port indépendant par piste, COMMUNE ou OFF. Toucher autorise MIDI si nécessaire. |
| 6 | CHANNEL : canal de sortie 1–16. |
| 7 | INPUT : OFF, ALL ACTIVE ou port d'entrée. |
| 8 | IN CHANNEL : ALL ou canal 1–16 pour le port choisi. |
| 9, principal | Tourner sélectionne le réglage détaillé ; appuyer ferme le menu. |

Les numéros désignent les deux groupes de quatre encodeurs, puis le principal.
STEP ou un appui court sur une piste ferme aussi le menu ; Maj+Entrée sur une
piste l'ouvre au clavier. Le premier appui sur un pad ferme sans éditer la note.
Les neuf encodeurs gardent leur forme et leur pivot. Leur repère continue à tourner
aux limites de valeur, et inverser le geste répond immédiatement.

PC/MSB/LSB, longueur, direction et TRIG sont enregistrés par pattern et piste.
Le routage et les canaux sont propres à chaque piste. Le mode COMMUNE reprend
le sélecteur de sortie inférieur, pour conserver les anciens projets ; choisir un
port dans OUTPUT rend la piste indépendante. Les sorties explicites sauvegardées
sont rouvertes après **Activer MIDI**, jamais avant l'autorisation.

Les messages de banque CC0/CC32 précèdent Program Change puis les notes. Ils
sont émis au lancement et au changement de pattern ; PC OFF n'envoie rien.
Des configurations identiques partageant le même port/canal sont regroupées. Deux pistes partageant port et canal pilotent
le même instrument. FREE/RESTART agit au prochain pas planifié. Le choix de
pattern reste commun aux 16 pistes : le mode PATTERN complet du matériel manque.

INPUT transmet les messages MIDI de canal vers la sortie de la piste, en remplaçant
le canal. ALL ACTIVE transmet seulement à la piste sélectionnée, sans filtre de
canal. Les notes reçues restent tenues jusqu'au Note Off ; changer de sélection
n'empêche pas leur relâchement. Avec REC pendant la lecture, les notes dans les
huit hauteurs visibles sont enregistrées avec leur vélocité au pas courant ; les
autres sont transmises sans enregistrement. Les messages système, SysEx et
l'horloge entrante ne sont pas interprétés. Éviter de boucler sortie vers entrée.

## Encodeurs et copie depuis la façade

Hors menu de piste, l'écran gauche montre les huit fonctions **réellement actives**,
numérotées et disposées comme les boutons physiques : première rangée 1/2/5/6,
deuxième rangée 3/4/7/8. L'écran droit détaille le dernier encodeur utilisé ; le
principal règle le tempo dans la fenêtre BPM et le CC 28 ailleurs. Les valeurs
affichées et les libellés accessibles montrent les unités musicales. L'octave, le gate et le swing
changent dès le premier cran, respectivement d'une octave ou d'un point de pourcentage. Ce mode reste **COMMANDES SIMPLIFIÉES** : le véritable
écran STEP du matériel (§3.4) et ses huit paramètres par note ne sont pas reproduits.

- **À un doigt, sans maintien** : toucher **SÉLECTION** (sous les pads), puis
  les notes à copier une par une. Elles sont surlignées ; retoucher une note la
  retire de la sélection sans l'effacer. Toucher **COPY**, puis **PASTE**, puis
  un pad dans la colonne de destination. Les hauteurs et espacements restent
  identiques. **2ND** transpose au collage. Un second PASTE annule l'attente de
  destination ; SÉLECTION ou Échap permet aussi d'annuler. La sélection concerne
  la page visible ; changer de page, piste ou mode l'annule. Ce bouton est une
  adaptation tactile du simulateur, pas une commande physique du Hapax.
- **COPY**, puis **PASTE**, hors sélection de notes : copier/remplacer la page courante. La longueur de
  lecture s'étend si la page collée contient des notes au-delà de l'ancienne fin.
- **Maintenir COPY + toucher une piste**, puis **maintenir PASTE + toucher la
  piste destination** : copier toutes ses pages et patterns, réglages, canal et
  routage inclus (§6.5, p. 93). Les pistes restent indépendantes après collage.
- En **PATTERN**, **COPY + pad**, puis **PASTE + pad** : copier toutes les pages et
  les réglages du pattern. La colonne désigne la piste, la ligne le pattern
  (§5.9, p. 83). Le choix du pattern à lire reste global aux pistes.
- **COPY + pad STEP** copie une note ; on peut aussi **tenir une ou plusieurs notes
  puis toucher COPY**. **PASTE + pad STEP** place les notes à cette position dans
  le temps, en conservant les hauteurs. **2ND puis PASTE + pad** transpose vers
  la rangée visée (§3.5, p. 49–50). Après une copie de notes, un appui simple sur PASTE attend
  aussi un toucher de destination ; aucun maintien n'est alors nécessaire. Pas
  encore de sélection rectangulaire ou de notes hors des huit rangées visibles.
- **DELETE + pad** efface cette note, ou tout le pattern en mode PATTERN.
  **DELETE + piste** efface toutes les notes de la piste, en gardant ses réglages.
- **UNDO** annule ces collages/effacements, y compris la longueur et le routage
  modifiés. **2ND puis UNDO** rétablit. Changer de pattern vide cet historique.

Les gestes maintenus demandent au moins deux contacts simultanés ; le bouton SÉLECTION permet de les éviter. Hors sélection ou copie de notes, les appuis simples
COPY/PASTE restent des raccourcis de page. Un clipboard vide ou de type incompatible
est annoncé sur l'écran. Les fonctions non implémentées sont signalées ; AUTOM
n'édite plus des notes sous une fausse apparence de lane d'automation.

## iPad et appareil USB/MIDI

Safari ne fournit pas Web MIDI sur iPad. Une piste est l'application dédiée
[Web MIDI Browser](https://apps.apple.com/fr/app/web-midi-browser/id953846217),
qui fournit un pont avec le MIDI natif iOS. Sa disponibilité actuelle et son
fonctionnement sur chaque version d'iPadOS restent à vérifier sur l'appareil.
Ouvrir le simulateur **dans cette application**, pas dans Safari.

Brancher un appareil USB MIDI reconnu par iPadOS, ou une interface USB–MIDI
si l'appareil possède des prises DIN. Sur iPad USB-C, employer le câble/hub
adapté ; sur un modèle Lightning, un adaptateur USB compatible est nécessaire.
Un appareil gourmand peut nécessiter un hub alimenté. Cliquer **Activer MIDI**,
choisir la sortie puis tester une note en mode **LIVE** sur le canal de réception
réglé dans l'appareil. Garder le navigateur MIDI au premier plan.

L'application web accepte les anciens itérateurs de ports sans `Symbol.iterator`,
les ports sans `open()` et borne l'attente d'ouverture à cinq secondes. Le réglage **Programmation des notes** propose :

- **Horodatage natif si disponible** (défaut) : conserver les échéances Web MIDI,
  y compris sur iPad, lorsque le port expose `clear()` pour annuler la file sur Stop.
- **Compatibilité iPad (timers)** : envoyer chaque message à son échéance depuis
  JavaScript pour les ponts qui ignorent les timestamps. Ce mode peut être comparé
  au précédent sans changer de sortie. Changer de mode arrête la lecture ; SAVE
  mémorise le choix.

Les ports dépourvus de `clear()` restent en repli logiciel pour que Stop et Panic
puissent annuler les notes futures. La présence de `clear()` ne prouve pas que le
pont respecte les timestamps : seul un essai réel valide son implémentation. Cela
n'ajoute pas l'accès MIDI à Safari et n'établit pas une validation sur matériel réel.
Le timing dépend alors aussi des timers du navigateur.

Pendant la lecture, seuls le curseur, la position et la barre de progression sont
mis à jour ; les écrans et les encodeurs ne sont pas reconstruits à chaque pas.
La file MIDI conserve son prochain timer quand de nouveaux événements plus
lointains arrivent. Le diagnostic **retard maximal d’appel logiciel** mesure le retard
logiciel depuis le dernier Play sur les ponts utilisant les timers JavaScript ;
il ne mesure ni les retards internes au pont MIDI, ni la latence USB/DIN, ni la réception par le synthétiseur. Une valeur de 4 ms ne prouve donc pas la régularité du son. Le test
Chromium ne prouve pas la régularité de Web MIDI Browser sur iPad.

Pour tester un rythme droit, régler **SWING à 0%**, poser des notes espacées
régulièrement, désactiver les autres pistes et garder l'application visible.
Un swing non nul alterne volontairement les intervalles entre les notes.

## Envoyer du MIDI

1. Brancher un synthétiseur/interface MIDI ou créer un port MIDI virtuel vers un DAW.
2. Cliquer sur **Activer MIDI**, autoriser l'accès, puis choisir une **Sortie**.
   Aucune sortie n'est sélectionnée automatiquement. Aucune permission SysEx n'est demandée.
3. Choisir une piste et son canal : pistes 1–16 → canaux 1–16 par défaut.
4. En mode **STEP**, activer des pads puis **PLAY**. Les 16 pistes du pattern jouent ensemble selon
   leur longueur et leur direction, sur toutes leurs pages ; **MUTE** coupe la piste sélectionnée.
5. En mode **LIVE**, toucher un pad envoie une note de durée définie par le gate.
   **REC** écrit la note sur le pas courant pendant la lecture, ou la colonne
   touchée à l'arrêt. Les répétitions d'une même note encore active sont ignorées.
6. Les encodeurs **1–4** règlent vélocité, octave, gate et swing ; ils n'envoient
   aucun CC supplémentaire au synthétiseur. Les encodeurs **5–9** envoient les
   CC 24–28 par défaut, configurables dans le panneau MIDI (0–119).
   Ces commandes sont une extension simplifiée, pas le mode ASSIGN du Hapax.
7. Pour piloter un appareil synchronisé, cocher **Envoyer Clock / Start / Stop**
   et configurer cet appareil pour recevoir l'horloge externe. **PLAY** émet Start
   (FA), puis 24 Clock (F8) par noire ; **STOP** émet Stop (FC). Chaque démarrage
   reprend au premier pas. Sans cette option, aucun message de synchronisation n'est envoyé.

La vélocité est mémorisée dans chaque note. Les encodeurs 1–4 règlent
la vélocité des nouvelles notes, l'octave, le gate et le swing. Octave, gate et
swing sont communs aux pistes. Le gate détermine la durée avant Note Off
(minimum 1 ms). Le swing retarde les doubles croches impaires ; l'horloge MIDI
reste régulière. Les changements sont pris en compte à la prochaine planification.
La grille joue les huit notes chromatiques du MIDI 60 à 67 à l'octave 3.

**PANIC** arrête la lecture, vide les messages en attente et envoie Note Off,
Sustain Off, All Notes Off et All Sound Off sur les 16 canaux. Stop, changement
de sortie ou de canal et déconnexion arrêtent également la lecture. Changer
l'option d'horloge arrête la lecture avant d'appliquer ce réglage.

**SAVE** conserve les notes, canaux, associations CC et option d'horloge dans le
navigateur, avec la même clé que la V8 précédente. Les sorties explicites sont mémorisées ; la sortie COMMUNE doit être choisie
à chaque ouverture. Le SysEx et un synthétiseur audio interne ne sont pas inclus. Le son provient de l'appareil ou du DAW récepteur.
Les banques A/B restent des indicateurs ; FX et FILL ne traitent pas les notes.

Garder l'onglet visible : le séquenceur s'arrête quand il est masqué ou si le
navigateur suspend son ordonnanceur. La synchronisation d'un navigateur n'offre
pas les garanties temps réel du matériel. Une déconnexion physique peut empêcher
la réception des derniers Note Off : utiliser aussi le Panic du récepteur si besoin.

## Développement et vérification

Aucune dépendance npm ni compilation. Depuis la racine du dépôt :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Servir ensemble `index.html`, `app.js`, `track.js`, `midi.js` et `midi-compat.js`. HTTPS est nécessaire hors
localhost. La configuration GitHub Pages ne nécessite aucune modification.

Tests du protocole et du temps avec une horloge et une sortie simulées :

```sh
node --test tests/*.test.cjs
```

Tests d'intégration dans un profil Chromium jetable, avec une sortie Web MIDI
simulée (aucun appareil réel ni autorisation système nécessaire) :

```sh
chromium --headless --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir=/tmp/hapax-midi-test about:blank
node tests/browser-midi.mjs
node tests/browser-midi.mjs --legacy
node tests/browser-track-parameters.mjs
node tests/browser-track-parameters.mjs --legacy
node tests/browser-ui.mjs
node tests/browser-workflow.mjs
node tests/browser-workflow.mjs --legacy
node tests/browser-workflow.mjs --ipad-native
node tests/browser-selection.mjs
```

Dans le conteneur cloud isolé, Chromium peut nécessiter `--no-sandbox --disable-dev-shm-usage`.
Le test navigateur réinitialise le projet dans ce profil jetable. Il vérifie
permissions refusées/indisponibles, ports, branchement/débranchement, canaux,
notes, CC, gate/swing, horloge, Stop, Panic, LIVE/REC et sauvegarde/rechargement.
La réception effective doit être vérifiée sur un équipement MIDI réel.

Le mode `--legacy` simule un iPad avec un pont qui ignore les timestamps,
expose des itérateurs non standard et ne fournit ni `open()` ni `clear()`.
Il ne constitue pas un test de l'application iPad réelle.

`tests/browser-selection.mjs` vérifie quatre contacts simultanés (trois notes et
COPY), le maintien de 600 ms, le déplacement d'un doigt hors de son pad, la
copie à un doigt, la préservation des sources et des espacements, les exclusions,
l'annulation et les clics tactiles de confiance avec `detail=0`. Deux formats
portrait/paysage sont utilisés dans Chromium ; ce n'est pas un test iPad réel.
Les pads désactivent le pan/pinch natif et capturent le pointeur jusqu'à sa
libération/annulation, afin qu'un léger mouvement ne perde pas la note tenue.

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
les ports sans `open()` et borne l'attente d'ouverture à cinq secondes. Sur iPad
ou avec des ports dépourvus de `clear()`, elle gère les échéances et l'annulation
des messages côté JavaScript pour les ponts qui ignorent les timestamps. Cela
n'ajoute pas l'accès MIDI à Safari et n'établit pas une validation sur matériel réel.
Le timing dépend alors aussi des timers du navigateur.

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
6. Tourner/glisser un encodeur ou utiliser ses touches fléchées pour envoyer un CC.
   Les neuf encodeurs utilisent les CC 20–28 par défaut. Le panneau MIDI permet
   de choisir un encodeur et de changer son CC (0–119). La valeur transmise est 0–127.
7. Pour piloter un appareil synchronisé, cocher **Envoyer Clock / Start / Stop**
   et configurer cet appareil pour recevoir l'horloge externe. **PLAY** émet Start
   (FA), puis 24 Clock (F8) par noire ; **STOP** émet Stop (FC). Chaque démarrage
   reprend au premier pas. Sans cette option, aucun message de synchronisation n'est envoyé.

La vélocité est mémorisée dans chaque note. Les encodeurs 1–4 règlent également
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
```

Dans le conteneur cloud isolé, Chromium peut nécessiter `--no-sandbox --disable-dev-shm-usage`.
Le test navigateur réinitialise le projet dans ce profil jetable. Il vérifie
permissions refusées/indisponibles, ports, branchement/débranchement, canaux,
notes, CC, gate/swing, horloge, Stop, Panic, LIVE/REC et sauvegarde/rechargement.
La réception effective doit être vérifiée sur un équipement MIDI réel.

Le mode `--legacy` simule un iPad avec un pont qui ignore les timestamps,
expose des itérateurs non standard et ne fournit ni `open()` ni `clear()`.
Il ne constitue pas un test de l'application iPad réelle.

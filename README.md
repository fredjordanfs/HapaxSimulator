# Hapax Simulator — V8 MIDI

Simulateur non officiel du Squarp Hapax : édition de notes et sortie Web MIDI.
Ouvrir https://fredjordanfs.github.io/HapaxSimulator/ dans Chrome ou Edge.

## Envoyer du MIDI

1. Brancher un synthétiseur/interface MIDI ou créer un port MIDI virtuel vers un DAW.
2. Cliquer sur **Activer MIDI**, autoriser l'accès, puis choisir une **Sortie**.
   Aucune sortie n'est sélectionnée automatiquement. Aucune permission SysEx n'est demandée.
3. Choisir une piste et son canal : pistes 1–16 → canaux 1–16 par défaut.
4. En mode **STEP**, activer des pads puis **PLAY**. Les 16 pistes du pattern et de
   la page sélectionnés jouent ensemble ; **MUTE** coupe la piste sélectionnée.
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
navigateur, avec la même clé que la V8 précédente. Il faut choisir de nouveau
la sortie à chaque ouverture. La réception MIDI, le SysEx et un synthétiseur
audio interne ne sont pas inclus. Le son provient de l'appareil ou du DAW récepteur.
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

Servir ensemble `index.html`, `app.js` et `midi.js`. HTTPS est nécessaire hors
localhost. La configuration GitHub Pages ne nécessite aucune modification.

Tests du protocole et du temps avec une horloge et une sortie simulées :

```sh
node --test tests/midi.test.cjs
```

Tests d'intégration dans un profil Chromium jetable, avec une sortie Web MIDI
simulée (aucun appareil réel ni autorisation système nécessaire) :

```sh
chromium --headless --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir=/tmp/hapax-midi-test about:blank
node tests/browser-midi.mjs
```

Dans le conteneur cloud isolé, Chromium peut nécessiter `--no-sandbox --disable-dev-shm-usage`.
Le test navigateur réinitialise le projet dans ce profil jetable. Il vérifie
permissions refusées/indisponibles, ports, branchement/débranchement, canaux,
notes, CC, gate/swing, horloge, Stop, Panic, LIVE/REC et sauvegarde/rechargement.
La réception effective doit être vérifiée sur un équipement MIDI réel.

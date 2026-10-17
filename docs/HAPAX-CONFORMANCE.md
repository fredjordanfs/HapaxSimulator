# Vérification du simulateur par rapport au manuel Hapax

Vérification du 17 octobre 2026. Source : PDF `HAPAX_manual-955ab84ef06fd2782cc0ee083550f72c.pdf`
fourni par l'utilisateur, manuel Squarp mis à jour le **22 juin 2026**, pour
**hapaxOS 3.10** (identification p. 2). Les numéros ci-dessous correspondent aux
pages du PDF et aux numéros imprimés. [Site du fabricant](https://squarp.net/hapax/).
Le site n'était pas accessible depuis l'environnement ; la lecture porte sur ce PDF.

Le simulateur ne reproduit pas encore l'ensemble du Hapax. Les tests de l'interface
et du protocole MIDI ne constituent pas une certification de conformité au matériel.

| Fonction du manuel | État du simulateur après vérification |
| --- | --- |
| Maintenir une piste ouvre les réglages de sortie et de canal (§1.4 et §1.7, p. 11 et 14). | Implémenté : appui de 500 ms, huit réglages sur l’écran gauche, détail sur le droit. Le menu reste ouvert après relâchement comme adaptation tactile. Ports et canaux d’entrée/sortie indépendants par piste. |
| Réglages primaires PC, TRIG, LENGTH, RUN, OUTPUT/CHANNEL, INPUT/CHANNEL (§6.2–6.3, p. 89–91). | Implémentés : PC et banques MSB/LSB, FREE/RESTART, 1–512 pas, six directions, ports indépendants, filtre d’entrée et ALL ACTIVE. Réception des messages de canal, notes tenues, enregistrement REC des huit hauteurs visibles. Clic encodeur 1 alterne PC/MSB/LSB ; clic 3 alterne longueur fine/barre. Ces adaptations tactiles ne reproduisent pas tous les sous-menus et gestes du matériel. |
| Play relance une séquence déjà en lecture ; Stop remet la position à zéro et désactive REC (§1.5, p. 12). | Corrigé pour les boutons de la façade. Le bouton supplémentaire PLAY/STOP en bas reste un interrupteur pratique. Les différents niveaux de Stop du matériel ne sont pas reproduits : le simulateur coupe les notes immédiatement. |
| Huit encodeurs pour l'écran gauche, un encodeur de menu pour le droit (§1.8, p. 14). | Centre de rotation visuel corrigé pour les neuf encodeurs. Glissements, retour au point de départ, annulation tactile et clavier testés. Les affectations contextuelles du matériel restent partielles ; un clic incrémente la valeur dans le simulateur. |
| Copier/coller des notes (§3.5, p. 49–50), patterns (§5.9, p. 83) et pistes (§6.5, p. 93). | Gestes COPY/PASTE + pad/piste implémentés ; patterns et pistes copient toutes leurs pages et réglages. Collage temporel et transposition 2ND pour les notes visibles. Raccourci appui simple pour copier/coller une page ; la longueur de lecture est étendue si nécessaire. UNDO/REDO restaure les collages, réglages et longueurs concernés. Sélection des seuls pads tenus, pas encore les plages rectangulaires ; DELETE + piste ne réinitialise que les notes. |
| UNDO et 2ND + UNDO pour REDO ; changement de pattern vide l'historique (§1.20, p. 23). | Corrigé pour les modifications de notes. L'historique ne couvre pas encore tous les paramètres. 2ND est un verrou tactile dans le simulateur, plutôt qu'une combinaison maintenue. |
| Fenêtre BPM : encodeur principal pour le tempo (§1.23, p. 26). | Corrigé, y compris l'affichage du champ BPM lorsqu'il a le focus. Seuls les BPM entiers sont proposés ; décimales, tap tempo et élasticité ne sont pas reproduits. |
| Flèches horizontales pour les pages, verticales pour l'octave, +/− pour le zoom (§3.3, p. 46). | Navigation par pages conservée ; flèches verticales corrigées pour l'octave. +/− annonce maintenant le zoom non simulé, au lieu de changer de page. Plage d'octave simplifiée 0–7, différente de celle du matériel (0–10). |
| Snapshot capture et permet de comparer un pattern (§1.21, p. 24). | Non simulé. Le bouton le signale maintenant ; il ne prétend plus contrôler une grille de quantification. SAVE est une sauvegarde locale distincte. |
| Deux projets A/B, chacun avec 16 pistes (§1.6, p. 13). | A/B reste un indicateur, sans deux projets indépendants ni mélange de projets. |
| Affectations propres à chaque piste pour les huit encodeurs (§1.22, p. 25). | Extension simplifiée : encodeurs 1–4 = vélocité/octave/gate/swing ; encodeurs 5–9 = CC configurables partagés entre les pistes, envoyés sur le canal de la piste choisie. L’écran montre ces fonctions et leur position réelle. Aucun CC parasite n’est envoyé par les quatre commandes musicales. Ce n'est pas le mode ASSIGN complet. |
| Chaque note possède hauteur/octave, vélocité, longueur, microtiming, chance, roll et math (§3.4–3.5, p. 47–49). | Seule la vélocité est stockée par note. Octave, gate et swing sont globaux ; les éditions par note, la préécoute STEP, les durées à deux doigts et les autres paramètres restent absents. La convention d'octave et la grille de huit notes sont simplifiées. |
| 16 patterns par piste ; colonnes = pistes et lignes = patterns, avec 8 lignes visibles (§5.1, p. 73). | Huit patterns seulement, sélection commune aux pistes ; appuyer sur une ligne choisit ce pattern pour toutes les pistes. Pas de patterns indépendants par piste ni de Song. |
| Modes Automation, FX, Live et conditions FILL (chapitres 2, 4 et 7 ; §3.11). | LIVE/REC MIDI fonctionne dans le sous-ensemble documenté du README. Pas de moteur complet d'automation, de FX, de conditions FILL, de gammes/accords, de traitement MIDI système entrant, de CV ou de MPE. |

## Vérification de l'interface

`node tests/browser-ui.mjs` effectue de vrais événements souris, tactiles et clavier
dans Chromium : pivots mesurés par rapport aux centres physiques, neuf encodeurs,
glissements et retours, taps uniques, annulation tactile, pads/pistes, Play/Stop,
Redo et menu BPM. Trois tailles sont utilisées : ordinateur 1440×1000, tablette
paysage 1180×820 et portrait 820×1180. Les écrans ne sont plus reconstruits au repos ni à chaque pas de lecture ;
seuls le curseur et la position avancent. Des tests contrôlent ces mutations.

Ces tailles et événements tactiles simulent une tablette dans Chromium ; ils ne
remplacent pas un test sur Web MIDI Browser/iPadOS réel. Les tests MIDI avec ports
simulés ne valident pas la réception d'un synthétiseur USB physique.

Les limites de valeurs n'immobilisent plus le repère des encodeurs actifs. La
rotation visuelle est séparée de la valeur bornée ; l'inversion du geste est prise
en compte immédiatement. Dans les réglages de piste, les huit encodeurs éditent
leurs paramètres ; le principal tourne pour naviguer et se presse pour fermer.
La forme, la couleur et la position des neuf boutons restent identiques à
l'ouverture du menu.

`tests/browser-track-parameters.mjs` contrôle les notes réellement produites
selon longueur/direction, FREE/RESTART, l'ordre banque/PC, deux ports de sortie,
les filtres d'entrée, les notes tenues, l'enregistrement REC et la sauvegarde.
Les mêmes scénarios sont exécutés avec un pont MIDI ancien simulé. Ils ne
prouvent pas une identité de timing ou de comportement avec le firmware réel.

Les tests comparent la géométrie et l’apparence avant/après un maintien de piste,
puis ferment les réglages par STEP, par l’encodeur principal et par un appui court
sur une piste. Après chacune de ces sorties, les neuf encodeurs sont manipulés
pour vérifier qu’ils retrouvent effectivement leur action. Le premier appui sur
un pad ferme les réglages sans modifier de note cachée derrière le menu.

`tests/browser-workflow.mjs` utilise deux contacts tactiles simultanés pour les
copies de notes, patterns et pistes, leurs annulations et l'extension de longueur.
Il vérifie aussi les affectations affichées, l'absence de CC parasites, la stabilité
du DOM pendant la lecture et les intervalles des notes émises avec un pont simulé.
Les écarts mesurés dans Chromium ne constituent pas une mesure sur le Nina ni
sur l'application iPad. SWING doit être à zéro pour comparer à une grille droite.

Le mode de programmation MIDI peut être comparé entre horodatage natif et timers
JavaScript. Un port iPad exposant `clear()` n'est plus forcé en logiciel ; les ports
sans annulation native conservent le repli logiciel. `--ipad-native` vérifie les
échéances envoyées en avance avec une identité iPad simulée. L'indicateur logiciel
n'inclut pas la latence du pont MIDI, du câble ou du synthétiseur. L'enregistrement
fourni montre SWING 0% et 4 ms d'appel logiciel, mais sa piste audio est silencieuse :
il ne permet pas de mesurer les attaques réelles du Nina.

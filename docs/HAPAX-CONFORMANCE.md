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
| Maintenir une piste ouvre les réglages de sortie et de canal (§1.4 et §1.7, p. 11 et 14). | Implémenté : appui de 500 ms, OUTPUT et CHANNEL sur l'écran gauche, encodeurs physiques 5 et 6. Le menu reste ouvert après relâchement comme adaptation tactile. Canal indépendant par piste ; une seule sortie physique commune, sans entrées MIDI ni routage multiport par piste. |
| Play relance une séquence déjà en lecture ; Stop remet la position à zéro et désactive REC (§1.5, p. 12). | Corrigé pour les boutons de la façade. Le bouton supplémentaire PLAY/STOP en bas reste un interrupteur pratique. Les différents niveaux de Stop du matériel ne sont pas reproduits : le simulateur coupe les notes immédiatement. |
| Huit encodeurs pour l'écran gauche, un encodeur de menu pour le droit (§1.8, p. 14). | Centre de rotation visuel corrigé pour les neuf encodeurs. Glissements, retour au point de départ, annulation tactile et clavier testés. Les affectations contextuelles du matériel restent partielles ; un clic incrémente la valeur dans le simulateur. |
| UNDO et 2ND + UNDO pour REDO ; changement de pattern vide l'historique (§1.20, p. 23). | Corrigé pour les modifications de notes. L'historique ne couvre pas encore tous les paramètres. 2ND est un verrou tactile dans le simulateur, plutôt qu'une combinaison maintenue. |
| Fenêtre BPM : encodeur principal pour le tempo (§1.23, p. 26). | Corrigé, y compris l'affichage du champ BPM lorsqu'il a le focus. Seuls les BPM entiers sont proposés ; décimales, tap tempo et élasticité ne sont pas reproduits. |
| Flèches horizontales pour les pages, verticales pour l'octave, +/− pour le zoom (§3.3, p. 46). | Navigation par pages conservée ; flèches verticales corrigées pour l'octave. +/− annonce maintenant le zoom non simulé, au lieu de changer de page. Plage d'octave simplifiée 0–7, différente de celle du matériel (0–10). |
| Snapshot capture et permet de comparer un pattern (§1.21, p. 24). | Non simulé. Le bouton le signale maintenant ; il ne prétend plus contrôler une grille de quantification. SAVE est une sauvegarde locale distincte. |
| Deux projets A/B, chacun avec 16 pistes (§1.6, p. 13). | A/B reste un indicateur, sans deux projets indépendants ni mélange de projets. |
| Affectations propres à chaque piste pour les huit encodeurs (§1.22, p. 25). | Extension simplifiée : neuf CC configurables partagés entre les pistes, envoyés sur le canal de la piste choisie. Ce n'est pas le mode ASSIGN complet. |
| Chaque note possède hauteur/octave, vélocité, longueur, microtiming, chance, roll et math (§3.4–3.5, p. 47–49). | Seule la vélocité est stockée par note. Octave, gate et swing sont globaux ; les éditions par note, la préécoute STEP, les durées à deux doigts et les autres paramètres restent absents. La convention d'octave et la grille de huit notes sont simplifiées. |
| 16 patterns par piste ; colonnes = pistes et lignes = patterns, avec 8 lignes visibles (§5.1, p. 73). | Huit patterns seulement, sélection commune aux pistes ; appuyer sur une ligne choisit ce pattern pour toutes les pistes. Pas de patterns indépendants par piste ni de Song. |
| Modes Automation, FX, Live et conditions FILL (chapitres 2, 4 et 7 ; §3.11). | LIVE/REC MIDI fonctionne dans le sous-ensemble documenté du README. Pas de moteur complet d'automation, de FX, de conditions FILL, de gammes/accords, de réception MIDI, de CV ou de MPE. |

## Vérification de l'interface

`node tests/browser-ui.mjs` effectue de vrais événements souris, tactiles et clavier
dans Chromium : pivots mesurés par rapport aux centres physiques, neuf encodeurs,
glissements et retours, taps uniques, annulation tactile, pads/pistes, Play/Stop,
Redo et menu BPM. Trois tailles sont utilisées : ordinateur 1440×1000, tablette
paysage 1180×820 et portrait 820×1180. Les écrans ne sont plus reconstruits à
chaque frame au repos ; un test observe l'absence de mutations inutiles.

Ces tailles et événements tactiles simulent une tablette dans Chromium ; ils ne
remplacent pas un test sur Web MIDI Browser/iPadOS réel. Les tests MIDI avec ports
simulés ne valident pas la réception d'un synthétiseur USB physique.

Les limites de valeurs n'immobilisent plus le repère des encodeurs actifs. La
rotation visuelle est séparée de la valeur bornée ; l'inversion du geste est prise
en compte immédiatement. Dans les réglages de piste simplifiés, seuls les
encodeurs 5 et 6 tournent : les autres sont explicitement marqués inactifs, sauf
le principal 9 qui est un bouton de retour. Ce sous-ensemble ne reproduit pas
l'ensemble des paramètres de piste du matériel.

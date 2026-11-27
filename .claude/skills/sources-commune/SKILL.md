---
name: sources-commune
description: Compléter les sources (liens vers les images d'actes FamilySearch ou Agatha) des événements Geneanet d'une commune, pour les ancêtres, les ancêtres avec leurs frères et sœurs, ou toutes les personnes de l'arbre. À utiliser quand Bruno donne une commune (« fais Turnhout », « complète les sources de Nethen, tous ») et éventuellement la portée.
---

# Sources d'une commune

Bruno donne : la **commune** et, facultativement, la **portée** :
- `ancetres` : ancêtres d'Olivia (@I21@ ; Bruno est son Sosa 2, donc les deux côtés sont couverts) et leurs unions ;
- `fratrie` (par défaut) : plus leurs frères et sœurs ;
- `tous` : toutes les personnes et unions de l'arbre ayant un événement dans la commune.

Si la portée n'est pas dite, prendre `fratrie` sans demander. Outil : `scripts/sources-commune/` (son README
détaille chaque script). Commandes à lancer depuis ce dossier ; `D` = dossier de travail dans le scratchpad,
par ex. `<scratchpad>/<commune>`.

## Déroulé

0. **Mémoire** : regarder s'il existe une note `actes-<commune>` (registres déjà repérés, liens déjà posés, pièges).

1. **Sessions** : `node sessions.mjs`. Il ouvre au besoin le Chrome de travail (port 9333), vérifie Geneanet
   (droits d'écriture) et FamilySearch, et reconnecte avec les identifiants enregistrés dans Chrome
   (FamilySearch par identifiant et mot de passe, jamais par Google). Agatha n'a pas besoin de session :
   `agatha.py` lit images et manifestes sans connexion. Si un site reste « NON CONNECTÉ », dire à
   Bruno de se connecter dans la fenêtre Chrome (le script attend 5 min) et relancer. Ne jamais lire ni afficher
   la valeur d'un champ de formulaire.

2. **Sélection** : `python3 -I selection.py D <Commune> --portee <portée>` (export le plus récent de
   `~/Téléchargements`). Si l'export date d'avant une séance où des liens ont déjà été posés dans cette commune
   (voir la mémoire), demander à Bruno un export frais : sinon des actes déjà liés seront relus pour rien
   (l'écriture, elle, s'arrête sans rien abîmer sur un champ Source déjà rempli). Une commune homonyme ou un
   lieu-dit (« Oud-Turnhout ») n'est pas pris : seul le premier élément du lieu compte.

3. **Index FamilySearch** : `node fs_index.mjs D <Commune>` en arrière-plan (4 s par requête), puis
   `python3 -I apparier.py D --tout`. Les concordances sûres vont d'office dans `resultats.jsonl`. Parcourir la
   liste des autres candidats (texte seulement) : un candidat évident mais mal noté peut être ajouté à la main
   dans `resultats.jsonl` (`{"n", "src", "lu", "origine": "index FS (revu)"}`).

4. **Registres Agatha** : `python3 -I agatha.py registres D <Commune>`, puis `python3 -I localiser.py D` et
   `python3 -I lots.py D 8`.

5. **Lecture** : un sous-agent `general-purpose` par lot, 6 à 7 en parallèle au plus, avec ce prompt :
   « Lis d'abord la consigne /home/bruno/projets/perso/gedcom/scripts/sources-commune/consigne_lecture.md et
   applique-la. LOT = D/lot_K.json ; D = … ; K = … ; commune : … . Lance les commandes Bash depuis
   /home/bruno/projets/perso/gedcom/scripts/sources-commune. » Ne jamais lire les images dans la conversation
   principale ; ne pas ouvrir les transcriptions des sous-agents.

6. **Écriture** : dès que des lots sont finis, `node geneanet.mjs D --valider` (relançable : ce qui est déjà
   posé est sauté ; chaque lien est relu sur la fiche publique). En fin de course, relancer une dernière fois
   (un lot peut avoir fini d'écrire après le passage précédent). Les arrêts (homonymes, union introuvable…) sont
   à examiner un par un.

7. **Rapport et rangement** : écrire `D/a_verifier.md` (liste à puces : prénoms contredits par un acte, dates de
   naissance postérieures au baptême, identifications fragiles, doublons apparents de l'arbre) et au besoin
   `D/notes_registres.md` (particularités des registres), puis `python3 -I rapport.py D <Commune>`. Copier
   `D` sur `pcloud:Généalogie/Recherches/Actes de <Commune>/` (sans `.agatha_cookies`) avec une copie des scripts,
   écrire la note de mémoire `actes-<commune>`, commiter et pousser les éventuels changements de l'outil.

8. **Réponse à Bruno** : nombre de liens posés (FamilySearch / Agatha), non trouvés, points à vérifier, lien
   du dossier pCloud. Pas de liste détaillée des écarts : elle est dans le rapport.

Si Bruno lance le skill sans nommer de commune, lui demander laquelle (et la portée s'il le souhaite).

## Règles
- Ne jamais modifier une date ni un nom dans l'arbre : seulement le champ Source, vide.
- Pas de réimport GEDCOM : tout passe par l'éditeur en ligne (script `geneanet.mjs`).
- Espace fine insécable (U+202F) devant « : » et « ; » dans les textes français.
- `pkill -f motif` tue aussi le shell qui le lance si le motif est dans sa commande : viser le PID.

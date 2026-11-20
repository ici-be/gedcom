# Sources d'une commune

Pose des liens vers les images d'actes dans le champ Source des événements Geneanet d'une commune
(ancêtres d'une personne de référence, leurs frères et sœurs, leurs unions). Un dossier de travail par
commune (`D` ci-dessous), à copier à la fin dans `pcloud:Généalogie/Recherches/Actes de <commune>/`.

Prérequis : le Chrome de travail (port 9333, profil `~/.local/share/lignees/chrome`) connecté à
Geneanet et à FamilySearch ; un export GEDCOM récent.

## Étapes

1. **Sélection** : `python3 -I selection.py D export.ged Commune @I1@` → `evenements.json`, `ancres.json`
   (liens déjà posés dans la commune, qui servent de repères dans les registres).
2. **Index FamilySearch** : `node fs_index.mjs D Commune` → `fs_index.jsonl`. Une requête toutes les 4 s ;
   FamilySearch refuse (429) au-delà d'une soixantaine de requêtes rapides.
3. **Rapprochement** : `python3 -I apparier.py D --tout` → les actes dont la date exacte, le nom et un parent
   (ou le conjoint) concordent vont d'office dans `resultats.jsonl` ; les autres candidats sont listés en texte.
4. **Registres Agatha** (sans navigateur) : `python3 -I agatha.py registres D Commune`, puis
   `python3 -I localiser.py D` → `a_lire.json` (registre et images probables de chaque acte restant).
5. **Lecture des images** : par des sous-agents, par lots d'une dizaine d'événements (consigne ci-dessous).
   Les images ne passent jamais par la conversation principale : seuls les résultats écrits reviennent.
6. **Écriture sur Geneanet** : `node geneanet.mjs D` (essai), puis `node geneanet.mjs D --valider`. Chaque
   lien est relu sur la fiche publique juste après l'enregistrement ; `journal.jsonl` garde l'avant/après.
7. **Rapport** : `rapport_<commune>.md` (registres, écarts, non trouvés), copie sur pCloud, note de mémoire.

## Consigne des sous-agents de lecture

Chaque sous-agent reçoit un fichier `lot_K.json` (événements avec registre, images probables, proches à
reconnaître) et :

- extrait les images avec `python3 -I agatha.py extrait D DOSSIER_IIIF IMAGE LARGEUR REGION` (région IIIF
  `pct:x,y,l,h` pour zoomer sur une page ou une colonne : ne lire que ce qui est utile, à 1000-1400 px) ;
- part de l'image estimée et avance ou recule selon les dates lues ;
- ajoute une ligne par événement à `D/resultats_lot_K.jsonl` :
  `{"n", "src": "https://agatha.arch.be/data/images/ARCH/DOSSIER/IMAGE", "lu": "résumé de l'acte",
  "ecart": "différence avec l'arbre (facultatif)", "douteux": false}`, ou `{"n", "src": null, "motif"}` ;
- ne renvoie qu'un bilan d'une ligne (les transcriptions restent dans le fichier).

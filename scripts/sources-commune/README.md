# Sources d'une commune

Pose des liens vers les images d'actes dans le champ Source des événements Geneanet d'une commune
(ancêtres d'une personne de référence, leurs frères et sœurs, leurs unions). Un dossier de travail par
commune (`D` ci-dessous), à copier à la fin dans `pcloud:Généalogie/Recherches/Actes de <commune>/`.

Le skill `sources-commune` (`.claude/skills/sources-commune/SKILL.md`) enchaîne ces étapes à partir du seul nom
de la commune et de la portée (ancêtres, avec fratrie, tous).

Prérequis : le Chrome de travail (port 9333, profil `~/.local/share/lignees/chrome`) connecté à Geneanet
et FamilySearch (`node sessions.mjs` le vérifie et reconnecte avec les identifiants enregistrés) ;
un export GEDCOM récent dans `~/Téléchargements`.

## Étapes

1. **Sélection** : `python3 -I selection.py D Commune [--portee ancetres|fratrie|tous] [--ref @I21@] [--ged EXPORT]`
   → `evenements.json`, `ancres.json` (liens déjà posés dans la commune, qui servent de repères dans les registres).
2. **Index FamilySearch** : `node fs_index.mjs D Commune` → `fs_index.jsonl`. Une requête toutes les 4 s ;
   FamilySearch refuse (429) au-delà d'une soixantaine de requêtes rapides.
3. **Rapprochement** : `python3 -I apparier.py D --tout` → les actes dont la date exacte, le nom et un parent
   (ou le conjoint) concordent vont d'office dans `resultats.jsonl` ; les autres candidats sont listés en texte.
4. **Registres Agatha** (sans navigateur) : `python3 -I agatha.py registres D Commune`, puis
   `python3 -I localiser.py D` → `a_lire.json` (registre et images probables de chaque acte restant), puis
   `python3 -I lots.py D 8` → `lot_KK.json`.
   Pour une commune hors de Belgique (ou sans Agatha), les liens existants étant sur FamilySearch :
   `node fs.mjs ancres D` (film et position de chaque lien existant), `node fs.mjs film D DGS` pour chaque film,
   puis `python3 -I localiser_fs.py D` et `python3 -I lots.py D 8` (même format de lots ; `node fs.mjs extrait`
   pour lire une image). Les index néerlandais repris par FamilySearch n'ont pas d'image : `lots.py` joint
   leurs indications (`index_fs`) aux événements, sans les retenir d'office.
5. **Lecture des images** : par des sous-agents, par lots d'une dizaine d'événements (consigne ci-dessous).
   Les images ne passent jamais par la conversation principale : seuls les résultats écrits reviennent.
6. **Écriture sur Geneanet** : `node geneanet.mjs D` (essai), puis `node geneanet.mjs D --valider` (ou `--valider N1,N2` pour quelques événements). Quand deux fiches homonymes (père et fils) citent l'événement, ajouter `"oc"` (numéro de la bonne fiche) au résultat. Chaque
   lien est relu sur la fiche publique juste après l'enregistrement ; `journal.jsonl` garde l'avant/après.
   **Naissance → baptême** : si l'arbre donne pour naissance la date d'un acte qui n'est qu'un baptême (résultat
   avec `"acte": "baptême"`, `"date_acte"` égale à la date de l'arbre et `"naissance_dans_acte": null`), l'événement
   devient un Baptême (même date, même lieu, même note), y compris quand le lien était déjà posé (état « converti »).
   Arrêt sans rien enregistrer si la date n'est pas exacte, si la naissance a des témoins, si la fiche a déjà un
   baptême ou une autre naissance, ou si un autre champ du formulaire a bougé ; après enregistrement, la fiche
   publique doit dire « Baptisé(e) le … » et plus « Né(e) le … ». `--sans-bapteme` désactive la conversion.
7. **Rapport** : `python3 -I rapport.py D` → `rapport_<commune>.md` (registres, écarts, non trouvés ; nom de fichier et
   paragraphe « À vérifier » à adapter), copie du dossier sur pCloud, note de mémoire.

## Repères (Turnhout, 20/11/2026)

157 événements datés : 10 par l'index FamilySearch (qui ne couvre guère que l'après-1850 à Turnhout), 139 lus
sur Agatha par 14 sous-agents (lots de 8 à 12, 3 à 7 min chacun, 5 à 7 en parallèle), 7 non trouvés.
Écriture Geneanet : 7 à 10 s par événement, vérification comprise. Environ 0,5 million de tokens relus par lien
(1,2 million à Anderlecht) ; des lots plus petits (6) et des extraits plus serrés réduiraient encore ce coût.

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

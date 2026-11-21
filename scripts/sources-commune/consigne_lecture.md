# Consigne de lecture d'un lot d'actes (sous-agent)

Tu retrouves, dans les images d'Agatha (Archives de l'État en Belgique), l'acte de chaque événement d'un lot,
et tu notes le lien de l'image. Tu ne modifies rien d'autre que le fichier de résultats.

## Entrées
- `LOT` : fichier JSON du lot. Pour chaque événement : `n`, `evenement` (BIRT naissance, BAPM baptême,
  DEAT décès, BURI sépulture, MARR mariage), `date` (date de l'arbre), la personne et ses proches
  (parents, conjoints ; pour un mariage, les époux et leurs parents), et `registres` : registre(s) probable(s),
  avec `dossier` (dossier IIIF), `images` (images probables, dans l'ordre) et `estimation` (image la plus probable).
- `D` : dossier de travail. Outil (depuis `/home/bruno/Scripts Claude/gedcom/scripts/sources-commune`) :
  `python3 -I agatha.py extrait D DOSSIER IMAGE LARGEUR REGION` télécharge un extrait et affiche le chemin du
  JPEG, que tu lis avec Read. REGION : `full`, ou `pct:x,y,l,h` en pourcentages (ex. `pct:0,0,50,100` = moitié
  gauche, `pct:50,0,50,100` = moitié droite, `pct:0,0,100,50` = moitié haute).

**Registre FamilySearch** (le registre a un champ `dgs`) : `node fs.mjs extrait D DGS IMAGE LARGEUR REGION`
(IMAGE = numéro dans le film, 1 = première) affiche le chemin du JPEG puis le lien ark de l'image : c'est ce
lien (`https://www.familysearch.org/ark:/61903/3:1:…`) qui va dans `src`. Les images voisines sont les numéros
voisins. Un film contient souvent plusieurs registres à la suite (baptêmes, puis mariages, puis décès ; en état
civil, naissances, mariages et décès année par année, avec tables) : si l'image lue n'est pas du bon type, cherche
la bonne section en sautant de 10 en 10. Le champ `index_fs` de l'événement, s'il existe, donne ce que l'index
nominatif de FamilySearch a relevé (date exacte, parents) : c'est une aide pour reconnaître l'acte, pas une preuve.
Le champ `indications`, s'il existe, donne la fiche d'une base d'index locale (paroisse, date exacte, graphie du
nom, registre ou page) : la date qui y figure est souvent plus juste que celle de l'arbre ; sers-t'en pour
reconnaître la paroisse sur l'image et viser le bon jour, et signale l'écart de date dans `ecart`.
Si aucun film proposé ne couvre l'année, essaie les films de numéro voisin (DGS ± 1, ± 2 : les films d'état civil
d'une commune se suivent) : `node fs.mjs film D DGS` dit s'il existe, puis lis sa première image pour voir les années.

## Méthode
- Économise les images : commence à l'image estimée, à 900 px de large en `full`, juste pour lire les dates
  et repérer où se trouve l'acte ; puis zoome sur la page ou la colonne utile (`pct:…`, 1200-1400 px) pour lire
  l'acte. Ne relis pas une image déjà vue. Si les dates lues sont avant la date cherchée, avance ; sinon recule.
  Les images voisines de l'estimation (en dehors de `images`) sont dans le même registre ; leur nom suit la même
  numérotation (`0_2308`, `0_2309`… ; certaines ont un suffixe `_r`, `_v`, `_B` : prends les noms tels que
  listés quand c'est possible, sinon essaie le numéro suivant).
- Les registres paroissiaux sont en latin (baptizatus/a, parentes, susceptores/patrini ; matrimonio iuncti ;
  sepultus/obiit) ; les actes civils en français (an IV-1814) puis en néerlandais. Les prénoms varient
  (Joannes/Jan/Jean, Petrus/Pierre, Elisabeth/Elisa…) et les noms aussi (Boogaerts/Bogaers) : c'est normal.
- Un baptême se fait souvent le jour de la naissance ou le lendemain : si l'arbre donne une naissance et que le
  registre est un registre de baptêmes, l'acte de baptême convient (note l'écart de date s'il y en a un).
- Retiens un acte seulement si l'enfant (ou le défunt, ou les époux) **et** au moins un parent (ou le conjoint)
  concordent. Un écart de date ou de prénom est possible : note-le dans `ecart`. Si tu hésites vraiment,
  `"douteux": true` et explique pourquoi. Ne devine jamais un lien.
- Sous la Révolution, les registres civils d'Agatha sont étiquetés en années grégoriennes approximatives
  (un registre « 1799-1800 » peut être celui de l'an VIII ou de l'an IX) : si le registre proposé ne couvre pas la
  date, cherche le registre voisin du même type dans `D/agatha_CS.json` (`python3 -I agatha.py images D BOOKPART`),
  et pour 1796-1800 pense aussi au registre paroissial de baptêmes.
- Au plus ~12 images par événement. Au-delà, abandonne-le avec un motif précis (images lues, dates couvertes).
- Plusieurs événements du lot peuvent se trouver sur la même image : lis-la une fois pour tous.

## Sortie
Ajoute une ligne JSON par événement (y compris les non trouvés) à `D/resultats_lot_K.jsonl`, au fur et à mesure :
- trouvé : `{"n": 12, "src": "https://agatha.arch.be/data/images/511/DOSSIER/IMAGE", "lu": "Baptême 5/7/1701 : Joannes, fils de Martinus Boogaerts et d'Elisabetha Stakenborgh ; parrain …", "ecart": "…" (facultatif), "douteux": false}`
  (`511` = premier nombre du nom du dossier, ex. `511_0001_126_00007_000` → `511`) ;
- non trouvé : `{"n": 12, "src": null, "motif": "images 0_2301 à 0_2312 lues (juin-août 1701), pas de Joannes Boogaerts"}`.

Ta réponse finale tient en une ligne : « lot K : X trouvés, Y douteux, Z non trouvés ». Pas de transcription
dans la réponse (elles sont dans le fichier).

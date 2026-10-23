---
name: signatures-registre
description: Extraire la ou les signatures d'une image de vieux registre (acte de baptême, mariage, décès, contrat…) en PNG transparents, encre noire sur fond transparent, nommés d'après le signataire. À utiliser quand Bruno donne une image d'acte et demande d'en récupérer les signatures.
---

# Extraire les signatures d'un acte

Dossiers (non commités, voir `.gitignore`) :
- images d'entrée : `_skills/Images pour signatures/` (ou le chemin donné) — seules les
  images à la racine du dossier sont à traiter ; le sous-dossier `old/` contient celles
  déjà traitées ;
- sortie : un sous-dossier par image traitée dans `_skills/Signatures/`, nommé d'après
  l'acte : `<Type d'acte> <Nom> - <Nom> <année>`, par exemple
  `Mariage Louis De Maseneire - Aline De Ryck 1928`, `Baptême Jean Dupont 1754`
  (année omise si elle n'apparaît pas sur l'image ; nom de famille seul si le prénom
  est inconnu). Signature seule, sans le texte de l'acte : `Signature <Prénom Nom>`. Si le dossier existe déjà pour un autre acte, ajouter ` (2)`.

  Dans chaque sous-dossier, les signatures déjà présentes dans l'arbre vont dans
  `déjà dans l'arbre/` : ce qui reste à la racine du sous-dossier est à téléverser.

Scripts (Python, Pillow + numpy seulement) :
- `.claude/skills/signatures-registre/extraire_signatures.py` : découpe et nettoyage ;
- `.claude/skills/signatures-registre/chercher_dans_arbre.py` : recherche des signataires
  dans le GEDCOM de Bruno (par défaut le plus récent `~/Cricket/**/bveyckemans_*.ged`,
  ou `--ged FICHIER`).

## Étapes

1. **Regarder l'image** avec Read, et noter sa taille en pixels
   (`python3 -c "from PIL import Image; print(Image.open('…').size)"`) — les coordonnées
   des zones sont dans ce repère.
2. **Repérer chaque signature** et lui donner un rectangle `x0,y0,x1,y1` un peu large
   (quelques pixels de marge), sans mordre sur une signature voisine ni sur le texte tapé.
   **Ne jamais extraire la signature de l'officier d'état civil** (ni celle du curé ou
   du greffier qui dresse l'acte) : Bruno n'en a pas l'usage. C'est en général le
   paraphe isolé en bout de ligne ou en fin d'acte.
3. **Nommer le signataire** : lire la signature et la recouper avec le texte de l'acte
   (comparants, témoins, parents), puis avec l'arbre :
   ```
   python3 .claude/skills/signatures-registre/chercher_dans_arbre.py --vers ANNÉE_ACTE \
     "Louis Demaeseneire" "M. De Maseneire" "Vanhove" …
   ```
   (`--vers` écarte les personnes pas encore nées ou déjà mortes ; sans année connue,
   l'omettre.) Le script tolère les graphies (De Maeseneire / Demaseneire, ij/y, ck/ch…)
   et affiche dates, parents et conjoints : choisir le candidat cohérent avec l'acte
   (les mariés et leurs parents se tiennent entre eux ; un « M. » peut être la mariée).
   Une personne identifiée prend le nom de l'arbre au format `Prénom Nom`, avec le prénom
   usuel (`Marie Elisabeth Vanhove` → `Elisa Vanhove` si elle signe ainsi, sinon le
   premier prénom). Pas dans l'arbre : le nom tel que lu ; illisible : un nom descriptif
   (`Signature illisible 1`). L'arbre aide aussi à nommer le sous-dossier (prénoms des
   mariés, année). Signaler dans la réponse les noms incertains.
4. **Vérifier les zones** avec un aperçu, puis le regarder avec Read :
   ```
   python3 .claude/skills/signatures-registre/extraire_signatures.py "IMAGE" \
     --apercu "$SCRATCH/apercu.png" --zone "x0,y0,x1,y1:Nom" --zone …
   ```
   Corriger les rectangles qui coupent une signature ou en englobent une autre.
5. **Extraire** (même commande, avec `--sortie` et une vérification sur fond blanc) :
   ```
   … --sortie "_skills/Signatures/<sous-dossier de l'acte>" --fond-controle "$SCRATCH/controle"
   ```
   Regarder les images de `$SCRATCH/controle` (les assembler en une planche si elles
   sont nombreuses). Un fichier existant n'est jamais écrasé : le script ajoute ` (2)`.
6. Si besoin, ajuster :
   - un trait réglé traverse la signature et en coupe des morceaux → `--garder-lignes` ;
   - une tache ou un bout de texte voisin reste → resserrer la zone ;
   - une signature imbriquée dans une autre → zone en plusieurs rectangles,
     `--zone "x0,y0,x1,y1+x0,y0,x1,y1:Nom"` ;
   - image très grande (scan haute définition) → `--echelle 1` ; très petite (signature
     seule, quelques centaines de pixels) → `--echelle 3`.
7. **Trier selon l'arbre** : déplacer dans `<sous-dossier>/déjà dans l'arbre/` les
   signatures des personnes dont le média principal est déjà un PNG (« SIGNATURE
   PRÉSENTE »). L'export Geneanet ne contient que le média principal : une personne
   avec une photo JPG peut avoir sa signature en média secondaire, la signaler
   « à vérifier » plutôt que la déplacer.
8. **Ranger l'image traitée** : une fois les signatures extraites et vérifiées, déplacer
   l'image d'entrée dans `_skills/Images pour signatures/old/`.

`$SCRATCH` = le dossier scratchpad de la session.

Dans la réponse, un tableau par signature : fichier, personne de l'arbre (identifiant
`@I…@`, dates) ou « pas dans l'arbre », et statut (déjà dans l'arbre / à téléverser /
à vérifier). Donner la date du GEDCOM utilisé ; s'il a plus d'un mois, proposer à Bruno
d'en fournir un plus récent.

Les zones n'ont pas besoin d'être ajustées au pixel : un tracé qui touche la zone est
gardé entier, même s'il en déborde (hampes, boucles, paraphes — jusqu'à 60 px autour),
sauf s'il appartient surtout à une autre zone ou ne fait qu'effleurer la zone (texte de
l'acte). Il faut donc **déclarer toutes les signatures de la page** dans le même appel,
et passer celle de l'officier (non extraite) en `--exclure "x0,y0,x1,y1"`, pour que
chaque tracé aille à la bonne personne. Même chose pour une ligne de texte imprimé ou
écrit juste au-dessus des signatures (« … donné lecture. ») : `--exclure` sur cette
ligne, sinon un mot qui touche la zone y est rattaché. Les petites taches rondes isolées
(à plus de ~15 px de l'écriture) sont retirées ; les points d'initiales, proches des
lettres, et les bouts de trait allongés restent. Ne jamais rogner une zone pour écarter un
morceau voisin : vérifier sur la planche de contrôle que les hampes et barres hautes
(b, d, l, t, majuscules) et les jambages (g, j, p, y) sont entiers en les comparant à
l'original agrandi. Regarder aussi les **déliés** (traits fins tracés en montant : premier
jambage d'un M, crochet d'un G, attaque d'une majuscule) : s'il en manque un morceau, ce
n'est pas normal, il faut chercher pourquoi (zone, exclusion trop large) plutôt que livrer.

## Ce que fait le script

Fond du papier estimé (maximum local adouci) puis divisé pour neutraliser jaunissement
et ombres ; seuil d'Otsu sur l'encre, avec hystérésis : l'encre pâle (déliés, plume qui
s'épuise, jusqu'à 45 % du seuil) est gardée quand elle prolonge un tracé franc, chaque
pixel pâle allant au tracé le plus proche le long de l'encre ; effacement des traits
horizontaux longs et minces (lignes du registre), et retrait de l'encre pâle des traits
réglés ou plis légèrement inclinés, même en pointillé (l'encre franche des lettres qu'ils
croisent reste) ; suppression des petites taches, sauf les morceaux de délié qui touchent
un tracé gardé ; alpha adouci sur les bords ; rattachement des tracés entiers à la zone
qui en contient le plus ; recadrage serré. Résultat : RGBA, RVB noir, transparence = absence d'encre.

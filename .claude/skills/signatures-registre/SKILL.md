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
  est inconnu). Si le dossier existe déjà pour un autre acte, ajouter ` (2)`.

Script : `.claude/skills/signatures-registre/extraire_signatures.py` (Pillow + numpy seulement).

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
   (comparants, témoins, parents). Nom au format `Prénom Nom` ;
   si un seul élément est lisible, le garder tel quel (`M. De Maseneire`) ; si c'est
   illisible, un nom descriptif (`Signature illisible 1`).
   Signaler dans la réponse les noms incertains.
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
   - image très grande (scan haute définition) → `--echelle 1`.
7. **Ranger l'image traitée** : une fois les signatures extraites et vérifiées, déplacer
   l'image d'entrée dans `_skills/Images pour signatures/old/`.

`$SCRATCH` = le dossier scratchpad de la session.

## Ce que fait le script

Fond du papier estimé (maximum local adouci) puis divisé pour neutraliser jaunissement
et ombres ; seuil d'Otsu sur l'encre ; effacement des traits horizontaux longs et minces
(lignes du registre) ; suppression des petites taches ; alpha adouci sur les bords ;
recadrage serré. Résultat : RGBA, RVB noir, transparence = absence d'encre.

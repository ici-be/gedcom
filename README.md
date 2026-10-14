# Lignées

Suivre les sources de son arbre généalogique à partir d'un fichier GEDCOM.
Le fichier est lu **dans le navigateur** : rien n'est envoyé sur Internet.

**En ligne : https://ici.be/gedcom/**

## Ce que fait le site

- **Accueil** : part des faits sourcés chez les ancêtres et dans tout l'arbre, nombre d'ancêtres et
  de générations, progrès depuis l'export précédent. Réglages : personne de départ (Sosa 1) et adresse
  de l'arbre en ligne.
- **Personnes** : naissance (ou baptême), mariage(s) et décès (ou inhumation) de chaque personne, avec
  leur état : ✓ sourcé, ! renseigné sans source, ✕ manquant. Les ancêtres sont numérotés
  (Sosa, génération, implexe). Filtres : ancêtres seuls / avec leurs frères et sœurs / tout l'arbre,
  nom, lieu, fait, état, générations, branche (ancêtres d'un Sosa : 2 = côté paternel, 3 = maternel).
  Un clic sur ▸ montre tous les événements et leurs sources. Export CSV.
- **Lieux** : pour chaque commune, le nombre de faits et ceux qui n'ont pas de source ; puis la liste
  des actes à chercher, par type et par siècle, avec une case à cocher quand un acte est trouvé.
  Export CSV.
- **Métiers** : les professions, avec le nombre de personnes (hommes, femmes), l'époque et les
  communes principales ; puis une page par métier avec chaque personne, la mention exacte (date, lieu,
  source) et ses autres métiers. « Cultivateur, échevin » compte pour deux métiers. Les formes
  féminine et masculine sont réunies (« Cultivateur / cultivatrice », « Ouvrier de fabrique /
  ouvrière de fabrique », « Roi / reine ») quand la forme masculine existe dans le fichier, ainsi que
  les variantes d'écriture (« ménagère » et « menagere »).
- **Statistiques** : durée de vie, âge au premier mariage, écart d'âge entre époux, enfants par couple,
  âge des parents, mois des naissances, mariages et décès, prénoms (variantes latines, flamandes… regroupées : Joannes, Jan → Jean) et patronymes les plus portés,
  métiers par sexe, lieux et pays de naissance, sédentarité, part sourcée. Moyenne ou médiane, par sexe
  et par siècle de naissance, pour les ancêtres seuls ou tout l'arbre, et filtrables sur un siècle.
- **Ascendance** (`#/ascendance`) : un éventail de complétude sur dix générations et les quatre
  quartiers (avec les huit arrière-grands-parents) ; la frise des générations, une case par place
  jusqu'à la 8e puis côté paternel face au côté maternel, avec ce qu'on rencontre en chemin (premier
  mur, places sans issue, premier implexe…) et des liens vers les personnes à compléter ; les lignées
  de père en père, de mère en mère et la plus longue ; les pistes les plus proches ; l'implexe ; les
  noms les plus présents, les siècles de naissance et la durée d'une génération. Un enfant sans père
  dans l'arbre qui porte le nom de sa mère compte comme enfant naturel (père inconnu, pas à chercher).
- **Carte** : un cercle par lieu, d'autant plus grand qu'il y a de faits, du rouge (rien de sourcé)
  au vert (tout est sourcé). Filtres par personnes, type de fait et siècle, ou seulement les lieux qui
  ont des faits sans source. Un clic mène aux actes du lieu. Les lieux sont reconnus dans des listes de
  localités livrées avec le site (`public/geo/`, d'après GeoNames) : aucun nom de lieu n'est envoyé sur
  Internet, seul le fond de carte OpenStreetMap est téléchargé. Les lieux introuvables (hameau,
  orthographe ancienne, faute de frappe) se placent d'un clic ; ces positions restent dans le
  navigateur et peuvent être exportées.

- **Imprimer** : des arbres prêts pour l'imprimeur ou pour un PDF. Premier modèle, l'**éventail des
  origines** (A3 paysage) : huit générations sur 220°, chaque ancêtre teinté selon sa province ou sa région
  de naissance (reconnue grâce aux listes de localités de la carte), avec les quatre quartiers. En bas de la
  feuille, au choix : la carte des provinces et départements de naissance (Belgique, France, Pays-Bas,
  Luxembourg, Allemagne, Royaume-Uni, Irlande, départements d'outre-mer), cadrée sur ceux des ancêtres, ou
  l'origine des ancêtres par génération. Les naissances sur des terres séparées par la mer (îles
  Britanniques, chaque DOM) ont leur cartouche à droite de la carte principale. En option :
  les frères et sœurs du Sosa 1 (mêmes père et mère) avec lui au centre, les dates sans source en italique, le papier (A3, ou A4 réduit), la date en pied de page et un petit code QR vers l'arbre en ligne. D'autres modèles s'ajoutent dans `src/ui/arbres/modeles.ts`.
- **Parents inconnus ou introuvables** (`#/filiation`) : le GEDCOM n'a aucun champ pour dire qu'un
  parent n'est pas à chercher. On l'écrit dans la **note de la personne** (sur Geneanet : rubrique
  « Notes » de l'enfant), qui revient dans chaque export, par une ligne « Filiation: … » (pas de `#` : la
  syntaxe wiki de GeneWeb en fait une liste numérotée) :

  | Mention | Sens |
  |---|---|
  | `Filiation: père inconnu` | l'acte ne nomme pas le père (enfant naturel) |
  | `Filiation: mère inconnue` | l'acte ne nomme pas la mère |
  | `Filiation: parents inconnus` | ni père ni mère (enfant trouvé, abandonné) |
  | `Filiation: père introuvable` | recherche close faute de sources, côté paternel |
  | `Filiation: mère introuvable` | même chose côté maternel |
  | `Filiation: parents introuvables` | les deux |

  Accents, majuscules et accords sont libres, une explication peut suivre sur la même ligne ; un parent présent dans l'arbre l'emporte sur la
  note. Effets : repère à côté du nom, filtre « Parents » (à chercher / inconnus ou introuvables) dans
  Personnes, et places « sans issue » dans la complétude de l'ascendance.

Pour chaque événement, un badge **S** (bleu) ouvre la source en ligne ; un badge **T** (orange)
montre une source écrite en texte.

Chaque nom renvoie à la fiche de la personne sur Geneanet (ou tout autre site GeneWeb) quand l'adresse
de l'arbre est indiquée. Le GEDCOM ne contient pas le numéro qui distingue les homonymes sur GeneWeb :
pour eux, le lien ouvre la recherche, qui les liste tous.

## Le fichier

- Geneanet : *Mon arbre → Exporter* (https://gw.geneanet.org/my-tree/operations/export),
  « Mon arbre en ligne », format GEDCOM. Le `.zip` peut être déposé tel quel : seul le `.ged` est lu.
- Les autres logiciels (Heredis, Ancestris, Gramps, GeneWeb, RootsMagic…) conviennent aussi :
  GEDCOM 5.5 / 5.5.1 en UTF-8, ANSI ou ANSEL, sources en ligne ou en enregistrements `@S1@`,
  dates approximatives, calendriers julien et républicain.

Sur smartphone, le site propose de s'installer sur l'écran d'accueil (bouton « Installer » sur Android,
mode d'emploi « Partager → Sur l'écran d'accueil » sur iPhone) ; il marche ensuite hors ligne.
« Plus tard » repousse la proposition d'un mois.

Le dernier fichier est gardé dans le navigateur (IndexedDB) ; les réglages et les cases cochées aussi
(localStorage). « Oublier mon arbre sur cet appareil » efface tout.

## Développer

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # tests sur un petit arbre d'exemple
GED=~/chemin/arbre.ged npx vitest run tests/reel.test.ts   # essai sur un vrai fichier (non versionné)
npm run build
```

Preact + TypeScript + Vite. La lecture du fichier se fait dans un *worker* (`src/lib/chargement.worker.ts`).

- `src/lib/gedcom/` : décodage, lignes GEDCOM, dates, modèle de l'arbre
- `src/lib/parente.ts` : ancêtres (Sosa), frères et sœurs, homonymes
- `src/lib/filiation.ts` : mentions « Filiation: … » des notes de personne
- `src/lib/suivi.ts` : état des naissance, mariage et décès de chaque personne
- `src/lib/communes.ts` : faits regroupés par lieu
- `src/lib/metiers.ts` : métiers, variantes et féminins
- `src/lib/statistiques.ts` : relevés pour les statistiques (âges, couples, calendrier, générations)
- `src/lib/ascendance.ts` : la page Ascendance (places Sosa, branches, lignées, pistes, implexe, étapes)
- `src/lib/prenoms.ts` : table des variantes de prénoms et leur forme usuelle
- `src/lib/geo.ts` : reconnaissance des pays et des communes pour la carte
- `scripts/geonames.py` : fabrique `public/geo/*.json` à partir des extraits
  [GeoNames](https://download.geonames.org/export/dump/) (CC BY 4.0) :
  `python3 -I scripts/geonames.py <dossier des .zip> public/geo [codes des pays à refaire]`. Les
  départements d'outre-mer (Guadeloupe, Martinique…) ont leur propre fichier et sont reconnus à leur nom ou
  à leur code postal (« Saint-Claude, 97124, Guadeloupe, France »), même suivis de « France »
- `scripts/contours.py` : fabrique `public/geo/contours.json` (contours simplifiés pour la carte de
  l'éventail) à partir des [Admin 1 de Natural Earth](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson)
  (domaine public) : `python3 scripts/contours.py <ne_10m_admin_1_states_provinces.geojson> public/geo/contours.json`
  (avec shapely, pour réunir sans frontières intérieures les découpages plus fins que ceux de GeoNames)
- `src/ui/` : les écrans

## Publier

Le dépôt se publie sur GitHub Pages par `.github/workflows/publier.yml` à chaque `git push` sur `main`
(une fois : *Settings → Pages → Source : GitHub Actions*).

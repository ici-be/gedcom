# Lignées

Suivre les sources de son arbre généalogique à partir d'un fichier GEDCOM.
Le fichier est lu **dans le navigateur** : rien n'est envoyé sur Internet.

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
- `src/lib/suivi.ts` : état des naissance, mariage et décès de chaque personne
- `src/lib/communes.ts` : faits regroupés par lieu
- `src/lib/metiers.ts` : métiers, variantes et féminins
- `src/ui/` : les écrans

## Publier

Le dépôt se publie sur GitHub Pages par `.github/workflows/publier.yml` à chaque `git push` sur `main`
(une fois : *Settings → Pages → Source : GitHub Actions*).

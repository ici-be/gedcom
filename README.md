# Lignées

Suivre les sources de son arbre généalogique à partir d'un fichier GEDCOM.
Le fichier est lu **dans le navigateur** : rien n'est envoyé sur Internet.

**En ligne : https://ici.be/gedcom/**

## Ce que fait le site

- **Accueil** : part des faits sourcés chez les ancêtres et dans tout l'arbre, nombre d'ancêtres et
  de générations, photos et signatures ; le nombre d'ancêtres à sourcer et de lieux à dépouiller ; une carte
  des provinces et départements de naissance des ancêtres (plus foncés qu'il y en est né, un point par commune) ;
  les progrès depuis l'export précédent du même arbre (les chiffres des ancêtres seulement si la personne de
  départ n'a pas changé). Un nouvel export se dépose n'importe où sur la page, ou par « Mettre à jour le
  fichier » dans le menu de gauche, sur toutes les pages. Réglage : adresse de l'arbre en ligne. La personne de départ (Sosa 1) se
  change en haut de chaque page.
- **Personnes** : naissance (ou baptême), mariage(s) et décès (ou inhumation) de chaque personne, avec
  leur état : ✓ sourcé, ! renseigné sans source, ✕ manquant. Les ancêtres sont numérotés
  (Sosa, génération, implexe). Filtres : ancêtres seuls / avec leurs frères et sœurs / tout l'arbre,
  nom, lieu, fait, état, générations, branche (ancêtres d'un Sosa : 2 = côté paternel, 3 = maternel).
  Un clic sur ▸ montre tous les événements et leurs sources. Export CSV.
- **Lieux** : pour chaque commune, le nombre de faits et ceux qui n'ont pas de source ; puis la liste
  des actes à chercher, par type et par siècle, avec une case à cocher quand un acte est trouvé.
  Export CSV. En bas de la page d'un lieu, « Lire sur… » : des recherches toutes prêtes sur la commune
  dans les catalogues (Unicat, KBR, BnF, SUDOC, WorldCat), les bibliothèques numériques (Gallica, Delpher,
  Google Livres, Internet Archive, Persée) et les ouvrages de référence (Tarlier et Wauters pour le Brabant,
  Vander Maelen, Jourdain et Van Stalle, inventaire du patrimoine flamand, Wikipédia), selon le pays et la province.
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
- **Lignée** (`#/lignee/paternelle`, `maternelle`, `longue` ou un numéro Sosa) : une lignée en frise
  verticale, du plus lointain ancêtre à la personne de départ, avec les siècles en repère ; pour chacun
  la naissance, le décès, les métiers et l'union dont naît le suivant (conjoint, âge, autres enfants) ;
  au sommet, de quoi remonter par le père ou la mère, ou pourquoi la lignée s'arrête ; à côté, le
  chemin des lieux et le fil des noms. On y arrive depuis les lignées et les pistes de l'Ascendance.
  Les photos de l'arbre en ligne, s'il y en a, s'affichent sur chaque carte et à côté du conjoint.
- **Carte** : un cercle par lieu, d'autant plus grand qu'il y a de faits, du rouge (rien de sourcé)
  au vert (tout est sourcé). Filtres par personnes, type de fait et siècle, ou seulement les lieux qui
  ont des faits sans source. Un clic mène aux actes du lieu. Les lieux sont reconnus dans des listes de
  localités livrées avec le site (`public/geo/`, d'après GeoNames) : aucun nom de lieu n'est envoyé sur
  Internet, seul le fond de carte OpenStreetMap est téléchargé. Les lieux introuvables (hameau,
  orthographe ancienne, faute de frappe) se placent d'un clic ; ces positions restent dans le
  navigateur et peuvent être exportées.

- **Récit** (`#/recit`) : une notice à la manière des livres de famille sur une personne choisie, ses
  descendants (jusqu'à cinq générations, en listes 1., a), i.…) puis ses ancêtres (jusqu'à huit générations), un
  couple par notice avec les numéros Sosa entre crochets : « Né le… à…, il y mourut le… à l'âge de… Il s'était
  marié le…, alors qu'il avait… ans, avec…, fille de…, âgée de… Le couple a eu deux garçons et une fille : … ».
  Remariages (« une première fois », « en secondes et dernières noces », veuvage), divorces, « Du premier lit ».
  En notes de bas de partie : témoins et parrains avec leur âge et leur parenté (« son oncle du côté paternel »),
  baptême, domiciles, registres, service militaire, autres unions d'un conjoint, enfant né peu après le
  mariage, parent mort peu avant, notes des actes et, au choix, les sources. Chaque nom mène au récit de cette
  personne, chaque numéro à sa notice ; le texte se copie ou s'imprime. Les photos de l'arbre en ligne,
  s'il y en a, accompagnent la notice de chaque personne et de son conjoint.
  En cochant **Événements historiques**, chaque notice dit aussi ce que la personne et son conjoint ont connu près
  de chez eux, trois événements au plus : « Le 18 juin 1815, alors qu'il avait 24 ans, la bataille de Waterloo se
  livra à 4 km de Waterloo, où il vivait. Il connut aussi la révolution belge (1830-1831)… ». Batailles, sièges,
  bombardements, incendies, inondations, explosions et séismes à moins de 5 à 80 km selon leur nature et leur ampleur ; épidémies,
  famines, hivers, guerres et changements de régime du pays ou de la province (pas avant six ans). Le lieu de vie à
  une date vient des actes les plus proches (les siens, ceux de ses mariages, la naissance de ses enfants), « sans
  doute » quand aucun n'est à moins de trois ans. Chaque événement, avec son icône, mène à sa page
  (`#/evenements/Q48314`) : les personnes de l'arbre qui l'ont connu, leur âge, leur commune et la distance ;
  pour un événement meurtrier daté au mois près (ni guerre ni régime, moins de deux ans), la page signale aussi les
  actes de décès où il a peut-être laissé des traces : « On en trouvera peut-être des traces dans les actes de décès
  d'Anderlecht (à 1 km) de novembre 1792, à feuilleter depuis l'acte de décès de Jean Dupont (9 mars 1790) ou celui
  de Marie Lebrun (21 août 1798) », d'après les décès et inhumations de l'arbre datés au mois près, dont une source
  est un lien : ceux de l'événement et du mois qui suit, à défaut (événement ponctuel) le plus proche avant et le plus
  proche après, à dix ans au plus, qui ouvrent le même registre. Cinq communes au plus, les plus proches d'abord :
  traverser tout le rayon de l'événement compte comme dix ans d'écart ;
  `#/evenements` les liste tous, par siècle.
- **Migrations** (`#/migrations`) : où vivaient les ancêtres directs (jusqu'à la seizième génération), d'après
  les lieux de naissance ou de baptême, de mariage et de décès ou d'inhumation situés grâce aux listes de
  localités, sur des cartes au style de l'éventail imprimé (mêmes teintes de régions). Trois onglets :
  **Siècles et lignées** (une carte par siècle avec les déplacements du lieu de naissance du parent à celui de
  l'enfant, la carte d'un siècle en grand avec ses plus longs déplacements, puis le chemin d'une lignée de père
  en père ou de mère en mère, aussi accessible depuis la page Lignée) ; **Quartiers** (le point moyen des
  naissances de chaque génération, quartier par quartier) ; **Au fil des années** (les ancêtres en vie année par
  année, qu'on peut faire défiler, et la distance entre parent et enfant au fil du temps).
- **Imprimer** (aussi seul, sans les autres onglets, sur `/print/` : le menu n'y montre que le titre, la personne de départ et la mise à jour du fichier). La page et les feuilles imprimées existent en français, anglais et néerlandais (boutons FR · EN · NL du menu) ; chaque langue a son adresse, `/print+fr-be/`, `/print+en-gb/` et `/print+nl-be/`, et `/print/` suit la langue du navigateur (ou le dernier choix) ; ces pages se régénèrent avec `node scripts/pages-print.mjs` : les textes français servent de clés, les traductions sont dans `src/lib/langues/` : des arbres prêts pour l'imprimeur ou pour un PDF. Premier modèle, l'**éventail des
  origines** (A3 paysage) : huit générations sur 220°, chaque ancêtre teinté selon sa province ou sa région
  de naissance (reconnue grâce aux listes de localités de la carte), avec les quatre quartiers. En bas de la
  feuille, au choix : la carte des provinces et départements de naissance (Belgique, France, Pays-Bas,
  Luxembourg, Allemagne, Royaume-Uni, Irlande, départements d'outre-mer), cadrée sur ceux des ancêtres, ou
  l'origine des ancêtres par génération. Les naissances sur des terres séparées par la mer (îles
  Britanniques, chaque DOM) ont leur cartouche à droite de la carte principale. En option :
  les mariages (une boule teintée selon la province du mariage au pied de la jointure entre les époux, sans empiéter sur le texte de la case de leur enfant ; avec l'année jusqu'à la génération VI, plus petite et sans année jusqu'à la VIII), les frères et sœurs du Sosa 1 (mêmes père et mère) avec lui au centre, les dates sans source en italique, le papier (A3, ou A4 réduit), la date en pied de page et un petit code QR vers l'arbre en ligne. Au **verso**, si on le coche : les
  **128 bouts de branche**, chaque case du bord de l'éventail prolongée d'un petit éventail des générations IX à XV,
  par quartier et dans l'ordre Sosa, aux mêmes teintes de régions qu'au recto (une seconde page à l'impression,
  recto verso retourné sur le bord court). Second modèle, l'**arbre en pyramide** (A3 paysage) : l'arbre
  traditionnel, la personne de départ en bas et de quatre à neuf générations en rangées (huit par défaut), avec un choix de thèmes de couleurs
  (quatre quartiers par défaut, par génération, gravure, bleu et rose, sauge et terre cuite, ardoise et ocre, forêt et prune, sépia et ambre) ; les générations I à V en cartouches (photo ou signature, prénoms, nom, années, commune,
  métier), VI à IX en étiquettes verticales ; les places sans ancêtre en pointillé (« à trouver », « père
  inconnu »). En option : le mariage des parents au-dessus des cases des générations I à IV (« ∞ 1905 · Bruxelles », la commune si elle tient), les photos (portraits en carré à bords arrondis par défaut, ou en ovale / rectangle, avec ou sans bords arrondis ; les signatures gardent leur forme), et les frères et sœurs de chacun, à côté ou sous la case avec leur année
  de naissance quand la place le permet, sinon les prénoms seuls ou « + n », et leur nombre en génération VI.
  Troisième modèle, l'**arbre en sablier** (ascendance et descendance, A3 paysage) : la personne de départ au centre
  avec son ou ses conjoints, de 1 à 6 générations d'ancêtres au-dessus et de 1 à 3 générations de descendants en dessous,
  avec les mêmes thèmes de couleurs, photos, frères et sœurs et mariages que la pyramide.
  Quatrième modèle, l'**arbre du couple** (A3 paysage) : la personne de départ et son conjoint côte à côte au centre
  (l'homme à gauche, la femme à droite ; au choix parmi les conjoints s'il y en a plusieurs), les ancêtres de chacun
  sur sa moitié de la feuille (1 à 6 générations), leurs descendants communs en dessous (1 à 3 générations), avec les
  mêmes options que le sablier ; un ancêtre commun aux deux est marqué ◆.
  D'autres modèles s'ajoutent dans `src/ui/arbres/modeles.ts`.
- **Graphe des relations** (`#/graphe`) : qui côtoyait qui. On choisit les personnes — l'**entourage**
  d'une personne (1 à 5 liens autour d'elle), un ou **plusieurs métiers** (recherche, puces colorées,
  « ajouter les N » pour prendre d'un coup toutes les variantes de « music » ou « chant »), un **nom** ou un
  **lieu** d'acte (avec `*` et `?`), avec ou sans leur famille proche — et les liens à montrer : famille,
  parrains et marraines, témoins, co-témoins (témoins du même acte). Les témoins sont lus acte par acte
  (`2 ASSO` sous BIRT, BAPM, DEAT, MARR ; les `1 ASSO @F…@` de Geneanet, qui les répètent, sont ignorés) ;
  témoins et parrains d'une naissance sont aussi reliés aux parents, qui les ont choisis, mais pas ceux d'un
  mariage ou d'un décès. Couleur au choix : métier (8 teintes fixes), sources, ancêtres. Un clic sur une
  personne met en évidence ses voisins et ouvre sa fiche, où chaque lien est expliqué (« témoin à son mariage
  (1820) », « sa marraine (1823) », « parrain au baptême de son enfant Jean (1800) »…) ; « Son entourage »
  recentre le graphe sur elle. Dessin sur canvas, simulation dans un worker : quelques milliers de personnes
  restent fluides (au-delà de 6 000, il faut préciser la recherche).
- **Doublons** (`#/doublons`, dans le menu) : les paires de personnes de même nom et prénoms (accents, tirets et
  majuscules ignorés, comme GeneWeb) dont les dates ne s'écartent pas de plus de deux ans et qui ont une date, un lieu, un
  parent ou un conjoint en commun ; « Comparer » ouvre la recherche de l'arbre en ligne, d'où l'on fusionne les deux fiches.
- **Annotations** (`#/annotations`, dans le menu) : ce que le GEDCOM ne sait pas dire s'écrit dans les notes
  de l'arbre ; la page présente les trois mentions ci-dessous (à copier), leur nombre dans l'arbre, et
  renvoie vers la page de chacune, qui ramène aux annotations.
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
- **Sources introuvables** (`#/introuvables`) : un acte qu'on a cherché et qui ne se trouvera pas
  (registres brûlés, lacune…) se note dans la **note de l'événement** (naissance, baptême, mariage,
  décès…) par une ligne `Source: introuvable`, suivie si l'on veut de la raison entre parenthèses :
  `Source: introuvable (les archives de 1789 à 1820 ont brûlé en 1914)`. Majuscules et pluriel libres,
  `Acte: introuvable` est reconnu aussi ; une source attachée à l'événement l'emporte sur la note.
  Le fait prend l'état « source introuvable » (pastille ∅, raison au survol) : il n'est plus « à
  compléter », ni compté parmi les ancêtres à sourcer, les actes à chercher par lieu ou sur la carte,
  sans compter pour autant comme sourcé. Un filtre « Source introuvable » les retrouve, et le récit
  cite l'acte introuvable et sa raison en note.
- **Illettrés** (`#/illettres`) : une personne qui ne savait pas signer se note dans sa **note**
  (sur Geneanet : rubrique « Notes ») par une ligne `Signature: illettré`, suivie si l'on veut de l'acte
  qui l'établit : `Signature: ne sait pas signer (acte de mariage, Ath 1820)`. Accents, majuscules et
  accords libres ; `illettrée`, `ne savait pas écrire`, `analphabète`, `une croix`, `une marque` sont
  reconnus aussi. La page liste ces personnes (ancêtres d'abord, par numéro Sosa), signale celles qui ont
  pourtant une signature dans l'arbre, et offre une case à cocher par personne pour retenir celles déjà
  modifiées sur Geneanet : les cases tiennent dans le navigateur jusqu'au prochain fichier chargé.
  Dans **Personnes**, une petite plume suit le nom de qui a sa signature dans l'arbre, une croix celui
  de qui ne savait pas signer ; la fiche dépliée montre la signature, ou la mention et sa précision.

Pour chaque événement, un badge **S** (bleu) ouvre la source en ligne ; un badge **T** (orange)
montre une source écrite en texte.

Chaque nom renvoie à la fiche de la personne sur Geneanet (ou tout autre site GeneWeb) quand l'adresse
de l'arbre est indiquée. Le GEDCOM ne contient pas le numéro qui distingue les homonymes sur GeneWeb :
pour eux, le lien ouvre la recherche, qui les liste tous.

## Le fichier

- Geneanet : *Mon arbre → Exporter* (https://gw.geneanet.org/my-tree/operations/export),
  « Mon arbre en ligne », format GEDCOM. Le `.zip` peut être déposé tel quel : seul le `.ged` est lu.
  En cochant « Liens web vers les photos principales des individus », Récit et Lignée montrent ces
  photos (case « Photos et signatures », cochée par défaut) : un JPEG en médaillon, un PNG comme une
  signature, à l'encre claire en mode sombre. Les images viennent directement de Geneanet, qui voit
  donc lesquelles sont demandées ; une image qui ne se charge pas est simplement omise.
- Les autres logiciels (Heredis, Ancestris, Gramps, GeneWeb, RootsMagic…) conviennent aussi :
  GEDCOM 5.5 / 5.5.1 en UTF-8, ANSI ou ANSEL, sources en ligne ou en enregistrements `@S1@`,
  dates approximatives, calendriers julien et républicain.

Sur smartphone, le site propose de s'installer sur l'écran d'accueil (bouton « Installer » sur Android,
mode d'emploi « Partager → Sur l'écran d'accueil » sur iPhone) ; il marche ensuite hors ligne.
« Plus tard » repousse la proposition d'un mois.

Le dernier fichier est gardé dans le navigateur (IndexedDB) ; les réglages et les cases cochées aussi
(localStorage). « Oublier mon arbre sur cet appareil » efface tout.

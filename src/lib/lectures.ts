// Où lire sur l'histoire d'une commune : des recherches toutes prêtes dans les catalogues de bibliothèques,
// les bibliothèques numériques et les ouvrages qui ont une notice pour chaque commune.

export interface Lecture {
  titre: string
  /** Ce qu'on y trouve */
  detail: string
  url: string
}

export interface Rayon {
  titre: string
  lectures: Lecture[]
}

const BRABANT = ['BE.BRU', 'BE.VBR', 'BE.WBR']
const FLANDRE = ['BE.VAN', 'BE.VBR', 'BE.VLI', 'BE.VOV', 'BE.VWV']

/** « Saint-Ghislain (Hainaut) » → « Saint-Ghislain » */
export function nomRecherche(commune: string): string {
  return commune.replace(/\s*\(.*\)\s*$/, '').replace(/^\[[^\]]*\]\s*-\s*/, '').trim()
}

const q = encodeURIComponent

function livresGoogle(requete: string): string {
  return 'https://www.google.com/search?tbm=bks&q=' + q(requete)
}

/** Les rayons à parcourir pour une commune, selon son pays et sa province */
export function lectures(commune: string, pays?: string, codeRegion?: string): Rayon[] {
  const nom = nomRecherche(commune)
  if (!nom) return []
  const exact = `"${nom}"`
  const flamand = pays === 'BE' && !!codeRegion && FLANDRE.includes(codeRegion)
  const neerlandais = pays === 'NL' || flamand

  const catalogues: Lecture[] = []
  if (pays === 'BE') {
    catalogues.push(
      { titre: 'Unicat', detail: 'catalogue commun des bibliothèques belges, avec les bulletins des cercles d\'histoire', url: 'https://www.unicat.be/uniCat?func=search&query=' + q(nom) },
      { titre: 'KBR', detail: 'Bibliothèque royale de Belgique', url: 'https://opac.kbr.be/Library/search.aspx?SC=CATALOGUE&QUERY=' + q(nom) },
    )
  }
  if (pays === 'BE' || pays === 'FR' || pays === 'LU' || pays === 'CH') {
    catalogues.push({ titre: 'BnF', detail: 'catalogue général de la Bibliothèque nationale de France', url: 'https://catalogue.bnf.fr/rechercher.do?motRecherche=' + q(nom) })
  }
  if (pays === 'FR') {
    catalogues.push({ titre: 'SUDOC', detail: 'bibliothèques universitaires françaises', url: 'https://www.sudoc.abes.fr/cbs/DB=2.1/CMD?ACT=SRCHA&IKT=1016&SRT=RLV&TRM=' + q(nom) })
  }
  catalogues.push({ titre: 'WorldCat', detail: 'bibliothèques du monde entier', url: 'https://search.worldcat.org/search?q=' + q(nom) })

  const numeriques: Lecture[] = []
  if (pays === 'BE' || pays === 'FR' || pays === 'LU' || pays === 'CH') {
    numeriques.push({ titre: 'Gallica', detail: 'livres, revues et journaux anciens à lire en ligne', url: 'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=' + q(`(gallica all ${exact})`) })
  }
  if (neerlandais) {
    numeriques.push({ titre: 'Delpher', detail: 'livres anciens en néerlandais à lire en ligne', url: 'https://www.delpher.nl/nl/boeken/results?query=' + q(exact) })
  }
  numeriques.push(
    { titre: 'Google Livres', detail: 'recherche dans le texte des livres numérisés', url: livresGoogle(exact) },
    { titre: 'Internet Archive', detail: 'livres anciens numérisés', url: 'https://archive.org/search?query=' + q(exact) },
  )
  if (pays === 'BE' || pays === 'FR') {
    numeriques.push({ titre: 'Persée', detail: 'articles des revues savantes', url: 'https://www.persee.fr/search?q=' + q(exact) })
  }

  const generaux: Lecture[] = []
  if (pays === 'BE') {
    if (codeRegion && BRABANT.includes(codeRegion)) {
      generaux.push({ titre: 'Tarlier et Wauters, La Belgique ancienne et moderne', detail: 'une notice historique par commune du Brabant (1859-1887)', url: livresGoogle(`${exact} intitle:"Belgique ancienne et moderne"`) })
    }
    generaux.push(
      { titre: 'Vander Maelen, Dictionnaire géographique', detail: 'un volume par province (années 1830)', url: livresGoogle(`${exact} inauthor:"Vander Maelen" intitle:dictionnaire`) },
      { titre: 'Jourdain et Van Stalle, Dictionnaire encyclopédique de géographie historique du royaume de Belgique', detail: 'toutes les communes (1895-1896)', url: livresGoogle(`${exact} intitle:"géographie historique du royaume de Belgique"`) },
    )
    if (flamand) {
      generaux.push({ titre: 'Inventaris Onroerend Erfgoed', detail: 'patrimoine de la Flandre, avec la bibliographie de chaque bien', url: 'https://inventaris.onroerenderfgoed.be/erfgoedobjecten?tekst=' + q(nom) })
    }
  }
  const wiki = neerlandais ? 'nl' : pays === 'DE' ? 'de' : 'fr'
  generaux.push({ titre: `Wikipédia${wiki === 'fr' ? '' : ` (${wiki})`}`, detail: 'l\'article de la commune finit souvent par une bibliographie', url: `https://${wiki}.wikipedia.org/w/index.php?search=` + q(nom) })

  return [
    { titre: 'Catalogues de bibliothèques', lectures: catalogues },
    { titre: 'À lire en ligne', lectures: numeriques },
    { titre: 'Ouvrages et notices de référence', lectures: generaux },
  ]
}

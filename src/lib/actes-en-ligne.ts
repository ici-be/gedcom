// Actes en ligne cités comme sources : de quel site ils viennent, et la file des actes des ancêtres à télécharger
// (scripts/actes.mjs), du Sosa le plus proche au plus lointain.

import type { Arbre, Evenement, Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import { libelle } from './format'
import { comparerSosa, type Ancetre } from './parente'

export interface Site {
  id: string
  nom: string
  court: string
  /** L'adresse est celle d'une image de registre de ce site */
  image: (url: URL) => boolean
}

export const SITES: Site[] = [
  {
    id: 'familysearch', nom: 'FamilySearch', court: 'FamilySearch',
    image: (u) => /(^|\.)familysearch\.org$/.test(u.hostname) && (/^\/ark:\/61903\/3:[12]:/.test(u.pathname) || (u.pathname.startsWith('/records/images/') && u.searchParams.has('rmsId'))),
  },
  {
    id: 'agatha', nom: 'Agatha (Archives de l’État)', court: 'Agatha',
    image: (u) => u.hostname === 'agatha.arch.be' && /\/data\/images\/\d+\/[^/]+\/[^/]+/.test(u.pathname),
  },
]

function lireUrl(lien: string): URL | undefined {
  try { return new URL(lien) } catch { return undefined }
}

/** « familysearch », « agatha » ou « autre » */
export function siteDuLien(lien: string): string {
  const u = lireUrl(lien)
  if (!u) return 'autre'
  if (/(^|\.)familysearch\.org$/.test(u.hostname)) return 'familysearch'
  if (u.hostname === 'agatha.arch.be') return 'agatha'
  return 'autre'
}

/**
 * Identifiant de l'image, le même quelle que soit la façon d'écrire son adresse :
 * « familysearch:3:1:S3HT-6QV1-X5 », « familysearch:TH-909-52996-44514-15 », « agatha:510/510_1385_000_00430_000/0_3548 ».
 * undefined : ce n'est pas une image de registre (page d'accueil, fiche indexée, recherche…)
 */
export function identifiantImage(lien: string): string | undefined {
  const u = lireUrl(lien.replace(/[)\].,;]+$/, ''))
  if (!u) return undefined
  const site = SITES.find((s) => s.image(u))
  if (!site) return undefined
  if (site.id === 'familysearch') {
    const ark = /^\/ark:\/61903\/(3:[12]:[A-Z0-9-]+)/i.exec(u.pathname)
    return 'familysearch:' + (ark ? ark[1].toUpperCase() : u.searchParams.get('rmsId'))
  }
  const m = /\/data\/images\/(\d+\/[^/]+\/[^/]+)/.exec(u.pathname)!
  return 'agatha:' + m[1]
}

/** Toutes les adresses d'un texte de source (il peut en citer plusieurs) */
export function liensDuTexte(texte: string): string[] {
  return (texte.match(/https?:\/\/[^\s<>"]+/gi) ?? []).map((l) => l.replace(/[)\].,;]+$/, ''))
}

export interface ActeEnLigne {
  /** Identifiant de l'image (voir identifiantImage) */
  id: string
  site: string
  url: string
  sosa: string
  generation: number
  /** « Naissance », « Mariage »… */
  type: string
  annee?: number
  /** « DUPONT Jean » ou « DUPONT Jean & LAMBERT Marie » */
  personnes: string
  /** Chemin proposé, sans extension : « G05/0018 Naissance 1843 DE BRULE Jean Baptiste » */
  fichier: string
}

export interface OptionsFile {
  /** Dernière génération à prendre (1 = la personne de départ) */
  generations?: number
  sites?: string[]
}

const propre = (s: string) => s.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
const nomCourt = (ind: Individu) => [ind.nom ? ind.nom.toUpperCase() : '?', ind.prenom.split(/\s+/).slice(0, 2).join(' ') || '?'].join(' ')

/**
 * Les images de registre citées dans les actes des ancêtres (naissance, baptême, mariage, décès et autres faits),
 * une fois chacune, dans l'ordre des numéros Sosa : les plus proches d'abord.
 */
export function fileActes(arbre: Arbre, ancetres: ReadonlyMap<string, Ancetre>, options: OptionsFile = {}): ActeEnLigne[] {
  const actes = new Map<string, ActeEnLigne>()
  const noms = new Set<string>()
  const liste = [...ancetres.values()]
    .filter((a) => !options.generations || a.generation <= options.generations)
    .sort((a, b) => comparerSosa(a.sosa, b.sosa))

  const ajouter = (a: Ancetre, type: string, an: number | undefined, personnes: string, sources: string[]) => {
    let n = 0
    for (const lien of sources.flatMap(liensDuTexte)) {
      const id = identifiantImage(lien)
      if (!id || actes.has(id)) continue
      const site = id.slice(0, id.indexOf(':'))
      if (options.sites && !options.sites.includes(site)) continue
      const base = `G${String(a.generation).padStart(2, '0')}/${a.sosa.padStart(4, '0')} ${propre([type, an ?? '', personnes].filter(Boolean).join(' '))}`.slice(0, 150)
      // plusieurs images pour un même acte (acte sur deux pages, pièces annexes) : « … (2) »
      let fichier = base
      while (noms.has(fichier)) fichier = `${base} (${++n + 1})`
      noms.add(fichier)
      actes.set(id, { id, site, url: lien, sosa: a.sosa, generation: a.generation, type, annee: an, personnes, fichier })
    }
  }
  const evenement = (a: Ancetre, e: Evenement, personnes: string) => ajouter(a, libelle(e).replace(/^Profession : .*/, 'Profession'), annee(e.date), personnes, e.sources)

  for (const a of liste) {
    const ind = arbre.individus.get(a.id)
    if (!ind) continue
    for (const e of ind.evenements) evenement(a, e, nomCourt(ind))
    ajouter(a, 'Source', undefined, nomCourt(ind), ind.sources)
    for (const f of ind.fams) {
      const fam = arbre.familles.get(f)
      if (!fam) continue
      const conjoints = [fam.mari, fam.femme].map((x) => (x ? arbre.individus.get(x) : undefined)).filter((x): x is Individu => !!x)
      const personnes = conjoints.map(nomCourt).join(' & ')
      for (const e of fam.evenements) evenement(a, e, personnes)
      ajouter(a, 'Source du couple', undefined, personnes, fam.sources)
    }
  }
  return [...actes.values()]
}

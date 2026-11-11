// Actes en ligne cités comme sources : de quel site ils viennent, et la file des actes des ancêtres à télécharger
// (scripts/actes.mjs), du Sosa le plus proche au plus lointain.

import type { Arbre, Evenement, Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import { libelle } from './format'
import { decouperLieu } from './communes'
import { comparerSosa, type Ancetre } from './parente'
import { actesASignatures, sansSignature } from './signatures'

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
  /** Commune de l'acte */
  lieu?: string
  /** « DUPONT Jean » ou « DUPONT Jean & LAMBERT Marie » */
  personnes: string
  /** Chemin proposé, sans extension : « G05/18 DE BRULE Jean Baptiste/1843 Naissance DE BRULE Jean Baptiste » */
  fichier: string
  /** Mots-clés écrits dans l'image : type d'acte, année, patronymes, commune, « Sosa 18 », « Génération 5 », site */
  etiquettes: string[]
  /** File des signatures : ceux dont la signature est à chercher sur l'image, « époux : DUPONT Paul (Sosa 2) » */
  signataires?: string[]
}

export interface OptionsFile {
  /** Dernière génération à prendre (1 = la personne de départ) */
  generations?: number
  sites?: string[]
}

const propre = (s: string) => s.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim()
const nomCourt = (ind: Individu) => [ind.nom ? ind.nom.toUpperCase() : '?', ind.prenom.split(/\s+/).slice(0, 2).join(' ') || '?'].join(' ')

/**
 * Dossier d'un ancêtre : « G05/18 DE BRULE Jean Baptiste ». Le numéro Sosa est complété de zéros à la largeur de sa
 * génération (« 0512 » à « 1023 » en G10), pour que les dossiers se suivent dans l'ordre Sosa.
 */
export function dossierAncetre(a: Ancetre, ind: Individu): string {
  const largeur = String((1n << BigInt(a.generation)) - 1n).length
  return `G${String(a.generation).padStart(2, '0')}/${propre(`${a.sosa.padStart(largeur, '0')} ${nomCourt(ind)}`)}`
}

const NOMS_SITES: Record<string, string> = { familysearch: 'FamilySearch', agatha: 'Agatha' }

function etiquettes(a: Ancetre, type: string, an: number | undefined, lieu: string | undefined, site: string, personnes: Individu[]): string[] {
  const noms = personnes.map((p) => p.nom.toUpperCase()).filter(Boolean)
  return [...new Set([type, an === undefined ? '' : String(an), ...noms, lieu ?? '', `Sosa ${a.sosa}`, `Génération ${a.generation}`, NOMS_SITES[site] ?? site].filter(Boolean))]
}

/** Nom libre parmi ceux déjà pris : « … », « … (2) », « … (3) » */
function libre(base: string, pris: Set<string>): string {
  let nom = base
  for (let n = 2; pris.has(nom.toLowerCase()); n++) nom = `${base} (${n})`
  pris.add(nom.toLowerCase())
  return nom
}

/**
 * Les images de registre citées dans les actes des ancêtres (naissance, baptême, mariage, décès et autres faits),
 * une fois chacune, dans l'ordre des numéros Sosa : les plus proches d'abord. Un dossier par ancêtre, ses actes par
 * année ; l'acte d'un couple est rangé chez celui des deux qui a le plus petit numéro Sosa (le mari).
 */
export function fileActes(arbre: Arbre, ancetres: ReadonlyMap<string, Ancetre>, options: OptionsFile = {}): ActeEnLigne[] {
  const actes = new Map<string, ActeEnLigne>()
  const noms = new Set<string>()
  const liste = [...ancetres.values()]
    .filter((a) => !options.generations || a.generation <= options.generations)
    .sort((a, b) => comparerSosa(a.sosa, b.sosa))

  const ajouter = (a: Ancetre, dossier: string, type: string, e: Evenement | undefined, personnes: Individu[], sources: string[]) => {
    const an = annee(e?.date)
    const lieu = e?.lieu ? decouperLieu(e.lieu).nom : undefined
    const qui = personnes.map(nomCourt).join(' & ')
    for (const lien of sources.flatMap(liensDuTexte)) {
      const id = identifiantImage(lien)
      if (!id || actes.has(id)) continue
      const site = id.slice(0, id.indexOf(':'))
      if (options.sites && !options.sites.includes(site)) continue
      // plusieurs images pour un même acte (acte sur deux pages, pièces annexes) : « … (2) »
      const fichier = libre(`${dossier}/${propre(`${an ?? 'sans date'} ${type} ${qui}`).slice(0, 120)}`, noms)
      actes.set(id, { id, site, url: lien, sosa: a.sosa, generation: a.generation, type, annee: an, lieu, personnes: qui, fichier, etiquettes: etiquettes(a, type, an, lieu, site, personnes) })
    }
  }
  const type = (e: Evenement) => libelle(e).replace(/^Profession\b.*/, 'Profession')

  for (const a of liste) {
    const ind = arbre.individus.get(a.id)
    if (!ind) continue
    const dossier = dossierAncetre(a, ind)
    for (const e of ind.evenements) ajouter(a, dossier, type(e), e, [ind], e.sources)
    ajouter(a, dossier, 'Source', undefined, [ind], ind.sources)
    for (const f of ind.fams) {
      const fam = arbre.familles.get(f)
      if (!fam) continue
      const conjoints = [fam.mari, fam.femme].map((x) => (x ? arbre.individus.get(x) : undefined)).filter((x): x is Individu => !!x)
      for (const e of fam.evenements) ajouter(a, dossier, type(e), e, conjoints, e.sources)
      ajouter(a, dossier, 'Source du couple', undefined, conjoints, fam.sources)
    }
  }
  return [...actes.values()]
}

/**
 * Les images des actes où la signature d'un ancêtre est à trouver (voir signatures.ts), les plus prometteuses d'abord,
 * rangées dans « Signatures à chercher/ » avec la liste de ceux qu'on y cherche.
 */
export function fileSignatures(arbre: Arbre, ancetres: ReadonlyMap<string, Ancetre>, options: OptionsFile = {}): ActeEnLigne[] {
  const actes = new Map<string, ActeEnLigne>()
  const noms = new Set<string>()
  for (const a of actesASignatures(arbre, ancetres)) {
    const cherches = a.signataires.filter((s) => sansSignature(s.etat))
    const directs = cherches.map((s) => ancetres.get(s.id)).filter((x): x is Ancetre => !!x && (!options.generations || x.generation <= options.generations))
    if (!directs.length) continue
    const premier = directs.sort((x, y) => comparerSosa(x.sosa, y.sosa))[0]
    const sujets = a.sujets.map((id) => arbre.individus.get(id)).filter((x): x is Individu => !!x)
    const personnes = sujets.map(nomCourt).join(' & ')
    const type = libelle(a.evenement)
    const an = annee(a.evenement.date)
    const lieu = a.evenement.lieu ? decouperLieu(a.evenement.lieu).nom : undefined
    const signataires = cherches.map((s) => {
      const ind = arbre.individus.get(s.id)!
      const sosa = ancetres.get(s.id)?.sosa
      return `${s.role}\u202f: ${nomCourt(ind)}${sosa ? ` (Sosa ${sosa})` : ''}${s.certitude === 'possible' ? ', possible' : ''}${s.etat === 'photo' ? ', à vérifier' : ''}`
    })
    for (const lien of a.liens) {
      const id = identifiantImage(lien)
      if (!id || actes.has(id)) continue
      const site = id.slice(0, id.indexOf(':'))
      if (options.sites && !options.sites.includes(site)) continue
      const fichier = libre(`Signatures à chercher/${propre(`${an ?? 'sans date'} ${type} ${personnes}`).slice(0, 120)}`, noms)
      actes.set(id, {
        id, site, url: lien, sosa: premier.sosa, generation: premier.generation, type, annee: an, lieu, personnes, fichier, signataires,
        etiquettes: [...etiquettes(premier, type, an, lieu, site, sujets), 'Signature à chercher'],
      })
    }
  }
  return [...actes.values()]
}

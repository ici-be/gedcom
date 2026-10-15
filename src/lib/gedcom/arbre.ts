// Modèle de l'arbre : individus, familles et leurs événements, à partir des nœuds GEDCOM.

import { enfant, lireNoeuds, valeur, type Noeud } from './lecture'
import { lireDate, type DateGed } from './dates'
import { lireFiliation, type Filiation } from '../filiation'
import { lireIntrouvable, type Introuvable } from '../introuvable'

export interface Evenement {
  tag: string
  /** Précision du GEDCOM (2 TYPE), utile pour EVEN et FACT */
  type?: string
  date?: DateGed
  lieu?: string
  sources: string[]
  note?: string
  /** Recherche close faute d'acte, d'après la note (« Source: introuvable (registres brûlés) ») */
  introuvable?: Introuvable
  /** L'événement est déclaré sans date ni lieu (« 1 DEAT Y ») */
  avere: boolean
  /** Personnes citées dans l'acte (« 2 ASSO @I1@ », « 3 RELA Witness ») : témoins, parrain et marraine… */
  temoins?: Temoin[]
}

export interface Temoin { id: string; rela: string }

export interface Individu {
  id: string
  prenom: string
  nom: string
  sexe: 'M' | 'F' | '?'
  evenements: Evenement[]
  /** Familles où il est enfant / conjoint */
  famc: string[]
  fams: string[]
  metiers: string[]
  /** Sources attachées à la personne plutôt qu'à un événement */
  sources: string[]
  /** Notes de la personne (« 1 NOTE »), renvois « @N1@ » compris */
  note?: string
  /** Parent inconnu ou introuvable, d'après la note (« Filiation: père inconnu »…) */
  filiation?: Filiation
  /** Photo principale en ligne (« 1 OBJE », « 2 FILE https://… ») : visage, ou signature si c'est un PNG */
  photo?: Photo
}

export interface Photo { url: string; signature: boolean }

export interface Famille {
  id: string
  mari?: string
  femme?: string
  enfants: string[]
  evenements: Evenement[]
  sources: string[]
}

export interface Arbre {
  individus: Map<string, Individu>
  familles: Map<string, Famille>
  /** Logiciel et base d'origine (en-tête du fichier) */
  origine: { logiciel?: string; base?: string; date?: string }
}

const EVENEMENTS = new Set([
  'BIRT', 'CHR', 'BAPM', 'BARM', 'BASM', 'BLES', 'CHRA', 'CONF', 'FCOM', 'ORDN', 'ADOP',
  'DEAT', 'BURI', 'CREM', 'PROB', 'WILL',
  'MARR', 'MARB', 'MARC', 'MARL', 'MARS', 'ENGA', 'DIV', 'DIVF', 'ANUL', 'SEP',
  'EVEN', 'FACT', 'CENS', 'RESI', 'IMMI', 'EMIG', 'NATU', 'GRAD', 'RETI', 'EDUC', 'MILI', 'TITL', 'OCCU',
])

/** Texte d'une source : citation en ligne (« 2 SOUR texte ») ou renvoi à un enregistrement « 0 @S1@ SOUR ». */
function lireSources(n: Noeud, titres: Map<string, string>): string[] {
  const sources: string[] = []
  for (const s of n.enfants) {
    if (s.tag !== 'SOUR') continue
    const v = s.valeur.trim()
    const base = /^@[^@]+@$/.test(v) ? (titres.get(v) ?? v) : v
    const page = valeur(s, 'PAGE')
    // GeneWeb exporte ses pages wiki comme une source vide « 3 PAGE geneweb wiki notes: … » : on l'ignore
    if (!base && page.startsWith('geneweb wiki')) continue
    const texte = [base, page].filter(Boolean).join(', ')
    if (texte) sources.push(texte)
  }
  return sources
}

/** Toutes les notes d'un nœud, renvois « @N1@ » compris */
function lireNote(n: Noeud, notes: Map<string, string>): string {
  return n.enfants
    .filter((e) => e.tag === 'NOTE')
    .map((e) => {
      const v = e.valeur.trim()
      return /^@[^@]+@$/.test(v) ? (notes.get(v) ?? '') : e.valeur
    })
    .filter((t) => t.trim())
    .join('\n')
}

function lireEvenement(n: Noeud, titres: Map<string, string>, notes: Map<string, string>): Evenement {
  const date = valeur(n, 'DATE')
  const lieu = valeur(n, 'PLAC').replace(/\s+/g, ' ')
  const type = valeur(n, 'TYPE') || (n.tag === 'OCCU' || n.tag === 'TITL' ? n.valeur.trim() : '')
  const note = lireNote(n, notes).trim()
  const e: Evenement = { tag: n.tag, sources: lireSources(n, titres), avere: n.valeur.trim().toUpperCase() === 'Y' }
  if (type) e.type = type
  if (date) e.date = lireDate(date)
  if (lieu) e.lieu = lieu
  if (note) {
    e.note = note
    const i = lireIntrouvable(note)
    if (i) e.introuvable = i
  }
  const temoins = n.enfants
    .filter((a) => a.tag === 'ASSO' && /^@[^@]+@$/.test(a.valeur.trim()))
    .map((a) => ({ id: a.valeur.trim(), rela: valeur(a, 'RELA') }))
  if (temoins.length) e.temoins = temoins
  return e
}

/** Photo d'un « 1 OBJE » : seules les adresses web servent (un fichier local n'est pas lisible ici). */
function lirePhoto(n: Noeud, objets: Map<string, Noeud>): Photo | undefined {
  const v = n.valeur.trim()
  const o = /^@[^@]+@$/.test(v) ? objets.get(v) : n
  const file = o && enfant(o, 'FILE')
  const f = file?.valeur.trim() ?? ''
  if (!file || !/^https?:\/\//i.test(f)) return undefined
  // Geneanet écrit « http:// » mais sert ses images en https (une image http serait bloquée sur un site https)
  const url = f.replace(/^http:\/\/((?:[\w-]+\.)*geneanet\.org\/)/i, 'https://$1')
  // le format est sous FILE en GEDCOM 5.5.1, à côté en 5.5
  const forme = valeur(file, 'FORM') || valeur(o, 'FORM')
  return { url, signature: /\.png(\?|#|$)/i.test(url) || /^png$/i.test(forme) }
}

/** « Bruno /Veÿckemans/ » → prénom et nom ; les « ? » de GeneWeb deviennent vides. */
function lireNom(n?: Noeud): { prenom: string; nom: string } {
  if (!n) return { prenom: '', nom: '' }
  const m = /^([^/]*)(?:\/([^/]*)\/?)?(.*)$/.exec(n.valeur) ?? ['', '', '', '']
  // Le nom entre barres obliques fait foi : Geneanet range dans SURN les alias (« Myant,Mians »)
  const premier = (s: string) => s.split(',')[0]
  let prenom = (m[1] + ' ' + m[3]).replace(/\s+/g, ' ').trim() || premier(valeur(n, 'GIVN')).replace(/\s+/g, ' ').trim()
  let nom = (m[2] ?? '').replace(/\s+/g, ' ').trim() || premier(valeur(n, 'SURN')).replace(/\s+/g, ' ').trim()
  if (prenom === '?') prenom = ''
  if (nom === '?') nom = ''
  return { prenom, nom }
}

export function lireArbre(texte: string): Arbre {
  const noeuds = lireNoeuds(texte)
  const titres = new Map<string, string>()
  const notes = new Map<string, string>()
  const objets = new Map<string, Noeud>()
  for (const n of noeuds) {
    if (n.tag === 'SOUR' && n.xref) titres.set(n.xref, valeur(n, 'TITL') || valeur(n, 'ABBR') || n.xref)
    else if (n.tag === 'NOTE' && n.xref) notes.set(n.xref, n.valeur)
    else if (n.tag === 'OBJE' && n.xref) objets.set(n.xref, n)
  }

  const arbre: Arbre = { individus: new Map(), familles: new Map(), origine: {} }
  for (const n of noeuds) {
    if (n.tag === 'HEAD') {
      const sour = enfant(n, 'SOUR')
      arbre.origine = {
        logiciel: sour ? (sour.valeur.trim() || valeur(sour, 'NAME')) : undefined,
        base: sour ? valeur(sour, 'DATA') || undefined : undefined,
        date: valeur(n, 'DATE') || undefined,
      }
    } else if (n.tag === 'INDI' && n.xref) {
      const sexe = valeur(n, 'SEX').toUpperCase()
      const ind: Individu = {
        id: n.xref,
        ...lireNom(enfant(n, 'NAME')),
        sexe: sexe === 'M' || sexe === 'F' ? sexe : '?',
        evenements: [],
        famc: [],
        fams: [],
        metiers: [],
        sources: lireSources(n, titres),
      }
      for (const e of n.enfants) {
        if (e.tag === 'FAMC') ind.famc.push(e.valeur.trim())
        else if (e.tag === 'FAMS') ind.fams.push(e.valeur.trim())
        else if (EVENEMENTS.has(e.tag)) {
          ind.evenements.push(lireEvenement(e, titres, notes))
          if (e.tag === 'OCCU' && e.valeur.trim()) ind.metiers.push(e.valeur.trim())
        } else if (e.tag === 'OBJE' && !ind.photo) {
          const ph = lirePhoto(e, objets)
          if (ph) ind.photo = ph
        }
      }
      const note = lireNote(n, notes)
      if (note) ind.note = note
      if (ind.note) {
        const f = lireFiliation(ind.note)
        if (f) ind.filiation = f
      }
      arbre.individus.set(ind.id, ind)
    } else if (n.tag === 'FAM' && n.xref) {
      const fam: Famille = { id: n.xref, enfants: [], evenements: [], sources: lireSources(n, titres) }
      for (const e of n.enfants) {
        if (e.tag === 'HUSB') fam.mari = e.valeur.trim()
        else if (e.tag === 'WIFE') fam.femme = e.valeur.trim()
        else if (e.tag === 'CHIL') fam.enfants.push(e.valeur.trim())
        else if (EVENEMENTS.has(e.tag)) fam.evenements.push(lireEvenement(e, titres, notes))
      }
      arbre.familles.set(fam.id, fam)
    }
  }

  // Liens manquants d'un côté seulement (certains logiciels n'écrivent que FAM → CHIL)
  for (const fam of arbre.familles.values()) {
    for (const id of [fam.mari, fam.femme]) {
      const p = id ? arbre.individus.get(id) : undefined
      if (p && !p.fams.includes(fam.id)) p.fams.push(fam.id)
    }
    for (const id of fam.enfants) {
      const p = arbre.individus.get(id)
      if (p && !p.famc.includes(fam.id)) p.famc.push(fam.id)
    }
  }
  for (const p of arbre.individus.values()) {
    for (const f of p.famc) {
      const fam = arbre.familles.get(f)
      if (fam && !fam.enfants.includes(p.id)) fam.enfants.push(p.id)
    }
  }
  return arbre
}

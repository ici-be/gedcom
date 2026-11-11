// Signatures à trouver : les actes de l'arbre où une personne sans signature a dû signer.
// Pour chaque acte sourcé (naissance, baptême, mariage, décès), on dresse la liste de ceux qui signent d'ordinaire :
// les époux, leurs parents en vie, le père qui déclare une naissance, les témoins, parrains et marraines notés dans l'acte.
// L'acte est d'autant plus intéressant qu'il y manque de signatures, celles des ancêtres d'abord.

import type { Arbre, Evenement, Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import { cleActe } from './communes'
import { decouper } from './geo'
import { lienDansSource } from './format'
import { parents } from './parente'

/** attendue : cette personne signe d'ordinaire un tel acte · possible : elle y est sans doute, sans obligation de signer */
export type Certitude = 'attendue' | 'possible'

/**
 * manque : aucune image dans l'arbre · photo : un portrait est l'image principale, la signature est peut-être derrière
 * · presente : la signature est dans l'arbre · illettre : « Signature: illettré » dans la note
 */
export type EtatSignature = 'manque' | 'photo' | 'presente' | 'illettre'

export interface Signataire {
  id: string
  /** « époux », « père de l'épouse », « père (déclarant) », « témoin », « parrain »… */
  role: string
  certitude: Certitude
  etat: EtatSignature
}

export interface ActeSignatures {
  cle: string
  evenement: Evenement
  /** Les personnes de l'acte : l'enfant, le défunt, les deux époux */
  sujets: string[]
  /** Adresses des sources en ligne */
  liens: string[]
  signataires: Signataire[]
  /** Signatures qui manquent (états « manque » et « photo ») */
  manquantes: number
  /** Parmi elles, celles d'ancêtres */
  ancetres: number
  score: number
}

export function etatSignature(ind: Individu): EtatSignature {
  if (ind.photo?.signature) return 'presente'
  if (ind.illettre) return 'illettre'
  return ind.photo ? 'photo' : 'manque'
}

/** La personne cherche encore sa signature */
export const sansSignature = (e: EtatSignature): boolean => e === 'manque' || e === 'photo'

/**
 * Première année où les actes portent des signatures : 1667 en France (ordonnance de Saint-Germain-en-Laye),
 * 1779 aux Pays-Bas autrichiens (édit de Marie-Thérèse du 6 août 1778, registres tenus en double et signés), ailleurs inconnue.
 */
export function debutSignatures(pays: string | undefined): number | undefined {
  if (pays === 'FR') return 1667
  if (pays === 'BE' || pays === 'LU') return 1779
  return undefined
}

/** État civil : le déclarant et les témoins signent chaque acte (1792 en France, 1796 en Belgique ; on retient 1796) */
const ETAT_CIVIL = 1796

const NAISSANCE = new Set(['BIRT'])
const BAPTEME = new Set(['BAPM', 'CHR'])
const DECES = new Set(['DEAT', 'BURI'])
const MARIAGE = new Set(['MARR', 'MARC'])

const estParrain = (rela: string) => /god|parrain|marraine|peter|meter/i.test(rela)

function anneeDe(ind: Individu, tags: string[]): number | undefined {
  for (const t of tags) {
    const a = annee(ind.evenements.find((e) => e.tag === t)?.date)
    if (a !== undefined) return a
  }
  return undefined
}

/** En vie et en âge de signer à cette date ? « non » s'il est mort avant ou trop jeune, « peut-être » quand on ne sait pas */
function present(ind: Individu, an: number | undefined): 'oui' | 'peut-etre' | 'non' {
  if (an === undefined) return 'peut-etre'
  const deces = anneeDe(ind, ['DEAT', 'BURI', 'CREM'])
  const naissance = anneeDe(ind, ['BIRT', 'BAPM', 'CHR'])
  if (deces !== undefined && deces < an) return 'non'
  if (naissance !== undefined && (an - naissance < 14 || an - naissance > 100)) return 'non'
  return deces !== undefined ? 'oui' : 'peut-etre'
}

const POIDS_ANCETRE = 4

/** Les actes où il manque des signatures, les plus prometteurs d'abord */
export function actesASignatures(arbre: Arbre, ancetres: ReadonlyMap<string, unknown>): ActeSignatures[] {
  const actes: ActeSignatures[] = []

  const ajouter = (proprietaire: string, e: Evenement, sujets: string[], candidats: { ind?: Individu; role: string; certitude: Certitude }[]) => {
    const liens = [...new Set(e.sources.map(lienDansSource).filter((l): l is string => !!l))]
    if (!liens.length) return
    const an = annee(e.date)
    const debut = debutSignatures(e.lieu ? decouper(e.lieu).pays : undefined)
    if (an !== undefined && debut !== undefined && an < debut) return
    const signataires: Signataire[] = []
    const vus = new Set<string>()
    for (const c of candidats) {
      if (!c.ind || vus.has(c.ind.id)) continue
      vus.add(c.ind.id)
      signataires.push({ id: c.ind.id, role: c.role, certitude: c.certitude, etat: etatSignature(c.ind) })
    }
    const manquants = signataires.filter((s) => sansSignature(s.etat))
    if (!manquants.length) return
    let score = 0
    for (const s of manquants) {
      score += (ancetres.has(s.id) ? POIDS_ANCETRE : 1) * (s.certitude === 'attendue' ? 1 : 0.5) * (s.etat === 'photo' ? 0.5 : 1)
    }
    actes.push({
      cle: cleActe(proprietaire, e), evenement: e, sujets, liens, signataires,
      manquantes: manquants.length, ancetres: manquants.filter((s) => ancetres.has(s.id)).length, score,
    })
  }

  const temoins = (e: Evenement, exclus: string[], certitude: Certitude) =>
    (e.temoins ?? [])
      .filter((t) => !exclus.includes(t.id))
      .map((t) => {
        const ind = arbre.individus.get(t.id)
        const parrain = estParrain(t.rela)
        return { ind, role: parrain ? (ind?.sexe === 'F' ? 'marraine' : 'parrain') : 'témoin', certitude: parrain ? 'possible' as const : certitude }
      })

  for (const ind of arbre.individus.values()) {
    const { pere } = parents(arbre, ind)
    for (const e of ind.evenements) {
      const an = annee(e.date)
      const civil = an === undefined || an >= ETAT_CIVIL
      if (NAISSANCE.has(e.tag) || BAPTEME.has(e.tag)) {
        const c = temoins(e, [ind.id], civil && NAISSANCE.has(e.tag) ? 'attendue' : 'possible')
        if (pere && present(pere, an) !== 'non') {
          c.unshift({ ind: pere, role: NAISSANCE.has(e.tag) ? 'père (déclarant)' : 'père', certitude: civil && NAISSANCE.has(e.tag) ? 'attendue' : 'possible' })
        }
        ajouter(ind.id, e, [ind.id], c)
      } else if (DECES.has(e.tag)) {
        ajouter(ind.id, e, [ind.id], temoins(e, [ind.id], civil && e.tag === 'DEAT' ? 'attendue' : 'possible'))
      }
    }
  }

  for (const fam of arbre.familles.values()) {
    const mari = fam.mari ? arbre.individus.get(fam.mari) : undefined
    const femme = fam.femme ? arbre.individus.get(fam.femme) : undefined
    const sujets = [mari?.id, femme?.id].filter((x): x is string => !!x)
    for (const e of fam.evenements) {
      if (!MARIAGE.has(e.tag)) continue
      const an = annee(e.date)
      // avant l'état civil, bien des mariés ne signent pas le registre paroissial
      const certitude: Certitude = an === undefined || an >= ETAT_CIVIL ? 'attendue' : 'possible'
      const c: { ind?: Individu; role: string; certitude: Certitude }[] = [
        { ind: mari, role: 'époux', certitude },
        { ind: femme, role: 'épouse', certitude },
      ]
      for (const [conjoint, de] of [[mari, 'de l’époux'], [femme, 'de l’épouse']] as const) {
        if (!conjoint) continue
        const p = parents(arbre, conjoint)
        for (const [parent, nom] of [[p.pere, 'père'], [p.mere, 'mère']] as const) {
          if (!parent) continue
          const la = present(parent, an)
          if (la !== 'non') c.push({ ind: parent, role: `${nom} ${de}`, certitude: la === 'oui' ? certitude : 'possible' })
        }
      }
      c.push(...temoins(e, sujets, certitude))
      ajouter(fam.id, e, sujets, c)
    }
  }

  return actes.sort((a, b) => b.score - a.score || b.manquantes - a.manquantes || (a.evenement.date?.tri ?? 0) - (b.evenement.date?.tri ?? 0))
}

export interface BilanSignatures {
  /** L'export contient des images : sans elles, on ne sait pas qui a déjà sa signature */
  avecImages: boolean
  ancetres: number
  presentes: number
  illettres: number
  /** Ancêtres sans signature */
  aTrouver: number
  /** Parmi eux, ceux qui ont au moins un acte en ligne où ils ont dû signer */
  avecActe: number
}

export function bilanSignatures(arbre: Arbre, ancetres: ReadonlyMap<string, unknown>, actes: ActeSignatures[]): BilanSignatures {
  const b: BilanSignatures = { avecImages: false, ancetres: 0, presentes: 0, illettres: 0, aTrouver: 0, avecActe: 0 }
  for (const ind of arbre.individus.values()) if (ind.photo) { b.avecImages = true; break }
  const avecActe = new Set<string>()
  for (const a of actes) for (const s of a.signataires) if (sansSignature(s.etat)) avecActe.add(s.id)
  for (const id of ancetres.keys()) {
    const ind = arbre.individus.get(id)
    if (!ind) continue
    b.ancetres++
    const e = etatSignature(ind)
    if (e === 'presente') b.presentes++
    else if (e === 'illettre') b.illettres++
    else { b.aTrouver++; if (avecActe.has(id)) b.avecActe++ }
  }
  return b
}

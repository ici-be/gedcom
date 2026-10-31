// Chronologie d'une personne : ses faits, ceux de ses proches (parents, frères et sœurs, conjoints, enfants,
// petits-enfants) et les événements historiques qu'elle a connus, sur une même ligne du temps.

import type { Donnees } from './donnees'
import type { Evenement, Individu } from './gedcom/arbre'
import { libelle } from './format'
import { datesEvenement, triDe, type Vecu } from './evenements'
import { etatEvenement, type Etat } from './suivi'

export type Genre = 'perso' | 'proche' | 'histoire'
export type Nature = 'naissance' | 'union' | 'deces' | 'metier' | 'lieu' | 'autre'

export interface Etape {
  cle: string
  genre: Genre
  nature: Nature
  /** AAAAMMJJ ; 0 si le fait n'est pas daté */
  tri: number
  annee?: number
  /** Texte de la date, tel qu'il s'affiche */
  date: string
  titre: string
  lieu?: string
  /** Âge de la personne au moment du fait, en années révolues */
  age?: number
  /** L'âge est approché : naissance ou fait connu à l'année près */
  approx?: boolean
  /** « Mère », « Fils »… pour un proche */
  relation?: string
  /** Le proche concerné */
  qui?: string
  detail?: string
  etat?: Etat
  /** Événement historique : son type, son identifiant, sa notoriété, et s'il est probable plutôt que sûr */
  type?: string
  idHistoire?: string
  poids?: number
  probable?: boolean
}

export interface Chronologie {
  id: string
  naissance?: number
  deces?: number
  ageDeces?: number
  /** Début et fin de la ligne du temps, en AAAAMMJJ */
  debut: number
  fin: number
  etapes: Etape[]
  unions: number
  enfants: number
  lieux: number
}

const TAGS_NAISSANCE = ['BIRT', 'BAPM', 'CHR']
const TAGS_DECES = ['DEAT', 'BURI', 'CREM']

const premier = (ind: Individu, tags: string[]): Evenement | undefined => {
  for (const t of tags) {
    const e = ind.evenements.find((x) => x.tag === t && x.date?.tri)
    if (e) return e
  }
  return undefined
}

function nature(tag: string): Nature {
  if (TAGS_NAISSANCE.includes(tag)) return 'naissance'
  if (TAGS_DECES.includes(tag) || tag === 'WILL' || tag === 'PROB') return 'deces'
  if (/^(MARR|MARB|MARC|MARL|MARS|ENGA|DIV|DIVF|ANUL|SEP)$/.test(tag)) return 'union'
  if (tag === 'OCCU' || tag === 'RETI' || tag === 'EDUC' || tag === 'GRAD' || tag === 'MILI') return 'metier'
  if (/^(RESI|CENS|IMMI|EMIG|NATU)$/.test(tag)) return 'lieu'
  return 'autre'
}

const annee = (tri: number) => Math.floor(tri / 10000)
const prenomCourt = (i: Individu) => i.prenom.split(/\s+/)[0] || i.nom || '?'
const nomPropre = (i?: Individu) => (i ? [i.prenom, i.nom].filter(Boolean).join(' ') || '?' : '?')

const RELATIONS: Record<string, [string, string]> = {
  pere: ['Père', 'Père'], mere: ['Mère', 'Mère'], frere: ['Frère', 'Sœur'], conjoint: ['Époux', 'Épouse'],
  enfant: ['Fils', 'Fille'], petit: ['Petit-fils', 'Petite-fille'],
}
const relation = (r: keyof typeof RELATIONS, i: Individu) => RELATIONS[r][i.sexe === 'F' ? 1 : 0]

/** Âge à la date `tri` d'après la naissance `n` (AAAAMMJJ) */
function ageA(n: number | undefined, tri: number): number | undefined {
  if (!n || !tri || tri < n) return undefined
  return Math.floor((tri - n) / 10000)
}

/** La naissance n'est connue qu'à l'année (ou le fait) : l'âge peut se tromper d'un an */
const approche = (e: Evenement | undefined) => !e?.date?.debut?.mois

export function chronologie(d: Donnees, id: string, vecus: Vecu[] = []): Chronologie | undefined {
  const arbre = d.arbre
  const ind = arbre.individus.get(id)
  if (!ind) return undefined
  const nais = premier(ind, TAGS_NAISSANCE)
  const dec = premier(ind, TAGS_DECES)
  const n = nais?.date?.tri
  const m = dec?.date?.tri
  const fraiche = (e: Evenement | undefined, tri: number, ref: Evenement | undefined) => approche(e) || approche(ref) || !tri

  const etapes: Etape[] = []
  const lieux = new Set<string>()
  const ajouter = (e: Etape) => etapes.push(e)

  // ——— la personne ———
  const faitsPerso = (evts: Evenement[], origine: string, avec?: Individu) => {
    evts.forEach((e, i) => {
      if (!e.date && !e.lieu && !e.avere) return
      const tri = e.date?.tri ?? 0
      if (e.lieu) lieux.add(e.lieu)
      const union = nature(e.tag) === 'union'
      ajouter({
        cle: `p|${origine}|${i}|${e.tag}`,
        genre: 'perso',
        nature: nature(e.tag),
        tri,
        annee: tri ? annee(tri) : undefined,
        date: e.date?.texte ?? '',
        titre: libelle(e) + (union && avec ? ` avec ${nomPropre(avec)}` : ''),
        lieu: e.lieu,
        age: ageA(n, tri),
        approx: tri ? fraiche(nais, tri, e) : undefined,
        etat: etatEvenement(e),
        detail: e.tag === 'OCCU' || e.tag === 'EVEN' || e.tag === 'FACT' ? e.note : undefined,
      })
    })
  }
  faitsPerso(ind.evenements, ind.id)
  let unions = 0
  for (const fid of ind.fams) {
    const f = arbre.familles.get(fid)
    if (!f) continue
    const autre = arbre.individus.get((f.mari === ind.id ? f.femme : f.mari) ?? '')
    if (f.evenements.some((e) => e.tag === 'MARR')) unions++
    faitsPerso(f.evenements, fid, autre)
  }

  // ——— l'étendue de la ligne du temps ———
  const datees = etapes.filter((e) => e.tri)
  const debut = n ?? (datees.length ? Math.min(...datees.map((e) => e.tri)) : 0)
  const maintenant = new Date().getFullYear()
  const dernier = datees.length ? Math.max(...datees.map((e) => e.tri)) : debut
  const fin = m ?? Math.max(dernier, debut ? Math.min(annee(debut) + 90, maintenant) * 10000 + 1231 : 0)
  const dans = (tri: number) => tri > 0 && tri >= debut && tri <= fin

  // ——— les proches ———
  const proche = (r: keyof typeof RELATIONS, p: Individu | undefined, quoi: 'naissance' | 'deces' | 'mariage', extra = '') => {
    if (!p) return
    if (quoi === 'mariage') {
      for (const fid of p.fams) {
        const f = arbre.familles.get(fid)
        const e = f?.evenements.find((x) => x.tag === 'MARR' && x.date?.tri)
        if (!f || !e || !dans(e.date!.tri)) continue
        const conj = arbre.individus.get((f.mari === p.id ? f.femme : f.mari) ?? '')
        ajouter({
          cle: `r|${p.id}|${fid}|MARR`, genre: 'proche', nature: 'union', tri: e.date!.tri, annee: annee(e.date!.tri), date: e.date!.texte,
          titre: `Mariage de ${prenomCourt(p)}${conj ? ` avec ${nomPropre(conj)}` : ''}`, lieu: e.lieu,
          age: ageA(n, e.date!.tri), approx: fraiche(nais, e.date!.tri, e), relation: relation(r, p), qui: p.id,
        })
      }
      return
    }
    const e = premier(p, quoi === 'naissance' ? TAGS_NAISSANCE : TAGS_DECES)
    if (!e || !dans(e.date!.tri)) return
    const tri = e.date!.tri
    let detail = extra
    if (quoi === 'deces') {
      const a = ageA(premier(p, TAGS_NAISSANCE)?.date?.tri, tri)
      if (a !== undefined) detail = `à ${a} an${a > 1 ? 's' : ''}`
    }
    ajouter({
      cle: `r|${p.id}|${quoi}`, genre: 'proche', nature: quoi, tri, annee: annee(tri), date: e.date!.texte,
      titre: `${quoi === 'naissance' ? 'Naissance' : 'Décès'} de ${prenomCourt(p)}`, lieu: e.lieu,
      age: ageA(n, tri), approx: fraiche(nais, tri, e), relation: relation(r, p), qui: p.id, detail: detail || undefined,
    })
  }

  // parents, frères et sœurs
  const famc = arbre.familles.get(ind.famc[0] ?? '')
  if (famc) {
    proche('pere', arbre.individus.get(famc.mari ?? ''), 'deces')
    proche('mere', arbre.individus.get(famc.femme ?? ''), 'deces')
    for (const fr of famc.enfants) {
      if (fr === ind.id) continue
      const s = arbre.individus.get(fr)
      proche('frere', s, 'naissance')
      proche('frere', s, 'deces')
    }
  }
  // conjoints, enfants, petits-enfants
  let enfants = 0
  const vus = new Set<string>()
  for (const fid of ind.fams) {
    const f = arbre.familles.get(fid)
    if (!f) continue
    proche('conjoint', arbre.individus.get((f.mari === ind.id ? f.femme : f.mari) ?? ''), 'deces')
    for (const eid of f.enfants) {
      if (vus.has(eid)) continue
      vus.add(eid)
      const e = arbre.individus.get(eid)
      if (!e) continue
      enfants++
      proche('enfant', e, 'naissance')
      proche('enfant', e, 'mariage')
      proche('enfant', e, 'deces')
      for (const gid of e.fams) {
        for (const pid of arbre.familles.get(gid)?.enfants ?? []) proche('petit', arbre.individus.get(pid), 'naissance')
      }
    }
  }

  // ——— l'histoire ———
  for (const v of vecus) {
    const tri = triDe(v.ev.d)
    // un événement commencé avant la naissance se place à la naissance
    const place = Math.max(tri, debut)
    ajouter({
      cle: `h|${v.ev.id}`, genre: 'histoire', nature: 'autre', tri: place, annee: annee(place), date: datesEvenement(v.ev),
      titre: v.ev.t.charAt(0).toUpperCase() + v.ev.t.slice(1), lieu: v.lieu, age: v.age, type: v.ev.type, idHistoire: v.ev.id,
      poids: v.ev.n * (v.km !== undefined ? 1.5 - v.km / (v.ev.r ?? 10) : 1) * (v.probable ? 0.6 : 1), probable: v.probable,
      detail: v.km !== undefined ? `à ${Math.round(v.km)} km` : undefined,
    })
  }

  const ordre: Record<Genre, number> = { perso: 0, proche: 1, histoire: 2 }
  etapes.sort((a, b) => (a.tri || 99999999) - (b.tri || 99999999) || ordre[a.genre] - ordre[b.genre] || a.cle.localeCompare(b.cle))

  return {
    id, naissance: n ? annee(n) : undefined, deces: m ? annee(m) : undefined,
    ageDeces: n && m ? ageA(n, m) : undefined,
    debut, fin, etapes, unions, enfants, lieux: lieux.size,
  }
}

/** Les événements historiques à garder : les `max` plus marquants (notoriété, proximité, certitude) */
export function marquantes(etapes: Etape[], max: number): Set<string> {
  return new Set(etapes.filter((e) => e.genre === 'histoire').sort((a, b) => (b.poids ?? 0) - (a.poids ?? 0)).slice(0, max).map((e) => e.cle))
}

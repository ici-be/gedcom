// Priorités : ce qui manque chez les ancêtres (naissance, mariage du couple, décès), des plus proches aux plus
// lointains, et pour chaque fait les sources déjà trouvées autour qui peuvent mettre sur la piste du registre :
// celles de la famille proche (baptême d'un frère, mariage des parents, décès du conjoint…), puis celles d'autres
// personnes de l'arbre pour le même genre d'acte, dans la même commune, à quelques années près.

import type { Donnees } from './donnees'
import type { Evenement, Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import { decouperLieu } from './communes'
import { comparerSosa } from './parente'
import { anneeNaissanceEstimee, type Etat, type Fait } from './suivi'

export type Quoi = 'naissance' | 'mariage' | 'deces'

const TAGS: Record<Quoi, string[]> = {
  naissance: ['BIRT', 'BAPM', 'CHR'],
  mariage: ['MARR', 'MARB', 'MARC', 'MARL'],
  deces: ['DEAT', 'BURI', 'CREM'],
}

export interface Piste {
  /** La personne dont l'acte est sourcé */
  id: string
  /** « sa sœur », « ses parents », « son épouse », ou vide pour une personne de la même commune */
  lien: string
  evenement: Evenement
  source: string
  /** Trouvée dans la même commune, à la même époque, hors de la famille proche */
  voisine?: boolean
}

export interface Priorite {
  cle: string
  quoi: Quoi
  etat: Etat
  /** La personne (pour un mariage : le mari, ou la femme si le mari est inconnu) */
  id: string
  /** Pour un mariage : l'autre conjoint */
  conjoint?: string
  sosa: string
  generation: number
  /** L'événement déjà noté, s'il y en a un (date ou lieu sans source) */
  evenement?: Evenement
  /** Année connue ou estimée, et commune probable (d'après l'événement ou la famille) */
  annee?: number
  estimee: boolean
  commune?: string
  pistes: Piste[]
}

const PISTES_FAMILLE = 4
const PISTES_VOISINES = 3
const ECART_VOISIN = 3
/** Un acte de frère ou de sœur trop éloigné dans le temps ne dit rien du registre à ouvrir */
const ECART_FRATRIE = 25

const fem = (x?: Individu) => x?.sexe === 'F'
const commune = (e?: Evenement) => (e?.lieu ? decouperLieu(e.lieu).nom : undefined)

interface Acte { id: string; e: Evenement; lien: string }

/** Les actes sourcés d'une personne pour ce genre de fait */
function actes(ind: Individu | undefined, quoi: Quoi, lien: string): Acte[] {
  if (!ind) return []
  return ind.evenements.filter((e) => TAGS[quoi].includes(e.tag) && e.sources.length).map((e) => ({ id: ind.id, e, lien }))
}

/** Les actes sourcés d'une famille (mariage) ; `qui` : la personne de la famille dont on parle (le mari sinon) */
function actesFamille(d: Donnees, famille: string | undefined, quoi: Quoi, lien: string, qui?: string): Acte[] {
  const f = famille ? d.arbre.familles.get(famille) : undefined
  return f ? f.evenements.filter((e) => TAGS[quoi].includes(e.tag) && e.sources.length).map((e) => ({ id: qui ?? f.mari ?? f.femme ?? '', e, lien })) : []
}

/** La commune la plus fréquente parmi ces actes */
function communeProbable(l: Acte[]): string | undefined {
  const n = new Map<string, number>()
  for (const a of l) { const c = commune(a.e); if (c) n.set(c, (n.get(c) ?? 0) + 1) }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Les actes de la famille proche qui ressemblent le plus à celui qu'on cherche */
function pistesFamille(d: Donnees, quoi: Quoi, ind: Individu, conjoint?: Individu, famille?: string): Acte[] {
  const ind_ = (id?: string) => (id ? d.arbre.individus.get(id) : undefined)
  const freres = (x: Individu) => x.famc.flatMap((f) => d.arbre.familles.get(f)?.enfants ?? []).filter((c) => c !== x.id).map((c) => ind_(c)!).filter(Boolean)
  const enfants = (f?: string) => (f ? d.arbre.familles.get(f)?.enfants ?? [] : []).map((c) => ind_(c)!).filter(Boolean)
  const frere = (x: Individu) => (fem(x) ? 'sa sœur' : 'son frère')
  const enfant = (x: Individu) => (fem(x) ? 'leur fille' : 'leur fils')
  if (quoi === 'naissance') {
    return [
      ...freres(ind).flatMap((x) => actes(x, 'naissance', frere(x))),
      ...ind.famc.flatMap((f) => actesFamille(d, f, 'mariage', 'ses parents')),
    ]
  }
  if (quoi === 'mariage') {
    return [
      ...enfants(famille).flatMap((x) => actes(x, 'naissance', enfant(x))),
      ...[ind, conjoint].filter((x): x is Individu => !!x).flatMap((x) => freres(x).flatMap((y) => y.fams.flatMap((f) => actesFamille(d, f, 'mariage', `${fem(y) ? 'de la sœur' : 'du frère'} ${fem(x) ? 'de l’épouse' : 'de l’époux'}`, y.id)))),
    ]
  }
  const conjoints = ind.fams.map((f) => d.arbre.familles.get(f)).map((f) => ind_(f?.mari === ind.id ? f?.femme : f?.mari)).filter((x): x is Individu => !!x)
  return [
    ...conjoints.flatMap((x) => actes(x, 'deces', fem(x) ? 'son épouse' : 'son époux')),
    ...ind.fams.flatMap((f) => enfants(f)).flatMap((x) => x.fams.flatMap((f) => actesFamille(d, f, 'mariage', `mariage de ${fem(x) ? 'sa fille' : 'son fils'}`, x.id))),
    ...freres(ind).flatMap((x) => actes(x, 'deces', frere(x))),
  ]
}

/** Les actes sourcés de tout l'arbre, par genre et par commune, pour les pistes « même commune, même époque » */
function indexVoisins(d: Donnees): Map<string, Acte[]> {
  const index = new Map<string, Acte[]>()
  const ajouter = (id: string, e: Evenement) => {
    for (const quoi of Object.keys(TAGS) as Quoi[]) {
      if (!TAGS[quoi].includes(e.tag) || !e.sources.length || annee(e.date) === undefined) continue
      const c = commune(e)
      if (!c) continue
      const cle = quoi + '|' + c
      const l = index.get(cle) ?? []
      l.push({ id, e, lien: '' })
      index.set(cle, l)
    }
  }
  for (const ind of d.arbre.individus.values()) for (const e of ind.evenements) ajouter(ind.id, e)
  for (const f of d.arbre.familles.values()) for (const e of f.evenements) ajouter(f.mari ?? f.femme ?? '', e)
  return index
}

/** Une piste par source (la même source citée par deux actes n'est donnée qu'une fois) */
function enPistes(l: Acte[], cible: number | undefined, max: number, deja: Set<string>, voisine = false): Piste[] {
  const tri = (a: Acte) => (cible === undefined ? 0 : Math.abs((annee(a.e.date) ?? cible + 50) - cible))
  const res: Piste[] = []
  for (const a of [...l].sort((x, y) => tri(x) - tri(y))) {
    for (const s of a.e.sources) {
      if (res.length >= max || deja.has(s)) continue
      deja.add(s)
      res.push({ id: a.id, lien: a.lien, evenement: a.e, source: s, ...(voisine ? { voisine } : {}) })
    }
  }
  return res
}

/** Les faits à chercher chez les ancêtres ; `sansSource` : aussi ceux qui sont notés mais sans source */
export function priorites(d: Donnees, sansSource = false): Priorite[] {
  const voisins = indexVoisins(d)
  const res: Priorite[] = []
  const vus = new Set<string>()
  const retenir = (e: Etat) => e === 'manquant' || (sansSource && e === 'sans-source')

  const ajouter = (quoi: Quoi, f: Fait, ind: Individu, sosa: string, generation: number, conjoint?: Individu) => {
    if (!retenir(f.etat)) return
    const cle = quoi === 'mariage' ? 'm|' + f.famille : quoi + '|' + ind.id
    if (vus.has(cle)) return
    vus.add(cle)
    const proches = pistesFamille(d, quoi, ind, conjoint, f.famille)
    // l'année : celle de l'acte, ou une estimation (naissance d'après la famille, mariage d'après le premier enfant)
    let an = annee(f.evenement?.date)
    let estimee = false
    if (an === undefined && quoi === 'naissance') { an = anneeNaissanceEstimee(d.arbre, ind, f); estimee = an !== undefined }
    if (an === undefined && quoi === 'mariage') {
      const l = proches.filter((a) => a.lien.startsWith('leur')).map((a) => annee(a.e.date)).filter((x): x is number => x !== undefined)
      if (l.length) { an = Math.min(...l) - 1; estimee = true }
    }
    const lieu = commune(f.evenement) ?? communeProbable(proches)
    const deja = new Set<string>()
    const loin = (a: Acte) => an !== undefined && /^(sa sœur|son frère|de la sœur|du frère)/.test(a.lien) && Math.abs((annee(a.e.date) ?? an) - an) > ECART_FRATRIE
    const pistes = enPistes(proches.filter((a) => !loin(a)), an, PISTES_FAMILLE, deja)
    if (lieu && an !== undefined) {
      const autour = (voisins.get(quoi + '|' + lieu) ?? [])
        .filter((a) => a.id !== ind.id && a.id !== conjoint?.id && Math.abs(annee(a.e.date)! - an!) <= ECART_VOISIN)
      pistes.push(...enPistes(autour, an, PISTES_VOISINES, deja, true))
    }
    res.push({
      cle, quoi, etat: f.etat, id: ind.id, sosa, generation, estimee, pistes,
      ...(conjoint ? { conjoint: conjoint.id } : {}),
      ...(f.evenement && (f.evenement.date || f.evenement.lieu) ? { evenement: f.evenement } : {}),
      ...(an !== undefined ? { annee: an } : {}),
      ...(lieu ? { commune: lieu } : {}),
    })
  }

  const liste = [...d.ancetres.values()].sort((a, b) => comparerSosa(a.sosa, b.sosa))
  for (const a of liste) {
    const ind = d.arbre.individus.get(a.id)
    const s = d.suivis.get(a.id)
    if (!ind || !s) continue
    ajouter('naissance', s.naissance, ind, a.sosa, a.generation)
    // le mariage du couple d'ancêtres : celui des parents de l'enfant par qui passe la lignée, noté une fois
    for (const m of s.mariages) {
      const conj = m.conjoint ? d.arbre.individus.get(m.conjoint) : undefined
      if (!conj || !d.ancetres.has(conj.id)) continue
      const [mari, femme] = fem(ind) ? [conj, ind] : [ind, conj]
      ajouter('mariage', m, mari, fem(ind) ? d.ancetres.get(conj.id)!.sosa : a.sosa, a.generation, femme)
    }
    ajouter('deces', s.deces, ind, a.sosa, a.generation)
  }
  const ordre: Quoi[] = ['naissance', 'mariage', 'deces']
  return res.sort((x, y) => x.generation - y.generation || comparerSosa(x.sosa, y.sosa) || ordre.indexOf(x.quoi) - ordre.indexOf(y.quoi))
}

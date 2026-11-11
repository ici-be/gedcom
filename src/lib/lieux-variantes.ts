// Lieux écrits de plusieurs façons : « Saint-Gilles » et « St Gilles », « Bruxelles » et « Brussel »,
// « Ath, Hainaut, Belgique » et « Ath ». Chaque groupe propose la forme à garder, à corriger sur l'arbre en ligne.

import type { Arbre, Evenement } from './gedcom/arbre'
import { cleGeo, decouper } from './geo'

export type RaisonVariante = 'ecriture' | 'contexte' | 'langue' | 'faute'

export const RAISONS_VARIANTES: Record<RaisonVariante, string> = {
  ecriture: 'Écriture différente (majuscules, accents, tirets, « St » pour « Saint »)',
  contexte: 'Province ou pays écrit autrement, ou absent',
  langue: 'Nom français ou néerlandais de la même commune',
  faute: 'Faute de frappe possible (à vérifier)',
}

export interface Variante {
  lieu: string
  faits: number
}

export interface GroupeVariantes {
  /** Identifiant stable, pour retenir « ce sont des lieux différents » */
  cle: string
  /** La forme à garder : la plus employée (à égalité, la plus complète) */
  suggestion: string
  variantes: Variante[]
  raisons: RaisonVariante[]
}

/** Noms français ↔ néerlandais de communes belges : chaque ligne est une seule commune */
const NOMS_BELGES: string[][] = [
  ['Bruxelles', 'Brussel', 'Brussels'], ['Anvers', 'Antwerpen', 'Antwerp'], ['Louvain', 'Leuven'], ['Mons', 'Bergen'],
  ['Gand', 'Gent'], ['Tournai', 'Doornik'], ['Liège', 'Luik'], ['Namur', 'Namen'], ['Ypres', 'Ieper'],
  ['Courtrai', 'Kortrijk'], ['Malines', 'Mechelen'], ['Nivelles', 'Nijvel'], ['Audenarde', 'Oudenaarde'],
  ['Grammont', 'Geraardsbergen'], ['Termonde', 'Dendermonde'], ['Alost', 'Aalst'], ['Bruges', 'Brugge'],
  ['Ostende', 'Oostende'], ['Hal', 'Halle'], ['Tirlemont', 'Tienen'], ['Saint-Trond', 'Sint-Truiden'],
  ['Lierre', 'Lier'], ['Wavre', 'Waver'], ['Jodoigne', 'Geldenaken'], ['Enghien', 'Edingen'], ['Lessines', 'Lessen'],
  ['Renaix', 'Ronse'], ['Soignies', 'Zinnik'], ['Nieuport', 'Nieuwpoort'], ['Dixmude', 'Diksmuide'],
  ['Furnes', 'Veurne'], ['Menin', 'Menen'], ['Roulers', 'Roeselare'], ['Saint-Nicolas', 'Sint-Niklaas'],
  ['Vilvorde', 'Vilvoorde'], ['Tervuren', 'Tervueren'], ['La Hulpe', 'Terhulpen'], ['Braine-l\'Alleud', 'Eigenbrakel'],
  ['Braine-le-Comte', '\'s-Gravenbrakel', 'S-Gravenbrakel'], ['Ixelles', 'Elsene'], ['Schaerbeek', 'Schaarbeek'],
  ['Uccle', 'Ukkel'], ['Forest', 'Vorst'], ['Laeken', 'Laken'], ['Saint-Gilles', 'Sint-Gillis'],
  ['Saint-Josse-ten-Noode', 'Sint-Joost-ten-Node', 'Saint-Josse'], ['Molenbeek-Saint-Jean', 'Sint-Jans-Molenbeek', 'Molenbeek'],
  ['Woluwe-Saint-Lambert', 'Sint-Lambrechts-Woluwe'], ['Woluwe-Saint-Pierre', 'Sint-Pieters-Woluwe'],
  ['Auderghem', 'Oudergem'], ['Watermael-Boitsfort', 'Watermaal-Bosvoorde'], ['Berchem-Sainte-Agathe', 'Sint-Agatha-Berchem'],
  ['Koekelberg', 'Koekelberg'], ['Jette', 'Jette'], ['Evere', 'Evere'], ['Overijse', 'Overijse'], ['Hoeilaart', 'Hoeilaart'],
  ['Rhode-Saint-Genèse', 'Sint-Genesius-Rode'], ['Beersel', 'Beersel'], ['Linkebeek', 'Linkebeek'], ['Drogenbos', 'Drogenbos'],
  ['Hasselt', 'Hasselt'], ['Tongres', 'Tongeren'], ['Looz', 'Borgloon'], ['Maaseik', 'Maeseyck'],
  ['Montaigu', 'Scherpenheuvel'], ['Léau', 'Zoutleeuw'], ['Diest', 'Diest'], ['Aerschot', 'Aarschot'],
  ['Hannut', 'Hannuit'], ['Waremme', 'Borgworm'], ['Huy', 'Hoei'], ['Dinant', 'Dinant'], ['Arlon', 'Aarlen'],
  ['Ninove', 'Ninove'], ['Zottegem', 'Zottegem'], ['Deinze', 'Deinze'], ['Eeklo', 'Eeklo'], ['Saint-Hubert', 'Sint-Hubert'],
  ['Mouscron', 'Moeskroen'], ['Comines', 'Komen'], ['Warneton', 'Waasten'], ['Messines', 'Mesen'], ['Poperinge', 'Poperinghe'],
  ['Zele', 'Zeele'],
  ['Merchtem', 'Merchtem'], ['Asse', 'Assche'], ['Ternat', 'Ternat'], ['Lennik', 'Lennick-Saint-Quentin'], ['Biévène', 'Bever'],
  ['Hérinnes', 'Herne'], ['Enghien', 'Edingen'], ['Silly', 'Opzullik'], ['Ath', 'Aat'], ['Chièvres', 'Chièvres'],
  ['Courcelles', 'Courcelles'], ['Roux', 'Roux'], ['Rebecq', 'Rebecq-Rognon'], ['Genappe', 'Genepiën'], ['Perwez', 'Perwijs'],
  ['Walhain', 'Walhain-Saint-Paul'], ['Hélécine', 'Heylissem'], ['Orp-le-Grand', 'Orp-le-Grand'],
].filter((l) => new Set(l.map(cleGeo)).size > 1)

/** « St », « Ste » → « saint », « sainte » */
function sansAbreviations(cle: string): string {
  return cle.replace(/\bst\b/g, 'saint').replace(/\bste\b/g, 'sainte')
}

/** Forme de comparaison d'un nom de commune : sans parenthèses, sans accents ni tirets, « St » développé */
function cleCommune(commune: string): string {
  return sansAbreviations(cleGeo(commune.replace(/\s*\(.*\)\s*$/, '')))
}

const ALIAS_COMMUNES = new Map<string, string>()
for (const ligne of NOMS_BELGES) {
  const canon = cleCommune(ligne[0])
  for (const nom of ligne) ALIAS_COMMUNES.set(cleCommune(nom), canon)
}

/** Clé d'une commune, la même pour ses noms français et néerlandais : « Brussel » et « Bruxelles » → « bruxelles » */
export function cleCommuneBilingue(nom: string): string {
  const k = cleCommune(nom)
  return ALIAS_COMMUNES.get(k) ?? k
}

interface Entree {
  lieu: string
  faits: number
  commune: string
  /** La commune, ramenée à un nom unique quand le français et le néerlandais s'opposent */
  canon: string
  contexte: string[]
  pays?: string
}

/** Nombre de faits par lieu (les lieux avec un hameau ou une adresse ne sont pas comparés : le détail est voulu) */
export function compterLieux(arbre: Arbre): Map<string, number> {
  const n = new Map<string, number>()
  const voir = (evenements: Evenement[]) => {
    for (const e of evenements) if (e.lieu) n.set(e.lieu, (n.get(e.lieu) ?? 0) + 1)
  }
  for (const i of arbre.individus.values()) voir(i.evenements)
  for (const f of arbre.familles.values()) voir(f.evenements)
  return n
}

function entree(lieu: string, faits: number): Entree | undefined {
  const d = decouper(lieu)
  // un hameau « [Hameau] - Cuesmes » ou une adresse « Rue Blaes 247, Bruxelles » : le détail est voulu
  if (!d.commune || d.commune !== lieu.split(',')[0].trim()) return undefined
  const k = cleCommune(d.commune)
  const contexte = d.contexte.map((p) => sansAbreviations(cleGeo(p))).filter(Boolean)
  const belge = d.pays === 'BE' || (!d.pays && contexte.length === 0)
  return { lieu, faits, commune: k, canon: belge || !d.pays ? ALIAS_COMMUNES.get(k) ?? k : k, contexte, pays: d.pays }
}

/** Le contexte de `a` tient dans celui de `b` (« Hainaut » dans « Hainaut, Mons ») et les pays ne se contredisent pas */
function contenu(a: Entree, b: Entree): boolean {
  if (a.pays && b.pays && a.pays !== b.pays) return false
  return a.contexte.every((p) => b.contexte.includes(p))
}

/** Variantes d'un mot par suppression d'une lettre : deux mots à une faute près en partagent une */
function suppressions(mot: string): string[] {
  const r = [mot]
  for (let i = 0; i < mot.length; i++) r.push(mot.slice(0, i) + mot.slice(i + 1))
  return r
}

function plusProche(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i)
}

/** Les groupes de lieux qui semblent n'en faire qu'un, les plus employés d'abord */
export function lieuxAVerifier(arbre: Arbre, ecartes: ReadonlySet<string> = new Set()): GroupeVariantes[] {
  return variantesDe(compterLieux(arbre), ecartes)
}

export function variantesDe(compte: Map<string, number>, ecartes: ReadonlySet<string> = new Set()): GroupeVariantes[] {
  const entrees = [...compte].map(([l, n]) => entree(l, n)).filter((e): e is Entree => !!e)

  // union-find sur les entrées
  const parent = entrees.map((_, i) => i)
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])))
  const lier = (i: number, j: number) => { parent[racine(i)] = racine(j) }
  const fautes = new Set<number>()

  // 1. même commune (ou même nom français / néerlandais) et contextes compatibles
  const parNom = new Map<string, number[]>()
  entrees.forEach((e, i) => parNom.set(e.canon, [...(parNom.get(e.canon) ?? []), i]))
  for (const indices of parNom.values()) {
    if (indices.length < 2) continue
    // les plus précis d'abord : chacun rejoint le premier groupe dont le chef contient son contexte
    const tries = [...indices].sort((a, b) => entrees[b].contexte.length - entrees[a].contexte.length)
    const chefs: number[] = []
    const vagues: number[] = []
    for (const i of tries) {
      if (entrees[i].contexte.length === 0) { vagues.push(i); continue }
      const chef = chefs.find((c) => contenu(entrees[i], entrees[c]))
      if (chef === undefined) chefs.push(i)
      else lier(i, chef)
    }
    // un lieu sans province : rattaché seulement s'il n'y a pas d'autre commune du même nom
    for (const i of vagues) {
      if (chefs.length) {
        const possibles = chefs.filter((c) => contenu(entrees[i], entrees[c]))
        if (possibles.length === 1) lier(i, possibles[0])
      } else {
        // aucun lieu avec province : seuls les pays comptent (« Ath » et « Ath, Belgique »)
        const chef = vagues.find((v) => v < i && racine(v) === v && contenu(entrees[i], entrees[v]) && contenu(entrees[v], entrees[i]))
        if (chef !== undefined) lier(i, chef)
      }
    }
  }

  // 2. une faute de frappe près, avec la même province et le même pays
  const parSuppression = new Map<string, number[]>()
  entrees.forEach((e, i) => {
    if (e.commune.length < 6 || !e.contexte.length) return
    for (const s of suppressions(e.commune)) {
      const k = `${s}|${e.contexte.join(',')}|${e.pays ?? ''}`
      parSuppression.set(k, [...(parSuppression.get(k) ?? []), i])
    }
  })
  for (const l of parSuppression.values()) {
    for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
      if (entrees[l[a]].canon !== entrees[l[b]].canon && plusProche(entrees[l[a]].commune, entrees[l[b]].commune)) {
        lier(l[a], l[b])
        fautes.add(l[a]); fautes.add(l[b])
      }
    }
  }

  const groupes = new Map<number, number[]>()
  entrees.forEach((_, i) => groupes.set(racine(i), [...(groupes.get(racine(i)) ?? []), i]))
  const res: GroupeVariantes[] = []
  for (const indices of groupes.values()) {
    const es = indices.map((i) => entrees[i])
    if (es.length < 2) continue
    es.sort((a, b) => b.faits - a.faits || b.lieu.length - a.lieu.length || a.lieu.localeCompare(b.lieu, 'fr'))
    const cle = es.map((e) => e.lieu).sort().join('||')
    if (ecartes.has(cle)) continue
    const raisons = new Set<RaisonVariante>()
    for (const e of es.slice(1)) {
      const chef = es[0]
      if (e.canon === chef.canon && e.commune !== chef.commune) raisons.add('langue')
      else if (e.canon === chef.canon && (e.contexte.join(',') !== chef.contexte.join(',') || e.pays !== chef.pays)) raisons.add('contexte')
      else if (e.canon === chef.canon) raisons.add('ecriture')
      else raisons.add('faute')
    }
    if (indices.some((i) => fautes.has(i))) raisons.add('faute')
    res.push({
      cle,
      suggestion: es[0].lieu,
      variantes: es.map((e) => ({ lieu: e.lieu, faits: e.faits })),
      raisons: (['ecriture', 'contexte', 'langue', 'faute'] as RaisonVariante[]).filter((r) => raisons.has(r)),
    })
  }
  return res.sort((a, b) => total(b) - total(a) || a.suggestion.localeCompare(b.suggestion, 'fr'))
}

const total = (g: GroupeVariantes) => g.variantes.reduce((n, v) => n + v.faits, 0)

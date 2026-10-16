// Événements historiques : batailles, sièges, incendies, épidémies, guerres, changements de régime… survenus
// près de chez une personne, de son vivant. La liste est livrée avec le site (public/evenements.json, construit par
// scripts/evenements.py d'après Wikidata) ; le lieu de vie à une date se déduit des faits datés et situés de l'arbre.

import type { Donnees } from './donnees'
import type { Evenement, Individu } from './gedcom/arbre'
import { decouper, type Position } from './geo'
import { distanceKm, VIE_PAR_DEFAUT } from './migrations'
import { anneeNaissanceEstimee } from './suivi'

export type TypeEvenement =
  | 'bataille' | 'siege' | 'bombardement' | 'massacre' | 'incendie' | 'inondation' | 'seisme' | 'explosion'
  | 'epidemie' | 'famine' | 'hiver' | 'guerre' | 'regime'

/** Une entrée de public/evenements.json (voir scripts/evenements.py) */
export interface EvenementHistorique {
  id: string
  /** Titre avec son article : « la bataille de Waterloo » */
  t: string
  type: TypeEvenement
  /** Début et fin : « 1815 », « 1815-06 », « 1815-06-18 » */
  d: string
  f?: string
  /** Précision du début : 9 l'année, 10 le mois, 11 le jour */
  p: number
  /** Événement ponctuel : un point et un rayon (km) */
  lat?: number
  lon?: number
  r?: number
  /** Événement étendu : des pays (« BE ») ou des provinces (« BE.WHT », « FR.59 ») */
  z?: string[]
  /** Notoriété : nombre d'articles Wikipédia */
  n: number
  /** Article de Wikipédia en français */
  w?: string
}

export const NOMS_TYPES: Record<TypeEvenement, string> = {
  bataille: 'Bataille', siege: 'Siège', bombardement: 'Bombardement', massacre: 'Massacre', incendie: 'Incendie',
  inondation: 'Inondation', seisme: 'Tremblement de terre', explosion: 'Explosion', epidemie: 'Épidémie',
  famine: 'Famine, disette', hiver: 'Hiver rigoureux', guerre: 'Guerre', regime: 'Changement de régime',
}

export const ponctuel = (e: EvenementHistorique) => e.lat !== undefined && e.lon !== undefined

/** « 1815-06-18 » → 18150618 (comme DateGed.tri), le début ou la fin de la période quand il manque le mois ou le jour */
export function triDe(s: string, fin = false): number {
  const [a, m, j] = s.split('-').map(Number)
  return a * 10000 + (m || (fin ? 12 : 1)) * 100 + (j || (fin ? 31 : 1))
}
const anneeTri = (t: number) => Math.floor(t / 10000)

let enCache: Promise<EvenementHistorique[]> | undefined

/** La liste des événements (téléchargée une fois) */
export function chargerEvenements(): Promise<EvenementHistorique[]> {
  enCache ??= fetch('evenements.json').then((r) => {
    if (!r.ok) throw new Error('evenements.json')
    return r.json()
  }).then((x: { e: EvenementHistorique[] }) => x.e).catch((e) => { enCache = undefined; throw e })
  return enCache
}

// ——— Où vivait une personne ———

/** Un fait daté et situé : la personne était là à cette date */
export interface Jalon { tri: number; lieu: string; pos: Position; /** Code du pays, du lieu reconnu ou à défaut de son nom */ pays?: string }

const sur = (e: Evenement | undefined): e is Evenement & { lieu: string } => !!e?.lieu && !!e.date?.tri && !['avant', 'après', 'entre'].includes(e.date.qualif)

/** Les faits datés et situés d'une personne : les siens, ceux de ses unions, la naissance de ses enfants */
export function jalons(d: Donnees, ind: Individu, positions: Map<string, Position>, pays?: Map<string, string | undefined>): Jalon[] {
  const res: Jalon[] = []
  const ajouter = (e: Evenement | undefined) => {
    if (!sur(e)) return
    const pos = positions.get(e.lieu)
    if (pos) res.push({ tri: e.date!.tri, lieu: e.lieu, pos, pays: pos.pays ?? pays?.get(e.lieu) })
  }
  for (const e of ind.evenements) ajouter(e)
  for (const f of ind.fams) {
    const fam = d.arbre.familles.get(f)
    if (!fam) continue
    for (const e of fam.evenements) ajouter(e)
    for (const c of fam.enfants) {
      const enf = d.arbre.individus.get(c)
      ajouter(enf?.evenements.find((e) => (e.tag === 'BIRT' || e.tag === 'BAPM' || e.tag === 'CHR') && sur(e)))
    }
  }
  return res.sort((a, b) => a.tri - b.tri)
}

/** Au-delà de cet écart (en années) avec le fait le plus proche, on ne dit pas où vivait la personne */
const ECART_MAX = 20
/** En deçà, le lieu est tenu pour sûr ; au-delà, « sans doute » */
const ECART_SUR = 3

export interface LieuDeVie { jalon: Jalon; probable: boolean }

/** Où vivait la personne à cette date : le dernier lieu connu avant, à défaut le premier après */
export function lieuA(l: Jalon[], tri: number): LieuDeVie | undefined {
  let avant: Jalon | undefined, apres: Jalon | undefined
  for (const j of l) {
    if (j.tri <= tri) avant = j
    else { apres = j; break }
  }
  const a = anneeTri(tri)
  const dAvant = avant ? a - anneeTri(avant.tri) : Infinity
  const dApres = apres ? anneeTri(apres.tri) - a : Infinity
  if (avant && apres && distanceKm(avant.pos, apres.pos) < 2) return { jalon: avant, probable: Math.min(dAvant, dApres) > ECART_MAX }
  if (avant && dAvant <= ECART_MAX) return { jalon: avant, probable: dAvant > ECART_SUR && dApres > ECART_SUR }
  if (apres && dApres <= ECART_MAX) return { jalon: apres, probable: dApres > ECART_SUR }
  return undefined
}

// ——— Qui a connu quoi ———

export interface Vecu {
  ev: EvenementHistorique
  id: string
  /** Âge (en années révolues, approché) au début de l'événement ; absent si la naissance n'est pas connue */
  age?: number
  lieu: string
  pos: Position
  /** Distance au lieu de l'événement (ponctuel) */
  km?: number
  probable: boolean
}

/** Un enfant trop jeune ne « connaît » pas une épidémie ou une guerre : âge minimal à la fin de l'événement */
const AGE_MIN_ETENDU = 6

/** La vie d'une personne, en clés AAAAMMJJ ; sans décès connu, soixante ans (ou jusqu'au dernier fait) */
function vie(d: Donnees, ind: Individu, l: Jalon[]): { debut: number; fin: number; naissance?: number } | undefined {
  const s = d.suivis.get(ind.id)
  if (!s) return undefined
  const n = s.naissance.evenement?.date
  const naissance = n?.tri && !['avant', 'après', 'entre'].includes(n.qualif) ? n.tri : undefined
  const estimee = naissance ? anneeTri(naissance) : anneeNaissanceEstimee(d.arbre, ind, s.naissance)
  const debut = naissance ?? (estimee !== undefined ? estimee * 10000 + 101 : l[0]?.tri)
  if (!debut) return undefined
  const m = s.deces.evenement?.date?.tri
  const dernier = l.length ? l[l.length - 1].tri : debut
  const fin = s.deces.etat === 'sans-objet' ? 99991231 : m && !['avant', 'après', 'entre'].includes(s.deces.evenement!.date!.qualif)
    ? m : Math.max(dernier, (anneeTri(debut) + VIE_PAR_DEFAUT) * 10000 + 1231)
  return { debut, fin, naissance: naissance ?? (estimee !== undefined ? estimee * 10000 + 701 : undefined) }
}

function dansZone(e: EvenementHistorique, j: Jalon): boolean {
  const pays = j.pays ?? j.pos.pays
  return !!e.z?.some((z) => z === pays || z === j.pos.codeRegion)
}

/** Durée maximale d'un événement de la liste, en années : on ne remonte pas plus loin avant une naissance */
const DUREE_MAX = 40

/** Premier événement qui commence à `tri` ou après (liste triée par début) */
function premierApres(debuts: number[], tri: number): number {
  let a = 0, b = debuts.length
  while (a < b) { const m = (a + b) >> 1; if (debuts[m] < tri) a = m + 1; else b = m }
  return a
}

/** Les événements qu'une personne a connus, dans l'ordre des dates. `liste` doit être triée par date de début (aucun ne dure plus de quarante ans). */
export function evenementsDe(d: Donnees, ind: Individu, positions: Map<string, Position>, liste: EvenementHistorique[], cache?: Cache): Vecu[] {
  const c = cache ?? preparer(liste, positions)
  const l = jalons(d, ind, positions, c.pays)
  if (!l.length) return []
  const v = vie(d, ind, l)
  if (!v) return []
  // Le rectangle des lieux de la personne : un événement ponctuel loin de là est écarté sans calcul
  let lat0 = 90, lat1 = -90, lon0 = 180, lon1 = -180
  for (const j of l) { lat0 = Math.min(lat0, j.pos.lat); lat1 = Math.max(lat1, j.pos.lat); lon0 = Math.min(lon0, j.pos.lon); lon1 = Math.max(lon1, j.pos.lon) }
  const res: Vecu[] = []
  for (let i = premierApres(c.debuts, v.debut - DUREE_MAX * 10000); i < liste.length; i++) {
    const e = liste[i]
    const debut = c.debuts[i]
    if (debut > v.fin) break
    const fin = c.fins[i]
    if (fin < v.debut) continue
    // Le lieu au début de l'événement, ou à la naissance s'il était déjà commencé
    const quand = Math.max(debut, v.debut)
    const age = v.naissance ? Math.floor((quand - v.naissance) / 10000) : undefined
    if (ponctuel(e)) {
      // 1° de latitude ≈ 111 km ; 1° de longitude ≥ 55 km jusqu'au 60e parallèle
      const r = e.r ?? 10
      if (e.lat! < lat0 - r / 111 || e.lat! > lat1 + r / 111 || e.lon! < lon0 - r / 55 || e.lon! > lon1 + r / 55) continue
      const ici = lieuA(l, quand)
      if (!ici) continue
      const km = distanceKm(ici.jalon.pos, { lat: e.lat!, lon: e.lon! })
      if (km > (e.r ?? 10)) continue
      res.push({ ev: e, id: ind.id, age, lieu: ici.jalon.lieu, pos: ici.jalon.pos, km, probable: ici.probable || ici.jalon.pos.qualite === 'incertain' })
    } else {
      if (v.naissance && Math.floor((fin - v.naissance) / 10000) < AGE_MIN_ETENDU) continue
      const ici = lieuA(l, quand)
      if (!ici || !dansZone(e, ici.jalon)) continue
      res.push({ ev: e, id: ind.id, age, lieu: ici.jalon.lieu, pos: ici.jalon.pos, probable: ici.probable })
    }
  }
  return res
}

/** Ce qui ne change pas d'une personne à l'autre : dates des événements, pays des lieux non reconnus */
interface Cache { debuts: number[]; fins: number[]; pays: Map<string, string | undefined> }

function preparer(liste: EvenementHistorique[], positions: Map<string, Position>): Cache {
  const pays = new Map<string, string | undefined>()
  for (const [lieu, p] of positions) if (!p.pays) pays.set(lieu, decouper(lieu).pays)
  return { debuts: liste.map((e) => triDe(e.d)), fins: liste.map((e) => (e.f ? triDe(e.f, true) : triDe(e.d, true))), pays }
}

export interface Index {
  /** Par personne, dans l'ordre des dates */
  parPersonne: Map<string, Vecu[]>
  /** Par événement, du plus proche au plus lointain */
  parEvenement: Map<string, Vecu[]>
  liste: EvenementHistorique[]
  /** Les lieux situés de l'arbre */
  positions: Map<string, Position>
}

/** Tous les événements connus par les personnes de l'arbre */
export function indexer(d: Donnees, positions: Map<string, Position>, liste: EvenementHistorique[]): Index {
  const triee = [...liste].sort((a, b) => triDe(a.d) - triDe(b.d))
  const parPersonne = new Map<string, Vecu[]>()
  const parEvenement = new Map<string, Vecu[]>()
  const cache = preparer(triee, positions)
  for (const ind of d.arbre.individus.values()) {
    const l = evenementsDe(d, ind, positions, triee, cache)
    if (!l.length) continue
    parPersonne.set(ind.id, l)
    for (const t of l) {
      const x = parEvenement.get(t.ev.id) ?? []
      x.push(t)
      parEvenement.set(t.ev.id, x)
    }
  }
  for (const l of parEvenement.values()) l.sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || (a.age ?? 0) - (b.age ?? 0))
  return { parPersonne, parEvenement, liste: triee, positions }
}

// ——— Où chercher des traces : les actes de décès en ligne ———

/** Les événements qui font des morts (les guerres et les régimes durent trop pour qu'un mois de registre parle d'eux) */
const MEURTRIERS: TypeEvenement[] = ['bataille', 'siege', 'bombardement', 'massacre', 'incendie', 'inondation', 'seisme', 'explosion', 'epidemie', 'famine', 'hiver']
/** Les décès enregistrés jusqu'à un mois après la fin : blessés, corps retrouvés, inhumations */
const APRES_MOIS = 1
/** Au-delà de deux ans, un mois de registre ne dit plus rien de l'événement */
const DUREE_TRACES_MAX = 2

export interface ActeEnLigne { id: string; tag: 'DEAT' | 'BURI'; url: string }
/** Les actes de décès d'une commune pour un mois, dont l'arbre a l'adresse en ligne */
export interface Trace { lieu: string; annee: number; mois: number; actes: ActeEnLigne[] }

/** Les mois de registres de décès, avec un acte en ligne, où l'événement a pu laisser des traces : décès ou inhumations
 * datés au jour ou au mois près, pendant l'événement ou le mois qui suit, près du lieu (ponctuel) ou dans la zone (étendu) */
export function tracesDeces(d: Donnees, positions: Map<string, Position>, ev: EvenementHistorique): Trace[] {
  if (!MEURTRIERS.includes(ev.type) || ev.p < 10) return []
  const debut = triDe(ev.d)
  const f = triDe(ev.f ?? ev.d, true)
  if (anneeTri(f) - anneeTri(debut) >= DUREE_TRACES_MAX) return []
  let [af, mf] = [anneeTri(f), Math.floor(f / 100) % 100 + APRES_MOIS]
  if (mf > 12) { af++; mf -= 12 }
  const fin = af * 10000 + mf * 100 + 31
  const res = new Map<string, Trace>()
  for (const ind of d.arbre.individus.values()) {
    for (const e of ind.evenements) {
      if ((e.tag !== 'DEAT' && e.tag !== 'BURI') || !e.lieu || !e.date?.debut?.mois || e.date.qualif !== '') continue
      if (e.date.tri < debut || e.date.tri > fin) continue
      const url = e.sources.map((s) => /https?:\/\/\S+/.exec(s)?.[0]).find(Boolean)
      if (!url) continue
      const pos = positions.get(e.lieu)
      if (!pos) continue
      if (ponctuel(ev) ? distanceKm(pos, { lat: ev.lat!, lon: ev.lon! }) > (ev.r ?? 10) : !dansZone(ev, { tri: e.date.tri, lieu: e.lieu, pos, pays: pos.pays ?? decouper(e.lieu).pays })) continue
      const { annee, mois } = e.date.debut
      const cle = `${e.lieu}|${annee}|${mois}`
      const t = res.get(cle) ?? { lieu: e.lieu, annee, mois, actes: [] }
      if (!t.actes.some((a) => a.url === url)) t.actes.push({ id: ind.id, tag: e.tag, url })
      res.set(cle, t)
    }
  }
  return [...res.values()].sort((a, b) => a.annee - b.annee || a.mois - b.mois || a.lieu.localeCompare(b.lieu))
}

/** Les plus marquants pour le récit : trois au plus, dont deux étendus, puis remis dans l'ordre des dates */
export function marquants(l: Vecu[], max = 3): Vecu[] {
  const poids = (t: Vecu) => t.ev.n * (t.km !== undefined ? 1.5 - t.km / (t.ev.r ?? 10) : 1) * (t.probable ? 0.6 : 1)
  const choisis: Vecu[] = []
  let etendus = 0
  for (const t of [...l].sort((a, b) => poids(b) - poids(a))) {
    if (choisis.length >= max) break
    if (t.km === undefined) { if (etendus >= 2) continue; etendus++ }
    choisis.push(t)
  }
  return choisis.sort((a, b) => triDe(a.ev.d) - triDe(b.ev.d))
}

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « le 18 juin 1815 », « en juin 1815 », « en 1815 » */
export function quandEvenement(e: EvenementHistorique): string {
  const [a, m, j] = e.d.split('-').map(Number)
  if (j && e.p >= 11) return `le ${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`
  if (m && e.p >= 10) return `en ${MOIS[m - 1]} ${a}`
  return `en ${a}`
}

/** « 1815 », « 1914-1918 » */
export function periode(e: EvenementHistorique): string {
  const a = e.d.slice(0, 4), b = e.f?.slice(0, 4)
  return b && b !== a ? `${a}-${b}` : a
}

/** « 18 juin 1815 », « du 12 octobre au 5 décembre 1798 », « de mars à décembre 1832 », « 1914-1918 » */
export function datesEvenement(e: EvenementHistorique): string {
  const lire = (s: string, p: number) => {
    const [a, m, j] = s.split('-').map(Number)
    return { a, m: p >= 10 && m ? m : undefined, j: p >= 11 && m && j ? j : undefined }
  }
  type J = ReturnType<typeof lire>
  const jour = (x: J) => (x.j === 1 ? '1er' : String(x.j))
  const mois = (x: J) => MOIS[x.m! - 1]
  const entier = (x: J) => (x.j ? `${jour(x)} ${mois(x)} ${x.a}` : x.m ? `${mois(x)} ${x.a}` : String(x.a))
  const D = lire(e.d, e.p)
  if (!e.f || e.f === e.d) return entier(D)
  const F = lire(e.f, e.f.length >= 10 ? 11 : e.f.length >= 7 ? 10 : 9)
  if (D.a !== F.a) return D.m && F.m ? `${entier(D)} – ${entier(F)}` : `${D.a}-${F.a}`
  if (!D.m || !F.m) return String(D.a)
  if (D.j && F.j) return D.m === F.m ? `du ${jour(D)} au ${jour(F)} ${mois(F)} ${F.a}` : `du ${jour(D)} ${mois(D)} au ${jour(F)} ${mois(F)} ${F.a}`
  if (D.m === F.m) return `${mois(D)} ${D.a}`
  return `${/^[aeiou]/.test(mois(D)) ? 'd’' : 'de '}${mois(D)} à ${mois(F)} ${F.a}`
}

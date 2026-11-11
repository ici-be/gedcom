// Recherche en série : pour toutes les personnes à qui il manque une source ou un fait, l'acte est cherché dans les
// index d'Open Archives, les ancêtres d'abord (par numéro Sosa), puis leurs frères et sœurs, puis le reste de l'arbre.
// Ce qui est trouvé et l'avancement restent dans le navigateur (IndexedDB) : la recherche reprend où elle s'était
// arrêtée, même après avoir fermé la page ou chargé un nouvel export. Elle continue pendant qu'on visite d'autres écrans.

import type { Donnees, Perimetre } from './donnees'
import type { Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import { cleGeneWeb, comparerSosa } from './parente'
import { chercherActe, faitsCherches, type Candidat, type FaitCherche } from './recherche-auto'
import { garderObjet, lireObjet, oublierObjet } from './stockage'

/** 0 : ancêtre · 1 : frère ou sœur d'ancêtre · 2 : le reste de l'arbre */
export type Rang = 0 | 1 | 2

export interface FaitSerie { cle: string; fait: FaitCherche }
export interface Tache { id: string; rang: Rang; sosa?: string; faits: FaitSerie[] }

export interface Trouve { quand: string; candidats: Candidat[]; complet: boolean }
export interface Memoire {
  /** Clé du fait → ce que l'index a donné (aucun candidat compris : le fait ne sera pas cherché deux fois) */
  faits: Record<string, Trouve>
  /** Faits marqués « traité » */
  traites: string[]
  /**
   * 2 : les naissances sans date d'avant 1796 sont cherchées sous le rôle « Kind » aussi
   * 3 : tri plus sévère (prénoms, pays) et mariages cherchés avec le nom du conjoint
   */
  version?: number
}

const VERSION = 3

/**
 * Ce qu'une version précédente a mal cherché est oublié, pour être cherché à nouveau : les naissances sans date d'avant
 * 1796, puis tout ce qui avait des candidats (triés trop largement), les mariages et les noms trop répandus.
 * Un fait sans candidat le reste avec un tri plus sévère : il n'est pas cherché à nouveau.
 */
export function rafraichir(m: Memoire | undefined): Memoire {
  const faits = { ...m?.faits }
  if ((m?.version ?? 1) < 2) {
    for (const cle of Object.keys(faits)) {
      const [, , , quoi, annees = ''] = cle.split('|')
      if (quoi === 'naissance' && annees.includes('-') && parseInt(annees) < 1796) delete faits[cle]
    }
  }
  if ((m?.version ?? 1) < 3) {
    for (const [cle, t] of Object.entries(faits)) if (t.candidats.length || !t.complet || cle.split('|')[3] === 'mariage') delete faits[cle]
  }
  return { faits, traites: m?.traites ?? [], version: VERSION }
}

const CLE = 'recherche-serie'

/** Clé stable d'un export à l'autre (les identifiants @I…@ changent) : prénom, nom, année de naissance, puis le fait */
export function cleFait(ind: Individu, f: FaitCherche): string {
  const naissance = annee(ind.evenements.find((e) => ['BIRT', 'BAPM', 'CHR'].includes(e.tag) && e.date)?.date) ?? ''
  const conjoint = f.conjoint ? cleGeneWeb(f.conjoint.nom) : ''
  return [cleGeneWeb(ind.prenom), cleGeneWeb(ind.nom), naissance, f.quoi, f.de === f.a ? f.de : `${f.de}-${f.a}`, conjoint].join('|')
}

/** Les personnes qui ont un fait à chercher, dans l'ordre : ancêtres par Sosa, leurs frères et sœurs, puis les autres */
export function fileSerie(d: Donnees, perimetre: Perimetre, sansDate: boolean): Tache[] {
  const taches: Tache[] = []
  const ajouter = (id: string, rang: Rang, sosa?: string) => {
    const ind = d.arbre.individus.get(id)
    if (!ind || !ind.nom || !ind.prenom) return
    const faits = faitsCherches(d, ind, sansDate).filter((f) => f.aSourcer).map((fait) => ({ cle: cleFait(ind, fait), fait }))
    if (faits.length) taches.push({ id, rang, sosa, faits })
  }
  for (const a of [...d.ancetres.values()].sort((x, y) => comparerSosa(x.sosa, y.sosa))) ajouter(a.id, 0, a.sosa)
  if (perimetre === 'ancetres') return taches
  for (const a of [...d.fratries.values()].sort((x, y) => comparerSosa(x.sosa, y.sosa))) ajouter(a.id, 1, a.sosa)
  if (perimetre === 'ancetres-fratries') return taches
  for (const id of d.arbre.individus.keys()) if (!d.ancetres.has(id) && !d.fratries.has(id)) ajouter(id, 2)
  return taches
}

export interface Etat {
  /** La mémoire a été relue du navigateur */
  pret: boolean
  enCours: boolean
  memoire: Memoire
  /** Personne en cours de recherche */
  courant?: string
  erreur?: string
  /** Millisecondes par fait, mesurées pendant cette visite (pour estimer le temps restant) */
  rythme?: number
}

let etat: Etat = { pret: false, enCours: false, memoire: { faits: {}, traites: [], version: VERSION } }
const abonnes = new Set<() => void>()
let arret: AbortController | undefined
let chargement: Promise<void> | undefined

function publier(changement: Partial<Etat>) {
  etat = { ...etat, ...changement }
  for (const f of abonnes) f()
}

export const etatSerie = (): Etat => etat

export function abonner(f: () => void): () => void {
  abonnes.add(f)
  return () => { abonnes.delete(f) }
}

/** Relit la mémoire du navigateur (une fois) */
export function chargerSerie(): Promise<void> {
  chargement ??= lireObjet<Memoire>(CLE).then((m) => publier({ pret: true, memoire: rafraichir(m) }))
  return chargement
}

const garder = () => garderObjet(CLE, etat.memoire)

const attendre = (ms: number, signal: AbortSignal) => new Promise<void>((ok, ko) => {
  const t = setTimeout(ok, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); ko(signal.reason) }, { once: true })
})

/** Lance ou reprend la recherche : les faits déjà cherchés sont passés */
export async function demarrerSerie(d: Donnees, taches: Tache[]): Promise<void> {
  await chargerSerie()
  if (etat.enCours) return
  const controle = new AbortController()
  arret = controle
  publier({ enCours: true, erreur: undefined })
  let depuisSauvegarde = 0
  let echecs = 0
  let duree = 0
  let nombre = 0
  try {
    for (const t of taches) {
      const ind = d.arbre.individus.get(t.id)
      if (!ind) continue
      for (const f of t.faits) {
        if (etat.memoire.faits[f.cle]) continue
        if (etat.courant !== t.id) publier({ courant: t.id })
        // la base ne répond pas ou demande de ralentir : on patiente et on repose la question, puis on abandonne au troisième échec de suite
        for (;;) {
          const debut = Date.now()
          try {
            const r = await chercherActe(ind, f.fait, controle.signal)
            echecs = 0
            nombre++
            duree += Date.now() - debut
            publier({
              memoire: { ...etat.memoire, faits: { ...etat.memoire.faits, [f.cle]: { quand: new Date().toISOString().slice(0, 10), candidats: r.candidats.slice(0, 8), complet: r.complet } } },
              rythme: duree / nombre,
            })
            if (++depuisSauvegarde >= 10) { depuisSauvegarde = 0; await garder() }
            break
          } catch (e) {
            if (controle.signal.aborted || ++echecs >= 3) throw e
            await attendre(30000, controle.signal)
          }
        }
      }
    }
    publier({ enCours: false, courant: undefined })
  } catch (e) {
    publier({ enCours: false, courant: undefined, erreur: controle.signal.aborted ? undefined : 'Open Archives ne répond plus\u202f: ' + (e instanceof Error ? e.message : String(e)) + '. La recherche reprendra où elle en est.' })
  }
  await garder()
}

export function arreterSerie(): void {
  arret?.abort()
}

export function marquerTraite(cle: string, oui: boolean): void {
  const traites = new Set(etat.memoire.traites)
  if (oui) traites.add(cle)
  else traites.delete(cle)
  publier({ memoire: { ...etat.memoire, traites: [...traites] } })
  void garder()
}

/** Oublie tout ce qui a été trouvé : la recherche repartira du début */
export async function effacerSerie(): Promise<void> {
  arreterSerie()
  publier({ memoire: { faits: {}, traites: [], version: VERSION }, erreur: undefined })
  await oublierObjet(CLE)
}

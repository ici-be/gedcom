// Plan de visite d'archives : pour des communes et une période, les actes à lever, registre par registre et année par année.

import type { Commune, Acte, Groupe } from './communes'
import { GROUPES } from './communes'
import { etatEvenement } from './suivi'

export interface Reglages {
  /** Les communes (lieux complets) à visiter */
  lieux: ReadonlySet<string>
  de?: number
  a?: number
  groupes: ReadonlySet<Groupe>
  /** Garder les faits sans date, quelle que soit la période */
  sansDate: boolean
  /** Actes déjà trouvés (cochés), à laisser de côté */
  trouves: ReadonlySet<string>
}

export interface Registre {
  groupe: Groupe
  titre: string
  /** Triés par date ; les faits sans date à la fin */
  actes: Acte[]
  /** « 1745, 1750–1753, 1790 » */
  annees: string
  sansDate: number
}

export interface PlanCommune {
  commune: Commune
  registres: Registre[]
  total: number
}

export const anneeActe = (a: Acte): number | undefined => a.evenement.date?.debut?.annee

/** [1745, 1750, 1751, 1753] → « 1745, 1750–1751, 1753 » */
export function plagesAnnees(annees: number[]): string {
  const u = [...new Set(annees)].sort((x, y) => x - y)
  const plages: string[] = []
  for (let i = 0; i < u.length;) {
    let j = i
    while (j + 1 < u.length && u[j + 1] === u[j] + 1) j++
    plages.push(j > i ? `${u[i]}–${u[j]}` : String(u[i]))
    i = j + 1
  }
  return plages.join(', ')
}

/** Les actes encore à chercher, par commune puis par registre (naissances, mariages, décès, autres) */
export function planArchives(communes: Commune[], r: Reglages): PlanCommune[] {
  const res: PlanCommune[] = []
  for (const commune of communes) {
    if (!r.lieux.has(commune.lieu)) continue
    const registres: Registre[] = []
    for (const g of GROUPES) {
      if (!r.groupes.has(g.id)) continue
      const actes = commune.actes
        .filter((a) => a.groupe === g.id && etatEvenement(a.evenement) === 'sans-source' && !r.trouves.has(a.cle))
        .filter((a) => {
          const an = anneeActe(a)
          if (an === undefined) return r.sansDate
          return (r.de === undefined || an >= r.de) && (r.a === undefined || an <= r.a)
        })
        .sort((x, y) => (x.evenement.date?.tri || 99999999) - (y.evenement.date?.tri || 99999999))
      if (!actes.length) continue
      const annees = actes.map(anneeActe).filter((x): x is number => x !== undefined)
      registres.push({ groupe: g.id, titre: g.titre, actes, annees: plagesAnnees(annees), sansDate: actes.length - annees.length })
    }
    if (registres.length) res.push({ commune, registres, total: registres.reduce((n, g) => n + g.actes.length, 0) })
  }
  return res.sort((a, b) => b.total - a.total || a.commune.nom.localeCompare(b.commune.nom, 'fr'))
}

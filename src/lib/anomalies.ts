// Incohérences entre les dates de l'arbre : un parent trop jeune, un enfant né après la mort de sa mère, un mariage d'enfant…
// Seules les années sont comparées, avec une marge ; les dates « avant » et « après » ne servent pas.

import type { Arbre, Evenement, Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'

export type TypeAnomalie = 'parent-jeune' | 'parent-age' | 'apres-deces' | 'mariage' | 'age'

export const TYPES_ANOMALIES: Record<TypeAnomalie, string> = {
  'parent-jeune': 'Parent trop jeune ou né après son enfant',
  'parent-age': 'Parent trop âgé',
  'apres-deces': 'Enfant ou mariage après un décès',
  mariage: 'Mariage trop précoce',
  age: 'Âge impossible',
}

export interface Anomalie {
  /** La personne à ouvrir */
  id: string
  /** L'autre personne concernée (parent, conjoint), s'il y en a une */
  autre?: string
  type: TypeAnomalie
  texte: string
}

const AGE_MINI = 15
const AGE_MAXI_MERE = 50
const AGE_MAXI_PERE = 75
const AGE_MAXI = 110

/** Année d'un fait, si la date n'est pas une borne (« avant 1700 ») */
function an(evenements: Evenement[], tags: string[]): number | undefined {
  for (const t of tags) {
    for (const e of evenements) {
      if (e.tag !== t || !e.date) continue
      if (e.date.qualif === 'avant' || e.date.qualif === 'après') continue
      const a = annee(e.date)
      if (a !== undefined) return a
    }
  }
  return undefined
}

const naissance = (i: Individu) => an(i.evenements, ['BIRT', 'BAPM', 'CHR'])
const deces = (i: Individu) => an(i.evenements, ['DEAT', 'BURI', 'CREM'])
const nom = (i: Individu) => `${i.prenom} ${i.nom}`.trim()

export function anomalies(arbre: Arbre): Anomalie[] {
  const res: Anomalie[] = []
  const vues = new Set<string>()
  const ajouter = (a: Anomalie) => {
    const k = `${a.id}|${a.autre ?? ''}|${a.type}|${a.texte}`
    if (!vues.has(k)) { vues.add(k); res.push(a) }
  }

  for (const ind of arbre.individus.values()) {
    const n = naissance(ind)
    const d = deces(ind)
    if (n !== undefined && d !== undefined) {
      if (d < n) ajouter({ id: ind.id, type: 'age', texte: `Mort en ${d}, avant sa naissance (${n})` })
      else if (d - n > AGE_MAXI) ajouter({ id: ind.id, type: 'age', texte: `Mort à ${d - n} ans (${n}, ${d})` })
    }
    // ses parents
    for (const f of ind.famc) {
      const fam = arbre.familles.get(f)
      if (!fam || n === undefined) continue
      const mere = fam.femme ? arbre.individus.get(fam.femme) : undefined
      const pere = fam.mari ? arbre.individus.get(fam.mari) : undefined
      for (const [p, role, maxi] of [[mere, 'sa mère', AGE_MAXI_MERE], [pere, 'son père', AGE_MAXI_PERE]] as const) {
        if (!p) continue
        const pn = naissance(p)
        if (pn !== undefined) {
          if (pn > n) ajouter({ id: ind.id, autre: p.id, type: 'parent-jeune', texte: `Né en ${n}, avant ${role} ${nom(p)} (${pn})` })
          else if (n - pn < AGE_MINI) ajouter({ id: ind.id, autre: p.id, type: 'parent-jeune', texte: `Né en ${n} de ${role} ${nom(p)}, née ou né en ${pn} (${n - pn} ans)` })
          else if (n - pn > maxi) ajouter({ id: ind.id, autre: p.id, type: 'parent-age', texte: `Né en ${n} de ${role} ${nom(p)}, née ou né en ${pn} (${n - pn} ans)` })
        }
        const pd = deces(p)
        // un père peut mourir jusqu'à neuf mois avant la naissance
        if (pd !== undefined && n > pd + (p === pere ? 1 : 0)) {
          ajouter({ id: ind.id, autre: p.id, type: 'apres-deces', texte: `Né en ${n}, après la mort de ${role} ${nom(p)} (${pd})` })
        }
      }
    }
    // ses mariages
    for (const f of ind.fams) {
      const fam = arbre.familles.get(f)
      if (!fam) continue
      const m = an(fam.evenements, ['MARR'])
      if (m === undefined) continue
      const autreId = fam.mari === ind.id ? fam.femme : fam.mari
      const autre = autreId ? arbre.individus.get(autreId) : undefined
      if (n !== undefined && m - n < AGE_MINI) {
        ajouter({ id: ind.id, autre: autre?.id, type: 'mariage', texte: m < n ? `Marié en ${m}, avant sa naissance (${n})` : `Marié à ${m - n} ans (${n}, ${m})` })
      }
      if (d !== undefined && m > d) ajouter({ id: ind.id, autre: autre?.id, type: 'apres-deces', texte: `Marié en ${m}, après sa mort (${d})` })
    }
  }
  return res.sort((a, b) => a.type.localeCompare(b.type) || a.texte.localeCompare(b.texte, 'fr'))
}

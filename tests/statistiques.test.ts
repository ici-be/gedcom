import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { compter, ecartAnnees, generations, resumer, statistiques } from '../src/lib/statistiques'
import { GED } from './exemple'
import { clePrenom, formeUsuelle } from '../src/lib/prenoms'

describe('outils', () => {
  test('âge en années, au jour près quand on le peut', () => {
    expect(ecartAnnees({ annee: 1900 }, { annee: 1950 })).toBe(50)
    expect(ecartAnnees({ annee: 1900, mois: 6, jour: 1 }, { annee: 1950, mois: 5, jour: 31 })).toBeCloseTo(50, 0)
    expect(ecartAnnees({ annee: 1900, mois: 6, jour: 1 }, { annee: 1950, mois: 5, jour: 31 })).toBeLessThan(50)
  })
  test('moyenne et médiane', () => {
    expect(resumer([1, 2, 3, 10])).toMatchObject({ n: 4, moyenne: 4, mediane: 2.5, min: 1, max: 10 })
    expect(resumer([])).toBeUndefined()
    expect(compter(['a', 'b', 'a'], (x) => x)).toEqual([['a', 2], ['b', 1]])
  })
})

describe('arbre d\'exemple', () => {
  const d = calculer(lireArbre(GED), '@I1@', '')
  test('ascendance par génération', () => {
    const g = generations(d)
    expect(g.slice(0, 3)).toEqual([
      { generation: 1, theoriques: 1, connus: 1, distincts: 1, closes: 0 },
      { generation: 2, theoriques: 2, connus: 2, distincts: 2, closes: 0 },
      { generation: 3, theoriques: 4, connus: 2, distincts: 2, closes: 0 },
    ])
  })
  test('relevés', () => {
    const s = statistiques(d, null)
    expect(s.personnes.length).toBe(d.arbre.individus.size)
    // Marie, baptisée en mars 1952, mariée en juin 1975 : 23 ans
    expect(s.mariages.find((m) => m.id === '@I3@')?.age).toBeCloseTo(23.3, 1)
    // Jean (vers 1950) avait environ 32 ans à la naissance de Paul
    expect(s.parents.find((p) => p.id === '@I2@')?.age).toBe(32)
    expect(s.mois).toContainEqual({ type: 'mariages', mois: 6, siecle: 20 })
    expect(s.fratries.map((f) => f.enfants).sort()).toEqual([1, 2])
    expect(s.prenoms.find((p) => p.prenom === 'Paul')?.sexe).toBe('M')
  })
})

describe('prénoms', () => {
  test('regroupe les variantes sous la forme usuelle', () => {
    expect(formeUsuelle('Joannes')).toBe('Jean')
    expect(formeUsuelle('Jan')).toBe('Jean')
    expect(formeUsuelle('Jacobus')).toBe('Jacques')
    expect(formeUsuelle('Joanna')).toBe('Jeanne')
    expect(formeUsuelle('Pétronille')).toBe('Pétronille')
    expect(formeUsuelle('Petronella')).toBe('Pétronille')
    expect(clePrenom('Zénobe')).toBe('zenobe')
  })
})

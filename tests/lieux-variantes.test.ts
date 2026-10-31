import { expect, test } from 'vitest'
import { variantesDe } from '../src/lib/lieux-variantes'
import { planArchives, plagesAnnees } from '../src/lib/plan-archives'
import { communes } from '../src/lib/communes'
import { lireArbre } from '../src/lib/gedcom/arbre'

const groupes = (l: [string, number][]) => variantesDe(new Map(l))

test('écriture, abréviation et pays absent', () => {
  const g = groupes([['Saint-Gilles, Bruxelles-Capitale, Belgique', 5], ['St Gilles, Bruxelles-Capitale, Belgique', 1], ['SAINT GILLES, Bruxelles-Capitale', 1]])
  expect(g).toHaveLength(1)
  expect(g[0].suggestion).toBe('Saint-Gilles, Bruxelles-Capitale, Belgique')
  expect(g[0].variantes).toHaveLength(3)
})

test('nom néerlandais et province absente', () => {
  const g = groupes([['Bruxelles, Brabant, Belgique', 4], ['Brussel, Brabant, Belgique', 2], ['Bruxelles', 1]])
  expect(g).toHaveLength(1)
  expect(g[0].raisons).toContain('langue')
})

test('communes homonymes de provinces différentes : pas de regroupement', () => {
  expect(groupes([['Saint-Denis, Hainaut, Belgique', 2], ['Saint-Denis, Namur, Belgique', 2], ['Saint-Denis, Seine-Saint-Denis, France', 1]])).toHaveLength(0)
})

test('un lieu sans province ne choisit pas entre deux communes homonymes', () => {
  expect(groupes([['Ath, Hainaut, Belgique', 3], ['Ath, Georgia, USA', 1], ['Ath', 1]])).toHaveLength(0)
})

test('faute de frappe dans la même province', () => {
  const g = groupes([['Ghislenghien, Hainaut, Belgique', 3], ['Ghislenghin, Hainaut, Belgique', 1]])
  expect(g).toHaveLength(1)
  expect(g[0].raisons).toContain('faute')
  expect(groupes([['Ghislenghien, Hainaut, Belgique', 3], ['Ghislenghin, Namur, Belgique', 1]])).toHaveLength(0)
})

test('hameau et adresse laissés de côté', () => {
  expect(groupes([['[Hameau] - Cuesmes, Hainaut, Belgique', 1], ['Cuesmes, Hainaut, Belgique', 2], ['Rue Blaes 247, Bruxelles', 1], ['Bruxelles', 3]])).toHaveLength(0)
})

test('années en plages', () => {
  expect(plagesAnnees([1753, 1745, 1750, 1751, 1750])).toBe('1745, 1750–1751, 1753')
})

test('plan : période, registres et faits cochés', () => {
  const arbre = lireArbre(`0 @I1@ INDI
1 NAME Jean /Dupont/
1 BIRT
2 DATE 1745
2 PLAC Ath, Hainaut, Belgique
0 @I2@ INDI
1 NAME Marie /Lambert/
1 BIRT
2 DATE 1801
2 PLAC Ath, Hainaut, Belgique
1 DEAT
2 PLAC Ath, Hainaut, Belgique
0 @I3@ INDI
1 NAME Paul /Dupont/
1 BIRT
2 DATE 1750
2 PLAC Ath, Hainaut, Belgique
2 SOUR Registre paroissial
`)
  const c = communes(arbre, null, false)
  const lieu = 'Ath, Hainaut, Belgique'
  const base = { lieux: new Set([lieu]), groupes: new Set(['naissances', 'deces'] as const), sansDate: false, trouves: new Set<string>() }
  const p = planArchives(c, { ...base, de: 1700, a: 1800 })
  expect(p).toHaveLength(1)
  expect(p[0].registres.map((r) => r.titre)).toEqual(['Naissances et baptêmes'])
  expect(p[0].registres[0].actes).toHaveLength(1)
  expect(p[0].registres[0].annees).toBe('1745')
  expect(planArchives(c, { ...base, sansDate: true })[0].total).toBe(3)
})

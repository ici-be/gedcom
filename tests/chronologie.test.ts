import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { chronologie, marquantes } from '../src/lib/chronologie'

const arbre = lireArbre(`0 @I1@ INDI
1 NAME Jean /Dupont/
1 SEX M
1 BIRT
2 DATE 12 MAR 1750
2 PLAC Ath, Hainaut, Belgique
1 OCCU Tisserand
2 DATE 1780
1 DEAT
2 DATE 3 JAN 1815
1 FAMC @F0@
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marie /Lambert/
1 SEX F
1 BIRT
2 DATE 1755
1 DEAT
2 DATE 1800
1 FAMS @F1@
0 @I3@ INDI
1 NAME Paul /Dupont/
1 SEX M
1 BIRT
2 DATE 2 FEB 1778
1 FAMC @F1@
1 FAMS @F2@
0 @I4@ INDI
1 NAME Louis /Dupont/
1 SEX M
1 BIRT
2 DATE 1748
1 FAMC @F0@
0 @I5@ INDI
1 NAME Pierre /Dupont/
1 SEX M
1 DEAT
2 DATE 1760
1 FAMS @F0@
0 @I6@ INDI
1 NAME Anne /Petit/
1 SEX F
1 FAMS @F2@
0 @I7@ INDI
1 NAME Luc /Dupont/
1 BIRT
2 DATE 1805
1 FAMC @F2@
0 @F0@ FAM
1 HUSB @I5@
1 CHIL @I4@
1 CHIL @I1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1776
2 PLAC Ath, Hainaut, Belgique
0 @F2@ FAM
1 HUSB @I3@
1 WIFE @I6@
1 CHIL @I7@
1 MARR
2 DATE 1802
`)

test('chronologie : faits, proches et histoire', () => {
  const d = calculer(arbre, '@I1@', '')
  const hist = {
    ev: { id: 'Q1', t: 'la bataille de Fleurus', type: 'bataille' as const, d: '1794-06-26', p: 11, n: 50 },
    id: '@I1@', age: 44, lieu: 'Ath', pos: { lat: 0, lon: 0 }, probable: false,
  }
  const c = chronologie(d, '@I1@', [hist as never])!
  expect(c.naissance).toBe(1750)
  expect(c.deces).toBe(1815)
  expect(c.ageDeces).toBe(64)
  expect(c.unions).toBe(1)
  expect(c.enfants).toBe(1)
  const titres = c.etapes.map((e) => `${e.annee} ${e.titre}`)
  expect(titres).toContain('1750 Naissance')
  expect(titres).toContain('1776 Mariage avec Marie Lambert')
  expect(titres).toContain('1778 Naissance de Paul')
  expect(titres).toContain('1802 Mariage de Paul avec Anne Petit')
  expect(titres).toContain('1805 Naissance de Luc')
  expect(titres).toContain('1800 Décès de Marie')
  expect(titres).toContain('1794 La bataille de Fleurus')
  expect(titres).not.toContain('1748 Naissance de Louis') // avant sa naissance
  expect(titres).toContain('1760 Décès de Pierre') // le père meurt pendant sa vie
  expect(c.etapes.find((e) => e.titre === 'Décès de Marie')?.detail).toBe('à 45 ans')
  expect(marquantes(c.etapes, 1).size).toBe(1)
  const ordre = c.etapes.map((e) => e.tri)
  expect(ordre).toEqual([...ordre].sort((a, b) => a - b))
})

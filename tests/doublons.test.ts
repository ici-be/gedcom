import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { doublons } from '../src/lib/doublons'

const arbre = lireArbre(`0 @I1@ INDI
1 NAME René /Dupont/
1 SEX M
1 BIRT
2 DATE 12 MAR 1750
2 PLAC Ath, Hainaut, Belgique
0 @I2@ INDI
1 NAME Rene /DUPONT/
1 SEX M
1 BAPM
2 DATE 14 MAR 1750
2 PLAC Ath, Hainaut, Belgique
0 @I3@ INDI
1 NAME René /Dupont/
1 SEX M
1 BIRT
2 DATE 1790
0 @I4@ INDI
1 NAME Jean-Baptiste /Lambert/
1 BIRT
2 DATE 1700
0 @I5@ INDI
1 NAME Jean Baptiste /Lambert/
1 BIRT
2 DATE 1701
0 @I6@ INDI
1 NAME Anne /Martin/
0 @I7@ INDI
1 NAME Anne /Martin/
`)

test('doublons potentiels', () => {
  const d = doublons(arbre).map((x) => [x.a, x.b].sort().join('+'))
  expect(d).toContain('@I1@+@I2@')
  expect(d).toContain('@I4@+@I5@')
  // dates incompatibles, ou rien en commun
  expect(d).not.toContain('@I1@+@I3@')
  expect(d).not.toContain('@I6@+@I7@')
})

const parentsDifferents = lireArbre(`0 @P1@ INDI
1 NAME Jean Baptiste /Lanciers/
1 SEX M
1 BIRT
2 DATE 1700
0 @P2@ INDI
1 NAME Jean François /Lanciers/
1 SEX M
1 BIRT
2 DATE 1760
0 @E1@ INDI
1 NAME Elisabeth /Lanciers/
1 SEX F
1 DEAT
2 DATE 1767
1 FAMC @F1@
0 @E2@ INDI
1 NAME Elisabeth /Lanciers/
1 SEX F
1 BIRT
2 DATE 1792
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @P1@
1 CHIL @E1@
0 @F2@ FAM
1 HUSB @P2@
1 CHIL @E2@
`)

test('mort bien avant la naissance de l’autre, pères différents : pas un doublon', () => {
  expect(doublons(parentsDifferents)).toEqual([])
})

import { famillesEnDouble } from '../src/lib/doublons'

const couples = lireArbre(`0 @H1@ INDI
1 NAME Pierre /Leroy/
1 SEX M
1 BIRT
2 DATE 1700
1 FAMS @F1@
0 @W1@ INDI
1 NAME Marie /Petit/
1 SEX F
1 FAMS @F1@
1 FAMS @F3@
0 @H2@ INDI
1 NAME Pierre /Leroy/
1 SEX M
1 BIRT
2 DATE 1701
1 FAMS @F2@
0 @W2@ INDI
1 NAME Marie /Petit/
1 SEX F
1 FAMS @F2@
0 @H3@ INDI
1 NAME Paul /Autre/
1 SEX M
1 FAMS @F3@
0 @F1@ FAM
1 HUSB @H1@
1 WIFE @W1@
1 MARR
2 DATE 1725
0 @F2@ FAM
1 HUSB @H2@
1 WIFE @W2@
1 MARR
2 DATE 1726
0 @F3@ FAM
1 HUSB @H3@
1 WIFE @W1@
1 MARR
2 DATE 1760
`)

test('familles en double', () => {
  const f = famillesEnDouble(couples).map((x) => [x.a, x.b].sort().join('+'))
  expect(f).toEqual(['@F1@+@F2@'])
})

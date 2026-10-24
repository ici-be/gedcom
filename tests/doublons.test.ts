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

import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { anomalies } from '../src/lib/anomalies'

const arbre = lireArbre(`0 @M@ INDI
1 NAME Anne /Martin/
1 SEX F
1 BIRT
2 DATE 1700
1 DEAT
2 DATE 1740
1 FAMS @F@
0 @P@ INDI
1 NAME Paul /Durand/
1 SEX M
1 BIRT
2 DATE 1695
1 FAMS @F@
0 @E@ INDI
1 NAME Luc /Durand/
1 SEX M
1 BIRT
2 DATE 1745
1 FAMC @F@
0 @G@ INDI
1 NAME Léa /Durand/
1 SEX F
1 BIRT
2 DATE 1725
1 FAMC @F@
0 @F@ FAM
1 HUSB @P@
1 WIFE @M@
1 CHIL @E@
1 CHIL @G@
1 MARR
2 DATE 1712
`)

test('anomalies de dates', () => {
  const a = anomalies(arbre).map((x) => `${x.id}:${x.type}`)
  // né cinq ans après la mort de sa mère, quand elle aurait eu 45 ans
  expect(a).toContain('@E@:apres-deces')
  // mariée à 12 ans
  expect(a).toContain('@M@:mariage')
  expect(a).not.toContain('@G@:parent-jeune')
  expect(a).not.toContain('@G@:apres-deces')
})

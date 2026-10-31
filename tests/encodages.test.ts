import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { encodages } from '../src/lib/encodages'

const arbre = lireArbre(`0 @A@ INDI
1 NAME Paul /Durand/
1 SEX M
1 MARR
2 DATE 1750
1 BIRT
2 DATE 1720
1 BIRT
2 DATE 1722
1 FAMS @F@
0 @B@ INDI
1 NAME Anne /Martin/
1 SEX M
1 FAMS @F@
0 @F@ FAM
1 HUSB @A@
1 WIFE @B@
1 DEAT
2 DATE 1800
`)

test('mauvais encodages', () => {
  const t = encodages(arbre).map((x) => x.type)
  expect(t).toContain('couple-individu')
  expect(t).toContain('individuel-famille')
  expect(t).toContain('double-fait')
  expect(t).toContain('conjoints')
})

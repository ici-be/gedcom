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
  // Geneanet range en « mari » le premier conjoint, quel que soit son sexe : ce n'est pas une erreur
  expect(t).not.toContain('conjoints')
})

test('fait libre « Marriage » sur une personne seule', () => {
  const a = lireArbre(`0 @I1@ INDI
1 NAME Marie Josèphe /Peutte/
1 SEX F
1 BIRT
2 DATE 22 AUG 1781
1 EVEN
2 TYPE Marriage
2 DATE 27 FEB 1801
2 PLAC Gand, Flandre-Orientale, Belgique
1 EVEN
2 TYPE Émigration
2 DATE 1830
`)
  const e = encodages(a)
  expect(e).toHaveLength(1)
  expect(e[0].type).toBe('couple-individu')
})

test('note issue d’un import', () => {
  const a = lireArbre(`0 @I1@ INDI
1 NAME Maria /Nuyts/
1 NOTE <p>* Reference: [https://www.myheritage.com/research/x MyHeritage Family Trees] - [https://www.geni.com/projects/SmartCopy/18783 SmartCopy]: ''Feb 6 2019''</p>
0 @I2@ INDI
1 NAME Jean /Simple/
1 NOTE Source: introuvable (registres brûlés)
`)
  const e = encodages(a).filter((x) => x.type === 'note')
  expect(e).toHaveLength(1)
  expect(e[0].id).toBe('@I1@')
})

test('nom tout en majuscules', () => {
  const a = lireArbre(`0 @I1@ INDI
1 NAME Jean /DUPONT/
0 @I2@ INDI
1 NAME Jean /Dupont/
0 @I3@ INDI
1 NAME LOUIS /Van Damme/
0 @I4@ INDI
1 NAME J. /X/
`)
  const e = encodages(a).filter((x) => x.type === 'majuscules').map((x) => x.id)
  expect(e.sort()).toEqual(['@I1@', '@I3@'])
})

test('nom et prénom en majuscules : un seul problème', () => {
  const a = lireArbre(`0 @I1@ INDI
1 NAME JEAN /DUPONT/
`)
  const e = encodages(a).filter((x) => x.type === 'majuscules')
  expect(e).toHaveLength(1)
  expect(e[0].texte).toContain('Le nom et le prénom')
})

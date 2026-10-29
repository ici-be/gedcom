import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { lignee } from '../src/lib/lignee'
import { GED } from './exemple'

const d = calculer(lireArbre(GED), '@I1@', '')

test('lignée paternelle : maillons, unions, suite', () => {
  const l = lignee(d, 'paternelle')!
  expect(l.maillons.map((m) => [m.id, m.sosa])).toEqual([['@I1@', '1'], ['@I2@', '2'], ['@I4@', '4']])
  // Jean, né vers 1950, a 32 ans à la naissance de Paul ; marié à Marie en 1975
  expect(l.maillons[1]).toMatchObject({ enfant: '@I1@', conjoint: '@I3@', sosaConjoint: '3', enfants: 1, ageEnfant: 32 })
  expect(l.maillons[1].union?.evenement?.date?.brute).toBe('10 JUN 1975')
  // Pierre et Anne : deux enfants, Jean et Luc
  expect(l.maillons[2]).toMatchObject({ conjoint: '@I5@', enfants: 2 })
  expect(l.suite.map((s) => [s.cote, s.etat, s.sosa])).toEqual([['pere', 'a-chercher', '8'], ['mere', 'a-chercher', '9']])
  expect(l.noms).toEqual([['Dupont', 3]])
  expect(l.lieux.map(([, n]) => n)).toEqual([1, 1])
})

test('lignée : maternelle, la plus longue, par numéro Sosa', () => {
  expect(lignee(d, 'maternelle')!.maillons.map((m) => m.id)).toEqual(['@I1@', '@I3@'])
  expect(lignee(d, 'longue')!.maillons.map((m) => m.id)).toEqual(['@I1@', '@I2@', '@I4@'])
  expect(lignee(d, '5')!.maillons.map((m) => m.id)).toEqual(['@I1@', '@I2@', '@I5@'])
  // personne à la place 6 (le père de Marie)
  expect(lignee(d, '6')).toBeNull()
  expect(lignee(d, 'n’importe quoi')).toBeNull()
})

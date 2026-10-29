import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { ascendance } from '../src/lib/ascendance'
import { GED } from './exemple'

test('ascendance : générations, quartiers, lignées, pistes', () => {
  const a = ascendance(calculer(lireArbre(GED), '@I1@', ''))
  expect(a.distincts).toBe(5)
  expect(a.generations.map((g) => g.connus)).toEqual([1, 2, 2])
  // Paul, ses parents Jean et Marie, puis Pierre et Anne du côté paternel
  expect(a.generations[2]).toMatchObject({ pere: 1, mere: 0, reste: 2 })
  expect(a.completes).toBe(2)
  expect(a.quartiers[0]).toMatchObject({ sosa: 4, id: '@I4@', distincts: 1, profondeur: 3 })
  expect(a.quartiers[2].id).toBeUndefined()
  expect(a.paternelle).toEqual(['@I1@', '@I2@', '@I4@'])
  expect(a.maternelle).toEqual(['@I1@', '@I3@'])
  expect(a.plusLongue).toEqual(['@I1@', '@I2@', '@I4@'])
  // Marie (génération 2) puis Pierre et Anne (3) ont des parents à chercher
  expect(a.pistes.map((p) => p.id)).toEqual(['@I3@', '@I4@', '@I5@'])
  expect([...a.connues].sort()).toEqual([1, 2, 3, 4, 5])
})

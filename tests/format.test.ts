import { expect, test } from 'vitest'
import { nomFichierArbre, nomFichierCouple } from '../src/lib/format'

test('nom du PDF : premier prénom, nom sans accents ni espaces, date', () => {
  expect(nomFichierArbre('Bruno Marie', 'Veÿckemans', '2026-10-15')).toBe('Genealogie_Bruno_Veyckemans_2026-10-15')
  expect(nomFichierArbre('Élise', 'De Maseneire', '2026-01-02')).toBe('Genealogie_Elise_De_Maseneire_2026-01-02')
  expect(nomFichierArbre('', '', '2026-01-02')).toBe('Genealogie_2026-01-02')
})

test('nom du PDF d\'un arbre du couple', () => {
  expect(nomFichierCouple('Cambier', 'Foulquet', '2026-10-19')).toBe('Genealogie_Cambier-Foulquet_2026-10-19')
  expect(nomFichierCouple('Dupont', 'Dupont', '2026-10-19')).toBe('Genealogie_Dupont_2026-10-19')
  expect(nomFichierCouple('De Maseneire', '', '2026-10-19')).toBe('Genealogie_De_Maseneire_2026-10-19')
})

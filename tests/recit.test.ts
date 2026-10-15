import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { lireDate } from '../src/lib/gedcom/dates'
import { calculer } from '../src/lib/donnees'
import { age, quand, recit, texteBrut } from '../src/lib/recit'
import { GED } from './exemple'

test('dates dites en toutes lettres', () => {
  expect(quand(lireDate('3 MAR 1702'))).toBe('le 3 mars 1702')
  expect(quand(lireDate('1 MAR 1702'))).toBe('le 1er mars 1702')
  expect(quand(lireDate('MAR 1702'))).toBe('en mars 1702')
  expect(quand(lireDate('1702'))).toBe('en 1702')
  expect(quand(lireDate('ABT 1702'))).toBe('vers 1702')
  expect(quand(lireDate('BEF 1702'))).toBe('avant 1702')
  expect(quand(lireDate('BET 1700 AND 1702'))).toBe('entre 1700 et 1702')
  expect(quand(undefined)).toBe('')
})

test('âges : exacts avec les mois, approchés sinon, rien sur une date bornée', () => {
  expect(age(lireDate('10 MAY 1800'), lireDate('9 MAY 1850'))).toEqual({ n: 49, approx: false })
  expect(age(lireDate('10 MAY 1800'), lireDate('10 MAY 1850'))).toEqual({ n: 50, approx: false })
  expect(age(lireDate('1800'), lireDate('1850'))).toEqual({ n: 50, approx: true })
  expect(age(lireDate('BEF 1800'), lireDate('1850'))).toBeUndefined()
})

test('le récit : la personne, ses parents, toujours le même texte, des noms en liens', () => {
  const d = calculer(lireArbre(GED), '@I1@', '')
  const r = recit(d, '@I1@', 2, 1)!
  expect(r.parties[0].titre).toBeTruthy()
  expect(r.parties.map((p) => p.titre)).toContain('Ses parents')
  const t = texteBrut(r)
  expect(t).toBe(texteBrut(recit(d, '@I1@', 2, 1)!))
  // chaque phrase commence par une majuscule et finit par un point ; pas d'espace avant la virgule
  for (const pt of r.parties) for (const ph of pt.paragraphes) {
    const s = ph.map((m) => (typeof m === 'string' ? m : m.t)).join('')
    expect(s).toMatch(/^[A-ZÀ-Ý]/)
    expect(s).toMatch(/[.]$/)
    expect(s).not.toMatch(/ ,| \.|\s{2}/)
  }
  expect(r.parties.flatMap((p) => p.paragraphes.flat()).some((m) => typeof m === 'object' && m.id === '@I2@')).toBe(true)
  expect(recit(d, '@inconnu@', 1, 1)).toBeNull()
})

import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { chercher, indexerRecherche, simplifier } from '../src/lib/recherche-globale'

const GED = `0 @I1@ INDI
1 NAME Jean Pierre /Van den Bossche/
1 SEX M
1 OCCU cultivateur
1 BIRT
2 DATE 12 MAR 1801
2 PLAC Éghezée, Namur, Belgique
0 @I2@ INDI
1 NAME Marie /Dupont/
1 SEX F
0 TRLR
`

describe('recherche globale', () => {
  const d = calculer(lireArbre(GED), 'I1', '')
  const ix = indexerRecherche(d)

  test('sans accents ni casse, tirets comme espaces', () => {
    expect(simplifier('Éghezée-Saint’Jean')).toBe('eghezee saint jean')
  })

  test('trouve une personne par prénom et nom, dans le désordre', () => {
    const r = chercher(d, ix, 'bossche jean')
    expect(r[0]).toMatchObject({ genre: 'personne', libelle: 'VAN DEN BOSSCHE Jean Pierre', lien: '#/recherches/%40I1%40' })
    expect(r[0].detail).toBe('1801')
  })

  test('trouve un lieu et un métier', () => {
    expect(chercher(d, ix, 'eghez').some((x) => x.genre === 'lieu' && x.libelle === 'Éghezée')).toBe(true)
    expect(chercher(d, ix, 'cultiv').some((x) => x.genre === 'metier')).toBe(true)
  })

  test('rien pour un texte trop court ou sans correspondance', () => {
    expect(chercher(d, ix, 'j')).toEqual([])
    expect(chercher(d, ix, 'zzzz')).toEqual([])
  })
})

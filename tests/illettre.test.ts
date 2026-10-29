import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { lireIllettre } from '../src/lib/illettre'

describe('mention « Signature: illettré »', () => {
  test('les formes reconnues', () => {
    expect(lireIllettre('Signature: illettré')).toEqual({})
    expect(lireIllettre('signature : ILLETTREE')).toEqual({})
    expect(lireIllettre('Signature: ne savait pas écrire')).toEqual({})
    expect(lireIllettre('Signature: analphabète')).toEqual({})
    expect(lireIllettre('Signature: une croix (acte de baptême de son fils, 1832)')).toEqual({ precision: 'acte de baptême de son fils, 1832' })
  })
  test('précision dans la graphie d’origine, HTML', () => {
    expect(lireIllettre('Cultivateur.\nSignature: illettré, a déclaré ne savoir signer, mariage Ath 1820.')).toEqual({ precision: 'a déclaré ne savoir signer, mariage Ath 1820' })
    expect(lireIllettre('<p>Signature: ne sait pas signer (Été 1820)</p><p>Autre</p>')).toEqual({ precision: 'Été 1820' })
  })
  test('ce qui n’en est pas', () => {
    expect(lireIllettre('illettré')).toBeUndefined()
    expect(lireIllettre('Signature: belle écriture')).toBeUndefined()
    expect(lireIllettre('Signature: illettrisme')).toBeUndefined()
  })
})

test('dans l’arbre', () => {
  const a = lireArbre(`0 @I1@ INDI
1 NAME Paul /Dupont/
1 NOTE @N1@
0 @I2@ INDI
1 NAME Marie /Lambert/
1 NOTE Signature: illett
2 CONC rée
0 @N1@ NOTE Journalier.
1 CONT Signature: ne sait pas signer (mariage 1820)
`)
  expect(a.individus.get('@I1@')!.illettre).toEqual({ precision: 'mariage 1820' })
  expect(a.individus.get('@I2@')!.illettre).toEqual({})
})

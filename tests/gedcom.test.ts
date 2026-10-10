import { describe, expect, test } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { decoder, lireNoeuds } from '../src/lib/gedcom/lecture'
import { lireDate } from '../src/lib/gedcom/dates'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { estZip, gedDuZip } from '../src/lib/zip'
import { GED } from './exemple'

describe('dates', () => {
  test('date complète', () => {
    const d = lireDate('30 MAY 1982')
    expect(d.texte).toBe('30 mai 1982')
    expect(d.tri).toBe(19820530)
  })
  test('qualificatifs et intervalles', () => {
    expect(lireDate('ABT 1750').texte).toBe('vers 1750')
    expect(lireDate('BEF MAR 1801').texte).toBe('avant mars 1801')
    expect(lireDate('BET 1750 AND 1752').texte).toBe('entre 1750 et 1752')
    expect(lireDate('FROM 1 JAN 1900 TO 1910').texte).toBe('de 1er janvier 1900 à 1910')
    expect(lireDate('EST 12 MAY 1700').debut).toEqual({ annee: 1700, mois: 5, jour: 12 })
  })
  test('calendriers', () => {
    expect(lireDate('@#DJULIAN@ 1 MAR 1600').debut?.annee).toBe(1600)
    // 1er vendémiaire an XII = 24 septembre 1803
    expect(lireDate('@#DFRENCH R@ 1 VEND 12').debut).toEqual({ annee: 1803, mois: 9, jour: 24 })
    // 18 brumaire an VIII = 9 novembre 1799
    expect(lireDate('@#DFRENCH R@ 18 BRUM 8').debut).toEqual({ annee: 1799, mois: 11, jour: 9 })
  })
  test('texte libre', () => {
    const d = lireDate('pendant la guerre')
    expect(d.tri).toBe(0)
    expect(d.texte).toBe('pendant la guerre')
  })
})

describe('lecture', () => {
  test('CONC et CONT recollés', () => {
    const [n] = lireNoeuds('0 @I1@ INDI\r\n1 NOTE Début\r\n2 CONC  suite\r\n2 CONT ligne 2\r\n')
    expect(n.xref).toBe('@I1@')
    expect(n.enfants[0].valeur).toBe('Début suite\nligne 2')
  })
  test('encodages', () => {
    expect(decoder(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A')
    const ansi = new Uint8Array([...strToU8('0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME '), 0xe9])
    expect(decoder(ansi).endsWith('é')).toBe(true)
    const ansel = new Uint8Array([...strToU8('0 HEAD\n1 CHAR ANSEL\n1 NAME '), 0xe2, 0x65])
    expect(decoder(ansel).endsWith('é')).toBe(true)
    // UTF-8 non annoncé mais invalide → Windows-1252
    expect(decoder(new Uint8Array([0x48, 0xe9]))).toBe('Hé')
  })
})

describe('arbre', () => {
  const a = lireArbre(GED)
  test('individus et familles', () => {
    expect(a.individus.size).toBe(6)
    expect(a.familles.size).toBe(2)
    expect(a.origine).toEqual({ logiciel: 'Geneanet', base: 'dupont.gwb', date: undefined })
  })
  test('noms', () => {
    expect(a.individus.get('@I1@')).toMatchObject({ prenom: 'Paul', nom: 'Dupont', sexe: 'M' })
    expect(a.individus.get('@I5@')).toMatchObject({ prenom: 'Anne', nom: '' })
  })
  test('sources en ligne et par renvoi', () => {
    expect(a.individus.get('@I3@')!.evenements[0].sources).toEqual(['Registre paroissial de Malines, folio 12'])
    expect(a.individus.get('@I1@')!.evenements[0].sources).toEqual(['Famille'])
  })
  test('événement déclaré sans détail', () => {
    expect(a.individus.get('@I2@')!.evenements.find((e) => e.tag === 'DEAT')).toMatchObject({ avere: true, sources: [] })
  })
  test('pages wiki GeneWeb ignorées comme sources', () => {
    const b = lireArbre('0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 DATE 1900\n2 SOUR\n3 PAGE geneweb wiki notes: x\n')
    expect(b.individus.get('@I1@')!.evenements[0].sources).toEqual([])
  })
  test('liens familiaux complétés dans les deux sens', () => {
    const b = lireArbre('0 @I1@ INDI\n1 NAME A /B/\n0 @I2@ INDI\n1 NAME C /B/\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@\n')
    expect(b.individus.get('@I1@')!.fams).toEqual(['@F1@'])
    expect(b.individus.get('@I2@')!.famc).toEqual(['@F1@'])
  })
})

describe('noms', () => {
  test('les alias de SURN (Geneanet) sont ignorés, le nom entre barres fait foi', () => {
    const a = lireArbre('0 HEAD\n0 @I1@ INDI\n1 NAME Charles /Miant/\n2 SURN Myant,Mians\n0 @I2@ INDI\n1 NAME Jean\n2 SURN Dupont,Dupond\n0 TRLR\n')
    expect(a.individus.get('@I1@')).toMatchObject({ prenom: 'Charles', nom: 'Miant' })
    expect(a.individus.get('@I2@')).toMatchObject({ prenom: 'Jean', nom: 'Dupont' })
  })
})

describe('zip', () => {
  test('le .ged est extrait, les images ignorées', () => {
    const z = zipSync({ 'arbre.ged': strToU8(GED), 'images-wiki/photo.png': new Uint8Array(1000) })
    expect(estZip(z)).toBe(true)
    const { nom, octets } = gedDuZip(z)
    expect(nom).toBe('arbre.ged')
    expect(decoder(octets)).toBe(GED)
  })
  test('zip sans .ged', () => {
    expect(() => gedDuZip(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/Aucun fichier/)
  })
})

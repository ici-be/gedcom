import { describe, expect, test } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { decoder, lireNoeuds } from '../src/lib/gedcom/lecture'
import { lireDate } from '../src/lib/gedcom/dates'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { estZip, gedDuZip } from '../src/lib/zip'
import { chiffrer, dechiffrer, encoderCle, extraireIdGist, parametreDistant, racineDansAdresse, telecharger, trouverIndividu, urlDansAdresse } from '../src/lib/distant'
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
    expect(lireDate('@#DJULIAN@ 1 MAR 1600').debut).toMatchObject({ annee: 1600, mois: 3, jour: 11 })
    expect(lireDate('@#DJULIAN@ 1 MAR 1600').texte).toBe('11 mars 1600 (1er mars 1600 julien)')
    expect(lireDate('@#DJULIAN@ 25 DEC 1700').debut).toMatchObject({ annee: 1701, mois: 1, jour: 5 })
    expect(lireDate('@#DJULIAN@ 1600').debut).toEqual({ annee: 1600 })
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
  test('photo principale : visage, signature en PNG, renvoi et fichier local ignoré', () => {
    const b = lireArbre([
      '0 @I1@ INDI', '1 NAME A /B/', '1 OBJE', '2 FILE http://gw.geneanet.org/public/img/media/deposits/a8/medium.jpg?t=1',
      '0 @I2@ INDI', '1 NAME C /B/', '1 OBJE', '2 FILE http://gw.geneanet.org/public/img/media/deposits/b9/medium.png?t=2',
      '0 @I3@ INDI', '1 NAME D /B/', '1 OBJE @O1@',
      '0 @I4@ INDI', '1 NAME E /B/', '1 OBJE', '2 FILE C:\\photos\\e.jpg',
      '0 @O1@ OBJE', '1 FILE https://exemple.org/d', '2 FORM PNG', '',
    ].join('\n'))
    expect(b.individus.get('@I1@')!.photo).toEqual({ url: 'https://gw.geneanet.org/public/img/media/deposits/a8/medium.jpg?t=1', signature: false })
    expect(b.individus.get('@I2@')!.photo?.signature).toBe(true)
    expect(b.individus.get('@I3@')!.photo).toEqual({ url: 'https://exemple.org/d', signature: true })
    expect(b.individus.get('@I4@')!.photo).toBeUndefined()
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

describe('distant', () => {
  test('extraction du paramètre ?url= ou ?gist= dans search ou hash', () => {
    expect(urlDansAdresse('?url=https%3A%2F%2Fexemple.org%2Farbre.zip')).toBe('https://exemple.org/arbre.zip')
    expect(urlDansAdresse('', '#/?gist=0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef')
    expect(urlDansAdresse('')).toBeNull()
  })
  test('reconnaissance d’un Gist GitHub (URL ou identifiant)', () => {
    const id = '0123456789abcdef0123456789abcdef'
    expect(extraireIdGist(id)).toBe(id)
    expect(extraireIdGist(`https://gist.github.com/utilisateur/${id}`)).toBe(id)
    expect(extraireIdGist(`https://gist.githubusercontent.com/utilisateur/${id}/raw/arbre.ged`)).toBeNull()
  })
  test('téléchargement depuis un Gist via l’API GitHub', async () => {
    const id = '0123456789abcdef0123456789abcdef'
    const fauxFetch = (async (url: string) => {
      expect(url).toBe(`https://api.github.com/gists/${id}`)
      return new Response(JSON.stringify({
        files: { 'famille.ged': { filename: 'famille.ged', raw_url: 'https://gist.githubusercontent.com/raw/famille.ged', content: GED, truncated: false } },
      }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await telecharger(`https://gist.github.com/u/${id}`, fauxFetch)
    expect(r.nom).toBe('famille.ged')
    expect(decoder(r.octets)).toBe(GED)
  })
  test('téléchargement direct d’une archive .zip par URL', async () => {
    const z = zipSync({ 'arbre.ged': strToU8(GED) })
    const fauxFetch = (async () => new Response(z, { status: 200 })) as unknown as typeof fetch
    const r = await telecharger('https://gist.githubusercontent.com/u/id/raw/export.zip', fauxFetch)
    expect(r.nom).toBe('export.zip')
    expect(gedDuZip(r.octets).nom).toBe('arbre.ged')
  })
  test('chiffrement et déchiffrement AES-GCM avec #cle=', async () => {
    const cle = encoderCle(crypto.getRandomValues(new Uint8Array(32)))
    const cible = parametreDistant('', `#cle=${cle}`)
    expect(cible).toEqual({ url: './arbre.enc', cle })
    const z = zipSync({ 'bveyckemans.ged': strToU8(GED) })
    const enc = await chiffrer(z, cle)
    const fauxFetch = (async () => new Response(enc as BodyInit, { status: 200 })) as unknown as typeof fetch
    const r = await telecharger(cible!, fauxFetch)
    expect(gedDuZip(r.octets).nom).toBe('bveyckemans.ged')
    expect(decoder(gedDuZip(r.octets).octets)).toBe(GED)
    const mauvaiseCle = encoderCle(crypto.getRandomValues(new Uint8Array(32)))
    await expect(dechiffrer(enc, mauvaiseCle)).rejects.toThrow(/incorrecte/)
  })
  test('choix de la personne de départ (Sosa 1) dans l’adresse par nom ou identifiant', () => {
    expect(racineDansAdresse('?sosa=Marie+Lambert')).toBe('Marie Lambert')
    expect(racineDansAdresse('', '#cle=abc&sosa=Jean+Dupont')).toBe('Jean Dupont')
    expect(racineDansAdresse('', '#sosa=@I3@')).toBe('@I3@')
    const a = lireArbre(GED)
    expect(trouverIndividu(a, '@I3@')).toBe('@I3@')
    expect(trouverIndividu(a, 'I3')).toBe('@I3@')
    expect(trouverIndividu(a, '3')).toBe('@I3@')
    expect(trouverIndividu(a, 'Marie Lambert')).toBe('@I3@')
    expect(trouverIndividu(a, 'lambert marie')).toBe('@I3@')
    expect(trouverIndividu(a, 'Jean Dupont')).toBe('@I2@')
  })
})



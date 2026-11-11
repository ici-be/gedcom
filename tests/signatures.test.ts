import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { actesASignatures, bilanSignatures, debutSignatures } from '../src/lib/signatures'
import { fileActes, fileSignatures, identifiantImage, liensDuTexte, siteDuLien } from '../src/lib/actes-en-ligne'

// Jean (I1, départ) né en 1850 ; ses parents Paul (I2) et Anne (I3) mariés en 1848 ; Luc (I4), père de Paul ; Marc (I5), témoin
const GED = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Jean /Dupont/
1 SEX M
1 BIRT
2 DATE 3 MAR 1850
2 PLAC Ath, Hainaut, Belgique
2 SOUR https://www.familysearch.org/ark:/61903/3:1:S3HT-6QV1-X5?i=12
2 ASSO @I5@
3 RELA Witness
1 FAMC @F1@
0 @I2@ INDI
1 NAME Paul /Dupont/
1 SEX M
1 BIRT
2 DATE 1820
2 PLAC Ath, Hainaut, Belgique
2 SOUR Registre, https://agatha.arch.be/fr/data/images/510/510_1385_000_00430_000/0_3548/
1 OBJE
2 FILE https://gw.geneanet.org/photos/paul.png
1 FAMC @F2@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Anne /Lambert/
1 SEX F
1 NOTE Signature: illettrée
1 BIRT
2 DATE 1770
2 PLAC Ath, Hainaut, Belgique
2 SOUR https://agatha.arch.be/data/images/510/510_0001_000_00001_000/0_0001
1 FAMS @F1@
0 @I4@ INDI
1 NAME Luc /Dupont/
1 SEX M
1 DEAT
2 DATE 1860
1 FAMS @F2@
0 @I5@ INDI
1 NAME Marc /Petit/
1 SEX M
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 MARR
2 DATE 4 MAY 1848
2 PLAC Ath, Hainaut, Belgique
2 SOUR https://agatha.arch.be/data/images/510/510_1385_000_00430_000/0_3548
0 @F2@ FAM
1 HUSB @I4@
1 CHIL @I2@
0 TRLR
`

describe('signatures à trouver', () => {
  const arbre = lireArbre(GED)
  const d = calculer(arbre, '@I1@', '')
  const actes = actesASignatures(arbre, d.ancetres)

  test('le mariage : seul le père de l’époux reste à trouver', () => {
    const m = actes.find((a) => a.evenement.tag === 'MARR')!
    expect(m.signataires.map((s) => [s.id, s.role, s.etat])).toEqual([
      ['@I2@', 'époux', 'presente'], ['@I3@', 'épouse', 'illettre'], ['@I4@', 'père de l’époux', 'manque'],
    ])
    expect(m.manquantes).toBe(1)
    expect(m.ancetres).toBe(1)
  })
  test('la naissance : le père a sa signature, le témoin non', () => {
    const n = actes.find((a) => a.evenement.tag === 'BIRT' && a.sujets[0] === '@I1@')!
    expect(n.signataires.map((s) => [s.id, s.role, s.certitude, s.etat])).toEqual([
      ['@I2@', 'père (déclarant)', 'attendue', 'presente'], ['@I5@', 'témoin', 'attendue', 'manque'],
    ])
  })
  test('avant 1779 en Belgique, pas de signatures ; les actes où manque un ancêtre passent devant', () => {
    expect(actes.some((a) => a.sujets[0] === '@I3@')).toBe(false)
    expect(actes.map((a) => [a.evenement.tag, a.ancetres])).toEqual([['BIRT', 1], ['MARR', 1], ['BIRT', 0]])
    expect(debutSignatures('FR')).toBe(1667)
  })
  test('bilan des ancêtres', () => {
    expect(bilanSignatures(arbre, d.ancetres, actes)).toEqual({ avecImages: true, ancetres: 4, presentes: 1, illettres: 1, aTrouver: 2, avecActe: 1 })
  })
})

describe('actes en ligne', () => {
  test('identifiant d’une image', () => {
    expect(identifiantImage('https://www.familysearch.org/ark:/61903/3:1:S3HT-6QV1-X5?i=12&cc=1')).toBe('familysearch:3:1:S3HT-6QV1-X5')
    expect(identifiantImage('https://www.familysearch.org/records/images/image-details?page=1&place=4&rmsId=TH-909-52996-44514-15&imageIndex=80')).toBe('familysearch:TH-909-52996-44514-15')
    expect(identifiantImage('https://agatha.arch.be/fr/data/images/510/510_1385_000_00430_000/0_3548/')).toBe('agatha:510/510_1385_000_00430_000/0_3548')
    expect(identifiantImage('https://www.familysearch.org/ark:/61903/1:1:ABCD-123')).toBeUndefined()
    expect(identifiantImage('https://agatha.arch.be/data/ead/BE-A0510_002071')).toBeUndefined()
    expect(siteDuLien('https://www.archives18.fr/ark:41383/s00')).toBe('autre')
    expect(liensDuTexte('Voir https://a.be/x, puis (https://b.be/y).')).toEqual(['https://a.be/x', 'https://b.be/y'])
  })
  test('la file : par Sosa, chaque image une fois', () => {
    const arbre = lireArbre(GED)
    const f = fileActes(arbre, calculer(arbre, '@I1@', '').ancetres)
    expect(f.map((a) => [a.sosa, a.site, a.fichier])).toEqual([
      ['1', 'familysearch', 'G01/0001 Naissance 1850 DUPONT Jean'],
      ['2', 'agatha', 'G02/0002 Naissance 1820 DUPONT Paul'],
      ['3', 'agatha', 'G02/0003 Naissance 1770 LAMBERT Anne'],
    ])
    expect(fileActes(arbre, calculer(arbre, '@I1@', '').ancetres, { generations: 1 })).toHaveLength(1)
    expect(fileActes(arbre, calculer(arbre, '@I1@', '').ancetres, { sites: ['agatha'] })).toHaveLength(2)
  })
  test('la file des signatures : les actes où un ancêtre reste à trouver, avec ceux qu’on y cherche', () => {
    const arbre = lireArbre(GED)
    const f = fileSignatures(arbre, calculer(arbre, '@I1@', '').ancetres)
    expect(f.map((a) => [a.fichier, a.sosa, a.signataires])).toEqual([
      ['Signatures/Naissance 1820 DUPONT Paul', '4', ['père (déclarant) : DUPONT Luc (Sosa 4)']],
    ])
  })
})

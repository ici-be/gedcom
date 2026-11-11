import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { candidats, faitsCherches, requetesOpenArch, type Doc } from '../src/lib/recherche-auto'
import { variantesPrenom } from '../src/lib/prenoms'

const GED = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Guillaume Pierre /Dupont/
1 SEX M
1 BIRT
2 DATE 3 MAR 1850
2 PLAC Leuven, Brabant flamand, Belgique
1 DEAT
2 DATE 1901
2 SOUR Registre
1 FAMS @F1@
0 @I2@ INDI
1 NAME Anne /Lambert/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 4 MAY 1876
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
0 TRLR
`

describe('recherche automatique des actes', () => {
  const arbre = lireArbre(GED)
  const d = calculer(arbre, '@I1@', '')
  const ind = arbre.individus.get('@I1@')!
  const faits = faitsCherches(d, ind)

  test('les faits datés, avec ceux qui restent à sourcer', () => {
    expect(faits.map((f) => [f.quoi, f.annee, f.aSourcer])).toEqual([['naissance', 1850, true], ['mariage', 1876, true], ['deces', 1901, false]])
    expect(faits[1].conjoint?.id).toBe('@I2@')
  })
  test('une requête par initiale des formes du prénom', () => {
    expect(variantesPrenom('Guillaume')).toContain('wilhelmus')
    expect(requetesOpenArch(ind, faits[0]).map((u) => new URL(u).searchParams.get('name'))).toEqual(['G* Dupont 1850', 'W* Dupont 1850'])
  })
  test('le tri des lignes d’index', () => {
    const docs: Doc[] = [
      { personname: 'Wilhelmus Dupont', relationtype: 'Enfant', eventtype: 'Naissance', eventdate: { day: 3, month: 3, year: 1850 }, eventplace: ['Leuven'], archive_org: 'Rijksarchief België (Leuven)', sourcetype: 'État civil', url: 'u1' },
      { personname: 'Guilielmus Dupont', relationtype: 'Enfant', eventtype: 'Naissance', eventdate: { year: 1851 }, eventplace: ['Gent'], url: 'u2' },
      { personname: 'Wilhelmus Dupont', relationtype: 'Père', eventtype: 'Naissance', eventdate: { year: 1850 }, url: 'u3' }, // le père d'un autre enfant
      { personname: 'Walter Dupont', relationtype: 'Enfant', eventtype: 'Naissance', eventdate: { year: 1850 }, url: 'u4' }, // autre prénom
      { personname: 'Wilhelmus Dupont', relationtype: 'Enfant', eventtype: 'Naissance', eventdate: { year: 1853 }, url: 'u5' }, // trop tard
      { personname: 'Petrus Dupont', relationtype: 'Décédé', eventtype: 'Décès', eventdate: { year: 1850 }, url: 'u6' }, // autre acte
      { personname: 'Wilhelmus Dupont', relationtype: 'Enfant', eventtype: 'Naissance', eventdate: { day: 3, month: 3, year: 1850 }, eventplace: ['Leuven'], url: 'u1' }, // doublon
    ]
    const c = candidats(docs, ind, faits[0])
    expect(c.map((x) => [x.url, x.dateExacte, x.memeLieu])).toEqual([['u1', true, true], ['u2', false, false]])
    expect(c[0].titre).toBe('Naissance 3/3/1850, Leuven : Wilhelmus Dupont')
    // le second prénom suffit, et un marié n'est pas le « père de marié »
    const m = candidats([
      { personname: 'Petrus Dupont', relationtype: 'Marié', eventtype: 'Mariage', eventdate: { year: 1876 }, eventplace: ['Brussel'], url: 'm1' },
      { personname: 'Petrus Dupont', relationtype: 'Père de marié', eventtype: 'Mariage', eventdate: { year: 1876 }, url: 'm2' },
    ], ind, faits[1])
    expect(m.map((x) => x.url)).toEqual(['m1'])
  })
})

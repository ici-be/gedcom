import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { candidats, faitsCherches, requetesOpenArch, type Doc } from '../src/lib/recherche-auto'
import { variantesPrenom } from '../src/lib/prenoms'
import { rafraichir } from '../src/lib/recherche-serie'

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
    expect(faits.map((f) => [f.quoi, f.de, f.a, f.aSourcer, f.estime])).toEqual([['naissance', 1850, 1850, true, false], ['mariage', 1876, 1876, true, false], ['deces', 1901, 1901, false, false]])
    expect(faits[1].conjoint?.id).toBe('@I2@')
  })
  test('une requête par initiale des formes du prénom', () => {
    expect(variantesPrenom('Guillaume')).toContain('wilhelmus')
    expect(requetesOpenArch(ind, faits[0]).map((u) => new URL(u).searchParams.get('name'))).toEqual(['G* Dupont 1850', 'W* Dupont 1850'])
  })
  test('une naissance sans date : l’enfant est « Kind », au baptême comme à la naissance, ou « Dopeling »', () => {
    const filtres = (de: number, a: number) => requetesOpenArch({ ...ind, prenom: 'Pierre' }, { quoi: 'naissance', de, a, aSourcer: true, estime: true })
      .map((u) => u.slice(u.indexOf('&number=10') + 10))
    expect(filtres(1740, 1755)).toEqual(['&relationtype=Kind', '&eventtype=Doop&relationtype=Dopeling'])
    expect(filtres(1840, 1855)).toEqual(['&relationtype=Kind'])
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
      { personname: 'Petrus Dupont', relationtype: 'Marié', eventtype: 'Mariage', eventdate: { year: 1876 }, eventplace: ['Gent'], url: 'm3' }, // ailleurs : le second prénom ne suffit plus
    ], ind, faits[1])
    expect(m.map((x) => [x.url, x.memeLieu])).toEqual([['m1', true]]) // « Brussel » est Bruxelles
  })
  test('des prénoms différents, un autre pays, un doublon', () => {
    const doc = (personname: string, url: string, plus: Partial<Doc> = {}): Doc => ({ personname, relationtype: 'Enfant', eventtype: 'Naissance', eventdate: { year: 1850 }, archive_code: 'abl', url, ...plus })
    const c = candidats([
      doc('Guilielmus Petrus Dupont', 'a'),
      doc('Wilhelmus Josephus Dupont', 'b'), // second prénom différent
      doc('Carolus Wilhelmus Dupont', 'c'), // premier prénom différent
      doc('Wilhelmus Du Pont', 'd', { eventplace: ['Diest'] }),
      doc('Wilhelmus Dupont', 'e', { archive_code: 'zar' }), // archives néerlandaises, pour une naissance à Louvain
      doc('Wilhelmus Dupont', 'f', { archive_code: 'ins', eventdate: { day: 3, month: 3, year: 1850 } }), // ailleurs, mais le même jour
      doc('Wilhelmus Du Pont', 'g', { eventplace: ['Diest'], archive_code: 'aba' }), // le même acte dans une autre archive
    ], ind, faits[0])
    expect(c.map((x) => x.url)).toEqual(['f', 'a', 'd'])
  })
  test('le mariage est cherché avec le nom du conjoint', () => {
    expect(requetesOpenArch(ind, faits[1]).map((u) => new URL(u).searchParams.get('name'))).toEqual(['G* Dupont & Lambert 1876', 'W* Dupont & Lambert 1876'])
  })
  test('« après 1936 » n’est pas l’année 1936', () => {
    const a = lireArbre(GED.replace('2 DATE 1901\n2 SOUR Registre', '2 DATE AFT 1890'))
    const da = calculer(a, '@I1@', '')
    const p = a.individus.get('@I1@')!
    expect(faitsCherches(da, p).map((f) => f.quoi)).toEqual(['naissance', 'mariage'])
    expect(faitsCherches(da, p, true).filter((f) => f.quoi === 'deces').map((f) => [f.de, f.a, f.estime])).toEqual([[1890, 1940, true]])
  })
})

describe('mémoire de la recherche en série', () => {
  test('les naissances sans date d’avant 1796, mal cherchées par la première version, sont oubliées', () => {
    const t = { quand: '2026-11-10', candidats: [], complet: true }
    const m = rafraichir({ faits: { 'jean|dupont||naissance|1740-1755|': t, 'jean|dupont|1850|naissance|1850|': t, 'anne|dupont||naissance|1840-1855|': t, 'jean|dupont||deces|1760-1800|': t }, traites: ['x'] })
    expect(Object.keys(m.faits)).toEqual(['jean|dupont|1850|naissance|1850|', 'anne|dupont||naissance|1840-1855|', 'jean|dupont||deces|1760-1800|'])
    expect(m.traites).toEqual(['x'])
    expect(Object.keys(rafraichir(m).faits).length).toBe(3)
    expect(rafraichir(undefined)).toEqual({ faits: {}, traites: [], version: 3 })
  })
  test('ce qui avait des candidats, les mariages et les noms trop répandus sont cherchés à nouveau avec le tri plus sévère', () => {
    const rien = { quand: '2026-11-10', candidats: [], complet: true }
    const c = { titre: 't', detail: '', url: 'u', dateExacte: false, memeLieu: false }
    const m = rafraichir({ version: 2, traites: [], faits: { 'a|b|1850|deces|1901|': rien, 'a|b|1850|naissance|1850|': { ...rien, candidats: [c] }, 'a|b|1850|mariage|1876|c': rien, 'a|b|1850|deces|1902|': { ...rien, complet: false } } })
    expect(Object.keys(m.faits)).toEqual(['a|b|1850|deces|1901|'])
  })
})

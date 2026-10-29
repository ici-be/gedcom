import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { priorites } from '../src/lib/priorites'

const GED = `0 HEAD
0 @I1@ INDI
1 NAME Paul /Martin/
1 SEX M
1 BIRT
2 DATE 3 MAR 1820
2 PLAC Malines
2 SOUR Registre de Malines
1 FAMC @F1@
0 @I2@ INDI
1 NAME Pierre /Martin/
1 SEX M
1 FAMS @F1@
1 FAMC @F2@
1 DEAT
2 DATE 1860
2 PLAC Malines
0 @I3@ INDI
1 NAME Marie /Dubois/
1 SEX F
1 FAMS @F1@
1 BIRT
2 DATE 1795
2 PLAC Malines
2 SOUR https://www.geneanet.org/registre/marie
0 @I4@ INDI
1 NAME Jean /Martin/
1 SEX M
1 FAMC @F2@
1 BIRT
2 DATE 12 MAY 1792
2 PLAC Malines
2 SOUR https://www.geneanet.org/registre/jean
0 @I5@ INDI
1 NAME Louis /Voisin/
1 SEX M
1 BIRT
2 DATE 1791
2 PLAC Malines
2 SOUR https://www.geneanet.org/registre/voisin
0 @I6@ INDI
1 NAME Henri /Loin/
1 SEX M
1 BIRT
2 DATE 1750
2 PLAC Malines
2 SOUR https://www.geneanet.org/registre/loin
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 MARR
2 DATE 1815
2 PLAC Malines
2 SOUR Registre des mariages
0 @F2@ FAM
1 CHIL @I2@
1 CHIL @I4@
0 TRLR
`

test('priorités : les données manquantes des ancêtres, les plus proches d’abord, avec les pistes de la famille et de la commune', () => {
  const d = calculer(lireArbre(GED), '@I1@', '')
  const l = priorites(d)
  // par défaut, seulement les données manquantes, génération par génération : pas le décès du père, noté sans source
  expect(l.map((p) => `${p.quoi}|${p.id}`)).toEqual(['deces|@I1@', 'naissance|@I2@', 'deces|@I3@'])
  const n = l[1]
  expect(n.sosa).toBe('2')
  expect(n.estimee).toBe(true)
  expect(n.annee).toBe(1790)
  expect(n.commune).toBe('Malines')
  expect(n.pistes.filter((p) => !p.voisine).map((p) => [p.lien, p.id])).toEqual([['son frère', '@I4@']])
  // même commune, même époque : le voisin de 1791, pas celui de 1750
  expect(n.pistes.filter((p) => p.voisine).map((p) => p.id)).toEqual(['@I5@'])
  // avec les faits sans source
  expect(priorites(d, true).map((p) => `${p.quoi}|${p.id}`)).toContain('deces|@I2@')
})

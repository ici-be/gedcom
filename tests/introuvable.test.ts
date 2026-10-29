import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { lireIntrouvable, sansMentionIntrouvable } from '../src/lib/introuvable'
import { communes } from '../src/lib/communes'
import { aChercher, suivi } from '../src/lib/suivi'

describe('mention « Source: introuvable »', () => {
  test('avec ou sans raison', () => {
    expect(lireIntrouvable('Source: introuvable')).toEqual({})
    expect(lireIntrouvable('Source: introuvable (les archives de 1789 à 1820 ont brûlé en 1914)')).toEqual({ cause: 'les archives de 1789 à 1820 ont brûlé en 1914' })
    expect(lireIntrouvable('Curé absent.\nsources : Introuvables (lacune (1740-1752) dans les registres).')).toEqual({ cause: 'lacune (1740-1752) dans les registres' })
    expect(lireIntrouvable('<p>Acte: introuvable, d’après la mairie</p><p>Autre chose</p>')).toEqual({ cause: 'd’après la mairie' })
  })
  test('ce qui n’en est pas', () => {
    expect(lireIntrouvable('Source introuvable')).toBeUndefined()
    expect(lireIntrouvable('Filiation: père introuvable')).toBeUndefined()
  })
  test('ôtée du texte de la note', () => {
    expect(sansMentionIntrouvable('Né en mer. Source: introuvable (registre perdu)').trim()).toBe('Né en mer.')
  })
})

// I1 : naissance notée introuvable (note @N1@), décès sans source ; I2 : baptême sourcé malgré la mention ;
// mariage introuvable sans date ni lieu
const GED = `0 @I1@ INDI
1 NAME Paul /Dupont/
1 BIRT
2 DATE 1790
2 PLAC Ath, Hainaut, Belgique
2 NOTE @N1@
1 DEAT
2 DATE 1850
2 PLAC Ath, Hainaut, Belgique
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marie /Lambert/
1 BAPM
2 DATE 1792
2 PLAC Ath, Hainaut, Belgique
2 SOUR Registre
2 NOTE Source: introuvable
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 NOTE Source: introuvable (lieu inconnu)
0 @N1@ NOTE Archives brûlées.
1 CONT Source: introuvable (les archives de 1789 à 1820 ont brûlé en 1914)
`

describe('source introuvable dans l’arbre', () => {
  const a = lireArbre(GED)
  const s1 = suivi(a, a.individus.get('@I1@')!, 2026)
  const s2 = suivi(a, a.individus.get('@I2@')!, 2026)
  test('état des faits', () => {
    expect(s1.naissance.etat).toBe('introuvable')
    expect(s1.naissance.introuvable).toEqual({ cause: 'les archives de 1789 à 1820 ont brûlé en 1914' })
    expect(s1.deces.etat).toBe('sans-source')
    expect(s1.mariage).toBe('introuvable')
    expect(s2.naissance.etat).toBe('source')
    expect([s1.naissance.etat, s1.mariage].some(aChercher)).toBe(false)
  })
  test('plus à chercher par lieu', () => {
    const [ath] = communes(a, null, false)
    expect([ath.actes.length, ath.sansSource, ath.introuvables, ath.sourcees]).toEqual([3, 1, 1, 1])
  })
})

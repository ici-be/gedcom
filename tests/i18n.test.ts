import { describe, expect, it, afterEach } from 'vitest'
import { definirLangue, t } from '../src/lib/i18n'
import { EN } from '../src/lib/langues/en'
import { NL } from '../src/lib/langues/nl'
import { compteFreres } from '../src/ui/arbres/Pyramide'
import type { Individu } from '../src/lib/gedcom/arbre'

const jetons = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\??/g)].map((m) => m[1]))]

afterEach(() => definirLangue('fr'))

describe('i18n', () => {
  it('le français est la langue par défaut et la clé elle-même', () => {
    expect(t('Imprimer')).toBe('Imprimer')
    expect(t('{n} frère{n?|s}', { n: 1 })).toBe('1 frère')
    expect(t('{n} frère{n?|s}', { n: 3 })).toBe('3 frères')
  })

  it('met une espace fine insécable avant les deux-points en français seulement', () => {
    expect(t('Personne de départ :')).toBe('Personne de départ :')
    definirLangue('en')
    expect(t('Personne de départ :')).toBe('Starting person:')
  })

  it('traduit en anglais et en néerlandais, avec les pluriels de chaque langue', () => {
    definirLangue('en')
    expect(t('Imprimer')).toBe('Print')
    expect(t('{n} frère{n?|s}', { n: 1 })).toBe('1 brother')
    expect(t('{n} frère{n?|s}', { n: 0 })).toBe('0 brothers')
    definirLangue('nl')
    expect(t('Imprimer')).toBe('Afdrukken')
    expect(t('{n} sœur{n?|s}', { n: 2 })).toBe('2 zussen')
  })

  it('retombe sur le français quand un texte n’est pas traduit', () => {
    definirLangue('en')
    expect(t('Un texte sans traduction')).toBe('Un texte sans traduction')
  })

  it('n’emploie dans chaque traduction que des jetons {…} de la clé', () => {
    for (const [nom, dico] of [['EN', EN], ['NL', NL]] as const) {
      for (const [cle, valeur] of Object.entries(dico)) {
        for (const j of jetons(valeur)) expect(jetons(cle), `${nom} : ${cle}`).toContain(j)
      }
    }
  })

  it('traduit le décompte des frères et sœurs', () => {
    const f = (sexe: 'M' | 'F') => ({ sexe }) as Individu
    definirLangue('en')
    expect(compteFreres([f('M'), f('M')])).toBe('2 brothers')
    expect(compteFreres([f('F')])).toBe('1 sister')
    expect(compteFreres([f('F'), f('M')])).toBe('2 siblings')
  })
})

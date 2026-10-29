import { describe, expect, it } from 'vitest'
import { lectures, nomRecherche } from '../src/lib/lectures'

const titres = (r: ReturnType<typeof lectures>) => r.flatMap((x) => x.lectures.map((l) => l.titre))

describe('lectures', () => {
  it('nettoie le nom de la commune', () => {
    expect(nomRecherche('Saint-Ghislain (Hainaut)')).toBe('Saint-Ghislain')
  })
  it('propose les catalogues belges et Tarlier et Wauters pour le Brabant', () => {
    const t = titres(lectures('Ixelles', 'BE', 'BE.BRU'))
    expect(t).toContain('Unicat')
    expect(t.some((x) => x.startsWith('Tarlier'))).toBe(true)
    expect(t).not.toContain('Delpher')
  })
  it('passe au néerlandais en Flandre, sans Tarlier et Wauters hors Brabant', () => {
    const r = lectures('Lier', 'BE', 'BE.VAN')
    const t = titres(r)
    expect(t).toContain('Delpher')
    expect(t).toContain('Wikipédia (nl)')
    expect(t.some((x) => x.startsWith('Tarlier'))).toBe(false)
  })
  it('France : SUDOC, pas de catalogue belge', () => {
    const t = titres(lectures('Lille', 'FR', 'FR.59'))
    expect(t).toContain('SUDOC')
    expect(t).not.toContain('Unicat')
  })
  it('cherche le nom exact', () => {
    const g = lectures('Cuesmes', 'BE', 'BE.WHT')[1].lectures.find((l) => l.titre === 'Google Livres')!
    expect(decodeURIComponent(g.url)).toContain('"Cuesmes"')
  })
})

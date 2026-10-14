import { expect, test } from 'vitest'
import { cadrer, colonnes, grouper, projeter, proportions, type Contours } from '../src/lib/carte-origines'

// Deux carrés d'un degré : un en Belgique, un en France
const contours: Contours = { r: { 'BE.WHT': [[300, 5000, 400, 5000, 400, 5100, 300, 5100]], 'FR.18': [[200, 4600, 300, 4600, 300, 4700, 200, 4700]] } }

test('cadrage sur les régions des ancêtres, avec marge', () => {
  expect(cadrer(contours, ['BE.WHT'])).toEqual([2.75, 49.75, 4.25, 51.25])
  expect(cadrer(contours, ['BE.WHT', 'FR.18'], 0)).toEqual([2, 46, 4, 51])
  expect(cadrer(contours, ['NL.06'])).toBeUndefined()
  expect(proportions([2, 46, 4, 51])).toBeCloseTo((2 * Math.cos((48.5 * Math.PI) / 180)) / 5)
})

test('projection : seules les régions visibles, dans le rectangle', () => {
  const r = projeter(contours, [2.9, 49.9, 4.1, 51.1], { x: 0, y: 0, w: 100, h: 100 })
  expect(r.map((x) => x.code)).toEqual(['BE.WHT'])
  expect(r[0].d).toMatch(/^M[\d.]+,[\d.]+L.*Z$/)
})

test('légende groupée par pays', () => {
  const nomPays = (c: string) => ({ BE: 'Belgique', FR: 'France', IT: 'Italie' } as Record<string, string>)[c]
  const g = grouper([
    { nom: 'Hainaut', pays: 'BE', couleur: '#a', n: 10 },
    { nom: 'Namur', pays: 'BE', couleur: 'gris', n: 1 },
    { pays: 'BE', couleur: 'gris', n: 3 },
    { nom: 'Liège', pays: 'BE', couleur: 'gris', n: 2 },
    { nom: 'Cher', pays: 'FR', couleur: '#b', n: 4 },
    { nom: 'Lombardia', pays: 'IT', couleur: 'gris', n: 1 },
  ], nomPays, 'gris')
  expect(g.map((x) => x.titre)).toEqual(['Belgique', 'France', 'Autres pays'])
  expect(g[0].lignes).toEqual([{ nom: 'Hainaut', couleur: '#a', n: 10 }, { nom: 'Liège, Namur, sans précision', couleur: 'gris', n: 6 }])
  expect(g[2].lignes[0].nom).toBe('Lombardia, Italie')
  const [gauche, droite] = colonnes(g)
  expect(gauche.map((x) => x.titre)).toEqual(['Belgique'])
  expect(droite.map((x) => x.titre)).toEqual(['France', 'Autres pays'])
})

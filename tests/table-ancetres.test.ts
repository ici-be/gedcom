import { expect, test } from 'vitest'
import { choisirColonnes, disposer } from '../src/ui/arbres/TableAncetres'

const entree = { h: 20, titre: false }
const titre = { h: 15, titre: true }

test('table des ancêtres : remplit les colonnes dans l’ordre', () => {
  const p = disposer([titre, entree, entree, entree], 60, 2)!
  expect(p.map((x) => x.col)).toEqual([0, 0, 0, 1])
  expect(p[3].y).toBe(0)
})

test('table des ancêtres : ne laisse pas un titre seul en bas de colonne', () => {
  const p = disposer([entree, entree, titre, entree], 60, 2)!
  expect(p[2]).toEqual({ col: 1, y: 0 })
  expect(p[3]).toEqual({ col: 1, y: 15 })
})

test('table des ancêtres : refuse quand les colonnes ne suffisent pas', () => {
  expect(disposer(Array(10).fill(entree), 60, 3)).toBeUndefined()
})

test('table des ancêtres : prend le moins de colonnes possible, puis réduit le corps', () => {
  const peu = choisirColonnes(() => Array(30).fill(entree), 200)
  expect(peu).toMatchObject({ C: 4, k: 1 })
  const trop = choisirColonnes((k) => Array(200).fill({ h: 20 * k, titre: false }), 200)
  expect(trop.C).toBe(8)
  expect(trop.k).toBeLessThan(1)
  expect(Math.max(...trop.positions.map((x) => x.col))).toBeLessThan(8)
})

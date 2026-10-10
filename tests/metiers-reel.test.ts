import { readFileSync } from 'node:fs'
import { test } from 'vitest'
import { decoder } from '../src/lib/gedcom/lecture'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { indexerMetiers } from '../src/lib/metiers'
test.skipIf(!process.env.GED)('métiers réels', () => {
  const a = lireArbre(decoder(readFileSync(process.env.GED!)))
  const t = performance.now()
  const ix = indexerMetiers(a)
  console.log('index', Math.round(performance.now() - t), 'ms', ix.metiers.size, 'métiers')
  const l = [...ix.metiers.values()].sort((x, y) => y.personnes.size - x.personnes.size)
  console.log(l.slice(0, 30).map((m) => `${m.personnes.size} ${m.titre} ← ${m.variantes.map((v) => v.libelle + ':' + v.personnes).join(' | ')}`).join('\n'))
  console.log('--- fusions')
  console.log(l.filter((m) => m.variantes.length > 1).slice(30, 140).map((m) => `${m.titre} ← ${m.variantes.map((v) => v.libelle).join(' | ')}`).join('\n'))
})

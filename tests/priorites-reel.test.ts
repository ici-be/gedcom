// Priorités sur un vrai fichier, pour relire : GED=/chemin/fichier.ged npx vitest run tests/priorites-reel.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { test } from 'vitest'
import { decoder } from '../src/lib/gedcom/lecture'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { priorites } from '../src/lib/priorites'

test.skipIf(!process.env.GED)('priorités d’un fichier réel', () => {
  const d = calculer(lireArbre(decoder(readFileSync(process.env.GED!))), '@I1@', '')
  const l = priorites(d, !!process.env.SANS_SOURCE)
  const nom = (id: string) => { const i = d.arbre.individus.get(id); return i ? `${i.prenom} ${i.nom}` : id }
  const texte = l.slice(0, Number(process.env.N ?? 40)).map((p) => [
    `[G${p.generation} · ${p.sosa}] ${p.quoi} ${p.etat} · ${nom(p.id)}${p.conjoint ? ' & ' + nom(p.conjoint) : ''} · ${p.annee ?? '?'}${p.estimee ? '~' : ''} ${p.commune ?? ''}`,
    ...p.pistes.map((x) => `    ${x.voisine ? '≈' : '•'} ${x.lien} ${nom(x.id)} ${x.evenement.tag} ${x.evenement.date?.texte ?? ''} ${x.evenement.lieu?.split(',')[0] ?? ''} — ${x.source.slice(0, 90)}`),
  ].join('\n')).join('\n')
  const resume = `${l.length} faits, ${l.filter((p) => p.pistes.length).length} avec piste`
  if (process.env.SORTIE) writeFileSync(process.env.SORTIE, resume + '\n\n' + texte)
  else console.log(resume)
})

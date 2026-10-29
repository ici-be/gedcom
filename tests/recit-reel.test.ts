// Récits sur un vrai fichier, pour relire le style : GED=/chemin/fichier.ged [IDS=@I1@,@I5@] npx vitest run tests/recit-reel.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { test } from 'vitest'
import { decoder } from '../src/lib/gedcom/lecture'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { recit, texteBrut } from '../src/lib/recit'

test.skipIf(!process.env.GED)('récits d’un fichier réel', () => {
  const arbre = lireArbre(decoder(readFileSync(process.env.GED!)))
  const d = calculer(arbre, '@I1@', '')
  const ids = process.env.IDS?.split(',') ?? ['@I1@']
  const texte = ids.map((id) => texteBrut(recit(d, id, Number(process.env.ASC ?? 3), Number(process.env.DESC ?? 2))!)).join('\n\n\n════════\n\n\n')
  if (process.env.SORTIE) writeFileSync(process.env.SORTIE, texte)
  else console.log(texte)
})

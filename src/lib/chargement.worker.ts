// Lecture du fichier en arrière-plan : la page reste réactive pendant le décompactage et l'analyse.

import { decoder } from './gedcom/lecture'
import { lireArbre } from './gedcom/arbre'
import { estZip, gedDuZip } from './zip'

export type Demande = { nom: string; octets: Uint8Array }

self.onmessage = (ev: MessageEvent<Demande>) => {
  try {
    let { nom, octets } = ev.data
    if (estZip(octets)) ({ nom, octets } = gedDuZip(octets))
    const arbre = lireArbre(decoder(octets))
    if (!arbre.individus.size) throw new Error('Ce fichier ne contient aucun individu : est-ce bien un fichier GEDCOM ?')
    self.postMessage({ ok: true, nom, octets, arbre })
  } catch (e) {
    self.postMessage({ ok: false, erreur: e instanceof Error ? e.message : String(e) })
  }
}

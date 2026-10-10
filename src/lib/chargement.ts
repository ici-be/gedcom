import type { Arbre } from './gedcom/arbre'
import Lecteur from './chargement.worker?worker'

export interface Charge { nom: string; octets: Uint8Array; arbre: Arbre }

/** Lit un .ged ou un .zip dans un worker ; renvoie l'arbre et les octets du seul .ged */
export function charger(nom: string, octets: Uint8Array): Promise<Charge> {
  return new Promise((resoudre, rejeter) => {
    const w = new Lecteur()
    w.onmessage = (ev) => {
      w.terminate()
      if (ev.data.ok) resoudre(ev.data)
      else rejeter(new Error(ev.data.erreur))
    }
    w.onerror = (ev) => {
      w.terminate()
      rejeter(new Error(ev.message || 'Lecture impossible'))
    }
    w.postMessage({ nom, octets })
  })
}

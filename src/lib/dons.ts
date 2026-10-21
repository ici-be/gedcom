// Les associations proposées sur la page /print/, et le compteur de dons déclarés (une feuille Google, voir scripts/dons-apps-script.gs).
// Pour changer d'association ou de seuil : modifier ce fichier seulement (et les traductions des textes, dans src/lib/langues).

import { T } from './i18n'

export interface Association {
  /** nom court, aussi enregistré dans la feuille */
  nom: string
  resume: string
  site: string
  don: string
  donorinfo: string
}

export const ASSOCIATIONS: Association[] = [
  {
    nom: 'DoucheFLUX',
    resume: T('Centre de jour bruxellois pour personnes sans chez-soi : douche, lessive, soins et accompagnement.'),
    site: 'https://doucheflux.be/',
    don: 'https://doucheflux.be/faites-un-don/dons/',
    donorinfo: 'https://www.donorinfo.be/fr/faire-un-don/doucheflux-asbl',
  },
  {
    nom: 'APEDAF',
    resume: T('Parents d’enfants déficients auditifs francophones : accompagnement des jeunes sourds et malentendants et de leurs proches.'),
    site: 'https://apedaf.be',
    don: 'https://apedaf.be/wordpress/faire-un-don/',
    donorinfo: 'https://www.donorinfo.be/fr/faire-un-don/apedaf-association-des-parents-denfants-deficients-auditifs-francophones',
  },
]

/** Phrase sur l'attestation fiscale ; '' pour ne rien dire */
export const MENTION_FISCALE = '' /** Une attestation fiscale est délivrée à partir de 40 € de dons par an. */

/** Adresse de l'application web Google Apps Script (« Déployer → Application web »). Vide : pas de compteur, seulement les liens. */
export const URL_COMPTEUR = 'https://script.google.com/macros/s/AKfycbyHZ8zybk-rgOXTozU2tx1Qq6ww7AFuPbUECHMFpwLwqmb9btGhX_DIViivxP55XGVJ/exec'

export interface TotalDons { dons: number; total: number }

export async function lireTotal(): Promise<TotalDons | null> {
  if (!URL_COMPTEUR) return null
  try {
    const r = await fetch(URL_COMPTEUR)
    const j = await r.json()
    return typeof j.dons === 'number' && typeof j.total === 'number' ? { dons: j.dons, total: j.total } : null
  } catch {
    return null
  }
}

/** Envoie un don déclaré : le montant et l'association, rien d'autre. La réponse n'est pas lisible (no-cors), on se fie à l'envoi. */
export async function declarerDon(association: string, montant: number): Promise<boolean> {
  if (!URL_COMPTEUR) return false
  try {
    await fetch(URL_COMPTEUR, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ association, montant }) })
    return true
  } catch {
    return false
  }
}

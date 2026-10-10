// Liens vers la fiche d'une personne sur Geneanet ou tout autre site GeneWeb.

import type { Individu } from './gedcom/arbre'

/** Nettoie l'adresse saisie : « https://gw.geneanet.org/xxx?lang=fr » → « https://gw.geneanet.org/xxx » */
export function normaliserAdresse(adresse: string): string {
  let a = adresse.trim()
  if (!a) return ''
  if (!/^https?:\/\//i.test(a)) a = 'https://' + a
  try {
    const u = new URL(a)
    // on garde seulement le paramètre « b= » (bases GeneWeb hébergées sans nom dans le chemin)
    const b = u.searchParams.get('b')
    u.search = b ? '?b=' + encodeURIComponent(b) : ''
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function cle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '+')
}

/**
 * Fiche GeneWeb par prénom et nom (p= et n=). En cas d'homonymes, le numéro d'occurrence
 * de GeneWeb n'est pas dans le GEDCOM : on renvoie vers la recherche, qui liste les homonymes.
 */
export function lienGeneWeb(adresse: string, ind: Individu, homonyme: boolean): string | undefined {
  if (!adresse || (!ind.prenom && !ind.nom)) return undefined
  const sep = adresse.includes('?') ? '&' : '?'
  const p = encodeURIComponent(cle(ind.prenom || '?')).replace(/%2B/g, '+')
  const n = encodeURIComponent(cle(ind.nom || '?')).replace(/%2B/g, '+')
  return `${adresse}${sep}lang=fr${homonyme ? '&m=S' : ''}&p=${p}&n=${n}`
}

/** Base Geneanet devinée d'après l'en-tête du fichier (« 2 DATA bveyckemans.gwb ») */
export function adresseDevinee(origine: { logiciel?: string; base?: string }): string {
  if (!/geneanet/i.test(origine.logiciel ?? '') || !origine.base) return ''
  const base = origine.base.replace(/\.gwb$/i, '')
  return /^[\w-]+$/.test(base) ? `https://gw.geneanet.org/${base}` : ''
}

// Téléchargement et déchiffrement (AES-GCM) d'un fichier .ged ou .zip distant (?cle=, ?url= ou ?gist=),
// ainsi que le choix de la personne de départ (?sosa= ou ?racine=).

import type { Arbre } from './gedcom/arbre'

export interface CibleDistante {
  url: string
  cle?: string
}

export function encoderCle(octets: Uint8Array): string {
  let bin = ''
  for (const b of octets) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decoderCle(texte: string): Uint8Array {
  const b64 = texte.trim().replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  try {
    const bin = atob(pad)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    if (out.length !== 16 && out.length !== 32) throw new Error('Taille de clé invalide')
    return out
  } catch {
    throw new Error('Clé de déchiffrement invalide.')
  }
}

export async function chiffrer(octets: Uint8Array, cleTexte: string): Promise<Uint8Array> {
  const brut = decoderCle(cleTexte)
  const cle = await crypto.subtle.importKey('raw', brut as BufferSource, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, octets as BufferSource))
  const resultat = new Uint8Array(iv.length + chiffre.length)
  resultat.set(iv, 0)
  resultat.set(chiffre, iv.length)
  return resultat
}

export async function dechiffrer(octets: Uint8Array, cleTexte: string): Promise<Uint8Array> {
  if (octets.length < 28) throw new Error('Fichier chiffré tronqué ou invalide.')
  const brut = decoderCle(cleTexte)
  const cle = await crypto.subtle.importKey('raw', brut as BufferSource, 'AES-GCM', false, ['decrypt'])
  const iv = octets.slice(0, 12)
  const corps = octets.slice(12)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cle, corps as BufferSource))
  } catch {
    throw new Error('Clé de déchiffrement incorrecte.')
  }
}

function extraireSourcesParams(search: string, hash = ''): URLSearchParams[] {
  const sources: string[] = []
  if (search) sources.push(search)
  if (hash.includes('?')) sources.push(hash.slice(hash.indexOf('?')))
  else if (/^#\/?(?:cle|url|gist|sosa|racine)=/.test(hash)) sources.push('?' + hash.replace(/^#\/?/, ''))
  return sources.map((s) => new URLSearchParams(s))
}

export function parametreDistant(search: string, hash = ''): CibleDistante | null {
  for (const params of extraireSourcesParams(search, hash)) {
    const cle = params.get('cle')?.trim() || undefined
    const url = params.get('url')?.trim() || params.get('gist')?.trim()
    if (url) return { url, cle }
    if (cle) return { url: './arbre.enc', cle }
  }
  return null
}

/** Personne de départ (Sosa 1) demandée dans l'URL via ?sosa= ou ?racine= (ou dans #cle=...&sosa=...) */
export function racineDansAdresse(search: string, hash = ''): string | null {
  for (const params of extraireSourcesParams(search, hash)) {
    const s = params.get('sosa')?.trim() || params.get('racine')?.trim()
    if (s) return s
  }
  return null
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Trouve un individu dans l'arbre par identifiant GEDCOM (@I1@, I1, 1) ou par nom/prénom (et année éventuelle) */
export function trouverIndividu(arbre: Arbre, requete: string): string | null {
  const q = requete.trim()
  if (!q) return null
  if (arbre.individus.has(q)) return q
  const maj = q.toUpperCase()
  if (arbre.individus.has(`@${maj}@`)) return `@${maj}@`
  if (/^\d+$/.test(q) && arbre.individus.has(`@I${q}@`)) return `@I${q}@`

  const jetons = norm(q).split(/[\s,+_;-]+/).filter(Boolean)
  if (!jetons.length) return null
  const annees = jetons.filter((j) => /^\d{4}$/.test(j)).map(Number)
  const mots = jetons.filter((j) => !/^\d{4}$/.test(j))
  if (!mots.length) return null

  let meilleur: { id: string; score: number } | null = null
  for (const ind of arbre.individus.values()) {
    const p = norm(ind.prenom).trim()
    const n = norm(ind.nom).trim()
    const complet = `${p} ${n}`.trim()
    const motsIndividu = complet.split(/[\s'-]+/).filter(Boolean)

    if (!mots.every((m) => complet.includes(m))) continue
    if (annees.length > 0) {
      const evAnnees = ind.evenements.map((e) => e.date?.debut?.annee).filter((a): a is number => a !== undefined)
      if (!annees.every((a) => evAnnees.includes(a))) continue
    }

    let score = 0
    if (mots.every((m) => motsIndividu.includes(m))) score += 10
    const motsNom = n.split(/[\s'-]+/).filter(Boolean)
    if (motsNom.length > 0 && motsNom.every((mn) => mots.includes(mn))) score += 5
    const premierPrenom = p.split(/[\s'-]+/)[0]
    if (premierPrenom && mots.includes(premierPrenom)) score += 5
    if (motsIndividu.length === mots.length && score >= 10) score += 3

    if (!meilleur || score > meilleur.score) {
      meilleur = { id: ind.id, score }
    }
  }
  return meilleur?.id ?? null
}

export function urlDansAdresse(search: string, hash = ''): string | null {
  return parametreDistant(search, hash)?.url ?? null
}

export function extraireIdGist(cible: string): string | null {
  const s = cible.trim()
  if (/^[0-9a-f]{20,}$/i.test(s)) return s
  try {
    const u = new URL(s)
    if (u.hostname !== 'gist.github.com') return null
    const morceaux = u.pathname.split('/').filter(Boolean)
    const candidat = morceaux.find((m) => /^[0-9a-f]{20,}$/i.test(m))
    return candidat ?? null
  } catch {
    return null
  }
}

function nomDepuisUrl(u: URL, disposition?: string | null): string {
  const m = disposition?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)
  if (m?.[1]) {
    try { return decodeURIComponent(m[1].trim()) } catch { return m[1].trim() }
  }
  const dernier = u.pathname.split('/').filter(Boolean).pop()
  if (dernier) {
    try { return decodeURIComponent(dernier) } catch { return dernier }
  }
  return 'arbre.ged'
}

export async function telecharger(
  cible: string | CibleDistante,
  fetchFn: typeof fetch = fetch,
): Promise<{ nom: string; octets: Uint8Array }> {
  const { url: brutUrl, cle } = typeof cible === 'string' ? { url: cible, cle: undefined } : cible
  const idGist = extraireIdGist(brutUrl)
  if (idGist) {
    const rep = await fetchFn(`https://api.github.com/gists/${idGist}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!rep.ok) throw new Error(`Impossible d'ouvrir ce Gist (${rep.status}).`)
    const gist = await rep.json() as {
      files?: Record<string, { filename?: string; raw_url?: string; content?: string; truncated?: boolean }>
    }
    const fichiers = Object.values(gist.files ?? {})
    const choisi = fichiers.find((f) => /\.(ged|zip|enc)$/i.test(f.filename ?? '')) ?? fichiers[0]
    if (!choisi?.raw_url) throw new Error('Ce Gist ne contient aucun fichier.')
    const nom = choisi.filename || 'arbre.ged'
    if (!choisi.truncated && typeof choisi.content === 'string' && !/\.(zip|enc)$/i.test(nom) && !cle) {
      return { nom, octets: new TextEncoder().encode(choisi.content) }
    }
    const brut = await fetchFn(choisi.raw_url)
    if (!brut.ok) throw new Error(`Téléchargement du Gist impossible (${brut.status}).`)
    const octets = new Uint8Array(await brut.arrayBuffer())
    return { nom, octets: cle ? await dechiffrer(octets, cle) : octets }
  }

  let u: URL
  try {
    u = new URL(brutUrl, typeof location !== 'undefined' ? location.href : 'https://ici.be/gedcom/')
  } catch {
    throw new Error('Adresse du fichier invalide.')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('Seules les adresses http(s) sont prises en charge.')
  }
  let rep: Response
  try {
    rep = await fetchFn(u.href)
  } catch {
    throw new Error('Téléchargement bloqué par le serveur distant (CORS) ou réseau indisponible.')
  }
  if (!rep.ok) throw new Error(`Téléchargement impossible (${rep.status}).`)
  const nom = nomDepuisUrl(u, rep.headers.get('content-disposition'))
  const octets = new Uint8Array(await rep.arrayBuffer())
  return { nom, octets: cle ? await dechiffrer(octets, cle) : octets }
}

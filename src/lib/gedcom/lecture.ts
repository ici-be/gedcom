// Lecture brute d'un fichier GEDCOM : décodage du texte puis arbre des lignes.

export interface Noeud {
  tag: string
  valeur: string
  xref?: string
  enfants: Noeud[]
}

/** Décode les octets d'un fichier GEDCOM selon son BOM ou sa ligne « 1 CHAR ». */
export function decoder(octets: Uint8Array): string {
  if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) return new TextDecoder('utf-8').decode(octets.subarray(3))
  if (octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder('utf-16le').decode(octets.subarray(2))
  if (octets[0] === 0xfe && octets[1] === 0xff) return new TextDecoder('utf-16be').decode(octets.subarray(2))

  const debut = new TextDecoder('latin1').decode(octets.subarray(0, 4000))
  const jeu = (/^\s*1\s+CHAR\s+(\S+)/m.exec(debut)?.[1] ?? '').toUpperCase()
  if (jeu === 'ANSEL') return decoderAnsel(octets)
  if (jeu === 'ANSI' || jeu === 'IBMPC' || jeu.startsWith('WINDOWS') || jeu.startsWith('CP') || jeu.startsWith('ISO')) {
    return new TextDecoder('windows-1252').decode(octets)
  }
  // UTF-8 annoncé ou rien : on essaie l'UTF-8 strict, sinon Windows-1252
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    return new TextDecoder('windows-1252').decode(octets)
  }
}

// ANSEL (ancien jeu de caractères des GEDCOM) : les accents précèdent la lettre.
const ANSEL_SIMPLES: Record<number, string> = {
  0xa1: 'Ł', 0xa2: 'Ø', 0xa3: 'Đ', 0xa4: 'Þ', 0xa5: 'Æ', 0xa6: 'Œ', 0xa7: 'ʹ', 0xa8: '·', 0xa9: '♭', 0xaa: '®',
  0xab: '±', 0xac: 'Ơ', 0xad: 'Ư', 0xae: 'ʼ', 0xb0: 'ʻ', 0xb1: 'ł', 0xb2: 'ø', 0xb3: 'đ', 0xb4: 'þ', 0xb5: 'æ',
  0xb6: 'œ', 0xb7: 'ʺ', 0xb8: 'ı', 0xb9: '£', 0xba: 'ð', 0xbc: 'ơ', 0xbd: 'ư', 0xc0: '°', 0xc1: 'ℓ', 0xc2: '℗',
  0xc3: '©', 0xc4: '♯', 0xc5: '¿', 0xc6: '¡', 0xc7: 'ß', 0xc8: '€',
}
const ANSEL_ACCENTS: Record<number, string> = {
  0xe0: '̉', 0xe1: '̀', 0xe2: '́', 0xe3: '̂', 0xe4: '̃', 0xe5: '̄', 0xe6: '̆',
  0xe7: '̇', 0xe8: '̈', 0xe9: '̌', 0xea: '̊', 0xeb: '︠', 0xec: '︡', 0xed: '̕',
  0xee: '̋', 0xef: '̐', 0xf0: '̧', 0xf1: '̨', 0xf2: '̣', 0xf3: '̤', 0xf4: '̥',
  0xf5: '̳', 0xf6: '̲', 0xf7: '̦', 0xf8: '̜', 0xf9: '̮', 0xfa: '︢', 0xfb: '︣',
  0xfe: '̓',
}

function decoderAnsel(octets: Uint8Array): string {
  let sortie = ''
  let accents = ''
  for (const o of octets) {
    if (ANSEL_ACCENTS[o]) { accents += ANSEL_ACCENTS[o]; continue }
    const c = o < 0x80 ? String.fromCharCode(o) : (ANSEL_SIMPLES[o] ?? '�')
    sortie += c + accents
    accents = ''
  }
  return sortie.normalize('NFC')
}

/** Construit la liste des enregistrements de niveau 0, avec CONC et CONT recollés à leur parent. */
export function lireNoeuds(texte: string): Noeud[] {
  if (!texte.includes('\n')) texte = texte.replace(/\r/g, '\n') // anciens fichiers Mac
  const racines: Noeud[] = []
  const pile: Noeud[] = []
  const longueur = texte.length
  let debut = 0
  while (debut < longueur) {
    // découpage à la main : bien plus rapide qu'une expression régulière par ligne
    let fin = texte.indexOf('\n', debut)
    if (fin < 0) fin = longueur
    let i = debut
    const j = fin > debut && texte.charCodeAt(fin - 1) === 13 ? fin - 1 : fin
    debut = fin + 1
    while (i < j && texte.charCodeAt(i) <= 32) i++
    let k = i
    while (k < j && texte.charCodeAt(k) >= 48 && texte.charCodeAt(k) <= 57) k++
    if (k === i || k >= j || texte.charCodeAt(k) !== 32) continue
    const niveau = Number(texte.slice(i, k))
    while (k < j && texte.charCodeAt(k) === 32) k++
    let xref: string | undefined
    if (texte.charCodeAt(k) === 64) { // @
      const e = texte.indexOf(' ', k)
      if (e < 0 || e > j) continue
      xref = texte.slice(k, e)
      k = e
      while (k < j && texte.charCodeAt(k) === 32) k++
    }
    let e = texte.indexOf(' ', k)
    if (e < 0 || e > j) e = j
    const tag = texte.slice(k, e).toUpperCase()
    if (!tag) continue
    const valeur = e < j ? texte.slice(e + 1, j) : ''
    if ((tag === 'CONC' || tag === 'CONT') && niveau > 0 && pile[niveau - 1]) {
      pile[niveau - 1].valeur += (tag === 'CONT' ? '\n' : '') + valeur
      continue
    }
    const noeud: Noeud = { tag, valeur, enfants: [] }
    if (xref) noeud.xref = xref
    if (niveau === 0) racines.push(noeud)
    else if (pile[niveau - 1]) pile[niveau - 1].enfants.push(noeud)
    else continue // niveau incohérent : ligne ignorée
    pile[niveau] = noeud
    pile.length = niveau + 1
  }
  return racines
}

export function enfant(n: Noeud, tag: string): Noeud | undefined {
  return n.enfants.find((e) => e.tag === tag)
}

export function valeur(n: Noeud, tag: string): string {
  return enfant(n, tag)?.valeur.trim() ?? ''
}

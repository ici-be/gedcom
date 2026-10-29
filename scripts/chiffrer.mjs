// Compresse le seul fichier .ged d'un export Geneanet (.zip ou .ged) et le chiffre en AES-256-GCM dans public/arbre.enc.
// Usage : npm run chiffrer [chemin/vers/export.zip]

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { unzipSync, zipSync } from 'fflate'

const FICHIER_CLE = resolve('.cle-partage')
const SORTIE = resolve('public/arbre.enc')

function encoderCle(octets) {
  return Buffer.from(octets).toString('base64url')
}

function decoderCle(texte) {
  const b = Buffer.from(texte.trim(), 'base64url')
  if (b.length !== 16 && b.length !== 32) throw new Error('Clé invalide dans .cle-partage')
  return new Uint8Array(b)
}

function obtenirCle(forcerNouvelle = false) {
  if (!forcerNouvelle && existsSync(FICHIER_CLE)) {
    return readFileSync(FICHIER_CLE, 'utf8').trim()
  }
  const octets = crypto.getRandomValues(new Uint8Array(32))
  const cle = encoderCle(octets)
  writeFileSync(FICHIER_CLE, cle + '\n', { mode: 0o600 })
  return cle
}

function trouverDernierExport() {
  for (const dossier of [join(homedir(), 'Téléchargements'), join(homedir(), 'Downloads')]) {
    if (!existsSync(dossier)) continue
    const candidats = readdirSync(dossier)
      .filter((f) => /\.(zip|ged)$/i.test(f))
      .map((f) => {
        const chemin = join(dossier, f)
        return { chemin, mtime: statSync(chemin).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)
    for (const c of candidats) {
      if (/\.ged$/i.test(c.chemin)) return c.chemin
      try {
        const octets = new Uint8Array(readFileSync(c.chemin))
        const ged = unzipSync(octets, { filter: (f) => /\.ged$/i.test(f.name) && !f.name.startsWith('__MACOSX') })
        if (Object.keys(ged).length > 0) return c.chemin
      } catch {
        // pas un zip valide
      }
    }
  }
  throw new Error('Aucun fichier .zip ou .ged trouvé. Indiquez le chemin : npm run chiffrer /chemin/fichier.zip')
}

const args = process.argv.slice(2)
const nouvelleCle = args.includes('--nouvelle-cle')
const argFichier = args.find((a) => !a.startsWith('--'))
const source = argFichier ? resolve(argFichier) : trouverDernierExport()

const brut = new Uint8Array(readFileSync(source))
let nomGed = basename(source)
let octetsGed = brut

if (brut[0] === 0x50 && brut[1] === 0x4b && brut[2] === 0x03 && brut[3] === 0x04) {
  const extraits = unzipSync(brut, { filter: (f) => /\.ged$/i.test(f.name) && !f.name.startsWith('__MACOSX') })
  const entree = Object.keys(extraits)[0]
  if (!entree) throw new Error(`Aucun fichier .ged dans ${source}`)
  nomGed = entree.split('/').pop()
  octetsGed = extraits[entree]
}

const archiveCompacte = zipSync({ [nomGed]: [octetsGed, { level: 9 }] })
const cleTexte = obtenirCle(nouvelleCle)
const cleBrute = decoderCle(cleTexte)
const cleCrypto = await crypto.subtle.importKey('raw', cleBrute, 'AES-GCM', false, ['encrypt'])
const iv = crypto.getRandomValues(new Uint8Array(12))
const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cleCrypto, archiveCompacte))

const resultat = new Uint8Array(iv.length + chiffre.length)
resultat.set(iv, 0)
resultat.set(chiffre, iv.length)
writeFileSync(SORTIE, resultat)

const moSource = (brut.byteLength / (1024 * 1024)).toFixed(1)
const moGed = (octetsGed.byteLength / (1024 * 1024)).toFixed(1)
const moSortie = (resultat.byteLength / (1024 * 1024)).toFixed(2)

console.log(`Source : ${source} (${moSource} Mo)`)
console.log(`GEDCOM : ${nomGed} (${moGed} Mo)`)
console.log(`Chiffré : public/arbre.enc (${moSortie} Mo, AES-256-GCM)`)
console.log(`Clé locale : .cle-partage (ignorée par Git)`)
console.log(`\nLien de partage :\nhttps://ici.be/gedcom/#cle=${cleTexte}`)

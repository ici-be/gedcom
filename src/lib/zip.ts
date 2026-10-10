// Ouvre le .zip de Geneanet (ou un .ged) et n'en garde que le fichier GEDCOM.

import { unzipSync } from 'fflate'

export function estZip(octets: Uint8Array): boolean {
  return octets[0] === 0x50 && octets[1] === 0x4b && octets[2] === 0x03 && octets[3] === 0x04
}

/** Extrait le premier .ged du zip, sans décompresser les images qui l'accompagnent */
export function gedDuZip(octets: Uint8Array): { nom: string; octets: Uint8Array } {
  const fichiers = unzipSync(octets, { filter: (f) => /\.ged$/i.test(f.name) && !f.name.startsWith('__MACOSX') })
  const nom = Object.keys(fichiers)[0]
  if (!nom) throw new Error('Aucun fichier .ged dans cette archive.')
  return { nom: nom.split('/').pop()!, octets: fichiers[nom] }
}

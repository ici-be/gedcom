// Génère les pages /print+fr-be/, /print+en-gb/ et /print+nl-be/ : la même application que /print/, avec la langue, le titre,
// la description et les liens hreflang dans l'en-tête (pour les moteurs de recherche).
// À relancer si print/index.html change : node scripts/pages-print.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SITE = 'https://ici.be/gedcom/'
const PAGES = [
  { dossier: 'print+fr-be', lang: 'fr-BE', hreflang: 'fr-BE', titre: 'Imprimer son arbre généalogique · Lignées',
    description: 'Imprimer son arbre généalogique à partir d’un fichier GEDCOM : éventail, pyramide, sablier, arbre du couple. Rien n’est envoyé sur Internet.' },
  { dossier: 'print+en-gb', lang: 'en-GB', hreflang: 'en-GB', titre: 'Print your family tree · Lignées',
    description: 'Print your family tree from a GEDCOM file: fan, pyramid, hourglass, couple’s tree. Nothing is sent over the Internet.' },
  { dossier: 'print+nl-be', lang: 'nl-BE', hreflang: 'nl-BE', titre: 'Uw stamboom afdrukken · Lignées',
    description: 'Druk uw stamboom af op basis van een GEDCOM-bestand: waaier, piramide, zandloper, stamboom van het stel. Er wordt niets over het internet verzonden.' },
]

const nu = readFileSync('print/index.html', 'utf8').replace(/ *<link rel="(canonical|alternate)"[^>]*>\n/g, '')
const liens = [
  ...PAGES.map((p) => `    <link rel="alternate" hreflang="${p.hreflang}" href="${SITE}${p.dossier}/" />`),
  `    <link rel="alternate" hreflang="x-default" href="${SITE}print/" />`,
].join('\n')

const entete = (html, canonique) => html.replace(/<title>[^<]*<\/title>/, (t) => `${t}\n    <link rel="canonical" href="${SITE}${canonique}/" />\n${liens}`)

// la page par défaut (/print/) : la langue du navigateur, avec les mêmes liens vers les autres
writeFileSync('print/index.html', entete(nu, 'print'))

for (const p of PAGES) {
  const html = nu
    .replace(/<html lang="[^"]*">/, `<html lang="${p.lang}">`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${p.description}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${p.titre}</title>`)
  mkdirSync(p.dossier, { recursive: true })
  writeFileSync(`${p.dossier}/index.html`, entete(html, p.dossier))
}

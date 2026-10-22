// Génère les pages /print+fr-be/, /print+en-gb/ et /print+nl-be/ : la même application que /print/, avec la langue, le titre,
// la description et les liens hreflang dans l'en-tête (pour les moteurs de recherche).
// À relancer si print/index.html change : node scripts/pages-print.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// les pages d'impression sont publiées à part, sur https://ici.be/gedcom-print/ (la page par défaut à la racine) : c'est leur adresse de référence
const SITE = 'https://ici.be/gedcom-print/'
const PAGES = [
  { dossier: 'print+fr-be', lang: 'fr-BE', hreflang: 'fr-BE', titre: 'Imprimer son arbre généalogique · Lignées',
    alt: 'Un éventail de huit générations d’ancêtres, teinté selon les provinces de naissance.',
    description: 'Imprimer son arbre généalogique à partir d’un fichier GEDCOM : éventail, pyramide, sablier, arbre du couple. Rien n’est envoyé sur Internet.' },
  { dossier: 'print+en-gb', lang: 'en-GB', hreflang: 'en-GB', titre: 'Print your family tree · Lignées',
    alt: 'A fan of eight generations of ancestors, tinted by province of birth.',
    description: 'Print your family tree from a GEDCOM file: fan, pyramid, hourglass, couple’s tree. Nothing is sent over the Internet.' },
  { dossier: 'print+nl-be', lang: 'nl-BE', hreflang: 'nl-BE', titre: 'Uw stamboom afdrukken · Lignées',
    alt: 'Een waaier van acht generaties voorouders, gekleurd naar de provincie van geboorte.',
    description: 'Druk uw stamboom af op basis van een GEDCOM-bestand: waaier, piramide, zandloper, stamboom van het stel. Er wordt niets over het internet verzonden.' },
]

const nu = readFileSync('print/index.html', 'utf8').replace(/ *<(link rel="(canonical|alternate)"|meta (property="og:|name="twitter:))[^>]*>\n/g, '')
const liens = [
  ...PAGES.map((p) => `    <link rel="alternate" hreflang="${p.hreflang}" href="${SITE}${p.dossier}/" />`),
  `    <link rel="alternate" hreflang="x-default" href="${SITE}" />`,
].join('\n')

const echapper = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** Fiche de partage (Open Graph, aussi lue par X, Facebook, LinkedIn, WhatsApp…) : l'éventail des origines, dans la langue de la page */
const partage = (p) => [
  `<meta property="og:type" content="website" />`,
  `<meta property="og:site_name" content="Lignées" />`,
  `<meta property="og:title" content="${echapper(p.titre)}" />`,
  `<meta property="og:description" content="${echapper(p.description)}" />`,
  `<meta property="og:url" content="${SITE}${p.dossier ? p.dossier + '/' : ''}" />`,
  `<meta property="og:locale" content="${p.lang.replace('-', '_')}" />`,
  ...PAGES.filter((x) => x !== p).map((x) => `<meta property="og:locale:alternate" content="${x.lang.replace('-', '_')}" />`),
  `<meta property="og:image" content="${SITE}partage-print-${p.lang.slice(0, 2)}.png" />`,
  `<meta property="og:image:width" content="1200" />`,
  `<meta property="og:image:height" content="630" />`,
  `<meta property="og:image:alt" content="${echapper(p.alt)}" />`,
  `<meta name="twitter:card" content="summary_large_image" />`,
  `<meta name="twitter:title" content="${echapper(p.titre)}" />`,
  `<meta name="twitter:description" content="${echapper(p.description)}" />`,
  `<meta name="twitter:image" content="${SITE}partage-print-${p.lang.slice(0, 2)}.png" />`,
].map((l) => `    ${l}`).join('\n')

const entete = (html, canonique, p) => html.replace(/<title>[^<]*<\/title>/, (t) => `${t}\n    <link rel="canonical" href="${SITE}${canonique ? canonique + '/' : ''}" />\n${liens}\n${partage(p)}`)

// la page par défaut (/print/) : la langue du navigateur, avec les mêmes liens vers les autres
writeFileSync('print/index.html', entete(nu, '', { ...PAGES[0], dossier: '' }))

for (const p of PAGES) {
  const html = nu
    .replace(/<html lang="[^"]*">/, `<html lang="${p.lang}">`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${p.description}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${p.titre}</title>`)
  mkdirSync(p.dossier, { recursive: true })
  writeFileSync(`${p.dossier}/index.html`, entete(html, p.dossier, p))
}

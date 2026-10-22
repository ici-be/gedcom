// Prépare dist-print/ : la page d'impression seule, publiée par le workflow « Publier » sur https://ici.be/gedcom-print/
// (dépôt gedcom-print, branche gh-pages). La page /print/ y est aussi à la racine ; ni l'arbre chiffré ni l'accueil du site.
// À lancer après « npm run build » : node scripts/site-print.mjs
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const SANS = ['index.html', 'arbre.enc', 'evenements.json', 'robots.txt']

rmSync('dist-print', { recursive: true, force: true })
cpSync('dist', 'dist-print', { recursive: true, filter: (f) => !SANS.some((x) => f === `dist/${x}`) })
// la racine : /print/ remontée d'un dossier
writeFileSync('dist-print/index.html', readFileSync('dist/print/index.html', 'utf8').replace(/(href|src)="\.\.\//g, '$1="./'))
// pas de traitement Jekyll par GitHub Pages
writeFileSync('dist-print/.nojekyll', '')

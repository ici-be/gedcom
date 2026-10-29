// Génère les images de partage (1200 × 630) des pages /print+… : public/partage-print-fr.png, -en.png et -nl.png.
// L'illustration est celle du bouton « Éventail des origines » (src/ui/arbres/Vignettes.tsx). Demande google-chrome.
// À relancer si l'illustration ou les textes changent : node scripts/images-partage.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const TEXTES = {
  fr: { titre: 'Imprimez votre arbre généalogique', sous: 'Éventail, pyramide, sablier, arbre du couple : une feuille prête pour l’imprimeur ou pour un PDF.', pied: 'Gratuit · vos données restent dans votre navigateur' },
  en: { titre: 'Print your family tree', sous: 'Fan, pyramid, hourglass, couple’s tree: a sheet ready for the printer or for a PDF.', pied: 'Free · your data stays in your browser' },
  nl: { titre: 'Druk uw stamboom af', sous: 'Waaier, piramide, zandloper, stamboom van het stel: een blad klaar voor de drukker of voor een pdf.', pied: 'Gratis · uw gegevens blijven in uw browser' },
}

const source = readFileSync('src/ui/arbres/Vignettes.tsx', 'utf8')
const dessin = JSON.parse(/origines: \{[\s\S]*?dessin: ("(?:[^"\\]|\\.)*")/.exec(source)[1])
const police = (p) => pathToFileURL(resolve('node_modules', p)).href

const page = (l) => `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Fraunces; font-weight: 700; src: url(${police('@fontsource/fraunces/files/fraunces-latin-700-normal.woff2')}) }
@font-face { font-family: Inter; font-weight: 100 900; src: url(${police('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}) }
* { box-sizing: border-box; margin: 0 }
body { width: 1200px; height: 630px; overflow: hidden; background: #eef0f6; font-family: Inter, sans-serif; color: #1b2030; display: flex; align-items: center; gap: 56px; padding: 0 72px }
.feuille { flex: none; width: 560px; height: 420px; background: #fff; border-radius: 14px; box-shadow: 0 0 0 1px rgb(0 0 0 / 10%), 0 18px 48px rgb(31 55 159 / 20%); overflow: hidden }
.feuille svg { display: block; width: 100%; height: 100% }
.texte { display: flex; flex-direction: column; gap: 22px }
.marque { display: flex; align-items: center; gap: 12px; font: 700 30px Fraunces, serif; color: #1f379f }
.logo { width: 44px; height: 44px; border-radius: 11px; background: #1f379f }
h1 { font: 700 62px/1.06 Fraunces, serif; letter-spacing: -0.02em }
p { font-size: 25px; line-height: 1.4; color: #4a5266 }
.pied { font-size: 20px; font-weight: 600; color: #1f379f }
</style>
<div class="feuille"><svg viewBox="0 0 120 90"><rect width="120" height="90" fill="#fff"/>${dessin}</svg></div>
<div class="texte"><div class="marque"><span class="logo"></span>Lignées</div><h1>${TEXTES[l].titre}</h1><p>${TEXTES[l].sous}</p><div class="pied">${TEXTES[l].pied}</div></div>`

const dossier = mkdtempSync(join(tmpdir(), 'partage-'))
for (const l of Object.keys(TEXTES)) {
  const html = join(dossier, `${l}.html`)
  writeFileSync(html, page(l))
  execFileSync('google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1200,630', `--screenshot=public/partage-print-${l}.png`, pathToFileURL(html).href], { stdio: 'ignore' })
}

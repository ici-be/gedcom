// Arbres à imprimer : choisir un modèle, régler les options, voir la feuille et l'imprimer (ou l'enregistrer en PDF).

import '@fontsource/fraunces/latin-400.css'
import '@fontsource/fraunces/latin-500.css'
import '@fontsource/fira-sans-condensed/latin-400.css'
import '@fontsource/fira-sans-condensed/latin-400-italic.css'
import '@fontsource/fira-sans-condensed/latin-500.css'
import '@fontsource/fira-sans-condensed/latin-600.css'
import { useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { ecrire, lire } from '../lib/stockage'
import { MODELES, type Modele } from './arbres/modeles'

interface Reglages { date: boolean; jour?: string; qr: boolean }

const PAPIERS: Record<Modele['papier']['format'], [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594] }

const aujourdHui = () => new Date().toISOString().slice(0, 10)
const dateLongue = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

export function Impression({ d, id }: { d: Donnees; id?: string }) {
  const modele = MODELES.find((m) => m.id === id) ?? MODELES[0]
  const [reglages, setReglagesBrut] = useState<Reglages>(() => lire('impression', { date: true, qr: true }))
  const [zoom, setZoom] = useState(false)
  const setReglages = (r: Partial<Reglages>) => { const n = { ...reglages, ...r }; setReglagesBrut(n); ecrire('impression', n) }
  const jour = reglages.jour || aujourdHui()
  const [court, long] = PAPIERS[modele.papier.format]
  const [largeur, hauteur] = modele.papier.orientation === 'landscape' ? [long, court] : [court, long]

  return (
    <section class="ecran arbre-imprime">
      {/* Le format du papier ne vaut que pour cette page */}
      <style>{`@page { size: ${modele.papier.format} ${modele.papier.orientation}; margin: 0; }
@media print { .arbre-imprime svg.feuille { width: ${largeur}mm; height: ${hauteur - 1}mm; } }`}</style>
      <header class="titre-ecran">
        <h1>Arbres à imprimer</h1>
        <p class="sous-titre">Une feuille prête pour l'imprimeur ou pour un PDF, faite à partir de l'ascendance du Sosa 1.</p>
      </header>

      <div class="outils-impression">
        {MODELES.length > 1 && (
          <nav class="modeles" aria-label="Modèles">
            {MODELES.map((m) => (
              <a key={m.id} href={'#/imprimer/' + m.id} class={m.id === modele.id ? 'actif' : ''}>{m.titre}</a>
            ))}
          </nav>
        )}
        <section class="panneau">
          <div class="modele-choisi">
            <h2>{modele.titre}</h2>
            <p class="aide">{modele.description}</p>
            <p class="aide">{modele.papier.format} {modele.papier.orientation === 'landscape' ? 'paysage' : 'portrait'} · {modele.generations} générations · {largeur} × {hauteur} mm</p>
          </div>
          <div class="options-impression">
            <label class="case">
              <input type="checkbox" id="impression-date" checked={reglages.date} onChange={(e) => setReglages({ date: e.currentTarget.checked })} />
              Date en pied de page
            </label>
            {reglages.date && (
              <input type="date" id="impression-jour" value={jour} aria-label="Date imprimée"
                onInput={(e) => setReglages({ jour: e.currentTarget.value || undefined })} />
            )}
            <label class="case">
              <input type="checkbox" id="impression-qr" checked={reglages.qr && !!d.adresse} disabled={!d.adresse} onChange={(e) => setReglages({ qr: e.currentTarget.checked })} />
              Code QR vers l'arbre en ligne
            </label>
            {!d.adresse && <span class="aide">Indiquez d'abord l'adresse de l'arbre en ligne dans les <a href="#/">réglages de l'accueil</a>.</span>}
          </div>
          <div class="ligne">
            <button type="button" class="bouton principal" onClick={() => window.print()}>Imprimer</button>
            <span class="aide">Dans la fenêtre d'impression : papier {modele.papier.format} {modele.papier.orientation === 'landscape' ? 'paysage' : 'portrait'}, marges « aucune », graphiques d'arrière-plan activés. Pour un PDF, choisir « Enregistrer au format PDF ».</span>
          </div>
        </section>
        <div class="ligne apercu-outils">
          <span class="aide">Aperçu réduit</span>
          <button type="button" class="bouton discret" onClick={() => setZoom(!zoom)}>{zoom ? 'Réduire' : 'Agrandir'}</button>
        </div>
      </div>

      <div class={'apercu' + (zoom ? ' zoom' : '')}>
        <modele.Feuille d={d} options={{ date: reglages.date ? dateLongue(jour) : undefined, qr: reglages.qr && !!d.adresse }} />
      </div>
    </section>
  )
}

// Arbres à imprimer : choisir un modèle, régler les options, voir la feuille et l'imprimer (ou l'enregistrer en PDF).

import '@fontsource/fraunces/latin-400.css'
import '@fontsource/fraunces/latin-500.css'
import '@fontsource/fira-sans-condensed/latin-400.css'
import '@fontsource/fira-sans-condensed/latin-400-italic.css'
import '@fontsource/fira-sans-condensed/latin-500.css'
import '@fontsource/fira-sans-condensed/latin-600.css'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { ecrire, lire } from '../lib/stockage'
import { MODELES, type Format } from './arbres/modeles'

interface Reglages { date: boolean; jour?: string; qr: boolean; papier?: Format }

const PAPIERS: Record<Format, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594] }

const aujourdHui = () => new Date().toISOString().slice(0, 10)
const dateLongue = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

export function Impression({ d, id }: { d: Donnees; id?: string }) {
  const modele = MODELES.find((m) => m.id === id) ?? MODELES[0]
  const [reglages, setReglagesBrut] = useState<Reglages>(() => lire('impression', { date: true, qr: true }))
  const [zoom, setZoom] = useState(false)
  const apercu = useRef<HTMLDivElement>(null)
  const glisse = useRef<{ x: number; y: number; gauche: number; haut: number } | null>(null)
  // En agrandissant : l'aperçu à l'écran, centré sur l'éventail
  useLayoutEffect(() => {
    const el = apercu.current
    if (!zoom || !el) return
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [zoom])
  // Agrandi, la feuille se déplace en la tirant à la souris (au doigt, le défilement natif suffit)
  const saisir = (e: PointerEvent) => {
    const el = apercu.current
    if (!zoom || !el || e.pointerType !== 'mouse' || e.button !== 0) return
    glisse.current = { x: e.clientX, y: e.clientY, gauche: el.scrollLeft, haut: el.scrollTop }
    el.setPointerCapture(e.pointerId)
    el.classList.add('glisse')
    e.preventDefault()
  }
  const tirer = (e: PointerEvent) => {
    const g = glisse.current
    const el = apercu.current
    if (!g || !el) return
    el.scrollLeft = g.gauche - (e.clientX - g.x)
    el.scrollTop = g.haut - (e.clientY - g.y)
  }
  const lacher = () => {
    glisse.current = null
    apercu.current?.classList.remove('glisse')
  }
  const setReglages = (r: Partial<Reglages>) => { const n = { ...reglages, ...r }; setReglagesBrut(n); ecrire('impression', n) }
  const jour = reglages.jour || aujourdHui()
  // Le format prévu par le modèle, ou un plus petit pour une imprimante de bureau
  const formats = (['A4', 'A3', 'A2'] as Format[]).filter((f) => PAPIERS[f][0] <= PAPIERS[modele.papier.format][0])
  const format = reglages.papier && formats.includes(reglages.papier) ? reglages.papier : modele.papier.format
  const orientation = modele.papier.orientation === 'landscape' ? 'paysage' : 'portrait'
  const [court, long] = PAPIERS[format]
  const [largeur, hauteur] = modele.papier.orientation === 'landscape' ? [long, court] : [court, long]

  return (
    <section class="ecran arbre-imprime">
      {/* Le format du papier ne vaut que pour cette page */}
      {/* !important : l'aperçu agrandi (width: 260 %) ne doit pas passer à l'impression */}
      <style>{`@page { size: ${format} ${modele.papier.orientation}; margin: 0; }
@media print { .arbre-imprime .apercu svg.feuille { width: ${largeur}mm !important; height: ${hauteur - 1}mm !important; } }`}</style>
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
            <p class="aide">Prévu pour du {modele.papier.format} {orientation} · {modele.generations} générations</p>
          </div>
          <div class="options-impression">
            {formats.length > 1 && (
              <label class="case">
                Papier
                <select id="impression-papier" value={format} onChange={(e) => setReglages({ papier: e.currentTarget.value as Format })}>
                  {formats.map((f) => <option key={f} value={f}>{f} {orientation} ({(modele.papier.orientation === 'landscape' ? [...PAPIERS[f]].reverse() : PAPIERS[f]).join(' × ')} mm){f !== modele.papier.format ? ', réduit' : ''}</option>)}
                </select>
              </label>
            )}
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
            <span class="aide">Dans la fenêtre d'impression : papier {format} {orientation}, marges « aucune », échelle « par défaut » (100 %), graphiques d'arrière-plan activés. Pour un PDF, choisir « Enregistrer au format PDF ».</span>
          </div>
        </section>
        <div class="ligne apercu-outils">
          <span class="aide">{zoom ? 'Aperçu agrandi : tirer la feuille pour la déplacer' : 'Aperçu réduit'}</span>
          <button type="button" class="bouton discret" onClick={() => setZoom(!zoom)}>{zoom ? 'Réduire' : 'Agrandir'}</button>
        </div>
      </div>

      <div ref={apercu} class={'apercu' + (zoom ? ' zoom' : '')}
        onPointerDown={saisir} onPointerMove={tirer} onPointerUp={lacher} onPointerCancel={lacher}>
        <modele.Feuille d={d} options={{ date: reglages.date ? dateLongue(jour) : undefined, qr: reglages.qr && !!d.adresse }} />
      </div>
    </section>
  )
}

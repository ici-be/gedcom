// Arbres à imprimer : choisir un modèle, régler les options, voir la feuille et l'imprimer (ou l'enregistrer en PDF).

import '@fontsource/fraunces/latin-400.css'
import '@fontsource/fraunces/latin-500.css'
import '@fontsource/fira-sans-condensed/latin-400.css'
import '@fontsource/fira-sans-condensed/latin-400-italic.css'
import '@fontsource/fira-sans-condensed/latin-500.css'
import '@fontsource/fira-sans-condensed/latin-600.css'
import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { nomFichierArbre, nomFichierCouple } from '../lib/format'
import { ecrire, lire } from '../lib/stockage'
import { MODELES, type AlignementTitre, type Format, type FormePhoto } from './arbres/modeles'
import { bornerGenerationsPyramide, FORMES_PHOTO, GENERATIONS_PYRAMIDE, GEN_MAX_PYRAMIDE, GEN_MIN_PYRAMIDE, THEMES_PYRAMIDE, trouverThemePyramide } from './arbres/Pyramide'
import { ASC_MAX_SABLIER, ASC_MIN_SABLIER, bornerAscendance, bornerDescendance, conjointsDe, DESC_MAX_SABLIER, DESC_MIN_SABLIER } from './arbres/Sablier'

interface Reglages {
  date: boolean
  jour?: string
  qr: boolean
  url?: boolean
  papier?: Format
  barres?: boolean
  theme?: string
  generations?: number
  ascendance?: number
  descendance?: number
  conjoint?: string
  alignementTitre?: AlignementTitre
  fratrie?: boolean
  italiques?: boolean
  verso?: boolean
  photos?: boolean
  signatures?: boolean
  formePhoto?: FormePhoto
  bordsArrondis?: boolean
  mariages?: boolean
  photosDesc?: boolean
  signaturesDesc?: boolean
  mariagesDesc?: boolean
  equitable?: boolean
  fratrieBase?: boolean
  fratrieCases?: boolean
  lieuxDesc?: boolean
  metiersDesc?: boolean
  metiersCentre?: boolean
  metiersEtiquettes?: boolean
  metiersCartouches?: boolean
  tousPrenoms?: boolean
}

const PAPIERS: Record<Format, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594] }

const ICONES_ALIGN: Record<AlignementTitre, JSX.Element> = {
  gauche: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <line x1="2" y1="3" x2="14" y2="3" />
      <line x1="2" y1="7" x2="9" y2="7" />
      <line x1="2" y1="11" x2="14" y2="11" />
      <line x1="2" y1="15" x2="7" y2="15" />
    </svg>
  ),
  centre: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <line x1="2" y1="3" x2="14" y2="3" />
      <line x1="4.5" y1="7" x2="11.5" y2="7" />
      <line x1="2" y1="11" x2="14" y2="11" />
      <line x1="5.5" y1="15" x2="10.5" y2="15" />
    </svg>
  ),
  droite: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <line x1="2" y1="3" x2="14" y2="3" />
      <line x1="7" y1="7" x2="14" y2="7" />
      <line x1="2" y1="11" x2="14" y2="11" />
      <line x1="9" y1="15" x2="14" y2="15" />
    </svg>
  ),
}

const BOUTONS_ALIGN: { id: AlignementTitre; titre: string }[] = [
  { id: 'gauche', titre: 'Aligner à gauche' },
  { id: 'centre', titre: 'Centrer' },
  { id: 'droite', titre: 'Aligner à droite' },
]

const aujourdHui = () => new Date().toISOString().slice(0, 10)
const dateLongue = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

export function Impression({ d, id }: { d: Donnees; id?: string }) {
  const modele = MODELES.find((m) => m.id === id) ?? MODELES[0]
  const [reglages, setReglagesBrut] = useState<Reglages>(() => {
    const r = lire<Reglages>('impression', { date: true, qr: true, url: true })
    if (r.url === undefined) r.url = r.qr ?? true
    if (r.signatures === undefined && r.photos !== undefined) r.signatures = r.photos
    if (r.signaturesDesc === undefined && r.photosDesc !== undefined) r.signaturesDesc = r.photosDesc
    return r
  })
  const [zoom, setZoom] = useState(false)
  const apercu = useRef<HTMLDivElement>(null)
  const glisse = useRef<{ x: number; y: number; gauche: number; haut: number } | null>(null)
  // En agrandissant : l'aperçu à l'écran, centré sur l'éventail
  useLayoutEffect(() => {
    const el = apercu.current
    if (!zoom || !el) return
    // avec le verso, deux feuilles l'une sous l'autre : on centre la première
    const feuille = el.querySelector('svg.feuille')
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    el.scrollTop = ((feuille?.getBoundingClientRect().height ?? el.scrollHeight) - el.clientHeight) / 2
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
  const verso = reglages.verso && modele.verso
  // Le format prévu par le modèle, ou un plus petit pour une imprimante de bureau
  const formats = (['A4', 'A3', 'A2'] as Format[]).filter((f) => PAPIERS[f][0] <= PAPIERS[modele.papier.format][0])
  const format = reglages.papier && formats.includes(reglages.papier) ? reglages.papier : modele.papier.format
  const orientation = modele.papier.orientation === 'landscape' ? 'paysage' : 'portrait'
  const [court, long] = PAPIERS[format]
  const [largeur, hauteur] = modele.papier.orientation === 'landscape' ? [long, court] : [court, long]

  const themeChoisi = trouverThemePyramide(reglages.theme)
  const theme = themeChoisi.id
  const generations = modele.reglages.generations ? bornerGenerationsPyramide(reglages.generations) : modele.generations
  const ascendance = bornerAscendance(reglages.ascendance)
  const descendance = bornerDescendance(reglages.descendance)
  const racine = d.arbre.individus.get(d.racine)
  // Arbre du couple : le conjoint choisi s'il est encore parmi ceux de la personne de départ, sinon le premier
  const conjoints = modele.reglages.conjoint && racine ? conjointsDe(d.arbre, racine) : []
  const conjoint = conjoints.find((c) => c.famille === reglages.conjoint)?.famille ?? conjoints[0]?.famille
  // Arbre du couple : les noms des deux, dans l'ordre de la feuille (l'homme à gauche)
  const membre = conjoints.find((c) => c.famille === conjoint)?.conjoint
  const [premier, second] = racine?.sexe === 'F' && membre?.sexe === 'M' ? [membre, racine] : [racine, membre]
  const nomFichier = modele.reglages.conjoint && membre ? nomFichierCouple(premier?.nom ?? '', second?.nom ?? '', jour) : nomFichierArbre(racine?.prenom ?? '', racine?.nom ?? '', jour)
  // Le navigateur nomme le PDF d'après le titre de la page : on le change le temps de l'impression
  useEffect(() => {
    let titre = document.title
    const avant = () => { titre = document.title; document.title = nomFichier }
    const apres = () => { document.title = titre }
    addEventListener('beforeprint', avant)
    addEventListener('afterprint', apres)
    return () => { removeEventListener('beforeprint', avant); removeEventListener('afterprint', apres) }
  }, [nomFichier])
  const fratrie = reglages.fratrie !== false
  const photosActives = reglages.photos !== false
  const signaturesActives = reglages.signatures !== false
  const formePhoto: FormePhoto = FORMES_PHOTO.some((f) => f.id === reglages.formePhoto) ? reglages.formePhoto! : 'carree'
  const fratrieBase = reglages.fratrieBase ?? fratrie
  const photosDesc = reglages.photosDesc ?? photosActives
  const signaturesDesc = reglages.signaturesDesc ?? signaturesActives
  const mariagesDesc = reglages.mariagesDesc ?? reglages.mariages !== false
  const bordsArrondis = reglages.bordsArrondis !== false
  // Colonne du milieu dans le tableau des options : le couple ou la personne de départ
  const centre = modele.reglages.conjoint ? 'Couple' : 'Sosa 1'
  const centreMin = modele.reglages.conjoint ? 'couple' : 'personne de départ'
  // Métier des ancêtres : première génération en petits cartouches, la suivante en étiquettes verticales
  const genCartouches = modele.reglages.conjoint ? 3 : 4
  const options = {
    date: reglages.date ? dateLongue(jour) : undefined,
    qr: reglages.qr && !!d.adresse,
    url: (reglages.url ?? reglages.qr ?? true) && !!d.adresse,
    carte: !reglages.barres,
    theme,
    generations,
    ascendance,
    descendance,
    conjoint,
    alignementTitre: reglages.alignementTitre,
    fratrie,
    lieuxDesc: reglages.lieuxDesc !== false,
    metiersDesc: reglages.metiersDesc !== false,
    metiersCentre: reglages.metiersCentre !== false,
    metiersEtiquettes: !!reglages.metiersEtiquettes,
    metiersCartouches: !!reglages.metiersCartouches,
    tousPrenoms: !!reglages.tousPrenoms,
    fratrieCases: !!modele.reglages.conjoint && fratrieBase && !!reglages.fratrieCases,
    fratrieBase: modele.reglages.descendants ? fratrieBase : fratrie,
    italiques: reglages.italiques,
    photos: photosActives,
    signatures: signaturesActives,
    equitable: !!modele.reglages.equitable && !!reglages.equitable,
    photosDesc: modele.reglages.descendants ? photosDesc : photosActives,
    signaturesDesc: modele.reglages.descendants ? signaturesDesc : signaturesActives,
    mariagesDesc: modele.reglages.descendants ? mariagesDesc : reglages.mariages !== false,
    formePhoto,
    bordsArrondis,
    mariages: reglages.mariages !== false,
    numeros: !!verso,
  }
  const themesSexe = THEMES_PYRAMIDE.filter((t) => t.famille === 'sexe')
  const themesAutres = THEMES_PYRAMIDE.filter((t) => t.famille === 'autre')

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
            <p class="aide">Prévu pour du {modele.papier.format} {orientation} · {modele.reglages.sablierGenerations ? `${ascendance} gén. d'ancêtres, ${descendance} gén. de descendants` : `${generations} générations`}</p>
            {modele.verso && <p class="aide">Au verso, si on le souhaite : {modele.verso.titre.toLocaleLowerCase('fr')}, {modele.verso.description}.</p>}
          </div>
          <div class="options-impression groupes-options">
            <div class="groupe-options">
              <span class="groupe-options-titre">Feuille</span>
              <div class="groupe-options-corps">
                {formats.length > 1 && (
                  <label class="case">
                    Papier
                    <select id="impression-papier" value={format} onChange={(e) => setReglages({ papier: e.currentTarget.value as Format })}>
                      {formats.map((f) => <option key={f} value={f}>{f} {orientation} ({(modele.papier.orientation === 'landscape' ? [...PAPIERS[f]].reverse() : PAPIERS[f]).join(' × ')} mm){f !== modele.papier.format ? ', réduit' : ''}</option>)}
                    </select>
                  </label>
                )}
                {modele.reglages.generations && (
                  <div class="case pas-generations">
                    <label for="impression-generations">Générations</label>
                    <button type="button" class="bouton discret" title="Enlever une génération" aria-label="Enlever une génération"
                      disabled={generations <= GEN_MIN_PYRAMIDE} onClick={() => setReglages({ generations: generations - 1 })}>−</button>
                    <select id="impression-generations" value={generations} onChange={(e) => setReglages({ generations: Number(e.currentTarget.value) })}>
                      {GENERATIONS_PYRAMIDE.map((n) => (
                        <option key={n} value={n}>{n} générations ({2 ** n - 1} places, jusqu’au Sosa {2 ** n - 1})</option>
                      ))}
                    </select>
                    <button type="button" class="bouton discret" title="Ajouter une génération" aria-label="Ajouter une génération"
                      disabled={generations >= GEN_MAX_PYRAMIDE} onClick={() => setReglages({ generations: generations + 1 })}>+</button>
                  </div>
                )}
                {conjoints.length > 1 && (
                  <label class="case">
                    Conjoint
                    <select id="impression-conjoint" value={conjoint} onChange={(e) => setReglages({ conjoint: e.currentTarget.value })}>
                      {conjoints.map((c) => <option key={c.famille} value={c.famille}>{[c.conjoint.prenom, c.conjoint.nom.toLocaleUpperCase('fr')].filter(Boolean).join(' ') || 'conjoint sans nom'}</option>)}
                    </select>
                  </label>
                )}
                {modele.reglages.sablierGenerations && (
                  <>
                    <div class="case pas-generations">
                      <label for="impression-ascendance">Ancêtres</label>
                      <button type="button" class="bouton discret" title="Enlever une génération d'ascendance" aria-label="Enlever une génération d'ascendance"
                        disabled={ascendance <= ASC_MIN_SABLIER} onClick={() => setReglages({ ascendance: ascendance - 1 })}>−</button>
                      <select id="impression-ascendance" value={ascendance} onChange={(e) => setReglages({ ascendance: Number(e.currentTarget.value) })}>
                        {Array.from({ length: ASC_MAX_SABLIER - ASC_MIN_SABLIER + 1 }, (_, i) => ASC_MIN_SABLIER + i).map((n) => (
                          <option key={n} value={n}>{n} génération{n > 1 ? 's' : ''} ({2 ** (n + 1) - 2} ancêtres max)</option>
                        ))}
                      </select>
                      <button type="button" class="bouton discret" title="Ajouter une génération d'ascendance" aria-label="Ajouter une génération d'ascendance"
                        disabled={ascendance >= ASC_MAX_SABLIER} onClick={() => setReglages({ ascendance: ascendance + 1 })}>+</button>
                    </div>
                    <div class="case pas-generations">
                      <label for="impression-descendance">Descendants</label>
                      <button type="button" class="bouton discret" title="Enlever une génération de descendance" aria-label="Enlever une génération de descendance"
                        disabled={descendance <= DESC_MIN_SABLIER} onClick={() => setReglages({ descendance: descendance - 1 })}>−</button>
                      <select id="impression-descendance" value={descendance} onChange={(e) => setReglages({ descendance: Number(e.currentTarget.value) })}>
                        {Array.from({ length: DESC_MAX_SABLIER - DESC_MIN_SABLIER + 1 }, (_, i) => DESC_MIN_SABLIER + i).map((n) => (
                          <option key={n} value={n}>{n} génération{n > 1 ? 's' : ''} ({n === 1 ? 'enfants' : n === 2 ? 'petits-enfants' : 'arrière-petits-enfants'})</option>
                        ))}
                      </select>
                      <button type="button" class="bouton discret" title="Ajouter une génération de descendance" aria-label="Ajouter une génération de descendance"
                        disabled={descendance >= DESC_MAX_SABLIER} onClick={() => setReglages({ descendance: descendance + 1 })}>+</button>
                    </div>
                  </>
                )}
                {modele.reglages.bas && (
                  <label class="case">
                    Bas de la feuille
                    <select id="impression-bas" value={reglages.barres ? 'barres' : 'carte'} onChange={(e) => setReglages({ barres: e.currentTarget.value === 'barres' })}>
                      <option value="carte">Carte des lieux de naissance</option>
                      <option value="barres">Origine par génération (barres)</option>
                    </select>
                  </label>
                )}
                {modele.reglages.theme && (
                  <label class="case">
                    Thème de couleurs
                    <select id="impression-theme" value={theme} onChange={(e) => setReglages({ theme: e.currentTarget.value })}>
                      <optgroup label="Sans distinction de sexe">
                        {themesAutres.map((t) => <option key={t.id} value={t.id}>{t.titre}</option>)}
                      </optgroup>
                      <optgroup label="Deux teintes (homme / femme)">
                        {themesSexe.map((t) => <option key={t.id} value={t.id}>{t.titre}</option>)}
                      </optgroup>
                    </select>
                    <span class="pastilles-theme" aria-hidden="true">
                      {themeChoisi.apercu.map((c, i) => (
                        <i key={i} class="pastille-theme" style={{ background: c.fond, borderColor: c.trait }} />
                      ))}
                    </span>
                  </label>
                )}
                {modele.reglages.equitable && (
                  <label class="case" title="Les descendants sans enfant gardent une case aussi large que les autres ; à la dernière génération, les enfants d'un même parent sont empilés">
                    <input type="checkbox" id="impression-equitable" checked={!!reglages.equitable} onChange={(e) => setReglages({ equitable: e.currentTarget.checked })} />
                    Cases égales pour les descendants
                  </label>
                )}
                {modele.reglages.descendants && (
                  <label class="case">
                    <input type="checkbox" id="impression-tous-prenoms" checked={!!reglages.tousPrenoms} onChange={(e) => setReglages({ tousPrenoms: e.currentTarget.checked })} />
                    Tous les prénoms dans le titre
                  </label>
                )}
                {modele.verso && (
                  <label class="case" title={modele.verso.description}>
                    <input type="checkbox" id="impression-verso" checked={!!reglages.verso} onChange={(e) => setReglages({ verso: e.currentTarget.checked })} />
                    Verso : {modele.verso.titre.toLocaleLowerCase('fr')}
                  </label>
                )}
              </div>
            </div>

            {modele.reglages.descendants ? (
              <div class="groupe-options">
                <span class="groupe-options-titre">Contenu</span>
                <div class="groupe-options-corps">
                  <div class="matrice-options-cadre">
                    <table class="matrice-options">
                      <thead>
                        <tr><td /><th scope="col">Ancêtres</th><th scope="col">{centre}</th><th scope="col">Descendants</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th scope="row">Mariages</th>
                          <td colSpan={2}><input type="checkbox" id="impression-mariages" aria-label={`Mariages et conjoints : ancêtres et ${centreMin}`} title="Année et commune du mariage" checked={reglages.mariages !== false} onChange={(e) => setReglages({ mariages: e.currentTarget.checked })} /></td>
                          <td><input type="checkbox" id="impression-mariages-desc" aria-label="Conjoints des descendants" title="« ∞ année conjoint »" checked={mariagesDesc} onChange={(e) => setReglages({ mariagesDesc: e.currentTarget.checked })} /></td>
                        </tr>
                        <tr>
                          <th scope="row">Frères et sœurs</th>
                          <td><input type="checkbox" id="impression-fratrie" aria-label="Frères et sœurs des ancêtres" title="Sous ou à côté de la case" checked={fratrie} onChange={(e) => setReglages({ fratrie: e.currentTarget.checked })} /></td>
                          <td>
                            {modele.reglages.conjoint ? (
                              <select id="impression-fratrie-base" aria-label="Frères et sœurs du couple" title="En petites cases : empilées à côté de chaque membre du couple, reliées à leurs parents ; en texte s'il y en a trop"
                                value={!fratrieBase ? 'non' : reglages.fratrieCases ? 'cases' : 'texte'}
                                onChange={(e) => { const v = e.currentTarget.value; setReglages({ fratrieBase: v !== 'non', ...(v !== 'non' && { fratrieCases: v === 'cases' }) }) }}>
                                <option value="non">non</option>
                                <option value="texte">en texte</option>
                                <option value="cases">en cases</option>
                              </select>
                            ) : (
                              <input type="checkbox" id="impression-fratrie-base" aria-label="Frères et sœurs de la personne de départ" checked={fratrieBase} onChange={(e) => setReglages({ fratrieBase: e.currentTarget.checked })} />
                            )}
                          </td>
                          <td class="sans">—</td>
                        </tr>
                        <tr>
                          <th scope="row">Métier</th>
                          <td>
                            {ascendance >= genCartouches ? (
                              <span class="matrice-sous">
                                <label title="Dans les petits cartouches, le métier s'écrit en petit sous le reste du texte">
                                  <input type="checkbox" id="impression-metiers-cartouches" checked={!!reglages.metiersCartouches} onChange={(e) => setReglages({ metiersCartouches: e.currentTarget.checked })} />
                                  gén. {genCartouches}
                                </label>
                                {ascendance >= genCartouches + 1 && (
                                  <label title="Sur les étiquettes verticales, le métier s'écrit en petit sous le reste du texte">
                                    <input type="checkbox" id="impression-metiers-etiquettes" checked={!!reglages.metiersEtiquettes} onChange={(e) => setReglages({ metiersEtiquettes: e.currentTarget.checked })} />
                                    gén. {genCartouches + 1}
                                  </label>
                                )}
                              </span>
                            ) : <span class="sans">—</span>}
                          </td>
                          <td><input type="checkbox" id="impression-metiers-centre" aria-label={modele.reglages.conjoint ? 'Métier du couple central' : 'Métier de la personne de départ et de ses conjoints'} checked={reglages.metiersCentre !== false} onChange={(e) => setReglages({ metiersCentre: e.currentTarget.checked })} /></td>
                          <td><input type="checkbox" id="impression-metiers-desc" aria-label="Métier des descendants" checked={reglages.metiersDesc !== false} onChange={(e) => setReglages({ metiersDesc: e.currentTarget.checked })} /></td>
                        </tr>
                        <tr>
                          <th scope="row">Commune de naissance</th>
                          <td colSpan={2} class="sans">toujours</td>
                          <td><input type="checkbox" id="impression-lieux-desc" aria-label="Commune de naissance des descendants" checked={reglages.lieuxDesc !== false} onChange={(e) => setReglages({ lieuxDesc: e.currentTarget.checked })} /></td>
                        </tr>
                        <tr>
                          <th scope="row">Photos</th>
                          <td colSpan={2}><input type="checkbox" id="impression-photos" aria-label={`Photos : ancêtres et ${centreMin}`} checked={photosActives} onChange={(e) => setReglages({ photos: e.currentTarget.checked })} /></td>
                          <td><input type="checkbox" id="impression-photos-desc" aria-label="Photos des descendants" checked={photosDesc} onChange={(e) => setReglages({ photosDesc: e.currentTarget.checked })} /></td>
                        </tr>
                        <tr>
                          <th scope="row">Signatures</th>
                          <td colSpan={2}><input type="checkbox" id="impression-signatures" aria-label={`Signatures : ancêtres et ${centreMin}`} checked={signaturesActives} onChange={(e) => setReglages({ signatures: e.currentTarget.checked })} /></td>
                          <td><input type="checkbox" id="impression-signatures-desc" aria-label="Signatures des descendants" checked={signaturesDesc} onChange={(e) => setReglages({ signaturesDesc: e.currentTarget.checked })} /></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="matrice-suite">
                    {(photosActives || photosDesc) && <ChoixPortraits formePhoto={formePhoto} bordsArrondis={bordsArrondis} setReglages={setReglages} />}
                    <label class="case">
                      <input type="checkbox" id="impression-italiques" checked={!!reglages.italiques} onChange={(e) => setReglages({ italiques: e.currentTarget.checked })} />
                      Dates sans source en italique
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div class="groupe-options">
                  <span class="groupe-options-titre">Contenu</span>
                  <div class="groupe-options-corps">
                    <label class="case">
                      <input type="checkbox" id="impression-mariages" checked={reglages.mariages !== false} onChange={(e) => setReglages({ mariages: e.currentTarget.checked })} />
                      {modele.reglages.mariages}
                    </label>
                    <label class="case">
                      <input type="checkbox" id="impression-fratrie" checked={fratrie} onChange={(e) => setReglages({ fratrie: e.currentTarget.checked })} />
                      {modele.reglages.fratrie}
                    </label>
                    <label class="case">
                      <input type="checkbox" id="impression-italiques" checked={!!reglages.italiques} onChange={(e) => setReglages({ italiques: e.currentTarget.checked })} />
                      Dates sans source en italique
                    </label>
                  </div>
                </div>
                {modele.reglages.photos && (
                  <div class="groupe-options">
                    <span class="groupe-options-titre">Photos</span>
                    <div class="groupe-options-corps">
                      <label class="case">
                        <input type="checkbox" id="impression-photos" checked={photosActives} onChange={(e) => setReglages({ photos: e.currentTarget.checked })} />
                        Photos
                      </label>
                      <label class="case">
                        <input type="checkbox" id="impression-signatures" checked={signaturesActives} onChange={(e) => setReglages({ signatures: e.currentTarget.checked })} />
                        Signatures
                      </label>
                      {photosActives && <ChoixPortraits formePhoto={formePhoto} bordsArrondis={bordsArrondis} setReglages={setReglages} />}
                    </div>
                  </div>
                )}
              </>
            )}

            <div class="groupe-options">
              <span class="groupe-options-titre">Pied de page</span>
              <div class="groupe-options-corps">
                {modele.reglages.alignementTitre && (
                  <div class="case alignement-titre">
                    <span>Alignement du titre</span>
                    <div class="groupe-boutons-align" role="group" aria-label="Alignement du titre">
                      {BOUTONS_ALIGN.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          class={'bouton-align' + ((reglages.alignementTitre ?? 'gauche') === b.id ? ' actif' : '')}
                          title={b.titre}
                          aria-label={b.titre}
                          onClick={() => setReglages({ alignementTitre: b.id })}
                        >
                          {ICONES_ALIGN[b.id]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div class="option-groupee">
                  <label class="case">
                    <input type="checkbox" id="impression-date" checked={reglages.date} onChange={(e) => setReglages({ date: e.currentTarget.checked })} />
                    Date
                  </label>
                  {reglages.date && (
                    <input type="date" id="impression-jour" value={jour} aria-label="Date imprimée"
                      onInput={(e) => setReglages({ jour: e.currentTarget.value || undefined })} />
                  )}
                </div>
                <label class="case" title="Vers l'arbre en ligne">
                  <input type="checkbox" id="impression-qr" checked={reglages.qr && !!d.adresse} disabled={!d.adresse} onChange={(e) => setReglages({ qr: e.currentTarget.checked })} />
                  Code QR
                </label>
                <label class="case" title="De l'arbre en ligne">
                  <input type="checkbox" id="impression-url" checked={(reglages.url ?? reglages.qr ?? true) && !!d.adresse} disabled={!d.adresse} onChange={(e) => setReglages({ url: e.currentTarget.checked })} />
                  Adresse (URL)
                </label>
                {!d.adresse && <span class="aide">Indiquez d'abord l'adresse de l'arbre en ligne dans les <a href="#/">réglages de l'accueil</a>.</span>}
              </div>
            </div>
          </div>
          <div class="ligne">
            <button type="button" class="bouton principal" onClick={() => window.print()}>Imprimer</button>
            <span class="aide">Dans la fenêtre d'impression : papier {format} {orientation}, marges « aucune », échelle « par défaut » (100 %), graphiques d'arrière-plan activés.{verso && ' Avec le verso, recto verso retourné sur le bord court.'} Pour un PDF, choisir « Enregistrer au format PDF » : il s’appellera {nomFichier}.pdf.</span>
          </div>
        </section>
        <div class="ligne apercu-outils">
          <span class="aide">{zoom ? 'Aperçu agrandi : tirer la feuille pour la déplacer' : 'Aperçu réduit'}</span>
          <button type="button" class="bouton discret" onClick={() => setZoom(!zoom)}>{zoom ? 'Réduire' : 'Agrandir'}</button>
        </div>
      </div>

      <div ref={apercu} class={'apercu' + (zoom ? ' zoom' : '')}
        onPointerDown={saisir} onPointerMove={tirer} onPointerUp={lacher} onPointerCancel={lacher}>
        <modele.Feuille d={d} options={options} />
        {verso && <verso.Feuille d={d} options={options} />}
      </div>
    </section>
  )
}

/** Forme des portraits et bords arrondis (les signatures gardent leur forme) */
function ChoixPortraits({ formePhoto, bordsArrondis, setReglages }: { formePhoto: FormePhoto; bordsArrondis: boolean; setReglages: (r: Partial<Reglages>) => void }) {
  return (
    <span class="option-groupee">
      <label class="case">
        Portraits
        <select id="impression-forme-photo" value={formePhoto} onChange={(e) => setReglages({ formePhoto: e.currentTarget.value as FormePhoto })}>
          {FORMES_PHOTO.map((f) => <option key={f.id} value={f.id}>{f.titre}</option>)}
        </select>
      </label>
      <label class={'case' + (formePhoto === 'ovale' ? ' inactif' : '')} title={formePhoto === 'ovale' ? 'S’applique aux portraits carrés ou rectangulaires' : undefined}>
        <input type="checkbox" id="impression-photo-arrondie" checked={bordsArrondis} disabled={formePhoto === 'ovale'} onChange={(e) => setReglages({ bordsArrondis: e.currentTarget.checked })} />
        bords arrondis
      </label>
    </span>
  )
}

// Récit : une notice généalogique sur une personne choisie, ses descendants et ses ancêtres, sur autant de
// générations qu'on veut dans chaque sens, avec notes de bas de partie et, au choix, un petit arbre par couple.
// Chaque nom cité mène au récit de cette personne.

import '@fontsource/fraunces/latin-400.css'
import '@fontsource/fraunces/latin-400-italic.css'
import qrcode from 'qrcode-generator'
import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { MAX_ASCENDANTS, MAX_DESCENDANTS, recit, texteBrut, type Bloc, type Case, type Morceau, type PetitArbre, type Phrase } from '../lib/recit'
import { nombre } from '../lib/format'
import { ecrire, lire } from '../lib/stockage'
import type { Individu } from '../lib/gedcom/arbre'
import { nomComplet } from '../lib/parente'
import { CasePhotos, ChoixPersonne, Photo, usePhotos } from './commun'
import { IconeEvenement, lienEvenement, useEvenements } from './Evenements'

interface Reglages { asc: number; desc: number; sources: boolean; evenements: boolean; arbres: boolean }
/** Pour les photos à côté des notices (absent : pas de photos) */
type Qui = ((id: string) => Individu | undefined) | undefined

const lien = (id: string) => '#/recit/' + encodeURIComponent(id)
const GENERATIONS_ASC = ['aucune', 'les parents', 'jusqu’aux grands-parents', 'jusqu’aux arrière-grands-parents']
const GENERATIONS_DESC = ['aucune', 'les enfants', 'jusqu’aux petits-enfants', 'jusqu’aux arrière-petits-enfants']
const libelle = (l: string[], n: number) => l[n] ?? `${n} générations`
const NOMBRES = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit']

/** Aller à un endroit du récit sans toucher à l'adresse (elle sert à la navigation) */
function aller(e: Event, id: string) {
  e.preventDefault()
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.remove('rc-vise')
  void el.getBoundingClientRect()
  el.classList.add('rc-vise')
}

/** Les liens des notes, numérotés pour leurs QR codes imprimés (une adresse répétée garde son numéro) */
type Codes = Map<string, { n: number; site: string; notes: number[] }>

/** Un QR code en SVG, net à toute taille */
function QR({ url }: { url: string }) {
  const d = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const n = qr.getModuleCount()
    let chemin = ''
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.isDark(i, j)) chemin += `M${j},${i}h1v1h-1z`
    return { chemin, n }
  }, [url])
  return (
    <svg viewBox={`-1 -1 ${d.n + 2} ${d.n + 2}`} shape-rendering="crispEdges" aria-hidden="true">
      <path d={d.chemin} fill="currentColor" />
    </svg>
  )
}

function M({ m, codes }: { m: Morceau; codes?: Codes }) {
  if (typeof m === 'string') return <>{m}</>
  // un renvoi à une note déjà appelée n'a pas d'ancre : le retour depuis la note mène au premier appel
  if ('appel' in m) return <sup class="rc-appel"><a id={m.renvoi ? undefined : `rc-a${m.appel}`} href={`#rc-n${m.appel}`} onClick={(e) => aller(e, `rc-n${m.appel}`)}>{m.appel}</a></sup>
  if ('sosa' in m) {
    return m.ancre
      ? <a class="rc-sosa" href={`#rc-s${m.sosa}`} onClick={(e) => aller(e, `rc-s${m.sosa}`)} title="Aller à sa notice">[{m.sosa}]</a>
      : <span class="rc-sosa">[{m.sosa}]</span>
  }
  if ('url' in m) {
    const c = codes?.get(m.url)
    return <><a href={m.url} target="_blank" rel="noopener noreferrer">{m.t}</a>{c && <span class="rc-qr-repere"> (QR {c.n})</span>}</>
  }
  if ('evt' in m) return <a href={lienEvenement(m.evt)} class="rc-evt" title="Toutes les personnes de l’arbre qui l’ont connu"><IconeEvenement type={m.type} />{m.t}</a>
  return <a href={lien(m.id)} class={m.gras ? 'rc-gras' : undefined} title="Faire le récit de cette personne">{m.t}</a>
}

const Texte = ({ morceaux, codes }: { morceaux: Phrase; codes?: Codes }) => <>{morceaux.map((m, i) => <M key={i} m={m} codes={codes} />)}</>

/** Une personne du petit arbre ; vide, une place grisée pour garder la forme de l'arbre */
function CaseArbre({ c }: { c: Case | null }) {
  if (!c) return <span class="rc-ar-case inconnu" aria-hidden="true">?</span>
  return (
    <a href={lien(c.id)} class={`rc-ar-case ${c.sexe === 'F' ? 'f' : c.sexe === 'M' ? 'h' : ''}${c.ligne ? ' rc-ar-ligne' : ''}`} title="Faire le récit de cette personne">
      <span class="rc-ar-nom" title={c.t}>{c.prenom}{c.nom && <span class="rc-ar-famille">{c.nom}</span>}</span>
      {(c.annees || c.sosa) && <span class="rc-ar-annees">{c.annees}{c.sosa && <span class="rc-ar-sosa">{c.sosa}</span>}</span>}
    </a>
  )
}

/** Les parents de chacun, le couple, les enfants : des traits comme dans les arbres imprimés */
function MiniArbre({ a }: { a: PetitArbre }) {
  const solo = a.couple.length < 2
  const paire = (l: (Case | null)[]) => {
    const n = l.filter(Boolean).length
    return (
      <div class={'rc-ar-paire' + (n === 0 ? ' vide' : '')}>
        {n > 0 && l.map((c, i) => <CaseArbre key={i} c={c} />)}
      </div>
    )
  }
  const enfants = a.enfants.length + (a.reste ? 1 : 0)
  return (
    <figure class={'rc-arbre' + (solo ? ' solo' : '')} aria-label="Petit arbre de la famille">
      {paire(a.haut[0])}
      {!solo && paire(a.haut[1])}
      <div class={'rc-ar-couple' + (enfants ? ' avec-enfants' : '')}>
        {a.couple.map((c, i) => <CaseArbre key={i} c={c} />)}
      </div>
      {enfants > 0 && (
        <div class={'rc-ar-enfants' + (enfants === 1 ? ' seul' : '') + (enfants > 6 ? ' serres' : '')}>
          {a.enfants.map((c) => <div key={c.id} class="rc-ar-enfant"><CaseArbre c={c} /></div>)}
          {a.reste > 0 && <div class="rc-ar-enfant"><span class="rc-ar-case reste">+ {a.reste}</span></div>}
        </div>
      )}
    </figure>
  )
}

function Blocs({ blocs, qui }: { blocs: Bloc[]; qui: Qui }) {
  return (
    <>
      {blocs.map((b, i) => b.type === 'p'
        ? (
          <p key={i} class={b.italique ? 'rc-lit' : undefined}>
            {b.ancres?.map((s) => <span key={s} id={`rc-s${s}`} class="rc-ancre" />)}
            {qui && b.figures && <span class="rc-figures">{b.figures.map((f) => <Photo key={f} ind={qui(f)} legende />)}</span>}
            <Texte morceaux={b.texte} />
          </p>
        )
        : b.type === 'arbre' ? <MiniArbre key={i} a={b.arbre} />
        : (
          <div key={i} class="rc-liste">
            {b.items.map((it, j) => (
              <div key={j} class="rc-item">
                <span class="rc-marque">{it.marque}</span>
                <div class="rc-corps"><Blocs blocs={it.blocs} qui={qui} /></div>
              </div>
            ))}
          </div>
        ))}
    </>
  )
}

export function Recit({ d, id }: { d: Donnees; id?: string }) {
  const [reglages, setReglagesBrut] = useState<Reglages>(() => ({ asc: 3, desc: 2, sources: false, evenements: false, arbres: false, ...lire<Partial<Reglages>>('recit', {}) }))
  const setReglages = (r: Partial<Reglages>) => { const n = { ...reglages, ...r }; setReglagesBrut(n); ecrire('recit', n) }
  const [copie, setCopie] = useState(false)
  const photos = usePhotos(d)
  const cible = id && d.arbre.individus.has(id) ? id : d.racine
  const ev = useEvenements(d, reglages.evenements)
  const parPersonne = ev?.etat === 'pret' ? ev.index.parPersonne : undefined
  const r = useMemo(
    () => recit(d, cible, reglages.asc, reglages.desc, { sources: reglages.sources, evenements: parPersonne, arbres: reglages.arbres }),
    [d, cible, reglages.asc, reglages.desc, reglages.sources, parPersonne, reglages.arbres],
  )
  // Les QR codes imprimés, numérotés dans l'ordre du récit, réunis sur une dernière page
  const codes = useMemo(() => {
    const l: Codes = new Map()
    for (const pt of r?.parties ?? []) {
      for (const n of pt.notes) {
        for (const m of n.texte) {
          if (typeof m !== 'object' || !('url' in m)) continue
          const c = l.get(m.url) ?? { n: l.size + 1, site: m.t, notes: [] }
          if (!c.notes.includes(n.n)) c.notes.push(n.n)
          l.set(m.url, c)
        }
      }
    }
    return l
  }, [r])
  const mots = useMemo(() => (r ? texteBrut(r).split(/\s+/).length : 0), [r])

  const copier = () => {
    if (!r) return
    navigator.clipboard?.writeText(texteBrut(r)).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1500) }).catch(() => {})
  }
  const option = (cle: 'arbres' | 'sources' | 'evenements', texte: string) => (
    <label class={'rc-option' + (reglages[cle] ? ' coche' : '')}>
      <input type="checkbox" checked={reglages[cle]} onChange={(e) => setReglages({ [cle]: e.currentTarget.checked })} /> {texte}
    </label>
  )
  // « avec deux générations de descendants et trois générations d’ancêtres »
  const sousTitre = [
    reglages.desc === 1 ? 'ses enfants' : reglages.desc ? `${NOMBRES[reglages.desc]} générations de descendants` : '',
    reglages.asc === 1 ? 'ses parents' : reglages.asc ? `${NOMBRES[reglages.asc]} générations d’ancêtres` : '',
  ].filter(Boolean)

  return (
    <section class="ecran recit">
      <header class="titre-ecran">
        <h1 data-titre={`Récit de ${nomComplet(d.arbre.individus.get(cible)!)}`}>Récit</h1>
        <p class="sous-titre">Une notice à la manière des livres de famille : la personne et ses descendants, puis ses ancêtres génération par génération. Chaque nom mène au récit de cette personne ; chaque numéro entre crochets, à sa notice.</p>
      </header>

      <section class="panneau rc-reglages">
        <div class="rc-grille">
          <div class="rc-champ rc-personne">
            <span class="rc-etiquette">Personne</span>
            <ChoixPersonne d={d} valeur={cible} choisir={(n) => { location.hash = lien(n) }} />
          </div>
          <div class="rc-champ">
            <label class="rc-etiquette" for="recit-asc">Ancêtres</label>
            <select id="recit-asc" value={reglages.asc} onChange={(e) => setReglages({ asc: Number(e.currentTarget.value) })}>
              {Array.from({ length: MAX_ASCENDANTS + 1 }, (_, n) => <option key={n} value={n}>{libelle(GENERATIONS_ASC, n)}</option>)}
            </select>
          </div>
          <div class="rc-champ">
            <label class="rc-etiquette" for="recit-desc">Descendants</label>
            <select id="recit-desc" value={reglages.desc} onChange={(e) => setReglages({ desc: Number(e.currentTarget.value) })}>
              {Array.from({ length: MAX_DESCENDANTS + 1 }, (_, n) => <option key={n} value={n}>{libelle(GENERATIONS_DESC, n)}</option>)}
            </select>
          </div>
        </div>
        <div class="rc-champ">
          <span class="rc-etiquette">Ajouter au récit</span>
          <div class="rc-options">
            {option('arbres', 'Petits arbres')}
            {option('sources', 'Sources dans les notes')}
            {option('evenements', 'Événements historiques')}
            <CasePhotos p={photos} classe={'rc-option' + (photos.afficher ? ' coche' : '')} />
          </div>
        </div>
        <div class="rc-pied">
          <span class="aide">
            {r && <>{nombre(mots)} mots · {nombre(r.ancetres)} ancêtres et {nombre(r.descendants)} descendants évoqués</>}
            {ev?.etat === 'attente' && <> · recherche des événements…</>}
            {ev?.etat === 'erreur' && <> · la liste des événements n’a pas pu être chargée</>}
            {ev?.etat === 'pret' && <> · <a href="#/evenements">tous les événements de l’arbre</a></>}
          </span>
          <span class="rc-actions">
            <button type="button" class="bouton discret" onClick={copier}>{copie ? 'Copié ✓' : 'Copier le texte'}</button>
            <button type="button" class="bouton discret" onClick={() => window.print()}>Imprimer</button>
          </span>
        </div>
      </section>

      {r ? (
        <article class="panneau rc-texte">
          {r.parties.map((pt, i) => (
            <section key={i} class="rc-partie">
              {i === 0
                ? (
                  <header class="rc-entete">
                    <p class="rc-surtitre">Récit familial</p>
                    <h2 class="rc-titre">{pt.titre}</h2>
                    {sousTitre.length > 0 && <p class="rc-soustitre">avec {sousTitre.join(' et ')}</p>}
                  </header>
                )
                : (
                  // le titre et le petit arbre qui le suit restent ensemble, avec au moins deux lignes de texte (à l'impression)
                  <div class="rc-debut">
                    <h3><span class="rc-num">{pt.numero}</span>{pt.titre}</h3>
                    {pt.blocs[0]?.type === 'arbre' && <MiniArbre a={pt.blocs[0].arbre} />}
                  </div>
                )}
              <Blocs blocs={i > 0 && pt.blocs[0]?.type === 'arbre' ? pt.blocs.slice(1) : pt.blocs} qui={photos.afficher ? (x) => d.arbre.individus.get(x) : undefined} />
              {pt.notes.length > 0 && (
                <div class="rc-notes">
                  {pt.notes.map((n) => (
                    <p key={n.n} id={`rc-n${n.n}`}>
                      <a class="rc-num-note" href={`#rc-a${n.n}`} onClick={(e) => aller(e, `rc-a${n.n}`)}>{n.n}</a>
                      <span><Texte morceaux={n.texte} codes={codes} /></span>
                    </p>
                  ))}
                </div>
              )}
            </section>
          ))}
          {codes.size > 0 && (
            <section class="rc-qr">
              <header class="rc-debut">
                <h3><span class="rc-num">Annexe</span>Sources en ligne</h3>
                <p class="rc-qr-aide">Visez un code avec l’appareil photo d’un téléphone pour ouvrir la source.</p>
              </header>
              <div class="rc-qr-grille">
                {[...codes].map(([url, c]) => (
                  <figure key={url}>
                    <QR url={url} />
                    <figcaption>
                      <span class="rc-qr-num">{c.n}</span>
                      <span class="rc-qr-site">{c.site}</span>
                      <span class="rc-qr-notes">note{c.notes.length > 1 ? 's' : ''} {c.notes.join(', ')}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </article>
      ) : <p class="aucun">Personne à raconter.</p>}
    </section>
  )
}

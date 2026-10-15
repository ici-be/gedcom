// Récit : une notice généalogique sur une personne choisie, ses descendants et ses ancêtres, sur autant de
// générations qu'on veut dans chaque sens, avec notes de bas de partie. Chaque nom cité mène au récit de cette personne.

import '@fontsource/fraunces/latin-400.css'
import '@fontsource/fraunces/latin-400-italic.css'
import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { MAX_ASCENDANTS, MAX_DESCENDANTS, recit, texteBrut, type Bloc, type Morceau, type Phrase } from '../lib/recit'
import { nombre } from '../lib/format'
import { ecrire, lire } from '../lib/stockage'
import { ChoixPersonne } from './commun'

interface Reglages { asc: number; desc: number; sources: boolean }

const lien = (id: string) => '#/recit/' + encodeURIComponent(id)
const GENERATIONS_ASC = ['aucune', 'les parents', 'jusqu’aux grands-parents', 'jusqu’aux arrière-grands-parents']
const GENERATIONS_DESC = ['aucune', 'les enfants', 'jusqu’aux petits-enfants', 'jusqu’aux arrière-petits-enfants']
const libelle = (l: string[], n: number) => l[n] ?? `${n} générations`

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

function M({ m }: { m: Morceau }) {
  if (typeof m === 'string') return <>{m}</>
  if ('appel' in m) return <sup class="rc-appel"><a id={`rc-a${m.appel}`} href={`#rc-n${m.appel}`} onClick={(e) => aller(e, `rc-n${m.appel}`)}>{m.appel}</a></sup>
  if ('sosa' in m) {
    return m.ancre
      ? <a class="rc-sosa" href={`#rc-s${m.sosa}`} onClick={(e) => aller(e, `rc-s${m.sosa}`)} title="Aller à sa notice">[{m.sosa}]</a>
      : <span class="rc-sosa">[{m.sosa}]</span>
  }
  if ('url' in m) return <a href={m.url} target="_blank" rel="noopener noreferrer">{m.t}</a>
  return <a href={lien(m.id)} class={m.gras ? 'rc-gras' : undefined} title="Faire le récit de cette personne">{m.t}</a>
}

const Texte = ({ morceaux }: { morceaux: Phrase }) => <>{morceaux.map((m, i) => <M key={i} m={m} />)}</>

function Blocs({ blocs }: { blocs: Bloc[] }) {
  return (
    <>
      {blocs.map((b, i) => b.type === 'p'
        ? (
          <p key={i} class={b.italique ? 'rc-lit' : undefined}>
            {b.ancres?.map((s) => <span key={s} id={`rc-s${s}`} class="rc-ancre" />)}
            <Texte morceaux={b.texte} />
          </p>
        )
        : (
          <div key={i} class="rc-liste">
            {b.items.map((it, j) => (
              <div key={j} class="rc-item">
                <span class="rc-marque">{it.marque}</span>
                <div class="rc-corps"><Blocs blocs={it.blocs} /></div>
              </div>
            ))}
          </div>
        ))}
    </>
  )
}

export function Recit({ d, id }: { d: Donnees; id?: string }) {
  const [reglages, setReglagesBrut] = useState<Reglages>(() => ({ asc: 3, desc: 2, sources: false, ...lire<Partial<Reglages>>('recit', {}) }))
  const setReglages = (r: Partial<Reglages>) => { const n = { ...reglages, ...r }; setReglagesBrut(n); ecrire('recit', n) }
  const [copie, setCopie] = useState(false)
  const cible = id && d.arbre.individus.has(id) ? id : d.racine
  const r = useMemo(() => recit(d, cible, reglages.asc, reglages.desc, { sources: reglages.sources }), [d, cible, reglages.asc, reglages.desc, reglages.sources])
  const mots = useMemo(() => (r ? texteBrut(r).split(/\s+/).length : 0), [r])

  const copier = () => {
    if (!r) return
    navigator.clipboard?.writeText(texteBrut(r)).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1500) }).catch(() => {})
  }

  return (
    <section class="ecran recit">
      <header class="titre-ecran">
        <h1>Récit</h1>
        <p class="sous-titre">Une notice à la manière des livres de famille : la personne et ses descendants, puis ses ancêtres génération par génération, avec témoins, domiciles et registres en notes. Chaque nom mène au récit de cette personne ; chaque numéro entre crochets, à sa notice.</p>
      </header>

      <section class="panneau rc-reglages">
        <div class="rc-ligne">
          <span class="rc-etiquette">Personne</span>
          <ChoixPersonne d={d} valeur={cible} choisir={(n) => { location.hash = lien(n) }} />
        </div>
        <div class="rc-ligne">
          <label class="rc-etiquette" for="recit-asc">Ancêtres</label>
          <select id="recit-asc" value={reglages.asc} onChange={(e) => setReglages({ asc: Number(e.currentTarget.value) })}>
            {Array.from({ length: MAX_ASCENDANTS + 1 }, (_, n) => <option key={n} value={n}>{libelle(GENERATIONS_ASC, n)}</option>)}
          </select>
          <label class="rc-etiquette" for="recit-desc">Descendants</label>
          <select id="recit-desc" value={reglages.desc} onChange={(e) => setReglages({ desc: Number(e.currentTarget.value) })}>
            {Array.from({ length: MAX_DESCENDANTS + 1 }, (_, n) => <option key={n} value={n}>{libelle(GENERATIONS_DESC, n)}</option>)}
          </select>
          <label class="rc-case"><input type="checkbox" checked={reglages.sources} onChange={(e) => setReglages({ sources: e.currentTarget.checked })} /> Sources dans les notes</label>
        </div>
        <div class="rc-ligne">
          <button type="button" class="bouton" onClick={copier}>{copie ? 'Copié' : 'Copier le texte'}</button>
          <button type="button" class="bouton" onClick={() => window.print()}>Imprimer</button>
          {r && <span class="aide">{nombre(mots)} mots · {nombre(r.ancetres)} ancêtres et {nombre(r.descendants)} descendants évoqués</span>}
        </div>
      </section>

      {r ? (
        <article class="panneau rc-texte">
          {r.parties.map((pt, i) => (
            <section key={i}>
              {i === 0 ? <h2 class="rc-titre">{pt.titre}</h2> : <h3><span class="rc-num">{pt.numero}.</span> {pt.titre}</h3>}
              <Blocs blocs={pt.blocs} />
              {pt.notes.length > 0 && (
                <div class="rc-notes">
                  {pt.notes.map((n) => (
                    <p key={n.n} id={`rc-n${n.n}`}>
                      <a class="rc-num-note" href={`#rc-a${n.n}`} onClick={(e) => aller(e, `rc-a${n.n}`)}>{n.n}</a>
                      <span><Texte morceaux={n.texte} /></span>
                    </p>
                  ))}
                </div>
              )}
            </section>
          ))}
        </article>
      ) : <p class="aucun">Personne à raconter.</p>}
    </section>
  )
}

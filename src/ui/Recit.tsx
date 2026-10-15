// Récit : un texte suivi sur une personne choisie, ses ancêtres et ses descendants, sur autant de générations
// qu'on veut dans chaque sens. Chaque nom cité mène au récit de cette personne.

import '@fontsource/fraunces/latin-400.css'
import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { MAX_ASCENDANTS, MAX_DESCENDANTS, recit, texteBrut, type Phrase } from '../lib/recit'
import { nombre } from '../lib/format'
import { ecrire, lire } from '../lib/stockage'
import { ChoixPersonne } from './commun'

interface Reglages { asc: number; desc: number }

const lien = (id: string) => '#/recit/' + encodeURIComponent(id)
const GENERATIONS_ASC = ['aucune', 'les parents', 'jusqu’aux grands-parents', 'jusqu’aux arrière-grands-parents']
const GENERATIONS_DESC = ['aucune', 'les enfants', 'jusqu’aux petits-enfants', 'jusqu’aux arrière-petits-enfants']
const libelle = (l: string[], n: number) => l[n] ?? `${n} générations`

function Texte({ morceaux }: { morceaux: Phrase }) {
  return (
    <p>
      {morceaux.map((m, i) => (typeof m === 'string' ? m : <a key={i} href={lien(m.id)} title="Faire le récit de cette personne">{m.t}</a>))}
    </p>
  )
}

export function Recit({ d, id }: { d: Donnees; id?: string }) {
  const [reglages, setReglagesBrut] = useState<Reglages>(() => lire('recit', { asc: 3, desc: 2 }))
  const setReglages = (r: Partial<Reglages>) => { const n = { ...reglages, ...r }; setReglagesBrut(n); ecrire('recit', n) }
  const [copie, setCopie] = useState(false)
  const cible = id && d.arbre.individus.has(id) ? id : d.racine
  const r = useMemo(() => recit(d, cible, reglages.asc, reglages.desc), [d, cible, reglages.asc, reglages.desc])
  const mots = useMemo(() => (r ? texteBrut(r).split(/\s+/).length : 0), [r])

  const copier = () => {
    if (!r) return
    navigator.clipboard?.writeText(texteBrut(r)).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1500) }).catch(() => {})
  }

  return (
    <section class="ecran recit">
      <header class="titre-ecran">
        <h1>Récit</h1>
        <p class="sous-titre">Un texte suivi, tiré des faits de l’arbre : naissances et baptêmes, métiers, mariages, enfants, décès, lieux et âges. Chaque nom mène au récit de cette personne.</p>
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
              {i === 0 ? <h2 class="rc-titre">{pt.titre}</h2> : <h3>{pt.titre}</h3>}
              {pt.paragraphes.map((ph, j) => <Texte key={j} morceaux={ph} />)}
            </section>
          ))}
        </article>
      ) : <p class="aucun">Personne à raconter.</p>}
    </section>
  )
}

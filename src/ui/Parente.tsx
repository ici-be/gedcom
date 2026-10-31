// Calculateur de parenté : le lien entre deux personnes de l'arbre, avec le chemin par les ancêtres communs
// (ou par les unions), le degré civil et la part de gènes partagée.

import '@fontsource/fraunces/latin-400.css'
import '@fontsource/fraunces/latin-400-italic.css'
import { Fragment } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import type { Individu } from '../lib/gedcom/arbre'
import { parente, pourcentPart, termeAscendant, type Chemin, type Parente as ResultatParente } from '../lib/lien-parente'
import { nomComplet } from '../lib/parente'
import { ChoixPersonne, Annees } from './commun'

const lien = (a: string, b?: string) => '#/parente/' + encodeURIComponent(a) + (b ? '/' + encodeURIComponent(b) : '')

const VOYELLE = /^[aeiouyâàéèêëîïôöûùhœæ]/i
/** « le cousin », « la cousine », « l’oncle » */
const defini = (terme: string, f: boolean) => (VOYELLE.test(terme) ? 'l’' : f ? 'la ' : 'le ') + terme
/** « du cousin », « de la cousine », « de l’oncle » */
const dudes = (terme: string, f: boolean) => (VOYELLE.test(terme) ? 'de l’' : f ? 'de la ' : 'du ') + terme
const generations = (n: number) => `${n} génération${n > 1 ? 's' : ''}`
const cle = (s: Individu['sexe']) => (s === 'F' ? 'f' : s === 'M' ? 'h' : '')

function Avatar({ ind, grand }: { ind?: Individu; grand?: boolean }) {
  const initiales = ind ? ((ind.prenom[0] ?? '') + (ind.nom[0] ?? '')).toUpperCase() || '?' : '＋'
  return <span class={`pa-avatar ${ind ? cle(ind.sexe) : 'vide'}${grand ? ' grand' : ''}`} aria-hidden="true">{initiales}</span>
}

function Selecteur({ d, role, valeur, choisir }: { d: Donnees; role: string; valeur?: string; choisir: (id: string) => void }) {
  const ind = valeur ? d.arbre.individus.get(valeur) : undefined
  return (
    <div class={`pa-selecteur ${ind ? cle(ind.sexe) : ''}`}>
      <span class="pa-role">{role}</span>
      <div class="pa-identite">
        <Avatar ind={ind} />
        <div class="pa-nom">
          {ind ? <><strong>{ind.prenom || '?'} <span>{ind.nom || '?'}</span></strong><Annees ind={ind} /></> : <span class="vide">Choisissez une personne</span>}
        </div>
      </div>
      <ChoixPersonne d={d} valeur={valeur ?? ''} choisir={choisir} />
    </div>
  )
}

/** Une personne sur le chemin */
function Noeud({ d, id, role, extra }: { d: Donnees; id: string; role?: string; extra?: 'depart' | 'arrivee' }) {
  const ind = d.arbre.individus.get(id)
  if (!ind) return null
  return (
    <a class={`pa-noeud ${cle(ind.sexe)} ${extra ?? ''}`} href={'#/chronologie/' + encodeURIComponent(id)} title="Voir sa chronologie">
      <Avatar ind={ind} />
      <span class="pa-noeud-texte">
        <strong>{ind.prenom || '?'} <span>{ind.nom || '?'}</span></strong>
        <Annees ind={ind} />
      </span>
      {role && <em class="pa-chip">{role}</em>}
    </a>
  )
}

/** Le « V » : du sujet jusqu'aux ancêtres communs, puis jusqu'à l'autre personne, ligne par ligne comme les générations */
function Schema({ d, c, a, b }: { d: Donnees; c: Chemin; a: Individu; b: Individu }) {
  const deux = c.na > 0 && c.nb > 0
  const colonne = (branche: string[], n: number, nom: 'g' | 'd') => {
    const cases = []
    for (let r = 1; r <= n; r++) {
      // le nœud à r générations sous les ancêtres communs : à n - r générations de l'origine
      const k = n - r
      const id = branche[k]
      const sexe = d.arbre.individus.get(id)?.sexe ?? '?'
      const role = k === 0 ? (nom === 'g' ? 'Départ' : 'Arrivée') : termeAscendant(k, sexe)
      cases.push(<div key={r} class="pa-case"><Noeud d={d} id={id} role={role} extra={k === 0 ? (nom === 'g' ? 'depart' : 'arrivee') : undefined} /></div>)
    }
    return cases
  }
  const hautEstDepart = c.na === 0 && c.communs[0] === a.id
  const hautEstArrivee = c.nb === 0 && c.communs[0] === b.id
  return (
    <div class={'pa-v' + (deux ? ' pa-deux' : '')} role="group" aria-label="Chemin de parenté">
      <div class="pa-communs">
        <span class="pa-legende">{hautEstDepart || hautEstArrivee ? (hautEstDepart ? 'Départ' : 'Arrivée') : c.communs.length > 1 ? 'Ancêtres communs' : 'Ancêtre commun'}</span>
        <div class="pa-couple">
          {c.communs.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <span class="pa-anneaux" aria-label="mariés" title="Époux">⚭</span>}
              <Noeud d={d} id={id} extra={hautEstDepart ? 'depart' : hautEstArrivee ? 'arrivee' : undefined} />
            </Fragment>
          ))}
        </div>
      </div>
      {deux && <div class="pa-pont" aria-hidden="true"><span class="haut" /><span class="g" /><span class="d" /></div>}
      {(c.na > 0 || c.nb > 0) && (
        <div class={'pa-branches' + (deux ? '' : ' une')}>
          {c.na > 0 && <div class="pa-col g">{colonne(c.montee, c.na, 'g')}</div>}
          {c.nb > 0 && <div class="pa-col d">{colonne(c.descente, c.nb, 'd')}</div>}
        </div>
      )}
    </div>
  )
}

export function Parente({ d, a, b }: { d: Donnees; a?: string; b?: string }) {
  const idA = a && d.arbre.individus.has(a) ? a : d.racine
  const idB = b && d.arbre.individus.has(b) ? b : undefined
  const indA = d.arbre.individus.get(idA)!
  const indB = idB ? d.arbre.individus.get(idB) : undefined
  const [numero, setNumero] = useState(0)
  const res: ResultatParente | undefined = useMemo(() => (indB ? parente(d.arbre, indA, indB) : undefined), [d, indA, indB])
  const choisirA = (id: string) => { setNumero(0); location.hash = lien(id, idB) }
  const choisirB = (id: string) => { setNumero(0); location.hash = lien(idA, id) }
  const inverser = () => { if (idB) { setNumero(0); location.hash = lien(idB, idA) } }
  const auHasard = () => {
    const ids = [...d.arbre.individus.keys()].filter((x) => x !== idA)
    if (!ids.length) return
    setNumero(0)
    location.hash = lien(idA, ids[Math.floor(Math.random() * ids.length)])
  }

  const chemin = res?.type === 'sang' ? res.chemins[Math.min(numero, res.chemins.length - 1)] : undefined
  const nomA = indA.prenom || indA.nom, nomB = indB ? indB.prenom || indB.nom : ''

  let phrase: preact.ComponentChild = null
  let inverse: preact.ComponentChild = null
  if (res && indB) {
    const fa = indA.sexe === 'F', fb = indB.sexe === 'F'
    if (res.type === 'identique') phrase = <>Ce sont deux fois la même personne.</>
    else if (res.type === 'aucun') phrase = <>Aucun lien trouvé entre <b>{nomB}</b> et <b>{nomA}</b> dans l’arbre.</>
    else if (res.type === 'alliance') {
      phrase = <><b>{nomB}</b> est {defini(res.terme, fb)} de <b>{nomA}</b>.</>
      inverse = <>Réciproquement, <b>{nomA}</b> est {defini(res.inverse, fa)} de <b>{nomB}</b>.</>
    } else {
      const t = chemin?.terme ?? res.terme
      if (t.pivot) phrase = <><b>{nomB}</b> est {defini(t.terme, fb)} {dudes(t.pivot.role, !!t.pivot.f)} de <b>{nomA}</b>.</>
      else phrase = <><b>{nomB}</b> est {defini(t.terme, fb)} de <b>{nomA}</b>.</>
      inverse = res.inverse.pivot ? null : <>Réciproquement, <b>{nomA}</b> est {defini(res.inverse.terme, fa)} de <b>{nomB}</b>.</>
    }
  }

  return (
    <section class="ecran parente-page">
      <header class="titre-ecran">
        <h1>Calculateur de parenté</h1>
        <p class="sous-titre">Choisissez deux personnes de l’arbre : le lien qui les unit, le chemin par leurs ancêtres communs, le degré et la part de gènes partagée.</p>
      </header>

      <div class="pa-duo">
        <Selecteur d={d} role="De" valeur={idA} choisir={choisirA} />
        <button type="button" class="pa-inverser" onClick={inverser} disabled={!idB} aria-label="Inverser les deux personnes" title="Inverser">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7" /></svg>
        </button>
        <Selecteur d={d} role="À" valeur={idB} choisir={choisirB} />
      </div>

      {!indB && (
        <div class="pa-accueil">
          <svg viewBox="0 0 120 80" aria-hidden="true">
            <path d="M60 14v14M60 28H28v14M60 28h32v14M28 42v14M92 42v14" />
            <circle cx="60" cy="10" r="8" /><circle cx="28" cy="46" r="8" /><circle cx="92" cy="46" r="8" /><circle cx="28" cy="70" r="8" /><circle cx="92" cy="70" r="8" />
          </svg>
          <p>Cherchez une seconde personne ci-dessus pour voir comment vous êtes parents, ou</p>
          <button type="button" class="bouton" onClick={auHasard}>Essayer au hasard</button>
        </div>
      )}

      {res && indB && (
        <>
          <section class={'pa-verdict ' + res.type}>
            <p class="pa-phrase">{phrase}</p>
            {res.type === 'sang' && chemin?.terme.alias && <p class="pa-alias">Aussi appelé{indB.sexe === 'F' ? 'e' : ''} : {chemin.terme.alias}</p>}
            {inverse && <p class="pa-inverse">{inverse}</p>}
            {res.type === 'sang' && (
              <ul class="pa-chiffres">
                <li><span>Degré civil</span><strong>{res.degre}<sup>e</sup></strong></li>
                <li title="Estimation : somme, sur chaque chemin, de ½ à la puissance du nombre de générations traversées"><span>Gènes en commun</span><strong>≈ {pourcentPart(res.part)}</strong></li>
                <li><span>Ancêtre{chemin && chemin.communs.length > 1 ? 's' : ''} commun{chemin && chemin.communs.length > 1 ? 's' : ''}</span><strong>{chemin ? generations(Math.max(chemin.na, chemin.nb)) : ''}</strong></li>
                {res.chemins.length > 1 && <li><span>Chemins</span><strong>{res.chemins.length}</strong></li>}
              </ul>
            )}
          </section>

          {res.type === 'sang' && chemin && (
            <section class="panneau pa-chemin">
              <div class="pa-chemin-entete">
                <h2>Le chemin</h2>
                {res.chemins.length > 1 && (
                  <div class="segments petit" role="tablist" aria-label="Chemins">
                    {res.chemins.map((c, i) => (
                      <button key={i} type="button" role="tab" aria-selected={i === numero} class={i === numero ? 'actif' : ''} onClick={() => setNumero(i)}>
                        {i + 1}<span class="pa-mini"> · {c.na + c.nb} pas</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {res.chemins.length > 1 && <p class="aide">Ces deux personnes sont apparentées de plusieurs façons (implexe) : la parenté est renforcée d’autant. Le premier chemin est le plus court.</p>}
              <Schema d={d} c={chemin} a={indA} b={indB} />
            </section>
          )}

          {res.type === 'alliance' && (
            <section class="panneau pa-chemin">
              <h2>Le chemin par alliance</h2>
              <p class="aide">Pas de sang commun trouvé : le lien passe par une union. Chaque ligne se lit « … est … de ».</p>
              <ol class="pa-chaine">
                <li><Noeud d={d} id={idA} extra="depart" /></li>
                {res.etapes.map((e, i) => (
                  <Fragment key={i}>
                    <li class="pa-etape"><span>{e.lien}</span></li>
                    <li><Noeud d={d} id={e.vers} extra={e.vers === idB ? 'arrivee' : undefined} /></li>
                  </Fragment>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
      <div class="pa-pied">
        {indB && <button type="button" class="bouton discret" onClick={auHasard}>Autre personne au hasard</button>}
        {indB && <a class="bouton discret" href={'#/chronologie/' + encodeURIComponent(indB.id)}>Chronologie de {indB.prenom || nomComplet(indB)}</a>}
      </div>
    </section>
  )
}


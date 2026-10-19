// Lignée : une ligne d'ancêtres en frise verticale, du plus lointain jusqu'à la personne de départ,
// avec pour chacun naissance, décès, métiers, l'union dont est issu le suivant, et de quoi remonter plus haut.

import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import type { Evenement, Individu } from '../lib/gedcom/arbre'
import { lignee, type Maillon, type Suite } from '../lib/lignee'
import { texteParent } from '../lib/filiation'
import { decouperLieu, nomSiecle, numeroSiecle } from '../lib/communes'
import { decouperMetiers } from '../lib/metiers'
import { nombre } from '../lib/format'
import { nomComplet } from '../lib/parente'
import { marie, type Fait } from '../lib/suivi'
import { CasePhotos, normaliser, Pastille, Photo, Sources, usePhotos } from './commun'
import { lienMetier } from './Metiers'

const lien = (cle: string) => '#/lignee/' + cle
const prenom = (i?: Individu) => i?.prenom.split(/\s+/)[0] ?? ''
const court = (i?: Individu) => (i ? [prenom(i), i.nom].filter(Boolean).join(' ') || '?' : '?')
const accord = (i: Individu | undefined, m: string, f: string) => (i?.sexe === 'F' ? f : m)

function Nom({ d, id, complet }: { d: Donnees; id: string; complet?: boolean }) {
  const ind = d.arbre.individus.get(id)
  if (!ind) return <span class="vide">?</span>
  const texte = complet ? nomComplet(ind) : court(ind)
  const url = d.lien(ind)
  return url
    ? <a class="nom" href={url} target="_blank" rel="noopener noreferrer" title={d.homonymes.has(id) ? 'Homonymes : ouvre la recherche en ligne' : 'Ouvrir la fiche en ligne'}>{texte}</a>
    : <span class="nom">{texte}</span>
}

function Vie({ d, id }: { d: Donnees; id: string }) {
  const s = d.suivis.get(id)
  const n = s?.naissance.evenement?.date?.texte
  const m = s?.deces.evenement?.date?.texte
  if (!n && !m) return null
  return <span class="annees">{!n ? '† ' + m : m ? `${n} – ${m}` : n}</span>
}

function Lieu({ lieu }: { lieu?: string }) {
  if (!lieu) return null
  return <a class="lieu" href={'#/lieux/' + encodeURIComponent(lieu)} title={lieu}>{decouperLieu(lieu).nom}</a>
}

/** « ° 3 mars 1702, Ath » avec l'état de la source */
function Ligne({ signe, titre, f, e, apres }: { signe: string; titre: string; f?: Fait; e?: Evenement; apres?: string }) {
  if (!e || (!e.date && !e.lieu && !e.avere)) return null
  return (
    <div class="lg-fait">
      {f && <Pastille etat={f.etat} introuvable={f.introuvable} />}
      <span class="lg-signe" title={titre} aria-label={titre}>{signe}</span>
      <span>
        {e.date?.texte || (e.lieu ? '' : 'date inconnue')}
        {e.date?.texte && e.lieu ? ', ' : ''}<Lieu lieu={e.lieu} />
        {apres && <span class="vide"> · {apres}</span>}
        {e.sources.length > 0 && <> <Sources sources={e.sources} /></>}
      </span>
    </div>
  )
}

function Metiers({ d, ind }: { d: Donnees; ind: Individu }) {
  const libelles = [...new Set(ind.metiers.flatMap(decouperMetiers))]
  if (!libelles.length) return null
  return (
    <div class="lg-metiers">
      {libelles.slice(0, 6).map((l) => {
        const cle = d.metiers.cleDe(l)
        return cle ? <a key={l} class="etiquette" href={lienMetier(cle)}>{l}</a> : <span key={l} class="etiquette">{l}</span>
      })}
    </div>
  )
}

function Carte({ d, m, racine, photo }: { d: Donnees; m: Maillon; racine?: boolean; photo: boolean }) {
  const ind = d.arbre.individus.get(m.id)!
  const s = d.suivis.get(m.id)!
  return (
    <article class={'lg-carte' + (racine ? ' racine' : '')} style={{ '--c': ind.sexe === 'F' ? 'var(--femme)' : 'var(--homme)' }}>
      <div class="lg-infos">
        <div class="lg-gen">{racine ? 'Personne de départ' : <>Génération {m.generation} · Sosa {BigInt(m.sosa).toLocaleString('fr-BE')}</>}</div>
        <h3><Nom d={d} id={m.id} complet /></h3>
        <Ligne signe="°" titre="Naissance" f={s.naissance} e={s.naissance.evenement} />
        <Ligne signe="†" titre="Décès" f={s.deces} e={s.deces.evenement} apres={m.ageDeces !== undefined ? `à ${m.ageDeces} ans` : undefined} />
        <Metiers d={d} ind={ind} />
      </div>
      {photo && <Photo ind={ind} classe="lg-photo" />}
    </article>
  )
}

/** Entre deux générations : l'union d'où naît le suivant */
function Union({ d, m, photo }: { d: Donnees; m: Maillon; photo: boolean }) {
  const ind = d.arbre.individus.get(m.id)
  const enfant = m.enfant ? d.arbre.individus.get(m.enfant) : undefined
  const e = m.union?.evenement
  const autres = m.enfants - 1
  return (
    <div class="lg-union">
      <div class="lg-union-ligne">
        {m.union && e && <Pastille etat={m.union.etat} introuvable={m.union.introuvable} />}
        {marie(m.union) && <span class="lg-signe" title="Mariage" aria-label="Mariage">∞</span>}
        <span>
          {e?.date?.texte ? <>{e.date.texte}{e.lieu ? ', ' : ''}</> : null}<Lieu lieu={e?.lieu} />
          {e && (e.date || e.lieu) ? ' · ' : ''}
          {m.conjoint
            ? <>avec {photo && <Photo ind={d.arbre.individus.get(m.conjoint)} classe="lg-mini" />}<Nom d={d} id={m.conjoint} /> <Vie d={d} id={m.conjoint} />{' '}
              {m.sosaConjoint && <a class="lg-bifurquer" href={lien(m.sosaConjoint)} title={`Suivre la lignée par ${court(d.arbre.individus.get(m.conjoint))}`}>↗ sa lignée</a>}</>
            : <span class="vide">{accord(ind, 'épouse', 'époux')} inconnu{accord(ind, 'e', '')}</span>}
          {e?.sources.length ? <> <Sources sources={e.sources} /></> : null}
        </span>
      </div>
      <div class="lg-union-detail">
        {m.ageEnfant !== undefined && <>{accord(ind, 'Il', 'Elle')} a {m.ageEnfant} ans à la naissance de {prenom(enfant) || 'son enfant'}</>}
        {m.ageEnfant !== undefined && autres > 0 ? ' · ' : ''}
        {autres > 0 && <>{autres === 1 ? 'un autre enfant' : `${autres} autres enfants`} connu{autres > 1 ? 's' : ''}</>}
      </div>
    </div>
  )
}

/** Au-dessus du plus lointain : remonter, ou la raison de l'arrêt */
function Sommet({ d, suite }: { d: Donnees; suite: Suite[] }) {
  return (
    <li class="lg-sommet">
      <div class="lg-temps" />
      <div class="lg-noeud vide" />
      <div class="lg-suite">
        <span class="lg-suite-titre">Plus haut</span>
        {suite.map((x) => (
          <div key={x.cote} class={'lg-suite-ligne ' + x.etat}>
            {x.id
              ? <a href={lien(x.sosa)}>↑ par {x.cote === 'pere' ? 'son père' : 'sa mère'}, {court(d.arbre.individus.get(x.id))}</a>
              : <span>{texteParent(x.etat, x.cote)}</span>}
          </div>
        ))}
      </div>
    </li>
  )
}

/** Choisir un ancêtre pour afficher la lignée qui y mène */
function ChoixAncetre({ d }: { d: Donnees }) {
  const [texte, setTexte] = useState('')
  const resultats = useMemo(() => {
    const mots = normaliser(texte).split(/\s+/).filter(Boolean)
    if (!mots.length) return []
    const r: Individu[] = []
    for (const id of d.ancetres.keys()) {
      const ind = d.arbre.individus.get(id)!
      if (mots.every((m) => normaliser(ind.prenom + ' ' + ind.nom).includes(m))) r.push(ind)
      if (r.length >= 12) break
    }
    return r
  }, [texte, d])
  return (
    <div class="choix-personne lg-choix">
      <input type="search" placeholder="Vers un ancêtre…" value={texte} onInput={(e) => setTexte(e.currentTarget.value)} aria-label="Chercher un ancêtre" />
      {resultats.length > 0 && (
        <ul class="resultats">
          {resultats.map((ind) => {
            const a = d.ancetres.get(ind.id)!
            return (
              <li key={ind.id}>
                <a href={lien(a.sosa)} onClick={() => setTexte('')}>{nomComplet(ind)} <span class="annees">génération {a.generation}</span></a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function Lignee({ d, cle }: { d: Donnees; cle: string }) {
  const l = useMemo(() => lignee(d, cle), [d, cle])
  const longue = useMemo(() => lignee(d, 'longue'), [d])
  const pat = useMemo(() => lignee(d, 'paternelle'), [d])
  const mat = useMemo(() => lignee(d, 'maternelle'), [d])
  const photos = usePhotos(d)
  const onglets: [string, string, number | undefined][] = [
    ['paternelle', 'De père en père', pat?.maillons.length],
    ['maternelle', 'De mère en mère', mat?.maillons.length],
  ]
  if (longue && longue.maillons.length > Math.max(pat?.maillons.length ?? 0, mat?.maillons.length ?? 0)) onglets.push(['longue', 'La plus longue', longue.maillons.length])
  // une place Sosa qui termine l'une des lignées nommées en reprend l'onglet
  const nommees: Record<string, typeof l> = { paternelle: pat, maternelle: mat, longue }
  const cleActive = /^\d+$/.test(cle) ? (onglets.find(([k]) => nommees[k]?.maillons.at(-1)?.sosa === cle)?.[0] ?? cle) : cle

  const entete = (
    <nav class="lg-onglets" aria-label="Lignées">
      <a href="#/ascendance" class="lg-retour">← Ascendance</a>
      <span class="segments">
        {onglets.map(([k, t, n]) => <a key={k} href={lien(k)} class={cleActive === k ? 'actif' : ''} aria-current={cleActive === k ? 'page' : undefined}>{t}{n ? <small> {n}</small> : null}</a>)}
      </span>
      <ChoixAncetre d={d} />
      <CasePhotos p={photos} classe="lg-case" />
      <a href={'#/migrations/siecles/' + cleActive} class="lg-retour">Sur la carte →</a>
    </nav>
  )

  if (!l || l.maillons.length < 2) {
    return (
      <section class="ecran lignee">
        {entete}
        <header class="titre-ecran"><h1>Lignée</h1></header>
        <p class="aucun">{l ? 'Aucun ancêtre connu de ce côté.' : 'Personne ne figure à cette place de l’ascendance.'}</p>
      </section>
    )
  }

  const ind = (id: string) => d.arbre.individus.get(id)!
  const M = l.maillons
  const haut = M[M.length - 1]
  const ancien = ind(haut.id)
  const racine = ind(M[0].id)
  const titre = cleActive === 'paternelle' ? 'Lignée paternelle' : cleActive === 'maternelle' ? 'Lignée maternelle' : cleActive === 'longue' ? 'La plus longue lignée' : `Lignée de ${court(ancien)}`
  const span = haut.naissance !== undefined && M[0].naissance !== undefined ? M[0].naissance - haut.naissance : undefined
  const communes = new Set(l.lieux.map(([x]) => decouperLieu(x).nom.toLowerCase())).size
  const virgule = (v: number) => v.toLocaleString('fr-BE', { maximumFractionDigits: 1 })

  // Du plus ancien au plus récent, avec un repère à chaque changement de siècle
  const lignes = []
  let siecle: number | undefined
  for (let k = M.length - 1; k >= 0; k--) {
    const m = M[k]
    const s = m.naissance !== undefined ? numeroSiecle(m.naissance) : undefined
    if (s !== undefined && s !== siecle) {
      lignes.push(<li key={'s' + k} class="lg-siecle"><span>{nomSiecle(s)}</span></li>)
      siecle = s
    }
    lignes.push(
      <li key={m.id + k} class="lg-maillon">
        <div class="lg-temps">
          {m.naissance !== undefined && <><b>{m.naissance}</b>{m.estimee && <small>estimée</small>}</>}
        </div>
        <div class={'lg-noeud' + (k === 0 ? ' racine' : '')} style={{ '--c': ind(m.id).sexe === 'F' ? 'var(--femme)' : 'var(--homme)' }} />
        <div class="lg-corps">
          <Carte d={d} m={m} racine={k === 0} photo={photos.afficher} />
          {k > 0 && <Union d={d} m={m} photo={photos.afficher} />}
        </div>
      </li>,
    )
  }

  return (
    <section class="ecran lignee">
      {entete}
      <header class="titre-ecran">
        <h1>{titre}</h1>
        <p class="sous-titre">
          De {court(ancien)}{haut.naissance !== undefined ? `, né${ancien.sexe === 'F' ? 'e' : ''} ${haut.estimee ? 'vers' : 'en'} ${haut.naissance}` : ''}
          , à {court(racine)} : {M.length} générations{span && span > 0 ? `, environ ${nombre(span)} ans` : ''}.
        </p>
        <div class="bandeau-chiffres">
          <div><b>{M.length}</b><span>générations</span></div>
          {l.duree !== undefined && <div><b>{virgule(l.duree)}</b><span>ans d’une naissance à l’autre</span></div>}
          <div><b>{communes}</b><span>{communes > 1 ? 'communes de naissance' : 'commune de naissance'}</span></div>
          <div><b>{l.noms.length}</b><span>{l.noms.length > 1 ? 'patronymes' : 'patronyme'}</span></div>
          <div><b>{l.sourcees}</b><span>naissance{l.sourcees > 1 ? 's' : ''} sourcée{l.sourcees > 1 ? 's' : ''} sur {M.length}</span></div>
        </div>
      </header>

      <div class="lg-page">
        <ol class="lg-frise">
          <Sommet d={d} suite={l.suite} />
          {lignes}
        </ol>

        <aside class="lg-cote">
          {l.lieux.length > 0 && (
            <section class="panneau">
              <h2>Le chemin des lieux</h2>
              <ol class="lg-route">
                {l.lieux.map(([lieu, n], i) => (
                  <li key={i}><Lieu lieu={lieu} />{n > 1 && <small>{n} générations</small>}<span class="lg-contexte">{decouperLieu(lieu).contexte}</span></li>
                ))}
              </ol>
            </section>
          )}
          {l.noms.length > 0 && (
            <section class="panneau">
              <h2>{l.noms.length > 1 ? 'Le fil des noms' : 'Le nom'}</h2>
              <ol class="lg-route lg-noms">
                {l.noms.map(([nom, n], i) => <li key={i}><span class="lg-nom">{nom}</span>{n > 1 && <small>{n} générations</small>}</li>)}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </section>
  )
}

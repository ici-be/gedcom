// Ascendance : l'éventail de complétude et les quatre quartiers, la frise des générations, les lignées,
// les pistes de recherche, l'implexe, les noms et le temps.

import type { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { Donnees, Perimetre } from '../lib/donnees'
import { ascendance, GENERATIONS_EVENTAIL, type Branche, type Etape, type GenerationDetaillee, type Piste } from '../lib/ascendance'
import { annee } from '../lib/gedcom/dates'
import { texteParent } from '../lib/filiation'
import { nomSiecle } from '../lib/communes'
import { nombre, pourcent } from '../lib/format'
import { preparerPersonnes, type QuelsParents } from './Individus'

const HOMME = 'var(--homme)'
const FEMME = 'var(--femme)'
/** Générations détaillées dans la frise ; les suivantes sont résumées en une ligne */
const FRISE = 16
/** Jusqu'à cette génération, une case par place */
const CASES = 8

const pc = (x: number) => (x >= 0.995 ? '100 %' : x > 0 && x < 0.01 ? '< 1 %' : `${Math.round(x * 100)} %`)
const nomPays = (() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }) } catch { return undefined } })()

/** « 1923–2011 », suivi de la commune de naissance si `lieu` */
function Annees({ d, id, lieu }: { d: Donnees; id: string; lieu?: boolean }) {
  const s = d.suivis.get(id)
  const n = annee(s?.naissance.evenement?.date)
  const m = annee(s?.deces.evenement?.date)
  const c = lieu ? commune(d, id) : undefined
  const ans = n === undefined ? (m === undefined ? '' : '† ' + m) : m === undefined ? String(n) : `${n}–${m}`
  if (!ans && !c) return null
  return <span class="annees">{[ans, c].filter(Boolean).join(', ')}</span>
}

/** Prénom et nom, avec le lien vers la fiche en ligne s'il existe */
function Nom({ d, id }: { d: Donnees; id: string }) {
  const ind = d.arbre.individus.get(id)
  if (!ind) return <span class="vide">?</span>
  const texte = [ind.prenom.split(/\s+/)[0], ind.nom].filter(Boolean).join(' ') || '?'
  const url = d.lien(ind)
  return url ? <a class="nom" href={url} target="_blank" rel="noopener noreferrer">{texte}</a> : <span class="nom">{texte}</span>
}

const commune = (d: Donnees, id: string) => d.suivis.get(id)?.naissance.evenement?.lieu?.split(',')[0].trim()

function manque(p: Piste): string {
  const cotes = (['pere', 'mere'] as const).filter((c) => p[c] === 'a-chercher')
  return cotes.length === 2 ? 'père et mère à chercher' : texteParent('a-chercher', cotes[0])
}

/** « père inconnu », « parents inconnus »… pour une personne dont la lignée s'arrête */
function fermeture(p: Piste): string {
  if (p.pere === p.mere) return p.pere === 'inconnu' ? 'parents inconnus' : 'parents introuvables'
  return (['pere', 'mere'] as const).filter((c) => p[c] === 'inconnu' || p[c] === 'introuvable').map((c) => texteParent(p[c], c)).join(', ')
}

function Courbe({ v, couleur }: { v: number[]; couleur: string }) {
  const W = 200
  const H = 34
  if (v.length < 2) return null
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - 2 - x * (H - 4)).toFixed(1)}`).join(' ')
  return (
    <svg class="courbe" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Complétude de la branche : ${v.map(pc).join(', ')}`}>
      <polyline points={`0,${H - 2} ${W},${H - 2}`} fill="none" stroke="var(--line)" />
      <polygon points={`0,${H - 2} ${pts} ${W},${H - 2}`} fill={couleur} opacity=".18" />
      <polyline points={pts} fill="none" stroke={couleur} stroke-width="2" vector-effect="non-scaling-stroke" />
    </svg>
  )
}

/** Demi-éventail : chaque place jusqu'à la 10e génération, retrouvée, sans issue ou à trouver */
function Eventail({ d, connues, closes, generations, quartier }: { d: Donnees; connues: Set<number>; closes: Set<number>; generations: number; quartier: number | null }) {
  const W = 640
  const cx = 320
  const cy = 330
  const r0 = 40
  const pas = (cy - r0 - 10) / Math.max(1, generations - 1)
  const ferme = (s: number) => { for (let x = s; x > 1; x = Math.floor(x / 2)) if (closes.has(x)) return true; return false }
  const pt = (r: number, a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)]
  const secteur = (r1: number, r2: number, a1: number, a2: number) => {
    const [x1, y1] = pt(r2, a1); const [x2, y2] = pt(r2, a2); const [x3, y3] = pt(r1, a2); const [x4, y4] = pt(r1, a1)
    return `M${x1.toFixed(1)},${y1.toFixed(1)}A${r2},${r2} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}L${x3.toFixed(1)},${y3.toFixed(1)}A${r1},${r1} 0 0 0 ${x4.toFixed(1)},${y4.toFixed(1)}Z`
  }
  const cases = []
  for (let g = 2; g <= generations; g++) {
    const n = 2 ** (g - 1)
    const r1 = r0 + (g - 2) * pas
    const r2 = r1 + pas - 1.5
    for (let s = n; s < 2 * n; s++) {
      const a1 = -90 + ((s - n) / n) * 180
      const a2 = -90 + ((s - n + 1) / n) * 180
      const dans = quartier === null || (g >= 3 ? s >> (g - 3) === quartier : quartier >> 1 === s)
      const connue = connues.has(s)
      const fond = connue ? (s % 2 ? FEMME : HOMME) : ferme(s) ? 'url(#eventail-hachures)' : 'var(--vide)'
      cases.push(<path key={s} d={secteur(r1, r2, a1, a2)} fill={fond} opacity={dans ? (connue ? 0.85 : 1) : 0.18} stroke="var(--panel)" stroke-width={g > 8 ? 0.3 : 0.8} />)
    }
  }
  const prenom = d.arbre.individus.get(d.racine)?.prenom.split(/\s+/)[0] ?? ''
  return (
    <svg class="eventail-completude" viewBox={`0 0 ${W} ${cy + 24}`} role="img" aria-label={`Places retrouvées sur ${generations} générations`}>
      <defs>
        <pattern id="eventail-hachures" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="var(--vide)" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--clos)" stroke-width="1.6" />
        </pattern>
      </defs>
      {cases}
      <path d={`M${cx - r0 + 2},${cy}A${r0 - 2},${r0 - 2} 0 0 1 ${cx + r0 - 2},${cy}Z`} fill="var(--accent)" />
      <text x={cx} y={cy - 9} text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent-fg)">{prenom}</text>
      {Array.from({ length: Math.floor(generations / 2) }, (_, i) => 2 * (i + 1)).map((g) => {
        const r = r0 + (g - 2) * pas + pas / 2
        return [<text key={'g' + g} x={cx - r} y={cy + 16} text-anchor="middle" font-size="10" fill="var(--muted)">{g}</text>, <text key={'d' + g} x={cx + r} y={cy + 16} text-anchor="middle" font-size="10" fill="var(--muted)">{g}</text>]
      })}
    </svg>
  )
}

function Legende() {
  return (
    <div class="legende-asc">
      <span><i style={{ background: HOMME }} />homme retrouvé</span>
      <span><i style={{ background: FEMME }} />femme retrouvée</span>
      <span><i class="hachure" />sans issue</span>
      <span><i style={{ background: 'var(--vide)' }} />à trouver</span>
    </div>
  )
}

function CarteQuartier({ d, q, actif, choisir }: { d: Donnees; q: Branche & { sous: Branche[] }; actif: boolean; choisir: () => void }) {
  const couleur = q.sosa < 6 ? HOMME : FEMME
  const ind = q.id ? d.arbre.individus.get(q.id) : undefined
  return (
    <button type="button" class="quartier" aria-pressed={actif} onClick={choisir} style={{ '--c': couleur }}>
      <span class="quartier-nom">{ind?.nom || '?'}</span>
      <small>
        {ind ? <>{ind.prenom.split(/\s+/)[0]} {ind.nom} <Annees d={d} id={ind.id} /><br /></> : null}
        {nombre(q.distincts)} ancêtres · jusqu’à la génération {q.profondeur}
      </small>
      <Courbe v={q.completude} couleur={couleur} />
      <span class="quartier-sous">
        {q.sous.map((b) => {
          const i = b.id ? d.arbre.individus.get(b.id) : undefined
          return [<span key={'n' + b.sosa}>{i ? `${i.prenom.split(/\s+/)[0]} ${i.nom}` : '?'}</span>, <span key={'c' + b.sosa}>{nombre(b.distincts)} · G{b.profondeur}</span>]
        })}
      </span>
    </button>
  )
}

function TexteEtape({ d, e }: { d: Donnees; e: Etape }) {
  const ind = (id: string) => d.arbre.individus.get(id)
  const qui = (id: string) => <><Nom d={d} id={id} /><Annees d={d} id={id} lieu /></>
  switch (e.type) {
    case 'etranger': {
      const f = ind(e.id)?.sexe === 'F'
      return <>{f ? 'Première ancêtre née' : 'Premier ancêtre né'} hors de {nomPays?.of(e.principal) ?? e.principal} : {qui(e.id)} ({nomPays?.of(e.pays) ?? e.pays}).</>
    }
    case 'complete': return <><em>Dernière génération complète</em> : les {nombre(e.places)} places sont toutes occupées.</>
    case 'mur': return <>Premier mur : {qui(e.piste.id)}, {manque(e.piste)}.</>
    case 'sans-issue':
      return e.total > 3
        ? <>{nombre(e.total)} ancêtres de la génération précédente ont un parent inconnu ou introuvable : leurs places restent vides.</>
        : <>Sans issue : {e.pistes.map((p, i) => <span key={p.id}>{i ? ' ; ' : ''}{qui(p.id)}, {fermeture(p)}</span>)}.</>
    case 'implexe':
      return <>Premier implexe : {e.implexe.ids.map((id, i) => <span key={id}>{i ? ' et ' : ''}<Nom d={d} id={id} /></span>)} {e.implexe.ids.length > 1 ? 'occupent' : 'occupe'} plusieurs places (Sosa {e.implexe.sosas[0].join(' et ')}).</>
    case 'plus-fournie': return <><em>Génération la plus fournie</em> : {nombre(e.distincts)} ancêtres différents retrouvés.</>
    case 'sources': return <>Les naissances ne sont presque plus sourcées : {nombre(e.sourcees)} sur {nombre(e.total)}.</>
  }
}

function Visuel({ x, connues, closes }: { x: GenerationDetaillee; connues: Set<number>; closes: Set<number> }) {
  const g = x.generation
  const n = x.theoriques
  if (g <= CASES) {
    const ferme = (s: number) => { for (let y = s; y > 1; y = Math.floor(y / 2)) if (closes.has(y)) return true; return false }
    const cases = []
    for (let s = n; s < 2 * n; s++) cases.push(<i key={s} class={connues.has(s) ? (g === 1 ? 'r' : s < 1.5 * n ? 'h' : 'f') : ferme(s) ? 'c' : 'v'} />)
    return <div class="places" aria-label={`${x.connus} places occupées sur ${n}`}>{cases}</div>
  }
  if (x.pere !== undefined && x.mere !== undefined) {
    return (
      <div class="deux-cotes" aria-label={`Côté paternel ${pc(x.pere)}, côté maternel ${pc(x.mere)}`}>
        <div class="cote pere"><span style={{ width: `${x.pere * 100}%` }} /></div>
        <div class="cote mere"><span style={{ width: `${x.mere * 100}%` }} /></div>
      </div>
    )
  }
  return null
}

function Chaine({ d, ids, couper }: { d: Donnees; ids: string[]; couper?: boolean }) {
  const maillon = (id: string, i: number) => (
    <div class="maillon" key={id + i}>
      <span class="annees">G{i + 1}</span>
      <Nom d={d} id={id} />
      <span class="annees"><Annees d={d} id={id} />{commune(d, id) ? ` · ${commune(d, id)}` : ''}</span>
    </div>
  )
  if (!couper || ids.length <= 12) return <div class="chaine">{ids.map(maillon)}</div>
  return (
    <div class="chaine">
      {ids.slice(0, 6).map(maillon)}
      <div class="saut">… {ids.length - 11} générations …</div>
      {ids.slice(-5).map((id, i) => maillon(id, ids.length - 5 + i))}
    </div>
  )
}

function Panneau({ titre, aide, lien, children, classe }: { titre: string; aide?: ComponentChildren; lien?: ComponentChildren; children: ComponentChildren; classe?: string }) {
  return (
    <section class={'panneau asc' + (classe ? ' ' + classe : '')}>
      <header class="asc-entete"><h2>{titre}</h2>{lien}</header>
      {aide && <p class="aide">{aide}</p>}
      {children}
    </section>
  )
}

export function Ascendance({ d, setPerimetre }: { d: Donnees; setPerimetre: (p: Perimetre) => void }) {
  const a = useMemo(() => ascendance(d), [d])
  const [quartier, setQuartier] = useState<number | null>(null)
  const racine = d.arbre.individus.get(d.racine)
  if (!racine || a.distincts < 2) {
    return (
      <section class="ecran">
        <header class="titre-ecran"><h1>Ascendance</h1></header>
        <p class="aucun">Aucun ancêtre connu pour la personne de départ.</p>
      </section>
    )
  }
  const vers = (parents: QuelsParents, genMax?: number) => () => { preparerPersonnes({ genMax, parents }); setPerimetre('ancetres') }
  const G = a.generations
  const plusLoin = a.plusLongue[a.plusLongue.length - 1]
  const ancien = d.arbre.individus.get(plusLoin)
  const nAncien = annee(d.suivis.get(plusLoin)?.naissance.evenement?.date)
  const parents = G[1]
  const tete = a.quartiers.filter((q) => q.id)
  const au_dela = G.slice(FRISE)
  const nomMax = a.noms[0]?.[1] ?? 1
  const nomMin = a.noms[a.noms.length - 1]?.[1] ?? 0
  const siecles = a.siecles.filter(([s]) => s >= 13)
  const avant = a.siecles.filter(([s]) => s < 13).reduce((t, [, n]) => t + n, 0)
  const maxSiecle = Math.max(1, avant, ...siecles.map(([, n]) => n))
  const barres: [string, number, boolean][] = [...(avant ? [['avant', avant, true] as [string, number, boolean]] : []), ...siecles.map(([s, n]) => [nomSiecle(s).replace(' siècle', ''), n, false] as [string, number, boolean])]
  const virgule = (v?: number) => (v === undefined ? '–' : v.toLocaleString('fr-BE', { maximumFractionDigits: 1 }))

  return (
    <section class="ecran ascendance">
      <header class="titre-ecran">
        <h1>Ascendance</h1>
        <p class="sous-titre">
          Les ancêtres de {racine.prenom.split(/\s+/)[0]} {racine.nom}
          {parents?.debut ? `, des parents nés vers ${Math.round(parents.debut / 10) * 10}` : ''}
          {ancien && a.plusLongue.length > 2 ? <> jusqu’à {ancien.prenom.split(/\s+/)[0]} {ancien.nom}{nAncien ? `, né${ancien.sexe === 'F' ? 'e' : ''} vers ${nAncien}` : ''}, {nombre(a.plusLongue.length - 1)} générations plus haut</> : null}.
        </p>
        <div class="bandeau-chiffres">
          <div><b>{nombre(a.distincts)}</b><span>ancêtres différents</span></div>
          <div><b>{G.length}</b><span>générations</span></div>
          <div><b>{a.completes}</b><span>générations complètes</span></div>
          <div><b>{pc(a.implexe)}</b><span>d’implexe</span></div>
          <div><b>{nombre(a.nbNoms)}</b><span>patronymes</span></div>
        </div>
      </header>

      <div class="asc-tete">
        <section class="panneau asc">
          <Eventail d={d} connues={a.connues} closes={a.closes} generations={Math.min(GENERATIONS_EVENTAIL, G.length)} quartier={quartier} />
          <Legende />
        </section>
        {tete.length > 0 && (
          <Panneau titre="Les quatre quartiers" aide="Un clic éclaire le quartier dans l’éventail. Dessous, ses deux arrière-grands-parents.">
            <div class="quartiers">
              {a.quartiers.map((q) => <CarteQuartier key={q.sosa} d={d} q={q} actif={quartier === q.sosa} choisir={() => setQuartier(quartier === q.sosa ? null : q.sosa)} />)}
            </div>
          </Panneau>
        )}
      </div>

      <Panneau titre="Génération après génération"
        aide={<>Chaque génération double le nombre de places à remplir. Jusqu’à la {CASES}<sup>e</sup>, une case par place, dans l’ordre des numéros Sosa ; au-delà, le côté paternel face au côté maternel. Les places au-dessus d’un parent <a href="#/filiation">inconnu ou introuvable</a> sont sans issue.</>}>
        <div class="cotes"><span>← côté paternel</span><span>côté maternel →</span></div>
        <div class="frise">
          {G.slice(0, FRISE).map((x) => (
            <div class="etape" key={x.generation}>
              <div class="etape-num">{x.generation}<small>{x.debut === undefined ? '' : x.debut === x.fin ? x.debut : `${x.debut}–${x.fin}`}</small></div>
              <div class="etape-corps">
                <div class="etape-chiffres">
                  <span><strong>{nombre(x.connus)}</strong> sur {nombre(x.theoriques)} · {x.connus / x.theoriques >= 0.001 ? pourcent(x.connus, x.theoriques) : '< 0,1 %'}</span>
                  {x.generation >= 6 && x.pere !== undefined && x.mere !== undefined && <span>paternel {pc(x.pere)} · maternel {pc(x.mere)}</span>}
                  {x.reste > 0 && <span><a href="#/personnes" onClick={vers('a-chercher', x.generation - 1)} title={`Les ancêtres des générations 1 à ${x.generation - 1} dont un parent est à chercher`}>{nombre(x.reste)} à trouver</a></span>}
                  {x.closes > 0 && <span><a href="#/personnes" onClick={vers('clos', x.generation - 1)} title={`Les ancêtres des générations 1 à ${x.generation - 1} dont un parent est inconnu ou introuvable`}>{nombre(x.closes)} sans issue</a></span>}
                  {x.distincts > 0 && <span>{pc(x.sourcees / x.distincts)} des naissances sourcées</span>}
                  {x.pays.length > 0 && <span>{x.pays.map(([p, n]) => `${nomPays?.of(p) ?? p} ${n}`).join(' · ')}</span>}
                </div>
                <Visuel x={x} connues={a.connues} closes={a.closes} />
                {x.etapes.map((e, i) => <p class="etape-fait" key={i}><TexteEtape d={d} e={e} /></p>)}
              </div>
            </div>
          ))}
          {au_dela.length > 0 && (
            <div class="etape">
              <div class="etape-num">{FRISE + 1}+<small>{au_dela[0].fin ? `avant ${au_dela[0].fin}` : ''}</small></div>
              <div class="etape-corps">
                <div class="etape-chiffres"><span><strong>{nombre(au_dela.reduce((t, g) => t + g.distincts, 0))}</strong> ancêtres sur {au_dela.length} générations de plus</span></div>
                {ancien && <p class="etape-fait">La lignée la plus longue remonte jusqu’à <Nom d={d} id={plusLoin} />{nAncien ? `, né${ancien.sexe === 'F' ? 'e' : ''} vers ${nAncien}` : ''}.</p>}
              </div>
            </div>
          )}
        </div>
      </Panneau>

      <Panneau titre="Lignées" lien={<a href="#/lignee/paternelle">Voir chaque lignée en détail</a>}>
        <h3><a href="#/lignee/paternelle">De père en père · {a.paternelle.length} générations</a></h3>
        <Chaine d={d} ids={a.paternelle} />
        <h3><a href="#/lignee/maternelle">De mère en mère · {a.maternelle.length} générations</a></h3>
        <Chaine d={d} ids={a.maternelle} />
        {a.plusLongue.length > Math.max(a.paternelle.length, a.maternelle.length) && <>
          <h3><a href="#/lignee/longue">La plus longue · {a.plusLongue.length} générations</a></h3>
          <Chaine d={d} ids={a.plusLongue} couper />
        </>}
      </Panneau>

      {a.pistes.length > 0 && (
        <Panneau titre="Pistes les plus proches"
          lien={<a href="#/personnes" onClick={vers('a-chercher')}>Les {nombre(a.pistes.length)} ancêtres dont un parent est à chercher</a>}
          aide="Les ancêtres les plus récents dont un parent reste à trouver : c’est là que chaque découverte ouvre le plus de places.">
          <div class="asc-pistes">
            {a.pistes.slice(0, 12).map((p) => (
              <div class="asc-piste" key={p.id}>
                <a class="asc-piste-g" href={'#/lignee/' + p.sosa} title="Voir la lignée qui y mène">G{p.generation}</a>
                <span><Nom d={d} id={p.id} /> <Annees d={d} id={p.id} /></span>
                <small>{commune(d, p.id) ? `${commune(d, p.id)} · ` : ''}<span class="manque">{manque(p)}</span></small>
              </div>
            ))}
          </div>
        </Panneau>
      )}

      <div class="asc-paire">
        {a.implexes.length > 0 && (
          <Panneau titre="Implexe" aide={<>{nombre(a.nbImplexes)} ancêtres occupent plusieurs places, soit {nombre(a.places - a.distincts)} places en double. Les premiers à revenir :</>}>
            <div class="jetons">
              {a.implexes.slice(0, 6).map((x) => (
                <span class="jeton" key={x.ids.join()}>
                  <span>{x.ids.map((id, i) => <span key={id}>{i ? ' et ' : ''}<Nom d={d} id={id} /></span>)}</span>
                  <small>génération {x.generation} · Sosa {x.sosas[0].join(' et ')}</small>
                </span>
              ))}
            </div>
          </Panneau>
        )}
        {a.noms.length > 0 && (
          <Panneau titre="Noms les plus présents" aide={`Parmi les ${nombre(a.nbNoms)} patronymes des ancêtres.`}>
            <div class="nuage">
              {a.noms.map(([n, k]) => <span key={n} style={{ fontSize: `${(1 + (nomMax > nomMin ? (k - nomMin) / (nomMax - nomMin) : 0) * 1.1).toFixed(2)}rem` }}>{n}<small>{k}</small></span>)}
            </div>
          </Panneau>
        )}
      </div>

      <section class="panneau asc asc-temps">
        <div>
          <h2>Siècle de naissance</h2>
          <svg class="asc-siecles" viewBox={`0 0 ${Math.max(1, barres.length) * 62} 116`} role="img" aria-label="Ancêtres par siècle de naissance">
            {barres.map(([lib, n, pale], i) => {
              const h = Math.max(2, (n / maxSiecle) * 78)
              return (
                <g key={lib}>
                  <rect x={i * 62 + 6} y={96 - h} width="50" height={h} rx="3" fill="var(--accent)" opacity={pale ? 0.45 : 0.85} />
                  <text x={i * 62 + 31} y={92 - h} text-anchor="middle" font-size="11" fill="var(--fg)">{nombre(n)}</text>
                  <text x={i * 62 + 31} y="111" text-anchor="middle" font-size="11" fill="var(--muted)">{lib}</text>
                </g>
              )
            })}
          </svg>
        </div>
        <div class="duree">
          <h2>Une génération dure</h2>
          <div><b>{virgule(a.duree.pere?.moyenne)} ans</b><span>de père en enfant</span></div>
          <div><b>{virgule(a.duree.mere?.moyenne)} ans</b><span>de mère en enfant</span></div>
          <p class="aide">En moyenne, d’après {nombre(a.duree.pere?.n ?? 0)} pères et {nombre(a.duree.mere?.n ?? 0)} mères dont on connaît les deux naissances.</p>
        </div>
      </section>
    </section>
  )
}

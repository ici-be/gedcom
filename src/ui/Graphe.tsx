// Graphe des relations : les personnes choisies (entourage, métiers, nom, lieu) et ce qui les relie,
// la famille et les actes (témoins, parrains et marraines).

import { Fragment } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import type { Individu } from '../lib/gedcom/arbre'
import { construireGraphe, decrire, motif, TYPES_LIENS, type Arete, type Critere, type Mode, type Noeud, type TypeLien } from '../lib/graphe'
import { sansAccents } from '../lib/metiers'
import { score } from '../lib/suivi'
import { nombre } from '../lib/format'
import { ecrire, lire } from '../lib/stockage'
import { Annees, ChoixPersonne, Personne } from './commun'
import { Vue, type Style } from './graphe/Vue'

type Couleur = 'metier' | 'sources' | 'ancetres'

interface Reglages { critere: Critere; couleur: Couleur; isoles: boolean }

const MODES: { id: Mode; texte: string; icone: string }[] = [
  { id: 'entourage', texte: 'Entourage', icone: 'M8 8.2a2.2 2.2 0 1 0 0-4.4a2.2 2.2 0 0 0 0 4.4zM2.5 14c.7-2.6 2.8-4 5.5-4s4.8 1.4 5.5 4' },
  { id: 'metiers', texte: 'Métiers', icone: 'M2 5h12v9H2zM6 5V3h4v2' },
  { id: 'nom', texte: 'Nom', icone: 'M3 3.5h10M8 3.5V13M5.5 13h5' },
  { id: 'lieu', texte: 'Lieu', icone: 'M8 14.5s5-4.5 5-8.5a5 5 0 0 0-10 0c0 4 5 8.5 5 8.5zM8 4.6a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 1 1 0-2.8' },
]

const COULEURS: { id: Couleur; texte: string }[] = [
  { id: 'sources', texte: 'Sources' },
  { id: 'ancetres', texte: 'Ancêtres' },
  { id: 'metier', texte: 'Métier' },
]

const initiales = (ind: Individu) => ((ind.prenom[0] ?? '') + (ind.nom[0] ?? '')).toUpperCase() || '?'
const classeSexe = (ind: Individu) => (ind.sexe === 'F' ? 'f' : ind.sexe === 'M' ? 'h' : '')

const NOMS_LIENS: Record<TypeLien, { texte: string; aide: string }> = {
  famille: { texte: 'Famille', aide: 'Conjoints, parents et enfants ; frères et sœurs quand leurs parents ne sont pas affichés' },
  parrain: { texte: 'Parrains, marraines', aide: 'Au baptême ou à la naissance : avec l’enfant et avec ses parents, qui les ont choisis' },
  temoin: { texte: 'Témoins', aide: 'Témoin d’une naissance, d’un mariage ou d’un décès (déclarant) : avec la personne de l’acte, et avec les parents pour une naissance' },
  cotemoin: { texte: 'Co-témoins', aide: 'Témoins ou parrains du même acte' },
}

/** Huit teintes fixes pour les métiers, dans l'ordre du choix ; au-delà, gris */
const TEINTES = 8
const LIMITE = 6000

function lireStyle(el: Element): Style & { metiers: string[]; ok: string; mid: string; ko: string; vide: string } {
  const s = getComputedStyle(el)
  const v = (n: string) => s.getPropertyValue(n).trim()
  return {
    fond: v('--panel'), texte: v('--fg'), discret: v('--muted'), accent: v('--accent'),
    liens: { famille: v('--g-famille'), parrain: v('--g-parrain'), temoin: v('--g-temoin'), cotemoin: v('--g-cotemoin') },
    metiers: Array.from({ length: TEINTES }, (_, i) => v(`--g${i + 1}`)),
    ok: v('--ok'), mid: v('--mid'), ko: v('--ko'), vide: v('--g-vide'),
  }
}

function etiquette(ind: Individu): string {
  return `${ind.prenom.split(/\s+/)[0] || '?'} ${ind.nom}`.trim()
}

export function Graphe({ d }: { d: Donnees }) {
  const [r, setR] = useState<Reglages>(() => {
    const g = lire<Partial<Reglages>>('graphe', {})
    const critere: Critere = { mode: 'entourage', metiers: [], texte: '', personne: d.racine, pas: 2, famille: true, types: TYPES_LIENS, ...g.critere }
    if (!d.arbre.individus.has(critere.personne)) critere.personne = d.racine
    critere.metiers = critere.metiers.filter((m) => d.metiers.metiers.has(m))
    return { couleur: 'sources', isoles: true, ...g, critere }
  })
  const changer = (n: Partial<Reglages>) => setR((x) => { const y = { ...x, ...n }; ecrire('graphe', y); return y })
  const critere = (c: Partial<Critere>) => changer({ critere: { ...r.critere, ...c } })
  const c = r.critere

  // le nom et le lieu se cherchent quand la frappe s'arrête
  const [texte, setTexte] = useState(c.texte)
  useEffect(() => setTexte(c.texte), [c.mode])
  useEffect(() => {
    if (texte === c.texte) return
    const h = setTimeout(() => critere({ texte }), 350)
    return () => clearTimeout(h)
  }, [texte])

  const graphe = useMemo(() => construireGraphe(d.arbre, d.metiers, c, r.isoles), [d, c, r.isoles])
  const trop = graphe.noeuds.length > LIMITE
  const [choisi, setChoisi] = useState<string | null>(null)
  const [cherche, setCherche] = useState('')

  const couleur: Couleur = r.couleur === 'metier' && c.mode !== 'metiers' ? 'sources' : r.couleur
  const [theme, setTheme] = useState(0)
  const [calcul, setCalcul] = useState(false)
  const toile = useRef<HTMLCanvasElement>(null)
  const cadre = useRef<HTMLDivElement>(null)
  // plein écran : l'API du navigateur, sinon (iPhone) un cadre qui couvre la page
  const [plein, setPlein] = useState(false)
  const [secours, setSecours] = useState(false)
  useEffect(() => {
    const maj = () => setPlein(document.fullscreenElement === cadre.current)
    document.addEventListener('fullscreenchange', maj)
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setSecours(false) }
    window.addEventListener('keydown', echap)
    return () => { document.removeEventListener('fullscreenchange', maj); window.removeEventListener('keydown', echap) }
  }, [])
  const basculerPlein = () => {
    const el = cadre.current
    if (!el) return
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return }
    if (secours) { setSecours(false); return }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => setSecours(true))
    else setSecours(true)
  }
  const pleinEcran = plein || secours
  const vue = useRef<Vue | null>(null)
  const style = useRef<ReturnType<typeof lireStyle> | null>(null)

  useEffect(() => {
    const el = toile.current!
    style.current = lireStyle(el)
    const v = new Vue(el, style.current, { choisir: (id) => setChoisi(id), calcul: setCalcul })
    vue.current = v
    // thème clair ou sombre : on relit les couleurs
    const relire = () => { style.current = lireStyle(el); v.setStyle(style.current); setTheme((x) => x + 1) }
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', relire)
    const obs = new MutationObserver(relire)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    setTheme((x) => x + 1)
    return () => { v.detruire(); mq.removeEventListener('change', relire); obs.disconnect() }
  }, [])

  const apparence = useMemo(() => {
    return (n: Noeud) => {
      const s = style.current!
      const ind = d.arbre.individus.get(n.id)!
      let col = s.vide
      if (couleur === 'metier') col = n.metier !== undefined && n.metier < TEINTES ? s.metiers[n.metier] : s.vide
      else if (couleur === 'ancetres') col = d.ancetres.has(n.id) ? s.accent : d.fratries.has(n.id) ? s.metiers[2] : s.vide
      else {
        const su = d.suivis.get(n.id)
        const sc = su ? score(su) : { attendus: 0, sources: 0 }
        col = !sc.attendus ? s.vide : sc.sources === sc.attendus ? s.ok : sc.sources ? s.mid : s.ko
      }
      return { couleur: col, etiquette: etiquette(ind), creux: !n.trouve && c.mode !== 'entourage', centre: c.mode === 'entourage' && n.id === c.personne }
    }
  }, [d, couleur, c.mode, c.personne, theme])

  useEffect(() => {
    if (!vue.current) return
    if (trop) vue.current.charger([], [], apparence)
    else vue.current.charger(graphe.noeuds, graphe.aretes, apparence)
  }, [graphe, apparence, trop])

  useEffect(() => {
    if (choisi && !graphe.noeuds.some((n) => n.id === choisi)) setChoisi(null)
  }, [graphe])
  useEffect(() => { vue.current?.setChoisi(choisi) }, [choisi])

  const trouves = useMemo(() => {
    const re = motif(cherche)
    if (!re) return null
    return new Set(graphe.noeuds.filter((n) => re.test(sansAccents(etiquette(d.arbre.individus.get(n.id)!)))).map((n) => n.id))
  }, [cherche, graphe, d])
  useEffect(() => {
    vue.current?.setTrouves(trouves)
    if (trouves?.size === 1) vue.current?.centrer([...trouves][0])
  }, [trouves])

  const allerA = (id: string) => { setChoisi(id); vue.current?.centrer(id) }

  const relies = useMemo(() => [...graphe.noeuds].filter((n) => n.degre).sort((a, b) => b.degre - a.degre || b.poids - a.poids).slice(0, 12), [graphe])
  const legende = useMemo(() => {
    const s = style.current
    if (!s) return []
    // les puces des métiers, au-dessus, portent déjà leur couleur
    if (couleur === 'metier') return c.metiers.length > TEINTES ? [{ couleur: s.vide, texte: 'Autres métiers (au-delà de 8)' }] : []
    if (couleur === 'ancetres') return [{ couleur: s.accent, texte: 'Ancêtre' }, { couleur: s.metiers[2], texte: 'Frère ou sœur d’ancêtre' }, { couleur: s.vide, texte: 'Autre' }]
    return [{ couleur: s.ok, texte: 'Tout sourcé' }, { couleur: s.mid, texte: 'En partie' }, { couleur: s.ko, texte: 'Rien de sourcé' }]
  }, [couleur, c.metiers, theme, d])

  return (
    <section class="ecran graphe-ecran">
      <header class="titre-ecran">
        <h1>Graphe des relations</h1>
        <p class="sous-titre">Qui côtoyait qui : la famille, et les actes où l'on se retrouve témoin, parrain ou marraine. Choisissez des personnes, puis cliquez sur l'une d'elles pour voir ses liens.</p>
      </header>

      <div class="graphe-reglages panneau">
        <div class="graphe-ligne">
          <div class="segments graphe-modes" role="radiogroup" aria-label="Quelles personnes">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={c.mode === m.id} class={c.mode === m.id ? 'actif' : ''} onClick={() => changer({
                critere: { ...c, mode: m.id },
                // les métiers se lisent à leur couleur
                couleur: m.id === 'metiers' ? 'metier' : r.couleur === 'metier' ? 'sources' : r.couleur,
              })}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d={m.icone} /></svg>{m.texte}
              </button>
            ))}
          </div>
          {c.mode === 'entourage' && (
            <>
              <div class="graphe-personne"><ChoixPersonne d={d} valeur={c.personne} choisir={(id) => critere({ personne: id })} prenoms={2} /></div>
              <div class="graphe-distance">
                <span class="graphe-etiquette">Distance</span>
                <div class="segments petit" role="radiogroup" aria-label="Distance en liens">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={c.pas === n} class={c.pas === n ? 'actif' : ''} onClick={() => critere({ pas: n })} title={`${n} lien${n > 1 ? 's' : ''}`}>{n}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          {(c.mode === 'nom' || c.mode === 'lieu') && (
            <label class="graphe-texte">
              <span>{c.mode === 'nom' ? 'Nom ou prénom' : 'Lieu d’un acte'}</span>
              <input type="search" value={texte} onInput={(e) => setTexte(e.currentTarget.value)} placeholder={c.mode === 'nom' ? 'ex. v*k*man*' : 'ex. Brux*'} />
            </label>
          )}
          {c.mode !== 'entourage' && (
            <label class="case" title="Parents, conjoints et enfants des personnes trouvées (disques creux)">
              <input type="checkbox" checked={c.famille} onChange={(e) => critere({ famille: e.currentTarget.checked })} /> Famille proche
            </label>
          )}
        </div>
        {c.mode === 'metiers' && <ChoixMetiers d={d} choisis={c.metiers} changer={(metiers) => critere({ metiers })} couleurs={style.current?.metiers ?? []} />}
        <div class="graphe-ligne graphe-ligne-bas">
          <div class="graphe-types" role="group" aria-label="Types de liens">
            <span class="graphe-etiquette">Liens</span>
            {TYPES_LIENS.map((t) => {
              const actif = c.types.includes(t)
              return (
                <label key={t} class={`graphe-type ${t}${actif ? ' actif' : ''}`} title={NOMS_LIENS[t].aide}>
                  <input type="checkbox" checked={actif} onChange={(e) => critere({ types: e.currentTarget.checked ? TYPES_LIENS.filter((x) => x === t || c.types.includes(x)) : c.types.filter((x) => x !== t) })} />
                  <svg class={`trait-${t}`} viewBox="0 0 28 8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" /></svg>
                  {NOMS_LIENS[t].texte}
                </label>
              )
            })}
          </div>
          <div class="graphe-couleur">
            <span class="graphe-etiquette">Couleur</span>
            <div class="segments petit" role="radiogroup" aria-label="Colorer les personnes selon">
              {COULEURS.filter((x) => x.id !== 'metier' || c.mode === 'metiers').map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={couleur === x.id} class={couleur === x.id ? 'actif' : ''} onClick={() => changer({ couleur: x.id })}>{x.texte}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div class={'graphe-cadre' + (secours ? ' plein-secours' : '')} ref={cadre}>
        <div class="graphe-toile">
          <canvas ref={toile} aria-label={`Graphe : ${graphe.noeuds.length} personnes, ${graphe.aretes.length} liens`} role="img" />
          <div class="graphe-haut">
            <input type="search" value={cherche} onInput={(e) => setCherche(e.currentTarget.value)} placeholder="Chercher dans le graphe…" aria-label="Chercher dans le graphe" />
            {trouves && <span class="graphe-compte">{nombre(trouves.size)} trouvée{trouves.size > 1 ? 's' : ''}</span>}
          </div>
          <div class="graphe-bilan">
            {calcul && <span class="graphe-calcul" role="status"><span class="rouet" />mise en place · </span>}
            <strong>{nombre(graphe.noeuds.length)}</strong> personne{graphe.noeuds.length > 1 ? 's' : ''} · <strong>{nombre(graphe.aretes.length)}</strong> lien{graphe.aretes.length > 1 ? 's' : ''}
            {graphe.isoles > 0 && (
              <> · <button type="button" class="lien" onClick={() => changer({ isoles: !r.isoles })} title="Personnes sans aucun lien avec les autres du graphe">
                {r.isoles ? `${nombre(graphe.isoles)} sans lien masquée${graphe.isoles > 1 ? 's' : ''}` : 'masquer les personnes sans lien'}
              </button></>
            )}
          </div>
          {(legende.length > 0 || (c.mode !== 'entourage' && c.famille)) && (
            <ul class="graphe-legende">
              {legende.map((l) => <li key={l.texte}><span class="pastille-couleur" style={{ background: l.couleur }} />{l.texte}</li>)}
              {c.mode !== 'entourage' && c.famille && <li><span class="pastille-couleur creuse" />Famille ajoutée</li>}
            </ul>
          )}
          <div class="graphe-zoom">
            <button type="button" onClick={basculerPlein} title={pleinEcran ? 'Quitter le plein écran' : 'Plein écran'} aria-label={pleinEcran ? 'Quitter le plein écran' : 'Plein écran'} aria-pressed={pleinEcran}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d={pleinEcran ? 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4' : 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4'} /></svg>
            </button>
            <button type="button" onClick={() => vue.current?.zoomer(1.4)} title="Zoom avant" aria-label="Zoom avant">+</button>
            <button type="button" onClick={() => vue.current?.zoomer(1 / 1.4)} title="Zoom arrière" aria-label="Zoom arrière">−</button>
            <button type="button" onClick={() => vue.current?.cadrer()} title="Tout montrer" aria-label="Tout montrer">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 5.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 0 0 0-5.6M8 1.5v2.4M8 12.1v2.4M1.5 8h2.4M12.1 8h2.4" /></svg>
            </button>
          </div>
          {(trop || !graphe.noeuds.length) && (
            <p class="graphe-vide">
              {trop ? `${nombre(graphe.noeuds.length)} personnes : c'est trop pour un graphe lisible. Précisez la recherche.`
                : c.mode === 'metiers' && !c.metiers.length ? 'Choisissez un ou plusieurs métiers.'
                : (c.mode === 'nom' || c.mode === 'lieu') && !c.texte.trim() ? `Tapez un ${c.mode === 'nom' ? 'nom' : 'lieu'}.`
                : graphe.isoles ? 'Personne n’est relié à un autre : affichez les personnes sans lien, ou ajoutez la famille proche.' : 'Personne ne correspond.'}
            </p>
          )}
        </div>
        <aside class="graphe-fiche">
          {trop ? <p class="aide">Le classement des plus reliés s'affiche avec le graphe.</p> : choisi ? <Fiche d={d} id={choisi} aretes={graphe.aretes} aller={allerA} entourage={() => { critere({ mode: 'entourage', personne: choisi }) }} fermer={() => setChoisi(null)} />
            : <Classement d={d} relies={relies} aller={allerA} />}
        </aside>
      </div>
    </section>
  )
}

/** Choix de plusieurs métiers : recherche, puces colorées, « tout ajouter » */
function ChoixMetiers({ d, choisis, changer, couleurs }: { d: Donnees; choisis: string[]; changer: (m: string[]) => void; couleurs: string[] }) {
  const [q, setQ] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const tous = useMemo(() => [...d.metiers.metiers.values()].sort((a, b) => b.personnes.size - a.personnes.size), [d])
  const proposes = useMemo(() => {
    const t = sansAccents(q)
    return tous.filter((m) => !choisis.includes(m.cle) && (!t || sansAccents(m.titre).includes(t) || m.variantes.some((v) => sansAccents(v.libelle).includes(t))))
  }, [q, tous, choisis])
  const ajouter = (cles: string[]) => {
    changer([...choisis, ...cles.filter((c) => !choisis.includes(c))])
    setQ('')
    setOuvert(false)
  }
  return (
    <div class="choix-metiers">
      <ul class="puces">
        {choisis.map((cle, i) => {
          const m = d.metiers.metiers.get(cle)
          return (
            <li key={cle}>
              <span class="pastille-couleur" style={{ background: i < TEINTES ? couleurs[i] : 'var(--g-vide)' }} />
              {m?.titre ?? cle} <span class="compte">{nombre(m?.personnes.size ?? 0)}</span>
              <button type="button" onClick={() => changer(choisis.filter((x) => x !== cle))} aria-label={`Retirer ${m?.titre ?? cle}`} title="Retirer">×</button>
            </li>
          )
        })}
        {choisis.length > 1 && <li class="tout-retirer"><button type="button" class="lien" onClick={() => changer([])}>tout retirer</button></li>}
      </ul>
      <div class="choix-metiers-recherche" onFocusOut={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOuvert(false) }}>
        <input type="search" value={q} placeholder={choisis.length ? 'Ajouter un métier…' : 'Chercher un métier (ex. music, chant, instrument)…'} aria-label="Chercher un métier"
          onInput={(e) => { setQ(e.currentTarget.value); setOuvert(true) }} onFocus={() => setOuvert(true)} onClick={() => setOuvert(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' && proposes[0]) ajouter([proposes[0].cle]); if (e.key === 'Escape') setOuvert(false) }} />
        {ouvert && proposes.length > 0 && (
          <ul class="resultats">
            {q.trim() && proposes.length > 1 && (
              <li><button type="button" class="tout" onClick={() => ajouter(proposes.slice(0, 40).map((m) => m.cle))}>
                Ajouter {proposes.length > 40 ? 'les 40 premiers' : `les ${proposes.length}`} · {nombre(new Set(proposes.slice(0, 40).flatMap((m) => [...m.personnes.keys()])).size)} personnes
              </button></li>
            )}
            {proposes.slice(0, 14).map((m) => (
              <li key={m.cle}><button type="button" onClick={() => ajouter([m.cle])}>{m.titre} <span class="compte">{nombre(m.personnes.size)}</span></button></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Sans personne choisie : les plus reliés */
function Classement({ d, relies, aller }: { d: Donnees; relies: Noeud[]; aller: (id: string) => void }) {
  const max = Math.max(1, ...relies.map((n) => n.degre))
  return (
    <>
      <h2>Les plus reliés</h2>
      {relies.length ? (
        <ol class="graphe-classement">
          {relies.map((n) => {
            const ind = d.arbre.individus.get(n.id)!
            return (
              <li key={n.id}>
                <button type="button" onClick={() => aller(n.id)}>
                  <span class={`gr-avatar ${classeSexe(ind)}`} aria-hidden="true">{initiales(ind)}</span>
                  <span class="gr-qui">
                    <span class="gr-nom">{etiquette(ind)}</span>
                    <span class="gr-barre" title={`Relié à ${n.degre} personne${n.degre > 1 ? 's' : ''} du graphe`}><span style={{ width: `${(n.degre / max) * 100}%` }} /></span>
                  </span>
                  <span class="compte">{n.degre}</span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : <p class="aide">Aucun lien dans ce graphe.</p>}
      <p class="aide">Cliquez sur une personne pour voir ses liens ; glissez pour déplacer, molette ou pincement pour zoomer.</p>
    </>
  )
}

/** La personne choisie et chacun de ses liens, expliqués */
function Fiche({ d, id, aretes, aller, entourage, fermer }: { d: Donnees; id: string; aretes: Arete[]; aller: (id: string) => void; entourage: () => void; fermer: () => void }) {
  const ind = d.arbre.individus.get(id)!
  const anc = d.ancetres.get(id)
  const liens = useMemo(() => {
    const ordre = (a: Arete) => TYPES_LIENS.indexOf(a.type)
    return aretes.filter((a) => a.a === id || a.b === id).sort((x, y) => ordre(x) - ordre(y) || y.poids - x.poids)
      .map((a) => ({ autre: a.a === id ? a.b : a.a, type: a.type, textes: [...new Set(a.faits.map((f) => decrire(d.arbre, f, id)))] }))
  }, [aretes, id, d])
  return (
    <>
      <div class="graphe-fiche-tete">
        <span class={`gr-avatar grand ${classeSexe(ind)}`} aria-hidden="true">{initiales(ind)}</span>
        <h2><Personne d={d} id={id} /></h2>
        <button type="button" class="fermer" onClick={fermer} aria-label="Fermer" title="Fermer">×</button>
      </div>
      <p class="aide">
        <Annees ind={ind} />{anc && <> · Sosa {anc.sosa}</>}
        {ind.metiers.length > 0 && <> · {ind.metiers.join(', ')}</>}
      </p>
      <p class="graphe-actions">
        <button type="button" class="bouton discret" onClick={entourage}>Son entourage</button>
        <a class="bouton discret" href={`#/recit/${encodeURIComponent(id)}`}>Récit</a>
      </p>
      <h3>{liens.length ? `${liens.length} lien${liens.length > 1 ? 's' : ''} dans le graphe` : 'Aucun lien dans ce graphe'}</h3>
      <ul class="graphe-liens">
        {liens.map((l) => (
          <li key={l.autre}>
            <svg class={`trait-${l.type}`} viewBox="0 0 28 8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" /></svg>
            <div>
              <button type="button" class="lien" onClick={() => aller(l.autre)}>{etiquette(d.arbre.individus.get(l.autre)!)}</button>
              {' '}<Annees ind={d.arbre.individus.get(l.autre)!} />
              {l.textes.map((t, i) => <Fragment key={i}><span class="contexte">{t}</span></Fragment>)}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

// Statistiques : durées de vie, mariages, enfants, calendrier, prénoms, métiers, lieux, sources, ascendance.

import { useMemo, useState } from 'preact/hooks'
import { membres, type Donnees, type Perimetre } from '../lib/donnees'
import { compter, generations, resumer, statistiques, type Age, type Resume, type Sexe } from '../lib/statistiques'
import { nomSiecle } from '../lib/communes'
import { nombre, pourcent } from '../lib/format'
import { ChoixPerimetre, Personne } from './commun'
import { lienMetier } from './Metiers'
import { clePrenom, formeUsuelle } from '../lib/prenoms'
import { sansAccents } from '../lib/metiers'
import { Choix, Classement, Colonnes, Legende, type Serie } from './graphiques'

type Mesure = 'moyenne' | 'mediane'
type Calendrier = 'naissances' | 'mariages' | 'deces'

const HOMMES = 'var(--homme)'
const FEMMES = 'var(--femme)'
const AUTRE = 'var(--muted)'
const SEXES: { sexe: Sexe; nom: string; couleur: string }[] = [
  { sexe: 'M', nom: 'Hommes', couleur: HOMMES },
  { sexe: 'F', nom: 'Femmes', couleur: FEMMES },
]
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MIN_SIECLE = 15 // personnes au moins pour qu'un siècle ait sa colonne

const ans = (v: number) => v.toLocaleString('fr-BE', { maximumFractionDigits: 1 })
const ansTexte = (v?: number) => (v === undefined ? '–' : `${ans(v)} ans`)
const pc = (v: number) => `${Math.round(v)} %`
const court = (s: number) => nomSiecle(s).replace(' siècle', '')

interface RangPrenom { cle: string; nom: string; n: number; variantes: [string, number][] }

/** Prénoms les plus portés, variantes regroupées sous leur forme usuelle ou non */
function classerPrenoms(liste: { prenom: string }[], regrouper: boolean): RangPrenom[] {
  const groupes = new Map<string, Map<string, number>>()
  for (const { prenom } of liste) {
    const cle = regrouper ? clePrenom(prenom) : prenom
    const g = groupes.get(cle) ?? new Map<string, number>()
    g.set(prenom, (g.get(prenom) ?? 0) + 1)
    groupes.set(cle, g)
  }
  return [...groupes].map(([cle, g]) => {
    const variantes = [...g].sort((a, b) => b[1] - a[1])
    const n = variantes.reduce((t, [, x]) => t + x, 0)
    return { cle, nom: (regrouper && formeUsuelle(cle)) || variantes[0][0], n, variantes }
  }).sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr'))
}

function lignePrenom(p: RangPrenom) {
  // Les écarts d'accent ou de casse (Elisabeth, Élisabeth) ne sont détaillés que dans l'info-bulle
  const autres = p.variantes.filter(([v]) => sansAccents(v) !== sansAccents(p.nom))
  return {
    cle: p.cle,
    libelle: <span title={p.variantes.map(([v, n]) => `${v} : ${nombre(n)}`).join('\n')}>{p.nom}{autres.length > 0 && <span class="variantes"> {autres.map(([v]) => v).join(', ')}</span>}</span>,
    parts: [p.n],
  }
}

function valeur(r: Resume | undefined, m: Mesure): number | undefined {
  return r ? (m === 'moyenne' ? r.moyenne : r.mediane) : undefined
}

/** Une série par sexe, une colonne par siècle */
function seriesParSiecle(liste: Age[], siecles: number[], m: Mesure): Serie[] {
  return SEXES.map(({ sexe, nom, couleur }) => {
    const r = siecles.map((s) => resumer(liste.filter((x) => x.siecle === s && x.sexe === sexe).map((x) => x.age)))
    return { nom, couleur, valeurs: r.map((x) => (x && x.n >= 3 ? valeur(x, m) : undefined)), n: r.map((x) => x?.n ?? 0) }
  })
}

function Chiffre({ valeur, legende, detail }: { valeur: string; legende: string; detail?: preact.ComponentChildren }) {
  return (
    <div class="chiffre">
      <span class="chiffre-valeur">{valeur}</span>
      <span class="chiffre-legende">{legende}</span>
      {detail && <span class="chiffre-detail">{detail}</span>}
    </div>
  )
}

function ParSexe({ liste, m, legende }: { liste: Age[]; m: Mesure; legende: string }) {
  const tous = resumer(liste.map((x) => x.age))
  const h = resumer(liste.filter((x) => x.sexe === 'M').map((x) => x.age))
  const f = resumer(liste.filter((x) => x.sexe === 'F').map((x) => x.age))
  return (
    <div class="chiffres">
      <Chiffre valeur={ansTexte(valeur(tous, m))} legende={legende} detail={tous ? `${nombre(tous.n)} cas` : 'aucune donnée'} />
      <Chiffre valeur={ansTexte(valeur(h, m))} legende="Hommes" detail={h ? `${nombre(h.n)} cas` : undefined} />
      <Chiffre valeur={ansTexte(valeur(f, m))} legende="Femmes" detail={f ? `${nombre(f.n)} cas` : undefined} />
    </div>
  )
}

function Section({ titre, sous, children, outils, large }: { titre: string; sous?: preact.ComponentChildren; children: preact.ComponentChildren; outils?: preact.ComponentChildren; large?: boolean }) {
  return (
    <section class={'panneau stat' + (large ? ' large' : '')}>
      <header class="stat-entete">
        <div>
          <h2>{titre}</h2>
          {sous && <p class="aide">{sous}</p>}
        </div>
        {outils && <div class="stat-outils">{outils}</div>}
      </header>
      {children}
    </section>
  )
}

interface Props { d: Donnees; perimetre: Perimetre; setPerimetre: (p: Perimetre) => void }

export function Statistiques({ d, perimetre, setPerimetre }: Props) {
  const [mesure, setMesure] = useState<Mesure>('moyenne')
  const [filtreSiecle, setFiltreSiecle] = useState<number | null>(null)
  const [adultes, setAdultes] = useState(false)
  const [calendrier, setCalendrier] = useState<Calendrier>('mariages')
  const [sexeMetiers, setSexeMetiers] = useState<'tous' | Sexe>('tous')
  const [regrouper, setRegrouper] = useState(true)

  const brut = useMemo(() => statistiques(d, membres(d, perimetre)), [d, perimetre])
  const gens = useMemo(() => generations(d), [d])

  // Siècles assez fournis pour les graphiques
  const siecles = useMemo(() => {
    const c = compter(brut.personnes, (p) => (p.siecle === undefined ? undefined : String(p.siecle)))
    return c.filter(([, n]) => n >= MIN_SIECLE).map(([s]) => Number(s)).sort((a, b) => a - b)
  }, [brut])

  // Filtre « un siècle » appliqué à tout ce qui n'est pas déjà ventilé par siècle
  const dansSiecle = <T extends { siecle?: number }>(l: T[]) => (filtreSiecle === null ? l : l.filter((x) => x.siecle === filtreSiecle))
  const s = useMemo(() => ({
    personnes: dansSiecle(brut.personnes),
    vies: dansSiecle(brut.vies).filter((x) => !adultes || x.age >= 15),
    viesToutes: brut.vies.filter((x) => !adultes || x.age >= 15),
    mariages: dansSiecle(brut.mariages),
    ecarts: dansSiecle(brut.ecarts),
    parents: dansSiecle(brut.parents),
    fratries: dansSiecle(brut.fratries),
    mois: dansSiecle(brut.mois),
    prenoms: dansSiecle(brut.prenoms),
    noms: dansSiecle(brut.noms),
    metiers: dansSiecle(brut.metiers),
    naissances: dansSiecle(brut.naissances),
    sources: dansSiecle(brut.sources),
  }), [brut, filtreSiecle, adultes])

  const actif = filtreSiecle === null ? undefined : siecles.indexOf(filtreSiecle)
  const cats = siecles.map(court)

  // ——— En bref ———
  const hommes = s.personnes.filter((p) => p.sexe === 'M').length
  const femmes = s.personnes.filter((p) => p.sexe === 'F').length
  const vie = resumer(s.vies.map((x) => x.age))
  const enfants = resumer(s.fratries.map((x) => x.enfants))
  const sources = s.sources.filter((x) => x.source).length
  const prenomsDistincts = new Set(s.prenoms.map((p) => (regrouper ? clePrenom(p.prenom) : p.prenom))).size
  const nomsDistincts = new Set(s.noms.map((p) => p.nom)).size
  const plusAncien = Math.min(...brut.personnes.map((p) => p.siecle ?? Infinity))

  // ——— Durée de vie ———
  const tranches = Array.from({ length: 21 }, (_, i) => (i === 20 ? '100+' : `${i * 5}–${i * 5 + 4}`))
  const histoVie: Serie[] = SEXES.map(({ sexe, nom, couleur }) => ({
    nom, couleur,
    valeurs: tranches.map((_, i) => s.vies.filter((x) => x.sexe === sexe && Math.min(20, Math.floor(x.age / 5)) === i).length),
  }))
  const doyens = [...s.vies].sort((a, b) => b.age - a.age).slice(0, 10)

  // ——— Enfants ———
  const histoEnfants = Array.from({ length: 16 }, (_, i) => (i === 15 ? '16+' : String(i + 1)))
  const grandesFamilles = [...s.fratries].sort((a, b) => b.enfants - a.enfants).slice(0, 6)
  const enfantsParSiecle: Serie[] = [{
    nom: 'Enfants par couple', couleur: 'var(--accent)',
    valeurs: siecles.map((x) => valeur(resumer(brut.fratries.filter((f) => f.siecle === x).map((f) => f.enfants)), mesure)),
    n: siecles.map((x) => brut.fratries.filter((f) => f.siecle === x).length),
  }]
  const ecart = resumer(s.ecarts.map((x) => x.ecart))
  const femmesPlusAgees = s.ecarts.filter((x) => x.ecart < 0).length

  // ——— Calendrier ———
  const parMois = MOIS.map((_, i) => s.mois.filter((x) => x.type === calendrier && x.mois === i + 1).length)
  const totalMois = parMois.reduce((a, b) => a + b, 0)

  // ——— Prénoms, noms, métiers, lieux ———
  const topPrenoms = (sexe: Sexe) => classerPrenoms(s.prenoms.filter((p) => p.sexe === sexe), regrouper).slice(0, 15)
  const topNoms = compter(s.noms, (p) => p.nom).slice(0, 15)
  const metiersFiltres = sexeMetiers === 'tous' ? s.metiers : s.metiers.filter((m) => m.sexe === sexeMetiers)
  const topMetiers = compter(metiersFiltres, (m) => m.cle).slice(0, 15)
  const topLieux = compter(s.naissances, (n) => n.lieu).slice(0, 15)
  const nomsPays = useMemo(() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }) } catch { return undefined } }, [])
  const pays = compter(s.naissances, (n) => n.pays ?? 'inconnu').slice(0, 10)
  const sedentaires: Serie[] = [{
    nom: 'Né(e) dans la commune de son père', couleur: 'var(--accent)',
    valeurs: siecles.map((x) => { const l = brut.sedentaires.filter((v) => v.siecle === x); return l.length >= 3 ? (l.filter((v) => v.meme).length / l.length) * 100 : undefined }),
    n: siecles.map((x) => brut.sedentaires.filter((v) => v.siecle === x).length),
  }]

  // ——— Sources ———
  const TYPES: { type: 'naissance' | 'mariage' | 'deces'; nom: string; couleur: string }[] = [
    { type: 'naissance', nom: 'Naissances', couleur: 'var(--vif1)' },
    { type: 'mariage', nom: 'Mariages', couleur: 'var(--vif2)' },
    { type: 'deces', nom: 'Décès', couleur: 'var(--vif3)' },
  ]
  const sourcesParSiecle: Serie[] = TYPES.map(({ type, nom, couleur }) => ({
    nom, couleur,
    valeurs: siecles.map((x) => { const l = brut.sources.filter((v) => v.type === type && v.siecle === x); return l.length ? (l.filter((v) => v.source).length / l.length) * 100 : undefined }),
    n: siecles.map((x) => brut.sources.filter((v) => v.type === type && v.siecle === x).length),
  }))

  // ——— Ascendance (le détail est sur sa propre page) ———
  // Une génération est complète quand toutes les places qui peuvent l'être sont occupées
  const derniereComplete = gens.filter((g) => g.connus === g.theoriques - g.closes).length

  const libelleSexe = (x: Sexe | 'tous') => (x === 'M' ? 'les hommes' : x === 'F' ? 'les femmes' : 'personne')
  const outilMesure = <Choix label="Mesure" options={[['moyenne', 'Moyenne'], ['mediane', 'Médiane']]} valeur={mesure} changer={setMesure} />

  return (
    <section class="ecran statistiques">
      <header class="titre-ecran">
        <h1>Statistiques</h1>
        <p class="sous-titre">
          Ce que racontent les dates, les lieux et les métiers de l'arbre. Les âges ne tiennent compte que des dates
          exactes ou approximatives (« vers ») ; les siècles sont ceux de la naissance, estimée au besoin.
        </p>
      </header>

      <div class="filtres">
        <ChoixPerimetre valeur={perimetre} changer={setPerimetre} />
        {outilMesure}
      </div>
      <div class="segments siecles" role="radiogroup" aria-label="Siècle">
        <button type="button" role="radio" aria-checked={filtreSiecle === null} class={filtreSiecle === null ? 'actif' : ''} onClick={() => setFiltreSiecle(null)}>Tous les siècles</button>
        {siecles.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={filtreSiecle === x} class={filtreSiecle === x ? 'actif' : ''} onClick={() => setFiltreSiecle(x)}>{court(x)}</button>
        ))}
      </div>

      <div class="chiffres bref">
        <Chiffre valeur={nombre(s.personnes.length)} legende="personnes" detail={<><span class="h">{nombre(hommes)} hommes</span><br /><span class="f">{nombre(femmes)} femmes</span></>} />
        <Chiffre valeur={ansTexte(valeur(vie, mesure))} legende={`durée de vie ${mesure === 'moyenne' ? 'moyenne' : 'médiane'}`} detail={adultes ? 'adultes (15 ans et plus)' : 'dès la naissance'} />
        <Chiffre valeur={enfants ? ans(valeur(enfants, mesure)!) : '–'} legende="enfants par couple" detail="couples avec au moins un enfant connu" />
        <Chiffre valeur={nombre(prenomsDistincts)} legende="prénoms différents" />
        <Chiffre valeur={nombre(nomsDistincts)} legende="patronymes" />
        <Chiffre valeur={nombre(new Set(s.naissances.map((n) => n.lieu)).size)} legende="lieux de naissance" />
        <Chiffre valeur={nombre(new Set(s.metiers.map((m) => m.cle)).size)} legende="métiers" />
        <Chiffre valeur={pourcent(sources, s.sources.length)} legende="des faits sourcés" detail={`${nombre(sources)} sur ${nombre(s.sources.length)}`} />
        {filtreSiecle === null && Number.isFinite(plusAncien) && <Chiffre valeur={court(plusAncien)} legende="siècle le plus ancien" />}
      </div>

      <div class="stats-grille">
        <Section titre="Durée de vie" sous="Âge au décès (ou à l'inhumation)." large
          outils={<Choix label="Âges pris en compte" options={[['non', 'Dès la naissance'], ['oui', 'Adultes (15 ans +)']]} valeur={adultes ? 'oui' : 'non'} changer={(v) => setAdultes(v === 'oui')} />}>
          <ParSexe liste={s.vies} m={mesure} legende={`Durée de vie ${mesure === 'moyenne' ? 'moyenne' : 'médiane'}`} />
          <div class="deux">
            <div>
              <h3>Par siècle de naissance</h3>
              <Colonnes ariaLabel="Durée de vie par siècle" categories={cats} series={seriesParSiecle(s.viesToutes, siecles, mesure)} format={ans} actif={actif} rogner />
              <Legende series={SEXES} />
            </div>
            <div>
              <h3>Âge au décès, par tranche de 5 ans</h3>
              <Colonnes ariaLabel="Répartition des âges au décès" categories={tranches} series={histoVie} empile />
              <Legende series={SEXES} />
            </div>
          </div>
          {doyens.length > 0 && (
            <details class="doyens">
              <summary>Les plus longues vies</summary>
              <ol>
                {doyens.map((x) => <li key={x.id}><Personne d={d} id={x.id} annees /> <span class="age">{Math.floor(x.age)} ans</span></li>)}
              </ol>
            </details>
          )}
        </Section>

        <Section titre="Mariage" sous="Âge au premier mariage.">
          <ParSexe liste={s.mariages} m={mesure} legende={`Âge ${mesure === 'moyenne' ? 'moyen' : 'médian'}`} />
          <h3>Par siècle de naissance</h3>
          <Colonnes ariaLabel="Âge au premier mariage par siècle" categories={cats} series={seriesParSiecle(brut.mariages, siecles, mesure)} format={ans} actif={actif} rogner />
          <Legende series={SEXES} />
          {ecart && (
            <p class="constat">
              Le mari a en {mesure === 'moyenne' ? 'moyenne' : 'médiane'} <strong>{ansTexte(Math.abs(valeur(ecart, mesure)!))}</strong> de {valeur(ecart, mesure)! >= 0 ? 'plus' : 'moins'} que sa femme ;
              la femme est l'aînée dans <strong>{pourcent(femmesPlusAgees, s.ecarts.length)}</strong> des {nombre(s.ecarts.length)} couples dont on connaît les deux naissances.
            </p>
          )}
        </Section>

        <Section titre="Enfants" sous="Couples avec au moins un enfant connu.">
          <div class="chiffres">
            <Chiffre valeur={enfants ? ans(valeur(enfants, mesure)!) : '–'} legende={`enfants par couple (${mesure === 'moyenne' ? 'moyenne' : 'médiane'})`} detail={enfants ? `${nombre(enfants.n)} couples` : undefined} />
            <Chiffre valeur={ansTexte(valeur(resumer(s.parents.filter((x) => x.sexe === 'F').map((x) => x.age)), mesure))} legende="âge des mères à la naissance" />
            <Chiffre valeur={ansTexte(valeur(resumer(s.parents.filter((x) => x.sexe === 'M').map((x) => x.age)), mesure))} legende="âge des pères à la naissance" />
          </div>
          <h3>Nombre d'enfants par couple</h3>
          <Colonnes ariaLabel="Répartition du nombre d'enfants" categories={histoEnfants}
            series={[{ nom: 'Couples', couleur: 'var(--accent)', valeurs: histoEnfants.map((_, i) => s.fratries.filter((f) => (i === 15 ? f.enfants >= 16 : f.enfants === i + 1)).length) }]} />
          <h3>Par siècle</h3>
          <Colonnes ariaLabel="Enfants par couple et par siècle" categories={cats} series={enfantsParSiecle} format={ans} actif={actif} hauteur={180} rogner />
          <h3>Âge des parents à la naissance, par siècle</h3>
          <Colonnes ariaLabel="Âge des parents à la naissance par siècle" categories={cats} series={seriesParSiecle(brut.parents, siecles, mesure).map((x, i) => ({ ...x, nom: i ? 'Mères' : 'Pères' }))} format={ans} actif={actif} hauteur={180} rogner />
          <Legende series={[{ nom: 'Pères', couleur: HOMMES }, { nom: 'Mères', couleur: FEMMES }]} />
          {grandesFamilles.length > 0 && (
            <details class="doyens">
              <summary>Les familles les plus nombreuses</summary>
              <ol>
                {grandesFamilles.map((f) => {
                  const fam = d.arbre.familles.get(f.famille)!
                  return <li key={f.famille}>{fam.mari && <Personne d={d} id={fam.mari} />}{fam.mari && fam.femme && ' et '}{fam.femme && <Personne d={d} id={fam.femme} />} <span class="age">{f.enfants} enfants</span></li>
                })}
              </ol>
            </details>
          )}
        </Section>

        <Section titre="Au fil de l'année" sous="Mois des événements datés au jour ou au mois près."
          outils={<Choix label="Événements" options={[['naissances', 'Naissances'], ['mariages', 'Mariages'], ['deces', 'Décès']]} valeur={calendrier} changer={setCalendrier} />}>
          <Colonnes ariaLabel="Événements par mois" categories={MOIS}
            series={[{ nom: calendrier, couleur: calendrier === 'naissances' ? 'var(--serie1)' : calendrier === 'mariages' ? 'var(--serie2)' : 'var(--serie3)', valeurs: parMois.map((n) => (totalMois ? (n / totalMois) * 100 : 0)), n: parMois }]}
            format={pc} />
          <p class="aide">
            {nombre(totalMois)} événements.
            {calendrier === 'mariages' && ' Autrefois, on se mariait peu pendant le Carême (mars) et l\'Avent (décembre), et beaucoup après les récoltes.'}
            {calendrier === 'naissances' && ' Une naissance en hiver reflète souvent un mariage du printemps précédent.'}
            {calendrier === 'deces' && ' Les hivers et la fin de l\'été (épidémies) étaient les saisons les plus meurtrières.'}
          </p>
        </Section>

        <Section titre="Pays et sédentarité">
          <h3>Pays de naissance</h3>
          <Classement lignes={pays.map(([p, n]) => ({ cle: p, libelle: p === 'inconnu' ? 'Non précisé' : nomsPays?.of(p) ?? p, parts: [n] }))} couleurs={['var(--or)']} />
          <h3>Né(e) dans la même commune que son père</h3>
          <Colonnes ariaLabel="Part des personnes nées dans la commune de leur père" categories={cats} series={sedentaires} format={pc} max={100} actif={actif} hauteur={180} rogner />
        </Section>

        <Section titre="Prénoms et patronymes" sous="Premier prénom de chacun ; noms de famille." large
          outils={<Choix label="Variantes des prénoms" options={[['oui', 'Variantes regroupées'], ['non', 'Formes exactes']]} valeur={regrouper ? 'oui' : 'non'} changer={(v) => setRegrouper(v === 'oui')} />}>
          <div class="trois">
            <div>
              <h3 class="h">Garçons</h3>
              <Classement lignes={topPrenoms('M').map(lignePrenom)} couleurs={[HOMMES]} />
            </div>
            <div>
              <h3 class="f">Filles</h3>
              <Classement lignes={topPrenoms('F').map(lignePrenom)} couleurs={[FEMMES]} />
            </div>
            <div>
              <h3>Patronymes</h3>
              <Classement lignes={topNoms.map(([p, n]) => ({ cle: p, libelle: p, parts: [n] }))} couleurs={['var(--accent)']} />
            </div>
          </div>
        </Section>

        <Section titre="Métiers" sous="Personnes ayant exercé chaque métier."
          outils={<Choix label="Sexe" options={[['tous', 'Tous'], ['M', 'Hommes'], ['F', 'Femmes']]} valeur={sexeMetiers} changer={setSexeMetiers} />}>
          <Classement noms={['Hommes', 'Femmes', 'Sexe inconnu']} couleurs={[HOMMES, FEMMES, AUTRE]}
            lignes={topMetiers.map(([cle]) => {
              const l = metiersFiltres.filter((m) => m.cle === cle)
              return {
                cle,
                libelle: <a href={lienMetier(cle)}>{d.metiers.metiers.get(cle)?.titre ?? cle}</a>,
                parts: [l.filter((m) => m.sexe === 'M').length, l.filter((m) => m.sexe === 'F').length, l.filter((m) => m.sexe === '?').length],
              }
            })} />
          {topMetiers.length === 0 && <p class="aucun">Aucun métier pour {libelleSexe(sexeMetiers)} dans ce choix.</p>}
          <Legende series={[{ nom: 'Hommes', couleur: HOMMES }, { nom: 'Femmes', couleur: FEMMES }]} />
        </Section>

        <Section titre="Lieux de naissance">
          <Classement lignes={topLieux.map(([lieu, n]) => ({ cle: lieu, libelle: <a href={'#/lieux/' + encodeURIComponent(lieu)}>{lieu.split(',')[0]}</a>, parts: [n] }))} couleurs={['var(--accent)']} />
        </Section>

        <Section titre="Sources" sous="Part des faits renseignés qui ont une source, par siècle de naissance." large>
          <Colonnes ariaLabel="Part des faits sourcés par siècle" categories={cats} series={sourcesParSiecle} format={pc} max={100} actif={actif} rogner />
          <Legende series={TYPES} />
        </Section>

        <Section titre="Ascendance" sous="Ancêtres retrouvés génération par génération, branches, lignées, pistes et implexe : tout est sur la page Ascendance." large>
          <div class="chiffres">
            <Chiffre valeur={nombre(d.ancetres.size)} legende="ancêtres différents" detail={`${nombre(gens.length)} générations`} />
            <Chiffre valeur={String(derniereComplete)} legende="générations complètes" />
          </div>
          <p><a class="bouton" href="#/ascendance">Voir la page Ascendance</a></p>
        </Section>
      </div>
    </section>
  )
}

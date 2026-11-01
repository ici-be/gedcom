// Accueil : déposer son fichier, puis le bilan de l'arbre et les réglages.

import { useMemo, useRef, useState } from 'preact/hooks'
import { membres, type Bilan, type Donnees, type Perimetre, type Releve } from '../lib/donnees'
import { communes } from '../lib/communes'
import { adresseDevinee, normaliserAdresse } from '../lib/geneanet'
import { nombre, pourcent } from '../lib/format'
import { aChercher, score } from '../lib/suivi'
import { GENERATIONS_EVENTAIL } from '../lib/ascendance'
import '@fontsource/fraunces/latin-400.css'
import { Annees, Personne, Photo } from './commun'
import { ChoixModeles } from './arbres/Vignettes'
import { CarteAccueil } from './CarteAccueil'
import { preparerAFaire } from './Individus'
import { t } from '../lib/i18n'

export function Depot({ ouvrir, compact }: { ouvrir: (f: File) => void; compact?: boolean }) {
  const [survol, setSurvol] = useState(false)
  const champ = useRef<HTMLInputElement>(null)
  const choisir = (fichiers: FileList | null | undefined) => {
    const f = fichiers?.[0]
    if (f) ouvrir(f)
  }
  return (
    <div
      class={'depot' + (survol ? ' survol' : '') + (compact ? ' compact' : '')}
      onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => { e.preventDefault(); setSurvol(false); choisir(e.dataTransfer?.files) }}
    >
      <input ref={champ} type="file" accept=".ged,.zip,.GED,.ZIP" hidden onChange={(e) => choisir(e.currentTarget.files)} />
      {!compact && <p class="depot-titre">{t('Déposez ici votre export GEDCOM')}</p>}
      {compact
        ? <p><button type="button" class="bouton" onClick={() => champ.current?.click()}>{t('Mettre à jour le fichier Gedcom')}</button><span class="aide">{t('ou déposez le nouvel export ici')}</span></p>
        : <p>{t('Le fichier .ged, ou directement le .zip téléchargé depuis Geneanet.')} <button type="button" class="bouton" onClick={() => champ.current?.click()}>{t('Choisir un fichier')}</button></p>}
    </div>
  )
}

/** Page /print/, dans le menu, tant qu'aucun fichier n'est chargé */
export function AideGedcom() {
  return (
    <div class="menu-aide">
      <p><strong>{t('Pour commencer')}</strong>{t(' : mettez d’abord votre fichier Gedcom avec le bouton ci-dessous (ou déposez-le sur la page).')}</p>
      <p>
        {t('Sur Geneanet, il s’exporte depuis')} <a href="https://gw.geneanet.org/my-tree/operations/export" target="_blank" rel="noopener noreferrer">{t('Mon arbre → Exporter')}</a>.{' '}
        {t('Le mieux est de déposer le dossier .zip complet tel qu’il est téléchargé, sans le décompresser.')}{' '}
        {t('Pour imprimer un arbre avec des photos, cochez « Liens web vers les photos principales des individus ».')}
      </p>
      <p>{t('Un export Gedcom d’un autre site ou logiciel (Heredis, Ancestris, Gramps, RootsMagic…) convient aussi.')}</p>
    </div>
  )
}

export function Bienvenue({ ouvrir, erreur, impression }: { ouvrir: (f: File) => void; erreur?: string; impression?: boolean }) {
  if (impression) return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>{t('Arbres à imprimer')}</h1>
        <p class="sous-titre">{t('Une feuille prête pour l’imprimeur ou pour un PDF, faite à partir de l’ascendance du Sosa 1.')}</p>
        <p class="sous-titre">{t('Déposez l’export Gedcom de votre arbre pour en préparer un tirage : arbre d’ascendance, descendants, éventail… Le fichier est lu par votre navigateur et n’est envoyé nulle part.')}</p>
      </header>
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      <ChoixModeles />
    </section>
  )
  return (
    <section class="ecran bienvenue">
      <header class="titre-ecran">
        <h1>Où en sont les sources de votre arbre ?</h1>
        <p class="sous-titre">
          Lignées lit l'export GEDCOM de votre arbre et montre, pour vos ancêtres comme pour toute la famille,
          ce qui est sourcé, ce qui ne l'est pas encore et ce qui manque, personne par personne et commune par commune.
        </p>
      </header>
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      <Depot ouvrir={ouvrir} />
      <div class="etapes">
        <div>
          <h2>1. Exporter</h2>
          <p>
            Sur Geneanet : <a href="https://gw.geneanet.org/my-tree/operations/export" target="_blank" rel="noopener noreferrer">Mon arbre → Exporter</a>,
            puis « Mon arbre en ligne » au format GEDCOM. Les exports d'Heredis, Ancestris, Gramps, GeneWeb ou RootsMagic fonctionnent aussi.
          </p>
        </div>
        <div>
          <h2>2. Déposer</h2>
          <p>Inutile de décompresser : le .zip de Geneanet peut être déposé tel quel, les images qu'il contient sont ignorées.</p>
        </div>
        <div>
          <h2>3. Rien ne quitte votre ordinateur</h2>
          <p>Le fichier est lu par votre navigateur et gardé dans celui-ci pour la prochaine visite. Aucune donnée n'est envoyée sur Internet.</p>
        </div>
      </div>
    </section>
  )
}

/** Une jauge circulaire : la part de faits sourcés */
interface Niveau { n: number; total: number; libelle: string }

/** Un anneau par niveau (le premier à l'extérieur) ; le pourcentage au centre est celui du premier */
function Jauge({ titre, niveaux }: { titre: string; niveaux: Niveau[] }) {
  const [premier] = niveaux
  return (
    <div class="ac-jauge">
      <svg viewBox="0 0 108 108" role="img" aria-label={`${titre} : ${niveaux.map((v) => `${v.libelle} ${pourcent(v.n, v.total)}`).join(', ')}`}>
        {niveaux.map((v, i) => {
          const R = 45 - i * 12, C = 2 * Math.PI * R
          return (
            <g key={v.libelle} class={'anneau a' + i}>
              <circle class="piste" cx="54" cy="54" r={R} />
              <circle class="valeur" cx="54" cy="54" r={R} stroke-dasharray={`${(v.total ? v.n / v.total : 0) * C} ${C}`} transform="rotate(-90 54 54)" />
            </g>
          )
        })}
      </svg>
      <span class={'ac-pct' + (niveaux.length > 1 ? ' double' : '')}>{(() => {
        const m = pourcent(premier.n, premier.total).match(/^(.*?)[\s\u202f\u00a0]*%$/)
        return m ? <>{m[1]}<small>%</small></> : pourcent(premier.n, premier.total)
      })()}</span>
      <strong>{titre}</strong>
      {niveaux.map((v, i) => (
        <span key={v.libelle} class="ac-detail">
          {niveaux.length > 1 && <i class={'ac-puce a' + i} />}
          {niveaux.length > 1 ? <>{v.libelle} : <b>{pourcent(v.n, v.total)}</b></> : null}
          {niveaux.length > 1 ? ` · ${nombre(v.n)}/${nombre(v.total)}` : `${nombre(v.n)} faits sur ${nombre(v.total)}`}
        </span>
      ))}
    </div>
  )
}

const ICONES_ACTIONS: Record<string, string> = {
  sources: 'M3 2.5h7l3 3v8H3zM5.5 8h5M5.5 10.5h5',
  lieux: 'M8 14.5s5-4.5 5-8.5a5 5 0 0 0-10 0c0 4 5 8.5 5 8.5zM8 4.6a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 1 1 0-2.8',
  anomalies: 'M8 2l6.5 11.5h-13zM8 6.5v3.2M8 11.6v.4',
  doublons: 'M2 2.5h8v8H2zM6 5.5h8v8H6z',
  parente: 'M8 2.5a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6M3.5 11a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6M12.5 11a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6M8 6.1v2M8 8.1H3.5V11M8 8.1h4.5V11',
  archives: 'M2.5 3h11v3h-11zM3.5 6v7.5h9V6M6.5 9h3',
  chronologie: 'M4 2.5v11M4 4h8M4 8h5M4 12h7',
}

function Tuile({ icone, valeur, texte, lien, principale, onClick }: { icone: string; valeur?: number; texte: string; lien: string; principale?: boolean; onClick?: () => void }) {
  return (
    <a class={'ac-tuile' + (principale ? ' principale' : '') + (valeur === 0 ? ' fait' : '')} href={lien} onClick={onClick}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICONES_ACTIONS[icone]} /></svg>
      {valeur !== undefined && <strong>{valeur === 0 ? '✓' : nombre(valeur)}</strong>}
      <span>{texte}</span>
      <i aria-hidden="true">→</i>
    </a>
  )
}

/** Les progrès depuis l'import précédent du même arbre ; les chiffres des ancêtres seulement pour la même personne de départ */
function Progres({ d, bilan, precedent }: { d: Donnees; bilan: Bilan; precedent?: Releve }) {
  if (!precedent) return null
  const diff = (f: (b: Bilan) => number) => {
    const n = f(bilan) - f(precedent.bilan)
    return (n > 0 ? '+' : n < 0 ? '−' : '') + nombre(Math.abs(n))
  }
  const memeRacine = precedent.racine === d.racine
  type Ligne = [string, (b: Bilan) => number, string?]
  const lignes: Ligne[] = [
    ...(memeRacine ? [['faits sourcés chez les ancêtres', (b: Bilan) => b.faitsAncetres.sources], ['ancêtres', (b: Bilan) => b.ancetres]] as Ligne[] : []),
    ['faits sourcés dans tout l’arbre', (b) => b.faits.sources],
    ['personnes', (b) => b.individus],
  ]
  // les contrôles de qualité : seulement si l'ancien relevé les avait déjà
  const controles: [keyof Bilan, string, string][] = [
    ['anomalies', 'anomalies de dates', '#/anomalies'],
    ['encodages', 'mauvais encodages', '#/anomalies'],
    ['doublons', 'doublons potentiels', '#/doublons'],
  ]
  for (const [k, titre, lien] of controles) {
    if (precedent.bilan[k] !== undefined && bilan[k] !== undefined) lignes.push([titre, (b) => (b[k] as number | undefined) ?? 0, lien])
  }
  const rien = lignes.every(([, f]) => f(bilan) === f(precedent.bilan))
  return (
    <section class="panneau">
      <h2>Depuis l'export du {new Date(precedent.date).toLocaleDateString('fr-BE')}</h2>
      {rien ? <p class="aide">Aucun changement dans les chiffres.</p> : (
        <ul class="progres">
          {lignes.map(([t, f, lien]) => f(bilan) === f(precedent.bilan) && lien ? null : <li key={t}><strong>{diff(f)}</strong> {lien ? <a href={lien}>{t}</a> : t}</li>)}
        </ul>
      )}
      {!memeRacine && <p class="aide">La personne de départ a changé depuis : seuls les chiffres de tout l’arbre sont comparés.</p>}
    </section>
  )
}

interface PropsTableau {
  d: Donnees
  bilan: Bilan
  precedent?: Releve
  fichier: { nom: string; importe: string }
  setAdresse: (a: string) => void
  setPerimetre: (p: Perimetre) => void
  oublier: () => void
}

export function TableauDeBord({ d, bilan, precedent, fichier, setAdresse, setPerimetre, oublier }: PropsTableau) {
  const [saisie, setSaisie] = useState(d.adresse)
  const devinee = adresseDevinee(d.arbre.origine)
  const racine = d.arbre.individus.get(d.racine)
  const valider = (a: string) => {
    const n = normaliserAdresse(a)
    setSaisie(n)
    setAdresse(n)
  }
  const chiffres = useMemo(() => {
    let aSourcer = 0
    for (const id of d.ancetres.keys()) {
      const s = d.suivis.get(id)
      if (s && [s.naissance.etat, s.mariage, s.deces.etat].some(aChercher)) aSourcer++
    }
    const lieux = communes(d.arbre, membres(d, 'ancetres'), false).filter((c) => c.sansSource > 0).length
    let visages = 0
    let signatures = 0
    let chezAncetres = 0
    for (const ind of d.arbre.individus.values()) {
      if (!ind.photo) continue
      if (ind.photo.signature) signatures++
      else visages++
      if (d.ancetres.has(ind.id)) chezAncetres++
    }
    return { aSourcer, lieux, visages, signatures, chezAncetres }
  }, [d])
  const photos = chiffres.visages + chiffres.signatures
  const dixGen = useMemo(() => {
    const r = { attendus: 0, sources: 0 }
    for (const [id, a] of d.ancetres) {
      const sv = d.suivis.get(id)
      if (!sv || a.generation > GENERATIONS_EVENTAIL) continue
      const sc = score(sv)
      r.attendus += sc.attendus
      r.sources += sc.sources
    }
    return r
  }, [d])
  const verifs = (bilan.anomalies ?? 0) + (bilan.encodages ?? 0)
  const initiales = racine ? ((racine.prenom[0] ?? '') + (racine.nom[0] ?? '')).toUpperCase() || '?' : '?'
  return (
    <section class="ecran accueil">
      <header class="ac-hero">
        <div class="ac-identite">
          {racine?.photo && !racine.photo.signature
            ? <Photo ind={racine} classe="ac-portrait" />
            : <span class={`ac-avatar ${racine?.sexe === 'F' ? 'f' : racine?.sexe === 'M' ? 'h' : ''}`} aria-hidden="true">{initiales}</span>}
          <div>
            <p class="ac-etiquette">Personne de départ · Sosa 1</p>
            <h1>{racine ? <>{racine.prenom} <span>{racine.nom}</span></> : 'Votre arbre'}</h1>
            {racine && <p class="ac-vie"><Annees ind={racine} /></p>}
            <p class="ac-fichier">
              <span>{fichier.nom}</span>
              <span>chargé le {new Date(fichier.importe).toLocaleString('fr-BE', { dateStyle: 'long', timeStyle: 'short' })}</span>
            </p>
          </div>
        </div>
        <div class="ac-jauges">
          <Jauge titre="Ancêtres sourcés" niveaux={[
            { n: bilan.faitsAncetres.sources, total: bilan.faitsAncetres.attendus, libelle: 'tous' },
            { n: dixGen.sources, total: dixGen.attendus, libelle: `${GENERATIONS_EVENTAIL} gén.` },
          ]} />
          <Jauge titre="Tout l’arbre" niveaux={[{ n: bilan.faits.sources, total: bilan.faits.attendus, libelle: 'tout' }]} />
        </div>
      </header>

      <ul class="ac-chiffres">
        <li><strong>{nombre(bilan.ancetres)}</strong><span>ancêtres</span><small>sur {bilan.generations} générations</small></li>
        <li><strong>{nombre(bilan.individus)}</strong><span>personnes</span><small>{nombre(bilan.familles)} familles</small></li>
        {photos > 0 && <li><strong>{nombre(photos)}</strong><span>photos et signatures</span><small>{nombre(chiffres.visages)} visage{chiffres.visages > 1 ? 's' : ''} · {nombre(chiffres.signatures)} signature{chiffres.signatures > 1 ? 's' : ''}</small></li>}
      </ul>

      <h2 class="ac-titre">À faire</h2>
      <nav class="ac-actions" aria-label="À faire">
        <Tuile icone="sources" valeur={chiffres.aSourcer} texte="ancêtres à sourcer" lien="#/personnes" principale onClick={() => { setPerimetre('ancetres'); preparerAFaire() }} />
        <Tuile icone="lieux" valeur={chiffres.lieux} texte="lieux à dépouiller" lien="#/lieux" onClick={() => setPerimetre('ancetres')} />
        {bilan.anomalies !== undefined && <Tuile icone="anomalies" valeur={verifs} texte="anomalies à vérifier" lien="#/anomalies" />}
        {bilan.doublons !== undefined && <Tuile icone="doublons" valeur={bilan.doublons} texte="doublons possibles" lien="#/doublons" />}
      </nav>

      <div class="ac-explorer">
        <span>Explorer</span>
        <a href="#/parente"><svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICONES_ACTIONS.parente} /></svg>Calculateur de parenté</a>
        <a href="#/archives"><svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICONES_ACTIONS.archives} /></svg>Plan de visite d’archives</a>
        {racine && <a href={'#/chronologie/' + encodeURIComponent(racine.id)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICONES_ACTIONS.chronologie} /></svg>Chronologie de {racine.prenom.split(' ')[0] || racine.nom}</a>}
      </div>

      <div class="accueil-duo">
        <CarteAccueil d={d} />
        <Progres d={d} bilan={bilan} precedent={precedent} />
      </div>

      <details class="ac-aide">
        <summary>Comment sont comptés les faits ?</summary>
        <p>Un « fait », c'est une naissance (ou un baptême), un mariage ou un décès (ou une inhumation). Il est sourcé quand au moins une source y est attachée.</p>
        <p>Un parent inconnu, un acte introuvable, une personne qui ne savait pas signer : ce que le GEDCOM ne sait pas dire s'écrit dans les notes, voir les <a href="#/annotations">annotations</a>.</p>
      </details>

      <details class="panneau reglages ac-reglages" open={!d.adresse}>
        <summary><h2>Réglages</h2></summary>
        <p class="aide">La personne de départ (Sosa 1) se change en haut de chaque page.</p>
        <div class="reglage">
          <h3>Adresse de l'arbre en ligne</h3>
          <p class="aide">Pour que chaque nom ouvre la fiche correspondante sur Geneanet (ou sur un autre site GeneWeb).</p>
          <form class="ligne" onSubmit={(e) => { e.preventDefault(); valider(saisie) }}>
            <input type="text" inputMode="url" spellcheck={false} value={saisie} onInput={(e) => setSaisie(e.currentTarget.value)} placeholder="https://gw.geneanet.org/votre_identifiant" aria-label="Adresse de l'arbre en ligne" />
            <button type="submit" class="bouton">Enregistrer</button>
          </form>
          {devinee && d.adresse === devinee && (
            <p class="aide">Adresse trouvée dans le fichier. Pour ouvrir les fiches en mode modification, indiquez la vôtre (par exemple {devinee}_w).</p>
          )}
          {d.adresse && racine && <p class="aide">Essai : <Personne d={d} id={racine.id} /></p>}
        </div>
        <div class="reglage">
          <h3>Fichier</h3>
          <p class="aide">
            <button type="button" class="lien danger" onClick={() => { if (confirm('Effacer le fichier et les réglages gardés dans ce navigateur ?')) oublier() }}>
              Oublier mon arbre sur cet appareil
            </button>
          </p>
        </div>
      </details>
    </section>
  )
}

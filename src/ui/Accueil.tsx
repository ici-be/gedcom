// Accueil : déposer son fichier, puis le bilan de l'arbre et les réglages.

import { useMemo, useRef, useState } from 'preact/hooks'
import { membres, type Bilan, type Donnees, type Perimetre, type Releve } from '../lib/donnees'
import { communes } from '../lib/communes'
import { adresseDevinee, normaliserAdresse } from '../lib/geneanet'
import { nombre, pourcent } from '../lib/format'
import { aChercher } from '../lib/suivi'
import { Barre, Personne } from './commun'
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
      <p><strong>{t('Pour commencer')}</strong>{t(' : mettez d’abord votre fichier Gedcom avec le bouton ci-dessous (ou déposez-le sur la page).')}</p>
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
        <p class="sous-titre">{t('Déposez l’export Gedcom de votre arbre pour en préparer un tirage : arbre d’ascendance, descendants, éventail… Le fichier est lu par votre navigateur et n’est envoyé nulle part.')}</p>
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

function Carte({ titre, valeur, detail, barre }: { titre: string; valeur: string; detail?: string; barre?: [number, number] }) {
  return (
    <div class="carte">
      <span class="carte-titre">{titre}</span>
      <span class="carte-valeur">{valeur}</span>
      {barre && <Barre n={barre[0]} total={barre[1]} />}
      {detail && <span class="carte-detail">{detail}</span>}
    </div>
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
  const lignes: [string, (b: Bilan) => number][] = [
    ...(memeRacine ? [['faits sourcés chez les ancêtres', (b: Bilan) => b.faitsAncetres.sources], ['ancêtres', (b: Bilan) => b.ancetres]] as [string, (b: Bilan) => number][] : []),
    ['faits sourcés dans tout l’arbre', (b) => b.faits.sources],
    ['personnes', (b) => b.individus],
  ]
  const rien = lignes.every(([, f]) => f(bilan) === f(precedent.bilan))
  return (
    <section class="panneau">
      <h2>Depuis l'export du {new Date(precedent.date).toLocaleDateString('fr-BE')}</h2>
      {rien ? <p class="aide">Aucun changement dans les chiffres.</p> : (
        <ul class="progres">
          {lignes.map(([t, f]) => <li key={t}><strong>{diff(f)}</strong> {t}</li>)}
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
  return (
    <section class="ecran accueil">
      <header class="titre-ecran accueil-tete">
        <div>
          <h1>{racine ? <>Arbre de {racine.prenom} {racine.nom}</> : 'Votre arbre'}</h1>
          <p class="sous-titre">{fichier.nom} · chargé le {new Date(fichier.importe).toLocaleString('fr-BE', { dateStyle: 'long', timeStyle: 'short' })}</p>
        </div>
      </header>

      <div class="cartes">
        <Carte titre="Ancêtres sourcés" valeur={pourcent(bilan.faitsAncetres.sources, bilan.faitsAncetres.attendus)} barre={[bilan.faitsAncetres.sources, bilan.faitsAncetres.attendus]}
          detail={`${nombre(bilan.faitsAncetres.sources)} faits sur ${nombre(bilan.faitsAncetres.attendus)}`} />
        <Carte titre="Tout l'arbre sourcé" valeur={pourcent(bilan.faits.sources, bilan.faits.attendus)} barre={[bilan.faits.sources, bilan.faits.attendus]}
          detail={`${nombre(bilan.faits.sources)} faits sur ${nombre(bilan.faits.attendus)}`} />
        <Carte titre="Ancêtres" valeur={nombre(bilan.ancetres)} detail={`sur ${bilan.generations} générations`} />
        <Carte titre="Personnes" valeur={nombre(bilan.individus)} detail={`${nombre(bilan.familles)} familles`} />
        {photos > 0 && <Carte titre="Photos et signatures" valeur={nombre(photos)}
          detail={`${nombre(chiffres.visages)} visage${chiffres.visages > 1 ? 's' : ''} · ${nombre(chiffres.signatures)} signature${chiffres.signatures > 1 ? 's' : ''} · ${nombre(chiffres.chezAncetres)} chez les ancêtres`} />}
      </div>

      <nav class="raccourcis">
        <a class="bouton principal" href="#/personnes" onClick={() => { setPerimetre('ancetres'); preparerAFaire() }}>
          <strong>{nombre(chiffres.aSourcer)}</strong> ancêtres à sourcer
        </a>
        <a class="bouton" href="#/lieux" onClick={() => setPerimetre('ancetres')}>
          <strong>{nombre(chiffres.lieux)}</strong> lieux à dépouiller
        </a>
      </nav>

      <div class="accueil-duo">
        <CarteAccueil d={d} />
        <Progres d={d} bilan={bilan} precedent={precedent} />
      </div>

      <p class="astuce">Un « fait », c'est une naissance (ou un baptême), un mariage ou un décès (ou une inhumation). Il est sourcé quand au moins une source y est attachée.</p>
      <p class="astuce">Un parent qu'il ne sert à rien de chercher (enfant naturel, enfant trouvé, registres perdus) se signale dans la note de la personne : <a href="#/filiation">« Filiation: père inconnu »…</a></p>
      <p class="astuce">Un acte qui ne se trouvera pas (registres brûlés, lacune) se signale dans la note de l'événement, pour ne plus le compter parmi les sources à chercher : <a href="#/introuvables">« Source: introuvable (les archives ont brûlé en 1914) »</a></p>
      <p class="astuce">Une personne qui ne savait pas écrire se signale dans sa note, pour ne plus chercher sa signature : <a href="#/illettres">« Signature: illettré »</a></p>

      <section class="panneau reglages">
        <h2>Réglages</h2>
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
          {d.adresse && racine && <p class="aide">Essai : <Personne d={d} id={racine.id} /></p>}
        </div>
        <div class="reglage">
          <h3>Fichier</h3>
          <p class="aide">
            <button type="button" class="lien danger" onClick={() => { if (confirm('Effacer le fichier et les réglages gardés dans ce navigateur ?')) oublier() }}>
              Oublier mon arbre sur cet appareil
            </button>
          </p>
        </div>
      </section>
    </section>
  )
}

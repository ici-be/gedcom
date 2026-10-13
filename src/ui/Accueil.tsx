// Accueil : déposer son fichier, puis le bilan de l'arbre et les réglages.

import { useRef, useState } from 'preact/hooks'
import type { Bilan, Donnees, Releve } from '../lib/donnees'
import { adresseDevinee, normaliserAdresse } from '../lib/geneanet'
import { nombre, pourcent } from '../lib/format'
import { Barre, ChoixPersonne, Personne } from './commun'

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
      {!compact && <p class="depot-titre">Déposez ici votre export GEDCOM</p>}
      <p>{compact ? 'Déposez un export plus récent ici, ou ' : 'Le fichier .ged, ou directement le .zip téléchargé depuis Geneanet. '}
        <button type="button" class="bouton" onClick={() => champ.current?.click()}>Choisir un fichier</button>
      </p>
    </div>
  )
}

export function Bienvenue({ ouvrir, erreur }: { ouvrir: (f: File) => void; erreur?: string }) {
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
            Sur Geneanet : <a href="https://gw.geneanet.org/my-tree/operations/export" target="_blank" rel="noopener noreferrer">Mon arbre → Exporter</a>,
            puis « Mon arbre en ligne » au format GEDCOM. Les exports d'Heredis, Ancestris, Gramps, GeneWeb ou RootsMagic fonctionnent aussi.
          </p>
        </div>
        <div>
          <h2>2. Déposer</h2>
          <p>Inutile de décompresser : le .zip de Geneanet peut être déposé tel quel, les images qu'il contient sont ignorées.</p>
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

function Progres({ releves }: { releves: Releve[] }) {
  if (releves.length < 2) return null
  const dernier = releves[releves.length - 1]
  const precedent = releves[releves.length - 2]
  const diff = (f: (b: Bilan) => number) => {
    const n = f(dernier.bilan) - f(precedent.bilan)
    return (n > 0 ? '+' : n < 0 ? '−' : '') + nombre(Math.abs(n))
  }
  return (
    <section class="panneau">
      <h2>Depuis l'export du {new Date(precedent.date).toLocaleDateString('fr-BE')}</h2>
      <ul class="progres">
        <li><strong>{diff((b) => b.faitsAncetres.sources)}</strong> faits sourcés chez les ancêtres</li>
        <li><strong>{diff((b) => b.faits.sources)}</strong> faits sourcés dans tout l'arbre</li>
        <li><strong>{diff((b) => b.ancetres)}</strong> ancêtres</li>
        <li><strong>{diff((b) => b.individus)}</strong> personnes</li>
      </ul>
    </section>
  )
}

interface PropsTableau {
  d: Donnees
  bilan: Bilan
  releves: Releve[]
  fichier: { nom: string; importe: string }
  ouvrir: (f: File) => void
  setRacine: (id: string) => void
  setAdresse: (a: string) => void
  oublier: () => void
}

export function TableauDeBord({ d, bilan, releves, fichier, ouvrir, setRacine, setAdresse, oublier }: PropsTableau) {
  const [saisie, setSaisie] = useState(d.adresse)
  const devinee = adresseDevinee(d.arbre.origine)
  const racine = d.arbre.individus.get(d.racine)
  const valider = (a: string) => {
    const n = normaliserAdresse(a)
    setSaisie(n)
    setAdresse(n)
  }
  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>{racine ? <>Arbre de {racine.prenom} {racine.nom}</> : 'Votre arbre'}</h1>
        <p class="sous-titre">{fichier.nom} · chargé le {new Date(fichier.importe).toLocaleString('fr-BE', { dateStyle: 'long', timeStyle: 'short' })}</p>
      </header>

      <div class="cartes">
        <Carte titre="Ancêtres sourcés" valeur={pourcent(bilan.faitsAncetres.sources, bilan.faitsAncetres.attendus)} barre={[bilan.faitsAncetres.sources, bilan.faitsAncetres.attendus]}
          detail={`${nombre(bilan.faitsAncetres.sources)} faits sur ${nombre(bilan.faitsAncetres.attendus)}`} />
        <Carte titre="Tout l'arbre sourcé" valeur={pourcent(bilan.faits.sources, bilan.faits.attendus)} barre={[bilan.faits.sources, bilan.faits.attendus]}
          detail={`${nombre(bilan.faits.sources)} faits sur ${nombre(bilan.faits.attendus)}`} />
        <Carte titre="Ancêtres" valeur={nombre(bilan.ancetres)} detail={`sur ${bilan.generations} générations`} />
        <Carte titre="Personnes" valeur={nombre(bilan.individus)} detail={`${nombre(bilan.familles)} familles`} />
      </div>
      <p class="astuce">Un « fait », c'est une naissance (ou un baptême), un mariage ou un décès (ou une inhumation). Il est sourcé quand au moins une source y est attachée.</p>
      <p class="astuce">Un parent qu'il ne sert à rien de chercher (enfant naturel, enfant trouvé, registres perdus) se signale dans la note de la personne : <a href="#/filiation">« Filiation : père inconnu »…</a></p>

      <nav class="raccourcis">
        <a class="bouton principal" href="#/personnes">Voir les ancêtres à sourcer</a>
        <a class="bouton" href="#/lieux">Voir les lieux à dépouiller</a>
      </nav>

      <Progres releves={releves} />

      <section class="panneau reglages">
        <h2>Réglages</h2>
        <div class="reglage">
          <h3>Personne de départ (Sosa 1)</h3>
          <ChoixPersonne d={d} valeur={d.racine} choisir={setRacine} />
        </div>
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
          <Depot ouvrir={ouvrir} compact />
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

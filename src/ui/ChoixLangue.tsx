// Choix de la langue de la page d'impression : trois boutons dans le menu.

import { LANGUES, type Langue } from '../lib/i18n'

export function ChoixLangue({ langue, choisir }: { langue: Langue; choisir: (l: Langue) => void }) {
  return (
    <div class="choix-langue" role="group" aria-label="Language · Langue · Taal">
      {LANGUES.map((l) => (
        <button key={l.id} type="button" class={l.id === langue ? 'actif' : ''} aria-pressed={l.id === langue} title={l.nom} lang={l.id} onClick={() => choisir(l.id)}>{l.court}</button>
      ))}
    </div>
  )
}

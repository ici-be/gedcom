// Mauvais encodages : des faits rangés au mauvais endroit (un mariage sur une seule personne, une naissance sur une famille)
// et des liens qui ne tiennent pas (conjoint de son propre enfant, mari de sexe féminin…).

import type { Arbre, Individu } from './gedcom/arbre'

export type TypeEncodage = 'couple-individu' | 'individuel-famille' | 'double-fait' | 'conjoints' | 'parente'

export const TYPES_ENCODAGES: Record<TypeEncodage, string> = {
  'couple-individu': 'Fait de couple rangé sur une seule personne',
  'individuel-famille': 'Fait individuel rangé sur une famille',
  'double-fait': 'Naissance ou décès en double',
  conjoints: 'Conjoints incohérents',
  parente: 'Lien de parenté impossible',
}

export interface Encodage {
  type: TypeEncodage
  texte: string
  /** La personne concernée */
  id?: string
  /** La famille concernée */
  famille?: string
}

const NOMS: Record<string, string> = {
  MARR: 'Mariage', MARB: 'Bans de mariage', MARC: 'Contrat de mariage', MARL: 'Licence de mariage', MARS: 'Acte de mariage',
  ENGA: 'Fiançailles', DIV: 'Divorce', DIVF: 'Demande de divorce', ANUL: 'Annulation', SEP: 'Séparation',
  BIRT: 'Naissance', CHR: 'Baptême', BAPM: 'Baptême', DEAT: 'Décès', BURI: 'Inhumation', CREM: 'Crémation', PROB: 'Homologation', WILL: 'Testament',
  BARM: 'Bar-mitsva', BASM: 'Bat-mitsva', BLES: 'Bénédiction', CHRA: 'Baptême d’adulte', CONF: 'Confirmation', FCOM: 'Première communion',
  ORDN: 'Ordination', ADOP: 'Adoption', OCCU: 'Profession', RETI: 'Retraite',
}
const nom = (tag: string) => NOMS[tag] ?? tag

const COUPLE = new Set(['MARR', 'MARB', 'MARC', 'MARL', 'MARS', 'ENGA', 'DIV', 'DIVF', 'ANUL', 'SEP'])
const INDIVIDUEL = new Set(['BIRT', 'CHR', 'BAPM', 'BARM', 'BASM', 'BLES', 'CHRA', 'CONF', 'FCOM', 'ORDN', 'ADOP', 'DEAT', 'BURI', 'CREM', 'PROB', 'WILL', 'OCCU', 'RETI'])

const complet = (i: Individu) => `${i.prenom} ${i.nom}`.trim() || i.id

export function encodages(arbre: Arbre): Encodage[] {
  const res: Encodage[] = []

  for (const ind of arbre.individus.values()) {
    for (const e of ind.evenements) {
      if (!COUPLE.has(e.tag)) continue
      const date = e.date?.texte ? ` (${e.date.texte})` : ''
      const fam = ind.fams.length
        ? ' ; ce fait devrait se trouver dans sa famille, avec celui de son conjoint'
        : ' ; il n’a aucune famille pour le porter'
      res.push({ type: 'couple-individu', id: ind.id, texte: `${nom(e.tag)}${date} est noté sur la personne seule${fam}` })
    }
    for (const tag of ['BIRT', 'DEAT']) {
      const l = ind.evenements.filter((e) => e.tag === tag && (e.date || e.lieu))
      if (l.length > 1) {
        const bruts = new Set(l.map((e) => `${e.date?.brute ?? ''}|${e.lieu ?? ''}`))
        if (bruts.size > 1) res.push({ type: 'double-fait', id: ind.id, texte: `${l.length} ${tag === 'BIRT' ? 'naissances' : 'décès'} différents : ${l.map((e) => e.date?.texte || e.lieu).join(' ; ')}` })
      }
    }
  }

  for (const fam of arbre.familles.values()) {
    for (const e of fam.evenements) {
      if (!INDIVIDUEL.has(e.tag)) continue
      const date = e.date?.texte ? ` (${e.date.texte})` : ''
      res.push({ type: 'individuel-famille', famille: fam.id, texte: `${nom(e.tag)}${date} est noté sur la famille : il appartient à une personne` })
    }
    const mari = fam.mari ? arbre.individus.get(fam.mari) : undefined
    const femme = fam.femme ? arbre.individus.get(fam.femme) : undefined
    if (mari && femme && mari.id === femme.id) {
      res.push({ type: 'conjoints', famille: fam.id, id: mari.id, texte: `${complet(mari)} est à la fois mari et épouse` })
    } else {
      if (mari?.sexe === 'F') res.push({ type: 'conjoints', famille: fam.id, id: mari.id, texte: `${complet(mari)}, de sexe féminin, est noté mari` })
      if (femme?.sexe === 'M') res.push({ type: 'conjoints', famille: fam.id, id: femme.id, texte: `${complet(femme)}, de sexe masculin, est noté épouse` })
    }
    for (const c of fam.enfants) {
      if (c === fam.mari || c === fam.femme) {
        const i = arbre.individus.get(c)
        if (i) res.push({ type: 'parente', famille: fam.id, id: c, texte: `${complet(i)} est à la fois parent et enfant de cette famille` })
      }
    }
  }
  return res.sort((a, b) => a.type.localeCompare(b.type) || a.texte.localeCompare(b.texte, 'fr'))
}

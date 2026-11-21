"""Événements sans lien d'acte des ancêtres jusqu'à une génération donnée, toutes communes confondues.

  python3 -I selection_sosa.py DOSSIER [--gen 11] [--ref @I21@] [--ged EXPORT]

Même format que selection.py (DOSSIER/evenements.json), avec en plus pour chaque événement : « commune »
(premier élément du lieu), « lieu » (lieu complet), « sosa » et « gen ». Les événements sans lieu reçoivent la
commune d'un autre événement de la personne ou de son union (« commune_devinee »). Les événements sans date
exacte reçoivent une fourchette d'années estimée (« annees ») tirée de la date approximative, du mariage, des
enfants ou des parents. Les liens déjà posés vont dans DOSSIER/ancres.json, par commune.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gedcom import Arbre, date_dmy  # noqa: E402


def option(nom, defaut):
    return sys.argv[sys.argv.index(nom) + 1] if nom in sys.argv else defaut


dossier = sys.argv[1]
gen_max = int(option('--gen', '11'))
ref = option('--ref', '@I21@')
ged = option('--ged', None)
if not ged:
    tel = os.path.expanduser('~/Téléchargements')
    exports = [os.path.join(tel, f) for f in os.listdir(tel) if re.match(r'bveyckemans_.*\.(zip|ged)$', f)]
    ged = max(exports, key=os.path.getmtime)
if ged.endswith('.zip'):
    import zipfile
    with zipfile.ZipFile(ged) as z:
        nom = next(n for n in z.namelist() if n.lower().endswith('.ged'))
        os.makedirs(f'{dossier}/ged', exist_ok=True)
        z.extract(nom, f'{dossier}/ged')
        ged = f'{dossier}/ged/{nom}'
print('export :', ged, '| générations ≤', gen_max, '| référence :', ref)
A = Arbre(ged)
anc = {i: s for i, s in A.ancetres(ref).items() if s.bit_length() <= gen_max}


def personne(i):
    if not i:
        return None
    p, n = A.nom(i)
    return {'id': i, 'prenom': p, 'nom': n}


def annee(txt):
    m = re.search(r'(\d{4})', txt or '')
    return int(m[1]) if m else None


def evts(rid):
    """[(tag, date, lieu, liens)] des blocs d'événements d'un individu ou d'une famille."""
    out = []
    for b in A.blocs(rid):
        if b[0][1] not in ('BIRT', 'BAPM', 'CHR', 'DEAT', 'BURI', 'MARR'):
            continue
        plac = ([x for _, t, x in b if t == 'PLAC'] or [''])[0]
        date = ([x for _, t, x in b if t == 'DATE'] or [''])[0]
        texte = ''.join(x if t == 'CONC' else '\n' + x for _, t, x in b)
        out.append((b[0][1], date, plac, re.findall(r'https?://[^\s@]+', texte)))
    return out


def tags(rid, *t):
    return [e for e in evts(rid) if e[0] in t]


def fourchette(rid, tag, date, kind):
    """Années plausibles d'un événement sans date exacte."""
    y = annee(date)
    if y and not re.search(r'\b(BEF|AFT|ABT|EST|CAL|BET)\b', date):
        return [y, y]
    if y and re.search(r'\b(ABT|EST|CAL)\b', date):
        return [y - 3, y + 3]
    if kind == 'fam':
        enf = [annee(d) for c in A.v(rid, 'CHIL') for _, d, _, _ in tags(c, 'BIRT', 'BAPM', 'CHR') if annee(d)]
        if enf:
            return [min(enf) - 5, min(enf)]
        return None
    nat = tag in ('BIRT', 'BAPM', 'CHR')
    if nat:
        mar = [annee(d) for f in A.v(rid, 'FAMS') for _, d, _, _ in tags(f, 'MARR') if annee(d)]
        enf = [annee(d) for f in A.v(rid, 'FAMS') for c in A.v(f, 'CHIL') for _, d, _, _ in tags(c, 'BIRT', 'BAPM', 'CHR') if annee(d)]
        if mar:
            return [min(mar) - 35, min(mar) - 18]
        if enf:
            return [min(enf) - 45, min(enf) - 18]
        if y:
            return [y - 5, y + 5]
        return None
    # décès
    if y and 'AFT' in date:
        return [y, y + 30]
    if y and 'BEF' in date:
        return [y - 15, y]
    return None


evs, ancres = [], defaultdict(list)
communes_de = {}
for i in anc:
    cs = [p.split(',')[0].strip() for f in [i] + A.v(i, 'FAMS') for _, _, p, _ in evts(f) if p]
    communes_de[i] = Counter(cs).most_common(1)[0][0] if cs else None

vus = set()
for i, s in sorted(anc.items(), key=lambda t: t[1]):
    if s == 1:
        continue
    for rid, kind in [(i, 'ind')] + [(f, 'fam') for f in A.v(i, 'FAMS')]:
        if kind == 'fam':
            h, w = (A.v(rid, 'HUSB') or [None])[0], (A.v(rid, 'WIFE') or [None])[0]
            if not (h in anc and w in anc and anc[w] == anc[h] + 1) or rid in vus:
                continue
            vus.add(rid)
        presents = {t for t, _, _, _ in evts(rid)}
        liste = evts(rid)
        # événements manquants : on les crée vides pour la recherche d'indices
        if kind == 'ind':
            if not presents & {'BIRT', 'BAPM', 'CHR'}:
                liste.append(('BIRT', '', '', []))
            if not presents & {'DEAT', 'BURI'}:
                liste.append(('DEAT', '', '', []))
        elif 'MARR' not in presents:
            liste.append(('MARR', '', '', []))
        for tag, date, plac, liens in liste:
            commune = plac.split(',')[0].strip()
            if liens:
                ancres[commune].append({'tag': tag, 'date': date, 'dmy': date_dmy(date), 'lien': liens[0]})
                continue
            e = {'id': rid, 'tag': tag, 'date': date, 'dmy': date_dmy(date), 'lieu': plac, 'commune': commune,
                 'manquant': not date and not plac}
            if not commune:
                e['commune'] = communes_de.get(i) or ''
                e['commune_devinee'] = True
            if not e['dmy']:
                e['annees'] = fourchette(rid, tag, date, kind)
            if kind == 'ind':
                pere, mere = A.parents(rid)
                e.update(kind='ind', sosa=s, gen=s.bit_length(), rel=f'Sosa {s}', qui=personne(rid), sexe=A.sexe(rid),
                         pere=personne(pere), mere=personne(mere), conjoints=[personne(k) for k in A.conjoints(rid)])
            else:
                e.update(kind='fam', sosa=anc[h], gen=anc[h].bit_length(), rel=f'union de Sosa {anc[h]} et {anc[w]}',
                         mari=personne(h), femme=personne(w),
                         parents_mari=[personne(x) for x in A.parents(h)], parents_femme=[personne(x) for x in A.parents(w)])
            evs.append(e)

for n, e in enumerate(evs):
    e['n'] = n
os.makedirs(dossier, exist_ok=True)
json.dump(evs, open(f'{dossier}/evenements.json', 'w'), ensure_ascii=False, indent=1)
json.dump(ancres, open(f'{dossier}/ancres.json', 'w'), ensure_ascii=False, indent=1)
print(f'{len(evs)} événements sans lien : {sum(1 for e in evs if e["dmy"])} à date complète, '
      f'{sum(1 for e in evs if not e["dmy"] and e.get("annees"))} à fourchette estimée, '
      f'{sum(1 for e in evs if not e["dmy"] and not e.get("annees"))} sans repère de date')
print('par génération :', sorted(Counter(e['gen'] for e in evs).items()))
print('communes (date exacte) :', Counter(e['commune'] for e in evs if e['dmy']).most_common(40))

"""Événements d'une commune sans lien d'acte : ancêtres de REF, leurs frères et sœurs, leurs unions.

  python3 -I selection.py DOSSIER EXPORT.ged COMMUNE [@REF@]

Écrit DOSSIER/evenements.json (à traiter) et DOSSIER/ancres.json (liens déjà posés à cet endroit,
utiles pour repérer les registres), et affiche un résumé.
"""
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gedcom import Arbre, date_dmy  # noqa: E402

dossier, ged, commune = sys.argv[1:4]
ref = sys.argv[4] if len(sys.argv) > 4 else '@I1@'
A = Arbre(ged)
anc = A.ancetres(ref)
fratrie = {}
for i, s in anc.items():
    for f in A.v(i, 'FAMC')[:1]:
        for c in A.v(f, 'CHIL'):
            if c not in anc:
                fratrie[c] = s
unions = {f for i in anc for f in A.v(i, 'FAMS')}


def personne(i):
    if not i:
        return None
    p, n = A.nom(i)
    return {'id': i, 'prenom': p, 'nom': n}


evs, ancres = [], []
for rid, rec in A.r.items():
    if rec['tag'] == 'INDI' and (rid in anc or rid in fratrie):
        rel = f'Sosa {anc[rid]}' if rid in anc else f'fratrie de Sosa {fratrie[rid]}'
    elif rec['tag'] == 'FAM' and rid in unions:
        rel = 'union'
    else:
        continue
    for b in A.blocs(rid):
        plac = [x for _, t, x in b if t == 'PLAC']
        if not plac or not re.search(rf'(^|[ ,]){re.escape(commune)}(,|$)', plac[0]) or plac[0].startswith('Oud-'):
            continue
        date = ([x for _, t, x in b if t == 'DATE'] or [''])[0]
        tag = b[0][1] if b[0][1] != 'EVEN' else 'EVEN ' + ([x for _, t, x in b if t == 'TYPE'] or [''])[0]
        texte = ''.join(x if t == 'CONC' else '\n' + x for _, t, x in b)
        liens = re.findall(r'https?://[^\s@]+', texte)
        e = {'id': rid, 'tag': tag, 'date': date, 'dmy': date_dmy(date), 'rel': rel}
        if rec['tag'] == 'INDI':
            pere, mere = A.parents(rid)
            e.update(kind='ind', qui=personne(rid), sexe=A.sexe(rid), pere=personne(pere), mere=personne(mere),
                     conjoints=[personne(k) for k in A.conjoints(rid)])
        else:
            h, w = (A.v(rid, 'HUSB') or [None])[0], (A.v(rid, 'WIFE') or [None])[0]
            e.update(kind='fam', mari=personne(h), femme=personne(w),
                     parents_mari=[personne(x) for x in A.parents(h)] if h else [],
                     parents_femme=[personne(x) for x in A.parents(w)] if w else [])
            if h in anc and w in anc:
                e['rel'] = f'union de Sosa {anc[h]} et {anc[w]}'
        if liens:
            ancres.append({'tag': tag, 'date': date, 'dmy': e['dmy'], 'lien': liens[0]})
        else:
            evs.append(e)

for n, e in enumerate(evs):
    e['n'] = n
os.makedirs(dossier, exist_ok=True)
json.dump(evs, open(f'{dossier}/evenements.json', 'w'), ensure_ascii=False, indent=1)
json.dump(sorted(ancres, key=lambda a: tuple(a['dmy'] or (0, 0, 0))[::-1]), open(f'{dossier}/ancres.json', 'w'), ensure_ascii=False, indent=1)
datees = [e for e in evs if e['dmy']]
print(f'{len(evs)} événements sans lien ({len(datees)} à date complète), {len(ancres)} déjà liés ; '
      f'{sum(1 for e in evs if not e["rel"].startswith("fratrie"))} d’ancêtres ou d’unions')
print('par type et siècle :', sorted(Counter((e['tag'][:4], (e['dmy'] or [0, 0, 0])[2] // 100) for e in datees).items()))
print('domaines des liens existants :', Counter(re.sub(r'https?://([^/]+).*', r'\1', a['lien']) for a in ancres))

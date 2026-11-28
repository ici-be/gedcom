"""Événements d'une commune sans lien d'acte.

  python3 -I selection.py DOSSIER COMMUNE[|AUTRE GRAPHIE…] [--portee ancetres|fratrie|tous] [--ref @I21@] [--ged EXPORT]

Portée : « ancetres » = ancêtres de REF et leurs unions ; « fratrie » (défaut) = plus leurs frères et sœurs ;
« tous » = toutes les personnes et unions de l'arbre. REF : @I21@ (Olivia ; Bruno est son Sosa 2).
EXPORT : .ged ou .zip de Geneanet ; par défaut le plus récent bveyckemans_*.zip|.ged de ~/Téléchargements.
Écrit DOSSIER/evenements.json (à traiter) et DOSSIER/ancres.json (liens déjà posés dans la commune, toutes
personnes confondues, qui servent de repères dans les registres), et affiche un résumé.
"""
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gedcom import Arbre, date_dmy  # noqa: E402

def option(nom, defaut):
    return sys.argv[sys.argv.index(nom) + 1] if nom in sys.argv else defaut


dossier, commune = sys.argv[1:3]
noms_lieu = {c.strip().lower() for c in commune.split('|')}  # « Jouy|Jouy - Sancoins|Sancoins » : plusieurs graphies
portee = option('--portee', 'fratrie')
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
print('export :', ged, '| portée :', portee, '| référence :', ref)
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
    if rec['tag'] == 'INDI' and rid in anc:
        rel = f'Sosa {anc[rid]}'
    elif rec['tag'] == 'INDI' and rid in fratrie and portee != 'ancetres':
        rel = f'fratrie de Sosa {fratrie[rid]}'
    elif rec['tag'] == 'FAM' and rid in unions:
        rel = 'union'
    elif rec['tag'] in ('INDI', 'FAM'):
        rel = 'hors lignée' if portee == 'tous' else 'hors portée'  # hors portée : ne sert que de repère
    else:
        continue
    for b in A.blocs(rid):
        plac = [x for _, t, x in b if t == 'PLAC']
        if not plac or plac[0].split(',')[0].strip().lower() not in noms_lieu:
            continue
        date = ([x for _, t, x in b if t == 'DATE'] or [''])[0]
        tag = b[0][1] if b[0][1] != 'EVEN' else 'EVEN ' + ([x for _, t, x in b if t == 'TYPE'] or [''])[0]
        texte = ''.join(x if t == 'CONC' else '\n' + x for _, t, x in b)
        liens = re.findall(r'https?://[^\s@]+', texte)
        e = {'id': rid, 'tag': tag, 'date': date, 'dmy': date_dmy(date), 'rel': rel}
        if liens:
            ancres.append({'tag': tag, 'date': date, 'dmy': e['dmy'], 'lien': liens[0]})
            continue
        if rel == 'hors portée':
            continue
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
        evs.append(e)

for n, e in enumerate(evs):
    e['n'] = n
os.makedirs(dossier, exist_ok=True)
json.dump(evs, open(f'{dossier}/evenements.json', 'w'), ensure_ascii=False, indent=1)
json.dump(sorted(ancres, key=lambda a: tuple(a['dmy'] or (0, 0, 0))[::-1]), open(f'{dossier}/ancres.json', 'w'), ensure_ascii=False, indent=1)
datees = [e for e in evs if e['dmy']]
print(f'{len(evs)} événements sans lien ({len(datees)} à date complète), {len(ancres)} déjà liés ; '
      f'{sum(1 for e in evs if e["rel"].startswith(("Sosa", "union")))} d’ancêtres ou de leurs unions')
print('par type et siècle :', sorted(Counter((e['tag'][:4], (e['dmy'] or [0, 0, 0])[2] // 100) for e in datees).items()))
print('domaines des liens existants :', Counter(re.sub(r'https?://([^/]+).*', r'\1', a['lien']) for a in ancres))

"""Découpe a_lire.json en lots pour les sous-agents de lecture, groupés par registre.

  python3 -I lots.py DOSSIER [TAILLE]     (TAILLE : 8 par défaut)

Si DOSSIER/apparier.txt existe (sortie de apparier.py --tout), les candidats de l'index à date exacte
et nom concordant sont joints à chaque événement (« index_fs »), comme aide à la lecture.
Écrit DOSSIER/lot_01.json, lot_02.json… (événements, proches à reconnaître, registres et images probables)
et affiche un résumé par lot. Des lots plus petits coûtent moins de tokens par acte (le contexte de chaque
sous-agent grossit avec les images lues).
"""
import json
import os
import sys
from collections import Counter

dossier = sys.argv[1]
taille = int(sys.argv[2]) if len(sys.argv) > 2 else 8
ev = {e['n']: e for e in json.load(open(f'{dossier}/evenements.json'))}
a = json.load(open(f'{dossier}/a_lire.json'))


def p(x):
    return f"{x['prenom']} {x['nom']}" if x else None


# indications de l'index FamilySearch (même date exacte et nom concordant), tirées de apparier.txt
indices = {}
if os.path.exists(f'{dossier}/apparier.txt'):
    cur = None
    for l in open(f'{dossier}/apparier.txt'):
        if l.startswith('#'):
            cur = int(l[1:].split()[0])
        elif cur is not None and l.startswith('   DN'):
            indices.setdefault(cur, []).append(l.strip()[2:].strip()[:300])
items = []
for s in a:
    e = ev[s['n']]
    if not s['registres']:
        print('sans registre :', s['n'], e['tag'], e['date'])
        continue
    it = {'n': s['n'], 'evenement': e['tag'][:4], 'date': e['date']}
    if e['kind'] == 'fam':
        it.update(mari=p(e['mari']), femme=p(e['femme']), parents_mari=[p(x) for x in e['parents_mari']], parents_femme=[p(x) for x in e['parents_femme']])
    else:
        it.update(personne=p(e['qui']), sexe=e['sexe'], pere=p(e['pere']), mere=p(e['mere']), conjoints=[p(x) for x in e['conjoints']])
    it['registres'] = s['registres']
    if s['n'] in indices:
        it['index_fs'] = indices[s['n']]
    items.append(it)
items.sort(key=lambda i: (i['registres'][0]['dossier'], i['registres'][0]['estimation']))
lots, cur = [], []
for it in items:
    if len(cur) >= taille or (cur and cur[-1]['registres'][0]['dossier'] != it['registres'][0]['dossier'] and len(cur) >= taille * 2 // 3):
        lots.append(cur)
        cur = []
    cur.append(it)
if cur:
    lots.append(cur)
for f in os.listdir(dossier):
    if f.startswith('lot_') and f.endswith('.json'):
        os.remove(f'{dossier}/{f}')
for k, l in enumerate(lots, 1):
    json.dump(l, open(f'{dossier}/lot_{k:02d}.json', 'w'), ensure_ascii=False, indent=1)
    print(f'lot_{k:02d}', len(l), Counter(i['registres'][0]['quoi'] for i in l).most_common(2))
print(len(lots), 'lots,', len(items), 'événements')

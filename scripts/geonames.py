#!/usr/bin/env python3
"""
Construit les fichiers de lieux de public/geo/ à partir des extraits GeoNames
(https://download.geonames.org/export/dump/, licence CC BY 4.0).

    python3 -I scripts/geonames.py <dossier des .zip téléchargés> public/geo

Un fichier par pays (BE.json, FR.json…) pour les pays détaillés, plus monde.json
(les villes de plus de 5 000 habitants des autres pays).

Format : { "a": { "WAL": ["Wallonia", "wallonia", "wallonie", …], "WAL.WHT": [...] },
           "l": [[nom, lat, lon, "a1", "a2", population, [autres noms]], …] }
"""

import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

PAYS = ['BE', 'FR', 'NL', 'LU', 'CH', 'DE', 'IT', 'ES', 'GB', 'CA', 'US']
# Pour les grands pays, seulement les localités habitées d'une certaine taille
POPULATION_MIN = {'US': 500}
# Niveau administratif des communes (ADM3 est un arrondissement en France, une commune en Italie…)
NIVEAU_COMMUNE = {'BE': 'ADM4', 'FR': 'ADM4', 'DE': 'ADM4', 'IT': 'ADM3', 'ES': 'ADM3', 'CH': 'ADM3', 'NL': 'ADM2', 'LU': 'ADM2'}

LATIN = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿŒœŸĀ-ſ'’ .\-()]+$")


def cle(s: str) -> str:
    s = s.lower().replace('œ', 'oe').replace('æ', 'ae')
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[-'’.()]", ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def autres_noms(nom: str, alternatifs: str) -> list[str]:
    vus = {cle(nom)}
    res = []
    for a in alternatifs.split(','):
        a = a.strip()
        # noms latins qui commencent par une majuscule (les translittérations en minuscules sont du bruit)
        if len(a) < 3 or not LATIN.match(a) or not a[0].isupper():
            continue
        k = cle(a)
        if k and k not in vus:
            vus.add(k)
            res.append(a)
    return res


def lignes(zip_path: Path, membre: str):
    with zipfile.ZipFile(zip_path) as z:
        with z.open(membre) as f:
            for brut in f:
                yield brut.decode('utf-8').rstrip('\n').split('\t')


def pays(dossier: Path, code: str) -> dict:
    minimum = POPULATION_MIN.get(code, 0)
    admin: dict[str, tuple[str, set[str]]] = {}
    commune = NIVEAU_COMMUNE.get(code)
    lieux = []
    for c in lignes(dossier / f'{code}.zip', f'{code}.txt'):
        nom, alternatifs, lat, lon, classe, fcode, a1, a2, pop = c[1], c[3], c[4], c[5], c[6], c[7], c[10], c[11], int(c[14] or 0)
        if classe == 'A' and fcode in ('ADM1', 'ADM2'):
            k = a1 if fcode == 'ADM1' else f'{a1}.{a2}'
            noms = admin.setdefault(k, (nom, set()))[1]
            noms.add(cle(nom))
            noms.update(cle(a) for a in autres_noms(nom, alternatifs))
        garder = (classe == 'P' and not fcode.startswith('PPLH') and fcode not in ('PPLQ', 'PPLW')) or (classe == 'A' and fcode == commune)
        if not garder or (minimum and pop < minimum and not fcode.startswith('PPLA') and fcode != 'PPLC'):
            continue
        lieux.append([nom, round(float(lat), 3), round(float(lon), 3), a1, a2, pop, autres_noms(nom, alternatifs)])

    # Doublons (la commune et son chef-lieu) : même nom, même province, à moins de ~5 km
    lieux.sort(key=lambda l: -l[5])
    gardes: dict[tuple, list] = {}
    resultat = []
    for l in lieux:
        k = (cle(l[0]), l[3], l[4])
        proches = gardes.setdefault(k, [])
        if any(abs(p[1] - l[1]) < 0.05 and abs(p[2] - l[2]) < 0.07 for p in proches):
            continue
        proches.append(l)
        resultat.append(l)
    for l in resultat:
        if not l[6]:
            l.pop()
    # région / province : le nom usuel d'abord, puis toutes les formes de comparaison
    return {'a': {k: [nom, *sorted(cles)] for k, (nom, cles) in admin.items()}, 'l': resultat}


def monde(dossier: Path) -> dict:
    lieux = []
    for c in lignes(dossier / 'cities5000.zip', 'cities5000.txt'):
        if c[8] in PAYS:
            continue
        lieux.append([c[1], round(float(c[4]), 3), round(float(c[5]), 3), c[8], '', int(c[14] or 0), autres_noms(c[1], c[3])])
    for l in lieux:
        if not l[6]:
            l.pop()
    return {'a': {}, 'l': lieux}


def main():
    dossier, sortie = Path(sys.argv[1]), Path(sys.argv[2])
    sortie.mkdir(parents=True, exist_ok=True)
    for code in PAYS:
        donnees = pays(dossier, code)
        (sortie / f'{code}.json').write_text(json.dumps(donnees, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(code, len(donnees['l']))
    donnees = monde(dossier)
    (sortie / 'monde.json').write_text(json.dumps(donnees, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('monde', len(donnees['l']))


if __name__ == '__main__':
    main()

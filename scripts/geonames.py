#!/usr/bin/env python3
"""
Construit les fichiers de lieux de public/geo/ à partir des extraits GeoNames
(https://download.geonames.org/export/dump/, licence CC BY 4.0).

    python3 -I scripts/geonames.py <dossier des .zip téléchargés> public/geo [codes…]

Sans codes : tous les pays et monde.json ; avec des codes (IE GP… ou monde), seulement ceux-là.
monde.json a besoin de cities5000.zip et d'admin1CodesASCII.txt dans le même dossier, et de
contours.json déjà construit dans le dossier de sortie (scripts/contours.py).

Un fichier par pays (BE.json, FR.json…) pour les pays détaillés, plus monde.json
(les villes de plus de 5 000 habitants des autres pays ; pour ceux d'Europe, avec leur région :
code GeoNames de premier niveau en 5e colonne, nom dans « a » sous « PL.83 », comme dans contours.json).

Format : { "a": { "WAL": ["Wallonia", "wallonia", "wallonie", …], "WAL.WHT": [...] },
           "l": [[nom, lat, lon, "a1", "a2", population, [autres noms]], …] }
"""

import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

# Les départements d'outre-mer ont leurs propres extraits GeoNames (GP, MQ…), à part de la France
PAYS = ['BE', 'FR', 'NL', 'LU', 'CH', 'DE', 'IT', 'ES', 'GB', 'IE', 'CA', 'US', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PM']
# Pour les grands pays, seulement les localités habitées d'une certaine taille
POPULATION_MIN = {'US': 500}
# Niveau administratif des communes (ADM3 est un arrondissement en France, une commune en Italie…)
NIVEAU_COMMUNE = {**{c: 'ADM4' for c in ('GP', 'MQ', 'GF', 'RE', 'YT', 'PM')}, 'BE': 'ADM4', 'FR': 'ADM4', 'DE': 'ADM4', 'IT': 'ADM3', 'ES': 'ADM3', 'CH': 'ADM3', 'NL': 'ADM2', 'LU': 'ADM2'}

# Pays d'Europe de monde.json dont la région est gardée : les mêmes que EUROPE dans scripts/contours.py
EUROPE = {
    'PT', 'AT', 'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'BA', 'RS', 'ME', 'MK', 'XK', 'AL', 'GR', 'BG', 'RO', 'MD',
    'UA', 'BY', 'RU', 'LT', 'LV', 'EE', 'FI', 'SE', 'NO', 'DK', 'IS', 'MT', 'CY', 'AD', 'MC', 'SM', 'LI', 'FO',
    'IM', 'JE', 'GG', 'GI',
}

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


def dans(anneaux: list, lon: float, lat: float) -> bool:
    """Le point est-il dans la région (anneaux de contours.json, en degrés × 100) ?"""
    x, y = lon * 100, lat * 100
    dedans = False
    for a in anneaux:
        for i in range(0, len(a), 2):
            x1, y1, x2, y2 = a[i - 2], a[i - 1], a[i], a[i + 1]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                dedans = not dedans
    return dedans


def monde(dossier: Path, contours: dict) -> dict:
    regions = {}
    for brut in (dossier / 'admin1CodesASCII.txt').read_text(encoding='utf-8').splitlines():
        code, nom, ascii_, _ = brut.split('\t')
        if code.split('.')[0] in EUROPE:
            regions[code] = [nom, *sorted({cle(nom), cle(ascii_)})]
    lieux = []
    utiles = set()
    for c in lignes(dossier / 'cities5000.zip', 'cities5000.txt'):
        if c[8] in PAYS:
            continue
        region = ''
        if c[8] in EUROPE:
            code = f'{c[8]}.{c[10]}'
            if code not in contours:
                # région sans contour à son nom (découpage plus récent) : celle dont le contour contient la ville
                lon, lat = float(c[5]), float(c[4])
                voisins = [k for k in contours if k.startswith(c[8] + '.')]
                code = next((k for k in voisins if dans(contours[k], lon, lat)), '')
                # sur la côte, hors du contour simplifié : la région au point de contour le plus proche
                if not code and voisins:
                    code = min(voisins, key=lambda k: min((a[i] - lon * 100) ** 2 + (a[i + 1] - lat * 100) ** 2 for a in contours[k] for i in range(0, len(a), 2)))
            if code in regions:
                region = code.split('.', 1)[1]
        if region:
            utiles.add(f'{c[8]}.{region}')
        lieux.append([c[1], round(float(c[4]), 3), round(float(c[5]), 3), c[8], region, int(c[14] or 0), autres_noms(c[1], c[3])])
    for l in lieux:
        if not l[6]:
            l.pop()
    return {'a': {k: v for k, v in sorted(regions.items()) if k in utiles}, 'l': lieux}


def main():
    dossier, sortie = Path(sys.argv[1]), Path(sys.argv[2])
    sortie.mkdir(parents=True, exist_ok=True)
    codes = sys.argv[3:] or [*PAYS, 'monde']
    for code in codes:
        if code == 'monde':
            continue
        donnees = pays(dossier, code)
        (sortie / f'{code}.json').write_text(json.dumps(donnees, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(code, len(donnees['l']))
    if 'monde' not in codes:
        return
    donnees = monde(dossier, json.loads((sortie / 'contours.json').read_text(encoding='utf-8'))['r'])
    (sortie / 'monde.json').write_text(json.dumps(donnees, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('monde', len(donnees['l']))


if __name__ == '__main__':
    main()

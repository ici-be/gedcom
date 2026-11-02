#!/usr/bin/env python3
"""
Construit public/geo/contours.json : les contours des provinces et départements des pays d'Europe
et des départements d'outre-mer, pour les cartes (éventail imprimé, accueil, migrations, fiche d'un lieu).

    python3 -I scripts/contours.py <ne_10m_admin_1_states_provinces.geojson> public/geo/contours.json \
        <admin1CodesASCII.txt> <cities5000.zip>

Sources : Natural Earth, Admin 1 – States, Provinces, 1:10m (domaine public),
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson
et GeoNames (CC BY 4.0), https://download.geonames.org/export/dump/ (admin1CodesASCII.txt, cities5000.zip).

Format : { "r": { "BE.WHT": [[lon×100, lat×100, lon×100, lat×100, …], …anneaux], … } }
Les clés reprennent les codes GeoNames (voir codeRegion dans src/lib/geo.ts) : province belge
(BE.WHT), département français (FR.59), province néerlandaise et Land allemand (NL.06, DE.02),
district luxembourgeois (LU.D), comté ou autorité unitaire britannique (GB.G5), comté irlandais (IE.33),
département d'outre-mer (FR.971). Les découpages de Natural Earth plus fins ou plus anciens que ceux
de GeoNames sont réunis (les boroughs de Londres, les anciens districts d'Irlande du Nord…).
Canton suisse (CH.VD), province italienne et espagnole (IT.AO, ES.V : le second niveau de GeoNames,
comme dans IT.json et ES.json). Pour les autres pays d'Europe (EUROPE), le premier niveau de GeoNames
(PL.83), celui de monde.json : quand le code de Natural Earth n'y est pas (découpage plus ancien ou plus
fin, comme en Bosnie, au Kosovo, en Norvège), la région est celle de la plupart des villes de cities5000
qui s'y trouvent, ou de la plus proche.
"""

import io
import json
import sys
import zipfile
from collections import Counter

# Pays d'Europe sans fichier détaillé : leurs villes sont dans monde.json (scripts/geonames.py)
EUROPE = {
    'PT', 'AT', 'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'BA', 'RS', 'ME', 'MK', 'XK', 'AL', 'GR', 'BG', 'RO', 'MD',
    'UA', 'BY', 'RU', 'LT', 'LV', 'EE', 'FI', 'SE', 'NO', 'DK', 'IS', 'MT', 'CY', 'AD', 'MC', 'SM', 'LI', 'FO',
    'IM', 'JE', 'GG', 'GI',
}
PAYS = {'BE', 'FR', 'NL', 'DE', 'LU', 'GB', 'IE', 'CH', 'IT', 'ES'} | EUROPE
# Hors de GeoNames pour ces pays (Svalbard est SJ, l'île Bouvet BV)
EXCLUS = {'NO.21', 'NO.00'}

# Natural Earth → GeoNames
REUNIS = {
    # Irlande du Nord : les 26 districts d'avant 2015 dans les 11 d'aujourd'hui
    **{f'GB.{c}': 'GB.N09000003' for c in ['R3']},
    **{f'GB.{c}': 'GB.N09000009' for c in ['R7', 'S1', 'S7']},
    **{f'GB.{c}': 'GB.N09000001' for c in ['Q6', 'T1']},
    **{f'GB.{c}': 'GB.N09000004' for c in ['R6', 'R1', 'S4', 'S8']},
    **{f'GB.{c}': 'GB.N09000006' for c in ['S2', 'T3']},
    **{f'GB.{c}': 'GB.N09000007' for c in ['S5', 'R5']},
    **{f'GB.{c}': 'GB.N09000005' for c in ['S6', 'T4']},
    **{f'GB.{c}': 'GB.N09000011' for c in ['Q7', 'T2']},
    **{f'GB.{c}': 'GB.N09000002' for c in ['Q8', 'R2', 'R8']},
    **{f'GB.{c}': 'GB.N09000010' for c in ['S9', 'R9']},
    **{f'GB.{c}': 'GB.N09000008' for c in ['Q9', 'S3', 'R4']},
    'GB.Z9': 'GB.C6',  # Cornouailles et Scilly
    'GB.B2': 'GB.AA', 'GB.K5': 'GB.AA',  # Bournemouth, Christchurch et Poole
    # Irlande : les villes-comtés avec leur comté, Dublin et ses comtés de banlieue ensemble
    'IE.32': 'IE.04', 'IE.36': 'IE.10', 'IE.16': 'IE.42', 'IE.37': 'IE.42', 'IE.27': 'IE.44', 'IE.41': 'IE.44',
    'IE.38': 'IE.26', 'IE.40': 'IE.26', 'IE.34': 'IE.33', 'IE.35': 'IE.33', 'IE.39': 'IE.33',
    # Sardaigne : les provinces de 2005 dans celles de 2016
    'IT.CI': 'IT.SU', 'IT.VS': 'IT.SU', 'IT.OT': 'IT.SS', 'IT.OG': 'IT.NU',
}
# La Russie, immense, et les côtes découpées de la Norvège : moins de points
TOLERANCES = {'RU': 0.08, 'NO': 0.025}
TOLERANCE = 0.012  # degrés (≈ 1 km) : bien en dessous de ce que voit l'œil sur la feuille


def garder(p: dict) -> bool:
    if p['iso_a2'] not in PAYS or p['gn_a1_code'] in EXCLUS:
        return False
    if p['iso_a2'] == 'FR':
        return p['type_en'] in ('Metropolitan department', 'Overseas department')
    if p['iso_a2'] == 'NL':
        return p['type_en'] == 'Province'
    return True


def cle(p: dict, geometrie: dict, admin1: set, villes: dict) -> str | None:
    pays = p['iso_a2']
    if pays in EUROPE:
        code = p['gn_a1_code']
        return code if code in admin1 else voter(geometrie, villes.get(pays, []))
    if pays == 'LU':
        return 'LU.' + p['iso_3166_2'].split('-')[1]
    if p['iso_a2'] == 'GB' and p['region'] == 'Greater London':
        return 'GB.GLA'
    return REUNIS.get(p['gn_a1_code'], p['gn_a1_code'])


def voter(geometrie: dict, villes: list) -> str | None:
    """La région GeoNames de la plupart des villes du polygone, ou de la plus proche"""
    from shapely.geometry import Point, shape
    forme = shape(geometrie).buffer(0)
    dedans = Counter(code for lon, lat, code in villes if forme.contains(Point(lon, lat)))
    if dedans:
        return dedans.most_common(1)[0][0]
    if not villes:
        return None
    centre = forme.representative_point()
    return min(villes, key=lambda v: (v[0] - centre.x) ** 2 + (v[1] - centre.y) ** 2)[2]


def lire_villes(chemin: str) -> dict:
    """cities5000 : (lon, lat, code de région) par pays d'Europe"""
    villes: dict[str, list] = {}
    with zipfile.ZipFile(chemin) as z, z.open('cities5000.txt') as f:
        for brut in io.TextIOWrapper(f, encoding='utf-8'):
            c = brut.rstrip('\n').split('\t')
            if c[8] in EUROPE and c[10]:
                villes.setdefault(c[8], []).append((float(c[5]), float(c[4]), f'{c[8]}.{c[10]}'))
    return villes


def simplifier(pts: list, tol: float) -> list:
    """Douglas-Peucker"""
    if len(pts) < 4:
        return pts
    garde = [False] * len(pts)
    garde[0] = garde[-1] = True
    pile = [(0, len(pts) - 1)]
    while pile:
        a, b = pile.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        n = (dx * dx + dy * dy) ** 0.5 or 1e-12
        loin, ou = 0.0, -1
        for i in range(a + 1, b):
            x, y = pts[i]
            d = abs(dy * (x - x1) - dx * (y - y1)) / n if (dx or dy) else ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
            if d > loin:
                loin, ou = d, i
        if loin > tol:
            garde[ou] = True
            pile += [(a, ou), (ou, b)]
    return [p for p, g in zip(pts, garde) if g]


def anneaux_de(g: dict) -> list:
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    return [anneau for poly in polys for anneau in poly]


def unir(geometries: list) -> dict:
    """Une seule forme pour des régions réunies, sans leurs frontières intérieures (avec shapely, s'il est là)"""
    if len(geometries) == 1:
        return geometries[0]
    try:
        from shapely.geometry import mapping, shape
        from shapely.ops import unary_union
    except ImportError:
        return {'type': 'MultiPolygon', 'coordinates': [[a] for g in geometries for a in anneaux_de(g)]}
    return mapping(unary_union([shape(g).buffer(0) for g in geometries]))


def principal():
    source, cible, codes_admin1, cities = sys.argv[1:5]
    admin1 = {l.split('\t')[0] for l in open(codes_admin1, encoding='utf-8')}
    villes = lire_villes(cities)
    geometries: dict[str, list] = {}
    for f in json.load(open(source, encoding='utf-8'))['features']:
        p = f['properties']
        if garder(p):
            k = cle(p, f['geometry'], admin1, villes)
            if k:
                geometries.setdefault(k, []).append(f['geometry'])
    res = {}
    for code, gs in geometries.items():
        anneaux = []
        tol = TOLERANCES.get(code[:2], TOLERANCE)
        for anneau in anneaux_de(unir(gs)):
            s = simplifier([tuple(pt) for pt in anneau], tol)
            if len(s) < 4:
                continue
            plat = []
            for lon, lat in s:
                plat += [round(lon * 100), round(lat * 100)]
            anneaux.append(plat)
        if anneaux:
            res[code] = anneaux
    with open(cible, 'w', encoding='utf-8') as out:
        json.dump({'r': dict(sorted(res.items()))}, out, separators=(',', ':'))
    print(len(res), 'régions')


if __name__ == '__main__':
    principal()

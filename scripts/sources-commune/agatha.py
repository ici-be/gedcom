"""Agatha (Archives de l'État) sans navigateur : registres d'une commune, images d'un registre, extraits IIIF.

  python3 -I agatha.py registres DOSSIER COMMUNE      -> DOSSIER/agatha_PR.json et agatha_CS.json, résumé
  python3 -I agatha.py images DOSSIER BOOKPART...     -> dossier IIIF et liste des images (cache DOSSIER/agatha_images.json)
  python3 -I agatha.py extrait DOSSIER DOSSIER_IIIF IMAGE [LARGEUR] [REGION]
        REGION au format IIIF : full, ou pct:x,y,l,h (ex. pct:0,50,100,50 = moitié basse) ; affiche le chemin du JPEG
  python3 -I agatha.py planche DOSSIER SORTIE.jpg DOSSIER_IIIF LARGEUR REGION IMAGE...   (planche étiquetée, ImageMagick)

Lien d'un acte : https://agatha.arch.be/data/images/ARCH/DOSSIER_IIIF/IMAGE
"""
import json
import os
import re
import subprocess
import sys
import urllib.parse

BASE = 'https://agatha.arch.be/fr/search/genealogie/'


def curl(*args):
    return subprocess.run(['curl', '-s', '--max-time', '120', *args], capture_output=True, text=True).stdout


def registres(dossier, commune):
    jar = f'{dossier}/.agatha_cookies'
    lieux = json.loads(curl('-X', 'POST', BASE + 'ajax.php', '--data-urlencode', 'method=getMunicipalities', '--data-urlencode', f'term={commune}'))
    lieu = next((x for x in lieux if x['CURRENT_NAME'].lower() == commune.lower()), lieux[0])
    paroisses = [x for x in json.loads(curl('-X', 'POST', BASE + 'ajax.php', '--data-urlencode', 'method=getPlaces', '--data-urlencode', f'term={commune}'))
                 if x['PLACEPOINT_ID'] == lieu['PLACEPOINT_ID']]
    print('lieu', lieu['PLACEPOINT_ID'], lieu['CURRENT_NAME'], '| paroisses', [(p['PARISH_ID'], p['label']) for p in paroisses])
    for tab in ('PR', 'CS'):
        curl('-c', jar, '-b', jar, BASE, '-o', '/dev/null')
        f = [(f'PLACE_{tab}', lieu['CURRENT_NAME']), (f'PLACEPOINT_ID_{tab}', lieu['PLACEPOINT_ID']), (f'CURRENT_NAME_{tab}', lieu['CURRENT_NAME']),
             ('WHICH_TAB', tab), ('CHOOSE_DATE_PERIODE', '1')] + [(f'TYPEACTES_{tab}[]', t) for t in '123']
        if tab == 'PR':
            f += [('PARISH_ID[]', p['PARISH_ID']) for p in paroisses]
        curl('-c', jar, '-b', jar, '-X', 'POST', BASE + 'results/', '--data', urllib.parse.urlencode(f), '-o', '/dev/null')
        docs = []
        for pg in range(1, 40):
            t = curl('-c', jar, '-b', jar, '-X', 'POST', BASE + 'ajax.php', '--data',
                     f'method=getResults&SORT_ON%5B%5D=SORT_SHOW_ORDER&SORT_ON%5B%5D=SORT_START_YEAR&ORDER%5B%5D=asc&ORDER%5B%5D=asc&pageSize=100&pageNumber={pg}')
            d = json.loads(t)['response']['docs'] if t.strip() else []
            docs += d
            if len(d) < 100:
                break
        out = [{'bp': x['BOOKPART_ID'], 'de': int(x['START_YEAR']), 'a': int(x['END_YEAR']), 'quoi': x['DESCRIPTION'],
                'dispo': x.get('AVAILABLE'), 'table': x.get('ISINDEX'), 'rem': x.get('FULL_REMARKS') or ''} for x in docs]
        json.dump(out, open(f'{dossier}/agatha_{tab}.json', 'w'), ensure_ascii=False, indent=0)
        print(tab, len(out), 'registres', f'({sum(1 for x in out if x["dispo"] in (1, "1"))} en ligne)')


def images(dossier, bps):
    cache = f'{dossier}/agatha_images.json'
    F = json.load(open(cache)) if os.path.exists(cache) else {}
    for bp in bps:
        if bp not in F:
          try:
              loc = curl('-o', '/dev/null', '-w', '%{redirect_url}', BASE + bp)
              m = re.search(r'/data/images/(\d+)/([^/]+)/', loc)
              if not m:
                  print(bp, 'pas d’images en ligne')
                  continue
              arch, dos = m[1], m[2]
              pre = '_'.join(dos.split('_')[:3])
              man = json.loads(curl(f'https://agatha.arch.be/fr//data/json/{arch}/{pre}/{dos}/{dos}.json'))
              rng = [r for r in man.get('structures', []) if r['@id'].endswith(f'/{bp}.json')]
              ims = [c.rsplit(f'{dos}_', 1)[-1].removesuffix('.jp2') for c in rng[0]['canvases']] if rng else []
              F[bp] = {'arch': arch, 'dossier': dos, 'images': ims}
              json.dump(F, open(cache, 'w'))
          except Exception as err:  # réseau, manifeste incomplet : on passe au suivant
            print(bp, 'erreur', repr(err)[:200])
            continue
        f = F[bp]
        print(bp, f['dossier'], len(f['images']), 'images', f['images'][:1], '…', f['images'][-1:])


def extrait(dossier, dos, img, largeur='1200', region='full'):
    os.makedirs(f'{dossier}/img', exist_ok=True)
    arch, pre = dos.split('_')[0], '_'.join(dos.split('_')[:3])
    out = f'{dossier}/img/{dos}_{img}_{largeur}_{re.sub(r"[^0-9a-z]", "-", region)}.jpg'
    if not os.path.exists(out) or os.path.getsize(out) < 1000:
        curl('-e', 'https://agatha.arch.be/', '-o', out, f'https://i3f.arch.be/iiif/{arch}/{pre}/{dos}/{dos}_{img}.jp2/{region}/{largeur},/0/default.jpg')
    return out


def planche(dossier, sortie, dos, largeur, region, imgs):
    a = []
    for i in imgs:
        a += ['-label', i, extrait(dossier, dos, i, largeur, region)]
    subprocess.run(['montage', *a, '-tile', f'{os.environ.get("COLS", 2)}x', '-geometry', '+3+3', '-pointsize', '22', sortie], check=True)
    print(sortie)


if __name__ == '__main__':
    cmd, dossier, *r = sys.argv[1:]
    if cmd == 'registres':
        registres(dossier, r[0])
    elif cmd == 'images':
        images(dossier, r)
    elif cmd == 'extrait':
        print(extrait(dossier, *r))
    elif cmd == 'planche':
        planche(dossier, r[0], r[1], r[2], r[3], r[4:])

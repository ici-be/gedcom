import json,glob,collections,re,sys
W=sys.argv[1]
ev={e['n']:e for e in json.load(open(W+'/evenements.json'))}
R={}
for f in sorted(glob.glob(W+'/resultats*.jsonl')):
  for l in open(f): d=json.loads(l); R[d['n']]=d
J={}
for l in open(W+'/journal.jsonl'): d=json.loads(l); J[d['n']]=d['etat']
regs={}
for t in ('PR','CS'):
  for r in json.load(open(f'{W}/agatha_{t}.json')): regs[r['bp']]=r
F=json.load(open(W+'/agatha_images.json'))
dos2={}
for bp,f in F.items():
  r=regs[bp]; dos2.setdefault(f['dossier'],set()).add(f"{r['quoi'].lower()} {r['de']}" + (f"-{r['a']}" if r['a']!=r['de'] else ''))
def qui(e):
  if e['kind']=='fam': return f"{e['mari']['prenom']} {e['mari']['nom']} et {e['femme']['prenom']} {e['femme']['nom']}"
  return f"{e['qui']['prenom']} {e['qui']['nom']}"
cle=lambda n: tuple(ev[n]['dmy'] or (0,0,0))[::-1]
TAG={'BIRT':'naissance','BAPM':'baptême','DEAT':'décès','BURI':'sépulture','MARR':'mariage'}
use=collections.Counter()
for n,d in R.items():
  if J.get(n)=='posé':
    m=re.search(r'/images/\d+/([^/]+)/',d['src'] or '')
    use[m[1] if m else 'FamilySearch (index)']+=1
nb=sum(1 for v in J.values() if v=='posé')
fs=use['FamilySearch (index)']
L=["# Turnhout : liens d’actes ajoutés sur Geneanet\n",
f"Le 20/11/2026, {nb} liens ont été posés dans le champ Source des événements de Turnhout qui n’en avaient pas : ancêtres directs d’Olivia (@I21@ ; Bruno n’a aucun événement à Turnhout), leurs frères et sœurs et leurs unions. Base : export GEDCOM du 19/11/2026 (175 événements sans lien à Turnhout, dont 157 à date complète). {fs} liens FamilySearch repérés par l’index nominatif (nom, date exacte et parents concordants) ; {nb-fs} liens Agatha, chaque acte ayant été lu sur l’image. Chaque lien a été relu sur la fiche publique juste après l’enregistrement. Aucune date ni aucun nom n’a été modifié. Un événement avait déjà son lien sur la fiche en ligne (Jan Baptist Mortiers, baptême du 5/10/1684). Outil : `scripts/sources-commune/` du dépôt gedcom ; détail : `evenements.json`, `resultats*.jsonl`, `journal.jsonl`.\n",
"## Registres utilisés\n","Agatha, fonds 511 (paroisse Saint-Pierre, puis état civil) ; lien : `https://agatha.arch.be/data/images/511/DOSSIER/IMAGE`.\n"]
for d,c in sorted(use.items()):
  L.append(f"- {d} : {c} lien(s)" + (f" ({' ; '.join(sorted(dos2[d]))})" if d in dos2 else ''))
L.append("\nSous la Révolution, les registres civils sont étiquetés en années grégoriennes approximatives : le registre des naissances « 1799-1800 » (306530) est celui de l’an IX, celui des décès (306529) celui de l’an VIII. Certains baptêmes de 1797-1800 sont dans le registre paroissial 511_0001_126_00019/00020 et non dans l’état civil.\n")
L.append("## À vérifier en priorité\n")
L.append("- **Lambertus Mortiers** (baptême du 6/3/1782) : l’index FamilySearch donne un décès en 1854 de « Hubertus » Mortiers, né le 6/3/1782, fils de Martinus et Magdalena Meurs, époux de Joanna Maria De Laet : le prénom de l’arbre est peut-être à revoir.")
L.append("- **Petrus Jacobus Bogarts** (décès du 5/10/1815) : l’acte nomme « Jacques Boogers », 84 ans, fils de feu Martin Boogers, veuf de Pétronille Adriaensen ; l’âge (né vers 1731) cadre mal avec un baptême de 1735, et l’épouse n’est pas dans l’arbre.")
L.append("- **Dates de naissance de l’arbre plus tardives que le baptême lu** : Maria Elisabetha Boogaerts (arbre 20/7/1726, baptême 29/6/1726), Josephus Boogaerts (arbre 7/9/1729, baptême 7/11/1729), Petrus Jacobus Bogarts (arbre 14/11/1735, baptême 24/1/1735), Jan Beurghs (arbre 9/2/1727, baptême 8/1/1727), Marie Gertrude Mortiers (arbre 29/3/1775, baptême 29/4/1775), Constantinus Stroobant (arbre 27/10/1841, né le 27/9/1841).\n")
L.append("## Écarts relevés (liens posés, arbre laissé tel quel)\n")
for n in sorted(R, key=cle):
  d=R[n]
  if J.get(n)=='posé' and d.get('ecart'):
    e=ev[n]; L.append(f"- **{qui(e)}** ({TAG.get(e['tag'][:4],e['tag'])} {e['date']}) : {d['ecart']} — {d['lu']}")
L.append("\n## Non trouvés\n")
for n in sorted(ev, key=cle):
  e=ev[n]
  if e['dmy'] and J.get(n) not in ('posé','déjà présent'):
    L.append(f"- **{qui(e)}** ({TAG.get(e['tag'][:4],e['tag'])} {e['date']}) : {R.get(n,{}).get('motif','')}")
L.append("\nLes 18 événements sans date complète (naissances « vers », décès « après », sépultures sans date…) n’ont pas été traités.\n")
t='\n'.join(L)
t=re.sub(r' ([:;?!])(?=\s)', ' \\1', t)
open(W+'/rapport_turnhout.md','w').write(t)
print(nb, fs, len(L))

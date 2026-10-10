// Prénoms : regroupement des variantes (latin des registres, flamand, ancien français, allemand…)
// sous une forme française usuelle. « Joannes », « Jan », « Jehan » → Jean.

import { sansAccents } from './metiers'

// Forme retenue, puis ses variantes (minuscules, sans accents). La forme retenue est incluse d'office.
const VARIANTES = `
Jean: joannes johannes ioannes jan jehan johan johann joan hans john giovanni juan janne
Jean-Baptiste: joannes-baptista johannes-baptista jan-baptist jean-baptist
Pierre: petrus pieter peeter peter piet pedro pietro piere
Jacques: jacobus jacob jaak jakob jaques james giacomo jacomo jaime
François: franciscus frans franz francis francesco francisco franchois
Joseph: josephus jozef giuseppe jose
Henri: henricus hendrik hendrick hendricus henry heinrich henrik enrico
Charles: carolus karel karl carl carlo carlos
Nicolas: nicolaus nicolaes niclaes nicolaas klaas claes nikolaus nicola nicolo
Louis: ludovicus lodovicus lodewijk ludwig luigi luis lowys loys
Guillaume: guilielmus guillielmus guillelmus guilelmus gulielmus guilhelmus wilhelmus willelmus willem wilhelm william guglielmo guillermo
Antoine: antonius anthonius antoon anton anthoine antonio anthony anthoni
Philippe: philippus philips filip philip philipp filippo felipe
Josse: judocus jodocus joos joost joes
Gilles: egidius aegidius gillis gielis gilis egide aegide
Adrien: adrianus adriaen adriaan adrian adriano
Corneille: cornelius cornelis cornelio
Martin: martinus maarten merten martino
Michel: michael michiel michele miguel
André: andreas andries andrees andrew
Thomas: tomas tommaso
Simon: simoen
Arnould: arnoldus arnold arnaud arnout arnaut arnoult aert
Georges: georgius george georg joris jorge giorgio
Claude: claudius claudio
Paul: paulus pauwel paolo pablo pol
Jules: julius giulio julio
Auguste: augustus august augusto
Liévin: livinus lieven lievin livin
Édouard: eduardus edouard edward eduard edoardo eduardo
Albert: albertus albrecht aelbrecht alberto
Émile: aemilius emilius emile emil emilio
Étienne: stephanus etienne estienne steven stefan stephan stephen stefano esteban
Gustave: gustavus gustaaf gustav
Gérard: gerardus gerard geert gerrit gerhard gerardo
Ferdinand: ferdinandus ferdinando fernando
Alexandre: alexander alexandrus alessandro
Robert: robertus robrecht roberto
Hubert: hubertus hubrecht huybrecht
Mathieu: matheus mattheus matthaeus mathaeus matthieu matthew matteo mateo
Mathias: matthias matthijs mathijs matthys mathys
Bernard: bernardus bernaert bernhard bernardo
Eugène: eugenius eugen eugenio
Rombaut: rumoldus rombout rumold
Laurent: laurentius laurens lauwereys lorenz laurenz lorenzo lawrence
Augustin: augustinus augustijn agostino
Lambert: lambertus lambrecht lamberto
Julien: julianus juliaan julian giuliano
Léopold: leopoldus leopoldo
Gilbert: gilbertus gijsbert gysbrecht
Dominique: dominicus dominicq dominic domenico domingo
Chrétien: christianus christiaan christian kerstiaen
Léonard: leonardus lenaert leonhard lenard leonardo
Gabriel: gabriele
Emmanuel: emanuel emmanuele
Barthélemy: bartholomeus bartholomaeus bertholomeus bartholomew bartel bartolomeo
Théodore: theodorus theodor teodoro
Thierry: theodoricus dirk dierick dierik diederik dietrich
Denis: dionysius dionisius denijs dionys dennis
Maximilien: maximilianus maximiliaan maximilian
Maurice: mauritius maurits moritz maurizio
Christophe: christophorus christoffel christopher christoph cristoforo stoffel
Engelbert: engelbertus engelbrecht
Félix: felice
Herman: hermannus hermanus hermann harmen
Isidore: isidorus isidoor isidoro
Frédéric: fredericus fridericus frederik friedrich frederick federico
Sébastien: sebastianus sebastiaan sebastian sebastiano
Gaspard: gaspar gasparus caspar casparus kaspar jasper gaspare
Florent: florentius floris florens
Vincent: vincentius vincenzo vicente
Marc: marcus marco mark markus
Olivier: oliverius oliver oliviero
Servais: servatius servaes servaas
Luc: lucas lukas luca
Grégoire: gregorius gregory gregorio
Noël: natalis
Prosper: prosperus prospero
Raoul: radulphus radulfus
Richard: richardus riccardo
Lucien: lucianus luciano
Ignace: ignatius ignaas ignazio ignacio
Ambroise: ambrosius ambroos ambrogio
Constantin: constantinus constantijn costantino
Baudouin: balduinus baldwinus boudewijn baldwin
Benoît: benedictus benedict benedikt benedetto benito
Godefroid: godefridus godfried godefroy gottfried godfrey goffredo
Gauthier: walterus gualterus wouter gautier wauthier walter gualtiero
Ange: angelus angelo
Gommaire: gommarus gummarus gommer
Rémi: remigius remy remigio
Philibert: philibertus
Valentin: valentinus valentijn valentino
Alexis: alexius alessio
Hugues: hugo hugh ugo
Léon: leo leone
Romain: romanus romano
Roland: rolandus roeland orlando
Renaud: reginaldus reinoud reinout reginald renault rinaldo
Octave: octavius ottavio
Firmin: firminus
Désiré: desiderius
Dieudonné: deodatus
Fidèle: fidelis
Célestin: caelestinus coelestinus celestinus
Achille: achilles
Félicien: felicianus
Marcel: marcellus
Armand: armandus
Edmond: edmundus edmund
Alfred: alfredus
Raymond: raymundus raimundus raimond
Roger: rogerus rogier
Xavier: xaverius
Alphonse: alphonsus alfons alfonso
Adolphe: adolphus adolf adolph adolfo
Abraham: abrahamus
Adam: adamus

Marie: maria mary marij marija mayken maeyken maiken
Anne: anna
Jeanne: joanna johanna jehenne jehanne joanne jana giovanna juana jane
Élisabeth: elisabetha elizabetha elisabeth elizabeth elisabet lysbeth lijsbeth elsbeth
Catherine: catharina catherina catharine kathelijne cathelijne catelijne cathelyne katharina caterina catalina katherine
Barbe: barbara barbera
Marguerite: margareta margaretha margarita margarethe margriet margriete margaret margherita
Françoise: francisca franciska franziska francesca
Thérèse: theresia teresa theresa tresia
Pétronille: petronella petronilla petronelle pieternella
Joséphine: josephina josepha jozefina giuseppina
Isabelle: isabella isabeau isabel ysabeau ysabel
Antoinette: antonia antonetta
Louise: ludovica louisa luisa lowyse louize louiza
Josine: judoca jodoca josina joosyne joossyne josijne
Adrienne: adriana
Claire: clara clare chiara klara
Cornélie: cornelia
Madeleine: magdalena magdeleine magdelaine madelaine magdalaine magdalene maddalena
Gertrude: gertrudis geertruid geertruyd gertrud gertruda
Jacqueline: jacoba jacquelina
Liévine: livina lievina
Caroline: carolina karolina
Pauline: paulina
Agnès: agnes agneta agnete agnieta agnese
Victoire: victoria
Amélie: amelia amalia amalie
Julie: julia giulia
Sophie: sophia sofia
Rosalie: rosalia
Henriette: henrica henrietta hendrika hendrina enrichetta
Hélène: helena heleen elena
Suzanne: susanna susanne suzanna susana
Cécile: cecilia cecilie
Lucie: lucia
Christine: christina kristina cristina
Martine: martina
Dymphne: dymphna dimphna dympna dimpna
Reine: regina regine
Rose: rosa
Philomène: philomena
Béatrice: beatrix beatris beatrijs
Dorothée: dorothea
Mathilde: mathildis mechtildis mechteld machteld matilda mathilda mahaut
Aldegonde: aldegondis aldegundis
Colette: coleta coletta
Angélique: angelica
Laurence: laurentia lorenza
Félicité: felicitas
Florence: florentia
Augustine: augustina
Ève: eva
Odile: odilia ottilia ottilie
Julienne: juliana giuliana
Constance: constantia
Clémence: clementia
Adèle: adela
Adélaïde: adelaidis adelheid
Berthe: bertha berta
Émilie: aemilia emilia
Éléonore: eleonora leonora
Geneviève: genovefa genoveva
Stéphanie: stephania
Sidonie: sidonia
Séraphine: seraphina
Marthe: martha marta
Véronique: veronica
Gabrielle: gabriela gabriella
Ursule: ursula
Apolline: apollonia
Désirée: desiderata
Florentine: florentina
Clémentine: clementina
Célestine: caelestina coelestina celestina
Albertine: albertina
Philippine: philippina philippa
Gillette: egidia
Alexandrine: alexandrina
Victorine: victorina
Adolphine: adolphina
Hortense: hortensia
Eugénie: eugenia
Mélanie: melania
Laure: laura
Nathalie: natalia natalie
Sylvie: silvia sylvia
Virginie: virginia
Rosine: rosina
Flore: flora
Renée: renata
Élise: elisa eliza
`

const TABLE = new Map<string, string>()
for (const ligne of VARIANTES.split('\n')) {
  const [forme, reste] = ligne.split(':')
  if (!reste) continue
  for (const v of [sansAccents(forme), ...reste.trim().split(/\s+/)]) TABLE.set(v, forme.trim())
}

/** Forme usuelle d'un prénom (lui-même, débarrassé des accents et de la casse, s'il n'est pas répertorié) */
export function formeUsuelle(prenom: string): string | undefined {
  return TABLE.get(sansAccents(prenom))
}

/** Clé de regroupement : la forme usuelle si connue, sinon le prénom sans accents ni majuscules */
export function clePrenom(prenom: string): string {
  return formeUsuelle(prenom) ?? sansAccents(prenom)
}

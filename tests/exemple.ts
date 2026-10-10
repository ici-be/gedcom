// Petit arbre de test : Paul (I1), ses parents Jean et Marie, ses grands-parents paternels.
export const GED = `0 HEAD
1 SOUR Geneanet
2 DATA dupont.gwb
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL Registre paroissial de Malines
0 @I1@ INDI
1 NAME Paul /Dupont/
1 SEX M
1 BIRT
2 DATE 30 MAY 1982
2 PLAC Ottignies, Brabant wallon, Belgique
2 SOUR Famille
1 FAMC @F1@
0 @I2@ INDI
1 NAME Jean /Dupont/
1 SEX M
1 BIRT
2 DATE ABT 1950
2 PLAC Malines, Anvers, Belgique
1 DEAT Y
1 FAMC @F2@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Marie /Lambert/
1 SEX F
1 BAPM
2 DATE 2 MAR 1952
2 PLAC Malines, Anvers, Belgique
2 SOUR @S1@
3 PAGE folio 12
1 FAMS @F1@
0 @I4@ INDI
1 NAME Pierre /Dupont/
1 SEX M
1 DEAT
2 DATE 1 JAN 1990
2 PLAC Malines, Anvers, Belgique
2 SOUR https://agatha.arch.be/data/images/1
1 FAMS @F2@
0 @I5@ INDI
1 NAME Anne /?/
1 SEX F
1 FAMS @F2@
0 @I6@ INDI
1 NAME Luc /Dupont/
1 SEX M
1 BIRT
2 DATE 1955
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 MARR
2 DATE 10 JUN 1975
2 PLAC Malines, Anvers, Belgique
0 @F2@ FAM
1 HUSB @I4@
1 WIFE @I5@
1 CHIL @I2@
1 CHIL @I6@
1 MARR Y
0 TRLR
`

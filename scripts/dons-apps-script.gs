// Compteur de dons déclarés, enregistrés dans une feuille Google Sheets.
// Installation : voir le README (« Compteur de dons »).
//
// La feuille s'appelle « Dons » et a pour première ligne : Date | Association | Montant

const FEUILLE = 'Dons'
const MONTANT_MAX = 10000

function feuille_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEUILLE)
}

// Lecture : { dons, total }
function doGet() {
  const f = feuille_()
  const n = f.getLastRow() - 1
  let total = 0
  if (n > 0) f.getRange(2, 3, n, 1).getValues().forEach((l) => { total += Number(l[0]) || 0 })
  return ContentService.createTextOutput(JSON.stringify({ dons: Math.max(0, n), total: Math.round(total) })).setMimeType(ContentService.MimeType.JSON)
}

// Écriture : corps « {"association":"…","montant":20} »
function doPost(e) {
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const d = JSON.parse(e.postData.contents)
    const montant = Math.round(Number(d.montant))
    const association = String(d.association || '').slice(0, 60)
    if (!(montant >= 1 && montant <= MONTANT_MAX) || !association) {
      return ContentService.createTextOutput('{"ok":false}').setMimeType(ContentService.MimeType.JSON)
    }
    feuille_().appendRow([new Date(), association, montant])
    return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON)
  } finally {
    lock.releaseLock()
  }
}

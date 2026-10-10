// Export CSV lisible directement par Excel et LibreOffice (point-virgule, BOM UTF-8).

export function versCsv(lignes: (string | number)[][]): string {
  const cellule = (v: string | number) => {
    const s = String(v)
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return '﻿' + lignes.map((l) => l.map(cellule).join(';')).join('\r\n')
}

export function telecharger(nom: string, contenu: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

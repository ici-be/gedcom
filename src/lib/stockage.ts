// Ce qui reste dans le navigateur : le dernier fichier (IndexedDB), les réglages et les cases cochées (localStorage).
// Rien n'est envoyé sur Internet.

export interface FichierGarde { nom: string; importe: string; octets: Uint8Array }

function base(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('lignees', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('fichiers')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
}

async function operation<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await base()
  return new Promise((ok, ko) => {
    try {
      const tx = db.transaction('fichiers', mode)
      const r = f(tx.objectStore('fichiers'))
      // la connexion est refermée quand la transaction se termine ; une écriture n'est réussie qu'à ce moment
      tx.oncomplete = () => { db.close(); ok(r.result as T) }
      tx.onerror = tx.onabort = () => { db.close(); ko(tx.error ?? r.error) }
    } catch (e) {
      db.close()
      ko(e)
    }
  })
}

export async function lireFichier(): Promise<FichierGarde | undefined> {
  try { return await operation<FichierGarde | undefined>('readonly', (s) => s.get('actuel')) } catch { return undefined }
}

export async function garderFichier(f: FichierGarde): Promise<void> {
  try { await operation('readwrite', (s) => s.put(f, 'actuel')) } catch { /* navigation privée : tant pis */ }
}

export async function oublierFichier(): Promise<void> {
  try { await operation('readwrite', (s) => s.delete('actuel')) } catch { /* rien à effacer */ }
}

export function lire<T>(cle: string, defaut: T): T {
  try {
    const v = localStorage.getItem('lignees.' + cle)
    return v === null ? defaut : (JSON.parse(v) as T)
  } catch {
    return defaut
  }
}

export function ecrire(cle: string, v: unknown): void {
  try { localStorage.setItem('lignees.' + cle, JSON.stringify(v)) } catch { /* stockage indisponible */ }
}

export function oublierTout(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('lignees.')) localStorage.removeItem(k)
  } catch { /* rien */ }
}

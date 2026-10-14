import { getAuthToken } from './session'

// Lädt eine Bilddatei zu storage/media hoch (siehe backend MediaStore) und liefert die neue
// "/api/media/{name}"-URL zurück, die anschließend anstelle einer eingebetteten Base64-Data-URL im
// jeweiligen Feld/Konfigurationswert gespeichert wird. Wirft bei einem Fehler (z. B. Netzwerkproblem oder
// nicht unterstütztes Format), damit der Aufrufer dem Nutzer eine Fehlermeldung anzeigen kann.
export async function uploadMediaImage(file: File, thumb?: Blob): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  if (thumb) formData.append('thumb', thumb, 'thumb.jpg')

  const token = getAuthToken()
  const response = await fetch('/api/media', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  })

  if (!response.ok) {
    throw new Error(`Bild-Upload fehlgeschlagen (HTTP ${response.status}).`)
  }

  const result = await response.json() as { url: string }
  return result.url
}

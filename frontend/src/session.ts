// Gemeinsam genutzter Zugriff auf die in localStorage gespeicherte Login-Sitzung. Ausgelagert aus
// App.tsx, damit auch kleinere, eigenständige Komponenten (z. B. AuthImage) ohne Umweg über Props an
// das aktuelle Bearer-Token kommen.
export const SESSION_KEY = 'audit-tool-session'

export function getAuthToken(): string | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { token?: string; expiresAtUtc?: string }
    if (!parsed.token || !parsed.expiresAtUtc) return null

    const expiry = new Date(parsed.expiresAtUtc).getTime()
    if (Number.isNaN(expiry) || expiry <= Date.now()) return null

    return parsed.token
  } catch {
    return null
  }
}

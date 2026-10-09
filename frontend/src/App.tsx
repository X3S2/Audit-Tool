import { useEffect, useState } from 'react'
import './App.css'

type ThemeMode = 'dark' | 'light'
type PageKey = 'dashboard' | 'audits' | 'standorte' | 'vorlagen' | 'raume' | 'admin' | 'profil'

type User = {
  id: number
  userName: string
  displayName: string
  role: string
  isActive: boolean
}

type Session = {
  token: string
  expiresAtUtc: string
  expiresInHours: number
  user: User
}

type Category = {
  id: number
  name: string
  description: string
}

type Site = {
  id: number
  categoryId: number
  category: string
  name: string
  address: string
  phone: string
  caretakerPhone: string
  active: boolean
}

type TemplateField = {
  id: number
  name: string
  type: string
  order: number
  relevantForProgress: boolean
}

type Template = {
  id: number
  name: string
  description: string
  fields: TemplateField[]
}

type Room = {
  id: number
  siteId: number
  name: string
  description: string
  capacity: string
  area: string
  notes: string
}

type AuditObject = {
  id: number
  roomId: number
  name: string
  objectType: string
  status: string
  notes: string
}

type ChecklistEntry = {
  id: number
  auditId: number
  templateFieldId: number
  question: string
  answer: string
  status: string
}

type AuditInstance = {
  id: number
  siteId: number
  templateId: number
  title: string
  templateName: string
  createdBy: string
  createdAtUtc: string
  status: string
  entryCount?: number
  checklistEntries?: ChecklistEntry[]
}

type BackupRecord = {
  id: string
  fileName: string
  createdAtUtc: string
  sizeBytes: number
  type: string
}

const SESSION_KEY = 'audit-tool-session'
const THEME_KEY = 'audit-tool-theme'
const API_BASE = 'http://localhost:5050'

function readSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Session
    if (!parsed.token || !parsed.expiresAtUtc) {
      return null
    }

    const expiry = new Date(parsed.expiresAtUtc).getTime()
    if (Number.isNaN(expiry) || expiry <= Date.now()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }

    return parsed
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

function readTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

const canManageUsers = (role: string) => ['Superadmin', 'Admin'].includes(role)

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme())
  const [session, setSession] = useState<Session | null>(() => readSession())
  const [page, setPage] = useState<PageKey>('dashboard')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<User | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [objects, setObjects] = useState<AuditObject[]>([])
  const [audits, setAudits] = useState<AuditInstance[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [exportSiteId, setExportSiteId] = useState('1')
  const [loginForm, setLoginForm] = useState({ username: 'superadmin', password: 'Password123!' })
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [siteForm, setSiteForm] = useState({ categoryId: '1', name: '', address: '', phone: '', caretakerPhone: '' })
  const [roomForm, setRoomForm] = useState({ siteId: '1', name: '', description: '', capacity: '', area: '', notes: '' })
  const [objectForm, setObjectForm] = useState({ roomId: '1', name: '', objectType: '', status: 'Gut', notes: '' })
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    fields: 'Raumname|text|1|true\nZustand|dropdown|2|true\nKommentar|textarea|3|false'
  })
  const [auditForm, setAuditForm] = useState({ siteId: '1', templateId: '1', title: '' })
  const [checklistForm, setChecklistForm] = useState({ auditId: '', question: '', answer: '', status: 'offen' })

  const categoryNameById = Object.fromEntries(categories.map((category) => [category.id, category.name]))
  const siteNameById = Object.fromEntries(sites.map((site) => [site.id, site.name]))
  const roomNameById = Object.fromEntries(rooms.map((room) => [room.id, room.name]))

  useEffect(() => {
    document.body.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!session) {
      return
    }

    const expiry = new Date(session.expiresAtUtc).getTime()
    const timeout = expiry - Date.now()
    if (timeout <= 0) {
      localStorage.removeItem(SESSION_KEY)
      setSession(null)
      return
    }

    const timer = window.setTimeout(() => {
      localStorage.removeItem(SESSION_KEY)
      setSession(null)
      setError('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.')
    }, timeout)

    return () => window.clearTimeout(timer)
  }, [session])

  useEffect(() => {
    if (!session) {
      return
    }

    const loadProfile = async () => {
      try {
        const data = await apiRequest<{ user: User }>('/api/auth/me', session)
        setProfile(data.user)
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Session konnte nicht geladen werden.')
      }
    }

    void loadProfile()
  }, [session])

  useEffect(() => {
    if (!session) {
      return
    }

    const loadData = async () => {
      try {
        const [categoryData, siteData, templateData, roomData, objectData, auditData] = await Promise.all([
          apiRequest<Category[]>('/api/categories', session),
          apiRequest<Site[]>('/api/standorte', session),
          apiRequest<Template[]>('/api/templates', session),
          apiRequest<Room[]>('/api/rooms', session),
          apiRequest<AuditObject[]>('/api/objects', session),
          apiRequest<AuditInstance[]>('/api/audits', session)
        ])

        setCategories(categoryData)
        setSites(siteData)
        setTemplates(templateData)
        setRooms(roomData)
        setObjects(objectData)
        setAudits(auditData)
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Daten konnten nicht geladen werden.')
      }
    }

    void loadData()
  }, [session])

  useEffect(() => {
    if (!session || !canManageUsers(session.user.role)) {
      setUsers([])
      setBackups([])
      return
    }

    const loadUsers = async () => {
      try {
        const [userData, backupData] = await Promise.all([
          apiRequest<User[]>('/api/users', session),
          apiRequest<BackupRecord[]>('/api/admin/backups', session)
        ])

        setUsers(userData)
        setBackups(backupData)
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Admin-Daten konnten nicht geladen werden.')
      }
    }

    void loadUsers()
  }, [session])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginForm.username, password: loginForm.password })
      })

      if (!response.ok) {
        throw new Error('Login fehlgeschlagen. Bitte prüfen Sie Benutzername und Passwort.')
      }

      const data = (await response.json()) as Session
      const expiry = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000).toISOString()
      const nextSession: Session = { ...data, expiresAtUtc: expiry }

      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))
      setSession(nextSession)
      setPage('dashboard')
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unbekannter Login-Fehler.')
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
    setProfile(null)
    setUsers([])
    setError('')
    setPage('dashboard')
  }

  const createBackup = async () => {
    if (!session) {
      return
    }

    try {
      const backup = await apiRequest<BackupRecord>('/api/admin/backups', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      setBackups((previous) => [backup, ...previous])
      setError('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Backup konnte nicht erstellt werden.')
    }
  }

  const restoreBackup = async (backupId: string) => {
    if (!session) {
      return
    }

    try {
      await apiRequest<{ message: string }>(`/api/admin/backups/${backupId}/restore`, session, { method: 'POST' })
      setError('Backup wiederhergestellt.')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Backup konnte nicht wiederhergestellt werden.')
    }
  }

  const deleteBackup = async (backupId: string) => {
    if (!session) {
      return
    }

    try {
      await apiRequest<{ message: string }>(`/api/admin/backups/${backupId}`, session, { method: 'DELETE' })
      setBackups((previous) => previous.filter((backup) => backup.id !== backupId))
      setError('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Backup konnte nicht gelöscht werden.')
    }
  }

  const exportAuditZip = async () => {
    if (!session) {
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/admin/export/zip?siteId=${encodeURIComponent(exportSiteId)}`, {
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      })

      if (!response.ok) {
        throw new Error('Export konnte nicht erstellt werden.')
      }

      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') ?? 'audit-export.zip'
      link.click()
      window.URL.revokeObjectURL(downloadUrl)
      setError('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Export konnte nicht gestartet werden.')
    }
  }

  const createCategory = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) {
      return
    }

    try {
      const category = await apiRequest<Category>('/api/categories', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm)
      })
      setCategories((previous) => [...previous, category])
      setCategoryForm({ name: '', description: '' })
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Kategorie konnte nicht gespeichert werden.')
    }
  }

  const createSite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) {
      return
    }

    try {
      const site = await apiRequest<Site>('/api/standorte', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: Number(siteForm.categoryId),
          name: siteForm.name,
          address: siteForm.address,
          phone: siteForm.phone,
          caretakerPhone: siteForm.caretakerPhone
        })
      })
      setSites((previous) => [...previous, site])
      setSiteForm({ categoryId: '1', name: '', address: '', phone: '', caretakerPhone: '' })
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Standort konnte nicht gespeichert werden.')
    }
  }

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) {
      return
    }

    try {
      const room = await apiRequest<Room>('/api/rooms', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: Number(roomForm.siteId),
          name: roomForm.name,
          description: roomForm.description,
          capacity: roomForm.capacity,
          area: roomForm.area,
          notes: roomForm.notes
        })
      })
      setRooms((previous) => [...previous, room])
      setRoomForm({ siteId: '1', name: '', description: '', capacity: '', area: '', notes: '' })
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Raum konnte nicht gespeichert werden.')
    }
  }

  const createObject = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) {
      return
    }

    try {
      const objectEntry = await apiRequest<AuditObject>('/api/objects', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: Number(objectForm.roomId),
          name: objectForm.name,
          objectType: objectForm.objectType,
          status: objectForm.status,
          notes: objectForm.notes
        })
      })
      setObjects((previous) => [...previous, objectEntry])
      setObjectForm({ roomId: '1', name: '', objectType: '', status: 'Gut', notes: '' })
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Objekt konnte nicht gespeichert werden.')
    }
  }

  const createAudit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) {
      return
    }

    try {
      const audit = await apiRequest<AuditInstance>('/api/audits', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: Number(auditForm.siteId),
          templateId: Number(auditForm.templateId),
          title: auditForm.title
        })
      })
      setAudits((previous) => [audit, ...previous])
      setAuditForm({ siteId: '1', templateId: '1', title: '' })
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Audit konnte nicht gespeichert werden.')
    }
  }

  const addChecklistEntry = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session || !checklistForm.auditId) {
      return
    }

    try {
      const entry = await apiRequest<ChecklistEntry>(`/api/audits/${Number(checklistForm.auditId)}/checklist`, session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: checklistForm.question,
          answer: checklistForm.answer,
          status: checklistForm.status
        })
      })

      setAudits((previous) => previous.map((audit) => {
        if (audit.id !== Number(checklistForm.auditId)) {
          return audit
        }

        const checklistEntries = [...(audit.checklistEntries ?? []), entry]
        return { ...audit, checklistEntries, entryCount: checklistEntries.length }
      }))
      setChecklistForm({ auditId: '', question: '', answer: '', status: 'offen' })
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Checklistenpunkt konnte nicht gespeichert werden.')
    }
  }

  const createTemplate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) {
      return
    }

    try {
      const lines = templateForm.fields
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split('|'))
        .map((parts) => ({
          name: parts[0],
          type: parts[1] ?? 'text',
          order: Number(parts[2] ?? '1'),
          relevantForProgress: parts[3] ? parts[3].toLowerCase() === 'true' : true
        }))

      const template = await apiRequest<Template>('/api/templates', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateForm.name,
          description: templateForm.description,
          fields: lines
        })
      })

      setTemplates((previous) => [...previous, template])
      setTemplateForm({ name: '', description: '', fields: 'Raumname|text|1|true\nZustand|dropdown|2|true' })
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Vorlage konnte nicht gespeichert werden.')
    }
  }

  const navItems: Array<{ key: PageKey; label: string; visible: boolean }> = [
    { key: 'dashboard', label: 'Dashboard', visible: true },
    { key: 'audits', label: 'Audits', visible: true },
    { key: 'standorte', label: 'Standorte', visible: true },
    { key: 'vorlagen', label: 'Vorlagen', visible: true },
    { key: 'raume', label: 'Räume & Objekte', visible: true },
    { key: 'admin', label: 'Admin Page', visible: session ? canManageUsers(session.user.role) : false },
    { key: 'profil', label: 'Profil', visible: true }
  ]

  if (!session) {
    return (
      <div className="login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-header">
            <span className="eyebrow">Audit-Tool</span>
            <h1>Anmeldung</h1>
            <p>Bitte melden Sie sich mit Ihrem Zugang an.</p>
          </div>

          <label>
            Benutzername
            <input
              value={loginForm.username}
              onChange={(event) => setLoginForm((previous) => ({ ...previous, username: event.target.value }))}
              placeholder="superadmin"
            />
          </label>

          <label>
            Passwort
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((previous) => ({ ...previous, password: event.target.value }))}
              placeholder="Password123!"
            />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Anmeldung...' : 'Einloggen'}
          </button>

          <small className="security-note">Sitzung gültig für 8 Stunden. Danach erfolgt eine automatische Abmeldung.</small>
        </form>
      </div>
    )
  }

  const activeSession = session

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">A</span>
          <div>
            <h2>Audit-Tool</h2>
            <small>Audit- und Datenmanagement</small>
          </div>
        </div>

        <div className="toolbar-right">
          <button className="theme-toggle" type="button" onClick={() => setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="user-pill">
            <span>{profile?.displayName ?? activeSession.user.displayName}</span>
            <em>{profile?.role ?? activeSession.user.role}</em>
          </div>
          <button type="button" className="ghost-button" onClick={logout}>Abmelden</button>
        </div>
      </header>

      <div className="content-shell">
        <aside className="sidebar">
          {navItems.filter((item) => item.visible).map((item) => (
            <button
              key={item.key}
              type="button"
              className={page === item.key ? 'nav-item active' : 'nav-item'}
              onClick={() => setPage(item.key)}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <main className="main-panel">
          {error ? <div className="global-alert">{error}</div> : null}

          {page === 'dashboard' ? (
            <section className="panel">
              <h3>Dashboard</h3>
              <div className="stats-grid">
                <div className="stat-card"><span>Standorte</span><strong>{sites.length}</strong></div>
                <div className="stat-card"><span>Kategorien</span><strong>{categories.length}</strong></div>
                <div className="stat-card"><span>Vorlagen</span><strong>{templates.length}</strong></div>
                <div className="stat-card"><span>Abschluss</span><strong>72%</strong></div>
              </div>
            </section>
          ) : null}

          {page === 'audits' ? (
            <section className="panel">
              <h3>Audits</h3>
              <table>
                <thead>
                  <tr>
                    <th>Audit</th>
                    <th>Standort</th>
                    <th>Vorlage</th>
                    <th>Einträge</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((audit) => (
                    <tr key={audit.id}>
                      <td>{audit.title}</td>
                      <td>{siteNameById[audit.siteId] ?? 'Unbekannt'}</td>
                      <td>{audit.templateName}</td>
                      <td>{audit.entryCount ?? audit.checklistEntries?.length ?? 0}</td>
                      <td>{audit.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="form-card" onSubmit={createAudit}>
                <h4>Neues Audit anlegen</h4>
                <div className="form-grid">
                  <label>
                    Standort
                    <select value={auditForm.siteId} onChange={(event) => setAuditForm((previous) => ({ ...previous, siteId: event.target.value }))}>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Vorlage
                    <select value={auditForm.templateId} onChange={(event) => setAuditForm((previous) => ({ ...previous, templateId: event.target.value }))}>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Titel
                    <input value={auditForm.title} onChange={(event) => setAuditForm((previous) => ({ ...previous, title: event.target.value }))} />
                  </label>
                </div>
                <button type="submit" className="primary-button">Audit speichern</button>
              </form>

              <form className="form-card" onSubmit={addChecklistEntry}>
                <h4>Checklistenpunkt hinzufügen</h4>
                <div className="form-grid">
                  <label>
                    Audit
                    <select value={checklistForm.auditId} onChange={(event) => setChecklistForm((previous) => ({ ...previous, auditId: event.target.value }))}>
                      <option value="">Bitte auswählen</option>
                      {audits.map((audit) => (
                        <option key={audit.id} value={audit.id}>{audit.title}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Frage
                    <input value={checklistForm.question} onChange={(event) => setChecklistForm((previous) => ({ ...previous, question: event.target.value }))} />
                  </label>

                  <label>
                    Antwort
                    <input value={checklistForm.answer} onChange={(event) => setChecklistForm((previous) => ({ ...previous, answer: event.target.value }))} />
                  </label>

                  <label>
                    Status
                    <select value={checklistForm.status} onChange={(event) => setChecklistForm((previous) => ({ ...previous, status: event.target.value }))}>
                      <option value="offen">offen</option>
                      <option value="ok">ok</option>
                      <option value="warnung">warnung</option>
                      <option value="kritisch">kritisch</option>
                    </select>
                  </label>
                </div>
                <button type="submit" className="primary-button">Eintrag speichern</button>
              </form>
            </section>
          ) : null}

          {page === 'standorte' ? (
            <section className="panel">
              <h3>Standorte</h3>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kategorie</th>
                    <th>Adresse</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id}>
                      <td>{site.name}</td>
                      <td>{categoryNameById[site.categoryId] ?? site.category ?? 'Unbekannt'}</td>
                      <td>{site.address}</td>
                      <td>{site.active ? 'Aktiv' : 'Inaktiv'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="form-card" onSubmit={createSite}>
                <h4>Neuen Standort anlegen</h4>
                <div className="form-grid">
                  <label>
                    Kategorie
                    <select value={siteForm.categoryId} onChange={(event) => setSiteForm((previous) => ({ ...previous, categoryId: event.target.value }))}>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Name
                    <input value={siteForm.name} onChange={(event) => setSiteForm((previous) => ({ ...previous, name: event.target.value }))} />
                  </label>

                  <label>
                    Adresse
                    <input value={siteForm.address} onChange={(event) => setSiteForm((previous) => ({ ...previous, address: event.target.value }))} />
                  </label>

                  <label>
                    Telefon
                    <input value={siteForm.phone} onChange={(event) => setSiteForm((previous) => ({ ...previous, phone: event.target.value }))} />
                  </label>

                  <label>
                    Hausmeister Telefon
                    <input value={siteForm.caretakerPhone} onChange={(event) => setSiteForm((previous) => ({ ...previous, caretakerPhone: event.target.value }))} />
                  </label>
                </div>
                <button type="submit" className="primary-button">Standort speichern</button>
              </form>
            </section>
          ) : null}

          {page === 'vorlagen' ? (
            <section className="panel">
              <h3>Audit-Vorlagen</h3>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Beschreibung</th>
                    <th>Felder</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>{template.description}</td>
                      <td>{template.fields.map((field) => field.name).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="form-card" onSubmit={createTemplate}>
                <h4>Neue Vorlage anlegen</h4>
                <div className="form-grid">
                  <label>
                    Name
                    <input value={templateForm.name} onChange={(event) => setTemplateForm((previous) => ({ ...previous, name: event.target.value }))} />
                  </label>

                  <label>
                    Beschreibung
                    <input value={templateForm.description} onChange={(event) => setTemplateForm((previous) => ({ ...previous, description: event.target.value }))} />
                  </label>

                  <label className="full-width">
                    Felder (Format: Name|Typ|Reihenfolge|relevant)
                    <textarea
                      rows={6}
                      value={templateForm.fields}
                      onChange={(event) => setTemplateForm((previous) => ({ ...previous, fields: event.target.value }))}
                    />
                  </label>
                </div>
                <button type="submit" className="primary-button">Vorlage speichern</button>
              </form>
            </section>
          ) : null}

          {page === 'raume' ? (
            <section className="panel">
              <h3>Räume & Objekte</h3>

              <table>
                <thead>
                  <tr>
                    <th>Raum</th>
                    <th>Standort</th>
                    <th>Kapazität</th>
                    <th>Fläche</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <td>{room.name}</td>
                      <td>{siteNameById[room.siteId] ?? 'Unbekannt'}</td>
                      <td>{room.capacity}</td>
                      <td>{room.area}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="form-card" onSubmit={createRoom}>
                <h4>Neuen Raum anlegen</h4>
                <div className="form-grid">
                  <label>
                    Standort
                    <select value={roomForm.siteId} onChange={(event) => setRoomForm((previous) => ({ ...previous, siteId: event.target.value }))}>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Raumname
                    <input value={roomForm.name} onChange={(event) => setRoomForm((previous) => ({ ...previous, name: event.target.value }))} />
                  </label>

                  <label>
                    Beschreibung
                    <input value={roomForm.description} onChange={(event) => setRoomForm((previous) => ({ ...previous, description: event.target.value }))} />
                  </label>

                  <label>
                    Kapazität
                    <input value={roomForm.capacity} onChange={(event) => setRoomForm((previous) => ({ ...previous, capacity: event.target.value }))} />
                  </label>

                  <label>
                    Fläche
                    <input value={roomForm.area} onChange={(event) => setRoomForm((previous) => ({ ...previous, area: event.target.value }))} />
                  </label>

                  <label>
                    Notiz
                    <input value={roomForm.notes} onChange={(event) => setRoomForm((previous) => ({ ...previous, notes: event.target.value }))} />
                  </label>
                </div>
                <button type="submit" className="primary-button">Raum speichern</button>
              </form>

              <table>
                <thead>
                  <tr>
                    <th>Objekt</th>
                    <th>Raum</th>
                    <th>Typ</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {objects.map((objectEntry) => (
                    <tr key={objectEntry.id}>
                      <td>{objectEntry.name}</td>
                      <td>{roomNameById[objectEntry.roomId] ?? 'Unbekannt'}</td>
                      <td>{objectEntry.objectType}</td>
                      <td>{objectEntry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="form-card" onSubmit={createObject}>
                <h4>Neues Objekt anlegen</h4>
                <div className="form-grid">
                  <label>
                    Raum
                    <select value={objectForm.roomId} onChange={(event) => setObjectForm((previous) => ({ ...previous, roomId: event.target.value }))}>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>{room.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Objektname
                    <input value={objectForm.name} onChange={(event) => setObjectForm((previous) => ({ ...previous, name: event.target.value }))} />
                  </label>

                  <label>
                    Typ
                    <input value={objectForm.objectType} onChange={(event) => setObjectForm((previous) => ({ ...previous, objectType: event.target.value }))} />
                  </label>

                  <label>
                    Status
                    <select value={objectForm.status} onChange={(event) => setObjectForm((previous) => ({ ...previous, status: event.target.value }))}>
                      <option value="Gut">Gut</option>
                      <option value="Aktion erforderlich">Aktion erforderlich</option>
                      <option value="Defekt">Defekt</option>
                    </select>
                  </label>

                  <label>
                    Notiz
                    <input value={objectForm.notes} onChange={(event) => setObjectForm((previous) => ({ ...previous, notes: event.target.value }))} />
                  </label>
                </div>
                <button type="submit" className="primary-button">Objekt speichern</button>
              </form>
            </section>
          ) : null}

          {page === 'admin' && canManageUsers(activeSession.user.role) ? (
            <section className="panel">
              <h3>Benutzerverwaltung</h3>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Rolle</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.displayName}</td>
                      <td>{user.role}</td>
                      <td>{user.isActive ? 'Aktiv' : 'Deaktiviert'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="form-card" onSubmit={createCategory}>
                <h4>Kategorie anlegen</h4>
                <div className="form-grid">
                  <label>
                    Name
                    <input value={categoryForm.name} onChange={(event) => setCategoryForm((previous) => ({ ...previous, name: event.target.value }))} />
                  </label>

                  <label>
                    Beschreibung
                    <input value={categoryForm.description} onChange={(event) => setCategoryForm((previous) => ({ ...previous, description: event.target.value }))} />
                  </label>
                </div>
                <button type="submit" className="primary-button">Kategorie speichern</button>
              </form>

              <div className="form-card">
                <h4>Backup-Management</h4>
                <div className="form-grid">
                  <button type="button" className="primary-button" onClick={createBackup}>Backup jetzt erstellen</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Datei</th>
                      <th>Typ</th>
                      <th>Größe</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((backup) => (
                      <tr key={backup.id}>
                        <td>{backup.fileName}</td>
                        <td>{backup.type}</td>
                        <td>{(backup.sizeBytes / 1024).toFixed(1)} KB</td>
                        <td>
                          <button type="button" onClick={() => restoreBackup(backup.id)}>Wiederherstellen</button>
                          <button type="button" onClick={() => deleteBackup(backup.id)}>Löschen</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="form-card">
                <h4>Datenexport</h4>
                <div className="form-grid">
                  <label>
                    Standort
                    <select value={exportSiteId} onChange={(event) => setExportSiteId(event.target.value)}>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className="primary-button" onClick={exportAuditZip}>ZIP exportieren</button>
              </div>
            </section>
          ) : null}

          {page === 'profil' ? (
            <section className="panel profile-panel">
              <h3>Profil</h3>
              <div className="profile-grid">
                <div>
                  <label>Benutzername</label>
                  <div className="value-box">{profile?.userName ?? activeSession.user.userName}</div>
                </div>
                <div>
                  <label>Rolle</label>
                  <div className="value-box">{profile?.role ?? activeSession.user.role}</div>
                </div>
                <div>
                  <label>Theme</label>
                  <div className="value-box">{theme === 'dark' ? 'Darkmode' : 'Whitemode'}</div>
                </div>
                <div>
                  <label>Passwort</label>
                  <div className="value-box">••••••••</div>
                </div>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}

async function apiRequest<T>(path: string, session: Session, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })

  if (response.status === 401) {
    throw new Error('Ihre Sitzung ist abgelaufen oder nicht mehr gültig.')
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Die Anfrage konnte nicht verarbeitet werden.')
  }

  return (await response.json()) as T
}

export default App




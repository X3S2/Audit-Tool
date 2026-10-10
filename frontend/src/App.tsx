import { useEffect, useState } from 'react'
import './theme.css'
import './App.css'
import { compressImage } from './imageCompression'
import { Header } from './components/Header'
import { Navigation, type PageKey } from './components/Navigation'
import { Tabs, type TabItem } from './components/Tabs'
import { Alert } from './components/Alert'

type ThemeMode = 'dark' | 'light'

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
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [error, setError] = useState('')
  const [showErrorBanner, setShowErrorBanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<User | null>(null)
  const [profileTab, setProfileTab] = useState<'info' | 'theme' | 'password'>('info')
  // Audit drill-down state
  const [auditView, setAuditView] = useState<'categories' | 'standorte' | 'standort'>('categories')
  const [auditSelectedCategory, setAuditSelectedCategory] = useState<Category | null>(null)
  const [auditSelectedSite, setAuditSelectedSite] = useState<Site | null>(null)
  const [auditTab, setAuditTab] = useState<'raume' | 'grunddaten' | 'dokumente'>('raume')
  // Datenablage drill-down state
  const [datenablageView, setDatenablageView] = useState<'categories' | 'standorte' | 'raume'>('categories')
  const [datenablageCategory, setDatenablageCategory] = useState<Category | null>(null)
  const [datenablageSite, setDatenablageSite] = useState<Site | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [objects, setObjects] = useState<AuditObject[]>([])
  const [audits, setAudits] = useState<AuditInstance[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [backupSchedule, setBackupSchedule] = useState<{ enabled: boolean; time: string; days: string[]; maxBackups: number }>({ enabled: false, time: '02:00', days: [], maxBackups: 10 })
  const [exportSiteId, setExportSiteId] = useState('1')
  const [imageGalleryObject, setImageGalleryObject] = useState<AuditObject | null>(null)
  const [galleryImages, setGalleryImages] = useState<Array<{ name: string; sizeBytes: number; createdAtUtc: string }>>([])
  const [imageUploadLoading, setImageUploadLoading] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
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
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })

  useEffect(() => {
    document.body.dataset.theme = theme
    document.documentElement.className = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (error) {
      setShowErrorBanner(true)
    }
  }, [error])

  useEffect(() => {
    // Admin tab switching handled by direct page navigation now
    void page
  }, [page])

  useEffect(() => {
    if (!session || !imageGalleryObject) {
      return
    }

    const loadGalleryImages = async () => {
      try {
        const images = await apiRequest<Array<{ name: string; sizeBytes: number; createdAtUtc: string }>>(`/api/objects/${imageGalleryObject.id}/images`, session)
        setGalleryImages(images)
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Bilder konnten nicht geladen werden.')
      }
    }

    void loadGalleryImages()
  }, [session, imageGalleryObject])

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
        const [categoryData, siteData, templateData, roomData, auditData] = await Promise.all([
          apiRequest<Category[]>('/api/categories', session),
          apiRequest<Site[]>('/api/standorte', session),
          apiRequest<Template[]>('/api/templates', session),
          apiRequest<Room[]>('/api/rooms', session),
          apiRequest<AuditInstance[]>('/api/audits', session)
        ])

        setCategories(categoryData)
        setSites(siteData)
        setTemplates(templateData)
        setRooms(roomData)
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
        const [userData, backupData, scheduleData] = await Promise.all([
          apiRequest<User[]>('/api/users', session),
          apiRequest<BackupRecord[]>('/api/admin/backups', session),
          apiRequest<{ enabled: boolean; time: string; days: string[]; maxBackups: number }>('/api/admin/backup-schedule', session)
        ])

        setUsers(userData)
        setBackups(backupData)
        setBackupSchedule(scheduleData)
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

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) {
      return
    }

    try {
      const newUser = await apiRequest<{ user: User }>('/api/users', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: loginForm.username,
          password: loginForm.password,
          displayName: categoryForm.name,
          role: categoryForm.description
        })
      })
      setUsers((previous) => [...previous, newUser.user])
      setLoginForm({ username: 'superadmin', password: 'Password123!' })
      setCategoryForm({ name: '', description: '' })
      setError('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Benutzer konnte nicht erstellt werden.')
    }
  }

  const resetUserPassword = async (userId: number) => {
    if (!session) {
      return
    }

    const newPassword = prompt('Neues Passwort eingeben:')
    if (!newPassword) {
      return
    }

    try {
      await apiRequest<{ message: string }>(`/api/users/${userId}/password`, session, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      })
      setError('Passwort erfolgreich zurückgesetzt.')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Passwort konnte nicht zurückgesetzt werden.')
    }
  }

  const toggleUserActive = async (userId: number) => {
    if (!session) {
      return
    }

    try {
      const result = await apiRequest<{ user: User }>(`/api/users/${userId}/toggle`, session, { method: 'PUT' })
      setUsers((previous) => previous.map((u) => (u.id === userId ? result.user : u)))
      setError('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Benutzer-Status konnte nicht geändert werden.')
    }
  }

  const deleteUser = async (userId: number) => {
    if (!session) {
      return
    }

    if (!confirm('Sind Sie sicher, dass Sie diesen Benutzer löschen möchten?')) {
      return
    }

    try {
      await apiRequest<{ message: string }>(`/api/users/${userId}`, session, { method: 'DELETE' })
      setUsers((previous) => previous.filter((u) => u.id !== userId))
      setError('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Benutzer konnte nicht gelöscht werden.')
    }
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

  const handleImageGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!session || !imageGalleryObject || !event.target.files || event.target.files.length === 0) {
      return
    }

    const file = event.target.files[0]
    setImageUploadLoading(true)

    try {
      setError('')
      
      const compressedBlob = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.8,
        maxSizeKB: 5000
      })

      const compressedFile = new File([compressedBlob], file.name, { type: 'image/jpeg' })

      const formData = new FormData()
      formData.append('file', compressedFile)

      const response = await fetch(`http://localhost:5050/api/objects/${imageGalleryObject.id}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: formData
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string }
        throw new Error(errorData.message || `Upload fehlgeschlagen: ${response.statusText}`)
      }

      const images = await apiRequest<Array<{ name: string; sizeBytes: number; createdAtUtc: string }>>(`/api/objects/${imageGalleryObject.id}/images`, session)
      setGalleryImages(images)
      setError('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Bild konnte nicht hochgeladen werden.')
    } finally {
      setImageUploadLoading(false)
      event.target.value = ''
    }
  }

  const downloadAuditPdf = async (auditId: number, auditTitle: string) => {
    if (!session) {
      return
    }

    try {
      const response = await fetch(`http://localhost:5050/api/audits/${auditId}/pdf`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.token}` }
      })

      if (!response.ok) {
        throw new Error(`PDF-Export fehlgeschlagen: ${response.statusText}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Audit_${auditTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'PDF konnte nicht exportiert werden.')
    }
  }

  // @ts-ignore - Used in onClick handler
  const deleteGalleryImage = async (imageName: string) => {
    if (!session || !imageGalleryObject) {
      return
    }

    if (!window.confirm(`M?chten Sie das Bild "${imageName}" wirklich l?schen?`)) {
      return
    }

    try {
      const response = await fetch(`http://localhost:5050/api/objects/${imageGalleryObject.id}/images/${imageName}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` }
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string }
        throw new Error(errorData.message || `L?schen fehlgeschlagen: ${response.statusText}`)
      }

      const images = await apiRequest<Array<{ name: string; sizeBytes: number; createdAtUtc: string }>>(`/api/objects/${imageGalleryObject.id}/images`, session)
      setGalleryImages(images)
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Bild konnte nicht gel?scht werden.')
    }
  }

  const saveBackupSchedule = async () => {
    if (!session || !canManageUsers(session.user.role)) {
      return
    }

    try {
      await apiRequest<{ message: string; schedule: object }>('/api/admin/backup-schedule', session, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupSchedule)
      })
      setError('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Backup-Zeitplan konnte nicht gespeichert werden.')
    }
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) {
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein.')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }

    try {
      const result = await apiRequest<{ success: boolean }>(`/api/users/${session.user.id}/change-password`, session, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      })

      if (result.success) {
        setError('')
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        alert('Passwort erfolgreich geändert.')
      }
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Passwortänderung fehlgeschlagen.')
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

  const isAdmin = session ? canManageUsers(session.user.role) : false

  const navItems: import('./components/Navigation').NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊', visible: true },
    { key: 'audits', label: 'Audits', icon: '📋', visible: true },
    { key: 'datenablage', label: 'Datenablage', icon: '💾', visible: true },
    {
      key: 'einstellungen-kategorien',
      label: 'Einstellungen',
      icon: '⚙️',
      visible: isAdmin,
      subpages: [
        { key: 'einstellungen-kategorien', label: 'Kategorien' },
        { key: 'einstellungen-standorte', label: 'Standorte' },
        { key: 'einstellungen-vorlagen', label: 'Audit-Vorlagen' },
        { key: 'einstellungen-checklisten', label: 'Checklisten' },
        { key: 'einstellungen-pdfdesigner', label: 'PDF-Designer' },
      ]
    },
    {
      key: 'admin-benutzer',
      label: 'Admin Page',
      icon: '👨‍💼',
      visible: isAdmin,
      subpages: [
        { key: 'admin-benutzer', label: 'Benutzer' },
        { key: 'admin-backup', label: 'Backup' },
        { key: 'admin-export', label: 'Datenexport' },
        { key: 'admin-logs', label: 'Logs' },
      ]
    },
    { key: 'profil', label: 'Profil', icon: '👤', visible: true },
  ]

  const handleProfileAction = (action: 'profile' | 'password' | 'logout') => {
    if (action === 'profile') {
      setPage('profil')
      setProfileTab('info')
    } else if (action === 'password') {
      setPage('profil')
      setProfileTab('password')
    } else if (action === 'logout') {
      logout()
    }
  }

  const pageTitleMap: Record<string, string> = {
    dashboard: 'Dashboard', audits: 'Audits', datenablage: 'Datenablage',
    'einstellungen-kategorien': 'Kategorien', 'einstellungen-standorte': 'Standorte',
    'einstellungen-vorlagen': 'Audit-Vorlagen', 'einstellungen-checklisten': 'Checklisten',
    'einstellungen-pdfdesigner': 'PDF-Designer',
    'admin-benutzer': 'Benutzerverwaltung', 'admin-backup': 'Datenbankbackup',
    'admin-export': 'Datenexport', 'admin-logs': 'System-Logs', profil: 'Mein Profil',
  }

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
            />
          </label>

          <label>
            Passwort
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((previous) => ({ ...previous, password: event.target.value }))}
            />
          </label>

          {showErrorBanner && error ? <div className="error-box">{error}</div> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Anmeldung...' : 'Einloggen'}
          </button>

          <small className="security-note">Sitzung gültig für 8 Stunden. Danach erfolgt eine automatische Abmeldung.</small>
        </form>
      </div>
    )
  }

  const activeSession = session

  const profileTabsData: TabItem[] = [
    { id: 'info', label: 'Benutzer Info', icon: '👤' },
    { id: 'theme', label: 'Design-Modus', icon: '🎨' },
    { id: 'password', label: 'Passwort', icon: '🔑' }
  ]

  return (
    <div className="app-wrapper">
      <Header
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        user={profile ?? activeSession.user}
        onProfileClick={handleProfileAction}
        pageTitle={pageTitleMap[page] ?? 'Audit-Tool'}
        onMenuToggle={() => setSidebarVisible(v => !v)}
      />

      <div className={`app-container${sidebarVisible ? '' : ' sidebar-hidden'}`}>
        {sidebarVisible && (
          <Navigation
            items={navItems}
            currentPage={page}
            onPageChange={(p) => {
              setPage(p)
              if (p === 'audits') setAuditView('categories')
              if (p === 'datenablage') setDatenablageView('categories')
            }}
          />
        )}

        <main className="main-panel">
          {showErrorBanner && error ? (
            <Alert
              type="error"
              message={error}
              onClose={() => { setShowErrorBanner(false); setError('') }}
            />
          ) : null}


          {page === 'dashboard' ? (
            <section className="panel">
              <h3>Dashboard</h3>
              <div className="stats-grid">
                <div className="stat-card"><span>Standorte</span><strong>{sites.length}</strong></div>
                <div className="stat-card"><span>Kategorien</span><strong>{categories.length}</strong></div>
                <div className="stat-card"><span>Vorlagen</span><strong>{templates.length}</strong></div>
                <div className="stat-card"><span>Audits</span><strong>{audits.length}</strong></div>
              </div>
            </section>
          ) : null}

          {page === 'audits' ? (
            <section className="panel">
              {auditView === 'categories' && (
                <>
                  <div className="page-header">
                    <h3>Audits</h3>
                    <p className="page-subtitle">Standort-Kategorie wählen</p>
                  </div>
                  <div className="card-grid">
                    {[...categories].sort((a,b)=>a.name.localeCompare(b.name)).map(cat=>(
                      <button key={cat.id} type="button" className="card-item" onClick={()=>{setAuditSelectedCategory(cat);setAuditView('standorte')}}>
                        <span className="card-icon">📁</span>
                        <span className="card-name">{cat.name}</span>
                        <span className="card-count">{sites.filter(s=>s.categoryId===cat.id).length} Standorte</span>
                      </button>
                    ))}
                    {categories.length===0&&<p className="empty-hint">Keine Kategorien. Bitte unter Einstellungen anlegen.</p>}
                  </div>
                </>
              )}
              {auditView === 'standorte' && auditSelectedCategory && (
                <>
                  <div className="page-header">
                    <button type="button" className="back-btn" onClick={()=>setAuditView('categories')}>← Zurück</button>
                    <div><h3>{auditSelectedCategory.name}</h3><p className="page-subtitle">Standort wählen</p></div>
                  </div>
                  <div className="card-grid">
                    {[...sites].filter(s=>s.categoryId===auditSelectedCategory.id).sort((a,b)=>a.name.localeCompare(b.name)).map(site=>(
                      <button key={site.id} type="button" className="card-item" onClick={()=>{setAuditSelectedSite(site);setAuditView('standort');setAuditTab('raume')}}>
                        <span className="card-icon">🏢</span>
                        <span className="card-name">{site.name}</span>
                        <span className="card-count">{site.address}</span>
                      </button>
                    ))}
                    {sites.filter(s=>s.categoryId===auditSelectedCategory.id).length===0&&<p className="empty-hint">Keine Standorte in dieser Kategorie.</p>}
                  </div>
                </>
              )}
              {auditView === 'standort' && auditSelectedSite && (
                <>
                  <div className="page-header">
                    <button type="button" className="back-btn" onClick={()=>setAuditView('standorte')}>← Zurück</button>
                    <div><h3>{auditSelectedSite.name}</h3><p className="page-subtitle">{auditSelectedSite.address}</p></div>
                  </div>
                  <div className="tab-bar">
                    {(['raume','grunddaten','dokumente'] as const).map(tab=>(
                      <button key={tab} type="button" className={`tab-btn${auditTab===tab?' active':''}`} onClick={()=>setAuditTab(tab)}>
                        {tab==='raume'?'🏠 Räume/Objekte':tab==='grunddaten'?'📋 Grunddaten':'📄 Dokumente'}
                      </button>
                    ))}
                  </div>
                  {auditTab==='raume'&&(
                    <div className="tab-content">
                      <table><thead><tr><th>Raum</th><th>Kapazität</th><th>Fläche</th><th>Notiz</th></tr></thead>
                        <tbody>{rooms.filter(r=>r.siteId===auditSelectedSite.id).map(r=>(
                          <tr key={r.id}><td>{r.name}</td><td>{r.capacity}</td><td>{r.area}</td><td>{r.notes}</td></tr>
                        ))}</tbody>
                      </table>
                      <form className="form-card" onSubmit={createRoom}>
                        <h4>Neuen Raum anlegen</h4>
                        <div className="form-grid">
                          <label>Raumname<input value={roomForm.name} onChange={e=>setRoomForm(p=>({...p,name:e.target.value,siteId:String(auditSelectedSite.id)}))} required /></label>
                          <label>Beschreibung<input value={roomForm.description} onChange={e=>setRoomForm(p=>({...p,description:e.target.value}))} /></label>
                          <label>Kapazität<input value={roomForm.capacity} onChange={e=>setRoomForm(p=>({...p,capacity:e.target.value}))} /></label>
                          <label>Fläche<input value={roomForm.area} onChange={e=>setRoomForm(p=>({...p,area:e.target.value}))} /></label>
                        </div>
                        <button type="submit" className="primary-button">Raum speichern</button>
                      </form>
                    </div>
                  )}
                  {auditTab==='grunddaten'&&(
                    <div className="tab-content">
                      <div className="info-grid">
                        <div className="info-row"><span>Name</span><strong>{auditSelectedSite.name}</strong></div>
                        <div className="info-row"><span>Adresse</span><strong>{auditSelectedSite.address}</strong></div>
                        <div className="info-row"><span>Telefon</span><strong>{auditSelectedSite.phone||'-'}</strong></div>
                        <div className="info-row"><span>Hausmeister</span><strong>{auditSelectedSite.caretakerPhone||'-'}</strong></div>
                        <div className="info-row"><span>Räume gesamt</span><strong>{rooms.filter(r=>r.siteId===auditSelectedSite.id).length}</strong></div>
                      </div>
                    </div>
                  )}
                  {auditTab==='dokumente'&&(
                    <div className="tab-content">
                      <div className="form-card">
                        <h4>Audit-Dokumente</h4>
                        <table style={{marginTop:'12px'}}><thead><tr><th>Audit</th><th>Vorlage</th><th>Status</th><th>Aktion</th></tr></thead>
                          <tbody>{audits.filter(a=>a.siteId===auditSelectedSite.id).map(audit=>(
                            <tr key={audit.id}><td>{audit.title}</td><td>{audit.templateName}</td><td>{audit.status}</td>
                              <td><button type="button" className="ghost-button" onClick={()=>downloadAuditPdf(audit.id,audit.title)}>PDF</button></td>
                            </tr>
                          ))}</tbody>
                        </table>
                        {audits.filter(a=>a.siteId===auditSelectedSite.id).length===0&&<p className="empty-hint">Noch kein Audit für diesen Standort.</p>}
                        <form className="form-card" style={{marginTop:'16px'}} onSubmit={createAudit}>
                          <h4>Neues Audit anlegen</h4>
                          <div className="form-grid">
                            <label>Vorlage<select value={auditForm.templateId} onChange={e=>setAuditForm(p=>({...p,templateId:e.target.value,siteId:String(auditSelectedSite.id)}))}>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                            <label>Titel<input value={auditForm.title} onChange={e=>setAuditForm(p=>({...p,title:e.target.value}))} required /></label>
                          </div>
                          <button type="submit" className="primary-button">Audit anlegen</button>
                        </form>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : null}

          {page === 'datenablage' ? (
            <section className="panel">
              {datenablageView==='categories'&&(
                <>
                  <div className="page-header"><h3>Datenablage</h3><p className="page-subtitle">Kategorie wählen</p></div>
                  <div className="card-grid">
                    {[...categories].sort((a,b)=>a.name.localeCompare(b.name)).map(cat=>(
                      <button key={cat.id} type="button" className="card-item" onClick={()=>{setDatenablageCategory(cat);setDatenablageView('standorte')}}>
                        <span className="card-icon">📁</span><span className="card-name">{cat.name}</span>
                        <span className="card-count">{sites.filter(s=>s.categoryId===cat.id).length} Standorte</span>
                      </button>
                    ))}
                    {categories.length===0&&<p className="empty-hint">Keine Kategorien vorhanden.</p>}
                  </div>
                </>
              )}
              {datenablageView==='standorte'&&datenablageCategory&&(
                <>
                  <div className="page-header">
                    <button type="button" className="back-btn" onClick={()=>setDatenablageView('categories')}>← Zurück</button>
                    <div><h3>{datenablageCategory.name}</h3><p className="page-subtitle">Standort wählen</p></div>
                  </div>
                  <div className="card-grid">
                    {[...sites].filter(s=>s.categoryId===datenablageCategory.id).sort((a,b)=>a.name.localeCompare(b.name)).map(site=>(
                      <button key={site.id} type="button" className="card-item" onClick={()=>{setDatenablageSite(site);setDatenablageView('raume')}}>
                        <span className="card-icon">🏢</span><span className="card-name">{site.name}</span>
                        <span className="card-count">{rooms.filter(r=>r.siteId===site.id).length} Räume</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {datenablageView==='raume'&&datenablageSite&&(
                <>
                  <div className="page-header">
                    <button type="button" className="back-btn" onClick={()=>setDatenablageView('standorte')}>← Zurück</button>
                    <div><h3>{datenablageSite.name}</h3><p className="page-subtitle">Räume und abgelegte Audits</p></div>
                  </div>
                  <div className="card-grid">
                    {[...rooms].filter(r=>r.siteId===datenablageSite.id).sort((a,b)=>a.name.localeCompare(b.name)).map(room=>(
                      <div key={room.id} className="card-item static">
                        <span className="card-icon">🚪</span><span className="card-name">{room.name}</span>
                        <span className="card-count">{audits.filter(a=>a.siteId===datenablageSite!.id).length} Audits</span>
                      </div>
                    ))}
                    {rooms.filter(r=>r.siteId===datenablageSite.id).length===0&&<p className="empty-hint">Noch keine Räume für diesen Standort.</p>}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {page==='einstellungen-kategorien'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Standort-Kategorien</h3></div>
              <table><thead><tr><th>Name</th><th>Beschreibung</th></tr></thead>
                <tbody>{categories.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.description}</td></tr>)}</tbody>
              </table>
              <form className="form-card" onSubmit={createCategory}>
                <h4>Neue Kategorie</h4>
                <div className="form-grid">
                  <label>Name<input value={categoryForm.name} onChange={e=>setCategoryForm(p=>({...p,name:e.target.value}))} required /></label>
                  <label>Beschreibung<input value={categoryForm.description} onChange={e=>setCategoryForm(p=>({...p,description:e.target.value}))} /></label>
                </div>
                <button type="submit" className="primary-button">Kategorie speichern</button>
              </form>
            </section>
          ):null}

          {page==='einstellungen-standorte'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Standorte</h3></div>
              <table><thead><tr><th>Name</th><th>Kategorie</th><th>Adresse</th><th>Status</th></tr></thead>
                <tbody>{[...sites].sort((a,b)=>a.name.localeCompare(b.name)).map(s=>(
                  <tr key={s.id}><td>{s.name}</td><td>{categories.find(c=>c.id===s.categoryId)?.name??'-'}</td><td>{s.address}</td><td>{s.active?'Aktiv':'Inaktiv'}</td></tr>
                ))}</tbody>
              </table>
              <form className="form-card" onSubmit={createSite}>
                <h4>Neuen Standort anlegen</h4>
                <div className="form-grid">
                  <label>Kategorie<select value={siteForm.categoryId} onChange={e=>setSiteForm(p=>({...p,categoryId:e.target.value}))}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <label>Name<input value={siteForm.name} onChange={e=>setSiteForm(p=>({...p,name:e.target.value}))} required /></label>
                  <label>Adresse<input value={siteForm.address} onChange={e=>setSiteForm(p=>({...p,address:e.target.value}))} /></label>
                  <label>Telefon<input value={siteForm.phone} onChange={e=>setSiteForm(p=>({...p,phone:e.target.value}))} /></label>
                  <label>Hausmeister Telefon<input value={siteForm.caretakerPhone} onChange={e=>setSiteForm(p=>({...p,caretakerPhone:e.target.value}))} /></label>
                </div>
                <button type="submit" className="primary-button">Standort speichern</button>
              </form>
            </section>
          ):null}

          {page==='einstellungen-vorlagen'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Audit-Vorlagen</h3></div>
              <table><thead><tr><th>Name</th><th>Beschreibung</th><th>Felder</th></tr></thead>
                <tbody>{templates.map(t=><tr key={t.id}><td>{t.name}</td><td>{t.description}</td><td>{t.fields.map(f=>f.name).join(', ')}</td></tr>)}</tbody>
              </table>
              <form className="form-card" onSubmit={createTemplate}>
                <h4>Neue Vorlage</h4>
                <div className="form-grid">
                  <label>Name<input value={templateForm.name} onChange={e=>setTemplateForm(p=>({...p,name:e.target.value}))} required /></label>
                  <label>Beschreibung<input value={templateForm.description} onChange={e=>setTemplateForm(p=>({...p,description:e.target.value}))} /></label>
                  <label className="full-width">Felder (Name|typ|reihenfolge|pflichtfeld)<textarea rows={5} value={templateForm.fields} onChange={e=>setTemplateForm(p=>({...p,fields:e.target.value}))} /></label>
                </div>
                <button type="submit" className="primary-button">Vorlage speichern</button>
              </form>
            </section>
          ):null}

          {page==='einstellungen-checklisten'&&isAdmin?(<section className="panel"><div className="page-header"><h3>Checklisten</h3></div><p className="empty-hint">Wird in einer späteren Version implementiert.</p></section>):null}
          {page==='einstellungen-pdfdesigner'&&isAdmin?(<section className="panel"><div className="page-header"><h3>PDF-Designer</h3></div><p className="empty-hint">Wird in einer späteren Version implementiert.</p></section>):null}

          {page==='admin-benutzer'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Benutzerverwaltung</h3></div>
              <table><thead><tr><th>Name</th><th>Rolle</th><th>Status</th><th>Aktionen</th></tr></thead>
                <tbody>{users.map(user=>(
                  <tr key={user.id}>
                    <td>{user.displayName} <small style={{color:'var(--muted)'}}>({user.userName})</small></td>
                    <td><span className={`role-badge role-${user.role.toLowerCase()}`}>{user.role}</span></td>
                    <td><span className={user.isActive?'status-active':'status-inactive'}>{user.isActive?'Aktiv':'Inaktiv'}</span></td>
                    <td>{user.userName!==activeSession.user.userName&&user.role!=='Superadmin'&&(
                      <div style={{display:'flex',gap:'8px'}}>
                        <button type="button" className="secondary-button" onClick={()=>toggleUserActive(user.id)}>{user.isActive?'Deaktivieren':'Aktivieren'}</button>
                        <button type="button" className="danger-button" onClick={()=>deleteUser(user.id)}>Löschen</button>
                      </div>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          ):null}

          {page==='admin-backup'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Datenbankbackup</h3></div>
              <div className="form-card"><button type="button" className="primary-button" onClick={createBackup}>💾 Backup jetzt erstellen</button></div>
              <table style={{marginTop:'16px'}}><thead><tr><th>Dateiname</th><th>Erstellt</th><th>Größe</th><th>Aktionen</th></tr></thead>
                <tbody>{backups.map(b=>(
                  <tr key={b.id}>
                    <td>{b.fileName}</td>
                    <td>{new Date(b.createdAtUtc).toLocaleString('de-DE')}</td>
                    <td>{(b.sizeBytes/1024/1024).toFixed(2)} MB</td>
                    <td><div style={{display:'flex',gap:'8px'}}>
                      <button type="button" className="secondary-button" onClick={()=>restoreBackup(b.id)}>Wiederherstellen</button>
                      <button type="button" className="danger-button" onClick={()=>deleteBackup(b.id)}>Löschen</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="form-card" style={{marginTop:'20px'}}>
                <h4>Automatische Backups</h4>
                <div className="form-grid">
                  <label>Uhrzeit<input type="time" value={backupSchedule.time} onChange={e=>setBackupSchedule(p=>({...p,time:e.target.value}))} /></label>
                  <label>Max. Backups<input type="number" min="1" max="100" value={backupSchedule.maxBackups} onChange={e=>setBackupSchedule(p=>({...p,maxBackups:parseInt(e.target.value)||10}))} /></label>
                </div>
                <div style={{marginTop:'12px'}}>
                  <p style={{fontWeight:500,marginBottom:'8px'}}>Wochentage:</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
                    {['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'].map(day=>(
                      <label key={day} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
                        <input type="checkbox" checked={backupSchedule.days.includes(day)} onChange={e=>{if(e.target.checked)setBackupSchedule(p=>({...p,days:[...p.days,day]}));else setBackupSchedule(p=>({...p,days:p.days.filter(d=>d!==day)}))}} />{day}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="button" className="primary-button" style={{marginTop:'16px'}} onClick={saveBackupSchedule}>Zeitplan speichern</button>
              </div>
            </section>
          ):null}

          {page==='admin-export'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Datenexport</h3></div>
              <div className="form-card">
                <div className="form-grid">
                  <label>Standort<select value={exportSiteId} onChange={e=>setExportSiteId(e.target.value)}>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                </div>
                <button type="button" className="primary-button" onClick={exportAuditZip}>📦 ZIP exportieren</button>
              </div>
            </section>
          ):null}

          {page==='admin-logs'&&isAdmin?(<section className="panel"><div className="page-header"><h3>System-Logs</h3></div><p className="empty-hint">Logs werden in einer späteren Version angezeigt.</p></section>):null}


          {page === 'profil' ? (
            <section className="panel profile-panel">
              <h3>Profil</h3>
              <Tabs 
                tabs={profileTabsData} 
                activeTab={profileTab} 
                onTabChange={(tabId) => setProfileTab(tabId as 'info' | 'theme' | 'password')} 
              />
              <div style={{ marginTop: '24px' }}></div>

              {profileTab === 'info' && (
                <div className="profile-grid">
                  <div>
                    <label>Benutzername</label>
                    <div className="value-box">{profile?.userName ?? activeSession.user.userName}</div>
                  </div>
                  <div>
                    <label>Displayname</label>
                    <div className="value-box">{profile?.displayName ?? activeSession.user.displayName}</div>
                  </div>
                  <div>
                    <label>Rolle</label>
                    <div className="value-box">{profile?.role ?? activeSession.user.role}</div>
                  </div>
                </div>
              )}

              {profileTab === 'theme' && (
                <div className="profile-grid">
                  <div>
                    <label>Design-Modus</label>
                    <button 
                      type="button" 
                      className="theme-toggle-button"
                      onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                      style={{ padding: '8px 16px', marginTop: '4px' }}
                    >
                      {theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}
                    </button>
                  </div>
                </div>
              )}

              {profileTab === 'password' && (
                <form className="form-card" onSubmit={changePassword}>
                  <h4>Passwort ändern</h4>
                  <div className="form-grid">
                    <label className="full-width">
                      Aktuelles Passwort
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(event) => setPasswordForm((previous) => ({ ...previous, currentPassword: event.target.value }))}
                        required
                      />
                    </label>

                    <label className="full-width">
                      Neues Passwort
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(event) => setPasswordForm((previous) => ({ ...previous, newPassword: event.target.value }))}
                        required
                      />
                    </label>

                    <label className="full-width">
                      Neues Passwort bestätigen
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(event) => setPasswordForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <button type="submit" className="primary-button">Passwort aktualisieren</button>
                </form>
              )}
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




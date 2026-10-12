import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import './theme.css'
import './App.css'
import { compressImage } from './imageCompression'
import { Header } from './components/Header'
import { Navigation, type PageKey } from './components/Navigation'
import { Tabs, type TabItem } from './components/Tabs'
import { Alert } from './components/Alert'
import { PdfDesignerCanvas, type DesignElement } from './components/PdfDesignerCanvas'

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
  groundDataJson?: string
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
  fieldsJson: string
  auditId: number
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
  groundDataJson?: string
}

type DocumentFolder = {
  id: number
  siteId: number
  parentFolderId: number
  name: string
  createdAtUtc: string
}

type AuditDocument = {
  id: number
  auditId: number
  siteId: number
  title: string
  pdfDesignId: number | null
  pdfDesignName: string | null
  fileName: string
  sizeBytes: number
  createdAtUtc: string
  isArchived: boolean
  isUploaded: boolean
  folderId: number
}

type BackupRecord = {
  id: string
  fileName: string
  createdAtUtc: string
  sizeBytes: number
  type: string
}

type PdfDesign = {
  id: number
  name: string
  description: string
  configJson: string
  createdAtUtc: string
}

type PageDesign = {
  id: string
  name: string
  orientation: 'portrait' | 'landscape'
  headerText: string
  footerText: string
  useGlobalHeader: boolean
  headerAlign?: 'left' | 'center' | 'right'
  footerAlign?: 'left' | 'center' | 'right'
  elements: import('./components/PdfDesignerCanvas').DesignElement[]
}

type PdfDesignConfig = {
  /** @deprecated use templateIds - kept so older saved designs still parse correctly */
  templateId?: number
  templateIds?: number[]
  globalHeaderText: string
  globalFooterText: string
  globalHeaderAlign?: 'left' | 'center' | 'right'
  globalFooterAlign?: 'left' | 'center' | 'right'
  showPrintArea: boolean
  pages: PageDesign[]
}

type ChecklistTemplate = {
  id: number
  name: string
  templateId: number
  columnsJson: string
  createdAtUtc: string
}

type ChecklistColumn = {
  id: string
  label: string
  source: 'field' | 'custom' | 'room'
  fieldName?: string
  inputType: 'text' | 'number' | 'checkbox'
  width?: number
  order: number
}

type ChecklistValue = {
  id: number
  checklistTemplateId: number
  roomId: number
  dataJson: string
  updatedAtUtc: string
}

const SESSION_KEY = 'audit-tool-session'
const THEME_KEY = 'audit-tool-theme'
// Relative, same-origin API-Basis: Das Frontend ruft die API ausschließlich über "/api/..."
// auf, statt einen festen Host/Port (z.B. ":5050") anzunehmen. Dadurch funktioniert die App auch
// hinter einem Reverse-Proxy/CDN/Router (z.B. CloudRouter, Synology NAS), der nur einen einzigen
// externen Port weiterleitet - nginx (Produktion) bzw. der Vite-Dev-Server (lokal) leiten "/api/"
// transparent intern an das Backend weiter (siehe audittool/nginx.conf und vite.config.ts).
const API_BASE = ''

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
type TemplateFieldScope = 'room' | 'site'
type EditableTemplateField = {
  name: string
  type: string
  order: number
  required: boolean
  dropdownOptions: string
  defaultValue: string
  scope: TemplateFieldScope
}

const parseTemplateFieldType = (typeValue: string) => {
  const parts = typeValue.split('|').map((part) => part.trim()).filter(Boolean)
  const baseType = parts[0] ?? 'text'
  const optionsText = parts.find((part) => part.startsWith('options:'))?.replace('options:', '').trim() ?? ''
  const defaultValue = parts.find((part) => part.startsWith('default:'))?.replace('default:', '').trim() ?? ''
  const scope: TemplateFieldScope = parts.some((part) => part === 'scope:site') ? 'site' : 'room'
  const options = optionsText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return { baseType, optionsText, options, defaultValue, scope }
}

const encodeTemplateFieldType = (field: EditableTemplateField) => {
  let encoded = field.type
  if (field.type === 'dropdown' && field.dropdownOptions.trim()) {
    encoded += `|options:${field.dropdownOptions.trim()}`
    if (field.defaultValue.trim()) {
      encoded += `|default:${field.defaultValue.trim()}`
    }
  }
  if (field.scope === 'site') {
    encoded += '|scope:site'
  }
  return encoded
}

const DEFAULT_TEMPLATE_FIELDS: EditableTemplateField[] = [
  { name: '', type: 'text', order: 1, required: true, dropdownOptions: '', defaultValue: '', scope: 'room' }
]

// fix005: Echtzeit-Formularvalidierung für Pflichtfelder — Klasse für farbliche Markierung
// (rot = Pflichtfeld leer, grün = Pflichtfeld ausgefüllt). Nicht-Pflichtfelder bleiben neutral.
const fieldStatusClass = (required: boolean, filled: boolean): string => {
  if (!required) return ''
  return filled ? 'field-required-ok' : 'field-required-missing'
}

const parseStringMap = (raw: string | undefined) => {
  if (!raw) {
    return {} as Record<string, string>
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')])
    )
  } catch {
    return {} as Record<string, string>
  }
}

const getDesignTemplateIds = (design: PdfDesign): number[] => {
  try {
    const config = JSON.parse(design.configJson) as PdfDesignConfig
    if (config.templateIds?.length) return config.templateIds
    if (config.templateId) return [config.templateId]
    return []
  } catch {
    return []
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme())
  const [session, setSession] = useState<Session | null>(() => readSession())
  const [page, setPage] = useState<PageKey>('dashboard')
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    // Default hidden on mobile
    return typeof window !== 'undefined' ? window.innerWidth > 768 : true
  })
  const [error, setError] = useState('')
  const [showErrorBanner, setShowErrorBanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<User | null>(null)
  const [profileTab, setProfileTab] = useState<'info' | 'theme' | 'password'>('info')
  // View mode: list or card, per user in localStorage
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() => {
    const stored = localStorage.getItem('audit-view-mode')
    return stored === 'card' ? 'card' : 'list'
  })
  // Audit drill-down state
  const [auditView, setAuditView] = useState<'categories' | 'standorte' | 'standort'>('categories')
  const [auditSelectedCategory, setAuditSelectedCategory] = useState<Category | null>(null)
  const [auditSelectedSite, setAuditSelectedSite] = useState<Site | null>(null)
  const [auditTab, setAuditTab] = useState<'raume' | 'grunddaten' | 'checklisten' | 'dokumente'>('raume')
  const [auditSelectedTemplate, setAuditSelectedTemplate] = useState<Template | null>(null)
  // Datenablage drill-down state
  const [datenablageView, setDatenablageView] = useState<'categories' | 'standorte' | 'standort'>('categories')
  const [datenablageCategory, setDatenablageCategory] = useState<Category | null>(null)
  const [datenablageSite, setDatenablageSite] = useState<Site | null>(null)
  const [datenablageTab, setDatenablageTab] = useState<'raume' | 'grunddaten' | 'checklisten' | 'dokumente'>('raume')
  const [datenablageSelectedRoomName, setDatenablageSelectedRoomName] = useState<string | null>(null)
  const [datenablageChecklistTemplate, setDatenablageChecklistTemplate] = useState<Template | null>(null)
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<Set<number>>(new Set())
  const [pendingRoomEditName, setPendingRoomEditName] = useState<string | null>(null)
  // Dokumente / Dateiablage state (Audits-Seite + Datenablage)
  const [documents, setDocuments] = useState<AuditDocument[]>([])
  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [docGenTitle, setDocGenTitle] = useState('')
  const [docGenPdfDesignId, setDocGenPdfDesignId] = useState('')
  const [docGenAuditId, setDocGenAuditId] = useState<number | null>(null)
  const [docGenInProgress, setDocGenInProgress] = useState(false)
  const [docCurrentFolderId, setDocCurrentFolderId] = useState(0)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingDocId, setRenamingDocId] = useState<number | null>(null)
  const [renamingDocTitle, setRenamingDocTitle] = useState('')
  const [showDocArchive, setShowDocArchive] = useState(false)
  // User management state
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newUserForm, setNewUserForm] = useState({ userName: '', displayName: '', password: '', role: 'Benutzer' })
  const [showNewUserForm, setShowNewUserForm] = useState(false)
  // Einstellungen Edit state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  // Logs state
  const [logs, setLogs] = useState<Array<{timestamp: string; action: string; details?: string; userId: number; userName: string}>>([])
  const [logFilter, setLogFilter] = useState('')
  // Vorlagen field builder state
  const [templateFields, setTemplateFields] = useState<EditableTemplateField[]>(DEFAULT_TEMPLATE_FIELDS)
  // Export mode
  const [exportMode, setExportMode] = useState<'site' | 'all'>('site')
  // PDF Designer state
  const [pdfDesigns, setPdfDesigns] = useState<PdfDesign[]>([])
  const [editingPdfDesign, setEditingPdfDesign] = useState<PdfDesign | null>(null)
  const [pdfSaveConfirm, setPdfSaveConfirm] = useState(false)
  const [pdfDesignConfig, setPdfDesignConfig] = useState<PdfDesignConfig>({
    globalHeaderText: '',
    globalFooterText: '',
    globalHeaderAlign: 'center',
    globalFooterAlign: 'center',
    showPrintArea: true,
    pages: [
      { id: 'p1', name: 'Deckblatt', orientation: 'portrait', headerText: '', footerText: '', useGlobalHeader: false, headerAlign: 'center', footerAlign: 'center', elements: [] }
    ]
  })
  const [newPdfDesignName, setNewPdfDesignName] = useState('')
  const [newPdfDesignDesc, setNewPdfDesignDesc] = useState('')
  const [showPdfTemplatePicker, setShowPdfTemplatePicker] = useState(false)
  // Checkliste state
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([])
  const [editingChecklistTemplate, setEditingChecklistTemplate] = useState<ChecklistTemplate | null>(null)
  const [checklistColumns, setChecklistColumns] = useState<ChecklistColumn[]>([])
  const [newChecklistName, setNewChecklistName] = useState('')
  const [newChecklistTemplateId, setNewChecklistTemplateId] = useState('1')
  const [activeChecklistAudit, setActiveChecklistAudit] = useState<AuditInstance | null>(null)
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
  const [roomFieldValues, setRoomFieldValues] = useState<Record<string, string>>({})
  const [siteGroundDataValues, setSiteGroundDataValues] = useState<Record<string, string>>({})
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null)
  // Image gallery modal
  const [galleryModalImages, setGalleryModalImages] = useState<string[]>([])
  const [galleryModalIndex, setGalleryModalIndex] = useState(0)
  const [galleryModalZoom, setGalleryModalZoom] = useState(1)
  const [galleryModalPan, setGalleryModalPan] = useState({ x: 0, y: 0 })
  const galleryDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null)
  const galleryPinchRef = useRef<{ startDist: number; startZoom: number } | null>(null)
  const [objectForm, setObjectForm] = useState({ roomId: '1', name: '', objectType: '', status: 'Gut', notes: '' })
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: ''
  })
  const [auditForm, setAuditForm] = useState({ siteId: '1', templateId: '1', title: '' })
  const [newAuditPdfDesignId, setNewAuditPdfDesignId] = useState('')
  const [newAuditDocTitle, setNewAuditDocTitle] = useState('')
  const [checklistForm, setChecklistForm] = useState({ auditId: '', question: '', answer: '', status: 'offen' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  // Generisches Bestätigungs-Modal (ersetzt window.confirm für Raum-/Dokument-/Audit-Löschung)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const askConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({ message, onConfirm })
  // Generisches Detail-Modal für abgekürzte lange Texte in Tabellenzellen (Räume, Checklisten)
  const [detailModal, setDetailModal] = useState<{ title: string; text: string } | null>(null)
  const TRUNCATE_LENGTH = 60
  const MOBILE_TRUNCATE_LENGTH = 20
  // Rendert zwei parallele Varianten (Desktop/Mobile), die per CSS (@media max-width: 768px)
  // ein-/ausgeblendet werden: Auf Mobilgeräten wird bei langen Werten nur noch der "mehr
  // Details…"-Link gezeigt (kein Textauszug), da der volle Text ohnehin im Modal lesbar ist.
  const renderTruncatable = (label: string, value: string) => {
    if (!value) return <em style={{ color: 'var(--muted)' }}>—</em>
    const openModal = () => setDetailModal({ title: label, text: value })
    const desktop = value.length <= TRUNCATE_LENGTH
      ? value
      : (
        <>
          {value.slice(0, TRUNCATE_LENGTH)}…{' '}
          <button type="button" className="link-button" onClick={openModal}>mehr Details…</button>
        </>
      )
    const mobile = value.length <= MOBILE_TRUNCATE_LENGTH
      ? value
      : <button type="button" className="link-button" onClick={openModal}>mehr Details…</button>
    return (
      <>
        <span className="truncatable-desktop">{desktop}</span>
        <span className="truncatable-mobile">{mobile}</span>
      </>
    )
  }

  // Checklisten-Livewerte (10s-Sync der "freien" Spalten je Raum)
  const [checklistValues, setChecklistValues] = useState<ChecklistValue[]>([])
  const [checklistCellOverrides, setChecklistCellOverrides] = useState<Record<string, string>>({})

  // fix006: Kein vollständiges Live-Sync (wie bei Checklisten), aber ein gezieltes Nachladen von
  // Kategorien/Standorten/Vorlagen/Räumen/Audits beim Seitenwechsel, beim Betreten eines Standorts und
  // nach dem eigenen Speichern – damit Änderungen anderer Benutzer sichtbar werden, ohne dass man
  // die Seite per Strg+R manuell neu laden muss.
  const refreshCoreData = useCallback(async () => {
    if (!session) return
    try {
      const [categoryData, siteData, templateData, roomData, auditData] = await Promise.all([
        apiRequest<Category[]>('/api/categories', session),
        apiRequest<Site[]>('/api/standorte', session),
        apiRequest<Template[]>('/api/templates', session),
        apiRequest<Room[]>('/api/rooms?all=true', session),
        apiRequest<AuditInstance[]>('/api/audits', session)
      ])
      setCategories(categoryData)
      setSites(siteData)
      setTemplates(templateData)
      setRooms(roomData)
      setAudits(auditData)
      setAuditSelectedSite(previous => previous ? (siteData.find(s => s.id === previous.id) ?? previous) : previous)
      setDatenablageSite(previous => previous ? (siteData.find(s => s.id === previous.id) ?? previous) : previous)
    } catch {
      // Stille Fehlerbehandlung: Hintergrund-Refresh soll bestehende Eingaben nicht stören
    }
  }, [session])

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
    // Clear page-specific error on navigation
    setError('')
    setShowErrorBanner(false)
    setEditingCategory(null)
    setEditingSite(null)
    setEditingTemplate(null)
    setEditingChecklistTemplate(null)
    setEditingUser(null)
    setShowNewUserForm(false)
    // Reset room form on page change
    setRoomForm({ siteId: '1', name: '', description: '', capacity: '', area: '', notes: '' })
    setRoomFieldValues({})
    setSiteGroundDataValues({})
    setEditingRoomId(null)
    // Reset Vorlagen-Feldbuilder, sonst bleiben Datenfelder einer zuvor bearbeiteten
    // Vorlage sichtbar, obwohl Name/Beschreibung bereits zurückgesetzt wurden
    setTemplateFields(DEFAULT_TEMPLATE_FIELDS)
    // PDF-Designer: eine zuvor geöffnete Design-Bearbeitung darf nach Seitenwechsel nicht offen bleiben
    setEditingPdfDesign(null)
    setShowPdfTemplatePicker(false)
    setChecklistColumns([])
    // Dokumente/Datenablage: Zustand darf nach Seitenwechsel nicht erhalten bleiben
    setDatenablageSelectedRoomName(null)
    setDocGenTitle('')
    setDocGenPdfDesignId('')
    setDocGenAuditId(null)
    setDocCurrentFolderId(0)
    setNewFolderName('')
    setRenamingDocId(null)
    setShowDocArchive(false)
    // fix006: Beim Wechsel der Subseite aktuelle Daten vom Server nachladen, damit
    // Änderungen anderer Benutzer sichtbar werden statt nur den Stand vom Login zu zeigen.
    void refreshCoreData()
  }, [page, refreshCoreData])

  useEffect(() => {
    if (!auditSelectedSite) {
      setSiteGroundDataValues({})
      return
    }

    // Vorläufig den lokal bekannten Stand zeigen, damit die UI nicht leer aufblitzt...
    setSiteGroundDataValues(parseStringMap(auditSelectedSite.groundDataJson))
    setDocGenTitle('')
    setDocGenPdfDesignId('')
    setDocGenAuditId(null)
    setDocCurrentFolderId(0)
    setShowDocArchive(false)

    // fix006: ...und sofort frische Räume/Grunddaten vom Server nachladen (z.B. falls ein Kollege
    // parallel am selben Standort etwas eingetragen hat), statt auf dem beim Login geladenen,
    // möglicherweise veralteten Stand sitzen zu bleiben.
    const siteId = auditSelectedSite.id
    let cancelled = false
    if (session) {
      void (async () => {
        try {
          const [roomData, siteData] = await Promise.all([
            apiRequest<Room[]>('/api/rooms?all=true', session),
            apiRequest<Site[]>('/api/standorte', session)
          ])
          if (cancelled) return
          setRooms(roomData)
          setSites(siteData)
          const freshSite = siteData.find(s => s.id === siteId)
          if (freshSite) {
            setAuditSelectedSite(freshSite)
            setSiteGroundDataValues(parseStringMap(freshSite.groundDataJson))
          }
        } catch {
          // Stille Fehlerbehandlung: lokal bekannter Stand bleibt sichtbar
        }
      })()
    }
    return () => { cancelled = true }
  }, [auditSelectedSite?.id, session])

  // Deep-Link aus der Datenablage: nach Navigation zur Audits-Seite den Live-Raum zur Bearbeitung öffnen.
  // Läuft bewusst NACH dem Seitenwechsel-Reset-Effekt oben, damit editingRoomId/roomForm nicht sofort wieder geleert werden.
  useEffect(() => {
    if (!pendingRoomEditName || page !== 'audits' || !auditSelectedSite) return
    const liveRoom = rooms.find(r => r.siteId === auditSelectedSite.id && r.auditId === 0 && r.name === pendingRoomEditName)
    if (liveRoom) {
      setEditingRoomId(liveRoom.id)
      setRoomForm({ siteId: String(liveRoom.siteId), name: liveRoom.name, description: liveRoom.description, capacity: liveRoom.capacity, area: liveRoom.area, notes: liveRoom.notes })
      setRoomFieldValues(parseStringMap(liveRoom.fieldsJson))
    }
    setPendingRoomEditName(null)
  }, [pendingRoomEditName, page, auditSelectedSite, rooms])

  // Navigiert von der Datenablage zur Audits-Seite und öffnet dort direkt die Bearbeitung des (Live-)Raums
  const goToLiveRoomEdit = (site: Site, roomName: string) => {
    const liveRoom = rooms.find(r => r.siteId === site.id && r.auditId === 0 && r.name === roomName)
    const fieldKeys = liveRoom ? Object.keys(parseStringMap(liveRoom.fieldsJson)) : []
    const matchingTemplate = templates.find(t => fieldKeys.length > 0 && fieldKeys.every(k => t.fields.some(f => f.name === k)))
    setPage('audits')
    setAuditSelectedCategory(categories.find(c => c.id === site.categoryId) ?? null)
    setAuditSelectedSite(site)
    setAuditSelectedTemplate(matchingTemplate ?? null)
    setAuditView('standort')
    setAuditTab('raume')
    setPendingRoomEditName(roomName)
  }

  // Navigiert von der Datenablage zur Audits-Seite (ohne spezifischen Raum), z.B. um Grunddaten/Vorlage zu korrigieren
  const goToAuditsSite = (site: Site, tab: 'raume' | 'grunddaten' | 'checklisten' | 'dokumente' = 'raume') => {
    setPage('audits')
    setAuditSelectedCategory(categories.find(c => c.id === site.categoryId) ?? null)
    setAuditSelectedSite(site)
    setAuditView('standort')
    setAuditTab(tab)
  }

  // Checklisten-Vorlage(n), die zur aktuell gewählten Audit-Vorlage passen
  const activeChecklistTemplates = auditSelectedTemplate
    ? checklistTemplates.filter(c => c.templateId === auditSelectedTemplate.id)
    : []

  // Checklisten für die in der Datenablage gewählte Audit-Vorlage (nur Ansicht)
  const datenablageChecklists = datenablageChecklistTemplate
    ? checklistTemplates.filter(c => c.templateId === datenablageChecklistTemplate.id)
    : []

  const toggleChecklistExpanded = (id: number) => {
    setExpandedChecklistIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Gemeinsame, aufklappbare Darstellung einer Liste von Checklisten für einen Standort.
  // Bei genau einer Checkliste ist sie direkt aufgeklappt, bei mehreren standardmäßig eingeklappt.
  const renderChecklistsSection = (checklistList: ChecklistTemplate[], liveRooms: Room[], readOnly: boolean) => {
    if (checklistList.length === 0) {
      return <p className="empty-hint">Für diese Vorlage ist keine Checkliste hinterlegt. Checklisten können unter Einstellungen → Checklisten angelegt und einer Audit-Vorlage zugewiesen werden.</p>
    }
    return checklistList.map(checklistTemplate => {
      const columns: ChecklistColumn[] = (() => { try { return JSON.parse(checklistTemplate.columnsJson) } catch { return [] } })().sort((a: ChecklistColumn, b: ChecklistColumn) => a.order - b.order)
      const isOpen = checklistList.length <= 1 || expandedChecklistIds.has(checklistTemplate.id)
      return (
        <div key={checklistTemplate.id} className="checklist-collapsible" style={{ marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => checklistList.length > 1 && toggleChecklistExpanded(checklistTemplate.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
              background: 'var(--surface-2, var(--surface))', border: 'none', padding: '10px 14px',
              cursor: checklistList.length > 1 ? 'pointer' : 'default', fontSize: '0.9rem', color: 'var(--text-h)', fontWeight: 600
            }}
          >
            <span style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block', opacity: checklistList.length > 1 ? 1 : 0.3 }}>▸</span>
            <span>{checklistTemplate.name}</span>
            <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.8rem' }}>{readOnly ? '· nur Ansicht' : '· synchronisiert alle 10s'}</span>
          </button>
          {isOpen && (
            <div style={{ padding: '12px 14px' }}>
              {columns.length === 0 || liveRooms.length === 0 ? (
                <p className="empty-hint">{columns.length === 0 ? 'Diese Checkliste hat noch keine Spalten.' : 'Noch keine Räume/Objekte für diesen Standort vorhanden.'}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr>{columns.map(col => <th key={col.id} style={col.width ? { width: `${col.width}px` } : undefined}>{col.label}</th>)}</tr></thead>
                    <tbody>
                      {liveRooms.map(room => {
                        const roomFieldMap = parseStringMap(room.fieldsJson)
                        return (
                          <tr key={room.id}>
                            {columns.map(col => {
                              if (col.source === 'room') {
                                return <td key={col.id}><strong>{room.name}</strong></td>
                              }
                              if (col.source === 'field') {
                                const val = col.fieldName ? (roomFieldMap[col.fieldName] ?? '') : ''
                                return <td key={col.id} style={{ color: 'var(--muted)' }}>{renderTruncatable(`${room.name} — ${col.label}`, val)}</td>
                              }
                              const cellValue = getChecklistCellValue(checklistTemplate.id, room.id, col.id)
                              if (readOnly) {
                                return <td key={col.id} style={{ color: 'var(--muted)' }}>{col.inputType === 'checkbox' ? (cellValue === 'true' ? '✓' : '✗') : renderTruncatable(`${room.name} — ${col.label}`, cellValue)}</td>
                              }
                              if (col.inputType === 'checkbox') {
                                return (
                                  <td key={col.id} style={{ textAlign: 'left' }}>
                                    <input type="checkbox" checked={cellValue === 'true'} onChange={e => commitChecklistCell(checklistTemplate.id, room.id, col.id, e.target.checked ? 'true' : 'false')} />
                                  </td>
                                )
                              }
                              return (
                                <td key={col.id}>
                                  <input
                                    type={col.inputType === 'number' ? 'number' : 'text'}
                                    value={cellValue}
                                    onChange={e => setChecklistCellOverride(checklistTemplate.id, room.id, col.id, e.target.value)}
                                    onBlur={e => commitChecklistCell(checklistTemplate.id, room.id, col.id, e.target.value)}
                                    style={{ minWidth: '90px' }}
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )
    })
  }

  const getChecklistValueMap = (checklistTemplateId: number, roomId: number): Record<string, string> => {
    const entry = checklistValues.find(v => v.checklistTemplateId === checklistTemplateId && v.roomId === roomId)
    return entry ? parseStringMap(entry.dataJson) : {}
  }

  const getChecklistCellValue = (checklistTemplateId: number, roomId: number, colId: string): string => {
    const overrideKey = `${checklistTemplateId}:${roomId}:${colId}`
    if (overrideKey in checklistCellOverrides) return checklistCellOverrides[overrideKey]
    return getChecklistValueMap(checklistTemplateId, roomId)[colId] ?? ''
  }

  const setChecklistCellOverride = (checklistTemplateId: number, roomId: number, colId: string, value: string) => {
    setChecklistCellOverrides(previous => ({ ...previous, [`${checklistTemplateId}:${roomId}:${colId}`]: value }))
  }

  const saveChecklistValue = async (checklistTemplateId: number, roomId: number, data: Record<string, string>) => {
    if (!session) return
    try {
      const updated = await apiRequest<ChecklistValue>('/api/checklist-values', session, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklistTemplateId, roomId, dataJson: JSON.stringify(data) })
      })
      setChecklistValues(previous => {
        const exists = previous.some(v => v.checklistTemplateId === checklistTemplateId && v.roomId === roomId)
        return exists
          ? previous.map(v => (v.checklistTemplateId === checklistTemplateId && v.roomId === roomId ? updated : v))
          : [...previous, updated]
      })
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Checklisten-Wert konnte nicht gespeichert werden.')
    }
  }

  const commitChecklistCell = (checklistTemplateId: number, roomId: number, colId: string, value: string) => {
    const merged = { ...getChecklistValueMap(checklistTemplateId, roomId), [colId]: value }
    saveChecklistValue(checklistTemplateId, roomId, merged)
    setChecklistCellOverrides(previous => {
      const next = { ...previous }
      delete next[`${checklistTemplateId}:${roomId}:${colId}`]
      return next
    })
  }

  // Live-Sync: Checklisten-Werte alle 10s neu laden, solange der Checklisten-Tab aktiv ist
  useEffect(() => {
    if (!session || auditTab !== 'checklisten' || activeChecklistTemplates.length === 0) return
    let cancelled = false
    const loadAll = async () => {
      try {
        const results = await Promise.all(activeChecklistTemplates.map(c =>
          apiRequest<ChecklistValue[]>(`/api/checklist-values?checklistTemplateId=${c.id}`, session)
        ))
        if (!cancelled) setChecklistValues(results.flat())
      } catch {
        // Stille Fehlerbehandlung beim Hintergrund-Polling, um die Eingabe nicht zu stören
      }
    }
    loadAll()
    const interval = setInterval(loadAll, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [session, auditTab, auditSelectedTemplate?.id])

  // Live-Sync für die (nur lesende) Checklisten-Ansicht in der Datenablage
  useEffect(() => {
    if (!session || datenablageTab !== 'checklisten' || datenablageChecklists.length === 0) return
    let cancelled = false
    const loadAll = async () => {
      try {
        const results = await Promise.all(datenablageChecklists.map(c =>
          apiRequest<ChecklistValue[]>(`/api/checklist-values?checklistTemplateId=${c.id}`, session)
        ))
        if (!cancelled) setChecklistValues(results.flat())
      } catch {
        // Stille Fehlerbehandlung beim Hintergrund-Polling
      }
    }
    loadAll()
    const interval = setInterval(loadAll, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [session, datenablageTab, datenablageChecklistTemplate?.id])

  useEffect(() => {
    setDatenablageSelectedRoomName(null)
    setDatenablageChecklistTemplate(null)
    // fix006: Auch in der (nur lesenden) Datenablage beim Betreten eines Standorts frische
    // Räume/Grunddaten nachladen statt den ggf. veralteten Login-Stand zu zeigen.
    if (session && datenablageSite) {
      void (async () => {
        try {
          const [roomData, siteData] = await Promise.all([
            apiRequest<Room[]>('/api/rooms?all=true', session),
            apiRequest<Site[]>('/api/standorte', session)
          ])
          setRooms(roomData)
          setSites(siteData)
        } catch {
          // Stille Fehlerbehandlung: lokal bekannter Stand bleibt sichtbar
        }
      })()
    }
  }, [datenablageSite?.id, session])

  // Speichern-Bestätigung im PDF-Designer nach ein paar Sekunden automatisch ausblenden
  useEffect(() => {
    if (!pdfSaveConfirm) return
    const timer = setTimeout(() => setPdfSaveConfirm(false), 3500)
    return () => clearTimeout(timer)
  }, [pdfSaveConfirm])

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
        const [categoryData, siteData, templateData, roomData, auditData, pdfDesignData, checklistTmplData, documentData, folderData] = await Promise.all([
          apiRequest<Category[]>('/api/categories', session),
          apiRequest<Site[]>('/api/standorte', session),
          apiRequest<Template[]>('/api/templates', session),
          apiRequest<Room[]>('/api/rooms?all=true', session),
          apiRequest<AuditInstance[]>('/api/audits', session),
          apiRequest<PdfDesign[]>('/api/pdfdesigns', session),
          apiRequest<ChecklistTemplate[]>('/api/checklisttemplates', session),
          apiRequest<AuditDocument[]>('/api/documents', session),
          apiRequest<DocumentFolder[]>('/api/folders', session)
        ])

        setCategories(categoryData)
        setSites(siteData)
        setTemplates(templateData)
        setRooms(roomData)
        setAudits(auditData)
        setPdfDesigns(pdfDesignData)
        setChecklistTemplates(checklistTmplData)
        setDocuments(documentData)
        setFolders(folderData)
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

  useEffect(() => {
    if (!session || page !== 'admin-logs' || !canManageUsers(session.user.role)) {
      return
    }

    const loadLogs = async () => {
      try {
        const res = await apiRequest<Array<{ timestamp: string; action: string; details?: string; userId: number; userName: string }>>('/api/admin/logs', session)
        setLogs(res)
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Logs konnten nicht geladen werden.')
      }
    }

    void loadLogs()
  }, [session, page])

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

  const exportAuditZip = async (mode: 'site' | 'all' = 'site') => {
    if (!session) {
      return
    }

    try {
      const query = mode === 'site' ? `?siteId=${encodeURIComponent(exportSiteId)}` : ''
      const response = await fetch(`${API_BASE}/api/admin/export/zip${query}`, {
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

      const response = await fetch(`${API_BASE}/api/objects/${imageGalleryObject.id}/images`, {
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

  const generateDocument = async (auditId: number, titleOverride?: string, pdfDesignIdOverride?: string) => {
    const title = (titleOverride ?? docGenTitle).trim()
    const pdfDesignId = pdfDesignIdOverride ?? docGenPdfDesignId
    if (!session || !title || !pdfDesignId) return null
    setDocGenInProgress(true)
    try {
      const doc = await apiRequest<AuditDocument>(`/api/audits/${auditId}/documents/generate`, session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, pdfDesignId: parseInt(pdfDesignId), folderId: docCurrentFolderId || undefined })
      })
      setDocuments(p => [doc, ...p])
      setDocGenTitle('')
      return doc
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Dokument konnte nicht erstellt werden.')
      return null
    } finally {
      setDocGenInProgress(false)
    }
  }

  // Einheitlicher Workflow: Audit anlegen UND direkt das erste PDF-Dokument dafür erzeugen
  const createAuditAndGenerateDocument = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session || !auditSelectedSite || !auditSelectedTemplate || !newAuditPdfDesignId) return
    try {
      const audit = await apiRequest<AuditInstance>('/api/audits', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: auditSelectedSite.id,
          templateId: auditSelectedTemplate.id,
          title: auditForm.title
        })
      })
      setAudits(previous => [audit, ...previous])
      const design = pdfDesigns.find(d => String(d.id) === newAuditPdfDesignId)
      const docTitle = newAuditDocTitle.trim() || (design ? `${design.name} – ${audit.title}` : audit.title)
      await generateDocument(audit.id, docTitle, newAuditPdfDesignId)
      setAuditForm({ siteId: '1', templateId: '1', title: '' })
      setNewAuditPdfDesignId('')
      setNewAuditDocTitle('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Audit konnte nicht gespeichert werden.')
    }
  }

  const deleteAuditEntry = (audit: AuditInstance) => {
    if (!session) return
    askConfirm(`Audit "${audit.title}" wirklich endgültig löschen? Alle zugehörigen Dokumente werden ebenfalls gelöscht.`, async () => {
      try {
        await apiRequest(`/api/audits/${audit.id}`, session, { method: 'DELETE' })
        setAudits(previous => previous.filter(a => a.id !== audit.id))
        setDocuments(previous => previous.filter(d => d.auditId !== audit.id))
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Audit konnte nicht gelöscht werden.')
      }
    })
  }

  const openOrDownloadDocument = async (doc: AuditDocument, mode: 'view' | 'download') => {
    if (!session) return
    try {
      const res = await fetch(`${API_BASE}/api/documents/${doc.id}/${mode}`, { headers: { Authorization: `Bearer ${session.token}` } })
      if (!res.ok) throw new Error('Datei konnte nicht geladen werden.')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      if (mode === 'view') {
        window.open(url, '_blank')
      } else {
        const link = document.createElement('a')
        link.href = url
        link.download = doc.fileName.split('/').pop() ?? doc.title
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 10000)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Datei konnte nicht geöffnet werden.')
    }
  }

  const createDocFolder = async (siteId: number) => {
    if (!session || !newFolderName.trim()) return
    try {
      const folder = await apiRequest<DocumentFolder>(`/api/folders?siteId=${siteId}`, session, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), parentFolderId: docCurrentFolderId || undefined })
      })
      setFolders(p => [...p, folder])
      setNewFolderName('')
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Ordner konnte nicht erstellt werden.')
    }
  }

  const deleteDocFolder = async (id: number) => {
    if (!session) return
    askConfirm('Ordner wirklich löschen? Enthaltene Dokumente werden ins Hauptverzeichnis verschoben.', async () => {
      try {
        await apiRequest(`/api/folders/${id}`, session, { method: 'DELETE' })
        setFolders(p => p.filter(f => f.id !== id))
        setDocuments(p => p.map(d => d.folderId === id ? { ...d, folderId: 0 } : d))
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Ordner konnte nicht gelöscht werden.')
      }
    })
  }

  const saveDocumentRename = async (id: number) => {
    if (!session || !renamingDocTitle.trim()) return
    try {
      const doc = await apiRequest<AuditDocument>(`/api/documents/${id}`, session, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: renamingDocTitle.trim() }) })
      setDocuments(p => p.map(d => d.id === doc.id ? doc : d))
      setRenamingDocId(null)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Dokument konnte nicht umbenannt werden.')
    }
  }

  const toggleArchiveDocument = async (doc: AuditDocument) => {
    if (!session) return
    try {
      const updated = await apiRequest<AuditDocument>(`/api/documents/${doc.id}`, session, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isArchived: !doc.isArchived }) })
      setDocuments(p => p.map(d => d.id === updated.id ? updated : d))
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Status konnte nicht geändert werden.')
    }
  }

  const deleteDocumentEntry = async (id: number) => {
    if (!session) return
    askConfirm('Dokument wirklich endgültig löschen?', async () => {
      try {
        await apiRequest(`/api/documents/${id}`, session, { method: 'DELETE' })
        setDocuments(p => p.filter(d => d.id !== id))
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Dokument konnte nicht gelöscht werden.')
      }
    })
  }

  const moveDocumentToFolder = async (id: number, folderId: number) => {
    if (!session) return
    try {
      const doc = await apiRequest<AuditDocument>(`/api/documents/${id}`, session, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderId }) })
      setDocuments(p => p.map(d => d.id === doc.id ? doc : d))
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Dokument konnte nicht verschoben werden.')
    }
  }

  const uploadExternalDocument = async (siteId: number, file: File) => {
    if (!session) return
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('siteId', String(siteId))
      formData.append('title', file.name.replace(/\.[^.]+$/, ''))
      formData.append('folderId', String(docCurrentFolderId || 0))
      const res = await fetch(`${API_BASE}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, body: formData })
      if (!res.ok) throw new Error('Upload fehlgeschlagen.')
      const doc = await res.json() as AuditDocument
      setDocuments(p => [doc, ...p])
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Dokument konnte nicht hochgeladen werden.')
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
      const response = await fetch(`${API_BASE}/api/objects/${imageGalleryObject.id}/images/${imageName}`, {
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
      if (!templateForm.name.trim()) {
        throw new Error('Der Vorlagenname ist erforderlich.')
      }

      const fields = templateFields
        .filter((field) => field.name.trim())
        .map((field, index) => ({
          name: field.name.trim(),
          type: encodeTemplateFieldType(field),
          order: index + 1,
          relevantForProgress: field.required
        }))

      const template = await apiRequest<Template>('/api/templates', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateForm.name.trim(),
          description: templateForm.description.trim(),
          fields
        })
      })

      setTemplates((previous) => [...previous, template])
      setTemplateForm({ name: '', description: '' })
      setTemplateFields(DEFAULT_TEMPLATE_FIELDS)
      setError('')
      setShowErrorBanner(false)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Vorlage konnte nicht gespeichert werden.')
    }
  }

  const moveTemplateFieldInScope = (idx: number, direction: -1 | 1) => {
    setTemplateFields((prev) => {
      const scope = prev[idx].scope
      const sameScopeIndices = prev.map((_, i) => i).filter((i) => prev[i].scope === scope)
      const posInScope = sameScopeIndices.indexOf(idx)
      const swapWithPos = posInScope + direction
      if (swapWithPos < 0 || swapWithPos >= sameScopeIndices.length) {
        return prev
      }
      const swapIdx = sameScopeIndices[swapWithPos]
      const next = [...prev]
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next.map((f, i) => ({ ...f, order: i + 1 }))
    })
  }

  const moveChecklistColumn = (idx: number, direction: -1 | 1) => {
    setChecklistColumns((prev) => {
      const swapIdx = idx + direction
      if (swapIdx < 0 || swapIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next.map((c, i) => ({ ...c, order: i + 1 }))
    })
  }

  const renderChecklistColumnsBuilder = (forTemplateId: number) => {
    const fieldsOfTemplate = templates.find(t => t.id === forTemplateId)?.fields ?? []
    return (
      <div style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
          <strong>Spalten</strong>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button type="button" className="secondary-button" style={{ padding: '5px 8px', fontSize: '0.82rem' }} onClick={() => setChecklistColumns(p => [...p, { id: Date.now().toString(), label: 'Raum', source: 'room', inputType: 'text', order: p.length + 1 }])}>+ Raumname</button>
            {fieldsOfTemplate.map(f => (
              <button key={f.name} type="button" className="secondary-button" style={{ padding: '5px 8px', fontSize: '0.82rem' }}
                onClick={() => setChecklistColumns(p => [...p, { id: Date.now().toString(), label: f.name, source: 'field', fieldName: f.name, inputType: f.type === 'number' ? 'number' : 'text', order: p.length + 1 }])}>+ {f.name}</button>
            ))}
            <button type="button" className="secondary-button" style={{ padding: '5px 8px', fontSize: '0.82rem' }} onClick={() => setChecklistColumns(p => [...p, { id: Date.now().toString(), label: 'Neue Spalte', source: 'custom', inputType: 'checkbox', order: p.length + 1 }])}>+ Freie Spalte</button>
          </div>
        </div>
        <div className="field-builder">
          {checklistColumns.map((col, idx) => (
            <div key={col.id} className="field-builder-row">
              <span className="field-order" style={{ cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, userSelect: 'none' }} title="Nach oben" onClick={() => moveChecklistColumn(idx, -1)}>↑</span>
              <span className="field-order" style={{ cursor: idx === checklistColumns.length - 1 ? 'default' : 'pointer', opacity: idx === checklistColumns.length - 1 ? 0.3 : 1, userSelect: 'none' }} title="Nach unten" onClick={() => moveChecklistColumn(idx, 1)}>↓</span>
              <span className="field-order">{col.order}</span>
              <input className="field-name-input" placeholder="Spaltenname" value={col.label} onChange={e => setChecklistColumns(p => p.map((c, i) => i === idx ? { ...c, label: e.target.value } : c))} />
              <span className="status-badge" style={{ fontSize: '0.75rem' }}>{col.source === 'room' ? 'Raumname' : col.source === 'field' ? `Feld: ${col.fieldName}` : 'Frei'}</span>
              <select className="field-type-select" value={col.inputType} onChange={e => setChecklistColumns(p => p.map((c, i) => i === idx ? { ...c, inputType: e.target.value as 'text' | 'number' | 'checkbox' } : c))}>
                <option value="text">Text</option><option value="number">Zahl</option><option value="checkbox">Checkbox</option>
              </select>
              <button type="button" className="danger-button" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => setChecklistColumns(p => p.filter((_, i) => i !== idx).map((c, i) => ({ ...c, order: i + 1 })))}>✕</button>
            </div>
          ))}
          {checklistColumns.length === 0 && <p className="empty-hint">Noch keine Spalten.</p>}
        </div>
      </div>
    )
  }

  const renderTemplateFieldBuilderSection = (scope: TemplateFieldScope) => {
    const indices = templateFields.map((_, i) => i).filter((i) => templateFields[i].scope === scope)
    return (
      <div className="field-builder-section">
        <div className="field-builder-section-header">
          <strong>{scope === 'room' ? '🏠 Datenfelder für Räume/Objekte' : '📋 Datenfelder für Grunddaten'}</strong>
          <button type="button" className="secondary-button" style={{ padding: '5px 10px', fontSize: '0.82rem' }}
            onClick={() => setTemplateFields((p) => [...p, { name: '', type: 'text', order: p.length + 1, required: true, dropdownOptions: '', defaultValue: '', scope }])}>+ Feld</button>
        </div>
        <div className="field-builder">
          {indices.length === 0 && <p className="empty-hint">Noch keine Felder.</p>}
          {indices.map((idx, pos) => {
            const field = templateFields[idx]
            return (
              <div key={idx} className="field-builder-item">
                <div className="field-builder-row">
                  <span className="field-order" style={{ cursor: pos === 0 ? 'default' : 'pointer', opacity: pos === 0 ? 0.3 : 1, userSelect: 'none' }} title="Nach oben"
                    onClick={() => moveTemplateFieldInScope(idx, -1)}>↑</span>
                  <span className="field-order" style={{ cursor: pos === indices.length - 1 ? 'default' : 'pointer', opacity: pos === indices.length - 1 ? 0.3 : 1, userSelect: 'none' }} title="Nach unten"
                    onClick={() => moveTemplateFieldInScope(idx, 1)}>↓</span>
                  <span className="field-order">{pos + 1}</span>
                  <input className="field-name-input" placeholder="Feldname" value={field.name} onChange={e => setTemplateFields(p => p.map((f, i) => i === idx ? { ...f, name: e.target.value } : f))} />
                  <select className="field-type-select" value={field.type} onChange={e => setTemplateFields(p => p.map((f, i) => i === idx ? { ...f, type: e.target.value } : f))}>
                    <option value="text">Text</option>
                    <option value="number">Zahl</option>
                    <option value="dropdown">▼ Auswahl</option>
                    <option value="textarea">Langer Text</option>
                    <option value="checkbox">☑ Checkbox</option>
                    <option value="image">📷 Bild</option>
                  </select>
                  <label className="field-required-check"><input type="checkbox" checked={field.required} onChange={e => setTemplateFields(p => p.map((f, i) => i === idx ? { ...f, required: e.target.checked } : f))} />Pflicht</label>
                  <button type="button" className="danger-button" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => setTemplateFields(p => p.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i + 1 })))}>✕</button>
                </div>
                {field.type === 'dropdown' && (
                  <div className="dropdown-options-row">
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Optionen:</span>
                    <input placeholder="Option 1, Option 2..." value={field.dropdownOptions} onChange={e => setTemplateFields(p => p.map((f, i) => i === idx ? { ...f, dropdownOptions: e.target.value } : f))} style={{ flex: 1, padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text-h)', fontSize: '0.88rem' }} />
                  </div>
                )}
                {field.type === 'dropdown' && (
                  <div className="dropdown-options-row">
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Standardwert:</span>
                    <select value={field.defaultValue} onChange={e => setTemplateFields(p => p.map((f, i) => i === idx ? { ...f, defaultValue: e.target.value } : f))} style={{ flex: 1, padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text-h)', fontSize: '0.88rem' }}>
                      <option value="">-- kein Standardwert --</option>
                      {field.dropdownOptions.split(',').map(o => o.trim()).filter(Boolean).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const isAdmin = session ? canManageUsers(session.user.role) : false

  // ===== Bilder-Galerie Modal: Zoom (fokuspunktgenau) + Pan (Drag/Touch) + Pinch =====
  const openGallery = (images: string[], index: number) => {
    setGalleryModalImages(images)
    setGalleryModalIndex(index)
    setGalleryModalZoom(1)
    setGalleryModalPan({ x: 0, y: 0 })
  }
  const resetGalleryZoom = () => { setGalleryModalZoom(1); setGalleryModalPan({ x: 0, y: 0 }) }
  const galleryWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    setGalleryModalZoom(z => Math.max(0.5, Math.min(4, z + (e.deltaY < 0 ? 0.2 : -0.2))))
  }
  const galleryImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (galleryDragRef.current?.moved) { galleryDragRef.current.moved = false; return }
    const wrap = e.currentTarget.parentElement as HTMLElement
    const rect = wrap.getBoundingClientRect()
    if (galleryModalZoom <= 1) {
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const ix = (e.clientX - centerX - galleryModalPan.x) / galleryModalZoom
      const iy = (e.clientY - centerY - galleryModalPan.y) / galleryModalZoom
      const newZoom = 2.5
      setGalleryModalZoom(newZoom)
      setGalleryModalPan({ x: galleryModalPan.x + ix * (galleryModalZoom - newZoom), y: galleryModalPan.y + iy * (galleryModalZoom - newZoom) })
    } else {
      resetGalleryZoom()
    }
  }
  const galleryMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (galleryModalZoom <= 1) return
    e.preventDefault()
    galleryDragRef.current = { startX: e.clientX, startY: e.clientY, panX: galleryModalPan.x, panY: galleryModalPan.y, moved: false }
  }
  const galleryMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const drag = galleryDragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true
    setGalleryModalPan({ x: drag.panX + dx, y: drag.panY + dy })
  }
  const galleryMouseUp = () => {
    if (galleryDragRef.current && !galleryDragRef.current.moved) galleryDragRef.current = null
  }
  const touchDistance = (t1: React.Touch, t2: React.Touch) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
  const galleryTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      galleryPinchRef.current = { startDist: touchDistance(e.touches[0], e.touches[1]), startZoom: galleryModalZoom }
    } else if (e.touches.length === 1 && galleryModalZoom > 1) {
      galleryDragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, panX: galleryModalPan.x, panY: galleryModalPan.y, moved: false }
    }
  }
  const galleryTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && galleryPinchRef.current) {
      const d = touchDistance(e.touches[0], e.touches[1])
      const newZoom = Math.max(0.5, Math.min(4, galleryPinchRef.current.startZoom * (d / galleryPinchRef.current.startDist)))
      setGalleryModalZoom(newZoom)
    } else if (e.touches.length === 1 && galleryDragRef.current) {
      const dx = e.touches[0].clientX - galleryDragRef.current.startX
      const dy = e.touches[0].clientY - galleryDragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) galleryDragRef.current.moved = true
      setGalleryModalPan({ x: galleryDragRef.current.panX + dx, y: galleryDragRef.current.panY + dy })
    }
  }
  const galleryTouchEnd = () => { galleryPinchRef.current = null }

  // ===== Wiederverwendbarer Bild-Upload-Feldtyp (für Raum- UND Grunddaten-Felder) =====
  const renderImageUploadField = (
    key: string,
    label: string,
    required: boolean,
    value: string,
    setValue: (updater: (prev: string) => string) => void
  ) => {
    const imageList = value.split('||').filter(Boolean)
    const moveImage = (from: number, to: number) => setValue(previous => {
      const current = (previous ?? '').split('||').filter(Boolean)
      if (to < 0 || to >= current.length) return previous
      const next = [...current]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next.join('||')
    })
    return (
      <div key={key} className={`full-width ${fieldStatusClass(required, imageList.length > 0)}`}>
        <label>{label}</label>
        <div className="room-image-upload">
          <label className="image-upload-btn">
            📷 Bilder hinzufügen
            <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={async e=>{
              const files = Array.from(e.target.files||[])
              if (files.length === 0) return
              const newImages: string[] = []
              for (const file of files) {
                const compressed = await compressImage(file)
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader()
                  reader.onload = ev => resolve(ev.target?.result as string)
                  reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
                  reader.readAsDataURL(compressed)
                })
                newImages.push(dataUrl)
              }
              setValue(previous => {
                const existing = (previous ?? '').split('||').filter(Boolean)
                return [...existing, ...newImages].join('||')
              })
              e.target.value=''
            }} />
          </label>
          {imageList.length > 0 && (
            <div className="room-image-thumbs">
              {imageList.map((imageSrc,imgIdx)=>(
                <div key={`${key}-${imgIdx}`} className="room-image-thumb">
                  <img src={imageSrc} alt={`${label}-${imgIdx+1}`} onClick={()=>openGallery(imageList,imgIdx)} />
                  <button type="button" className="thumb-remove" onClick={()=>setValue(previous=>{
                    const current = (previous ?? '').split('||').filter(Boolean)
                    return current.filter((_, idx) => idx !== imgIdx).join('||')
                  })}>✕</button>
                  <div style={{display:'flex',gap:'2px',position:'absolute',bottom:2,left:2}}>
                    <button type="button" style={{fontSize:'0.65rem',background:'rgba(0,0,0,0.5)',border:'none',color:'white',cursor:'pointer',borderRadius:'3px',padding:'1px 3px'}} onClick={()=>moveImage(imgIdx,imgIdx-1)}>←</button>
                    <button type="button" style={{fontSize:'0.65rem',background:'rgba(0,0,0,0.5)',border:'none',color:'white',cursor:'pointer',borderRadius:'3px',padding:'1px 3px'}} onClick={()=>moveImage(imgIdx,imgIdx+1)}>→</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

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

  // ===== Dokumenten-Verwaltung (Datei-Explorer für Ordner + generierte/hochgeladene Dokumente) =====
  const renderDocumentManager = (siteId: number, readOnly: boolean) => {
    const siteFolders = folders.filter(f => f.siteId === siteId && f.parentFolderId === docCurrentFolderId)
    const currentFolder = docCurrentFolderId ? folders.find(f => f.id === docCurrentFolderId) : null
    const siteDocuments = documents.filter(d => d.siteId === siteId && d.folderId === docCurrentFolderId && d.isArchived === showDocArchive)
    const allSiteFolders = folders.filter(f => f.siteId === siteId)
    return (
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong>📁 Dokumentenablage</strong>
            {currentFolder && <button type="button" className="tertiary-button" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => setDocCurrentFolderId(currentFolder.parentFolderId)}>← {currentFolder.name}</button>}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className={`tab-btn${showDocArchive ? ' active' : ''}`} style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setShowDocArchive(v => !v)}>🗄 {showDocArchive ? 'Archiv' : 'Archiv anzeigen'}</button>
          </div>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="styled-input" placeholder="Neuer Ordnername" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} style={{ maxWidth: '240px' }} />
            <button type="button" className="secondary-button" onClick={() => createDocFolder(siteId)}>+ Ordner anlegen</button>
            <label className="secondary-button" style={{ cursor: 'pointer', margin: 0 }}>
              📤 Datei hochladen
              <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadExternalDocument(siteId, f); e.target.value = '' }} />
            </label>
          </div>
        )}
        {siteFolders.length > 0 && (
          <div className="list-view" style={{ marginBottom: '12px' }}>
            {siteFolders.map(f => (
              <div key={f.id} className="list-item" style={{ cursor: 'default' }}>
                <span className="list-icon" style={{ cursor: 'pointer' }} onClick={() => setDocCurrentFolderId(f.id)}>📁</span>
                <span className="list-name" style={{ cursor: 'pointer' }} onClick={() => setDocCurrentFolderId(f.id)}>{f.name}</span>
                <span className="list-meta">{documents.filter(d => d.folderId === f.id).length} Dokumente</span>
                {!readOnly && <button type="button" className="danger-button" style={{ padding: '3px 8px', fontSize: '0.78rem' }} onClick={() => deleteDocFolder(f.id)}>✕</button>}
              </div>
            ))}
          </div>
        )}
        {siteDocuments.length === 0 ? (
          <p className="empty-hint">{showDocArchive ? 'Keine archivierten Dokumente.' : 'Noch keine Dokumente in diesem Ordner.'}</p>
        ) : (
          <table>
            <thead><tr><th>Titel</th><th>Quelle</th><th>Größe</th><th>Erstellt</th><th>Aktionen</th></tr></thead>
            <tbody>
              {siteDocuments.map(d => (
                <tr key={d.id}>
                  <td>
                    {renamingDocId === d.id ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input value={renamingDocTitle} onChange={e => setRenamingDocTitle(e.target.value)} style={{ maxWidth: '200px' }} autoFocus />
                        <button type="button" className="primary-button" style={{ padding: '3px 8px', fontSize: '0.78rem' }} onClick={() => saveDocumentRename(d.id)}>✓</button>
                        <button type="button" className="secondary-button" style={{ padding: '3px 8px', fontSize: '0.78rem' }} onClick={() => setRenamingDocId(null)}>✕</button>
                      </div>
                    ) : d.title}
                  </td>
                  <td><span className="status-badge">{d.isUploaded ? '📤 Hochgeladen' : d.pdfDesignName ?? 'PDF-Design'}</span></td>
                  <td style={{ fontSize: '0.85rem' }}>{formatFileSize(d.sizeBytes)}</td>
                  <td>{new Date(d.createdAtUtc).toLocaleDateString('de-DE')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button type="button" className="secondary-button" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => openOrDownloadDocument(d, 'view')}>👁 Öffnen</button>
                      <button type="button" className="secondary-button" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => openOrDownloadDocument(d, 'download')}>⬇ Download</button>
                      {!readOnly && (
                        <>
                          <button type="button" className="secondary-button" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => { setRenamingDocId(d.id); setRenamingDocTitle(d.title) }}>✏️</button>
                          <select className="styled-select" value={d.folderId || 0} onChange={e => moveDocumentToFolder(d.id, Number(e.target.value))} style={{ padding: '4px 6px', fontSize: '0.8rem' }} title="In Ordner verschieben">
                            <option value={0}>📂 Hauptverzeichnis</option>
                            {allSiteFolders.map(f => <option key={f.id} value={f.id}>📁 {f.name}</option>)}
                          </select>
                          <button type="button" className="secondary-button" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => toggleArchiveDocument(d)}>{d.isArchived ? '↩ Dearchivieren' : '🗄 Archivieren'}</button>
                          <button type="button" className="danger-button" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => deleteDocumentEntry(d.id)}>✕</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
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
          <>
            <div className="mobile-nav-backdrop" onClick={() => setSidebarVisible(false)} />
            <Navigation
              items={navItems}
              currentPage={page}
              onPageChange={(p) => {
                setPage(p)
                if (p === 'audits') setAuditView('categories')
                if (p === 'datenablage') setDatenablageView('categories')
                if (typeof window !== 'undefined' && window.innerWidth <= 768) setSidebarVisible(false)
              }}
            />
          </>
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
              <div className="dashboard-quick" style={{marginTop:'24px'}}>
                <h4 style={{marginBottom:'12px',color:'var(--muted)',fontSize:'0.85rem',textTransform:'uppercase',letterSpacing:'0.08em'}}>Schnellzugriff</h4>
                <div className="card-grid">
                  <button type="button" className="card-item" onClick={()=>setPage('audits')}>
                    <span className="card-icon">📋</span>
                    <span className="card-name">Audits</span>
                    <span className="card-count">Audit erfassen oder fortsetzen</span>
                  </button>
                  <button type="button" className="card-item" onClick={()=>setPage('datenablage')}>
                    <span className="card-icon">💾</span>
                    <span className="card-name">Datenablage</span>
                    <span className="card-count">Aufgenommene Daten einsehen</span>
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {page === 'audits' ? (
            <section className="panel">
              {auditView === 'categories' && (
                <>
                  <div className="page-header">
                    <h3>Audits</h3>
                    <div className="page-header-actions">
                      <button type="button" className={`view-toggle${viewMode==='list'?' active':''}`} onClick={()=>{setViewMode('list');localStorage.setItem('audit-view-mode','list')}} title="Listenansicht">☰</button>
                      <button type="button" className={`view-toggle${viewMode==='card'?' active':''}`} onClick={()=>{setViewMode('card');localStorage.setItem('audit-view-mode','card')}} title="Kachelansicht">⊞</button>
                    </div>
                  </div>
                  {viewMode==='card' ? (
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
                  ) : (
                    <div className="list-view">
                      {[...categories].sort((a,b)=>a.name.localeCompare(b.name)).map(cat=>(
                        <button key={cat.id} type="button" className="list-item" onClick={()=>{setAuditSelectedCategory(cat);setAuditView('standorte')}}>
                          <span className="list-icon">📁</span>
                          <span className="list-name">{cat.name}</span>
                          <span className="list-meta">{sites.filter(s=>s.categoryId===cat.id).length} Standorte</span>
                          <span className="list-arrow">›</span>
                        </button>
                      ))}
                      {categories.length===0&&<p className="empty-hint">Keine Kategorien. Bitte unter Einstellungen anlegen.</p>}
                    </div>
                  )}
                </>
              )}
              {auditView === 'standorte' && auditSelectedCategory && (
                <>
                  <div className="page-header">
                    <button type="button" className="back-btn" onClick={()=>setAuditView('categories')}>← Zurück</button>
                    <div><h3>{auditSelectedCategory.name}</h3><p className="page-subtitle">Standort wählen</p></div>
                    <div className="page-header-actions">
                      <button type="button" className={`view-toggle${viewMode==='list'?' active':''}`} onClick={()=>{setViewMode('list');localStorage.setItem('audit-view-mode','list')}}>☰</button>
                      <button type="button" className={`view-toggle${viewMode==='card'?' active':''}`} onClick={()=>{setViewMode('card');localStorage.setItem('audit-view-mode','card')}}>⊞</button>
                    </div>
                  </div>
                  {viewMode==='card' ? (
                    <div className="card-grid">
                      {[...sites].filter(s=>s.categoryId===auditSelectedCategory.id).sort((a,b)=>a.name.localeCompare(b.name)).map(site=>(
                        <button key={site.id} type="button" className="card-item" onClick={()=>{setAuditSelectedSite(site);setAuditSelectedTemplate(null);setAuditView('standort');setAuditTab('raume')}}>
                          <span className="card-icon">🏢</span>
                          <span className="card-name">{site.name}</span>
                          <span className="card-count">{site.address||'Keine Adresse'}</span>
                        </button>
                      ))}
                      {sites.filter(s=>s.categoryId===auditSelectedCategory.id).length===0&&<p className="empty-hint">Keine Standorte.</p>}
                    </div>
                  ) : (
                    <div className="list-view">
                      {[...sites].filter(s=>s.categoryId===auditSelectedCategory.id).sort((a,b)=>a.name.localeCompare(b.name)).map(site=>(
                        <button key={site.id} type="button" className="list-item" onClick={()=>{setAuditSelectedSite(site);setAuditSelectedTemplate(null);setAuditView('standort');setAuditTab('raume')}}>
                          <span className="list-icon">🏢</span>
                          <span className="list-name">{site.name}</span>
                          <span className="list-meta">{site.address||'-'}</span>
                          <span className="list-arrow">›</span>
                        </button>
                      ))}
                      {sites.filter(s=>s.categoryId===auditSelectedCategory.id).length===0&&<p className="empty-hint">Keine Standorte.</p>}
                    </div>
                  )}
                </>
              )}
              {auditView === 'standort' && auditSelectedSite && (
                <>
                  <div className="page-header">
                    <button type="button" className="back-btn" onClick={()=>setAuditView('standorte')}>← Zurück</button>
                    <div>
                      <h3>{auditSelectedSite.name}</h3>
                      <p className="page-subtitle">{auditSelectedSite.address}</p>
                    </div>
                    {auditSelectedTemplate && (
                      <div className="audit-template-badge">
                        <span>Vorlage: <strong>{auditSelectedTemplate.name}</strong></span>
                        <button type="button" className="tertiary-button" style={{padding:'2px 8px',fontSize:'0.8rem'}} onClick={()=>setAuditSelectedTemplate(null)}>✕ ändern</button>
                      </div>
                    )}
                  </div>
                  {!auditSelectedTemplate ? (
                    <div className="template-selector">
                      <h4 style={{marginBottom:'12px'}}>Audit-Vorlage wählen</h4>
                      <div className="list-view">
                        {templates.map(t=>(
                          <button key={t.id} type="button" className="list-item" onClick={()=>setAuditSelectedTemplate(t)}>
                            <span className="list-icon">📋</span>
                            <span className="list-name">{t.name}</span>
                            <span className="list-meta">{t.description||`${t.fields.length} Felder`}</span>
                            <span className="list-arrow">›</span>
                          </button>
                        ))}
                        {templates.length===0&&<p className="empty-hint">Keine Vorlagen. Bitte unter Einstellungen → Audit-Vorlagen anlegen.</p>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="tab-bar">
                        {(['raume','grunddaten','checklisten','dokumente'] as const).map(tab=>(
                          <button key={tab} type="button" className={`tab-btn${auditTab===tab?' active':''}`} onClick={()=>setAuditTab(tab)}>
                            {tab==='raume'?'🏠 Räume/Objekte':tab==='grunddaten'?'📋 Grunddaten':tab==='checklisten'?'✅ Checklisten':'📄 Dokumente'}
                          </button>
                        ))}
                      </div>
                      {auditTab==='raume'&&(
                        <div className="tab-content">
                          {/* Raumformular mit Template-Feldern */}
                          <div className="form-card">
                            <h4>{editingRoomId ? '✏️ Raum bearbeiten' : 'Neuen Raum anlegen'}</h4>
                            {(() => {
                              const trimmedRoomName = roomForm.name.trim()
                              const siblingRoomNames = rooms
                                .filter(r=>r.siteId===auditSelectedSite.id && r.auditId===0 && r.id!==editingRoomId)
                                .map(r=>r.name.trim().toLowerCase())
                              const roomNameIsDuplicate = trimmedRoomName !== '' && siblingRoomNames.includes(trimmedRoomName.toLowerCase())
                              const roomNameStatusClass = trimmedRoomName === '' ? 'field-required-missing' : roomNameIsDuplicate ? 'field-required-duplicate' : 'field-required-ok'
                              return (
                                <div className="form-grid">
                                  <label className={`full-width ${roomNameStatusClass}`}>Raumname
                                    <input value={roomForm.name} onChange={e=>setRoomForm(p=>({...p,name:e.target.value,siteId:String(auditSelectedSite.id)}))} placeholder="z.B. Klassenraum 1.01" required />
                                    {roomNameIsDuplicate && <span className="field-hint-warning">⚠️ Ein Raum mit diesem Namen existiert bereits für diesen Standort.</span>}
                                  </label>
                                </div>
                              )
                            })()}
                            {/* Template-Felder */}
                            {auditSelectedTemplate.fields.length > 0 && (
                              <div style={{marginTop:'16px'}}>
                                <p style={{fontSize:'0.85rem',color:'var(--muted)',marginBottom:'12px',fontWeight:500}}>Datenfelder aus Vorlage „{auditSelectedTemplate.name}":</p>
                                <div className="form-grid">
                                  {auditSelectedTemplate.fields.map(field=>{
                                    const val = roomFieldValues[field.name] || ''
                                    const { baseType, options, scope, defaultValue } = parseTemplateFieldType(field.type)
                                    if (scope !== 'room') {
                                      return null
                                    }

                                    if (baseType === 'image') {
                                      return renderImageUploadField(
                                        String(field.id),
                                        field.name,
                                        field.relevantForProgress,
                                        val,
                                        updater => setRoomFieldValues(previous => ({ ...previous, [field.name]: updater(previous[field.name] ?? '') }))
                                      )
                                    }
                                    if (baseType === 'dropdown' && options.length > 0) {
                                      const effectiveVal = val || defaultValue
                                      return (
                                        <label key={field.id} className={fieldStatusClass(field.relevantForProgress, effectiveVal !== '')}>{field.name}
                                          <select value={effectiveVal} onChange={e=>setRoomFieldValues(p=>({...p,[field.name]:e.target.value}))}>
                                            <option value="">-- wählen --</option>
                                            {options.map(opt=><option key={opt} value={opt}>{opt}</option>)}
                                          </select>
                                        </label>
                                      )
                                    }
                                    if (baseType === 'checkbox') {
                                      return (
                                        <label key={field.id} className={fieldStatusClass(field.relevantForProgress, val==='true')} style={{flexDirection:'row',alignItems:'center',gap:'8px',cursor:'pointer'}}>
                                          <input type="checkbox" checked={val==='true'} onChange={e=>setRoomFieldValues(p=>({...p,[field.name]:e.target.checked?'true':'false'}))} />
                                          {field.name}
                                        </label>
                                      )
                                    }
                                    if (baseType === 'textarea') {
                                      return (
                                        <label key={field.id} className={`full-width ${fieldStatusClass(field.relevantForProgress, val.trim()!=='')}`}>{field.name}
                                          <textarea rows={3} value={val} onChange={e=>setRoomFieldValues(p=>({...p,[field.name]:e.target.value}))} style={{resize:'vertical'}} />
                                        </label>
                                      )
                                    }
                                    return (
                                      <label key={field.id} className={fieldStatusClass(field.relevantForProgress, val.trim()!=='')}>{field.name}
                                        <input type={baseType==='number'?'number':'text'} value={val} onChange={e=>setRoomFieldValues(p=>({...p,[field.name]:e.target.value}))} />
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            <div style={{display:'flex',gap:'8px',marginTop:'16px'}}>
                              <button type="button" className="primary-button" onClick={async()=>{
                                if(!session||!roomForm.name.trim())return
                                const effectiveFieldValues = { ...roomFieldValues }
                                auditSelectedTemplate.fields.forEach(f=>{
                                  const { baseType, scope, defaultValue } = parseTemplateFieldType(f.type)
                                  if (scope==='room' && baseType==='dropdown' && !effectiveFieldValues[f.name] && defaultValue) {
                                    effectiveFieldValues[f.name] = defaultValue
                                  }
                                })
                                const fieldsJson=JSON.stringify(effectiveFieldValues)
                                const body={siteId:auditSelectedSite.id,name:roomForm.name,description:'',capacity:'',area:'',notes:'',fieldsJson}
                                if(editingRoomId){
                                  const res=await apiRequest<Room>(`/api/rooms/${editingRoomId}`,session,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
                                  setRooms(p=>p.map(r=>r.id===res.id?res:r))
                                } else {
                                  const res=await apiRequest<Room>('/api/rooms',session,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
                                  setRooms(p=>[...p,res])
                                }
                                setRoomForm({siteId:String(auditSelectedSite.id),name:'',description:'',capacity:'',area:'',notes:''})
                                setRoomFieldValues({});setEditingRoomId(null)
                                void refreshCoreData()
                              }}>{editingRoomId?'Änderungen speichern':'Raum speichern'}</button>
                              {editingRoomId&&<button type="button" className="secondary-button" onClick={()=>{setEditingRoomId(null);setRoomForm({siteId:'1',name:'',description:'',capacity:'',area:'',notes:''});setRoomFieldValues({})}}>Abbrechen</button>}
                            </div>
                          </div>

                          {/* Raumliste als Tabelle */}
                          {rooms.filter(r=>r.siteId===auditSelectedSite.id&&r.auditId===0).length===0
                            ? <p className="empty-hint" style={{marginTop:'16px'}}>Noch keine Räume für diesen Standort.</p>
                            : (() => {
                                const roomFields = auditSelectedTemplate.fields.filter(f=>{
                                  const {scope} = parseTemplateFieldType(f.type)
                                  return scope === 'room'
                                })
                                const imgFields = roomFields.filter(f=>{
                                  const {baseType} = parseTemplateFieldType(f.type)
                                  return baseType === 'image'
                                })
                                const textFields = roomFields.filter(f=>{
                                  const {baseType} = parseTemplateFieldType(f.type)
                                  return baseType !== 'image'
                                })
                                const hasImages = imgFields.length > 0
                                return (
                                  <div className="table-wrapper" style={{marginTop:'16px'}}>
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Raumname</th>
                                          {textFields.slice(0,3).map(f=><th key={f.id}>{f.name}</th>)}
                                          {hasImages && <th>Bilder</th>}
                                          <th>Aktionen</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {rooms.filter(r=>r.siteId===auditSelectedSite.id&&r.auditId===0).map(r=>{
                                          const fieldMap = parseStringMap(r.fieldsJson)
                                          const imgUrls = imgFields.length > 0 ? (fieldMap[imgFields[0].name] ?? '').split('||').filter(Boolean) : []
                                          return (
                                            <tr key={r.id} className={editingRoomId===r.id ? 'row-editing' : undefined}>
                                              <td><strong>{r.name}</strong></td>
                                              {textFields.slice(0,3).map(f=>{
                                                const {baseType} = parseTemplateFieldType(f.type)
                                                const val = fieldMap[f.name] ?? ''
                                                return <td key={f.id} style={{fontSize:'0.88rem'}}>{baseType==='checkbox'?(val==='true'?'✓':'✗'):renderTruncatable(`${r.name} — ${f.name}`, val)}</td>
                                              })}
                                              {hasImages && (
                                                <td>
                                                  {imgUrls.length > 0
                                                    ? <button type="button" className="secondary-button" style={{padding:'3px 8px',fontSize:'0.8rem'}} onClick={()=>openGallery(imgUrls,0)}>🖼 {imgUrls.length} Bild{imgUrls.length!==1?'er':''}</button>
                                                    : <em style={{color:'var(--muted)',fontSize:'0.8rem'}}>—</em>
                                                  }
                                                </td>
                                              )}
                                              <td>
                                                <div style={{display:'flex',gap:'6px'}}>
                                                  <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.8rem'}} onClick={()=>{
                                                    setEditingRoomId(r.id)
                                                    setRoomForm({siteId:String(r.siteId),name:r.name,description:r.description,capacity:r.capacity,area:r.area,notes:r.notes})
                                                    setRoomFieldValues(parseStringMap(r.fieldsJson))
                                                    window.scrollTo({top:0,behavior:'smooth'})
                                                  }}>✏️</button>
                                                  <button type="button" className="danger-button" style={{padding:'4px 8px',fontSize:'0.8rem'}} onClick={()=>{
                                                    if(!session)return
                                                    askConfirm(`Raum "${r.name}" wirklich löschen?`, async()=>{
                                                      await apiRequest(`/api/rooms/${r.id}`,session,{method:'DELETE'})
                                                      setRooms(p=>p.filter(x=>x.id!==r.id))
                                                      void refreshCoreData()
                                                    })
                                                  }}>✕</button>
                                                </div>
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )
                              })()
                          }
                        </div>
                      )}
                      {auditTab==='grunddaten'&&(
                        <div className="tab-content">
                          {/* Feststehende Standort-Grundinfos */}
                          <div className="info-grid">
                            <div className="info-row"><span>Name</span><strong>{auditSelectedSite.name}</strong></div>
                            <div className="info-row"><span>Adresse</span><strong>{auditSelectedSite.address||'-'}</strong></div>
                            <div className="info-row"><span>Telefon</span><strong>{auditSelectedSite.phone||'-'}</strong></div>
                            <div className="info-row"><span>Hausmeister</span><strong>{auditSelectedSite.caretakerPhone||'-'}</strong></div>
                            <div className="info-row"><span>Räume gesamt</span><strong>{rooms.filter(r=>r.siteId===auditSelectedSite.id&&r.auditId===0).length}</strong></div>
                            <div className="info-row"><span>Audit-Vorlage</span><strong>{auditSelectedTemplate.name}</strong></div>
                          </div>
                          {/* Vorlage-Grunddatenfelder (scope:site) */}
                          {auditSelectedTemplate.fields.filter(f=>parseTemplateFieldType(f.type).scope==='site').length > 0 && (
                            <div className="ground-data-card">
                              <h4 style={{margin:'0 0 14px',fontSize:'0.9rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600}}>Grunddaten-Felder aus Vorlage „{auditSelectedTemplate.name}"</h4>
                              <div className="form-grid">
                                {auditSelectedTemplate.fields.filter(f=>parseTemplateFieldType(f.type).scope==='site').map(field=>{
                                  const {baseType, options, defaultValue} = parseTemplateFieldType(field.type)
                                  const val = siteGroundDataValues[field.name] ?? ''
                                  if (baseType === 'image') {
                                    return renderImageUploadField(
                                      String(field.id),
                                      field.name,
                                      field.relevantForProgress,
                                      val,
                                      updater => setSiteGroundDataValues(previous => ({ ...previous, [field.name]: updater(previous[field.name] ?? '') }))
                                    )
                                  }
                                  if (baseType === 'dropdown' && options.length > 0) {
                                    const effectiveVal = val || defaultValue
                                    return (
                                      <label key={field.id} className={fieldStatusClass(field.relevantForProgress, effectiveVal !== '')}>{field.name}
                                        <select value={effectiveVal} onChange={e=>setSiteGroundDataValues(p=>({...p,[field.name]:e.target.value}))}>
                                          <option value="">-- wählen --</option>
                                          {options.map(opt=><option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                      </label>
                                    )
                                  }
                                  if (baseType === 'checkbox') {
                                    return (
                                      <label key={field.id} className={fieldStatusClass(field.relevantForProgress, val==='true')} style={{flexDirection:'row',alignItems:'center',gap:'8px',cursor:'pointer'}}>
                                        <input type="checkbox" checked={val==='true'} onChange={e=>setSiteGroundDataValues(p=>({...p,[field.name]:e.target.checked?'true':'false'}))} />
                                        {field.name}
                                      </label>
                                    )
                                  }
                                  if (baseType === 'textarea') {
                                    return (
                                      <label key={field.id} className={`full-width ${fieldStatusClass(field.relevantForProgress, val.trim()!=='')}`}>{field.name}
                                        <textarea rows={3} value={val} onChange={e=>setSiteGroundDataValues(p=>({...p,[field.name]:e.target.value}))} style={{resize:'vertical'}} />
                                      </label>
                                    )
                                  }
                                  return (
                                    <label key={field.id} className={fieldStatusClass(field.relevantForProgress, val.trim()!=='')}>{field.name}
                                      <input type={baseType==='number'?'number':'text'} value={val} onChange={e=>setSiteGroundDataValues(p=>({...p,[field.name]:e.target.value}))} />
                                    </label>
                                  )
                                })}
                              </div>
                              <button type="button" className="primary-button" style={{marginTop:'16px'}} onClick={async()=>{
                                if(!session)return
                                try{
                                  const effectiveGroundData = { ...siteGroundDataValues }
                                  auditSelectedTemplate.fields.forEach(f=>{
                                    const { baseType, scope, defaultValue } = parseTemplateFieldType(f.type)
                                    if (scope==='site' && baseType==='dropdown' && !effectiveGroundData[f.name] && defaultValue) {
                                      effectiveGroundData[f.name] = defaultValue
                                    }
                                  })
                                  const updated = await apiRequest<Site>(`/api/standorte/${auditSelectedSite.id}/grounddata`,session,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({groundDataJson:JSON.stringify(effectiveGroundData)})})
                                  setSites(p=>p.map(s=>s.id===updated.id?updated:s))
                                  setAuditSelectedSite(updated)
                                  void refreshCoreData()
                                }catch(err){
                                  setError(err instanceof Error?err.message:'Grunddaten konnten nicht gespeichert werden.')
                                }
                              }}>💾 Grunddaten speichern</button>
                            </div>
                          )}
                        </div>
                      )}
                      {auditTab==='checklisten'&&(
                        <div className="tab-content">
                          {renderChecklistsSection(activeChecklistTemplates, rooms.filter(r => r.siteId === auditSelectedSite.id && r.auditId === 0), false)}
                        </div>
                      )}
                      {auditTab==='dokumente'&&(() => {
                        const eligibleDesignsForNew = pdfDesigns.filter(d=>getDesignTemplateIds(d).includes(auditSelectedTemplate.id))
                        return (
                        <div className="tab-content">
                          <form className="form-card" onSubmit={createAuditAndGenerateDocument}>
                            <h4>Neues Audit erfassen &amp; PDF erzeugen</h4>
                            <p style={{color:'var(--muted)',fontSize:'0.88rem',marginBottom:'12px'}}>Vorlage: <strong>{auditSelectedTemplate.name}</strong> — beim Anlegen werden die aktuellen Räume/Grunddaten des Standorts als unveränderlicher Stand dieses Audits gesichert und direkt als PDF-Dokument erzeugt.</p>
                            {eligibleDesignsForNew.length===0 ? (
                              <p className="empty-hint">Kein PDF-Design ist der Vorlage „{auditSelectedTemplate.name}" zugewiesen. Bitte im PDF-Designer zuweisen, bevor ein Audit angelegt werden kann.</p>
                            ) : (
                              <>
                                <div className="form-grid">
                                  <label>Titel / Bezeichnung des Audits<input value={auditForm.title} onChange={e=>setAuditForm(p=>({...p,title:e.target.value,siteId:String(auditSelectedSite.id),templateId:String(auditSelectedTemplate.id)}))} required /></label>
                                  <label>PDF-Design<select value={newAuditPdfDesignId} onChange={e=>{
                                    const id=e.target.value
                                    setNewAuditPdfDesignId(id)
                                    const design=eligibleDesignsForNew.find(d=>String(d.id)===id)
                                    if(design && auditForm.title) setNewAuditDocTitle(`${design.name} – ${auditForm.title}`)
                                  }} required>
                                    <option value="">Design wählen...</option>
                                    {eligibleDesignsForNew.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select></label>
                                  <label>Titel des Dokuments<input value={newAuditDocTitle} onChange={e=>setNewAuditDocTitle(e.target.value)} placeholder="Dokumententitel (optional)" /></label>
                                </div>
                                <button type="submit" className="primary-button" disabled={docGenInProgress || !newAuditPdfDesignId}>{docGenInProgress ? '⏳ Wird erstellt...' : '📋 Audit anlegen & PDF erzeugen'}</button>
                              </>
                            )}
                          </form>
                          {audits.filter(a=>a.siteId===auditSelectedSite.id&&a.templateId===auditSelectedTemplate.id).length>0 && (
                            <table style={{marginTop:'16px'}}>
                              <thead><tr><th>Audit</th><th>Status</th><th>Erstellt</th><th>Aktionen</th></tr></thead>
                              <tbody>{audits.filter(a=>a.siteId===auditSelectedSite.id&&a.templateId===auditSelectedTemplate.id).map(audit=>{
                                const eligibleDesigns = pdfDesigns.filter(d=>getDesignTemplateIds(d).includes(auditSelectedTemplate.id))
                                return (
                                <Fragment key={audit.id}>
                                  <tr>
                                    <td>{audit.title}</td>
                                    <td><span className="status-badge">{audit.status}</span></td>
                                    <td>{new Date(audit.createdAtUtc).toLocaleDateString('de-DE')}</td>
                                    <td>
                                      <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                                        <button type="button" className="secondary-button" style={{padding:'4px 10px',fontSize:'0.82rem'}} onClick={()=>{
                                          if(docGenAuditId===audit.id){setDocGenAuditId(null);return}
                                          setDocGenAuditId(audit.id)
                                          setDocGenPdfDesignId('')
                                          setDocGenTitle('')
                                        }}>📄 Weiteres Dokument erzeugen</button>
                                        <button type="button" className="danger-button" style={{padding:'4px 10px',fontSize:'0.82rem'}} onClick={()=>deleteAuditEntry(audit)}>✕ Audit löschen</button>
                                      </div>
                                    </td>
                                  </tr>
                                  {docGenAuditId===audit.id && (
                                    <tr>
                                      <td colSpan={4}>
                                        <div className="form-card" style={{margin:'8px 0'}}>
                                          {eligibleDesigns.length===0 ? (
                                            <p className="empty-hint">Kein PDF-Design ist der Vorlage „{auditSelectedTemplate.name}" zugewiesen. Bitte im PDF-Designer zuweisen.</p>
                                          ) : (
                                            <>
                                              <div className="form-grid">
                                                <label>PDF-Design<select value={docGenPdfDesignId} onChange={e=>{
                                                  const id=e.target.value
                                                  setDocGenPdfDesignId(id)
                                                  const design=eligibleDesigns.find(d=>String(d.id)===id)
                                                  if(design) setDocGenTitle(`${design.name} – ${audit.title}`)
                                                }}>
                                                  <option value="">Design wählen...</option>
                                                  {eligibleDesigns.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select></label>
                                                <label>Titel des Dokuments<input value={docGenTitle} onChange={e=>setDocGenTitle(e.target.value)} placeholder="Dokumententitel" /></label>
                                              </div>
                                              <div style={{display:'flex',gap:'8px',marginTop:'12px',alignItems:'center'}}>
                                                <button type="button" className="primary-button" disabled={!docGenPdfDesignId||!docGenTitle.trim()||docGenInProgress} onClick={()=>generateDocument(audit.id)}>
                                                  {docGenInProgress ? '⏳ Wird erstellt...' : '✅ Erstellen'}
                                                </button>
                                                {docGenInProgress && <span className="progress-spinner" aria-label="Dokument wird erstellt" />}
                                                <button type="button" className="secondary-button" onClick={()=>setDocGenAuditId(null)}>Abbrechen</button>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              )})}</tbody>
                            </table>
                          )}
                          {audits.filter(a=>a.siteId===auditSelectedSite.id&&a.templateId===auditSelectedTemplate.id).length===0&&<p className="empty-hint">Noch kein Audit für diesen Standort mit dieser Vorlage.</p>}
                          {renderDocumentManager(auditSelectedSite.id, false)}
                        </div>
                      )})()}
                    </>
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
                  <div className="list-view">
                    {[...categories].sort((a,b)=>a.name.localeCompare(b.name)).map(cat=>(
                      <button key={cat.id} type="button" className="list-item" onClick={()=>{setDatenablageCategory(cat);setDatenablageView('standorte')}}>
                        <span className="list-icon">📁</span><span className="list-name">{cat.name}</span>
                        <span className="list-meta">{sites.filter(s=>s.categoryId===cat.id).length} Standorte</span>
                        <span className="list-arrow">›</span>
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
                  <div className="list-view">
                    {[...sites].filter(s=>s.categoryId===datenablageCategory.id).sort((a,b)=>a.name.localeCompare(b.name)).map(site=>(
                      <button key={site.id} type="button" className="list-item" onClick={()=>{setDatenablageSite(site);setDatenablageView('standort');setDatenablageTab('raume')}}>
                        <span className="list-icon">🏢</span><span className="list-name">{site.name}</span>
                        <span className="list-meta">{rooms.filter(r=>r.siteId===site.id&&r.auditId===0).length} Räume · {audits.filter(a=>a.siteId===site.id).length} Audits</span>
                        <span className="list-arrow">›</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {datenablageView==='standort'&&datenablageSite&&(
                <>
                  <div className="page-header">
                    <button type="button" className="back-btn" onClick={()=>setDatenablageView('standorte')}>← Zurück</button>
                    <div><h3>{datenablageSite.name}</h3><p className="page-subtitle">{datenablageSite.address}</p></div>
                    <button type="button" className="secondary-button" onClick={()=>goToAuditsSite(datenablageSite,datenablageTab)}>🛠 Zu Audits wechseln</button>
                  </div>
                  <div className="tab-bar">
                    {(['raume','grunddaten','checklisten','dokumente'] as const).map(tab=>(
                      <button key={tab} type="button" className={`tab-btn${datenablageTab===tab?' active':''}`} onClick={()=>setDatenablageTab(tab)}>
                        {tab==='raume'?'🏠 Räume/Objekte':tab==='grunddaten'?'📋 Grunddaten':tab==='checklisten'?'✅ Checklisten':'📄 Dokumente'}
                      </button>
                    ))}
                  </div>
                  {datenablageTab==='raume'&&(
                    <div className="tab-content">
                      {!datenablageSelectedRoomName ? (
                        <>
                          <div className="list-view">
                            {Array.from(new Set(rooms.filter(r=>r.siteId===datenablageSite!.id&&r.auditId===0).map(r=>r.name))).sort((a,b)=>a.localeCompare(b)).map(name=>{
                              const auditCount = new Set(rooms.filter(r=>r.siteId===datenablageSite!.id&&r.auditId>0&&r.name===name).map(r=>r.auditId)).size
                              return (
                                <button key={name} type="button" className="list-item" onClick={()=>setDatenablageSelectedRoomName(name)}>
                                  <span className="list-icon">🚪</span><span className="list-name">{name}</span>
                                  <span className="list-meta">{auditCount} Audit{auditCount!==1?'s':''}</span>
                                  <span className="list-arrow">›</span>
                                </button>
                              )
                            })}
                          </div>
                          {rooms.filter(r=>r.siteId===datenablageSite.id&&r.auditId===0).length===0&&<p className="empty-hint">Noch keine Räume.</p>}
                        </>
                      ) : (
                        <>
                          <div className="page-header">
                            <button type="button" className="back-btn" onClick={()=>setDatenablageSelectedRoomName(null)}>← Zurück</button>
                            <div><h3>🚪 {datenablageSelectedRoomName}</h3><p className="page-subtitle">Erfasste Daten aus allen Audits</p></div>
                            <button type="button" className="primary-button" onClick={()=>goToLiveRoomEdit(datenablageSite!, datenablageSelectedRoomName!)}>✏️ Im Audit bearbeiten</button>
                          </div>
                          {(() => {
                            const snapshotRooms = rooms.filter(r=>r.siteId===datenablageSite!.id&&r.auditId>0&&r.name===datenablageSelectedRoomName)
                              .sort((a,b)=>b.auditId-a.auditId)
                            if (snapshotRooms.length===0) return <p className="empty-hint">Dieser Raum wurde noch in keinem Audit erfasst.</p>
                            return snapshotRooms.map(r=>{
                              const audit = audits.find(a=>a.id===r.auditId)
                              const template = templates.find(t=>t.id===audit?.templateId)
                              const fieldTypeMap = new Map(template?.fields.map(f=>[f.name, parseTemplateFieldType(f.type).baseType]) ?? [])
                              const fieldMap = parseStringMap(r.fieldsJson)
                              const fieldEntries = Object.entries(fieldMap).filter(([,v])=>v)
                              return (
                                <div key={r.id} className="daten-raum" style={{marginBottom:'14px'}}>
                                  <div className="daten-raum-header">
                                    <span>📋</span><strong>{audit?.title ?? `Audit #${r.auditId}`}</strong>
                                    {audit && <span className="list-meta">{audit.templateName}</span>}
                                    {audit && <span className="list-meta">{new Date(audit.createdAtUtc).toLocaleDateString('de-DE')}</span>}
                                  </div>
                                  <div className="info-grid" style={{marginTop:'8px'}}>
                                    {fieldEntries.map(([k,v])=>{
                                      const baseType = fieldTypeMap.get(k)
                                      if (baseType==='image') {
                                        const imgs = v.split('||').filter(Boolean)
                                        return imgs.length>0 ? (
                                          <div key={k} className="info-row"><span>{k}</span>
                                            <button type="button" className="secondary-button" style={{padding:'3px 8px',fontSize:'0.8rem'}} onClick={()=>openGallery(imgs,0)}>🖼 {imgs.length} Bild{imgs.length!==1?'er':''}</button>
                                          </div>
                                        ) : null
                                      }
                                      return <div key={k} className="info-row"><span>{k}</span><strong>{baseType==='checkbox'?(v==='true'?'✓':'✗'):v}</strong></div>
                                    })}
                                    {fieldEntries.length===0 && <p className="empty-hint">Keine Daten erfasst.</p>}
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </>
                      )}
                    </div>
                  )}
                  {datenablageTab==='grunddaten'&&(
                    <div className="tab-content">
                      <div className="info-grid">
                        <div className="info-row"><span>Name</span><strong>{datenablageSite.name}</strong></div>
                        <div className="info-row"><span>Adresse</span><strong>{datenablageSite.address||'-'}</strong></div>
                        <div className="info-row"><span>Telefon</span><strong>{datenablageSite.phone||'-'}</strong></div>
                        <div className="info-row"><span>Hausmeister</span><strong>{datenablageSite.caretakerPhone||'-'}</strong></div>
                        <div className="info-row"><span>Räume</span><strong>{rooms.filter(r=>r.siteId===datenablageSite.id&&r.auditId===0).length}</strong></div>
                        <div className="info-row"><span>Audits</span><strong>{audits.filter(a=>a.siteId===datenablageSite.id).length}</strong></div>
                      </div>
                      {(() => {
                        const groundData = parseStringMap(datenablageSite.groundDataJson)
                        const keys = Object.keys(groundData).filter(k=>groundData[k])
                        if (keys.length === 0) return null
                        return (
                          <div className="ground-data-card">
                            <h4 style={{margin:'0 0 12px',fontSize:'0.9rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600}}>Aktuelle Grunddaten (live)</h4>
                            <div className="info-grid">
                              {keys.map(key=>(
                                <div key={key} className="info-row"><span>{key}</span><strong>{groundData[key]}</strong></div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                      {/* Pro Audit: der zum Zeitpunkt des Audits eingefrorene Stand der Grunddaten-Felder */}
                      {audits.filter(a=>a.siteId===datenablageSite.id).sort((a,b)=>b.id-a.id).map(audit=>{
                        const template = templates.find(t=>t.id===audit.templateId)
                        const fieldTypeMap = new Map(template?.fields.map(f=>[f.name, parseTemplateFieldType(f.type).baseType]) ?? [])
                        const groundDataSnapshot = parseStringMap(audit.groundDataJson)
                        const entries = Object.entries(groundDataSnapshot).filter(([,v])=>v)
                        if (entries.length===0) return null
                        return (
                          <div key={audit.id} className="ground-data-card" style={{marginTop:'12px'}}>
                            <h4 style={{margin:'0 0 12px',fontSize:'0.9rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600}}>{audit.title} · {new Date(audit.createdAtUtc).toLocaleDateString('de-DE')}</h4>
                            <div className="info-grid">
                              {entries.map(([k,v])=>{
                                const baseType = fieldTypeMap.get(k)
                                if (baseType==='image') {
                                  const imgs = v.split('||').filter(Boolean)
                                  return imgs.length>0 ? (
                                    <div key={k} className="info-row"><span>{k}</span>
                                      <button type="button" className="secondary-button" style={{padding:'3px 8px',fontSize:'0.8rem'}} onClick={()=>openGallery(imgs,0)}>🖼 {imgs.length} Bild{imgs.length!==1?'er':''}</button>
                                    </div>
                                  ) : null
                                }
                                return <div key={k} className="info-row"><span>{k}</span><strong>{baseType==='checkbox'?(v==='true'?'✓':'✗'):v}</strong></div>
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {datenablageTab==='checklisten'&&(
                    <div className="tab-content">
                      {!datenablageChecklistTemplate ? (
                        <div className="template-selector">
                          <h4 style={{marginBottom:'12px'}}>Audit-Vorlage wählen</h4>
                          <p style={{color:'var(--muted)',fontSize:'0.88rem',marginBottom:'12px'}}>Checklisten sind einer Audit-Vorlage zugeordnet. Bitte zunächst die Vorlage wählen, deren Checklisten angezeigt werden sollen.</p>
                          <div className="list-view">
                            {templates.map(t=>(
                              <button key={t.id} type="button" className="list-item" onClick={()=>setDatenablageChecklistTemplate(t)}>
                                <span className="list-icon">📋</span>
                                <span className="list-name">{t.name}</span>
                                <span className="list-meta">{t.description||`${t.fields.length} Felder`}</span>
                                <span className="list-arrow">›</span>
                              </button>
                            ))}
                            {templates.length===0&&<p className="empty-hint">Keine Vorlagen. Bitte unter Einstellungen → Audit-Vorlagen anlegen.</p>}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="audit-template-badge" style={{marginBottom:'16px'}}>
                            <span>Vorlage: <strong>{datenablageChecklistTemplate.name}</strong></span>
                            <button type="button" className="tertiary-button" style={{padding:'2px 8px',fontSize:'0.8rem'}} onClick={()=>setDatenablageChecklistTemplate(null)}>✕ ändern</button>
                          </div>
                          {renderChecklistsSection(datenablageChecklists, rooms.filter(r=>r.siteId===datenablageSite.id&&r.auditId===0), true)}
                        </>
                      )}
                    </div>
                  )}
                  {datenablageTab==='dokumente'&&(
                    <div className="tab-content">
                      <p style={{color:'var(--muted)',fontSize:'0.85rem',marginBottom:'8px'}}>Nur Ansicht. Dokumente werden auf der Audits-Seite im Tab „Dokumente" erstellt und verwaltet.</p>
                      {renderDocumentManager(datenablageSite.id, true)}
                    </div>
                  )}
                </>
              )}
            </section>
          ) : null}


          {page==='einstellungen-kategorien'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Standort-Kategorien</h3></div>
              {editingCategory ? (
                <form className="form-card" onSubmit={async e=>{e.preventDefault();if(!session)return;const res=await apiRequest<Category>(`/api/categories/${editingCategory.id}`,session,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:editingCategory.name,description:editingCategory.description})});setCategories(p=>p.map(c=>c.id===res.id?res:c));setEditingCategory(null)}}>
                  <h4>Kategorie bearbeiten</h4>
                  <div className="form-grid">
                    <label>Name<input value={editingCategory.name} onChange={e=>setEditingCategory(p=>p?{...p,name:e.target.value}:p)} required /></label>
                    <label>Beschreibung<input value={editingCategory.description} onChange={e=>setEditingCategory(p=>p?{...p,description:e.target.value}:p)} /></label>
                  </div>
                  <p style={{color:'var(--muted)',fontSize:'0.82rem',marginTop:'8px'}}>⚠️ Umbenennung wird automatisch auf alle zugeordneten Standorte übernommen.</p>
                  <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
                    <button type="submit" className="primary-button">Speichern</button>
                    <button type="button" className="secondary-button" onClick={()=>setEditingCategory(null)}>Abbrechen</button>
                  </div>
                </form>
              ) : (
                <form className="form-card" onSubmit={createCategory}>
                  <h4>Neue Kategorie anlegen</h4>
                  <div className="form-grid">
                    <label>Name<input value={categoryForm.name} onChange={e=>setCategoryForm(p=>({...p,name:e.target.value}))} placeholder="z.B. Grundschulen" required /></label>
                    <label>Beschreibung<input value={categoryForm.description} onChange={e=>setCategoryForm(p=>({...p,description:e.target.value}))} placeholder="Kurze Beschreibung" /></label>
                  </div>
                  <button type="submit" className="primary-button">Kategorie speichern</button>
                </form>
              )}
              <div style={{marginTop:'24px'}}>
                <h4 style={{marginBottom:'12px',color:'var(--muted)',fontSize:'0.85rem',textTransform:'uppercase',letterSpacing:'0.08em'}}>Vorhandene Kategorien ({categories.length})</h4>
                {categories.length===0?<p className="empty-hint">Noch keine Kategorien.</p>:(
                  <table><thead><tr><th>Name</th><th>Beschreibung</th><th>Standorte</th><th>Aktionen</th></tr></thead>
                    <tbody>{[...categories].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>(
                      <tr key={c.id}>
                        <td>{c.name}</td><td>{c.description||'-'}</td>
                        <td><span className="status-badge">{sites.filter(s=>s.categoryId===c.id).length} Standorte</span></td>
                        <td><div style={{display:'flex',gap:'6px'}}>
                          <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={()=>setEditingCategory(c)}>✏️ Bearbeiten</button>
                          <button type="button" className="danger-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={async()=>{if(!session)return;if(sites.filter(s=>s.categoryId===c.id).length>0){alert(`Kategorie hat noch ${sites.filter(s=>s.categoryId===c.id).length} Standorte. Bitte zuerst die Standorte umziehen.`);return}if(!confirm(`Kategorie "${c.name}" löschen?`))return;await apiRequest(`/api/categories/${c.id}`,session,{method:'DELETE'});setCategories(p=>p.filter(x=>x.id!==c.id))}}>✕ Löschen</button>
                        </div></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </section>
          ):null}

          {page==='einstellungen-standorte'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Standorte</h3></div>
              {editingSite ? (
                <form className="form-card" onSubmit={async e=>{e.preventDefault();if(!session)return;const res=await apiRequest<Site>(`/api/standorte/${editingSite.id}`,session,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({categoryId:editingSite.categoryId,name:editingSite.name,address:editingSite.address,phone:editingSite.phone,caretakerPhone:editingSite.caretakerPhone})});setSites(p=>p.map(s=>s.id===res.id?res:s));setEditingSite(null)}}>
                  <h4>Standort bearbeiten</h4>
                  <div className="form-grid">
                    <label>Kategorie<select value={editingSite.categoryId} onChange={e=>setEditingSite(p=>p?{...p,categoryId:parseInt(e.target.value)}:p)}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                    <label>Name<input value={editingSite.name} onChange={e=>setEditingSite(p=>p?{...p,name:e.target.value}:p)} required /></label>
                    <label>Adresse<input value={editingSite.address} onChange={e=>setEditingSite(p=>p?{...p,address:e.target.value}:p)} /></label>
                    <label>Telefon<input value={editingSite.phone} onChange={e=>setEditingSite(p=>p?{...p,phone:e.target.value}:p)} /></label>
                    <label>Hausmeister Telefon<input value={editingSite.caretakerPhone} onChange={e=>setEditingSite(p=>p?{...p,caretakerPhone:e.target.value}:p)} /></label>
                  </div>
                  <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
                    <button type="submit" className="primary-button">Speichern</button>
                    <button type="button" className="secondary-button" onClick={()=>setEditingSite(null)}>Abbrechen</button>
                  </div>
                </form>
              ) : (
                <form className="form-card" onSubmit={createSite}>
                  <h4>Neuen Standort anlegen</h4>
                  <div className="form-grid">
                    <label>Kategorie<select value={siteForm.categoryId} onChange={e=>setSiteForm(p=>({...p,categoryId:e.target.value}))}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                    <label>Name<input value={siteForm.name} onChange={e=>setSiteForm(p=>({...p,name:e.target.value}))} placeholder="Standortname" required /></label>
                    <label>Adresse<input value={siteForm.address} onChange={e=>setSiteForm(p=>({...p,address:e.target.value}))} placeholder="Straße, PLZ Ort" /></label>
                    <label>Telefon<input value={siteForm.phone} onChange={e=>setSiteForm(p=>({...p,phone:e.target.value}))} placeholder="+49 ..." /></label>
                    <label>Hausmeister Telefon<input value={siteForm.caretakerPhone} onChange={e=>setSiteForm(p=>({...p,caretakerPhone:e.target.value}))} placeholder="+49 ..." /></label>
                  </div>
                  <button type="submit" className="primary-button">Standort speichern</button>
                </form>
              )}
              <div style={{marginTop:'24px'}}>
                <h4 style={{marginBottom:'12px',color:'var(--muted)',fontSize:'0.85rem',textTransform:'uppercase',letterSpacing:'0.08em'}}>Vorhandene Standorte ({sites.length})</h4>
                {sites.length===0?<p className="empty-hint">Noch keine Standorte.</p>:(
                  <table><thead><tr><th>Name</th><th>Kategorie</th><th>Adresse</th><th>Audits</th><th>Aktionen</th></tr></thead>
                    <tbody>{[...sites].sort((a,b)=>a.name.localeCompare(b.name)).map(s=>(
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{categories.find(c=>c.id===s.categoryId)?.name??'-'}</td>
                        <td>{s.address||'-'}</td>
                        <td><span className="status-badge">{audits.filter(a=>a.siteId===s.id).length} Audits</span></td>
                        <td><div style={{display:'flex',gap:'6px'}}>
                          <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={()=>setEditingSite(s)}>✏️ Bearbeiten</button>
                          <button type="button" className="danger-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={async()=>{if(!session)return;if(audits.filter(a=>a.siteId===s.id).length>0){alert(`Standort hat noch ${audits.filter(a=>a.siteId===s.id).length} Audits.`);return}if(!confirm(`Standort "${s.name}" löschen?`))return;await apiRequest(`/api/standorte/${s.id}`,session,{method:'DELETE'});setSites(p=>p.filter(x=>x.id!==s.id))}}>✕ Löschen</button>
                        </div></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </section>
          ):null}

          {page==='einstellungen-vorlagen'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Audit-Vorlagen</h3></div>
              {editingTemplate ? (
                <div className="form-card">
                  <h4>Vorlage bearbeiten: {editingTemplate.name}</h4>
                  <div className="form-grid">
                    <label>Name<input value={editingTemplate.name} onChange={e=>setEditingTemplate(p=>p?{...p,name:e.target.value}:p)} /></label>
                    <label>Beschreibung<input value={editingTemplate.description} onChange={e=>setEditingTemplate(p=>p?{...p,description:e.target.value}:p)} /></label>
                  </div>
                  <div style={{marginTop:'16px'}}>
                    {renderTemplateFieldBuilderSection('room')}
                    {renderTemplateFieldBuilderSection('site')}
                  </div>
                  <div style={{display:'flex',gap:'8px',marginTop:'16px'}}>
                    <button type="button" className="primary-button" onClick={async()=>{
                      if(!session||!editingTemplate)return
                      if(!editingTemplate.name.trim()){
                        setError('Der Vorlagenname ist erforderlich.')
                        return
                      }
                      try {
                        const fields=templateFields
                          .filter(f=>f.name.trim())
                          .map((f,index)=>({name:f.name.trim(),type:encodeTemplateFieldType(f),order:index+1,relevantForProgress:f.required}))
                        const res=await apiRequest<Template>(`/api/templates/${editingTemplate.id}`,session,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:editingTemplate.name.trim(),description:editingTemplate.description.trim(),fields})})
                        setTemplates(p=>p.map(t=>t.id===res.id?res:t))
                        setEditingTemplate(null)
                        setTemplateFields(DEFAULT_TEMPLATE_FIELDS)
                        setError('')
                        setShowErrorBanner(false)
                      } catch (apiError) {
                        setError(apiError instanceof Error ? apiError.message : 'Vorlage konnte nicht gespeichert werden.')
                      }
                    }}>Speichern</button>
                    <button type="button" className="secondary-button" onClick={()=>{
                      setEditingTemplate(null)
                      setTemplateFields(DEFAULT_TEMPLATE_FIELDS)
                      setError('')
                      setShowErrorBanner(false)
                    }}>Abbrechen</button>
                  </div>
                </div>
              ) : (
                <form className="form-card" onSubmit={createTemplate}>
                  <h4>Neue Vorlage erstellen</h4>
                  <div className="form-grid">
                    <label>Vorlagenname<input value={templateForm.name} onChange={e=>setTemplateForm(p=>({...p,name:e.target.value}))} placeholder="z.B. Standard-Schulaudit" required /></label>
                    <label>Beschreibung<input value={templateForm.description} onChange={e=>setTemplateForm(p=>({...p,description:e.target.value}))} placeholder="Kurze Beschreibung" /></label>
                  </div>
                  <div style={{marginTop:'16px'}}>
                    {renderTemplateFieldBuilderSection('room')}
                    {renderTemplateFieldBuilderSection('site')}
                  </div>
                  <button type="submit" className="primary-button" style={{marginTop:'16px'}}>Vorlage speichern</button>
                </form>
              )}
              <div style={{marginTop:'24px'}}>
                <h4 style={{marginBottom:'12px',color:'var(--muted)',fontSize:'0.85rem',textTransform:'uppercase',letterSpacing:'0.08em'}}>Vorhandene Vorlagen ({templates.length})</h4>
                {templates.length===0?<p className="empty-hint">Noch keine Vorlagen.</p>:(
                  <table><thead><tr><th>Name</th><th>Beschreibung</th><th>Felder</th><th>Verwendungen</th><th>Aktionen</th></tr></thead>
                    <tbody>{templates.map(t=>(
                      <tr key={t.id}>
                        <td>{t.name}</td><td>{t.description||'-'}</td><td>{t.fields.length}</td>
                        <td><span className="status-badge">{audits.filter(a=>a.templateId===t.id).length} Audits</span></td>
                        <td><div style={{display:'flex',gap:'6px'}}>
                          <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={()=>{
                            setEditingTemplate(t)
                            setTemplateFields(t.fields.map((f,index)=>{
                              const parsed = parseTemplateFieldType(f.type)
                              return {
                                name: f.name,
                                type: parsed.baseType,
                                order: f.order ?? index + 1,
                                required: f.relevantForProgress,
                                dropdownOptions: parsed.optionsText,
                                defaultValue: parsed.defaultValue,
                                scope: parsed.scope
                              }
                            }))
                          }}>✏️ Bearbeiten</button>
                          <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={async()=>{
                            if(!session)return
                            try {
                              const res=await apiRequest<Template>('/api/templates',session,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`${t.name} (Kopie)`,description:t.description,fields:t.fields.map(f=>({name:f.name,type:f.type,order:f.order,relevantForProgress:f.relevantForProgress}))})})
                              setTemplates(p=>[...p,res])
                            } catch { setError('Vorlage konnte nicht dupliziert werden.') }
                          }}>⧉ Duplizieren</button>
                          <button type="button" className="danger-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={async()=>{if(!session)return;const cnt=audits.filter(a=>a.templateId===t.id).length;if(cnt>0){alert(`Vorlage wird in ${cnt} Audits verwendet und kann nicht gelöscht werden.`);return}if(!confirm(`Vorlage "${t.name}" löschen?`))return;await apiRequest(`/api/templates/${t.id}`,session,{method:'DELETE'});setTemplates(p=>p.filter(x=>x.id!==t.id))}}>✕ Löschen</button>
                        </div></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </section>
          ):null}

          {page==='einstellungen-checklisten'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Checklisten</h3></div>
              {editingChecklistTemplate ? (
                <form className="form-card" onSubmit={async e=>{e.preventDefault();if(!session||!editingChecklistTemplate)return;
                  const res=await apiRequest<ChecklistTemplate>(`/api/checklisttemplates/${editingChecklistTemplate.id}`,session,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:editingChecklistTemplate.name,templateId:editingChecklistTemplate.templateId,columnsJson:JSON.stringify(checklistColumns)})})
                  setChecklistTemplates(p=>p.map(c=>c.id===res.id?res:c));setEditingChecklistTemplate(null);setChecklistColumns([])}}>
                  <h4>Checkliste bearbeiten: {editingChecklistTemplate.name}</h4>
                  <div className="form-grid">
                    <label>Name<input value={editingChecklistTemplate.name} onChange={e=>setEditingChecklistTemplate(p=>p?{...p,name:e.target.value}:p)} /></label>
                    <label>Audit-Vorlage<select value={editingChecklistTemplate.templateId} onChange={e=>setEditingChecklistTemplate(p=>p?{...p,templateId:parseInt(e.target.value)}:p)}>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                  </div>
                  {renderChecklistColumnsBuilder(editingChecklistTemplate.templateId)}
                  <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
                    <button type="submit" className="primary-button">Speichern</button>
                    <button type="button" className="secondary-button" onClick={()=>{setEditingChecklistTemplate(null);setChecklistColumns([])}}>Abbrechen</button>
                  </div>
                </form>
              ) : (
                <div className="form-card">
                  <h4>Neue Checkliste erstellen</h4>
                  <div className="form-grid">
                    <label>Name<input value={newChecklistName} onChange={e=>setNewChecklistName(e.target.value)} placeholder="z.B. Abnahme-Checkliste" /></label>
                    <label>Audit-Vorlage<select value={newChecklistTemplateId} onChange={e=>setNewChecklistTemplateId(e.target.value)}>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                  </div>
                  {renderChecklistColumnsBuilder(parseInt(newChecklistTemplateId))}
                  <button type="button" className="primary-button" style={{marginTop:'16px'}} onClick={async()=>{
                    if(!session||!newChecklistName)return;
                    const res=await apiRequest<ChecklistTemplate>('/api/checklisttemplates',session,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newChecklistName,templateId:parseInt(newChecklistTemplateId),columnsJson:JSON.stringify(checklistColumns)})})
                    setChecklistTemplates(p=>[...p,res]);setNewChecklistName('');setChecklistColumns([])
                  }}>Checkliste speichern</button>
                </div>
              )}
              <div style={{marginTop:'24px'}}>
                {checklistTemplates.length===0?<p className="empty-hint">Noch keine Checklisten.</p>:(
                  <table><thead><tr><th>Name</th><th>Vorlage</th><th>Spalten</th><th>Aktionen</th></tr></thead>
                    <tbody>{checklistTemplates.map(c=>{
                      const cols: ChecklistColumn[]=(()=>{try{return JSON.parse(c.columnsJson)}catch{return[]}})()
                      return <tr key={c.id}><td>{c.name}</td><td>{templates.find(t=>t.id===c.templateId)?.name??'-'}</td><td>{cols.length}</td>
                        <td><div style={{display:'flex',gap:'6px'}}>
                          <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={()=>{setEditingChecklistTemplate(c);setChecklistColumns(cols.length?cols:[])}}>✏️ Bearbeiten</button>
                          <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={async()=>{
                            if(!session)return
                            try {
                              const res=await apiRequest<ChecklistTemplate>('/api/checklisttemplates',session,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`${c.name} (Kopie)`,templateId:c.templateId,columnsJson:c.columnsJson})})
                              setChecklistTemplates(p=>[...p,res])
                            } catch { setError('Checkliste konnte nicht dupliziert werden.') }
                          }}>⧉ Duplizieren</button>
                          <button type="button" className="danger-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={async()=>{if(session)await apiRequest(`/api/checklisttemplates/${c.id}`,session,{method:'DELETE'});setChecklistTemplates(p=>p.filter(x=>x.id!==c.id))}}>✕ Löschen</button>
                        </div></td>
                      </tr>
                    })}</tbody>
                  </table>
                )}
              </div>
            </section>
          ):null}

          {page==='einstellungen-pdfdesigner'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>PDF-Designer</h3></div>
              {!editingPdfDesign ? (
                <>
                  <div className="form-card">
                    <h4>Neues PDF-Design erstellen</h4>
                    <div className="form-grid">
                      <label>Design-Name<input value={newPdfDesignName} onChange={e=>setNewPdfDesignName(e.target.value)} placeholder="z.B. Standard Schulaudit PDF" /></label>
                      <label>Beschreibung<input value={newPdfDesignDesc} onChange={e=>setNewPdfDesignDesc(e.target.value)} placeholder="Kurze Beschreibung" /></label>
                    </div>
                    <button type="button" className="primary-button" style={{marginTop:'12px'}} onClick={async()=>{
                      if (!session||!newPdfDesignName) return
                      try {
                        const res = await apiRequest<PdfDesign>('/api/pdfdesigns', session, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newPdfDesignName,description:newPdfDesignDesc,configJson:JSON.stringify(pdfDesignConfig)})})
                        setPdfDesigns(p=>[...p,res])
                        setNewPdfDesignName(''); setNewPdfDesignDesc('')
                      } catch { setError('Design konnte nicht gespeichert werden.') }
                    }}>Design anlegen & Bearbeiten</button>
                  </div>
                  <div style={{marginTop:'24px'}}>
                    <h4 style={{marginBottom:'12px',color:'var(--muted)',fontSize:'0.85rem',textTransform:'uppercase',letterSpacing:'0.08em'}}>Vorhandene Designs ({pdfDesigns.length})</h4>
                    {pdfDesigns.length===0?<p className="empty-hint">Noch keine PDF-Designs.</p>:(
                      <table><thead><tr><th>Name</th><th>Beschreibung</th><th>Erstellt</th><th>Aktionen</th></tr></thead>
                        <tbody>{pdfDesigns.map(d=>(
                          <tr key={d.id}>
                            <td>{d.name}</td><td>{d.description||'-'}</td>
                            <td>{new Date(d.createdAtUtc).toLocaleDateString('de-DE')}</td>
                            <td><div style={{display:'flex',gap:'6px'}}>
                              <button type="button" className="secondary-button" style={{padding:'4px 10px',fontSize:'0.82rem'}} onClick={()=>{
                                setEditingPdfDesign(d)
                                try {
                                  const config = JSON.parse(d.configJson) as PdfDesignConfig
                                  setPdfDesignConfig({
                                    globalHeaderText: config.globalHeaderText || '',
                                    globalFooterText: config.globalFooterText || '',
                                    showPrintArea: config.showPrintArea ?? true,
                                    templateIds: config.templateIds?.length ? config.templateIds : (config.templateId ? [config.templateId] : []),
                                    pages: config.pages?.length ? config.pages : [
                                      { id: 'p1', name: 'Deckblatt', orientation: 'portrait', headerText: '', footerText: '', useGlobalHeader: false, elements: [] }
                                    ]
                                  })
                                } catch {
                                  setPdfDesignConfig({ globalHeaderText:'', globalFooterText:'', showPrintArea:true, templateIds:[], pages:[{id:'p1',name:'Deckblatt',orientation:'portrait',headerText:'',footerText:'',useGlobalHeader:false,elements:[]}] })
                                }
                              }}>✏️ Bearbeiten</button>
                              <button type="button" className="secondary-button" style={{padding:'4px 10px',fontSize:'0.82rem'}} onClick={async()=>{
                                if (!session) return
                                try {
                                  const res = await apiRequest<PdfDesign>('/api/pdfdesigns', session, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`${d.name} (Kopie)`,description:d.description,configJson:d.configJson})})
                                  setPdfDesigns(p=>[...p,res])
                                } catch { setError('Design konnte nicht dupliziert werden.') }
                              }}>⧉ Duplizieren</button>
                              <button type="button" className="danger-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={async()=>{if(session)await apiRequest(`/api/pdfdesigns/${d.id}`,session,{method:'DELETE'});setPdfDesigns(p=>p.filter(x=>x.id!==d.id))}}>Löschen</button>
                            </div></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : (
                <div className="pdf-designer">
                  {pdfSaveConfirm && (
                    <Alert type="success" message="✓ Design erfolgreich gespeichert." onClose={() => setPdfSaveConfirm(false)} />
                  )}
                  <div className="pdf-designer-header">
                    <button type="button" className="back-btn" onClick={()=>setEditingPdfDesign(null)}>← Zurück zur Übersicht</button>
                    <h4>✏️ {editingPdfDesign.name}</h4>
                    <div style={{display:'flex',gap:'8px',alignItems:'center',marginLeft:'auto',flexWrap:'wrap'}}>
                      <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.85rem',color:'var(--muted)',cursor:'pointer'}}>
                        <input type="checkbox" checked={pdfDesignConfig.showPrintArea} onChange={e=>setPdfDesignConfig(p=>({...p,showPrintArea:e.target.checked}))} />
                        Druckbereich
                      </label>
                      <div style={{position:'relative'}}>
                        <button type="button" className="secondary-button" style={{padding:'6px 10px',fontSize:'0.85rem'}} onClick={()=>setShowPdfTemplatePicker(v=>!v)}>
                          📎 Auditvorlagen{pdfDesignConfig.templateIds?.length ? ` (${pdfDesignConfig.templateIds.length})` : ''}
                        </button>
                        {showPdfTemplatePicker && (
                          <div style={{position:'absolute',top:'110%',right:0,zIndex:20,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'10px',minWidth:'220px',boxShadow:'0 8px 24px rgba(0,0,0,0.18)'}}>
                            <p style={{margin:'0 0 8px',fontSize:'0.78rem',color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Diesem Design zugewiesene Vorlagen</p>
                            {templates.map(t=>{
                              const checked = (pdfDesignConfig.templateIds ?? []).includes(t.id)
                              return (
                                <label key={t.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0',fontSize:'0.85rem',cursor:'pointer'}}>
                                  <input type="checkbox" checked={checked} onChange={e=>setPdfDesignConfig(p=>{
                                    const current = p.templateIds ?? []
                                    const next = e.target.checked ? [...current, t.id] : current.filter(id=>id!==t.id)
                                    return {...p, templateIds: next}
                                  })} />
                                  {t.name}
                                </label>
                              )
                            })}
                            {templates.length===0 && <p className="empty-hint" style={{margin:0}}>Keine Vorlagen vorhanden.</p>}
                          </div>
                        )}
                      </div>
                      <button type="button" className="primary-button" onClick={async()=>{
                        if (!session) return
                        try {
                          const res = await apiRequest<PdfDesign>(`/api/pdfdesigns/${editingPdfDesign.id}`, session, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:editingPdfDesign.name,description:editingPdfDesign.description,configJson:JSON.stringify(pdfDesignConfig)})})
                          setPdfDesigns(p=>p.map(x=>x.id===res.id?res:x))
                          setEditingPdfDesign(res)
                          setPdfSaveConfirm(true)
                        } catch { setError('Speichern fehlgeschlagen.') }
                      }}>💾 Speichern</button>
                    </div>
                  </div>
                  <PdfDesignerCanvas
                    pages={pdfDesignConfig.pages}
                    onPagesChange={pages=>setPdfDesignConfig(p=>({...p,pages}))}
                    globalHeaderText={pdfDesignConfig.globalHeaderText}
                    globalFooterText={pdfDesignConfig.globalFooterText}
                    onGlobalHeaderChange={t=>setPdfDesignConfig(p=>({...p,globalHeaderText:t}))}
                    onGlobalFooterChange={t=>setPdfDesignConfig(p=>({...p,globalFooterText:t}))}
                    globalHeaderAlign={pdfDesignConfig.globalHeaderAlign ?? 'center'}
                    globalFooterAlign={pdfDesignConfig.globalFooterAlign ?? 'center'}
                    onGlobalHeaderAlignChange={a=>setPdfDesignConfig(p=>({...p,globalHeaderAlign:a}))}
                    onGlobalFooterAlignChange={a=>setPdfDesignConfig(p=>({...p,globalFooterAlign:a}))}
                    showPrintArea={pdfDesignConfig.showPrintArea}
                    templateFields={(() => {
                      const ids = pdfDesignConfig.templateIds ?? []
                      const selected = templates.filter(t=>ids.includes(t.id))
                      const seen = new Set<string>()
                      const merged: TemplateField[] = []
                      selected.forEach(t=>t.fields.forEach(f=>{ if(!seen.has(f.name)){ seen.add(f.name); merged.push(f) } }))
                      return merged
                    })()}
                  />
                </div>
              )}
            </section>
          ):null}

          {page==='admin-benutzer'&&isAdmin?(
            <section className="panel">
              <div className="page-header">
                <h3>Benutzerverwaltung</h3>
                <button type="button" className="primary-button" style={{marginLeft:'auto'}} onClick={()=>setShowNewUserForm(v=>!v)}>
                  {showNewUserForm?'✕ Abbrechen':'+ Benutzer anlegen'}
                </button>
              </div>
              {showNewUserForm&&(
                <form className="form-card" onSubmit={async e=>{
                  e.preventDefault()
                  if (!session) return
                  try {
                    const res = await apiRequest<{user:User}>('/api/users', session, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userName:newUserForm.userName,displayName:newUserForm.displayName,password:newUserForm.password,role:newUserForm.role})})
                    setUsers(p=>[...p,res.user])
                    setNewUserForm({userName:'',displayName:'',password:'',role:'Benutzer'})
                    setShowNewUserForm(false)
                  } catch (err) { setError(err instanceof Error?err.message:'Fehler beim Anlegen') }
                }}>
                  <h4>Neuen Benutzer anlegen</h4>
                  <div className="form-grid">
                    <label>Benutzername<input value={newUserForm.userName} onChange={e=>setNewUserForm(p=>({...p,userName:e.target.value}))} placeholder="benutzername" required /></label>
                    <label>Anzeigename<input value={newUserForm.displayName} onChange={e=>setNewUserForm(p=>({...p,displayName:e.target.value}))} placeholder="Vor- und Nachname" required /></label>
                    <label>Passwort<input type="password" value={newUserForm.password} onChange={e=>setNewUserForm(p=>({...p,password:e.target.value}))} placeholder="Mindestens 8 Zeichen" required /></label>
                    <label>Rolle<select value={newUserForm.role} onChange={e=>setNewUserForm(p=>({...p,role:e.target.value}))}><option>Benutzer</option>{activeSession.user.role==='Superadmin'&&<option>Admin</option>}<option>Azubi</option>{activeSession.user.role==='Superadmin'&&<option>Superadmin</option>}</select></label>
                  </div>
                  <button type="submit" className="primary-button">Benutzer anlegen</button>
                </form>
              )}
              {editingUser&&(
                <form className="form-card" style={{border:'1px solid rgba(96,165,250,0.3)',background:'rgba(37,99,235,0.06)'}} onSubmit={async e=>{
                  e.preventDefault()
                  if (!session) return
                  try {
                    const res = await apiRequest<{user:User}>(`/api/users/${editingUser.id}`, session, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:editingUser.displayName,role:editingUser.role})})
                    setUsers(p=>p.map(u=>u.id===editingUser.id?res.user:u))
                    setEditingUser(null)
                  } catch { setError('Benutzer konnte nicht aktualisiert werden.') }
                }}>
                  <h4>Benutzer bearbeiten: {editingUser.userName}</h4>
                  <div className="form-grid">
                    <label>Anzeigename<input value={editingUser.displayName} onChange={e=>setEditingUser(p=>p?{...p,displayName:e.target.value}:p)} /></label>
                    <label>Rolle<select value={editingUser.role} onChange={e=>setEditingUser(p=>p?{...p,role:e.target.value}:p)}><option>Benutzer</option>{activeSession.user.role==='Superadmin'&&<option>Admin</option>}<option>Azubi</option>{activeSession.user.role==='Superadmin'&&<option>Superadmin</option>}</select></label>
                    <label className="full-width">Passwort zurücksetzen (leer lassen = keine Änderung)
                      <input type="password" id="resetPwInput" placeholder="Neues Passwort eingeben..." onBlur={async e=>{
                        const pw=e.target.value
                        if (pw.length>=8&&session) {
                          try { await apiRequest(`/api/users/${editingUser.id}/password`,session,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:pw})}); e.target.value=''; e.target.placeholder='✓ Passwort gesetzt' } catch { setError('Passwort konnte nicht gesetzt werden.') }
                        }
                      }} />
                    </label>
                  </div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <button type="submit" className="primary-button">Änderungen speichern</button>
                    <button type="button" className="secondary-button" onClick={()=>setEditingUser(null)}>Abbrechen</button>
                  </div>
                </form>
              )}
              <table>
                <thead><tr><th>Anzeigename</th><th>Benutzername</th><th>Rolle</th><th>Status</th><th>Aktionen</th></tr></thead>
                <tbody>{users.map(user=>(
                  <tr key={user.id}>
                    <td>{user.displayName}</td>
                    <td><small style={{color:'var(--muted)'}}>{user.userName}</small></td>
                    <td><span className={`role-badge role-${user.role.toLowerCase()}`}>{user.role}</span></td>
                    <td><span className={user.isActive?'status-active':'status-inactive'}>{user.isActive?'Aktiv':'Inaktiv'}</span></td>
                    <td><div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                      <button type="button" className="secondary-button" style={{padding:'5px 10px',fontSize:'0.82rem'}} onClick={()=>{setEditingUser(user);setShowNewUserForm(false)}}>✏️ Bearbeiten</button>
                      {user.userName!==activeSession.user.userName&&user.role!=='Superadmin'&&(
                        <>
                          <button type="button" className="secondary-button" style={{padding:'5px 10px',fontSize:'0.82rem'}} onClick={()=>toggleUserActive(user.id)}>{user.isActive?'Deaktivieren':'Aktivieren'}</button>
                          <button type="button" className="danger-button" style={{padding:'5px 10px',fontSize:'0.82rem'}} onClick={()=>deleteUser(user.id)}>Löschen</button>
                        </>
                      )}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          ):null}

          {page==='admin-backup'&&isAdmin?(
            <section className="panel">
              <div className="page-header"><h3>Datenbankbackup</h3></div>
              <div className="form-card" style={{display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap'}}>
                <button type="button" className="primary-button" onClick={createBackup}>💾 Backup jetzt erstellen</button>
                <span style={{color:'var(--muted)',fontSize:'0.88rem'}}>oder</span>
                <label className="secondary-button" style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',padding:'10px 16px'}}>
                  📤 Backup hochladen
                  <input type="file" accept=".zip" style={{display:'none'}} onChange={async e=>{
                    if (!session||!e.target.files?.[0]) return
                    const formData = new FormData()
                    formData.append('file', e.target.files[0])
                    try {
                      const res = await fetch(`${API_BASE}/api/admin/backups/upload`, {
                        method:'POST', headers:{'Authorization':`Bearer ${session.token}`}, body:formData
                      })
                      if (res.ok) { const b = await res.json(); setBackups(p=>[b,...p]) }
                    } catch { setError('Upload fehlgeschlagen.') }
                    e.target.value = ''
                  }} />
                </label>
              </div>
              <table style={{marginTop:'16px'}}><thead><tr><th>Dateiname</th><th>Erstellt</th><th>Größe</th><th>Typ</th><th>Aktionen</th></tr></thead>
                <tbody>{backups.map(b=>(
                  <tr key={b.id}>
                    <td style={{fontSize:'0.88rem'}}>{b.fileName}</td>
                    <td>{new Date(b.createdAtUtc).toLocaleString('de-DE')}</td>
                    <td>{(b.sizeBytes/1024/1024).toFixed(2)} MB</td>
                    <td><span className="status-badge">{b.type}</span></td>
                    <td><div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                      <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={async()=>{
                        if (!session) return
                        const res = await fetch(`${API_BASE}/api/admin/backups/${b.id}/download`, {headers:{'Authorization':`Bearer ${session.token}`}})
                        if (res.ok) { const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = b.fileName; a.click() }
                      }}>⬇ Download</button>
                      <button type="button" className="secondary-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={()=>restoreBackup(b.id)}>↩ Wiederherstellen</button>
                      <button type="button" className="danger-button" style={{padding:'4px 8px',fontSize:'0.82rem'}} onClick={()=>deleteBackup(b.id)}>✕ Löschen</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="form-card" style={{marginTop:'20px'}}>
                <h4>Automatische Backups</h4>
                <div className="form-grid">
                  <label>Uhrzeit<input type="time" value={backupSchedule.time} onChange={e=>setBackupSchedule(p=>({...p,time:e.target.value}))} /></label>
                  <label>Max. gespeicherte Backups<input type="number" min="1" max="100" value={backupSchedule.maxBackups} onChange={e=>setBackupSchedule(p=>({...p,maxBackups:parseInt(e.target.value)||10}))} /></label>
                </div>
                <div style={{marginTop:'12px'}}>
                  <p style={{fontWeight:500,marginBottom:'8px',fontSize:'0.9rem'}}>Wochentage:</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
                    {['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'].map(day=>(
                      <label key={day} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',padding:'6px 12px',borderRadius:'8px',border:'1px solid var(--border)',background:backupSchedule.days.includes(day)?'rgba(37,99,235,0.15)':'transparent'}}>
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
              <div className="tab-bar" style={{marginBottom:'20px'}}>
                <button type="button" className={`tab-btn${exportMode==='site'?' active':''}`} onClick={()=>setExportMode('site')}>📍 Einzelner Standort</button>
                <button type="button" className={`tab-btn${exportMode==='all'?' active':''}`} onClick={()=>setExportMode('all')}>🌐 Alle Standorte</button>
              </div>
              {exportMode==='site'?(
                <div className="form-card">
                  <h4>Standort-Export</h4>
                  <p style={{color:'var(--muted)',fontSize:'0.88rem',marginBottom:'16px'}}>Exportiert alle Daten, Räume und Audits eines Standorts als ZIP-Archiv.</p>
                  <div className="form-grid">
                    <label>Kategorie<select onChange={e=>{const id=parseInt(e.target.value);const s=sites.find(x=>x.categoryId===id);if(s)setExportSiteId(String(s.id))}}><option value="">Alle</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                    <label>Standort<select value={exportSiteId} onChange={e=>setExportSiteId(e.target.value)}>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                  </div>
                  <button type="button" className="primary-button" onClick={()=>exportAuditZip('site')}>📦 ZIP erstellen & herunterladen</button>
                </div>
              ):(
                <div className="form-card">
                  <h4>Gesamtexport</h4>
                  <p style={{color:'var(--muted)',fontSize:'0.88rem',marginBottom:'16px'}}>Exportiert alle Kategorien, Standorte, Räume und Audits in einer hierarchischen ZIP-Struktur.<br/><code style={{fontSize:'0.82rem',background:'rgba(148,163,184,0.1)',padding:'2px 6px',borderRadius:'4px'}}>Kategorie → Standort → Raum → Dateien</code></p>
                  <button type="button" className="primary-button" onClick={()=>exportAuditZip('all')}>📦 Gesamtexport herunterladen</button>
                </div>
              )}
            </section>
          ):null}

          {page==='admin-logs'&&isAdmin?(
            <section className="panel">
              <div className="page-header">
                <h3>System-Logs</h3>
                <button type="button" className="secondary-button" style={{padding:'6px 12px',fontSize:'0.85rem',marginLeft:'auto'}} onClick={async()=>{if(!session)return;const res=await apiRequest<Array<{timestamp:string;action:string;details?:string;userId:number;userName:string}>>('/api/admin/logs',session);setLogs(res)}}>
                  🔄 Neu laden
                </button>
              </div>
              <div style={{marginBottom:'12px'}}>
                <input value={logFilter} onChange={e=>setLogFilter(e.target.value)} placeholder="Filtern nach Aktion, Benutzer, Details..." style={{width:'100%',padding:'8px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--text-h)',fontSize:'0.9rem'}} />
              </div>
              {logs.length===0?(
                <p className="empty-hint">Keine Logs vorhanden. Klick auf "Neu laden".</p>
              ):(
                <table>
                  <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Aktion</th><th>Details</th></tr></thead>
                  <tbody>{logs.filter(l=>!logFilter||l.action.toLowerCase().includes(logFilter.toLowerCase())||(l.details||'').toLowerCase().includes(logFilter.toLowerCase())||l.userName.toLowerCase().includes(logFilter.toLowerCase())).map((log,idx)=>(
                    <tr key={idx}>
                      <td style={{whiteSpace:'nowrap',fontSize:'0.85rem'}}>{new Date(log.timestamp).toLocaleString('de-DE')}</td>
                      <td><span className="status-badge">{log.userName}</span></td>
                      <td><strong style={{fontSize:'0.9rem'}}>{log.action}</strong></td>
                      <td style={{fontSize:'0.85rem',color:'var(--muted)',maxWidth:'300px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{log.details||'-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>
          ):null}



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

      {/* Image Gallery Modal */}
      {galleryModalImages.length > 0 && (
        <div className="gallery-modal-overlay" onClick={()=>setGalleryModalImages([])}>
          <div className="gallery-modal" onClick={e=>e.stopPropagation()}>
            <button className="gallery-modal-close" onClick={()=>setGalleryModalImages([])}>✕</button>
            <div className="gallery-modal-image-wrap"
              style={{overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',flex:1,touchAction:'none',cursor:galleryModalZoom>1?'move':'default'}}
              onWheel={galleryWheelZoom}
              onMouseDown={galleryMouseDown}
              onMouseMove={galleryMouseMove}
              onMouseUp={galleryMouseUp}
              onMouseLeave={galleryMouseUp}
              onTouchStart={galleryTouchStart}
              onTouchMove={galleryTouchMove}
              onTouchEnd={galleryTouchEnd}
            >
              <img
                src={galleryModalImages[galleryModalIndex]}
                alt=""
                draggable={false}
                onClick={galleryImageClick}
                style={{maxWidth:'100%',maxHeight:'100%',transform:`translate(${galleryModalPan.x}px, ${galleryModalPan.y}px) scale(${galleryModalZoom})`,transformOrigin:'center',transition:galleryDragRef.current?'none':'transform 0.1s',cursor:galleryModalZoom>1?'move':'zoom-in',userSelect:'none'}}
              />
            </div>
            <div className="gallery-modal-footer">
              <button className="gallery-nav-btn" disabled={galleryModalIndex===0} onClick={()=>{setGalleryModalIndex(i=>i-1);resetGalleryZoom()}}>‹</button>
              <div className="gallery-modal-info">
                <span>{galleryModalIndex+1} / {galleryModalImages.length}</span>
                <div className="gallery-zoom-controls">
                  <button onClick={()=>setGalleryModalZoom(z=>Math.max(0.5,z-0.25))}>−</button>
                  <span>{Math.round(galleryModalZoom*100)}%</span>
                  <button onClick={()=>setGalleryModalZoom(z=>Math.min(4,z+0.25))}>+</button>
                  <button onClick={resetGalleryZoom}>1:1</button>
                </div>
              </div>
              <button className="gallery-nav-btn" disabled={galleryModalIndex===galleryModalImages.length-1} onClick={()=>{setGalleryModalIndex(i=>i+1);resetGalleryZoom()}}>›</button>
            </div>
          </div>
        </div>
      )}

      {/* Generisches Bestätigungs-Modal */}
      {confirmDialog && (
        <div className="confirm-modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <p>{confirmDialog.message}</p>
            <div className="confirm-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmDialog(null)}>Nein</button>
              <button type="button" className="danger-button" onClick={() => { const action = confirmDialog.onConfirm; setConfirmDialog(null); action() }}>Ja</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail-Modal für abgekürzte lange Texte aus Tabellenzellen */}
      {detailModal && (
        <div className="confirm-modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="confirm-modal detail-text-modal" onClick={e => e.stopPropagation()}>
            <h4>{detailModal.title}</h4>
            <p style={{ whiteSpace: 'pre-wrap' }}>{detailModal.text}</p>
            <div className="confirm-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setDetailModal(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
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
    try {
      const errBody = await response.json()
      throw new Error(errBody?.message ?? errBody?.title ?? 'Die Anfrage konnte nicht verarbeitet werden.')
    } catch (jsonErr) {
      if (jsonErr instanceof Error && jsonErr.message !== 'Die Anfrage konnte nicht verarbeitet werden.') throw jsonErr
      throw new Error('Die Anfrage konnte nicht verarbeitet werden.')
    }
  }

  return (await response.json()) as T
}

export default App

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { RepeatBlockEditorModal } from './RepeatBlockEditorModal'
import { AuthImage } from './AuthImage'
import { uploadMediaImage } from '../mediaUpload'

// DIN A4 at 96dpi scale 75% → 596x842 (portrait), 842x596 (landscape)
const A4_W = 596
const A4_H = 842
const MARGIN = 36  // print area margin in px

export type DesignElement = {
  id: string
  type: 'text' | 'variable' | 'image-static' | 'image-audit' | 'table' | 'repeat-block' | 'divider' | 'rectangle' | 'repeat-field'
  x: number
  y: number
  width: number
  height: number
  content: string
  imageData?: string        // base64 for static images
  fields?: string[]          // columns for table / repeat-block (legacy auto-layout for repeat-block)
  maxRowsPerPage?: number    // optional cap on table rows per page; overflow continues on a new page
  children?: DesignElement[] // free-form sub-elements of a repeat-block, positioned relative to the block's own top-left corner
  fieldKey?: string          // for type 'repeat-field' (repeat-block children only): bound room/template/site field key
  hideIfEmpty?: boolean      // for type 'repeat-field': skip rendering this child for an iteration whose resolved value is empty
  style: {
    fontSize: number
    fontWeight: 'normal' | 'bold'
    fontStyle: 'normal' | 'italic'
    textDecoration: 'none' | 'underline'
    align: 'left' | 'center' | 'right'
    verticalAlign: 'top' | 'middle' | 'bottom'
    color: string
    background: string
    border: boolean
    borderColor: string
    borderRadius: number
    opacity: number
  }
}

export type PageDesign = {
  id: string
  name: string
  orientation: 'portrait' | 'landscape'
  headerText: string
  footerText: string
  useGlobalHeader: boolean
  headerAlign?: 'left' | 'center' | 'right'
  footerAlign?: 'left' | 'center' | 'right'
  elements: DesignElement[]
}

interface Props {
  pages: PageDesign[]
  onPagesChange: (pages: PageDesign[]) => void
  globalHeaderText: string
  globalFooterText: string
  onGlobalHeaderChange: (t: string) => void
  onGlobalFooterChange: (t: string) => void
  globalHeaderAlign?: 'left' | 'center' | 'right'
  globalFooterAlign?: 'left' | 'center' | 'right'
  onGlobalHeaderAlignChange: (a: 'left' | 'center' | 'right') => void
  onGlobalFooterAlignChange: (a: 'left' | 'center' | 'right') => void
  showPrintArea: boolean
  templateFields?: Array<{ id: number; name: string; type: string }>
}

const VARIABLES = [
  { key: '{{siteName}}', label: 'Standortname' },
  { key: '{{category}}', label: 'Kategorie' },
  { key: '{{address}}', label: 'Adresse' },
  { key: '{{phone}}', label: 'Telefon' },
  { key: '{{caretakerPhone}}', label: 'Hausmeister-Tel.' },
  { key: '{{auditTitle}}', label: 'Audit-Titel' },
  { key: '{{date}}', label: 'Datum' },
  { key: '{{createdBy}}', label: 'Ersteller' },
  { key: '{{totalRooms}}', label: 'Anzahl Räume' },
  { key: '{{pageNumber}}', label: 'Seitenzahl' },
  { key: '{{totalPages}}', label: 'Gesamtseiten' },
  { key: '{{roomName}}', label: 'Raumname (in Blöcken)' },
]

// Vorlagenfeld-Typ hat die Form "baseType|options:a,b,c|scope:site" (scope fehlt => 'room')
const fieldScope = (typeValue: string): 'room' | 'site' =>
  typeValue.split('|').map(p => p.trim()).includes('scope:site') ? 'site' : 'room'

const fieldBaseType = (typeValue: string): string => typeValue.split('|')[0]?.trim() || 'text'

const defaultStyle = (): DesignElement['style'] => ({
  fontSize: 11, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
  align: 'left', verticalAlign: 'top', color: '#1a1a2e', background: 'transparent',
  border: false, borderColor: '#94a3b8', borderRadius: 0, opacity: 100
})

const makeEl = (type: DesignElement['type']): DesignElement => {
  const base: DesignElement = { id: `el-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, type, x: 40, y: 40, width: 200, height: 44, content: '', style: defaultStyle() }
  switch (type) {
    case 'text':          base.content = 'Text eingeben...'; break
    case 'variable':      base.content = '{{siteName}}'; break
    case 'image-static':  base.width = 150; base.height = 100; base.content = 'Logo / Bild'; break
    case 'image-audit':   base.width = 150; base.height = 100; base.content = '{{auditImage}}'; break
    case 'table':         base.width = A4_W - MARGIN*2; base.height = 140; base.content = 'Datentabelle'; base.fields = []; break
    case 'repeat-block':  base.width = A4_W - MARGIN*2; base.height = 180; base.content = 'Wiederholender Block'; base.fields = []; break
    case 'divider':       base.width = A4_W - MARGIN*2; base.height = 2; base.style.background = '#94a3b8'; break
    case 'rectangle':     base.width = 120; base.height = 80; base.style.border = true; break
  }
  return base
}

export const PdfDesignerCanvas: React.FC<Props> = ({
  pages, onPagesChange, globalHeaderText, globalFooterText,
  onGlobalHeaderChange, onGlobalFooterChange,
  globalHeaderAlign = 'center', globalFooterAlign = 'center',
  onGlobalHeaderAlignChange, onGlobalFooterAlignChange,
  showPrintArea, templateFields = []
}) => {
  const [currentPageIdx, setCurrentPageIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; ow: number; oh: number; mx: number; my: number } | null>(null)
  const [showGlobalSettings, setShowGlobalSettings] = useState(false)
  const [selectedBand, setSelectedBand] = useState<'header' | 'footer' | null>(null)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentPage = pages[currentPageIdx] ?? pages[0]
  const pageW = currentPage?.orientation === 'landscape' ? A4_H : A4_W
  const pageH = currentPage?.orientation === 'landscape' ? A4_W : A4_H

  const updatePage = useCallback((patch: Partial<PageDesign>) => {
    onPagesChange(pages.map((p, i) => i === currentPageIdx ? { ...p, ...patch } : p))
  }, [pages, onPagesChange, currentPageIdx])

  const updateElements = useCallback((elements: DesignElement[]) => {
    updatePage({ elements })
  }, [updatePage])

  const elements = currentPage?.elements ?? []
  const selectedEl = elements.find(e => e.id === selected)

  const addEl = (type: DesignElement['type']) => {
    const el = makeEl(type)
    updateElements([...elements, el])
    setSelected(el.id)
    setSelectedBand(null)
  }

  const updateEl = (id: string, patch: Partial<DesignElement>) => {
    updateElements(elements.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  const updateStyle = (id: string, sp: Partial<DesignElement['style']>) => {
    updateElements(elements.map(e => e.id === id ? { ...e, style: { ...e.style, ...sp } } : e))
  }

  const deleteEl = () => { if (selected) { updateElements(elements.filter(e => e.id !== selected)); setSelected(null) } }

  const addPage = () => {
    const newPage: PageDesign = {
      id: `p${Date.now()}`, name: `Seite ${pages.length + 1}`,
      orientation: 'portrait', headerText: '', footerText: '', useGlobalHeader: true,
      headerAlign: 'center', footerAlign: 'center', elements: []
    }
    onPagesChange([...pages, newPage])
    setCurrentPageIdx(pages.length)
    setSelected(null)
    setSelectedBand(null)
  }

  const deletePage = (idx: number) => {
    if (pages.length <= 1) return
    const newPages = pages.filter((_, i) => i !== idx)
    onPagesChange(newPages)
    setCurrentPageIdx(Math.min(idx, newPages.length - 1))
    setSelected(null)
    setSelectedBand(null)
  }

  const movePage = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= pages.length) return
    const newPages = [...pages]
    const [moved] = newPages.splice(idx, 1)
    newPages.splice(targetIdx, 0, moved)
    onPagesChange(newPages)
    setCurrentPageIdx(targetIdx)
  }

  const duplicateEl = () => {
    if (!selectedEl) return
    const clone: DesignElement = JSON.parse(JSON.stringify(selectedEl))
    clone.id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    clone.x = Math.min(pageW - clone.width, selectedEl.x + 16)
    clone.y = Math.min(pageH - clone.height, selectedEl.y + 16)
    if (clone.children) {
      clone.children = clone.children.map(c => ({ ...c, id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }))
    }
    updateElements([...elements, clone])
    setSelected(clone.id)
  }

  // Mouse drag handlers
  const onMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = elements.find(x => x.id === id)
    if (!el) return
    setSelected(id)
    setSelectedBand(null)
    setDragging({ id, ox: el.x, oy: el.y, mx: e.clientX, my: e.clientY })
  }

  const onResizeDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); e.preventDefault()
    const el = elements.find(x => x.id === id)
    if (!el) return
    setResizing({ id, ow: el.width, oh: el.height, mx: e.clientX, my: e.clientY })
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - dragging.mx, dy = e.clientY - dragging.my
      updateElements(elements.map(el => el.id === dragging.id
        ? { ...el, x: Math.max(0, Math.min(pageW - el.width, dragging.ox + dx)), y: Math.max(0, Math.min(pageH - el.height, dragging.oy + dy)) }
        : el))
    }
    if (resizing) {
      const dx = e.clientX - resizing.mx, dy = e.clientY - resizing.my
      updateElements(elements.map(el => el.id === resizing.id
        ? { ...el, width: Math.max(20, resizing.ow + dx), height: Math.max(10, resizing.oh + dy) }
        : el))
    }
  }, [dragging, resizing, elements, updateElements, pageW, pageH])

  const onMouseUp = useCallback(() => { setDragging(null); setResizing(null) }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [onMouseMove, onMouseUp])

  // Keyboard delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && editingText === null && !(e.target as HTMLElement).matches('input,textarea,select')) {
        deleteEl()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, editingText, deleteEl])

  // Align element relative to print area
  const alignEl = (how: string) => {
    if (!selectedEl) return
    const printLeft = MARGIN
    const printRight = pageW - MARGIN
    const printTop = MARGIN
    const printBottom = pageH - MARGIN
    const printW = printRight - printLeft
    const printH = printBottom - printTop
    let { x, y } = selectedEl
    if (how === 'left')   x = printLeft
    if (how === 'center') x = printLeft + (printW - selectedEl.width) / 2
    if (how === 'right')  x = printRight - selectedEl.width
    if (how === 'top')    y = printTop
    if (how === 'middle') y = printTop + (printH - selectedEl.height) / 2
    if (how === 'bottom') y = printBottom - selectedEl.height
    updateEl(selectedEl.id, { x: Math.round(x), y: Math.round(y) })
  }

  const renderEl = (el: DesignElement) => {
    const isSel = selected === el.id
    const s = el.style
    const boxStyle: React.CSSProperties = {
      position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height,
      cursor: dragging?.id === el.id ? 'grabbing' : 'move',
      outline: isSel ? '2px solid #3b82f6' : 'none',
      boxSizing: 'border-box',
      opacity: s.opacity / 100,
      background: s.background !== 'transparent' ? s.background : undefined,
      border: s.border ? `1px solid ${s.borderColor}` : undefined,
      borderRadius: s.borderRadius,
      overflow: 'hidden',
    }
    const textStyle: React.CSSProperties = {
      fontSize: s.fontSize, fontWeight: s.fontWeight, fontStyle: s.fontStyle,
      textDecoration: s.textDecoration, textAlign: s.align, color: s.color,
      padding: '2px 4px', width: '100%', height: '100%',
      display: 'flex',
      alignItems: s.verticalAlign === 'top' ? 'flex-start' : s.verticalAlign === 'bottom' ? 'flex-end' : 'center',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden',
    }

    let inner: React.ReactNode

    if (el.type === 'divider') {
      inner = <div style={{ width: '100%', height: '100%', background: s.color || '#94a3b8' }} />
    } else if (el.type === 'rectangle') {
      inner = <div style={{ width: '100%', height: '100%', background: s.background, border: `1px solid ${s.borderColor || '#94a3b8'}`, borderRadius: s.borderRadius }} />
    } else if (el.type === 'image-static') {
      inner = el.imageData
        ? <AuthImage src={el.imageData} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <div style={{ width: '100%', height: '100%', border: '2px dashed #94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: '#94a3b8', flexDirection: 'column' }}>
            <span style={{ fontSize: 24 }}>📷</span>
            <span>Bild hochladen →</span>
          </div>
    } else if (el.type === 'image-audit') {
      inner = <div style={{ width: '100%', height: '100%', border: '2px dashed #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#3b82f6', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 22 }}>📷</span><span>Audit-Bild</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>(wird automatisch befüllt)</span>
      </div>
    } else if (el.type === 'table') {
      inner = <div style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#1e3a5f', color: 'white', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', display: 'flex', gap: 4 }}>📊 Datentabelle — automatisch befüllt</div>
        <div style={{ padding: '3px 8px', fontSize: 10, color: '#64748b', flex: 1, overflow: 'hidden' }}>
          {(el.fields ?? []).length > 0
            ? `Spalten: ${el.fields!.join(' | ')}`
            : 'Keine Spalten gewählt — im Eigenschaften-Panel festlegen'}
        </div>
        <div style={{ padding: '3px 8px', fontSize: 9, color: '#94a3b8' }}>Füllt sich automatisch mit Audit-Daten · Seitenumbruch wenn nötig</div>
      </div>
    } else if (el.type === 'repeat-block') {
      const hasChildren = (el.children ?? []).length > 0
      inner = <div style={{ width: '100%', height: '100%', border: '2px dashed #7c3aed', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ background: 'rgba(124,58,237,0.1)', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', color: '#7c3aed', display: 'flex', gap: 4 }}>🔄 Wiederholender Block — 1× pro Raum/Objekt</div>
        {hasChildren ? (
          <div style={{ flex: 1, position: 'relative' }}>
            {el.children!.map(c => (
              <div key={c.id} style={{
                position: 'absolute',
                left: `${(c.x / el.width) * 100}%`, top: `${(c.y / el.height) * 100}%`,
                width: `${(c.width / el.width) * 100}%`, height: `${(c.height / el.height) * 100}%`,
                border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.06)',
                fontSize: 7, color: '#7c3aed', overflow: 'hidden', whiteSpace: 'nowrap'
              }}>{c.type === 'repeat-field' ? '⟨f⟩' : c.type === 'text' ? 'T' : c.type === 'image-static' ? '🖼' : ''}</div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '3px 8px', fontSize: 10, color: '#64748b', flex: 1 }}>
            {(el.fields ?? []).length > 0
              ? `Felder: ${el.fields!.join(', ')}`
              : 'Felder wählen → Eigenschaften-Panel'}
          </div>
        )}
        <div style={{ padding: '3px 8px', fontSize: 9, color: '#94a3b8' }}>
          {hasChildren ? `✓ ${el.children!.length} Elemente eigens gestaltet` : 'Block wiederholt sich für jeden Datensatz des Audits'}
        </div>
      </div>
    } else if (editingText === el.id) {
      inner = <textarea autoFocus
        style={{ fontSize: s.fontSize, fontWeight: s.fontWeight, resize: 'none', border: 'none', outline: 'none', background: 'rgba(255,255,255,0.95)', color: '#1a1a2e', padding: '2px 4px', width: '100%', height: '100%', fontFamily: 'inherit' }}
        value={el.content}
        onChange={e => updateEl(el.id, { content: e.target.value })}
        onBlur={() => setEditingText(null)}
      />
    } else if (el.type === 'variable') {
      const varLabel = VARIABLES.find(v => v.key === el.content)?.label
        || templateFields.find(f => el.content === `{{field:${f.name}}}`)?.name
        || el.content
      inner = <div style={{ ...textStyle }}>
        <span style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4, padding: '1px 5px', fontStyle: 'italic', color: '#3b82f6' }}>
          ⟨{varLabel}⟩
        </span>
      </div>
    } else {
      inner = <div style={textStyle}><span style={{ display: 'block', width: '100%' }}>{el.content || ' '}</span></div>
    }

    return (
      <div key={el.id} style={boxStyle} onMouseDown={e => onMouseDown(e, el.id)} onDoubleClick={() => el.type === 'text' ? setEditingText(el.id) : undefined}>
        {inner}
        {isSel && (
          <div style={{ position: 'absolute', right: -5, bottom: -5, width: 10, height: 10, background: '#3b82f6', cursor: 'se-resize', borderRadius: 2, zIndex: 10 }} onMouseDown={e => onResizeDown(e, el.id)} />
        )}
      </div>
    )
  }

  if (!currentPage) return <div>Keine Seiten vorhanden.</div>

  const CANVAS_HEADER_H = showPrintArea ? 24 : 0
  const CANVAS_FOOTER_H = showPrintArea ? 24 : 0

  return (
    <div className="pdf-canvas-wrapper">
      {/* Top Toolbar */}
      <div className="pdf-canvas-toolbar">
        <span className="pdf-toolbar-label">Einfügen:</span>
        <button type="button" className="pdf-tool-btn" onClick={() => addEl('text')}>T Text</button>
        <button type="button" className="pdf-tool-btn" onClick={() => addEl('variable')}>⟨⟩ Variable</button>
        <button type="button" className="pdf-tool-btn" onClick={() => addEl('image-static')}>🖼 Bild (fix)</button>
        <button type="button" className="pdf-tool-btn" onClick={() => addEl('image-audit')}>📷 Bild (Audit)</button>
        <button type="button" className="pdf-tool-btn" onClick={() => addEl('table')}>📊 Tabelle</button>
        <button type="button" className="pdf-tool-btn" onClick={() => addEl('repeat-block')}>🔄 Block</button>
        <button type="button" className="pdf-tool-btn" onClick={() => addEl('divider')}>― Linie</button>
        <button type="button" className="pdf-tool-btn" onClick={() => addEl('rectangle')}>▭ Box</button>
        {selectedEl && (
          <>
            <span className="pdf-toolbar-sep" />
            <span className="pdf-toolbar-label">Ausrichten:</span>
            <button type="button" className="pdf-tool-btn" title="Links ausrichten" onClick={() => alignEl('left')}>⇤</button>
            <button type="button" className="pdf-tool-btn" title="Horizontal zentrieren" onClick={() => alignEl('center')}>↔</button>
            <button type="button" className="pdf-tool-btn" title="Rechts ausrichten" onClick={() => alignEl('right')}>⇥</button>
            <button type="button" className="pdf-tool-btn" title="Oben ausrichten" onClick={() => alignEl('top')}>⇡</button>
            <button type="button" className="pdf-tool-btn" title="Vertikal zentrieren" onClick={() => alignEl('middle')}>↕</button>
            <button type="button" className="pdf-tool-btn" title="Unten ausrichten" onClick={() => alignEl('bottom')}>⇣</button>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" className="pdf-tool-btn" onClick={() => setShowGlobalSettings(s => !s)}>⚙ Kopf/Fuß</button>
          {selected && <button type="button" className="pdf-tool-btn" title="Dieses Element kopieren" onClick={duplicateEl}>⧉ Duplizieren</button>}
          {selected && <button type="button" className="pdf-tool-btn danger" onClick={deleteEl}>🗑 Entfernen</button>}
        </div>
      </div>

      {/* Global header/footer panel */}
      {showGlobalSettings && (
        <div className="pdf-global-settings">
          <div className="form-grid">
            <div>
              <label>Globale Kopfzeile (alle Seiten)<input value={globalHeaderText} onChange={e => onGlobalHeaderChange(e.target.value)} placeholder="z.B. Firmenname | Vertraulich" /></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <select value={globalHeaderAlign} onChange={e => onGlobalHeaderAlignChange(e.target.value as 'left' | 'center' | 'right')} style={{ fontSize: '0.78rem', padding: '2px 4px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-h)', borderRadius: 6 }}>
                  <option value="left">⇤ Links</option>
                  <option value="center">↔ Mitte</option>
                  <option value="right">⇥ Rechts</option>
                </select>
                {VARIABLES.filter(v => v.key !== '{{roomName}}').map(v => (
                  <button key={v.key} type="button" className="pdf-format-btn" title={v.key} onClick={() => onGlobalHeaderChange(`${globalHeaderText}${globalHeaderText ? ' ' : ''}${v.key}`)}>{v.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label>Globale Fußzeile (alle Seiten)<input value={globalFooterText} onChange={e => onGlobalFooterChange(e.target.value)} placeholder="z.B. Seite {{pageNumber}} von {{totalPages}}" /></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <select value={globalFooterAlign} onChange={e => onGlobalFooterAlignChange(e.target.value as 'left' | 'center' | 'right')} style={{ fontSize: '0.78rem', padding: '2px 4px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-h)', borderRadius: 6 }}>
                  <option value="left">⇤ Links</option>
                  <option value="center">↔ Mitte</option>
                  <option value="right">⇥ Rechts</option>
                </select>
                {VARIABLES.filter(v => v.key !== '{{roomName}}').map(v => (
                  <button key={v.key} type="button" className="pdf-format-btn" title={v.key} onClick={() => onGlobalFooterChange(`${globalFooterText}${globalFooterText ? ' ' : ''}${v.key}`)}>{v.label}</button>
                ))}
              </div>
            </div>
          </div>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--muted)' }}>Alle verfügbaren Variablen anzeigen</summary>
            <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', marginTop: 6 }}>
              <tbody>
                {VARIABLES.filter(v => v.key !== '{{roomName}}').map(v => (
                  <tr key={v.key}>
                    <td style={{ padding: '2px 8px 2px 0', fontFamily: 'monospace', color: 'var(--text-h)', whiteSpace: 'nowrap' }}>{v.key}</td>
                    <td style={{ padding: '2px 4px', color: 'var(--muted)' }}>{v.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      {/* Page list + Canvas + Properties */}
      <div className="pdf-canvas-body">
        {/* Page list (left) */}
        <div className="pdf-page-list">
          <div className="pdf-page-list-header">
            <span>Seiten</span>
            <button type="button" className="pdf-tool-btn" onClick={addPage} style={{ padding: '3px 8px', fontSize: '0.78rem' }}>+ Seite</button>
          </div>
          {pages.map((p, idx) => (
            <div key={p.id} className={`pdf-page-thumb${idx === currentPageIdx ? ' active' : ''}`} onClick={() => { setCurrentPageIdx(idx); setSelected(null); setSelectedBand(null) }}>
              <div className="pdf-page-thumb-preview" style={{ aspectRatio: p.orientation === 'landscape' ? '1.41/1' : '1/1.41' }}>
                <span style={{ fontSize: 8, color: '#94a3b8', pointerEvents: 'none' }}>{idx + 1}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <div className="pdf-page-thumb-label" style={{ flex: 1, minWidth: 0 }}>
                  <input
                    value={p.name}
                    onChange={e => onPagesChange(pages.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                    onClick={e => e.stopPropagation()}
                    style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-h)', fontSize: '0.8rem', width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <button type="button" title="Seite nach oben verschieben" disabled={idx === 0} onClick={e => { e.stopPropagation(); movePage(idx, -1) }} style={{ background: 'none', border: 'none', color: idx === 0 ? 'var(--border)' : 'var(--muted)', cursor: idx === 0 ? 'default' : 'pointer', padding: '0 4px', fontSize: '0.7rem', lineHeight: 1 }}>▲</button>
                  <button type="button" title="Seite nach unten verschieben" disabled={idx === pages.length - 1} onClick={e => { e.stopPropagation(); movePage(idx, 1) }} style={{ background: 'none', border: 'none', color: idx === pages.length - 1 ? 'var(--border)' : 'var(--muted)', cursor: idx === pages.length - 1 ? 'default' : 'pointer', padding: '0 4px', fontSize: '0.7rem', lineHeight: 1 }}>▼</button>
                </div>
                {pages.length > 1 && (
                  <button type="button" title="Seite löschen" onClick={e => { e.stopPropagation(); deletePage(idx) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px 4px', fontSize: '0.8rem' }}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>


        {/* Canvas area */}
        <div className="pdf-canvas-scroll">
          {/* Page settings bar */}
          <div className="pdf-page-settings-bar">
            <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{currentPage.name}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--muted)' }}>
              Ausrichtung:
              <select value={currentPage.orientation} onChange={e => updatePage({ orientation: e.target.value as 'portrait' | 'landscape' })} style={{ padding: '2px 6px', fontSize: '0.82rem', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-h)', borderRadius: 6 }}>
                <option value="portrait">Hochkant</option>
                <option value="landscape">Querformat</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={currentPage.useGlobalHeader} onChange={e => updatePage({ useGlobalHeader: e.target.checked })} />
              Globale Kopf/Fußzeile
            </label>
            {!currentPage.useGlobalHeader && (
              <>
                <input placeholder="Kopfzeile dieser Seite" value={currentPage.headerText} onChange={e => updatePage({ headerText: e.target.value })} style={{ padding: '2px 8px', fontSize: '0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-h)', borderRadius: 6, width: 180 }} />
                <input placeholder="Fußzeile dieser Seite" value={currentPage.footerText} onChange={e => updatePage({ footerText: e.target.value })} style={{ padding: '2px 8px', fontSize: '0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-h)', borderRadius: 6, width: 180 }} />
              </>
            )}
          </div>

          {/* The A4 page */}
          <div ref={canvasRef} className="pdf-page" style={{ width: pageW, height: pageH, position: 'relative' }} onClick={e => { if (e.target === canvasRef.current) { setSelected(null); setSelectedBand(null) } }}>
            {/* Kopfzeile */}
            {showPrintArea && (
              <div
                onClick={e => { e.stopPropagation(); setSelected(null); setSelectedBand('header') }}
                style={{
                  position: 'absolute', top: 10, left: MARGIN, right: MARGIN, height: 14, fontSize: 8, color: '#94a3b8',
                  display: 'flex', alignItems: 'center',
                  justifyContent: (currentPage.useGlobalHeader ? globalHeaderAlign : currentPage.headerAlign) === 'left' ? 'flex-start' : (currentPage.useGlobalHeader ? globalHeaderAlign : currentPage.headerAlign) === 'right' ? 'flex-end' : 'center',
                  zIndex: 1, cursor: 'pointer',
                  outline: selectedBand === 'header' ? '1px dashed #6366f1' : 'none', outlineOffset: 2
                }}
              >
                <span>{currentPage.useGlobalHeader ? globalHeaderText : currentPage.headerText}</span>
              </div>
            )}
            {/* Druckbereich Rahmen */}
            {showPrintArea && (
              <div style={{ position: 'absolute', top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN, border: '1px dashed rgba(239,68,68,0.5)', pointerEvents: 'none', zIndex: 0 }} />
            )}
            {/* Elements */}
            {elements.map(renderEl)}
            {/* Fußzeile */}
            {showPrintArea && (
              <div
                onClick={e => { e.stopPropagation(); setSelected(null); setSelectedBand('footer') }}
                style={{
                  position: 'absolute', bottom: 10, left: MARGIN, right: MARGIN, height: 14, fontSize: 8, color: '#94a3b8',
                  display: 'flex', alignItems: 'center',
                  justifyContent: (currentPage.useGlobalHeader ? globalFooterAlign : currentPage.footerAlign) === 'left' ? 'flex-start' : (currentPage.useGlobalHeader ? globalFooterAlign : currentPage.footerAlign) === 'right' ? 'flex-end' : 'center',
                  zIndex: 1, cursor: 'pointer',
                  outline: selectedBand === 'footer' ? '1px dashed #6366f1' : 'none', outlineOffset: 2
                }}
              >
                <span>{currentPage.useGlobalHeader ? globalFooterText : currentPage.footerText}</span>
                <span style={{ position: 'absolute', right: 0 }}>Seite {currentPageIdx + 1}</span>
              </div>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
            DIN A4 · {pageW}×{pageH}px (75%) · Ziehen = Verschieben · Doppelklick = Text · ↘ = Größe · Entf = Löschen
          </div>
        </div>

        {/* Properties panel (right) */}
        {selectedEl ? (
          <div className="pdf-properties">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Eigenschaften</h4>
              <button type="button" className="pdf-tool-btn danger" onClick={deleteEl} style={{ padding: '3px 8px', fontSize: '0.78rem' }}>Entfernen</button>
            </div>

            <div className="pdf-prop-group">
              <div className="pdf-prop-row2">
                <label>X <input type="number" value={Math.round(selectedEl.x)} onChange={e => updateEl(selectedEl.id, { x: +e.target.value })} /></label>
                <label>Y <input type="number" value={Math.round(selectedEl.y)} onChange={e => updateEl(selectedEl.id, { y: +e.target.value })} /></label>
                <label>B <input type="number" value={Math.round(selectedEl.width)} onChange={e => updateEl(selectedEl.id, { width: Math.max(10, +e.target.value) })} /></label>
                <label>H <input type="number" value={Math.round(selectedEl.height)} onChange={e => updateEl(selectedEl.id, { height: Math.max(4, +e.target.value) })} /></label>
              </div>
            </div>

            {selectedEl.type === 'text' && (
              <div className="pdf-prop-group">
                <label>Inhalt<textarea rows={3} value={selectedEl.content} onChange={e => updateEl(selectedEl.id, { content: e.target.value })} /></label>
              </div>
            )}

            {selectedEl.type === 'variable' && (
              <div className="pdf-prop-group">
                <label>Variable
                  <select value={selectedEl.content} onChange={e => updateEl(selectedEl.id, { content: e.target.value })}>
                    <optgroup label="Standort-Infos">
                      {VARIABLES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                    </optgroup>
                    {templateFields.filter(f => fieldScope(f.type) !== 'site').length > 0 && (
                      <optgroup label="Raum/Objekt-Datenfelder">
                        {templateFields.filter(f => fieldScope(f.type) !== 'site').map(f => <option key={f.id} value={`{{field:${f.name}}}`}>{f.name}</option>)}
                      </optgroup>
                    )}
                    {templateFields.filter(f => fieldScope(f.type) === 'site').length > 0 && (
                      <optgroup label="Grunddaten-Datenfelder">
                        {templateFields.filter(f => fieldScope(f.type) === 'site').map(f => <option key={f.id} value={`{{field:${f.name}}}`}>{f.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>
            )}

            {selectedEl.type === 'image-static' && (
              <div className="pdf-prop-group">
                <label>Statisches Bild hochladen</label>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                  const file = e.target.files?.[0]; if (!file) return
                  try {
                    const url = await uploadMediaImage(file)
                    updateEl(selectedEl.id, { imageData: url })
                  } catch {
                    window.alert('Bild konnte nicht hochgeladen werden.')
                  } finally {
                    e.target.value = ''
                  }
                }} />
                <button type="button" className="secondary-button" style={{ width: '100%', marginTop: 4 }} onClick={() => fileInputRef.current?.click()}>📁 Bild wählen...</button>
                {selectedEl.imageData && <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--muted)' }}>✓ Bild geladen</div>}
              </div>
            )}

            {(selectedEl.type === 'table' || selectedEl.type === 'repeat-block') && (
              <div className="pdf-prop-group">
                {selectedEl.type === 'repeat-block' && (
                  <div style={{ marginBottom: 10 }}>
                    <button type="button" className="pdf-tool-btn" style={{ width: '100%' }} onClick={() => setEditingBlockId(selectedEl.id)}>
                      🖊 {selectedEl.children && selectedEl.children.length > 0 ? `Layout gestalten (${selectedEl.children.length} Elemente)` : 'Eigenes Layout gestalten...'}
                    </button>
                    <span style={{ display: 'block', marginTop: 6, fontSize: '0.74rem', color: 'var(--muted)' }}>
                      {selectedEl.children && selectedEl.children.length > 0
                        ? 'Freies Layout aktiv — die Felder unten werden ignoriert. Im Editor Elemente entfernen, um zur einfachen Liste zurückzukehren.'
                        : 'Ohne eigenes Layout werden die unten gewählten Felder automatisch untereinander aufgelistet (Bildfeld links, Rest rechts).'}
                    </span>
                  </div>
                )}
                <label style={{ marginBottom: 6, display: 'block', fontWeight: 500, fontSize: '0.82rem', color: 'var(--muted)' }}>
                  {selectedEl.type === 'table' ? 'Tabellenspalten' : 'Block-Felder (einfache Liste)'}
                </label>
                {(() => {
                  const cur = selectedEl.fields ?? []
                  const toggleField = (name: string) => {
                    updateEl(selectedEl.id, { fields: cur.includes(name) ? cur.filter(x => x !== name) : [...cur, name] })
                  }
                  const roomFields = templateFields.filter(f => fieldScope(f.type) !== 'site')
                  const siteFields = templateFields.filter(f => fieldScope(f.type) === 'site')
                  return (
                    <>
                      <div className="pdf-field-picker-group">
                        <span className="pdf-field-picker-group-title">Raum/Objekt-Datenfelder</span>
                        <label className="pdf-checkbox-row">
                          <input type="checkbox" checked={cur.includes('roomName')} onChange={() => toggleField('roomName')} /> Raumname
                        </label>
                        <label className="pdf-checkbox-row">
                          <input type="checkbox" checked={cur.includes('category')} onChange={() => toggleField('category')} /> Kategorie
                        </label>
                        {roomFields.map(f => (
                          <label key={f.id} className="pdf-checkbox-row">
                            <input type="checkbox" checked={cur.includes(f.name)} onChange={() => toggleField(f.name)} />
                            {f.name} <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>({fieldBaseType(f.type)})</span>
                          </label>
                        ))}
                        {roomFields.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Keine weiteren Raum/Objekt-Felder in der Vorlage.</span>}
                      </div>
                      <div className="pdf-field-picker-group">
                        <span className="pdf-field-picker-group-title">Grunddaten-Datenfelder</span>
                        <label className="pdf-checkbox-row">
                          <input type="checkbox" checked={cur.includes('siteName')} onChange={() => toggleField('siteName')} /> Standortname
                        </label>
                        {siteFields.map(f => (
                          <label key={f.id} className="pdf-checkbox-row">
                            <input type="checkbox" checked={cur.includes(f.name)} onChange={() => toggleField(f.name)} />
                            {f.name} <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>({fieldBaseType(f.type)})</span>
                          </label>
                        ))}
                        {siteFields.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Keine Grunddaten-Felder in der Vorlage.</span>}
                      </div>
                      {templateFields.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Vorlage in der Kopfleiste wählen</span>}
                    </>
                  )
                })()}
                {selectedEl.type === 'table' && (
                  <label style={{ marginTop: 10, display: 'block' }}>
                    Max. Zeilen pro Seite
                    <input
                      type="number"
                      min={1}
                      placeholder="unbegrenzt"
                      value={selectedEl.maxRowsPerPage ?? ''}
                      onChange={e => updateEl(selectedEl.id, { maxRowsPerPage: e.target.value ? Math.max(1, +e.target.value) : undefined })}
                    />
                  </label>
                )}
                {selectedEl.type === 'table' && (
                  <span style={{ display: 'block', marginTop: 4, fontSize: '0.74rem', color: 'var(--muted)' }}>
                    Bei Überschreitung wird automatisch mit bis zu dieser Zeilenanzahl auf einer neuen Seite fortgesetzt (zählt als eigene Seite).
                  </span>
                )}
              </div>
            )}

            {selectedEl.type !== 'image-static' && selectedEl.type !== 'image-audit' && selectedEl.type !== 'divider' && selectedEl.type !== 'rectangle' && selectedEl.type !== 'table' && selectedEl.type !== 'repeat-block' && (
              <div className="pdf-prop-group">
                <label>Schriftgröße <input type="number" min={5} max={96} value={selectedEl.style.fontSize} onChange={e => updateStyle(selectedEl.id, { fontSize: +e.target.value })} /></label>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {[
                    { k: 'fontWeight' as const, v1: 'bold' as const, v2: 'normal' as const, label: 'B', bold: true },
                  ].map(({ k, v1, v2, label, bold }) => (
                    <button key={k} type="button" className={`pdf-format-btn${selectedEl.style.fontWeight === v1 ? ' active' : ''}`} style={{ fontWeight: bold ? 'bold' : undefined }}
                      onClick={() => updateStyle(selectedEl.id, { fontWeight: selectedEl.style.fontWeight === v1 ? v2 : v1 })}>
                      {label}
                    </button>
                  ))}
                  <button type="button" className={`pdf-format-btn${selectedEl.style.fontStyle === 'italic' ? ' active' : ''}`} style={{ fontStyle: 'italic' }} onClick={() => updateStyle(selectedEl.id, { fontStyle: selectedEl.style.fontStyle === 'italic' ? 'normal' : 'italic' })}>I</button>
                  <button type="button" className={`pdf-format-btn${selectedEl.style.textDecoration === 'underline' ? ' active' : ''}`} style={{ textDecoration: 'underline' }} onClick={() => updateStyle(selectedEl.id, { textDecoration: selectedEl.style.textDecoration === 'underline' ? 'none' : 'underline' })}>U</button>
                  <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
                  {(['left', 'center', 'right'] as const).map(a => (
                    <button key={a} type="button" className={`pdf-format-btn${selectedEl.style.align === a ? ' active' : ''}`} onClick={() => updateStyle(selectedEl.id, { align: a })}>
                      {a === 'left' ? '⬅' : a === 'center' ? '≡' : '➡'}
                    </button>
                  ))}
                  <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
                  {(['top', 'middle', 'bottom'] as const).map(a => (
                    <button key={a} type="button" className={`pdf-format-btn${selectedEl.style.verticalAlign === a ? ' active' : ''}`} onClick={() => updateStyle(selectedEl.id, { verticalAlign: a })}>
                      {a === 'top' ? '⬆' : a === 'middle' ? '↕' : '⬇'}
                    </button>
                  ))}
                </div>
                <label style={{ marginTop: 8 }}>Schriftfarbe <input type="color" value={selectedEl.style.color} onChange={e => updateStyle(selectedEl.id, { color: e.target.value })} /></label>
              </div>
            )}

            <div className="pdf-prop-group">
              <label className="pdf-checkbox-row" style={{ fontSize: '0.85rem' }}>
                <input type="checkbox" checked={selectedEl.style.border} onChange={e => updateStyle(selectedEl.id, { border: e.target.checked })} />
                Rahmen
              </label>
              {selectedEl.style.border && (
                <label>Rahmenfarbe <input type="color" value={selectedEl.style.borderColor} onChange={e => updateStyle(selectedEl.id, { borderColor: e.target.value })} /></label>
              )}
              <label>Ecken-Radius <input type="range" min={0} max={30} value={selectedEl.style.borderRadius} onChange={e => updateStyle(selectedEl.id, { borderRadius: +e.target.value })} /></label>
              <label>Transparenz <input type="range" min={10} max={100} value={selectedEl.style.opacity} onChange={e => updateStyle(selectedEl.id, { opacity: +e.target.value })} /></label>
              {selectedEl.type !== 'divider' && (
                <label>Hintergrund <input type="color" value={selectedEl.style.background === 'transparent' ? '#ffffff' : selectedEl.style.background} onChange={e => updateStyle(selectedEl.id, { background: e.target.value })} /></label>
              )}
            </div>
          </div>
        ) : selectedBand ? (
          <div className="pdf-properties">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>{selectedBand === 'header' ? 'Kopfzeile' : 'Fußzeile'}</h4>
              <button type="button" className="pdf-tool-btn" onClick={() => setSelectedBand(null)} style={{ padding: '3px 8px', fontSize: '0.78rem' }}>Schließen</button>
            </div>
            {(() => {
              const isGlobal = currentPage.useGlobalHeader
              const text = selectedBand === 'header' ? (isGlobal ? globalHeaderText : currentPage.headerText) : (isGlobal ? globalFooterText : currentPage.footerText)
              const align = selectedBand === 'header' ? (isGlobal ? globalHeaderAlign : (currentPage.headerAlign ?? 'center')) : (isGlobal ? globalFooterAlign : (currentPage.footerAlign ?? 'center'))
              const setText = (t: string) => {
                if (isGlobal) { selectedBand === 'header' ? onGlobalHeaderChange(t) : onGlobalFooterChange(t) }
                else { updatePage(selectedBand === 'header' ? { headerText: t } : { footerText: t }) }
              }
              const setAlign = (a: 'left' | 'center' | 'right') => {
                if (isGlobal) { selectedBand === 'header' ? onGlobalHeaderAlignChange(a) : onGlobalFooterAlignChange(a) }
                else { updatePage(selectedBand === 'header' ? { headerAlign: a } : { footerAlign: a }) }
              }
              const insertVar = (key: string) => setText(`${text}${text ? ' ' : ''}${key}`)
              const bandVars = VARIABLES.filter(v => v.key !== '{{roomName}}')
              return (
                <>
                  {isGlobal && (
                    <div className="pdf-prop-group">
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                        Diese Seite nutzt die globale {selectedBand === 'header' ? 'Kopfzeile' : 'Fußzeile'}. Zum Bearbeiten hier oder "Globale Kopf/Fußzeile" für diese Seite deaktivieren, für seitenspezifischen Text.
                      </span>
                    </div>
                  )}
                  <div className="pdf-prop-group">
                    <label>Text<textarea rows={2} value={text} onChange={e => setText(e.target.value)} /></label>
                  </div>
                  <div className="pdf-prop-group">
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.82rem', color: 'var(--muted)' }}>Ausrichtung am Druckbereich</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className={`pdf-format-btn${align === 'left' ? ' active' : ''}`} onClick={() => setAlign('left')}>⇤ Links</button>
                      <button type="button" className={`pdf-format-btn${align === 'center' ? ' active' : ''}`} onClick={() => setAlign('center')}>↔ Mitte</button>
                      <button type="button" className={`pdf-format-btn${align === 'right' ? ' active' : ''}`} onClick={() => setAlign('right')}>⇥ Rechts</button>
                    </div>
                  </div>
                  <div className="pdf-prop-group">
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.82rem', color: 'var(--muted)' }}>Variable einfügen</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {bandVars.map(v => (
                        <button key={v.key} type="button" className="pdf-format-btn" title={v.key} onClick={() => insertVar(v.key)}>{v.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="pdf-prop-group">
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.82rem', color: 'var(--muted)' }}>Verfügbare Variablen</label>
                    <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                      <tbody>
                        {bandVars.map(v => (
                          <tr key={v.key}>
                            <td style={{ padding: '2px 4px', fontFamily: 'monospace', color: 'var(--text-h)', whiteSpace: 'nowrap' }}>{v.key}</td>
                            <td style={{ padding: '2px 4px', color: 'var(--muted)' }}>{v.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}
          </div>
        ) : (
          <div className="pdf-properties pdf-properties-empty">
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Element, Kopf- oder Fußzeile anklicken für Eigenschaften</span>
          </div>
        )}
      </div>

      {editingBlockId && (() => {
        const blockEl = elements.find(e => e.id === editingBlockId)
        if (!blockEl) return null
        return (
          <RepeatBlockEditorModal
            block={blockEl}
            templateFields={templateFields}
            onClose={() => setEditingBlockId(null)}
            onSave={children => { updateEl(blockEl.id, { children }); setEditingBlockId(null) }}
          />
        )
      })()}
    </div>
  )
}

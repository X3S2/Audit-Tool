import React, { useState, useRef, useCallback, useEffect } from 'react'

// DIN A4 at 96dpi scale 75% → 596x842 (portrait), 842x596 (landscape)
const A4_W = 596
const A4_H = 842
const MARGIN = 36  // print area margin in px

export type DesignElement = {
  id: string
  type: 'text' | 'variable' | 'image-static' | 'image-audit' | 'table' | 'repeat-block' | 'divider' | 'rectangle'
  x: number
  y: number
  width: number
  height: number
  content: string
  imageData?: string        // base64 for static images
  fields?: string[]          // columns for table / repeat-block
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
  elements: DesignElement[]
}

interface Props {
  pages: PageDesign[]
  onPagesChange: (pages: PageDesign[]) => void
  globalHeaderText: string
  globalFooterText: string
  onGlobalHeaderChange: (t: string) => void
  onGlobalFooterChange: (t: string) => void
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
  onGlobalHeaderChange, onGlobalFooterChange, showPrintArea, templateFields = []
}) => {
  const [currentPageIdx, setCurrentPageIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; ow: number; oh: number; mx: number; my: number } | null>(null)
  const [showGlobalSettings, setShowGlobalSettings] = useState(false)
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
      orientation: 'portrait', headerText: '', footerText: '', useGlobalHeader: true, elements: []
    }
    onPagesChange([...pages, newPage])
    setCurrentPageIdx(pages.length)
    setSelected(null)
  }

  const deletePage = (idx: number) => {
    if (pages.length <= 1) return
    const newPages = pages.filter((_, i) => i !== idx)
    onPagesChange(newPages)
    setCurrentPageIdx(Math.min(idx, newPages.length - 1))
    setSelected(null)
  }

  // Mouse drag handlers
  const onMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = elements.find(x => x.id === id)
    if (!el) return
    setSelected(id)
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
        ? <img src={el.imageData} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
      inner = <div style={{ width: '100%', height: '100%', border: '2px dashed #7c3aed', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'rgba(124,58,237,0.1)', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', color: '#7c3aed', display: 'flex', gap: 4 }}>🔄 Wiederholender Block — 1× pro Raum/Objekt</div>
        <div style={{ padding: '3px 8px', fontSize: 10, color: '#64748b', flex: 1 }}>
          {(el.fields ?? []).length > 0
            ? `Felder: ${el.fields!.join(', ')}`
            : 'Felder wählen → Eigenschaften-Panel'}
        </div>
        <div style={{ padding: '3px 8px', fontSize: 9, color: '#94a3b8' }}>Block wiederholt sich für jeden Datensatz des Audits</div>
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" className="pdf-tool-btn" onClick={() => setShowGlobalSettings(s => !s)}>⚙ Kopf/Fuß</button>
          {selected && <button type="button" className="pdf-tool-btn danger" onClick={deleteEl}>🗑 Entfernen</button>}
        </div>
      </div>

      {/* Global header/footer panel */}
      {showGlobalSettings && (
        <div className="pdf-global-settings">
          <div className="form-grid">
            <label>Globale Kopfzeile (alle Seiten)<input value={globalHeaderText} onChange={e => onGlobalHeaderChange(e.target.value)} placeholder="z.B. Firmenname | Vertraulich" /></label>
            <label>Globale Fußzeile (alle Seiten)<input value={globalFooterText} onChange={e => onGlobalFooterChange(e.target.value)} placeholder="z.B. Seite {{pageNumber}} von {{totalPages}}" /></label>
          </div>
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
            <div key={p.id} className={`pdf-page-thumb${idx === currentPageIdx ? ' active' : ''}`} onClick={() => { setCurrentPageIdx(idx); setSelected(null) }}>
              <div className="pdf-page-thumb-preview" style={{ aspectRatio: p.orientation === 'landscape' ? '1.41/1' : '1/1.41' }}>
                <span style={{ fontSize: 8, color: '#94a3b8', pointerEvents: 'none' }}>{idx + 1}</span>
              </div>
              <div className="pdf-page-thumb-label">
                <input
                  value={p.name}
                  onChange={e => onPagesChange(pages.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  onClick={e => e.stopPropagation()}
                  style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-h)', fontSize: '0.8rem', width: '100%' }}
                />
              </div>
              {pages.length > 1 && (
                <button type="button" onClick={e => { e.stopPropagation(); deletePage(idx) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px 4px', fontSize: '0.8rem' }}>✕</button>
              )}
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
          <div ref={canvasRef} className="pdf-page" style={{ width: pageW, height: pageH, position: 'relative' }} onClick={e => { if (e.target === canvasRef.current) setSelected(null) }}>
            {/* Kopfzeile */}
            {showPrintArea && (
              <div style={{ position: 'absolute', top: 10, left: MARGIN, right: MARGIN, height: 14, fontSize: 8, color: '#94a3b8', display: 'flex', justifyContent: 'space-between', zIndex: 0, pointerEvents: 'none' }}>
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
              <div style={{ position: 'absolute', bottom: 10, left: MARGIN, right: MARGIN, height: 14, fontSize: 8, color: '#94a3b8', display: 'flex', justifyContent: 'space-between', zIndex: 0, pointerEvents: 'none' }}>
                <span>{currentPage.useGlobalHeader ? globalFooterText : currentPage.footerText}</span>
                <span>Seite {currentPageIdx + 1}</span>
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
                    {templateFields.length > 0 && (
                      <optgroup label="Vorlagen-Felder">
                        {templateFields.map(f => <option key={f.id} value={`{{field:${f.name}}}`}>{f.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>
            )}

            {selectedEl.type === 'image-static' && (
              <div className="pdf-prop-group">
                <label>Statisches Bild hochladen</label>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => updateEl(selectedEl.id, { imageData: ev.target?.result as string })
                  reader.readAsDataURL(file)
                }} />
                <button type="button" className="secondary-button" style={{ width: '100%', marginTop: 4 }} onClick={() => fileInputRef.current?.click()}>📁 Bild wählen...</button>
                {selectedEl.imageData && <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--muted)' }}>✓ Bild geladen</div>}
              </div>
            )}

            {(selectedEl.type === 'table' || selectedEl.type === 'repeat-block') && (
              <div className="pdf-prop-group">
                <label style={{ marginBottom: 6, display: 'block', fontWeight: 500, fontSize: '0.82rem', color: 'var(--muted)' }}>
                  {selectedEl.type === 'table' ? 'Tabellenspalten' : 'Block-Felder'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={(selectedEl.fields ?? []).includes('roomName')} onChange={e => {
                    const cur = selectedEl.fields ?? []
                    updateEl(selectedEl.id, { fields: e.target.checked ? [...cur, 'roomName'] : cur.filter(x => x !== 'roomName') })
                  }} /> Raumname
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={(selectedEl.fields ?? []).includes('category')} onChange={e => {
                    const cur = selectedEl.fields ?? []
                    updateEl(selectedEl.id, { fields: e.target.checked ? [...cur, 'category'] : cur.filter(x => x !== 'category') })
                  }} /> Kategorie
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={(selectedEl.fields ?? []).includes('siteName')} onChange={e => {
                    const cur = selectedEl.fields ?? []
                    updateEl(selectedEl.id, { fields: e.target.checked ? [...cur, 'siteName'] : cur.filter(x => x !== 'siteName') })
                  }} /> Standortname
                </label>
                {templateFields.map(f => (
                  <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={(selectedEl.fields ?? []).includes(f.name)} onChange={e => {
                      const cur = selectedEl.fields ?? []
                      updateEl(selectedEl.id, { fields: e.target.checked ? [...cur, f.name] : cur.filter(x => x !== f.name) })
                    }} />
                    {f.name} <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>({f.type})</span>
                  </label>
                ))}
                {templateFields.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Vorlage in der Kopfleiste wählen</span>}
              </div>
            )}

            {selectedEl.type !== 'image-static' && selectedEl.type !== 'image-audit' && selectedEl.type !== 'divider' && selectedEl.type !== 'rectangle' && selectedEl.type !== 'table' && selectedEl.type !== 'repeat-block' && (
              <div className="pdf-prop-group">
                <label>Schriftgröße <input type="number" min={5} max={96} value={selectedEl.style.fontSize} onChange={e => updateStyle(selectedEl.id, { fontSize: +e.target.value })} /></label>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {[
                    { k: 'fontWeight', v1: 'bold' as const, v2: 'normal' as const, label: 'B', bold: true },
                  ].map(({ k, v1, v2, label, bold }) => (
                    <button key={k} type="button" className={`pdf-format-btn${selectedEl.style[k as keyof typeof selectedEl.style] === v1 ? ' active' : ''}`} style={{ fontWeight: bold ? 'bold' : undefined }}
                      onClick={() => updateStyle(selectedEl.id, { [k]: selectedEl.style[k as keyof typeof selectedEl.style] === v1 ? v2 : v1 } as Partial<DesignElement['style']>)}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
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
        ) : (
          <div className="pdf-properties pdf-properties-empty">
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Element anklicken für Eigenschaften</span>
          </div>
        )}
      </div>
    </div>
  )
}

import React, { useState, useRef, useCallback, useEffect } from 'react'

// DIN A4 at 96dpi: 794x1123px. We display at 75%: ~596x842px
const PAGE_W = 596
const PAGE_H = 842

export type DesignElement = {
  id: string
  type: 'text' | 'variable' | 'image-placeholder' | 'table' | 'divider' | 'repeat-block' | 'rectangle'
  x: number
  y: number
  width: number
  height: number
  content: string
  style: {
    fontSize: number
    fontWeight: 'normal' | 'bold'
    fontStyle: 'normal' | 'italic'
    align: 'left' | 'center' | 'right'
    color: string
    background: string
    border: boolean
  }
  fields?: string[]     // for table/repeat-block
  variable?: string     // for variable element
}

const AVAILABLE_VARIABLES = [
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
]

interface Props {
  elements: DesignElement[]
  onChange: (elements: DesignElement[]) => void
  templateFields?: Array<{ id: number; name: string; type: string }>
}

export const PdfDesignerCanvas: React.FC<Props> = ({ elements, onChange, templateFields = [] }) => {
  const [selected, setSelected] = useState<string | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const selectedEl = elements.find(e => e.id === selected)

  const addElement = (type: DesignElement['type']) => {
    const id = `el-${Date.now()}`
    const base: DesignElement = {
      id, type, x: 40, y: 40, width: 200, height: 40,
      content: type === 'text' ? 'Text eingeben...' : type === 'variable' ? '{{siteName}}' : type === 'divider' ? '' : type === 'table' ? 'Tabelle' : type === 'repeat-block' ? 'Wiederholender Block' : type === 'rectangle' ? '' : '📷 Bild',
      style: { fontSize: 12, fontWeight: 'normal', fontStyle: 'normal', align: 'left', color: '#1a1a2e', background: 'transparent', border: false }
    }
    if (type === 'divider') { base.height = 4; base.width = 500 }
    if (type === 'table') { base.height = 120; base.width = 500; base.fields = [] }
    if (type === 'repeat-block') { base.height = 160; base.width = 500; base.fields = [] }
    if (type === 'image-placeholder') { base.height = 120; base.width = 160 }
    if (type === 'rectangle') { base.height = 60; base.width = 120 }
    onChange([...elements, base])
    setSelected(id)
  }

  const updateEl = (id: string, patch: Partial<DesignElement>) => {
    onChange(elements.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  const updateStyle = (id: string, stylePatch: Partial<DesignElement['style']>) => {
    onChange(elements.map(e => e.id === id ? { ...e, style: { ...e.style, ...stylePatch } } : e))
  }

  const deleteSelected = () => {
    if (!selected) return
    onChange(elements.filter(e => e.id !== selected))
    setSelected(null)
  }

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) setSelected(null)
  }

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = elements.find(x => x.id === id)
    if (!el) return
    setSelected(id)
    setDragging({ id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y })
  }

  const handleResizeDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    const el = elements.find(x => x.id === id)
    if (!el) return
    setResizing({ id, startX: e.clientX, startY: e.clientY, origW: el.width, origH: el.height })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - dragging.startX
      const dy = e.clientY - dragging.startY
      onChange(elements.map(el => el.id === dragging.id
        ? { ...el, x: Math.max(0, Math.min(PAGE_W - el.width, dragging.origX + dx)), y: Math.max(0, Math.min(PAGE_H - el.height, dragging.origY + dy)) }
        : el))
    }
    if (resizing) {
      const dx = e.clientX - resizing.startX
      const dy = e.clientY - resizing.startY
      onChange(elements.map(el => el.id === resizing.id
        ? { ...el, width: Math.max(40, resizing.origW + dx), height: Math.max(20, resizing.origH + dy) }
        : el))
    }
  }, [dragging, resizing, elements, onChange])

  const handleMouseUp = useCallback(() => {
    setDragging(null)
    setResizing(null)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const renderElement = (el: DesignElement) => {
    const isSelected = selected === el.id
    const commonStyle: React.CSSProperties = {
      position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height,
      cursor: dragging?.id === el.id ? 'grabbing' : 'grab',
      outline: isSelected ? '2px solid #3b82f6' : '1px dashed transparent',
      boxSizing: 'border-box',
      userSelect: 'none',
      background: el.style.background !== 'transparent' ? el.style.background : undefined,
      border: el.style.border ? '1px solid #94a3b8' : undefined,
    }
    const textStyle: React.CSSProperties = {
      fontSize: el.style.fontSize,
      fontWeight: el.style.fontWeight,
      fontStyle: el.style.fontStyle,
      textAlign: el.style.align,
      color: el.style.color,
      padding: '2px 4px',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'flex-start',
    }

    return (
      <div key={el.id} style={commonStyle} onMouseDown={e => handleMouseDown(e, el.id)} onDoubleClick={() => setEditingText(el.id)}>
        {el.type === 'divider' ? (
          <div style={{ width: '100%', height: '2px', background: el.style.color || '#94a3b8', marginTop: el.height / 2 - 1 }} />
        ) : el.type === 'rectangle' ? (
          <div style={{ width: '100%', height: '100%', border: `2px solid ${el.style.color || '#3b82f6'}`, background: el.style.background }} />
        ) : el.type === 'image-placeholder' ? (
          <div style={{ width: '100%', height: '100%', border: '2px dashed #94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(148,163,184,0.08)', fontSize: 12, color: '#94a3b8' }}>
            📷 {el.content || 'Bild-Platzhalter'}
          </div>
        ) : el.type === 'table' ? (
          <div style={{ ...textStyle, flexDirection: 'column', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '3px 6px', fontSize: 10, fontWeight: 'bold' }}>📊 Datentabelle</div>
            {(el.fields?.length ?? 0) > 0
              ? <div style={{ padding: '2px 6px', fontSize: 10, color: '#64748b' }}>Spalten: {el.fields!.join(', ')}</div>
              : <div style={{ padding: '2px 6px', fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Keine Spalten gewählt</div>
            }
          </div>
        ) : el.type === 'repeat-block' ? (
          <div style={{ ...textStyle, flexDirection: 'column', border: '2px dashed #3b82f6', overflow: 'hidden' }}>
            <div style={{ background: 'rgba(59,130,246,0.1)', padding: '3px 6px', fontSize: 10, fontWeight: 'bold', color: '#3b82f6' }}>🔄 Wiederholender Block (pro Raum)</div>
            {(el.fields?.length ?? 0) > 0
              ? <div style={{ padding: '2px 6px', fontSize: 10, color: '#64748b' }}>Felder: {el.fields!.join(', ')}</div>
              : <div style={{ padding: '2px 6px', fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Felder definieren →</div>
            }
          </div>
        ) : editingText === el.id ? (
          <textarea
            autoFocus
            style={{ ...textStyle, resize: 'none', border: 'none', outline: 'none', background: 'rgba(255,255,255,0.9)', color: '#1a1a2e', fontFamily: 'inherit' }}
            value={el.content}
            onChange={e => updateEl(el.id, { content: e.target.value })}
            onBlur={() => setEditingText(null)}
          />
        ) : (
          <div style={{ ...textStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span style={{ opacity: el.type === 'variable' ? 0.7 : 1, fontStyle: el.type === 'variable' ? 'italic' : 'inherit' }}>
              {el.type === 'variable' ? `⟨${AVAILABLE_VARIABLES.find(v => v.key === el.content)?.label || el.content}⟩` : el.content}
            </span>
          </div>
        )}

        {isSelected && (
          <div
            style={{ position: 'absolute', right: -5, bottom: -5, width: 10, height: 10, background: '#3b82f6', cursor: 'se-resize', borderRadius: 2, zIndex: 10 }}
            onMouseDown={e => handleResizeDown(e, el.id)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="pdf-canvas-wrapper">
      {/* Toolbar */}
      <div className="pdf-canvas-toolbar">
        <div className="pdf-toolbar-group">
          <span className="pdf-toolbar-label">Einfügen:</span>
          <button type="button" className="pdf-tool-btn" onClick={() => addElement('text')} title="Textfeld">T Text</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addElement('variable')} title="Variable/Platzhalter">⟨⟩ Variable</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addElement('image-placeholder')} title="Bild-Platzhalter">📷 Bild</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addElement('table')} title="Datentabelle">📊 Tabelle</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addElement('repeat-block')} title="Wiederholender Block">🔄 Wiederholen</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addElement('divider')} title="Trennlinie">— Linie</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addElement('rectangle')} title="Rechteck">▭ Box</button>
        </div>
        {selected && (
          <button type="button" className="pdf-tool-btn danger" onClick={deleteSelected} title="Element löschen">🗑 Löschen</button>
        )}
      </div>

      <div className="pdf-canvas-area">
        {/* A4 Canvas */}
        <div ref={canvasRef} className="pdf-page" style={{ width: PAGE_W, height: PAGE_H, position: 'relative' }} onClick={handleCanvasClick}>
          {elements.map(renderElement)}
        </div>

        {/* Properties Panel */}
        {selectedEl && (
          <div className="pdf-properties">
            <h4>Eigenschaften</h4>
            <div className="pdf-prop-section">
              <label>Typ: <strong>{selectedEl.type}</strong></label>
            </div>

            {(selectedEl.type === 'text') && (
              <div className="pdf-prop-section">
                <label>Text<textarea rows={3} value={selectedEl.content} onChange={e => updateEl(selectedEl.id, { content: e.target.value })} /></label>
              </div>
            )}

            {selectedEl.type === 'variable' && (
              <div className="pdf-prop-section">
                <label>Variable
                  <select value={selectedEl.content} onChange={e => updateEl(selectedEl.id, { content: e.target.value })}>
                    {AVAILABLE_VARIABLES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                    {templateFields.map(f => <option key={`field:${f.name}`} value={`{{field:${f.name}}}`}>{f.name} (Vorlage)</option>)}
                  </select>
                </label>
              </div>
            )}

            {(selectedEl.type === 'table' || selectedEl.type === 'repeat-block') && (
              <div className="pdf-prop-section">
                <label>Spalten/Felder</label>
                {templateFields.map(f => (
                  <label key={f.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer', padding: '2px 0' }}>
                    <input type="checkbox" checked={(selectedEl.fields ?? []).includes(f.name)} onChange={e => {
                      const cur = selectedEl.fields ?? []
                      updateEl(selectedEl.id, { fields: e.target.checked ? [...cur, f.name] : cur.filter(x => x !== f.name) })
                    }} />
                    {f.name}
                  </label>
                ))}
                {templateFields.length === 0 && <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Vorlage im Designer-Tab wählen</span>}
              </div>
            )}

            <div className="pdf-prop-section">
              <label>Position
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <label style={{ fontSize: '0.82rem' }}>X<input type="number" value={Math.round(selectedEl.x)} onChange={e => updateEl(selectedEl.id, { x: Number(e.target.value) })} /></label>
                  <label style={{ fontSize: '0.82rem' }}>Y<input type="number" value={Math.round(selectedEl.y)} onChange={e => updateEl(selectedEl.id, { y: Number(e.target.value) })} /></label>
                  <label style={{ fontSize: '0.82rem' }}>Breite<input type="number" value={Math.round(selectedEl.width)} onChange={e => updateEl(selectedEl.id, { width: Number(e.target.value) })} /></label>
                  <label style={{ fontSize: '0.82rem' }}>Höhe<input type="number" value={Math.round(selectedEl.height)} onChange={e => updateEl(selectedEl.id, { height: Number(e.target.value) })} /></label>
                </div>
              </label>
            </div>

            {selectedEl.type !== 'divider' && selectedEl.type !== 'image-placeholder' && selectedEl.type !== 'rectangle' && (
              <div className="pdf-prop-section">
                <label>Schriftgröße<input type="number" min="6" max="72" value={selectedEl.style.fontSize} onChange={e => updateStyle(selectedEl.id, { fontSize: Number(e.target.value) })} /></label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button type="button" className={`pdf-format-btn${selectedEl.style.fontWeight === 'bold' ? ' active' : ''}`} onClick={() => updateStyle(selectedEl.id, { fontWeight: selectedEl.style.fontWeight === 'bold' ? 'normal' : 'bold' })}>B</button>
                  <button type="button" className={`pdf-format-btn${selectedEl.style.fontStyle === 'italic' ? ' active' : ''}`} onClick={() => updateStyle(selectedEl.id, { fontStyle: selectedEl.style.fontStyle === 'italic' ? 'normal' : 'italic' })}>I</button>
                  <button type="button" className={`pdf-format-btn${selectedEl.style.align === 'left' ? ' active' : ''}`} onClick={() => updateStyle(selectedEl.id, { align: 'left' })}>⬅</button>
                  <button type="button" className={`pdf-format-btn${selectedEl.style.align === 'center' ? ' active' : ''}`} onClick={() => updateStyle(selectedEl.id, { align: 'center' })}>≡</button>
                  <button type="button" className={`pdf-format-btn${selectedEl.style.align === 'right' ? ' active' : ''}`} onClick={() => updateStyle(selectedEl.id, { align: 'right' })}>➡</button>
                </div>
                <label style={{ marginTop: 8 }}>Farbe<input type="color" value={selectedEl.style.color} onChange={e => updateStyle(selectedEl.id, { color: e.target.value })} /></label>
              </div>
            )}

            <div className="pdf-prop-section">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.88rem' }}>
                <input type="checkbox" checked={selectedEl.style.border} onChange={e => updateStyle(selectedEl.id, { border: e.target.checked })} />
                Rahmen anzeigen
              </label>
              <label style={{ marginTop: 6 }}>Hintergrund<input type="color" value={selectedEl.style.background === 'transparent' ? '#ffffff' : selectedEl.style.background} onChange={e => updateStyle(selectedEl.id, { background: e.target.value })} /></label>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center' }}>
        DIN A4 Maßstab 75% · Klicken = Auswählen · Doppelklick = Text bearbeiten · Ziehen = Verschieben · ↘ Anfasser = Größe ändern
      </div>
    </div>
  )
}

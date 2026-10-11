import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { DesignElement } from './PdfDesignerCanvas'

type FieldOption = { key: string; label: string }

interface Props {
  block: DesignElement
  templateFields: Array<{ id: number; name: string; type: string }>
  onClose: () => void
  onSave: (children: DesignElement[]) => void
}

// Vorlagenfeld-Typ hat die Form "baseType|options:a,b,c|scope:site" (scope fehlt => 'room')
const fieldScope = (typeValue: string): 'room' | 'site' =>
  typeValue.split('|').map(p => p.trim()).includes('scope:site') ? 'site' : 'room'

const defaultChildStyle = (): DesignElement['style'] => ({
  fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
  align: 'left', verticalAlign: 'top', color: '#1a1a2e', background: 'transparent',
  border: false, borderColor: '#94a3b8', borderRadius: 0, opacity: 100
})

const makeChild = (type: DesignElement['type']): DesignElement => {
  const base: DesignElement = {
    id: `rc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type, x: 10, y: 10, width: 120, height: 22, content: '', style: defaultChildStyle()
  }
  switch (type) {
    case 'repeat-field': base.fieldKey = 'roomName'; break
    case 'text':         base.content = 'Text'; break
    case 'image-static':  base.width = 90; base.height = 70; break
    case 'divider':      base.width = 150; base.height = 2; base.style.color = '#94a3b8'; break
    case 'rectangle':    base.width = 100; base.height = 60; base.style.border = true; break
  }
  return base
}

/**
 * Modal "canvas within canvas" editor for a repeat-block's per-iteration layout. Sub-elements
 * (children) are positioned relative to the block's own top-left corner and repeat once per
 * room/object when the PDF is rendered (same page-overflow pagination as before, unaffected by
 * this editor — only the per-iteration layout changes from the old fixed auto-layout).
 */
export const RepeatBlockEditorModal: React.FC<Props> = ({ block, templateFields, onClose, onSave }) => {
  const [children, setChildren] = useState<DesignElement[]>(() => (block.children ?? []).map(c => ({ ...c, style: { ...c.style } })))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; ow: number; oh: number; mx: number; my: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const blockW = block.width
  const blockH = block.height
  const scale = Math.min(1, 640 / blockW, 420 / blockH)
  const selected = children.find(c => c.id === selectedId) || null

  const updateChild = useCallback((id: string, patch: Partial<DesignElement>) => {
    setChildren(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])
  const updateChildStyle = useCallback((id: string, sp: Partial<DesignElement['style']>) => {
    setChildren(cs => cs.map(c => c.id === id ? { ...c, style: { ...c.style, ...sp } } : c))
  }, [])

  const addChild = (type: DesignElement['type']) => {
    const c = makeChild(type)
    setChildren(cs => [...cs, c])
    setSelectedId(c.id)
  }

  const deleteChild = useCallback(() => {
    setSelectedId(sel => {
      if (sel) setChildren(cs => cs.filter(c => c.id !== sel))
      return null
    })
  }, [])

  const onMouseDownChild = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const c = children.find(x => x.id === id)
    if (!c) return
    setSelectedId(id)
    setDragging({ id, ox: c.x, oy: c.y, mx: e.clientX, my: e.clientY })
  }

  const onResizeDownChild = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); e.preventDefault()
    const c = children.find(x => x.id === id)
    if (!c) return
    setResizing({ id, ow: c.width, oh: c.height, mx: e.clientX, my: e.clientY })
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const dx = (e.clientX - dragging.mx) / scale
      const dy = (e.clientY - dragging.my) / scale
      setChildren(cs => cs.map(c => c.id === dragging.id
        ? { ...c, x: Math.max(0, Math.min(blockW - c.width, dragging.ox + dx)), y: Math.max(0, Math.min(blockH - c.height, dragging.oy + dy)) }
        : c))
    }
    if (resizing) {
      const dx = (e.clientX - resizing.mx) / scale
      const dy = (e.clientY - resizing.my) / scale
      setChildren(cs => cs.map(c => c.id === resizing.id
        ? { ...c, width: Math.max(10, resizing.ow + dx), height: Math.max(8, resizing.oh + dy) }
        : c))
    }
  }, [dragging, resizing, scale, blockW, blockH])

  const onMouseUp = useCallback(() => { setDragging(null); setResizing(null) }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [onMouseMove, onMouseUp])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !(e.target as HTMLElement).matches('input,textarea,select')) {
        deleteChild()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, deleteChild])

  const roomFieldOptions: FieldOption[] = [
    { key: 'roomName', label: 'Raumname' },
    { key: 'category', label: 'Kategorie' },
    ...templateFields.filter(f => fieldScope(f.type) !== 'site').map(f => ({ key: f.name, label: f.name }))
  ]
  const siteFieldOptions: FieldOption[] = [
    { key: 'siteName', label: 'Standortname' },
    ...templateFields.filter(f => fieldScope(f.type) === 'site').map(f => ({ key: f.name, label: f.name }))
  ]
  const allFieldOptions = [...roomFieldOptions, ...siteFieldOptions]

  const renderChild = (c: DesignElement) => {
    const isSel = selectedId === c.id
    const s = c.style
    const boxStyle: React.CSSProperties = {
      position: 'absolute', left: c.x * scale, top: c.y * scale, width: c.width * scale, height: c.height * scale,
      cursor: dragging?.id === c.id ? 'grabbing' : 'move',
      outline: isSel ? '2px solid #3b82f6' : '1px dashed rgba(148,163,184,0.6)',
      boxSizing: 'border-box',
      opacity: s.opacity / 100,
      background: s.background !== 'transparent' ? s.background : undefined,
      border: s.border ? `1px solid ${s.borderColor}` : undefined,
      borderRadius: s.borderRadius,
      overflow: 'hidden'
    }

    let inner: React.ReactNode
    if (c.type === 'divider') {
      inner = <div style={{ width: '100%', height: '100%', background: s.color || '#94a3b8' }} />
    } else if (c.type === 'rectangle') {
      inner = <div style={{ width: '100%', height: '100%', background: s.background === 'transparent' ? undefined : s.background, border: `1px solid ${s.borderColor || '#94a3b8'}`, borderRadius: s.borderRadius }} />
    } else if (c.type === 'image-static') {
      inner = c.imageData
        ? <img src={c.imageData} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <div style={{ width: '100%', height: '100%', border: '2px dashed #94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>📷 Bild</div>
    } else if (c.type === 'repeat-field') {
      const label = allFieldOptions.find(f => f.key === c.fieldKey)?.label || c.fieldKey || '?'
      inner = (
        <div style={{ fontSize: Math.max(7, s.fontSize * scale), fontWeight: s.fontWeight, color: s.color, textAlign: s.align, padding: 2, width: '100%', height: '100%', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {c.content}
          <span style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 3, padding: '0 3px', fontStyle: 'italic', color: '#7c3aed' }}>⟨{label}⟩</span>
          {c.hideIfEmpty && <span title="Wird ausgeblendet wenn leer" style={{ marginLeft: 4 }}>👁️</span>}
        </div>
      )
    } else {
      inner = (
        <div style={{ fontSize: Math.max(7, s.fontSize * scale), fontWeight: s.fontWeight, fontStyle: s.fontStyle, textDecoration: s.textDecoration, color: s.color, textAlign: s.align, padding: 2, width: '100%', height: '100%', overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
          {c.content || ' '}
        </div>
      )
    }

    return (
      <div key={c.id} style={boxStyle} onMouseDown={e => onMouseDownChild(e, c.id)}>
        {inner}
        {isSel && (
          <div
            onMouseDown={e => onResizeDownChild(e, c.id)}
            style={{ position: 'absolute', right: -5, bottom: -5, width: 10, height: 10, background: '#3b82f6', borderRadius: 2, cursor: 'nwse-resize' }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="repeat-block-modal-overlay" onClick={onClose}>
      <div className="repeat-block-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h4 style={{ margin: 0 }}>🔄 Wiederholenden Block gestalten</h4>
          <button type="button" className="icon-button" onClick={onClose} title="Schließen">✕</button>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--muted)' }}>
          Dieser Bereich wird 1× pro Raum/Objekt des Audits wiederholt. Elemente hier verschieben, in der Größe anpassen und mit Datenfeldern verknüpfen.
        </p>

        <div className="pdf-canvas-toolbar" style={{ marginBottom: 10 }}>
          <button type="button" className="pdf-tool-btn" onClick={() => addChild('repeat-field')}>＋ Feld</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addChild('text')}>＋ Text</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addChild('image-static')}>＋ Bild</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addChild('divider')}>＋ Linie</button>
          <button type="button" className="pdf-tool-btn" onClick={() => addChild('rectangle')}>＋ Box</button>
          {selected && <button type="button" className="pdf-tool-btn danger" onClick={deleteChild} style={{ marginLeft: 'auto' }}>🗑 Entfernen</button>}
        </div>

        <div className="repeat-block-modal-body">
          <div
            className="repeat-block-modal-canvas"
            onClick={() => setSelectedId(null)}
            style={{ width: blockW * scale, height: blockH * scale }}
          >
            {children.map(renderChild)}
          </div>

          <div className="pdf-properties">
            {selected ? (
              <>
                <div className="pdf-prop-group">
                  <div className="pdf-prop-row2">
                    <label>X <input type="number" value={Math.round(selected.x)} onChange={e => updateChild(selected.id, { x: +e.target.value })} /></label>
                    <label>Y <input type="number" value={Math.round(selected.y)} onChange={e => updateChild(selected.id, { y: +e.target.value })} /></label>
                    <label>B <input type="number" value={Math.round(selected.width)} onChange={e => updateChild(selected.id, { width: Math.max(10, +e.target.value) })} /></label>
                    <label>H <input type="number" value={Math.round(selected.height)} onChange={e => updateChild(selected.id, { height: Math.max(8, +e.target.value) })} /></label>
                  </div>
                </div>

                {selected.type === 'repeat-field' && (
                  <div className="pdf-prop-group">
                    <label>Feld
                      <select value={selected.fieldKey ?? ''} onChange={e => updateChild(selected.id, { fieldKey: e.target.value })}>
                        <optgroup label="Raum/Objekt-Datenfelder">
                          {roomFieldOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </optgroup>
                        <optgroup label="Grunddaten-Datenfelder">
                          {siteFieldOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </optgroup>
                      </select>
                    </label>
                    <label>Label-Präfix (z.B. "Wand besteht aus: ")<input value={selected.content} onChange={e => updateChild(selected.id, { content: e.target.value })} /></label>
                    <label className="pdf-checkbox-row">
                      <input type="checkbox" checked={!!selected.hideIfEmpty} onChange={e => updateChild(selected.id, { hideIfEmpty: e.target.checked })} />
                      Ausblenden wenn leer (optionale Felder)
                    </label>
                  </div>
                )}

                {selected.type === 'text' && (
                  <div className="pdf-prop-group">
                    <label>Inhalt<textarea rows={2} value={selected.content} onChange={e => updateChild(selected.id, { content: e.target.value })} /></label>
                  </div>
                )}

                {selected.type === 'image-static' && (
                  <div className="pdf-prop-group">
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => updateChild(selected.id, { imageData: ev.target?.result as string })
                      reader.readAsDataURL(file)
                    }} />
                    <button type="button" className="secondary-button" style={{ width: '100%' }} onClick={() => fileInputRef.current?.click()}>📁 Bild wählen...</button>
                    {selected.imageData && <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--muted)' }}>✓ Bild geladen</div>}
                  </div>
                )}

                {(selected.type === 'text' || selected.type === 'repeat-field') && (
                  <div className="pdf-prop-group">
                    <label>Schriftgröße <input type="number" min={5} max={48} value={selected.style.fontSize} onChange={e => updateChildStyle(selected.id, { fontSize: +e.target.value })} /></label>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      <button type="button" className={`pdf-format-btn${selected.style.fontWeight === 'bold' ? ' active' : ''}`} onClick={() => updateChildStyle(selected.id, { fontWeight: selected.style.fontWeight === 'bold' ? 'normal' : 'bold' })}>B</button>
                      <button type="button" className={`pdf-format-btn${selected.style.align === 'left' ? ' active' : ''}`} onClick={() => updateChildStyle(selected.id, { align: 'left' })} title="Links">⇤</button>
                      <button type="button" className={`pdf-format-btn${selected.style.align === 'center' ? ' active' : ''}`} onClick={() => updateChildStyle(selected.id, { align: 'center' })} title="Mitte">↔</button>
                      <button type="button" className={`pdf-format-btn${selected.style.align === 'right' ? ' active' : ''}`} onClick={() => updateChildStyle(selected.id, { align: 'right' })} title="Rechts">⇥</button>
                    </div>
                    <label style={{ marginTop: 8 }}>Schriftfarbe <input type="color" value={selected.style.color} onChange={e => updateChildStyle(selected.id, { color: e.target.value })} /></label>
                  </div>
                )}

                {selected.type === 'divider' && (
                  <div className="pdf-prop-group">
                    <label>Farbe <input type="color" value={selected.style.color || '#94a3b8'} onChange={e => updateChildStyle(selected.id, { color: e.target.value })} /></label>
                  </div>
                )}

                {selected.type === 'rectangle' && (
                  <div className="pdf-prop-group">
                    <label>Rahmenfarbe <input type="color" value={selected.style.borderColor} onChange={e => updateChildStyle(selected.id, { borderColor: e.target.value })} /></label>
                    <label>Hintergrund <input type="color" value={selected.style.background === 'transparent' ? '#ffffff' : selected.style.background} onChange={e => updateChildStyle(selected.id, { background: e.target.value })} /></label>
                  </div>
                )}
              </>
            ) : (
              <div className="pdf-properties-empty">
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Element anklicken für Eigenschaften</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button>
          <button type="button" className="primary-button" onClick={() => onSave(children)}>Übernehmen</button>
        </div>
      </div>
    </div>
  )
}

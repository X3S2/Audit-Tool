import React, { useState } from 'react'

export type PageKey =
  | 'dashboard'
  | 'audits'
  | 'datenablage'
  | 'einstellungen-kategorien'
  | 'einstellungen-standorte'
  | 'einstellungen-vorlagen'
  | 'einstellungen-checklisten'
  | 'einstellungen-pdfdesigner'
  | 'admin-benutzer'
  | 'admin-backup'
  | 'admin-export'
  | 'admin-logs'
  | 'profil'

export interface NavItem {
  key: PageKey
  label: string
  icon: string
  visible: boolean
  subpages?: Array<{ key: PageKey; label: string }>
}

interface NavigationProps {
  items: NavItem[]
  currentPage: PageKey
  onPageChange: (page: PageKey) => void
}

export const Navigation: React.FC<NavigationProps> = ({ items, currentPage, onPageChange }) => {
  const [expandedNav, setExpandedNav] = useState<Set<string>>(() => {
    // Auto-expand group of the current page on mount
    const initial = new Set<string>()
    if (currentPage.startsWith('einstellungen')) initial.add('einstellungen-kategorien')
    if (currentPage.startsWith('admin')) initial.add('admin-benutzer')
    return initial
  })

  const isGroupActive = (item: NavItem): boolean => {
    if (item.subpages) {
      return item.subpages.some((sp) => sp.key === currentPage)
    }
    return currentPage === item.key
  }

  const toggleExpand = (itemKey: string) => {
    setExpandedNav((prev) => {
      const next = new Set(prev)
      if (next.has(itemKey)) {
        next.delete(itemKey)
      } else {
        next.add(itemKey)
      }
      return next
    })
  }

  const handleNavClick = (item: NavItem) => {
    if (item.subpages && item.subpages.length > 0) {
      toggleExpand(item.key)
    } else {
      onPageChange(item.key)
    }
  }

  return (
    <aside className="sidebar">
      <nav>
        {items
          .filter((item) => item.visible)
          .map((item) => {
            const isActive = isGroupActive(item)
            const isExpanded = expandedNav.has(item.key)
            return (
              <div key={item.key} className="nav-group">
                <button
                  type="button"
                  className={`nav-item${isActive ? ' active' : ''}${item.subpages ? ' has-subpages' : ''}`}
                  onClick={() => handleNavClick(item)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {item.subpages && item.subpages.length > 0 && (
                    <span className={`nav-arrow${isExpanded ? ' expanded' : ''}`}>›</span>
                  )}
                </button>

                {item.subpages && isExpanded && (
                  <div className="nav-subpages">
                    {item.subpages.map((subpage) => (
                      <button
                        key={subpage.key}
                        type="button"
                        className={`nav-subpage${currentPage === subpage.key ? ' active' : ''}`}
                        onClick={() => onPageChange(subpage.key)}
                      >
                        {subpage.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
      </nav>
    </aside>
  )
}


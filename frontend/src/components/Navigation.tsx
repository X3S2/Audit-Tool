import React, { useState } from 'react'

export type PageKey =
  | 'dashboard'
  | 'audits'
  | 'audits-raume'
  | 'audits-standorte'
  | 'audits-vorlagen'
  | 'datenablage'
  | 'einstellungen'
  | 'admin'
  | 'admin-benutzer'
  | 'admin-backup'
  | 'admin-export'
  | 'admin-logs'
  | 'profil'

export interface NavItem {
  key: PageKey
  label: string
  visible: boolean
  icon?: string
  subpages?: Array<{ key: PageKey; label: string }>
}

interface NavigationProps {
  items: NavItem[]
  currentPage: PageKey
  onPageChange: (page: PageKey) => void
}

export const Navigation: React.FC<NavigationProps> = ({ items, currentPage, onPageChange }) => {
  const [expandedNav, setExpandedNav] = useState<Set<string>>(new Set())

  const isPageActive = (navKey: PageKey): boolean => {
    return currentPage === navKey || currentPage.startsWith(navKey + '-')
  }

  const toggleExpand = (itemKey: string) => {
    const newExpanded = new Set(expandedNav)
    if (newExpanded.has(itemKey)) {
      newExpanded.delete(itemKey)
    } else {
      newExpanded.add(itemKey)
    }
    setExpandedNav(newExpanded)
  }

  const handleNavClick = (item: NavItem) => {
    if (item.subpages) {
      // Expandable item - toggle expand, don't navigate
      toggleExpand(item.key)
    } else {
      // Leaf item - navigate directly
      onPageChange(item.key)
    }
  }

  const handleSubpageClick = (subpage: { key: PageKey; label: string }) => {
    onPageChange(subpage.key)
    // Don't collapse - keep expanded so user can navigate between subpages
  }

  return (
    <aside className="sidebar">
      {items
        .filter((item) => item.visible)
        .map((item) => (
          <div key={item.key} className="nav-group">
            <button
              type="button"
              className={`nav-item ${isPageActive(item.key) ? 'active' : ''} ${item.subpages ? 'has-subpages' : ''}`}
              onClick={() => handleNavClick(item)}
              title={item.label}
            >
              {item.icon && <span className="nav-icon">{item.icon}</span>}
              <span className="nav-label">{item.label}</span>
              {item.subpages && (
                <span className={`nav-arrow ${expandedNav.has(item.key) ? 'expanded' : ''}`}>›</span>
              )}
            </button>

            {item.subpages && expandedNav.has(item.key) && (
              <div className="nav-subpages">
                {item.subpages.map((subpage) => (
                  <button
                    key={subpage.key}
                    type="button"
                    className={`nav-subpage ${currentPage === subpage.key ? 'active' : ''}`}
                    onClick={() => handleSubpageClick(subpage)}
                    title={subpage.label}
                  >
                    {subpage.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
    </aside>
  )
}

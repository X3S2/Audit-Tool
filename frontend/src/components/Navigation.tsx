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
  const [expandedNav, setExpandedNav] = useState<string | null>(null)

  const isPageActive = (navKey: PageKey): boolean => {
    return currentPage === navKey || currentPage.startsWith(navKey + '-')
  }

  const handleNavClick = (item: NavItem) => {
    if (item.subpages) {
      setExpandedNav(expandedNav === item.key ? null : item.key)
    } else {
      onPageChange(item.key)
      setExpandedNav(null)
    }
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
                <span className={`nav-arrow ${expandedNav === item.key ? 'expanded' : ''}`}>›</span>
              )}
            </button>

            {item.subpages && expandedNav === item.key && (
              <div className="nav-subpages">
                {item.subpages.map((subpage) => (
                  <button
                    key={subpage.key}
                    type="button"
                    className={`nav-subpage ${currentPage === subpage.key ? 'active' : ''}`}
                    onClick={() => {
                      onPageChange(subpage.key)
                      setExpandedNav(null)
                    }}
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

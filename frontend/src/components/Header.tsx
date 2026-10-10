import React, { useState, useRef, useEffect } from 'react'

export type User = {
  id: number
  userName: string
  displayName: string
  role: string
  isActive: boolean
}

interface HeaderProps {
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  user: User
  onProfileClick: (action: 'profile' | 'password' | 'logout') => void
  pageTitle?: string
  onMenuToggle?: () => void
}

export const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle, user, onProfileClick, pageTitle, onMenuToggle }) => {
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  const getInitials = (displayName: string) =>
    displayName.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)

  const handleDropdownItem = (action: 'profile' | 'password' | 'logout') => {
    setShowDropdown(false)
    onProfileClick(action)
  }

  return (
    <header className="topbar">
      {onMenuToggle && (
        <button className="menu-toggle" type="button" onClick={onMenuToggle} title="Menü ein/ausklappen">
          ☰
        </button>
      )}

      <div className="brand-section">
        <div className="brand-text">
          <h2>Audit-Tool</h2>
        </div>
      </div>

      {pageTitle && (
        <div className="page-title">
          <span>{pageTitle}</span>
        </div>
      )}

      <div className="header-spacer" />

      <div className="header-actions">
        <button
          className="icon-button theme-toggle"
          type="button"
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <div className="profile-dropdown-wrapper" ref={dropdownRef}>
          <button
            className="profile-button"
            type="button"
            onClick={() => setShowDropdown(v => !v)}
            aria-expanded={showDropdown}
            aria-haspopup="menu"
          >
            <span className="profile-avatar">{getInitials(user.displayName)}</span>
            <span className="profile-name">{user.displayName}</span>
            <span className={`dropdown-indicator${showDropdown ? ' open' : ''}`}>▾</span>
          </button>

          {showDropdown && (
            <div className="profile-dropdown-menu" role="menu">
              <button className="dropdown-item" type="button" role="menuitem" onClick={() => handleDropdownItem('profile')}>
                <span>👤</span> Mein Profil
              </button>
              <button className="dropdown-item" type="button" role="menuitem" onClick={() => handleDropdownItem('password')}>
                <span>🔑</span> Passwort ändern
              </button>
              <div className="dropdown-divider" />
              <button className="dropdown-item logout" type="button" role="menuitem" onClick={() => handleDropdownItem('logout')}>
                <span>🚪</span> Abmelden
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

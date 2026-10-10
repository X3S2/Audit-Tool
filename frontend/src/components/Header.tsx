import React, { useState } from 'react'

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

  const getInitials = (displayName: string) => {
    return displayName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleDropdownItem = (action: 'profile' | 'password' | 'logout') => {
    setShowDropdown(false)
    onProfileClick(action)
  }

  return (
    <header className="topbar">
      {onMenuToggle && (
        <button 
          className="menu-toggle"
          type="button" 
          onClick={onMenuToggle}
          title="Menü auf/zuklappen"
          aria-label="Toggle menu"
        >
          ☰
        </button>
      )}

      <div className="brand-section">
        <div className="brand-logo">
          <span className="logo-badge">A</span>
          <div className="brand-text">
            <h2>Audit-Tool</h2>
            <small>Audit- & Datenmanagement</small>
          </div>
        </div>
      </div>

      {pageTitle && (
        <div className="page-title">
          <h1>{pageTitle}</h1>
        </div>
      )}

      <div className="header-spacer"></div>

      <div className="header-actions">
        <button
          className="icon-button theme-toggle"
          type="button"
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <div className="profile-dropdown-wrapper">
          <button
            className="profile-button"
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            aria-expanded={showDropdown}
            aria-haspopup="true"
          >
            <span className="profile-avatar" title={user.displayName}>
              {getInitials(user.displayName)}
            </span>
            <span className="profile-name">{user.displayName}</span>
            <span className="dropdown-indicator">▼</span>
          </button>

          {showDropdown && (
            <div className="profile-dropdown" role="menu">
              <button
                className="dropdown-item"
                type="button"
                role="menuitem"
                onClick={() => handleDropdownItem('profile')}
              >
                👤 Mein Profil
              </button>
              <button
                className="dropdown-item"
                type="button"
                role="menuitem"
                onClick={() => handleDropdownItem('password')}
              >
                🔑 Passwort ändern
              </button>
              <div className="dropdown-divider"></div>
              <button
                className="dropdown-item logout"
                type="button"
                role="menuitem"
                onClick={() => handleDropdownItem('logout')}
              >
                🚪 Abmelden
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

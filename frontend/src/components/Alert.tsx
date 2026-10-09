import React from 'react'

export type AlertType = 'error' | 'success' | 'info' | 'warning'

interface AlertProps {
  type: AlertType
  message: string
  onClose: () => void
}

export const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
  const icons: Record<AlertType, string> = {
    error: '❌',
    success: '✅',
    info: 'ℹ️',
    warning: '⚠️'
  }

  return (
    <div className={`alert alert-${type}`} role="alert">
      <span className="alert-icon">{icons[type]}</span>
      <span className="alert-text">{message}</span>
      <button className="alert-close" onClick={onClose} aria-label="Close alert">
        ×
      </button>
    </div>
  )
}

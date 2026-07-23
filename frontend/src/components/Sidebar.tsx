interface Props {
  page: 'dashboard' | 'quality'
  onPageChange: (p: 'dashboard' | 'quality') => void
}

export default function Sidebar({ page, onPageChange }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">⚡</div>
          <div>
            <div className="logo-text">Workforce Pulse</div>
            <div className="logo-sub">Analytics Platform</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Analytics</div>

        <div
          id="nav-dashboard"
          className={`nav-item ${page === 'dashboard' ? 'active' : ''}`}
          onClick={() => onPageChange('dashboard')}
        >
          <span className="nav-item-icon">📊</span>
          <span>Dashboard</span>
        </div>

        <div
          id="nav-quality"
          className={`nav-item ${page === 'quality' ? 'active' : ''}`}
          onClick={() => onPageChange('quality')}
        >
          <span className="nav-item-icon">🔍</span>
          <span>Data Quality</span>
        </div>

        <div className="nav-section-label" style={{ marginTop: 16 }}>Resources</div>

        <a
          className="nav-item"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
        >
          <span className="nav-item-icon">📄</span>
          <span>Methodology</span>
        </a>
      </nav>

      <div className="sidebar-footer">
        <div className="data-quality-badge">
          ✓ 15 employees · Oct 6–24
        </div>
      </div>
    </aside>
  )
}

interface Props {
  onExport: () => void
  dateRange: { start: string; end: string }
}

export default function TopBar({ onExport, dateRange }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div>
          <div className="page-title">Productivity Intelligence</div>
          <div className="page-subtitle">Where are we wasting time and money?</div>
        </div>
        <span className="date-range-badge">
          {dateRange.start} → {dateRange.end} · IST
        </span>
      </div>
      <div className="topbar-right">
        <button
          id="export-btn"
          className="export-btn"
          onClick={onExport}
        >
          ⬇ Export Summary
        </button>
      </div>
    </header>
  )
}

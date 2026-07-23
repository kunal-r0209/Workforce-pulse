import { useState, useRef } from 'react'
import { dashboardApi, ExportSummary } from '../services/api'
import { FilterState } from '../App'

interface Props {
  filters: FilterState
  onClose: () => void
}

function fmtInr(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString()}`
}

export default function ExportModal({ filters, onClose }: Props) {
  const [summary, setSummary] = useState<ExportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await dashboardApi.getExportSummary({
        department: filters.department || undefined,
        task_category: filters.task_category || undefined,
        week: filters.week ? Number(filters.week) : undefined,
      })
      setSummary(r.data)
    } finally {
      setLoading(false)
    }
  }

  // Load on first open
  if (!summary && !loading) load()

  const exportPDF = async () => {
    if (!pdfRef.current || !summary) return
    setExporting(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const { default: jsPDF } = await import('jspdf')

      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, 297))
      pdf.save(`workforce-pulse-summary-${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title">📄 Executive Summary Export</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Generated from live filter state: <strong style={{ color: 'var(--text-secondary)' }}>
            dept={filters.department || 'all'}, task={filters.task_category || 'all'}, week={filters.week || 'all'}
          </strong>
        </p>

        {loading && (
          <div className="loading-screen" style={{ minHeight: 200 }}>
            <div className="spinner" />
            <div className="loading-text">Preparing summary...</div>
          </div>
        )}

        {summary && (
          <>
            {/* PDF render area — this gets captured by html2canvas */}
            <div ref={pdfRef} className="pdf-render" id="pdf-render">
              <div className="pdf-logo">⚡ Workforce Pulse</div>
              <div className="pdf-date">
                Executive Summary · Generated {new Date(summary.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                · Data: {summary.date_range.start} to {summary.date_range.end}
              </div>

              {(summary.active_filters.department !== 'all' || summary.active_filters.task_category !== 'all') && (
                <div className="pdf-filters">
                  Active filters: {Object.entries(summary.active_filters)
                    .filter(([, v]) => v !== 'all')
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}
                </div>
              )}

              <hr className="pdf-divider" />

              <div className="pdf-section-title">Headline Numbers</div>
              <div className="pdf-headline">
                <div className="pdf-kpi">
                  <div className="pdf-kpi-val">{summary.headline.recoverable_hours_month.toFixed(0)} hrs</div>
                  <div className="pdf-kpi-label">Recoverable Hours / Month</div>
                </div>
                <div className="pdf-kpi">
                  <div className="pdf-kpi-val">{fmtInr(summary.headline.recoverable_inr_month)}</div>
                  <div className="pdf-kpi-label">Recoverable Cost / Month</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1, background: '#f8f9ff', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>{summary.headline.total_employees}</div>
                  <div style={{ fontSize: 10, color: '#888' }}>Employees Analyzed</div>
                </div>
                <div style={{ flex: 1, background: '#f8f9ff', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>{summary.headline.total_rows}</div>
                  <div style={{ fontSize: 10, color: '#888' }}>Activity Records</div>
                </div>
              </div>

              <hr className="pdf-divider" />

              <div className="pdf-section-title">Top 5 Automation Opportunities</div>
              {summary.top_automation_opportunities.map((opp, i) => (
                <div key={i} className="pdf-opp-row">
                  <div className="pdf-opp-rank">{i + 1}</div>
                  <div className="pdf-opp-name">{opp.task_category}</div>
                  <div style={{ fontSize: 11, color: '#888', marginRight: 8 }}>
                    {Math.round(opp.total_minutes)} min · {(opp.repetitive_rate * 100).toFixed(0)}% rep · {opp.unique_employees} employees
                  </div>
                  <div className="pdf-opp-score">Score: {opp.automation_score.toFixed(2)}</div>
                </div>
              ))}

              <hr className="pdf-divider" />

              <div className="pdf-method">
                Methodology: {summary.methodology}
              </div>
              <div className="pdf-method" style={{ marginTop: 6 }}>
                Automation Score = volume(0.30) + repetitive_rate(0.35) + employee_spread(0.20) + rupee_impact(0.15)
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '10px 20px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'Inter',
                }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                id="download-pdf-btn"
                style={{
                  padding: '10px 24px',
                  background: 'var(--gradient-gold)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  cursor: exporting ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'Inter',
                  opacity: exporting ? 0.7 : 1,
                }}
                onClick={exportPDF}
                disabled={exporting}
              >
                {exporting ? '⏳ Generating PDF...' : '⬇ Download PDF'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
